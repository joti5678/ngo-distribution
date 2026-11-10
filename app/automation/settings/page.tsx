"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../../components/Icons'; 
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// 👇 এখানে আপনার Google Cloud সার্ভারের External IP টি দিন 👇
const BOT_SERVER_URL = 'http://136.87.183.229:4000'; 

export default function AutomationSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isManualFetching, setIsManualFetching] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Config State
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [fetchTime, setFetchTime] = useState('00:15');
  const [timezone, setTimezone] = useState('Asia/Dhaka');
  const [isPrevDay, setIsPrevDay] = useState(true);

  // Credentials State
  const [targetUrl, setTargetUrl] = useState('');
  const [targetUser, setTargetUser] = useState('');
  const [targetPass, setTargetPass] = useState('');
  const [dbMgmtPass, setDbMgmtPass] = useState('123456');

  // Security State for Credentials
  const [isCredentialsUnlocked, setIsCredentialsUnlocked] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [inputPass, setInputPass] = useState('');

  // Delete Action State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteDate, setDeleteDate] = useState('');
  const [deleteWhCode, setDeleteWhCode] = useState('ALL');
  const [isDeleting, setIsDeleting] = useState(false);

  // Test & Manual Fetch State
  const [testWhCode, setTestWhCode] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [testData, setTestData] = useState<any[] | null>(null);

  // Terminal Logs State
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Mappings State
  const [mappings, setMappings] = useState<any[]>([]);
  const [systemWarehouses, setSystemWarehouses] = useState<any[]>([]);

  const timezones = ["Asia/Dhaka", "UTC", "America/New_York", "Europe/London"];

  useEffect(() => {
    const today = new Date();
    const dateStr = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    setManualDate(dateStr); 
    setDeleteDate(dateStr);
    loadData();
    fetchServerLogs();
  }, []);

  // Polling for live logs
  useEffect(() => {
      let interval: NodeJS.Timeout;
      if (autoRefreshLogs) {
          interval = setInterval(() => fetchServerLogs(), 3000);
      }
      return () => clearInterval(interval);
  }, [autoRefreshLogs]);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 6000);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: settings } = await supabase.from('automation_settings').select('*').limit(1).single();
      if (settings) {
        setSettingsId(settings.id);
        setIsActive(settings.is_active || false);
        setFetchTime(settings.fetch_time ? settings.fetch_time.substring(0, 5) : '00:15');
        setTimezone(settings.timezone || 'Asia/Dhaka');
        setIsPrevDay(settings.is_previous_day_stock ?? true);
        setTargetUrl(settings.donor_url || '');
        setTargetUser(settings.donor_username || '');
        setTargetPass(settings.donor_password || '');
        if(settings.management_password) setDbMgmtPass(settings.management_password);
      }

      const { data: sysWh } = await supabase.from('warehouses').select('id, name, code').order('name');
      if (sysWh) setSystemWarehouses(sysWh);

      const { data: maps } = await supabase.from('warehouse_mappings').select('*').order('donor_wh_code');
      if (maps) setMappings(maps);

    } catch (error) {
      console.error("Error loading data", error);
    }
    setIsLoading(false);
  };

  const fetchServerLogs = async () => {
      try {
          const res = await fetch(`${BOT_SERVER_URL}/api/logs`);
          const result = await res.json();
          if (result.success && result.logs) {
              setServerLogs(result.logs);
              if (logsEndRef.current && autoRefreshLogs) {
                  logsEndRef.current.scrollIntoView({ behavior: "smooth" });
              }
          }
      } catch (err) {
          // If server is unreachable
      }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        is_active: isActive,
        fetch_time: `${fetchTime}:00`,
        timezone: timezone,
        is_previous_day_stock: isPrevDay,
        donor_url: targetUrl,
        donor_username: targetUser,
        donor_password: targetPass,
        management_password: dbMgmtPass,
        updated_at: new Date().toISOString()
      };

      if (settingsId) {
        await supabase.from('automation_settings').update(payload).eq('id', settingsId);
      } else {
        const { data } = await supabase.from('automation_settings').insert([payload]).select().single();
        if (data) setSettingsId(data.id);
      }
      showMessage("Automation settings updated successfully!", "success");
    } catch (error: any) {
      showMessage(`Failed to save settings: ${error.message}`, "error");
    }
    setIsSaving(false);
  };

  const handleUnlockCredentials = () => {
      if (inputPass === dbMgmtPass) {
          setIsCredentialsUnlocked(true);
          setShowPassModal(false);
          setInputPass('');
      } else {
          alert("Incorrect Password!");
      }
  };

  const executeDeleteAction = async () => {
      if (inputPass !== dbMgmtPass) {
          alert("Incorrect Master Password!");
          return;
      }
      setShowDeleteModal(false);
      setInputPass('');
      setIsDeleting(true);

      try {
          let query = supabase.from('donor_warehouse_stock').delete().eq('stock_date', deleteDate);
          
          if (deleteWhCode !== 'ALL') {
              query = query.eq('warehouse_code', deleteWhCode);
          }

          const { error } = await query;
          if (error) throw error;
          
          showMessage(`Successfully deleted data for ${deleteDate} ${deleteWhCode !== 'ALL' ? `(WH: ${deleteWhCode})` : '(All Warehouses)'}.`, "success");
      } catch (error: any) {
          showMessage(`Delete Failed: ${error.message}`, "error");
      }
      setIsDeleting(false);
  };

  const handleLiveTest = async () => {
    if (!testWhCode) return showMessage("Please select a Donor Warehouse to test.", "error");
    setIsTesting(true);
    setTestData(null);
    setAutoRefreshLogs(true); 
    showMessage(`Initializing Test for WH [${testWhCode}] via ${BOT_SERVER_URL}...`, "success");

    try {
      const response = await fetch(`${BOT_SERVER_URL}/api/test-scrape?wh_code=${testWhCode}`);
      const result = await response.json();
      if (result.success) {
         setTestData(result.data);
         showMessage(`Success! Fetched ${result.data.length} items from WH [${testWhCode}]`, "success");
         setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 500);
      } else throw new Error(result.error);
    } catch (error: any) {
      showMessage(`Test Failed: Connection refused. Server may be down.`, "error");
    } finally {
      setIsTesting(false);
    }
  };

  const handleManualSave = async () => {
    if (!manualDate) return showMessage("Please select a date.", "error");
    setIsManualFetching(true);
    setAutoRefreshLogs(true); 
    showMessage(`Fetching and saving data for ALL mapped warehouses... Please wait.`, "success");

    try {
      const response = await fetch(`${BOT_SERVER_URL}/api/manual-scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: manualDate })
      });
      const result = await response.json();
      if (result.success) {
         showMessage(`✅ Success! Fetched and SAVED ${result.count} items for date: ${manualDate}`, "success");
      } else throw new Error(result.error);
    } catch (error: any) {
      showMessage(`Fetch & Save Failed: Could not connect to Bot Server.`, "error");
    } finally {
      setIsManualFetching(false);
    }
  };

  const addMapping = () => {
      setMappings([...mappings, { id: `temp-${Date.now()}`, donor_wh_code: '', donor_wh_name: '', system_wh_id: '' }]);
  };
  const updateMapping = (id: string, field: string, value: string) => {
      setMappings(mappings.map(m => m.id === id ? { ...m, [field]: value } : m));
  };
  const removeMapping = async (id: string) => {
      if (!id.startsWith('temp-')) await supabase.from('warehouse_mappings').delete().eq('id', id);
      setMappings(mappings.filter(m => m.id !== id));
  };
  const saveMappings = async () => {
      try {
          const validMappings = mappings.filter(m => m.donor_wh_code && m.system_wh_id);
          for (const map of validMappings) {
              const payload = { donor_wh_code: map.donor_wh_code, donor_wh_name: map.donor_wh_name, system_wh_id: map.system_wh_id };
              if (map.id && !map.id.toString().startsWith('temp-')) await supabase.from('warehouse_mappings').update(payload).eq('id', map.id);
              else await supabase.from('warehouse_mappings').insert([payload]);
          }
          showMessage("Mappings saved successfully!", "success");
          loadData(); 
      } catch (error: any) {
          showMessage(`Failed to save mappings: ${error.message}`, "error");
      }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 w-full animate-in fade-in duration-500 relative">

      {/* CREDENTIALS UNLOCK MODAL */}
      {showPassModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm animate-in zoom-in-95">
                  <h3 className="font-bold text-lg text-slate-900 mb-2">Management Access</h3>
                  <p className="text-xs text-slate-500 mb-4">Enter management password to view or edit credentials.</p>
                  <input 
                      type="password" 
                      value={inputPass} 
                      onChange={(e) => setInputPass(e.target.value)} 
                      placeholder="••••••••"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-black font-bold outline-none focus:border-indigo-500 mb-4"
                      onKeyDown={(e) => { if(e.key === 'Enter') handleUnlockCredentials(); }}
                  />
                  <div className="flex space-x-3">
                      <button onClick={() => { setShowPassModal(false); setInputPass(''); }} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-200">Cancel</button>
                      <button onClick={handleUnlockCredentials} className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700">Unlock</button>
                  </div>
              </div>
          </div>
      )}

      {/* DELETE DATA MODAL */}
      {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
              <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95">
                  <div className="flex items-center gap-3 mb-2 text-rose-600">
                      <span className="text-2xl">⚠️</span>
                      <h3 className="font-bold text-lg text-slate-900">Confirm Deletion</h3>
                  </div>
                  <p className="text-xs text-slate-500 mb-4 bg-rose-50 p-3 rounded-lg border border-rose-100">
                      You are about to delete stock data for <b className="text-rose-700">{deleteDate}</b> 
                      from <b className="text-rose-700">{deleteWhCode === 'ALL' ? 'ALL Warehouses' : `WH [${deleteWhCode}]`}</b>. 
                      This action cannot be undone.
                  </p>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Master Password</label>
                  <input 
                      type="password" 
                      value={inputPass} 
                      onChange={(e) => setInputPass(e.target.value)} 
                      placeholder="Enter Management Password"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-black font-bold outline-none focus:border-rose-500 mb-4"
                  />
                  <div className="flex space-x-3">
                      <button onClick={() => { setShowDeleteModal(false); setInputPass(''); }} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-200">Cancel</button>
                      <button onClick={executeDeleteAction} disabled={!inputPass} className="flex-1 py-2.5 bg-rose-600 text-white font-bold rounded-xl text-sm hover:bg-rose-700 disabled:opacity-50">Permanently Delete</button>
                  </div>
              </div>
          </div>
      )}

      <header className="flex flex-col md:flex-row h-auto md:h-20 bg-white border-b border-slate-200 items-start md:items-center px-4 md:px-6 py-4 md:py-0 shrink-0 shadow-sm z-10 justify-between">
        <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">Settings & Fetch</h2>
            <p className="text-sm text-slate-500 hidden md:block">Configure sync, manage mappings, or manually fetch live data</p>
            </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
        {msg.text && (
          <div className={`p-4 rounded-xl shadow-md border text-sm font-bold animate-in slide-in-from-top-2 flex justify-between items-center mb-6 w-full max-w-7xl mx-auto ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="flex items-center"><span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}</span>
            <button onClick={() => setMsg({text:'', type:''})} className="p-1 rounded-md hover:bg-black/5"><Icons.Close /></button>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center h-64"><Icons.Spinner /></div>
        ) : (
          <div className="space-y-6 max-w-7xl mx-auto">

            {/* --- MAPPINGS SECTION (DYNAMIC) --- */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-8">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-sm text-slate-900 flex items-center">
                            <span className="text-lg mr-2">🔗</span> Dynamic Warehouse Mapping
                        </h3>
                        <p className="text-[10px] text-slate-500 mt-1">Link any new or existing Donor WH Code to your internal system warehouses.</p>
                    </div>
                    <button onClick={addMapping} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors flex items-center shadow-sm">
                        <span className="mr-1 text-lg leading-none">+</span> Add Mapping
                    </button>
                </div>

                <div className="p-5">
                    <div className="w-full overflow-x-auto">
                        <table className="w-full text-left min-w-[700px]">
                            <thead>
                                <tr className="border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500">
                                    <th className="pb-3 w-1/4 pr-4">Donor WH Code</th>
                                    <th className="pb-3 w-1/3 pr-4">Donor WH Name (Optional)</th>
                                    <th className="pb-3 w-1/3 pr-4">Map to System WH</th>
                                    <th className="pb-3 w-16 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {mappings.length === 0 ? (
                                    <tr><td colSpan={4} className="py-8 text-center text-xs text-slate-400 font-medium">No mappings configured. Click "+ Add Mapping" to start.</td></tr>
                                ) : (
                                    mappings.map((map, idx) => (
                                        <tr key={map.id}>
                                            <td className="py-3 pr-4">
                                                <input 
                                                    type="text" value={map.donor_wh_code} onChange={(e) => updateMapping(map.id, 'donor_wh_code', e.target.value)} 
                                                    placeholder="Code (e.g., 150)" className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-black outline-none focus:border-indigo-500"
                                                />
                                            </td>
                                            <td className="py-3 pr-4">
                                                <input 
                                                    type="text" value={map.donor_wh_name || ''} onChange={(e) => updateMapping(map.id, 'donor_wh_name', e.target.value)} 
                                                    placeholder="Name (e.g., New Camp)" className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-black outline-none focus:border-indigo-500"
                                                />
                                            </td>
                                            <td className="py-3 pr-4">
                                                <select 
                                                    value={map.system_wh_id || ''} onChange={(e) => updateMapping(map.id, 'system_wh_id', e.target.value)}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-black outline-none focus:border-indigo-500 cursor-pointer"
                                                >
                                                    <option value="" disabled>-- Select Internal WH --</option>
                                                    {systemWarehouses.map(sw => (
                                                        <option key={sw.id} value={sw.id}>[{sw.code}] {sw.name}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="py-3 text-center">
                                                <button onClick={() => removeMapping(map.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {mappings.length > 0 && (
                      <div className="mt-4 flex justify-end pt-4 border-t border-slate-100">
                          <button onClick={saveMappings} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center">
                              Save Mappings
                          </button>
                      </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                {/* COLUMN 1: Configuration */}
                <div className="space-y-6 lg:col-span-1">
                    <form onSubmit={handleSaveSettings} className="space-y-6">
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                <h3 className="font-bold text-sm text-slate-900 flex items-center">
                                    <span className="text-lg mr-2">⏱️</span> Schedule Config
                                </h3>
                                <label className="flex items-center cursor-pointer">
                                    <div className="relative">
                                        <input type="checkbox" className="sr-only" checked={isActive} onChange={() => setIsActive(!isActive)} />
                                        <div className={`block w-10 h-6 rounded-full transition-colors ${isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                        <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isActive ? 'transform translate-x-4' : ''}`}></div>
                                    </div>
                                </label>
                            </div>
                            <div className="p-5 grid grid-cols-1 gap-4">
                                <div className="flex space-x-2">
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Time</label>
                                        <input type="time" value={fetchTime} onChange={(e) => setFetchTime(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-black outline-none" />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Zone</label>
                                        <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-black outline-none">
                                            {timezones.map(tz => ( <option key={tz} value={tz}>{tz}</option> ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-2 cursor-pointer" onClick={() => setIsPrevDay(!isPrevDay)}>
                                    <input type="checkbox" checked={isPrevDay} onChange={() => {}} className="w-4 h-4 mt-0.5 text-amber-600 rounded" />
                                    <div>
                                        <p className="text-xs font-bold text-amber-900">Save as Prev Day</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                <h3 className="font-bold text-sm text-slate-900 flex items-center">
                                    <span className="text-lg mr-2">🔐</span> Credentials
                                </h3>
                                {!isCredentialsUnlocked && (
                                    <button type="button" onClick={() => setShowPassModal(true)} className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-3 py-1 rounded-md hover:bg-indigo-100">
                                        UNLOCK TO EDIT
                                    </button>
                                )}
                            </div>
                            <div className="p-5 space-y-4 relative">
                                {!isCredentialsUnlocked && (
                                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                                        <div className="bg-white px-4 py-2 rounded-full shadow-sm border border-slate-200 flex items-center text-xs font-bold text-slate-500">
                                            <span className="mr-2">🔒</span> Locked for Security
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Target URL</label>
                                    <input type="url" value={isCredentialsUnlocked ? targetUrl : '*****************'} onChange={(e) => setTargetUrl(e.target.value)} disabled={!isCredentialsUnlocked} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-black outline-none" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">User</label>
                                        <input type="text" value={isCredentialsUnlocked ? targetUser : '********'} onChange={(e) => setTargetUser(e.target.value)} disabled={!isCredentialsUnlocked} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-black outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Pass</label>
                                        <input type="password" value={isCredentialsUnlocked ? targetPass : '12345678'} onChange={(e) => setTargetPass(e.target.value)} disabled={!isCredentialsUnlocked} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-black outline-none" />
                                    </div>
                                </div>
                                {isCredentialsUnlocked && (
                                    <div className="pt-2 border-t border-slate-100 mt-2">
                                        <label className="block text-[10px] font-bold text-rose-500 uppercase mb-1.5">Update Management Password</label>
                                        <input type="text" value={dbMgmtPass} onChange={(e) => setDbMgmtPass(e.target.value)} className="w-full px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold text-rose-900 outline-none focus:border-rose-400" />
                                    </div>
                                )}
                            </div>
                        </div>

                        <button type="submit" disabled={isSaving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-md flex justify-center text-sm disabled:opacity-50">
                            {isSaving ? <><Icons.Spinner /> Saving...</> : 'Save Config'}
                        </button>
                    </form>
                </div>

                {/* COLUMN 2: Specific Live Test */}
                <div className="space-y-6 lg:col-span-1">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 h-full flex flex-col justify-center relative">
                        <h3 className="font-bold text-lg mb-2 flex items-center text-slate-800"><span className="mr-2">🧪</span> Specific WH Test</h3>
                        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                            Quickly test scraping for a single warehouse. Output shown below. <span className="font-bold text-rose-600">NOT saved to DB</span>.
                        </p>

                        <div className="space-y-4 w-full">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Select from Mappings</label>
                                <select 
                                    value={testWhCode} 
                                    onChange={(e) => setTestWhCode(e.target.value)} 
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 text-sm text-black font-bold outline-none focus:border-indigo-500 rounded-xl cursor-pointer" 
                                >
                                    <option value="" disabled>-- Select Donor WH Code --</option>
                                    {mappings.map(m => (
                                        <option key={m.id} value={m.donor_wh_code}>[{m.donor_wh_code}] {m.donor_wh_name}</option>
                                    ))}
                                </select>
                            </div>
                            <button onClick={handleLiveTest} disabled={isTesting || !targetUrl || mappings.length === 0} className="w-full bg-slate-900 hover:bg-black text-white font-black py-3 rounded-xl shadow-sm flex justify-center disabled:opacity-50 uppercase tracking-widest text-xs mt-4">
                                {isTesting ? <><Icons.Spinner /> Testing...</> : 'Run Live Test'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* COLUMN 3: FETCH AND SAVE ALL (MANUAL RUN) */}
                <div className="space-y-6 lg:col-span-1">
                    <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-2xl border border-slate-700 shadow-xl overflow-hidden p-6 h-full flex flex-col justify-center text-white relative">
                        <h3 className="font-bold text-lg mb-2 flex items-center"><span className="mr-2">⚡</span> Fetch & Save All</h3>
                        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                            Loop through <b>ALL mapped warehouses</b>, fetch their stock, and <span className="font-bold text-emerald-400">permanently save</span> it to the database.
                        </p>

                        <div className="space-y-4 w-full">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Stock Record Date</label>
                                <input 
                                    type="date" 
                                    value={manualDate} 
                                    onChange={(e) => setManualDate(e.target.value)} 
                                    className="w-full px-4 py-3 bg-slate-800 border border-slate-600 text-sm text-white font-bold outline-none focus:bg-slate-700 rounded-xl color-scheme-dark" 
                                />
                                <p className="text-[9px] text-slate-500 mt-2">Old data for this date will be overwritten.</p>
                            </div>

                            <button onClick={handleManualSave} disabled={isManualFetching || mappings.length === 0 || !targetUrl} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3 rounded-xl shadow-md flex justify-center disabled:opacity-50 uppercase tracking-widest text-xs mt-4">
                                {isManualFetching ? <><Icons.Spinner /> Processing...</> : 'Fetch & Save Now'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* COLUMN 4: DATABASE MANAGEMENT (DELETE DATA) */}
                <div className="space-y-6 lg:col-span-1">
                    <div className="bg-rose-50 rounded-2xl border border-rose-200 shadow-sm overflow-hidden p-6 h-full flex flex-col justify-center relative">
                        <h3 className="font-bold text-lg mb-2 flex items-center text-rose-900"><span className="mr-2">🗑️</span> Delete Data</h3>
                        <p className="text-xs text-rose-600 mb-6 leading-relaxed">
                            Permanently remove fetched data for a specific date or warehouse to fix errors.
                        </p>

                        <div className="space-y-4 w-full">
                            <div>
                                <label className="block text-[10px] font-bold text-rose-700 uppercase mb-1.5">Target Date to Delete</label>
                                <input 
                                    type="date" 
                                    value={deleteDate} 
                                    onChange={(e) => setDeleteDate(e.target.value)} 
                                    className="w-full px-4 py-3 bg-white border border-rose-300 text-sm text-rose-900 font-bold outline-none focus:border-rose-500 rounded-xl" 
                                />
                            </div>
                            
                            <div>
                                <label className="block text-[10px] font-bold text-rose-700 uppercase mb-1.5">Select Warehouse</label>
                                <select 
                                    value={deleteWhCode} 
                                    onChange={(e) => setDeleteWhCode(e.target.value)} 
                                    className="w-full px-4 py-3 bg-white border border-rose-300 text-sm text-rose-900 font-bold outline-none focus:border-rose-500 rounded-xl cursor-pointer" 
                                >
                                    <option value="ALL">ALL Warehouses</option>
                                    {mappings.map(m => (
                                        <option key={m.id} value={m.donor_wh_code}>[{m.donor_wh_code}] {m.donor_wh_name}</option>
                                    ))}
                                </select>
                            </div>

                            <button onClick={() => setShowDeleteModal(true)} disabled={isDeleting || !deleteDate} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black py-3 rounded-xl shadow-sm flex justify-center disabled:opacity-50 uppercase tracking-widest text-xs mt-4">
                                {isDeleting ? <><Icons.Spinner /> Deleting...</> : 'Delete Records'}
                            </button>
                        </div>
                    </div>
                </div>

            </div>

            {/* --- NEW: TERMINAL LOGS SECTION --- */}
            <div className="bg-[#0f111a] rounded-2xl border border-slate-700 shadow-xl overflow-hidden mt-8">
                <div className="p-3 border-b border-slate-800 bg-[#161a25] flex justify-between items-center">
                    <h4 className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center">
                        <span className="mr-2 text-base">💻</span> Server Terminal Logs
                    </h4>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center cursor-pointer">
                            <span className="text-[10px] text-slate-400 font-bold mr-2 uppercase">Auto Refresh (3s)</span>
                            <div className="relative">
                                <input type="checkbox" className="sr-only" checked={autoRefreshLogs} onChange={() => setAutoRefreshLogs(!autoRefreshLogs)} />
                                <div className={`block w-8 h-4 rounded-full transition-colors ${autoRefreshLogs ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
                                <div className={`dot absolute left-1 top-1 bg-white w-2 h-2 rounded-full transition-transform ${autoRefreshLogs ? 'transform translate-x-4' : ''}`}></div>
                            </div>
                        </label>
                        <button onClick={fetchServerLogs} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1">
                            <span>↻</span> Refresh
                        </button>
                    </div>
                </div>
                <div className="p-4 h-64 overflow-y-auto font-mono text-[11px] md:text-xs text-slate-300 leading-relaxed custom-scrollbar flex flex-col">
                    {serverLogs.length === 0 ? (
                        <span className="text-slate-500">Waiting for server logs... (Start an action or refresh)</span> 
                    ) : (
                        serverLogs.map((log, i) => {
                            let colorClass = "text-slate-300";
                            if (log.includes("Error") || log.includes("❌") || log.includes("Failed")) colorClass = "text-rose-400";
                            else if (log.includes("Success") || log.includes("✅") || log.includes("Done") || log.includes("Saved")) colorClass = "text-emerald-400";
                            else if (log.includes("⚠️")) colorClass = "text-amber-400";
                            else if (log.includes("▶️") || log.includes("Processing") || log.includes("Fetching")) colorClass = "text-cyan-400";
                            else if (log.includes("⚙️") || log.includes("Starting")) colorClass = "text-indigo-400";
                            
                            return <div key={i} className={`whitespace-pre-wrap ${colorClass}`}>{log}</div>
                        })
                    )}
                    <div ref={logsEndRef} />
                </div>
            </div>
            {/* ---------------------------------- */}

            {/* BOTTOM SECTION: Full Width Table for Test Results */}
            {testData && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-8 animate-in slide-in-from-bottom-4 fade-in duration-500">
                    <div className="p-4 border-b border-slate-100 bg-emerald-50/50 flex justify-between items-center">
                        <h4 className="text-sm font-black text-emerald-800 uppercase tracking-wider flex items-center">
                            <span className="text-lg mr-2">✅</span> Live Preview (Data extracted: {testData.length} items)
                        </h4>
                    </div>
                    <div className="w-full overflow-x-auto custom-scrollbar max-h-[600px]">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-3 text-[10px] font-black text-slate-500 uppercase border-r border-slate-200 text-center w-12">SL</th>
                                    <th className="p-3 text-[10px] font-black text-slate-600 uppercase border-r border-slate-200 text-center w-32">Donor WH Code</th>
                                    <th className="p-3 text-[10px] font-black text-slate-600 uppercase border-r border-slate-200 w-64">Product Name</th>
                                    <th className="p-3 text-[10px] font-black text-slate-600 uppercase border-r border-slate-200 text-center w-32">Product Code</th>
                                    <th className="p-3 text-[10px] font-black text-slate-600 uppercase border-r border-slate-200 text-center w-20">Unit</th>
                                    <th className="p-3 text-[10px] font-black text-indigo-700 uppercase border-r border-slate-200 text-center bg-indigo-50/50 w-32">Regular Qty</th>
                                    <th className="p-3 text-[10px] font-black text-amber-700 uppercase text-center bg-amber-50/50 w-32">Contingency Qty</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {testData.map((d, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="p-3 text-center text-xs font-bold text-slate-400 border-r border-slate-100">{i + 1}</td>
                                        <td className="p-3 border-r border-slate-100 text-center"><span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-slate-100 rounded text-slate-600">{d.donor_warehouse_code}</span></td>
                                        <td className="p-3 border-r border-slate-100"><p className="font-bold text-slate-900 text-sm line-clamp-2">{d.product_name}</p></td>
                                        <td className="p-3 border-r border-slate-100 text-center"><p className="text-xs font-mono font-bold text-slate-600">{d.product_code}</p></td>
                                        <td className="p-3 border-r border-slate-100 text-center"><p className="text-[10px] font-bold text-slate-500 uppercase">{d.unit}</p></td>
                                        <td className="p-3 border-r border-slate-100 text-center bg-indigo-50/10"><span className="text-base font-black text-indigo-700">{d.quantity}</span></td>
                                        <td className="p-3 text-center bg-amber-50/10"><span className="text-base font-black text-amber-700">{d.contingency_quantity}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}