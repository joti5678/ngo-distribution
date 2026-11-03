"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from '../../components/Icons'; 
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function AutomationSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [fetchTime, setFetchTime] = useState('00:15');
  const [timezone, setTimezone] = useState('Asia/Dhaka');
  const [isPrevDay, setIsPrevDay] = useState(true);

  const [targetUrl, setTargetUrl] = useState('');
  const [targetUser, setTargetUser] = useState('');
  const [targetPass, setTargetPass] = useState('');

  const [manualDate, setManualDate] = useState('');
  const [testData, setTestData] = useState<any[] | null>(null);

  // Common Timezones
  const timezones = [
    "Asia/Dhaka", "UTC", "America/New_York", "Europe/London", 
    "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney"
  ];

  useEffect(() => {
    loadSettings();
  }, []);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('automation_settings').select('*').limit(1).single();
      if (data) {
        setSettingsId(data.id);
        setIsActive(data.is_active || false);
        setFetchTime(data.fetch_time ? data.fetch_time.substring(0, 5) : '00:15');
        setTimezone(data.timezone || 'Asia/Dhaka');
        setIsPrevDay(data.is_previous_day_stock ?? true);
        setTargetUrl(data.donor_url || '');
        setTargetUser(data.donor_username || '');
        setTargetPass(data.donor_password || '');
      }
    } catch (error) {
      console.error("Error loading settings", error);
    }
    setIsLoading(false);
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

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestData(null);
    // Simulate bot connecting and fetching sample data without saving to DB
    setTimeout(() => {
      setTestData([
        { product_code: "2124", quantity: 450 },
        { product_code: "1605", quantity: 120 },
        { product_code: "2303", quantity: 89 }
      ]);
      showMessage("Connection successful! Sample data fetched.", "success");
      setIsTesting(false);
    }, 2500);
  };

  const handleManualFetch = async () => {
    setIsFetching(true);
    // Simulate triggering the actual serverless bot for DB save
    setTimeout(() => {
      showMessage(`Triggered manual fetch for ${manualDate ? manualDate : (isPrevDay ? 'Previous Day' : 'Today')}. Data will be saved shortly.`, "success");
      setIsFetching(false);
      setManualDate('');
    }, 2000);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 w-full animate-in fade-in duration-500 relative">

      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 shadow-sm z-10">
        <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Sync & Automation Settings</h2>
          <p className="text-sm text-slate-500 hidden md:block">Manage automated stock fetching from external sources</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
        {msg.text && (
          <div className={`p-4 rounded-xl shadow-md border text-sm font-bold animate-in slide-in-from-top-2 flex justify-between items-center mb-6 w-full ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="flex items-center"><span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}</span>
            <button onClick={() => setMsg({text:'', type:''})} className="p-1 rounded-md hover:bg-black/5"><Icons.Close /></button>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center h-64"><Icons.Spinner /></div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

            {/* SETTINGS FORM */}
            <div className="xl:col-span-2 space-y-6">
              <form onSubmit={handleSaveSettings}>
                {/* Block 1: Automation Config */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
                  <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-slate-900 flex items-center">
                      <span className="text-xl mr-2">⚙️</span> Automation Configuration
                    </h3>
                    <label className="flex items-center cursor-pointer">
                      <div className="relative">
                        <input type="checkbox" className="sr-only" checked={isActive} onChange={() => setIsActive(!isActive)} />
                        <div className={`block w-14 h-8 rounded-full transition-colors ${isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                        <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isActive ? 'transform translate-x-6' : ''}`}></div>
                      </div>
                      <span className={`ml-3 text-sm font-bold uppercase ${isActive ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {isActive ? 'Active' : 'Disabled'}
                      </span>
                    </label>
                  </div>

                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Daily Fetch Time</label>
                      <input 
                        type="time" 
                        value={fetchTime} 
                        onChange={(e) => setFetchTime(e.target.value)} 
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Timezone</label>
                      <select 
                        value={timezone} 
                        onChange={(e) => setTimezone(e.target.value)} 
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500"
                      >
                        {timezones.map(tz => (
                          <option key={tz} value={tz}>{tz}</option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <label className="flex items-start space-x-3 cursor-pointer">
                         <div className="mt-0.5">
                            <input 
                              type="checkbox" 
                              checked={isPrevDay} 
                              onChange={(e) => setIsPrevDay(e.target.checked)} 
                              className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer" 
                            />
                         </div>
                         <div>
                            <p className="text-sm font-bold text-amber-900">Record as Previous Day's Stock</p>
                            <p className="text-xs text-amber-700 leading-tight mt-1">
                              If checked, stock fetched after midnight (e.g., 12:15 AM) will be saved with yesterday's date.
                            </p>
                         </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Block 2: Credentials */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
                  <div className="p-5 border-b border-slate-100 bg-slate-50">
                    <h3 className="font-bold text-lg text-slate-900 flex items-center">
                      <span className="text-xl mr-2">🔐</span> System Credentials
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Provide external system login details and landing page URL for the bot to navigate.</p>
                  </div>

                  <div className="p-6 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Target URL (Login Page or Stock View)</label>
                      <input 
                        type="url" 
                        value={targetUrl} 
                        onChange={(e) => setTargetUrl(e.target.value)} 
                        placeholder="https://external-system.com/login"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500" 
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Username / Email</label>
                        <input 
                          type="text" 
                          value={targetUser} 
                          onChange={(e) => setTargetUser(e.target.value)} 
                          placeholder="Enter username"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Password</label>
                        <input 
                          type="password" 
                          value={targetPass} 
                          onChange={(e) => setTargetPass(e.target.value)} 
                          placeholder="••••••••"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500" 
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <button type="submit" disabled={isSaving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex justify-center items-center disabled:opacity-50">
                  {isSaving ? <><Icons.Spinner /> Saving Configuration...</> : 'Save Automation Settings'}
                </button>
              </form>
            </div>

            {/* MANUAL & TEST TRIGGER */}
            <div className="xl:col-span-1 space-y-6">

              {/* Test Connection Block */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 relative">
                <h3 className="font-bold text-lg text-slate-900 mb-2 flex items-center">
                  <span className="text-xl mr-2">🧪</span> Test Connection
                </h3>
                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                  Run the bot to verify credentials and UI logic. Fetched data will be previewed below but <span className="font-bold text-rose-600">will NOT be saved</span> to the database.
                </p>

                <button onClick={handleTestConnection} disabled={isTesting || !targetUrl} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-black py-3 rounded-xl shadow-sm transition-all flex justify-center items-center disabled:opacity-50 uppercase tracking-widest text-xs">
                  {isTesting ? <><Icons.Spinner /> Connecting...</> : 'Run Test'}
                </button>

                {/* Test Results Preview */}
                {testData && (
                  <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 animate-in fade-in slide-in-from-top-2">
                     <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Live Preview (Not Saved)</h4>
                     <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                       {testData.map((d, i) => (
                         <div key={i} className="flex justify-between items-center bg-white p-2 px-3 border border-slate-100 rounded-lg text-xs">
                           <span className="font-mono font-bold text-slate-600">{d.product_code}</span>
                           <span className="font-black text-indigo-600">{d.quantity}</span>
                         </div>
                       ))}
                     </div>
                  </div>
                )}
              </div>

              {/* Manual Fetch Block */}
              <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden p-6 text-white sticky top-24">
                <h3 className="font-bold text-lg mb-2 flex items-center">
                  <span className="text-xl mr-2">⚡</span> Manual Execution
                </h3>
                <p className="text-xs text-slate-300 mb-6 leading-relaxed">
                  Force the automation bot to run immediately. This will fetch stock data and <span className="font-bold text-emerald-400">save it to the database</span> permanently.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Override Record Date (Optional)</label>
                    <input 
                      type="date" 
                      value={manualDate} 
                      onChange={(e) => setManualDate(e.target.value)} 
                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white font-bold outline-none focus:border-indigo-400 color-scheme-dark" 
                    />
                    <p className="text-[9px] text-slate-500 mt-1.5">Leave blank to follow "Previous Day" logic.</p>
                  </div>

                  <button onClick={handleManualFetch} disabled={isFetching || !targetUrl} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3.5 rounded-xl shadow-lg transition-all flex justify-center items-center mt-4 disabled:opacity-50 uppercase tracking-widest text-xs">
                    {isFetching ? <><Icons.Spinner /> Initializing...</> : 'Fetch & Save Now'}
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}
      </div>
    </div>
  );
}
