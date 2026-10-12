"use client";

import React from 'react';
import Link from 'next/link';
import { Icons } from '../components/Icons';

const WH_MODULES = [
  { id: 'catalog', title: 'Product Catalog', desc: 'Manage items, categories and packs', icon: <Icons.Catalog />, gradient: 'from-blue-600 to-indigo-700' },
  { id: 'entry', title: 'Product Entry', desc: 'Record inbound inventory receipts', icon: <Icons.Download />, gradient: 'from-emerald-600 to-teal-700' },
  { id: 'transfer', title: 'Product Transfer', desc: 'Transfer stock to other facilities', icon: <Icons.Upload />, gradient: 'from-amber-500 to-orange-600' },
  { id: 'receive', title: 'Product Receive', desc: 'Receive transferred stock items', icon: <Icons.Manifest />, gradient: 'from-cyan-600 to-blue-700' },
  { id: 'return', title: 'Product Return', desc: 'Process returned or unused items', icon: <Icons.Filter />, gradient: 'from-purple-600 to-pink-700' },
  { id: 'gap-damage', title: 'Gap & Damage', desc: 'Log missing or damaged goods securely', icon: <Icons.Trash />, gradient: 'from-rose-500 to-red-600' },
];

export default function WarehousePanelPage() {
  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500">
      
      <header className="flex h-16 bg-white border-b border-slate-200 items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Warehouse Management</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wide">Inventory Operations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          
          {WH_MODULES.map((mod) => (
            <Link 
              key={mod.id} 
              href={mod.id === 'catalog' ? '/catalog' : `/warehouse/${mod.id}`}
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