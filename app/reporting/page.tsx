"use client";

import React from 'react';
import Link from 'next/link';
import { Icons } from '../components/Icons';

const REPORTING_MODULES = [
  { 
    id: 'general-builder', 
    path: '/reporting/general',
    title: 'General Reporting (Builder)', 
    desc: 'Drag & drop interactive report builder for daily and monthly summaries', 
    icon: <Icons.Dashboard />, 
    gradient: 'from-indigo-600 to-blue-700' 
  },
  { 
    id: 'reconciliation', 
    path: '/reporting/reconciliation',
    title: 'Stock Reconciliation', 
    desc: 'Identify mismatch between warehouse dispatch and field distribution', 
    icon: <Icons.Catalog />, 
    gradient: 'from-emerald-600 to-teal-700' 
  },
  { 
    id: 'donor-reports', 
    path: '/reporting/donor',
    title: 'Donor specific Reports', 
    desc: 'Pre-formatted reports designed for specific donor compliances', 
    icon: <Icons.Manifest />, 
    gradient: 'from-amber-500 to-orange-600' 
  },
  { 
    id: 'audit-logs', 
    path: '/admin/product-history',
    title: 'System Audit Logs', 
    desc: 'Track user activities, deleted transactions, and system changes', 
    icon: <Icons.Users />, 
    gradient: 'from-slate-700 to-slate-900' 
  }
];

export default function ReportingPanelPage() {
  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500">
      
      {/* Header */}
      <header className="flex h-16 bg-white border-b border-slate-200 items-center px-6 shrink-0 shadow-sm z-10">
        <h2 className="text-lg font-bold text-slate-800">Reports & Reconciliation</h2>
      </header>

      {/* Grid Menu */}
      <div className="flex-1 overflow-y-auto p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wide">Reporting Modules</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {REPORTING_MODULES.map((mod) => (
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