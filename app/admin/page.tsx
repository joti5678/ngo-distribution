"use client";

import React from 'react';
import Link from 'next/link';
import { Icons } from './../components/Icons';

const ADMIN_MODULES = [
  { 
    id: 'catalog', 
    path: '/catalog',
    title: 'Product Catalog', 
    desc: 'Manage master items, categories and SKUs', 
    icon: <Icons.Catalog />, 
    gradient: 'from-blue-600 to-indigo-700' 
  },
  { 
    id: 'packages', 
    path: '/catalog/groups',
    title: 'Product Packages', 
    desc: 'Create combined kits & item groups for distribution', 
    icon: <Icons.Dashboard />, 
    gradient: 'from-purple-600 to-fuchsia-700' 
  },
  { 
    id: 'product-history', 
    path: '/admin/product-history',
    title: 'Product History & Audit', 
    desc: 'Audit trail, revert edits & recover deleted items', 
    icon: <Icons.Edit />, 
    gradient: 'from-slate-700 to-slate-900' 
  },
  { 
    id: 'wh-setup', 
    path: '/admin/wh-setup',
    title: 'Warehouse Setup', 
    desc: 'Configure central and regional storage facilities', 
    icon: <Icons.Upload />, 
    gradient: 'from-rose-500 to-red-600' 
  },
  { 
    id: 'dp-setup', 
    path: '/admin/dp-setup',
    title: 'Distribution Points', 
    desc: 'Create and manage field distribution locations (Camps)', 
    icon: <Icons.Manifest />, 
    gradient: 'from-amber-500 to-orange-600' 
  },
  { 
    id: 'dp-wh-connection', 
    path: '/admin/dp-wh-connection',
    title: 'DP & WH Mapping', 
    desc: 'Map source warehouses for Distribution Points', 
    icon: <Icons.Dashboard />, 
    gradient: 'from-cyan-600 to-blue-600' 
  },
  { 
    id: 'partners', 
    path: '/admin/partners',
    title: 'Partner Setup', 
    desc: 'Register and manage NGOs, Agencies, and Donors', 
    icon: <Icons.Users />, 
    gradient: 'from-emerald-600 to-teal-700' 
  },
  { 
    id: 'user-page-management', 
    path: '/admin/user-page-management',
    title: 'User & Page Management', 
    desc: 'Manage dynamic routes, roles, and page access control', 
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>, 
    gradient: 'from-violet-600 to-indigo-900' 
  }
];

export default function AdminPanelPage() {
  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500">
      
      {/* Header */}
      <header className="flex h-16 bg-white border-b border-slate-200 items-center px-6 shrink-0 shadow-sm z-10">
        <h2 className="text-lg font-bold text-slate-800">Admin Control Panel</h2>
      </header>

      {/* Grid Menu */}
      <div className="flex-1 overflow-y-auto p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wide">System Configuration & Master Data</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {ADMIN_MODULES.map((mod) => (
            <Link 
              key={mod.id} 
              href={mod.path} 
              className={`group rounded-2xl p-5 flex items-start space-x-4 bg-gradient-to-br ${mod.gradient} shadow-md hover:-translate-y-1 hover:shadow-xl transition-all duration-300 border border-white/10`}
            >
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0 text-white shadow-inner">
                {mod.icon}
              </div>
              <div className="flex-1 text-white">
                <h3 className="text-base font-bold mb-1 group-hover:text-white/90 leading-tight">{mod.title}</h3>
                <p className="text-[11px] font-medium text-white/80 leading-relaxed">{mod.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
