"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from './../../components/Icons';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function DPSetupPage() {
  const [points, setPoints] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form States
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [locationName, setLocationName] = useState('');
  const [gpsCoordinates, setGpsCoordinates] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchPoints();
  }, []);

  const fetchPoints = async () => {
    setIsLoading(true);
    const { data } = await supabase.from('distribution_points').select('*').order('created_at', { ascending: false });
    if (data) setPoints(data);
    setIsLoading(false);
  };

  const handleAddPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) return;

    if (editingId) {
      const { error } = await supabase
        .from('distribution_points')
        .update({ name, code, location_name: locationName, gps_coordinates: gpsCoordinates })
        .eq('id', editingId);
        
      if (!error) {
         setPoints(points.map(p => p.id === editingId ? { ...p, name, code, location_name: locationName, gps_coordinates: gpsCoordinates } : p));
         resetForm();
      } else {
         alert("Failed to update. Error: " + error.message);
      }
    } else {
      const { data, error } = await supabase
        .from('distribution_points')
        .insert([{ 
          name, 
          code, 
          location_name: locationName,
          gps_coordinates: gpsCoordinates
        }])
        .select();

      if (!error && data) {
        setPoints([data[0], ...points]);
        resetForm();
      } else {
        alert("Failed to add distribution point. Error: " + (error?.message || "Unknown error"));
      }
    }
  };

  const resetForm = () => {
    setName(''); setCode(''); setLocationName(''); setGpsCoordinates(''); setEditingId(null);
  };

  const handleEdit = (dp: any) => {
    setEditingId(dp.id);
    setName(dp.name);
    setCode(dp.code || '');
    setLocationName(dp.location_name || '');
    setGpsCoordinates(dp.gps_coordinates || '');
  };

  const handleDelete = async (id: string) => {
    if(!confirm("Are you sure? Deleting this might affect active manifests.")) return;
    const { error } = await supabase.from('distribution_points').delete().eq('id', id);
    if (!error) setPoints(points.filter(p => p.id !== id));
  };

  return (
    <div className="flex flex-col h-full w-full animate-in fade-in duration-500">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">Distribution Points</h2>
          <p className="text-sm text-slate-500">Create and manage field distribution locations</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Form Column */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm xl:col-span-1 h-fit">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mr-3"><Icons.Manifest /></div>
            Add New Point
          </h3>
          <form onSubmit={handleAddPoint} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Distribution Point Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-amber-500 transition-colors" placeholder="e.g. Balukhali Camp 9" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Distribution Point Code</label>
              <input type="text" value={code} onChange={(e) => setCode(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-amber-500 transition-colors" placeholder="e.g. DP-BLK-09" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Camp/Location Name</label>
              <input type="text" value={locationName} onChange={(e) => setLocationName(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-amber-500 transition-colors" placeholder="e.g. Camp 9, Block A" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Distribution Point GPS</label>
              <input type="text" value={gpsCoordinates} onChange={(e) => setGpsCoordinates(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-amber-500 transition-colors" placeholder="e.g. 21.1938, 92.1487" />
            </div>
            <button type="submit" className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white py-3 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all mt-2">
              {editingId ? 'Update Location' : 'Save Location'}
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
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Point Details</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Location & GPS</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={4} className="p-8 text-center"><Icons.Spinner /></td></tr>
                ) : points.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-sm text-slate-500">No distribution points configured yet.</td></tr>
                ) : (
                  points.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 group transition-colors">
                      <td className="p-4">
                        <p className="font-bold text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">Code: {p.code}</p>
                      </td>
                      <td className="p-4 text-sm text-slate-700">
                        <p className="font-medium">{p.location_name || 'N/A'}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{p.gps_coordinates || 'No GPS'}</p>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full mr-2 bg-emerald-500"></span>
                          {p.status || 'Active'}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button onClick={() => handleEdit(p)} className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors" title="Edit">
                          <Icons.Edit />
                        </button>
                        <button onClick={() => handleDelete(p.id)} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors" title="Delete">
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