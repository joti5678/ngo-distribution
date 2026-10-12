"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icons } from './components/Icons';

const HOME_MODULES = [
  { id: 'tasks', title: 'Tasks & Groups', desc: 'Assign and manage team tasks effectively', icon: <Icons.Users />, gradient: 'from-blue-600 to-indigo-700' },
  { id: 'messaging', title: 'Internal Messaging', desc: 'Communicate with groups or specific users', icon: <Icons.Filter />, gradient: 'from-emerald-500 to-teal-700' },
  { id: 'distribution-progress', title: 'Distribution Progress', desc: 'Track manifest achievement & remaining items', icon: <Icons.Manifest />, gradient: 'from-orange-500 to-amber-600' },
];

export default function Dashboard() {
  const [stats, setStats] = useState({ users: 0, products: 0, manifests: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      setStats({ users: 12, products: 45, manifests: 3 });
      setLoading(false);
    }
    loadStats();
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500">
      
      <header className="flex h-16 bg-white border-b border-slate-200 items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Home Dashboard</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        
        {/* Top Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Icons.Users /></div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total Users</p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">{loading ? '...' : stats.users}</h3>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><Icons.Catalog /></div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Products</p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">{loading ? '...' : stats.products}</h3>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><Icons.Manifest /></div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Manifests</p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">{loading ? '...' : stats.manifests}</h3>
            </div>
          </div>
        </div>

        {/* Medium Multi-Color Module Cards */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wide">Operations & Communication</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {HOME_MODULES.map((mod) => (
              <Link 
                key={mod.id} 
                href={`/${mod.id}`}
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
    </div>
  );
}