'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Calendar as CalendarIcon, Trash2, ArrowLeft, Download, 
  UploadCloud, Settings, ChevronLeft, ChevronRight, Briefcase, 
  FileSpreadsheet, PlusCircle, Filter, Lock, ArrowRightLeft, Unlock
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function HolidayCalendarAdvanced() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(false);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [dailyTargets, setDailyTargets] = useState<any>({});
  const [systemDps, setSystemDps] = useState<any[]>([]);
  const [selectedDp, setSelectedDp] = useState<string>('ALL');
  
  // FIX: SSR Error issue resolved by initializing with null
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [weeklyDays, setWeeklyDays] = useState<number[]>([5, 6]); 
  
  const [isSettingsUnlocked, setIsSettingsUnlocked] = useState(false);

  const [manualAddDate, setManualAddDate] = useState('');
  const [manualAddDesc, setManualAddDesc] = useState('');
  const [shiftFromDate, setShiftFromDate] = useState('');
  const [shiftToDate, setShiftToDate] = useState('');

  const [passModalOpen, setPassModalOpen] = useState(false);
  const [inputPassword, setInputPassword] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: string, payload?: any } | null>(null);

  // FIX: Ensure currentDate is set only on the client side
  useEffect(() => {
    setCurrentDate(new Date());
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const { data: dpData } = await supabase.from('distribution_points').select('id, name, code');
      if (dpData) setSystemDps(dpData);

      const { data: hData } = await supabase.from('holiday_calendar').select('*').order('holiday_date', { ascending: true });
      if (hData) setHolidays(hData);

      const { data: tData } = await supabase.from('lpg_refill_targets').select('target_date, dp_id, final_target');
      if (tData) {
        const grouped = tData.reduce((acc: any, curr: any) => {
           if (!acc[curr.target_date]) acc[curr.target_date] = { ALL: 0 };
           acc[curr.target_date].ALL += curr.final_target;
           acc[curr.target_date][curr.dp_id] = (acc[curr.target_date][curr.dp_id] || 0) + curr.final_target;
           return acc;
        }, {});
        setDailyTargets(grouped);
      }
    } catch (error) {
      console.error("Error fetching data", error);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // FIX: Safety check before rendering date functions
  if (!currentDate) {
    return <div className="flex items-center justify-center h-screen bg-gray-50 text-gray-500 font-bold">Loading Calendar...</div>;
  }

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const realToday = new Date();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const formatDateString = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  let totalWorkingDays = 0, totalWeekends = 0, totalPublicHolidays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDateString(year, month, d);
    const holidayRecord = holidays.find(h => h.holiday_date === dateStr);
    if (holidayRecord) {
      if (holidayRecord.description.includes('[Working Day]')) totalWorkingDays++;
      else if (holidayRecord.description.includes('Weekend')) totalWeekends++;
      else totalPublicHolidays++;
    } else {
      totalWorkingDays++;
    }
  }

  const shiftTargets = async (hDate: string, sDate: string) => {
    if (hDate === sDate) return;
    const { data: hTargets } = await supabase.from('lpg_refill_targets').select('*').eq('target_date', hDate);
    const { data: sTargets } = await supabase.from('lpg_refill_targets').select('*').eq('target_date', sDate);
    
    if (hTargets && hTargets.length > 0) {
      const updates = (sTargets || []).map(st => {
        const ht = hTargets.find(h => h.dp_id === st.dp_id);
        return { ...st, final_target: st.final_target + (ht ? ht.target_quantity : 0) };
      });
      const hUpdates = hTargets.map(ht => ({ ...ht, final_target: 0 }));
      await supabase.from('lpg_refill_targets').upsert([...updates, ...hUpdates]);
    }
  };

  const revertTargets = async (hDate: string, sDate: string) => {
    if (hDate === sDate) return;
    const { data: hTargets } = await supabase.from('lpg_refill_targets').select('*').eq('target_date', hDate);
    const { data: sTargets } = await supabase.from('lpg_refill_targets').select('*').eq('target_date', sDate);
    
    if (hTargets && hTargets.length > 0) {
      const updates = (sTargets || []).map(st => {
        const ht = hTargets.find(h => h.dp_id === st.dp_id);
        return { ...st, final_target: Math.max(0, st.final_target - (ht ? ht.target_quantity : 0)) };
      });
      const hUpdates = hTargets.map(ht => ({ ...ht, final_target: ht.target_quantity }));
      await supabase.from('lpg_refill_targets').upsert([...updates, ...hUpdates]);
    }
  };

  const requestAction = (type: string, payload?: any) => {
    setPendingAction({ type, payload });
    setPassModalOpen(true);
    setInputPassword('');
  };

  const verifyPasswordAndExecute = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('master_passwords').select('password').eq('module_name', 'holiday_settings').single();
      if (error || !data || data.password !== inputPassword) {
        alert("Invalid Master Password!");
        setLoading(false);
        return;
      }
      setPassModalOpen(false);
      await executeAction();
    } catch (e) {
      alert("Error verifying password.");
    } finally {
      setLoading(false);
    }
  };

  const executeAction = async () => {
    if (!pendingAction) return;
    setLoading(true);
    const { type, payload } = pendingAction;
    
    try {
      if (type === 'unlock_settings') {
        setIsSettingsUnlocked(true);
        setLoading(false); setPendingAction(null);
        return;
      }
      if (type === 'manual_add') {
        const { date, desc } = payload;
        await supabase.from('holiday_calendar').upsert([{ holiday_date: date, description: desc, shift_to_date: date }], { onConflict: 'holiday_date' });
        alert("Holiday added successfully!");
        setManualAddDate(''); setManualAddDesc('');
      } 
      else if (type === 'shift_target') {
        const { hDate, sDate } = payload;
        const { data: extHoliday } = await supabase.from('holiday_calendar').select('*').eq('holiday_date', hDate).single();
        const desc = extHoliday ? extHoliday.description : 'Shifted Holiday';
        await supabase.from('holiday_calendar').upsert([{ holiday_date: hDate, description: desc, shift_to_date: sDate }], { onConflict: 'holiday_date' });
        await shiftTargets(hDate, sDate);
        alert("Targets shifted successfully!");
        setShiftFromDate(''); setShiftToDate('');
      }
      else if (type === 'delete') {
        const { id, hDate, sDate } = payload;
        await revertTargets(hDate, sDate);
        await supabase.from('holiday_calendar').delete().eq('id', id);
        alert("Holiday deleted and targets reverted!");
      }
      else if (type === 'mark_work') {
        const { id, desc } = payload;
        const newDesc = desc.includes('[Working Day]') ? desc.replace(' [Working Day]', '') : `${desc} [Working Day]`;
        await supabase.from('holiday_calendar').update({ description: newDesc }).eq('id', id);
      }
      else if (type === 'yearly_weekends') {
        const inserts = [];
        const daysInYear = new Date(year, 11, 31).getTime();
        for (let d = new Date(year, 0, 1).getTime(); d <= daysInYear; d += 86400000) {
          const currentD = new Date(d);
          if (weeklyDays.includes(currentD.getDay())) {
            const dateStr = formatDateString(currentD.getFullYear(), currentD.getMonth(), currentD.getDate());
            inserts.push({ holiday_date: dateStr, description: 'Weekend', shift_to_date: dateStr });
          }
        }
        for (let i = 0; i < inserts.length; i += 100) {
          await supabase.from('holiday_calendar').upsert(inserts.slice(i, i + 100), { onConflict: 'holiday_date' });
        }
        alert("Yearly weekends generated!");
      }
      fetchData();
    } catch (e) {
      alert("Action failed. Check console.");
      console.error(e);
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };

  const downloadDemo = () => {
    const ws = XLSX.utils.json_to_sheet([{ Date: '2026-11-25', Description: 'Public Holiday', Shift_To_Date: '2026-11-24' }]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Holidays"); XLSX.writeFile(wb, "Holiday_Upload_Demo.xlsx");
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const pwd = prompt("Enter Master Password to upload Excel:");
    if (!pwd) return;
    
    setLoading(true);
    try {
      const { data } = await supabase.from('master_passwords').select('password').eq('module_name', 'holiday_settings').single();
      if (!data || data.password !== pwd) { alert("Invalid password!"); return; }

      const reader = new FileReader();
      reader.onload = async (evt) => {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        const inserts = rows.map((r: any) => ({ holiday_date: r.Date, description: r.Description || 'Holiday', shift_to_date: r.Shift_To_Date || r.Date }));
        await supabase.from('holiday_calendar').upsert(inserts, { onConflict: 'holiday_date' });
        
        for (const row of inserts) await shiftTargets(row.holiday_date, row.shift_to_date);
        
        alert("Excel holidays uploaded and targets shifted!");
        fetchData();
      };
      reader.readAsBinaryString(file);
    } catch (error) { alert("Upload failed."); } finally { setLoading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  let maxTarget = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = formatDateString(year, month, d);
    const val = dailyTargets[ds]?.[selectedDp] || 0;
    if (val > maxTarget) maxTarget = val;
  }

  const getHeatmapColor = (val: number, max: number) => {
    if (val === 0) return 'bg-gray-100 text-gray-500';
    const ratio = val / max;
    if (ratio > 0.6) return 'bg-red-100 text-red-700'; 
    if (ratio > 0.3) return 'bg-blue-100 text-blue-700'; 
    return 'bg-green-100 text-green-700'; 
  };

  const renderCalendar = () => {
    const blanks = Array.from({ length: firstDay }, (_, i) => <div key={`blank-${i}`} className="p-1 md:p-2 border border-gray-100 bg-gray-50"></div>);
    const days = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDateString(year, month, d);
      const holidayInfo = holidays.find(h => h.holiday_date === dateStr);
      const targetVal = dailyTargets[dateStr]?.[selectedDp] || 0;
      const isToday = d === realToday.getDate() && month === realToday.getMonth() && year === realToday.getFullYear();
      
      let borderStyle = "border-gray-100";
      if (holidayInfo) {
        if (holidayInfo.description.includes('[Working Day]')) borderStyle = "border-l-2 md:border-l-4 border-l-green-400";
        else if (holidayInfo.description.includes('Weekend')) borderStyle = "border-l-2 md:border-l-4 border-l-orange-400 bg-orange-50/30";
        else borderStyle = "border-l-2 md:border-l-4 border-l-red-500 bg-red-50/30";
      }

      const todayHighlight = isToday ? 'ring-2 ring-indigo-500 bg-indigo-50 shadow-sm z-10' : 'bg-white';
      const heatColor = getHeatmapColor(targetVal, maxTarget);
      const displayHolidayDesc = holidayInfo ? holidayInfo.description.replace(/Weekly Weekend/gi, 'Weekend').replace(' [Working Day]', '') : '';

      days.push(
        <div key={d} className={`p-1 flex flex-col items-center justify-start hover:shadow-md transition cursor-default rounded-sm min-h-[65px] md:min-h-[90px] border relative overflow-hidden ${borderStyle} ${todayHighlight}`}>
          
          <span className={`text-sm md:text-lg font-bold ${isToday ? 'text-indigo-700 bg-indigo-200 px-2 rounded-full' : 'text-gray-800'}`}>
            {d}
          </span>
          
          <span className={`text-[8px] md:text-[11px] font-bold px-0.5 md:px-2 py-0.5 rounded mt-0.5 md:mt-1 whitespace-nowrap w-full text-center tracking-tighter md:tracking-normal ${heatColor}`}>
            🎯 {targetVal}
          </span>

          {holidayInfo && (
            <span className="text-[8px] md:text-[10px] font-bold text-black text-center leading-tight mt-0.5 md:mt-1 truncate w-full px-0.5">
              {displayHolidayDesc}
            </span>
          )}
        </div>
      );
    }
    return [...blanks, ...days];
  };

  return (
    <div className="p-3 md:p-6 pt-20 md:pt-24 md:pr-20 max-w-[1400px] mx-auto bg-gray-50 min-h-screen">
      
      {passModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-gray-900/50 backdrop-blur-sm px-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4 text-indigo-600">
              <Lock size={24} /> <h3 className="text-lg font-bold text-gray-900">Master Authentication</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">Please enter the master password to execute this action.</p>
            <input 
              type="password" autoFocus placeholder="Enter Password" value={inputPassword} 
              onChange={e => setInputPassword(e.target.value)} 
              className="w-full p-3 border rounded-lg mb-4 text-black font-medium focus:ring-2 focus:ring-indigo-500" 
            />
            <div className="flex gap-2">
              <button onClick={() => setPassModalOpen(false)} className="w-full py-2 bg-gray-200 text-gray-700 font-medium rounded-lg">Cancel</button>
              <button onClick={verifyPasswordAndExecute} disabled={loading} className="w-full py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700">{loading ? 'Verifying...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Header & DP Filter */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 bg-white rounded-full shadow hover:bg-gray-100 border text-gray-600 transition"><ArrowLeft size={20} /></button>
          <div><h1 className="text-xl md:text-2xl font-bold text-gray-800">DP Calendar</h1></div>
        </div>
        <div className="flex items-center gap-2 bg-white p-1.5 rounded-lg border shadow-sm w-full lg:w-auto">
          <Filter size={18} className="text-gray-500 ml-2 shrink-0" />
          <select value={selectedDp} onChange={e => setSelectedDp(e.target.value)} className="bg-transparent text-xs md:text-sm font-bold text-gray-800 focus:outline-none p-1 border-none cursor-pointer w-full">
            <option value="ALL">All DP Locations (Total)</option>
            {systemDps.map(dp => <option key={dp.id} value={dp.id}>[{dp.code}] {dp.name}</option>)}
          </select>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-6">
        <div className="bg-white p-4 md:p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div><p className="text-xs md:text-sm font-medium text-gray-500">Working Days ({currentDate.toLocaleString('default', { month: 'short' })})</p><h3 className="text-2xl md:text-3xl font-bold text-green-600">{totalWorkingDays}</h3></div>
          <div className="p-2.5 md:p-3 bg-green-50 rounded-lg"><Briefcase className="text-green-600" size={20} /></div>
        </div>
        <div className="bg-white p-4 md:p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div><p className="text-xs md:text-sm font-medium text-gray-500">Weekends ({currentDate.toLocaleString('default', { month: 'short' })})</p><h3 className="text-2xl md:text-3xl font-bold text-orange-500">{totalWeekends}</h3></div>
          <div className="p-2.5 md:p-3 bg-orange-50 rounded-lg"><CalendarIcon className="text-orange-500" size={20} /></div>
        </div>
        <div className="bg-white p-4 md:p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div><p className="text-xs md:text-sm font-medium text-gray-500">Public Holidays ({currentDate.toLocaleString('default', { month: 'short' })})</p><h3 className="text-2xl md:text-3xl font-bold text-red-600">{totalPublicHolidays}</h3></div>
          <div className="p-2.5 md:p-3 bg-red-50 rounded-lg"><Settings className="text-red-600" size={20} /></div>
        </div>
      </div>

      {/* 1. Full-Screen Calendar */}
      <div className="bg-white p-3 md:p-5 rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg md:text-xl font-bold text-gray-800">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
          <div className="flex gap-2">
            <button onClick={prevMonth} className="p-1.5 md:p-2 rounded bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition"><ChevronLeft size={20}/></button>
            <button onClick={nextMonth} className="p-1.5 md:p-2 rounded bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition"><ChevronRight size={20}/></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1 md:mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <div key={day} className="text-center text-[10px] md:text-xs font-bold text-gray-400 uppercase py-1">{day}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {renderCalendar()}
        </div>
      </div>

      {/* 2. Middle Section: Current Month's Holiday List */}
      <div className="bg-white p-4 md:p-5 rounded-xl border border-gray-200 shadow-sm mb-6">
        <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-4 pb-2 border-b">Holidays in {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {holidays.filter(h => {
             const dObj = new Date(h.holiday_date);
             return dObj.getMonth() === month && dObj.getFullYear() === year;
          }).map(h => {
            const isWorking = h.description.includes('[Working Day]');
            const displayDesc = h.description.replace(/Weekly Weekend/gi, 'Weekend').replace(' [Working Day]', '');
            return (
              <div key={h.id} className={`p-3 border-l-4 border-y border-r rounded-r-md flex items-center justify-between ${isWorking ? 'border-l-green-500 bg-green-50/50' : 'border-l-red-500'}`}>
                <div className="overflow-hidden pr-2">
                  <p className={`text-sm font-bold ${isWorking ? 'text-green-700' : 'text-gray-800'}`}>{new Date(h.holiday_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</p>
                  <p className={`text-xs font-medium truncate ${isWorking ? 'text-green-600' : 'text-gray-600'}`}>{displayDesc}</p>
                  {h.shift_to_date && h.shift_to_date !== h.holiday_date && <p className="text-[10px] text-indigo-500 font-bold mt-1">Shifted to: {h.shift_to_date}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => requestAction('mark_work', { id: h.id, desc: h.description })} className={`p-1.5 md:p-2 rounded transition ${isWorking ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`} title={isWorking ? 'Revert to Holiday' : 'Mark as Working Day'}><Briefcase size={14} /></button>
                  <button onClick={() => requestAction('delete', { id: h.id, hDate: h.holiday_date, sDate: h.shift_to_date })} className="p-1.5 md:p-2 rounded bg-red-50 text-red-500 hover:bg-red-100 transition" title="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Bottom Section: Settings Overlay Grid */}
      <div className="relative rounded-xl overflow-hidden shadow-sm border border-gray-200 mb-6 bg-white">
        {!isSettingsUnlocked && (
          <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
            <div className="bg-white p-4 rounded-full shadow-md mb-4 text-indigo-600"><Lock size={32} /></div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Holiday Settings are Locked</h3>
            <p className="text-sm text-gray-500 mb-4 max-w-sm">You need master authentication to add holidays, shift targets, or modify yearly weekend configurations.</p>
            <button onClick={() => requestAction('unlock_settings')} className="px-6 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-lg shadow-sm hover:bg-indigo-700 transition flex items-center gap-2">
              <Unlock size={18} /> Unlock Settings
            </button>
          </div>
        )}

        <div className={`p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 ${!isSettingsUnlocked ? 'opacity-30 pointer-events-none' : ''}`}>
          
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
             <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5"><PlusCircle size={16} className="text-indigo-600"/> Add Holiday</h3>
             <form onSubmit={(e) => { e.preventDefault(); if(manualAddDate && manualAddDesc) requestAction('manual_add', { date: manualAddDate, desc: manualAddDesc }); }} className="space-y-2">
                <input type="date" required value={manualAddDate} onChange={e => setManualAddDate(e.target.value)} title="Holiday Date" className="w-full p-2 text-xs md:text-sm text-black border rounded bg-white focus:ring-1 focus:ring-indigo-500"/>
                <input type="text" required placeholder="Description (e.g. Strike)" value={manualAddDesc} onChange={e => setManualAddDesc(e.target.value)} className="w-full p-2 text-xs md:text-sm text-black border rounded bg-white focus:ring-1 focus:ring-indigo-500"/>
                <button type="submit" className="w-full py-2 bg-indigo-600 text-white font-medium text-xs md:text-sm rounded hover:bg-indigo-700 transition">Save Holiday</button>
             </form>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
             <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5"><ArrowRightLeft size={16} className="text-indigo-600"/> Shift Targets</h3>
             <form onSubmit={(e) => { e.preventDefault(); if(shiftFromDate && shiftToDate) requestAction('shift_target', { hDate: shiftFromDate, sDate: shiftToDate }); }} className="space-y-2">
                <input type="date" required value={shiftFromDate} onChange={e => setShiftFromDate(e.target.value)} title="From Date (Holiday)" className="w-full p-2 text-xs md:text-sm text-black border rounded bg-white focus:ring-1 focus:ring-indigo-500"/>
                <input type="date" required value={shiftToDate} onChange={e => setShiftToDate(e.target.value)} title="Shift Targets To Date" className="w-full p-2 text-xs md:text-sm text-black border rounded bg-white focus:ring-1 focus:ring-indigo-500"/>
                <button type="submit" className="w-full py-2 bg-indigo-600 text-white font-medium text-xs md:text-sm rounded hover:bg-indigo-700 transition">Apply Shift</button>
             </form>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
             <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5"><UploadCloud size={16} className="text-indigo-600"/> Excel Upload</h3>
             <button onClick={downloadDemo} className="w-full mb-2 py-2 border border-green-500 text-green-600 bg-white font-medium text-xs md:text-sm rounded hover:bg-green-50 flex justify-center gap-2 transition"><Download size={14}/> Demo Format</button>
             <label className="w-full py-2 bg-gray-800 text-white font-medium text-xs md:text-sm rounded hover:bg-gray-900 flex justify-center gap-2 cursor-pointer transition">
               <FileSpreadsheet size={14}/> Upload Excel
               <input type="file" accept=".xlsx, .xls" className="hidden" ref={fileInputRef} onChange={handleExcelUpload} />
             </label>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
             <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5"><Settings size={16} className="text-indigo-600"/> Auto Weekends</h3>
             <div className="flex flex-wrap gap-1 md:gap-2 mb-3 justify-center">
               {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, idx) => (
                 <button key={day} onClick={() => setWeeklyDays(weeklyDays.includes(idx) ? weeklyDays.filter(d=>d!==idx) : [...weeklyDays, idx])} className={`px-2 py-1 text-[10px] md:text-xs font-bold rounded border transition ${weeklyDays.includes(idx) ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>{day}</button>
               ))}
             </div>
             <button onClick={() => requestAction('yearly_weekends')} className="w-full py-2 bg-indigo-50 text-indigo-700 font-bold text-xs md:text-sm rounded border border-indigo-200 hover:bg-indigo-100 transition">Set for Year {year}</button>
          </div>

        </div>
      </div>

    </div>
  );
}