"use client";
import React, { useEffect, useState } from 'react';

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const session = localStorage.getItem('user_session');
    if (session) {
      setUser(JSON.parse(session));
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-6 shrink-0 shadow-sm z-10 justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Main Dashboard</h1>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">System Overview</p>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
            <span className="text-4xl mb-4 block animate-bounce w-10">👋</span>
            <h2 className="text-2xl font-black text-slate-800 mb-2">Welcome back, {user?.full_name || 'Admin'}!</h2>
            <p className="text-slate-600 font-medium">You have successfully logged into the WebIMS Enterprise System.</p>
            
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-2xl">
                    <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1">Your Role</p>
                    <p className="text-lg font-black text-indigo-900">{user?.user_roles?.role_name || 'N/A'}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl">
                    <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-1">Assigned DPs</p>
                    <p className="text-lg font-black text-emerald-900">{user?.assigned_dp_ids?.length || 0} Facilities</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl">
                    <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-1">Assigned WHs</p>
                    <p className="text-lg font-black text-amber-900">{user?.assigned_wh_ids?.length || 0} Warehouses</p>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
}
