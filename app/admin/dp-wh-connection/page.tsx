"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from './../../components/Icons';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function ConnectionPage() {
  const [points, setPoints] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    
    // Fetch DPs and Warehouses
    const [dpRes, whRes] = await Promise.all([
      supabase.from('distribution_points').select('*').order('created_at', { ascending: false }),
      supabase.from('warehouses').select('id, name, code').order('name', { ascending: true })
    ]);

    if (dpRes.data) setPoints(dpRes.data);
    if (whRes.data) setWarehouses(whRes.data);
    
    setIsLoading(false);
  };

  const handleUpdateConnection = async (dpId: string, warehouseId: string, type: 'NFI' | 'LPG') => {
    setSavingId(`${dpId}-${type}`);
    
    const updatePayload = type === 'NFI' 
      ? { nfi_warehouse_id: warehouseId || null }
      : { lpg_warehouse_id: warehouseId || null };

    const { error } = await supabase
      .from('distribution_points')
      .update(updatePayload)
      .eq('id', dpId);

    if (!error) {
      setPoints(points.map(p => {
        if (p.id === dpId) {
           return { ...p, ...updatePayload };
        }
        return p;
      }));
    } else {
      alert("Failed to update connection. Error: " + (error.message));
    }
    
    setTimeout(() => setSavingId(null), 500); 
  };

  return (
    <div className="flex flex-col h-full w-full animate-in fade-in duration-500">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">DP & Warehouse Mapping</h2>
          <p className="text-sm text-slate-500">Map specific LPG and NFI source warehouses for each Distribution Point</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 w-full">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-5 text-xs font-bold text-slate-500 uppercase">Distribution Point</th>
                  <th className="p-5 text-xs font-bold text-slate-500 uppercase border-l border-slate-200">NFI Source Warehouse</th>
                  <th className="p-5 text-xs font-bold text-slate-500 uppercase border-l border-slate-200">LPG Source Warehouse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={3} className="p-10 text-center"><Icons.Spinner /></td></tr>
                ) : points.length === 0 ? (
                  <tr><td colSpan={3} className="p-10 text-center text-sm text-slate-500 font-medium">No Distribution Points found.</td></tr>
                ) : (
                  points.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-5">
                        <div className="flex items-center space-x-3">
                           <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                             <Icons.Manifest />
                           </div>
                           <div>
                             <p className="font-bold text-slate-900">{p.name}</p>
                             <p className="text-xs text-slate-500 mt-0.5 font-mono">Code: {p.code}</p>
                           </div>
                        </div>
                      </td>
                      
                      {/* NFI Mapping */}
                      <td className="p-5 border-l border-slate-100 bg-emerald-50/20">
                        <select 
                          value={p.nfi_warehouse_id || ''} 
                          onChange={(e) => handleUpdateConnection(p.id, e.target.value, 'NFI')}
                          className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm font-bold outline-none transition-all cursor-pointer ${
                            p.nfi_warehouse_id ? 'border-emerald-300 text-emerald-800' : 'border-slate-200 text-slate-500'
                          }`}
                        >
                          <option value="">-- No NFI Source --</option>
                          {warehouses.map(w => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
                        </select>
                        {savingId === `${p.id}-NFI` && <p className="text-[10px] text-emerald-600 font-bold mt-1 animate-pulse">Saving NFI link...</p>}
                      </td>

                      {/* LPG Mapping */}
                      <td className="p-5 border-l border-slate-100 bg-orange-50/20">
                        <select 
                          value={p.lpg_warehouse_id || ''} 
                          onChange={(e) => handleUpdateConnection(p.id, e.target.value, 'LPG')}
                          className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm font-bold outline-none transition-all cursor-pointer ${
                            p.lpg_warehouse_id ? 'border-orange-300 text-orange-800' : 'border-slate-200 text-slate-500'
                          }`}
                        >
                          <option value="">-- No LPG Source --</option>
                          {warehouses.map(w => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
                        </select>
                        {savingId === `${p.id}-LPG` && <p className="text-[10px] text-orange-600 font-bold mt-1 animate-pulse">Saving LPG link...</p>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}