"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './../../components/Icons';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

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

  // Bulk Upload States
  const [isBulkPreviewOpen, setIsBulkPreviewOpen] = useState(false);
  const [bulkData, setBulkData] = useState<any[]>([]);
  const [invalidRows, setInvalidRows] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
         alert("Distribution Point updated successfully!");
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
          // Removed status field assumption
        }])
        .select();

      if (!error && data) {
        setPoints([data[0], ...points]);
        resetForm();
        alert("Distribution Point created successfully!");
      } else {
        alert("Failed to add point. Error: " + (error?.message || "Unknown error"));
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
    if(!confirm("Are you sure? Deleting this might break connections if it has active manifests.")) return;
    const { error } = await supabase.from('distribution_points').delete().eq('id', id);
    if (!error) {
        setPoints(points.filter(p => p.id !== id));
        alert("Distribution Point deleted!");
    } else {
        alert("Delete failed: " + error.message);
    }
  };

  // --- EXCEL BULK UPLOAD LOGIC ---
  const downloadDemoExcel = () => {
    const ws = XLSX.utils.json_to_sheet([
        { "DP Name": "Camp 9 DP", "DP Code": "DP-C09-01", "Location": "Block A", "GPS": "21.19, 92.14" },
        { "DP Name": "Camp 10 DP", "DP Code": "DP-C10-02", "Location": "Block C", "GPS": "21.20, 92.15" }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Distribution_Points");
    XLSX.writeFile(wb, "DP_Upload_Format.xlsx");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        const validItems: any[] = [];
        const invalidItems: any[] = [];

        rows.forEach((row: any, index: number) => {
          const pName = (row["DP Name"] || row["Name"] || row["name"] || "").toString().trim();
          const pCode = (row["DP Code"] || row["Code"] || row["code"] || "").toString().trim();
          const pLoc = (row["Location"] || row["location"] || "").toString().trim();
          const pGps = (row["GPS"] || row["gps"] || "").toString().trim();

          if (!pName || !pCode) {
              invalidItems.push({ row: index + 2, details: `Name: ${pName}, Code: ${pCode}`, error: "Name and Code are required" });
              return;
          }
          
          if (points.some(p => p.code.toLowerCase() === pCode.toLowerCase())) {
              invalidItems.push({ row: index + 2, details: `Code: ${pCode}`, error: "Duplicate code in database" });
              return;
          }

          validItems.push({ name: pName, code: pCode, location_name: pLoc, gps_coordinates: pGps });
        });

        setBulkData(validItems);
        setInvalidRows(invalidItems);
        setIsBulkPreviewOpen(true);

      } catch (err) {
        alert("Failed to read Excel file. Please use the demo format.");
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = ''; 
  };

  const confirmBulkUpload = async () => {
    setIsLoading(true);
    const inserts = bulkData.map(item => ({
        name: item.name,
        code: item.code,
        location_name: item.location_name,
        gps_coordinates: item.gps_coordinates
    }));

    const { data, error } = await supabase.from('distribution_points').insert(inserts).select();
    
    if (error) {
        alert("Error inserting data: " + error.message);
    } else if (data) {
        alert(`${data.length} Distribution Points added successfully!`);
        setPoints([...data, ...points]);
        setIsBulkPreviewOpen(false);
        setBulkData([]);
    }
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-full w-full animate-in fade-in duration-500">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center justify-between px-4 md:px-6 shrink-0 shadow-sm z-10">
        <div className="flex items-center">
          <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800">Distribution Points</h2>
            <p className="text-sm text-slate-500 hidden md:block">Create and manage field distribution locations</p>
          </div>
        </div>

        {/* Excel Upload Buttons */}
        <div className="flex space-x-2">
            <button onClick={downloadDemoExcel} className="hidden sm:flex bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold py-2 px-3 rounded-lg text-xs shadow-sm items-center transition-colors">
                <Icons.Download /> <span className="ml-1">Demo Format</span>
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded-lg text-xs shadow-sm flex items-center transition-colors">
                <span className="mr-1 text-base">📊</span> Bulk Upload
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" className="hidden" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Form Column */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm xl:col-span-1 h-fit">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mr-3"><Icons.Manifest /></div>
            {editingId ? 'Edit DP' : 'Add New DP'}
          </h3>
          <form onSubmit={handleAddPoint} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">DP Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-amber-500 transition-colors font-bold" placeholder="e.g. Balukhali Camp 9" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">DP Code *</label>
              <input type="text" value={code} onChange={(e) => setCode(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-amber-500 transition-colors font-bold" placeholder="e.g. DP-BLK-09" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Camp/Location Name</label>
              <input type="text" value={locationName} onChange={(e) => setLocationName(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-amber-500 transition-colors" placeholder="e.g. Camp 9, Block A" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">GPS Coordinates</label>
              <input type="text" value={gpsCoordinates} onChange={(e) => setGpsCoordinates(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-amber-500 transition-colors" placeholder="e.g. 21.1938, 92.1487" />
            </div>
            <button type="submit" className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white py-3 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all mt-2">
              {editingId ? '💾 Update Location' : '✅ Save Location'}
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
          <div className="overflow-x-auto w-full custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Point Details</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Location & GPS</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={4} className="p-10 text-center"><Icons.Spinner /></td></tr>
                ) : points.length === 0 ? (
                  <tr><td colSpan={4} className="p-10 text-center text-sm text-slate-500 font-bold">No distribution points configured yet.</td></tr>
                ) : (
                  points.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 group transition-colors">
                      <td className="p-4">
                        <p className="font-bold text-slate-900">{p.name}</p>
                        <p className="text-xs text-amber-600 font-mono font-bold mt-0.5">Code: {p.code}</p>
                      </td>
                      <td className="p-4 text-sm text-slate-700">
                        <p className="font-bold">{p.location_name || 'N/A'}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{p.gps_coordinates || 'No GPS'}</p>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200 uppercase">
                          <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-emerald-500"></span>
                          {p.status || 'Active'}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button onClick={() => handleEdit(p)} className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors border border-transparent hover:border-indigo-100" title="Edit">
                          <Icons.Edit />
                        </button>
                        <button onClick={() => handleDelete(p.id)} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors border border-transparent hover:border-rose-100" title="Delete">
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

      {/* --- EXCEL PREVIEW MODAL --- */}
      {isBulkPreviewOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[80vh] animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-black text-slate-900 text-lg">Excel Import Validation</h3>
                <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-widest">{bulkData.length} Valid | {invalidRows.length} Invalid</p>
              </div>
              <button onClick={() => setIsBulkPreviewOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-2 rounded-lg border border-slate-200 shadow-sm"><Icons.Close /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar space-y-6">
                
                {invalidRows.length > 0 && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-rose-100 px-4 py-2 font-bold text-[10px] text-rose-800 uppercase border-b border-rose-200 flex justify-between">Errors Found (Will be ignored)</div>
                        <ul className="p-4 space-y-2 text-xs font-medium text-rose-600">
                            {invalidRows.map((err, i) => (
                                <li key={i} className="flex space-x-2">
                                    <span className="font-bold">Row {err.row}:</span>
                                    <span>{err.details}</span>
                                    <span className="text-rose-400">- {err.error}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {bulkData.length > 0 ? (
                    <div className="border border-amber-200 rounded-xl overflow-hidden bg-white shadow-sm">
                        <div className="bg-amber-50 px-4 py-2 font-bold text-[10px] text-amber-800 uppercase border-b border-amber-100 flex justify-between">
                            <span>Valid DPs Ready to Add</span>
                            <span>{bulkData.length} Items</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[500px]">
                                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-2">Name</th>
                                        <th className="px-4 py-2">Code</th>
                                        <th className="px-4 py-2">Location</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {bulkData.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="px-4 py-2 text-xs font-bold text-slate-800">{item.name}</td>
                                            <td className="px-4 py-2 font-mono font-bold text-xs text-rose-600">{item.code}</td>
                                            <td className="px-4 py-2 text-xs font-medium text-slate-600">{item.location_name || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="text-center p-10 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-xl">No valid DPs found in the file.</div>
                )}
            </div>

            <div className="p-5 border-t border-slate-200 bg-white shrink-0 flex justify-end space-x-3">
                <button onClick={() => setIsBulkPreviewOpen(false)} className="px-6 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-slate-50 transition-colors text-sm">Cancel</button>
                <button onClick={confirmBulkUpload} disabled={bulkData.length === 0 || isLoading} className="px-6 py-2.5 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 shadow-md transition-colors text-sm disabled:opacity-50 flex items-center">
                    {isLoading ? <Icons.Spinner /> : `Save ${bulkData.length} DPs`}
                </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}