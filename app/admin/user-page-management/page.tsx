"use client";

import React from 'react';
import Link from 'next/link';

const MANAGEMENT_MODULES = [
  { 
    id: 'roles', 
    path: '/admin/user-page-management/roles',
    title: 'Role Management', 
    desc: 'Create, edit, and define user roles (e.g., Admin, Field Worker).', 
    icon: '👥',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'hover:border-blue-300'
  },
  { 
    id: 'routes', 
    path: '/admin/user-page-management/routes',
    title: 'Route Management', 
    desc: 'Register dynamic pages, URLs, and set sidebar ordering.', 
    icon: '🔗',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    border: 'hover:border-indigo-300'
  },
  { 
    id: 'access', 
    path: '/admin/user-page-management/access',
    title: 'Page Access Control', 
    desc: 'Assign page access to specific roles using drag-and-drop.', 
    icon: '🔐',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'hover:border-emerald-300'
  },
  { 
    id: 'users', 
    path: '/admin/user-page-management/users',
    title: 'User Management', 
    desc: 'Manage user accounts, assign roles, and apply force restrictions.', 
    icon: '👤',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'hover:border-violet-300'
  },
  { 
    id: 'security', 
    path: '#',
    title: 'Advanced Security (Soon)', 
    desc: 'Global lockouts, API restrictions, and middleware logs.', 
    icon: '🛡️',
    color: 'text-slate-500',
    bg: 'bg-slate-100',
    border: 'hover:border-slate-300',
    disabled: true
  }
];

export default function UserPageManagementHub() {
  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 overflow-y-auto">
      
      {/* Header */}
      <header className="flex h-20 bg-slate-900 border-b border-slate-800 items-center px-6 shrink-0 shadow-md sticky top-0 z-10">
        <div className="flex items-center">
            <Link href="/admin" className="mr-5 p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-slate-300 transition-colors" title="Back to Admin Panel">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </Link>
            <span className="text-3xl mr-4 drop-shadow-md">⚙️</span>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">User & Page Management</h1>
              <p className="text-xs font-bold text-slate-400 mt-0.5 uppercase tracking-widest">Access Control Hub</p>
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 max-w-6xl mx-auto w-full">
        
        <div className="mb-8">
          <h2 className="text-2xl font-black text-slate-800">Security & Access Control</h2>
          <p className="text-slate-500 font-medium mt-2 max-w-2xl leading-relaxed">
            Manage the entire authentication and authorization architecture. Create roles, register application routes, map access permissions, and manage individual user accounts from this unified dashboard.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {MANAGEMENT_MODULES.map((mod) => {
            if (mod.disabled) {
              return (
                <div key={mod.id} className={`rounded-3xl p-6 border border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed flex flex-col h-full`}>
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-5 shadow-sm ${mod.bg}`}>
                    {mod.icon}
                  </div>
                  <h3 className="text-lg font-black text-slate-800 mb-2">{mod.title}</h3>
                  <p className="text-sm font-semibold text-slate-500 leading-relaxed mb-6 flex-1">{mod.desc}</p>
                  <div className="mt-auto">
                    <span className="inline-block px-3 py-1 bg-slate-200 text-slate-500 text-[10px] font-black rounded-md uppercase tracking-wider">
                      Under Development
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <Link 
                key={mod.id} 
                href={mod.path} 
                className={`group rounded-3xl p-6 border border-slate-200 bg-white shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full relative overflow-hidden ${mod.border}`}
              >
                <div className={`absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500 ease-out z-0 ${mod.bg}`}></div>
                
                <div className="relative z-10 flex flex-col h-full">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-5 shadow-sm ${mod.bg} ${mod.color}`}>
                    {mod.icon}
                  </div>
                  <h3 className={`text-lg font-black text-slate-800 mb-2 group-hover:${mod.color} transition-colors`}>{mod.title}</h3>
                  <p className="text-sm font-semibold text-slate-500 leading-relaxed mb-6 flex-1">{mod.desc}</p>
                  
                  <div className={`mt-auto flex items-center text-xs font-black uppercase tracking-wider ${mod.color}`}>
                    Manage Module 
                    <svg className="w-4 h-4 ml-1.5 group-hover:translate-x-1.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

      </main>
    </div>
  );
}
