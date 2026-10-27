"use client";

import React from 'react';
import Link from 'next/link';

export default function DatabaseManagementIndex() {
  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      <header className="h-20 bg-slate-900 border-b border-slate-800 flex items-center px-8 shrink-0 shadow-md">
         <span className="text-3xl mr-4 drop-shadow-md">🗄️</span>
         <div>
           <h1 className="text-xl font-black text-white tracking-tight">Database Management Hub</h1>
           <p className="text-xs font-bold text-slate-400 mt-0.5 uppercase tracking-widest">System Administration</p>
         </div>
      </header>

      <main className="flex-1 p-8 max-w-5xl mx-auto w-full">
        <div className="mb-8">
          <h2 className="text-2xl font-black text-slate-800">Administrative Tools</h2>
          <p className="text-slate-500 font-medium mt-1">Manage database records, backups, and system security.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Force Delete Menu */}
          <Link href="/database-management/force-delete" className="group block bg-white rounded-3xl p-8 border border-slate-200 shadow-sm hover:shadow-xl hover:border-rose-300 transition-all duration-300 relative overflow-hidden">
             <div className="absolute -right-6 -top-6 w-32 h-32 bg-rose-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out z-0"></div>
             <div className="relative z-10">
               <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                 <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
               </div>
               <h3 className="text-xl font-black text-slate-900 mb-2 group-hover:text-rose-600 transition-colors">Database Force Delete</h3>
               <p className="text-sm font-semibold text-slate-500 leading-relaxed">Permanently wipe records from specific tables with date range filters. <span className="text-rose-500 font-bold">Irreversible action.</span></p>
               <div className="mt-6 flex items-center text-xs font-bold text-rose-600 uppercase tracking-wider">
                 Enter Zone <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
               </div>
             </div>
          </Link>

          {/* Data Backup (Placeholder) */}
          <div className="bg-slate-50 rounded-3xl p-8 border border-slate-200 opacity-60 cursor-not-allowed">
               <div className="w-14 h-14 bg-slate-200 text-slate-500 rounded-2xl flex items-center justify-center mb-6">
                 <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
               </div>
               <h3 className="text-xl font-black text-slate-900 mb-2">Manual Data Backup</h3>
               <p className="text-sm font-semibold text-slate-500 leading-relaxed">Download a complete snapshot of your Supabase database in SQL format.</p>
               <div className="mt-6 inline-block px-3 py-1 bg-slate-200 text-slate-600 text-xs font-bold rounded-md uppercase tracking-wider">Coming Soon</div>
          </div>

          {/* Daily Backup (Placeholder) */}
          <div className="bg-slate-50 rounded-3xl p-8 border border-slate-200 opacity-60 cursor-not-allowed">
               <div className="w-14 h-14 bg-slate-200 text-slate-500 rounded-2xl flex items-center justify-center mb-6">
                 <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
               </div>
               <h3 className="text-xl font-black text-slate-900 mb-2">Daily Backup Schedule</h3>
               <p className="text-sm font-semibold text-slate-500 leading-relaxed">Configure automated daily backups to cloud storage or local server.</p>
               <div className="mt-6 inline-block px-3 py-1 bg-slate-200 text-slate-600 text-xs font-bold rounded-md uppercase tracking-wider">Coming Soon</div>
          </div>

          {/* Auto Backup (Placeholder) */}
          <div className="bg-slate-50 rounded-3xl p-8 border border-slate-200 opacity-60 cursor-not-allowed">
               <div className="w-14 h-14 bg-slate-200 text-slate-500 rounded-2xl flex items-center justify-center mb-6">
                 <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
               </div>
               <h3 className="text-xl font-black text-slate-900 mb-2">Auto Backup Settings</h3>
               <p className="text-sm font-semibold text-slate-500 leading-relaxed">Manage retention policies and external integration for auto-backups.</p>
               <div className="mt-6 inline-block px-3 py-1 bg-slate-200 text-slate-600 text-xs font-bold rounded-md uppercase tracking-wider">Coming Soon</div>
          </div>

        </div>
      </main>
    </div>
  );
}
