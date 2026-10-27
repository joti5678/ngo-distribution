"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from './../../components/Icons';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function ProductHistoryPage() {
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUser(user);
    });
    fetchAuditLogs();
  }, []);

  const fetchAuditLogs = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('product_audit_logs')
      .select(`
        *,
        products (id, name, code, status)
      `)
      .order('created_at', { ascending: false });
    
    if (data) setAuditLogs(data);
    setIsLoading(false);
  };

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const handleRevertEdit = async (log: any) => {
    if(!confirm("Are you sure you want to revert to the previous data?")) return;
    
    const oldData = log.old_data;
    if(!oldData) return;

    // Restore old data (except ID and sort_order)
    const payload = {
      name: oldData.name,
      code: oldData.code,
      unit_type: oldData.unit_type,
      pieces_per_pack: oldData.pieces_per_pack,
      product_type: oldData.product_type,
      status: oldData.status || 'Active'
    };

    const { error } = await supabase.from('products').update(payload).eq('id', log.product_id);
    
    if (!error) {
       // Log this revert action
       await supabase.from('product_audit_logs').insert([{
         product_id: log.product_id, action: 'REVERT', old_data: log.new_data, new_data: payload,
         changed_by: currentUser?.id, changed_by_email: currentUser?.email
       }]);
       showMessage("Product data reverted successfully!");
       fetchAuditLogs();
    } else {
       showMessage("Revert failed. Error: " + error.message, "error");
    }
  };

  const handleRecoverDeleted = async (log: any) => {
    if(!confirm("Are you sure you want to recover this deleted product?")) return;

    // Clean up the _DEL_ append from the code
    const cleanCode = log.products?.code.split('_DEL_')[0];

    const { error } = await supabase.from('products').update({ status: 'Active', code: cleanCode }).eq('id', log.product_id);

    if (!error) {
       await supabase.from('product_audit_logs').insert([{
         product_id: log.product_id, action: 'RECOVER', old_data: log.products, new_data: { status: 'Active', code: cleanCode },
         changed_by: currentUser?.id, changed_by_email: currentUser?.email
       }]);
       showMessage("Product recovered and made Active successfully!");
       fetchAuditLogs();
    } else {
       showMessage("Recovery failed. The original product code might be taken by a new product.", "error");
    }
  };

  const handleExportExcel = () => {
    const exportData = filteredLogs.map(log => ({
      "Date & Time": new Date(log.created_at).toLocaleString(),
      "Action": log.action,
      "Product ID": log.product_id,
      "Current Name": log.products?.name || 'Unknown',
      "Current Code": log.products?.code || 'Unknown',
      "Current Status": log.products?.status || 'Unknown',
      "Changes / Details": JSON.stringify(log.new_data),
      "User": log.changed_by_email || 'System'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Audit_Logs");
    XLSX.writeFile(workbook, `Product_Audit_Logs.xlsx`);
  };

  const filteredLogs = auditLogs.filter(log => {
    const matchSearch = (log.products?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                        (log.products?.code || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchAction = filterAction === 'ALL' ? true : log.action === filterAction;
    return matchSearch && matchAction;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 relative">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 shadow-sm z-10">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Product History & Recovery</h2>
          <p className="text-sm text-slate-500 hidden md:block">Audit trail for catalog changes. Recover deleted items or revert edits.</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col space-y-4">
        
        {msg.text && (
          <div className={`p-4 rounded-xl shadow-md border text-sm font-bold flex justify-between items-center ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span>{msg.text}</span>
            <button onClick={() => setMsg({text:'', type:''})} className="p-1 rounded hover:bg-black/5"><Icons.Close /></button>
          </div>
        )}

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center shrink-0">
          <div className="flex space-x-3 w-full md:w-auto">
            <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500">
              <option value="ALL">All Actions</option>
              <option value="CREATE">Created</option>
              <option value="UPDATE">Updated / Edited</option>
              <option value="DELETE">Deleted</option>
              <option value="RECOVER">Recovered</option>
              <option value="REVERT">Reverted</option>
            </select>
            <div className="relative flex-1 md:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icons.Search /></div>
              <input type="text" placeholder="Search product..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500" />
            </div>
          </div>
          <button onClick={handleExportExcel} className="flex items-center px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-colors shadow-sm">
            <Icons.Download /> <span className="ml-1">Export Log</span>
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col">
          <div className="overflow-x-auto w-full flex-1">
            <table className="w-full text-left border-collapse table-auto min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Date & Time</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Action</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Product Name (Current)</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Details / Changes</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Interactive Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={5} className="p-10 text-center"><Icons.Spinner /></td></tr>
                ) : filteredLogs.length === 0 ? (
                  <tr><td colSpan={5} className="p-10 text-center text-sm text-slate-500 font-medium">No audit logs found.</td></tr>
                ) : (
                  filteredLogs.map((log) => {
                    const isDelete = log.action === 'DELETE';
                    const isUpdate = log.action === 'UPDATE';
                    const isCurrentlyDeleted = log.products?.status === 'Deleted';
                    
                    return (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 align-top">
                          <p className="font-bold text-slate-900 text-sm">{new Date(log.created_at).toLocaleDateString()}</p>
                          <p className="text-xs text-slate-500">{new Date(log.created_at).toLocaleTimeString()}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-1">{log.changed_by_email || 'System'}</p>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase ${
                            isDelete ? 'bg-rose-100 text-rose-700' :
                            isUpdate ? 'bg-amber-100 text-amber-700' :
                            'bg-indigo-100 text-indigo-700'
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <p className={`font-bold text-sm ${isCurrentlyDeleted ? 'text-rose-600 line-through' : 'text-slate-900'}`}>{log.products?.name || 'Unknown'}</p>
                          <p className="text-[10px] font-mono text-slate-500 mt-0.5">{log.products?.code || 'N/A'}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">Status: {log.products?.status}</p>
                        </td>
                        <td className="px-6 py-4 align-top">
                          {isUpdate && log.old_data && (
                            <div className="text-xs text-slate-600 space-y-1">
                              <p><span className="font-bold text-slate-400">Old Name:</span> {log.old_data.name}</p>
                              <p><span className="font-bold text-slate-900">New Name:</span> {log.new_data.name}</p>
                            </div>
                          )}
                          {isDelete && (
                            <p className="text-xs text-rose-600 font-medium">Product was soft-deleted from catalog.</p>
                          )}
                          {log.action === 'CREATE' && <p className="text-xs text-emerald-600 font-medium">New product added to catalog.</p>}
                          {(log.action === 'RECOVER' || log.action === 'REVERT') && <p className="text-xs text-indigo-600 font-medium">System restored previous state.</p>}
                        </td>
                        <td className="px-6 py-4 align-top text-right">
                           {isUpdate && (
                             <button onClick={() => handleRevertEdit(log)} className="px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 text-xs font-bold rounded-lg transition-colors shadow-sm">
                               Revert Edit
                             </button>
                           )}
                           {isDelete && isCurrentlyDeleted && (
                             <button onClick={() => handleRecoverDeleted(log)} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold rounded-lg transition-colors shadow-sm">
                               Recover Product
                             </button>
                           )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}