"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from './../../components/Icons';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function WarehouseSetupPage() {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form States
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [locationName, setLocationName] = useState('');
  const [gpsCoordinates, setGpsCoordinates] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const fetchWarehouses = async () => {
    setIsLoading(true);
    const { data } = await supabase.from('warehouses').select('*').order('created_at', { ascending: false });
    if (data) setWarehouses(data);
    setIsLoading(false);
  };

  const handleAddWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) return;

    if (editingId) {
      const { error } = await supabase
        .from('warehouses')
        .update({ name, code, location_name: locationName, gps_coordinates: gpsCoordinates })
        .eq('id', editingId);
        
      if (!error) {
         setWarehouses(warehouses.map(w => w.id === editingId ? { ...w, name, code, location_name: locationName, gps_coordinates: gpsCoordinates } : w));
         resetForm();
      } else {
         alert("Failed to update. Error: " + error.message);
      }
    } else {
      const { data, error } = await supabase
        .from('warehouses')
        .insert([{ 
          name, 
          code, 
          location_name: locationName,
          gps_coordinates: gpsCoordinates
        }])
        .select();

      if (!error && data) {
        setWarehouses([data[0], ...warehouses]);
        resetForm();
      } else {
        alert("Failed to add warehouse. Error: " + (error?.message || "Unknown error"));
      }
    }
  };

  const resetForm = () => {
    setName(''); setCode(''); setLocationName(''); setGpsCoordinates(''); setEditingId(null);
  };

  const handleEdit = (w: any) => {
    setEditingId(w.id);
    setName(w.name);
    setCode(w.code || '');
    setLocationName(w.location_name || '');
    setGpsCoordinates(w.gps_coordinates || '');
  };

  const handleDelete = async (id: string) => {
    if(!confirm("Are you sure? Deleting this might break connections if it has products.")) return;
    const { error } = await supabase.from('warehouses').delete().eq('id', id);
    if (!error) setWarehouses(warehouses.filter(w => w.id !== id));
  };

  return (
    <div className="flex flex-col h-full w-full animate-in fade-in duration-500">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">Warehouse Setup</h2>
          <p className="text-sm text-slate-500">Configure central and regional storage facilities</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Form Column */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm xl:col-span-1 h-fit">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center mr-3"><Icons.Upload /></div>
            Add Warehouse
          </h3>
          <form onSubmit={handleAddWarehouse} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Warehouse Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-rose-500 transition-colors" placeholder="e.g. Central WH Dhaka" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Warehouse Code</label>
              <input type="text" value={code} onChange={(e) => setCode(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-rose-500 transition-colors" placeholder="e.g. CWH-DHK-01" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Camp/Location Name</label>
              <input type="text" value={locationName} onChange={(e) => setLocationName(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-rose-500 transition-colors" placeholder="e.g. Mirpur Sector 10" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Warehouse Point GPS</label>
              <input type="text" value={gpsCoordinates} onChange={(e) => setGpsCoordinates(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-rose-500 transition-colors" placeholder="e.g. 23.8103, 90.4125" />
            </div>
            <button type="submit" className="w-full bg-gradient-to-r from-rose-500 to-red-600 text-white py-3 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all mt-2">
              {editingId ? 'Update Warehouse' : 'Save Warehouse'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-200 transition-all mt-2">
                Cancel Edit
              </button>
            )}
          </form>
        </div>

        {/* List Column */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm xl:col-span-2 overflow-hidden flex flex-col">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Warehouse Details</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Location & GPS</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={4} className="p-8 text-center"><Icons.Spinner /></td></tr>
                ) : warehouses.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-sm text-slate-500">No warehouses configured yet.</td></tr>
                ) : (
                  warehouses.map(w => (
                    <tr key={w.id} className="hover:bg-slate-50 group transition-colors">
                      <td className="p-4">
                        <p className="font-bold text-slate-900">{w.name}</p>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">Code: {w.code}</p>
                      </td>
                      <td className="p-4 text-sm text-slate-700">
                        <p className="font-medium">{w.location_name || 'N/A'}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{w.gps_coordinates || 'No GPS'}</p>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full mr-2 bg-emerald-500"></span>
                          {w.status || 'Active'}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button onClick={() => handleEdit(w)} className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors" title="Edit">
                          <Icons.Edit />
                        </button>
                        <button onClick={() => handleDelete(w.id)} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors" title="Delete">
                          <Icons.Trash />
                        </button>
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