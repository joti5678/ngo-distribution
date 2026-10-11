"use client";

import React, { useEffect, useState } from 'react';
import { Icons } from './components/Icons';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function Dashboard() {
  const [stats, setStats] = useState({ users: 0, products: 0, manifests: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
      const { count: manifestCount } = await supabase.from('manifests').select('*', { count: 'exact', head: true });
      
      setStats({
        users: userCount || 0,
        products: productCount || 0,
        manifests: manifestCount || 0
      });
      setLoading(false);
    }
    loadStats();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full w-full"><Icons.Spinner /></div>;

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center justify-between px-4 md:px-8 shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">System Dashboard</h2>
          <p className="text-xs md:text-sm text-slate-500">Overview of NGO Connect Operations</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center"><Icons.Users /></div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Users</p>
              <h3 className="text-2xl font-bold text-slate-900">{stats.users}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><Icons.Catalog /></div>
            <div>
              <p className="text-sm font-medium text-slate-500">Products in Catalog</p>
              <h3 className="text-2xl font-bold text-slate-900">{stats.products}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center"><Icons.Manifest /></div>
            <div>
              <p className="text-sm font-medium text-slate-500">Active Manifests</p>
              <h3 className="text-2xl font-bold text-slate-900">{stats.manifests}</h3>
            </div>
          </div>

        </div>

        <div className="mt-8 bg-indigo-600 rounded-3xl p-8 text-white shadow-xl bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-blend-overlay">
           <h2 className="text-2xl md:text-3xl font-bold mb-2">Welcome to NGO Connect</h2>
           <p className="text-indigo-100 max-w-xl text-sm md:text-base">
             Manage your entire distribution ecosystem from one centralized platform. Access the modules from the sidebar to create catalogs, manage warehouses, and track real-time distribution manifests.
           </p>
        </div>
      </div>
    </div>
  );
}