"use client";

import React from 'react';
import Link from 'next/link';
import { Icons } from '../components/Icons';

const ADMIN_MODULES = [
  { id: 'roles', title: 'Role Management', desc: 'Define system permissions and hierarchy', icon: <Icons.Filter />, gradient: 'from-blue-600 to-indigo-700' },
  { id: 'users', title: 'User Management', desc: 'Manage user accounts and statuses', icon: <Icons.Users />, gradient: 'from-cyan-600 to-teal-700' },
  { id: 'access', title: 'Page Access Control', desc: 'Dynamic UI access control for roles', icon: <Icons.Dashboard />, gradient: 'from-purple-600 to-pink-700' },
  { id: 'partners', title: 'Partner Setup', desc: 'Register partnering NGOs & Donors', icon: <Icons.Manifest />, gradient: 'from-emerald-600 to-green-700' },
  { id: 'dp-setup', title: 'Distribution Points', desc: 'Create and configure field locations', icon: <Icons.Catalog />, gradient: 'from-amber-500 to-orange-600' },
  { id: 'wh-setup', title: 'Warehouse Setup', desc: 'Manage main warehouse facilities', icon: <Icons.Upload />, gradient: 'from-rose-500 to-red-600' },
  { id: 'dp-wh-connection', title: 'DP & WH Connection', desc: 'Map points to specific warehouses', icon: <Icons.Search />, gradient: 'from-indigo-500 to-blue-600' },
];

export default function AdminPanelPage() {
  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500">
      
      <header className="flex h-16 bg-white border-b border-slate-200 items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Admin Panel</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wide">System Configurations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          
          {ADMIN_MODULES.map((mod) => (
            <Link 
              key={mod.id} 
              href={mod.id === 'users' ? '/users' : `/admin/${mod.id}`}
              className={`group rounded-2xl p-5 flex items-start space-x-4 bg-gradient-to-br ${mod.gradient} shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer border border-white/10`}
            >
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0 text-white shadow-inner">
                {mod.icon}
              </div>
              <div className="flex-1 text-white">
                <h3 className="text-base font-bold mb-1 group-hover:text-white/90">{mod.title}</h3>
                <p className="text-xs font-medium text-white/80 leading-relaxed">{mod.desc}</p>
              </div>
            </Link>
          ))}

        </div>
      </div>
    </div>
  );
}