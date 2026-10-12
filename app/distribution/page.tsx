"use client";

import React from 'react';
import Link from 'next/link';
import { Icons } from '../components/Icons';

const DP_MODULES = [
  { id: 'manifests', title: 'Manage Manifest', desc: 'Create, assign & manage manifests', icon: <Icons.Manifest />, gradient: 'from-blue-600 to-indigo-700' },
  { id: 'lpg-stock', title: 'LPG Stock Entry', desc: 'Manage LPG cylinder field stock', icon: <Icons.Download />, gradient: 'from-rose-500 to-red-600' },
  { id: 'lpg-dist', title: 'LPG Distribution', desc: 'Initial & Replenishment records tracking', icon: <Icons.Filter />, gradient: 'from-amber-500 to-orange-600' },
  { id: 'nfi-dist', title: 'NFI Distribution', desc: 'Non-Food Item distribution tracking', icon: <Icons.Catalog />, gradient: 'from-emerald-600 to-teal-700' },
];

export default function DistributionPanelPage() {
  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500">
      
      <header className="flex h-16 bg-white border-b border-slate-200 items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Distribution Point</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wide">Field Operations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          
          {DP_MODULES.map((mod) => (
            <Link 
              key={mod.id} 
              href={mod.id === 'manifests' ? '/manifests' : `/distribution/${mod.id}`}
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