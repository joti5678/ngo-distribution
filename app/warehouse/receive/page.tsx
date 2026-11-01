"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from '../../components/Icons';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function FreshProductReceivePage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [allWarehouses, setAllWarehouses] = useState<any[]>([]);
  const [assignedWarehouses, setAssignedWarehouses] = useState<any[]>([]);
  
  const [selectedWhId, setSelectedWhId] = useState<string>('');
  const [historyList, setHistoryList] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Modals
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);

  useEffect(() => {
    fetchInitialSetup();
  }, []);

  // When selected warehouse changes, fetch its receives
  useEffect(() => {
    if (selectedWhId) {
      loadReceivesForWarehouse(selectedWhId);
    } else {
      setHistoryList([]);
    }
  }, [selectedWhId]);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  // 1. INITIALIZATION LOGIC
  const fetchInitialSetup = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUser(user);

      // Fetch all WHs for mapping names later
      const { data: whData } = await supabase.from('warehouses').select('id, name, code').order('name');
      const whList = whData || [];
      setAllWarehouses(whList);

      // Check Role
      const { data: profile } = await supabase.from('profiles').select('role_id, user_roles(role_name)').eq('id', user.id).single();
      const roleName = String(profile?.user_roles?.role_name || '').toUpperCase();
      const isSuperAdmin = roleName.includes('SUPER ADMIN') || roleName === 'ADMIN' || roleName.includes('WEB ADMIN');

      let allowedWhs: any[] = [];

      if (isSuperAdmin) {
          allowedWhs = whList;
      } else {
          // Fetch strictly from new user_warehouses table
          const { data: mapping } = await supabase.from('user_warehouses').select('warehouse_id').eq('user_id', user.id);
          const assignedIds = mapping ? mapping.map(m => m.warehouse_id) : [];
          allowedWhs = whList.filter(w => assignedIds.includes(w.id));
      }

      setAssignedWarehouses(allowedWhs);

      if (allowedWhs.length > 0) {
          setSelectedWhId(allowedWhs[0].id); // Auto-select first WH
      }

    } catch (error: any) {
      showMessage(error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // 2. FETCH HISTORY DATA
  const loadReceivesForWarehouse = async (whId: string) => {
    setIsFetchingData(true);
    try {
        // Fetch History (IN transactions tied to a transfer)
        const { data: history } = await supabase.from('inventory_transactions')
            .select(`
                *,
                products (name, code, unit_type),
                stock_transfers (from_warehouse_id)
            `)
            .eq('warehouse_id', whId)
            .eq('transaction_type', 'IN')
            .not('transfer_id', 'is', null) // Ensures it's from a transfer
            .order('created_at', { ascending: false })
            .limit(150);

        setHistoryList(history || []);
    } catch (error) {
        console.error(error);
    } finally {
        setIsFetchingData(false);
    }
  };

  // Helper to get WH Name safely
  const getWhName = (id: string) => {
      if (!id) return 'Unknown Source';
      const wh = allWarehouses.find(w => w.id === id);
      return wh ? wh.name : 'Unknown Warehouse';
  };

  // UI RENDER
  if (isLoading) return <div className="flex-1 flex items-center justify-center bg-slate-50"><Icons.Spinner /></div>;

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in relative">
      
      {/* HEADER */}
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-6 shrink-0 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Internal Product Receive</h2>
      </header>

      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        
        {/* TOAST MESSAGE */}
        {msg.text && (
          <div className={`p-4 rounded-xl shadow-md border text-sm font-bold flex items-center shrink-0 fixed top-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="mr-2">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}
          </div>
        )}

        {/* TOP FILTER CARD */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="w-full sm:w-1/2 lg:w-1/3">
                <label className="block text-xs font-bold text-indigo-600 uppercase mb-2">Target Warehouse</label>
                <select 
                    value={selectedWhId} 
                    onChange={(e) => setSelectedWhId(e.target.value)} 
                    className="w-full px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-bold text-indigo-900 outline-none focus:border-indigo-500"
                >
                    {assignedWarehouses.length === 0 ? <option value="">-- No Access to any WH --</option> : null}
                    {assignedWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
            </div>
            <div className="text-right">
                <p className="text-xs text-slate-500 font-bold uppercase">Total Received Items</p>
                <p className="text-2xl font-black text-emerald-600">{historyList.length}</p>
            </div>
        </div>

        {/* Info Banner */}
        <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl flex items-start space-x-3 shadow-sm">
            <div className="text-indigo-500 mt-0.5"><Icons.Manifest /></div>
            <div>
               <h4 className="text-sm font-bold text-indigo-900">Direct Store Enabled</h4>
               <p className="text-xs text-indigo-700 mt-1">Pending approval has been removed. Products transferred from other warehouses are now automatically stored in your inventory.</p>
            </div>
        </div>

        {/* HISTORY SECTION */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
           <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center"><span className="mr-2">🕒</span> Recent Receives</h3>
           </div>
           <div className="p-4 bg-slate-50/30 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                 <thead className="border-b border-slate-200">
                    <tr>
                       <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase">Date & TXN</th>
                       <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase">Source</th>
                       <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase">Product</th>
                       <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase text-right">Received Qty</th>
                       <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase text-center">Action</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                    {isFetchingData ? (
                        <tr><td colSpan={5} className="text-center p-6"><Icons.Spinner /></td></tr>
                    ) : historyList.length === 0 ? (
                        <tr><td colSpan={5} className="text-center p-8 bg-white text-slate-500 font-bold text-sm rounded-b-xl">No receive history found for this warehouse.</td></tr>
                    ) : (
                        historyList.map(h => (
                           <tr key={h.id} className="bg-white hover:bg-slate-50 transition-colors">
                              <td className="py-3 px-4">
                                 <p className="text-sm font-bold text-slate-900">{new Date(h.created_at).toLocaleDateString()}</p>
                                 <p className="text-[10px] text-indigo-600 font-bold mt-0.5 font-mono">TXN-{h.transfer_id ? h.transfer_id.split('-')[0].toUpperCase() : ''}</p>
                              </td>
                              <td className="py-3 px-4 text-sm font-bold text-slate-700">
                                 {getWhName(h.stock_transfers?.from_warehouse_id)}
                              </td>
                              <td className="py-3 px-4 text-sm font-bold text-slate-800">
                                 {h.products?.name}
                              </td>
                              <td className="py-3 px-4 text-right">
                                 <span className="text-emerald-600 font-black text-lg">+{h.quantity}</span>
                                 <span className="text-[10px] font-bold text-slate-500 ml-1 uppercase">{h.products?.unit_type}</span>
                              </td>
                              <td className="py-3 px-4 text-center">
                                 <button onClick={() => {setSelectedTransaction(h); setDetailsModalOpen(true);}} className="text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors border border-indigo-200 shadow-sm">
                                   View Details
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

      {/* --- DETAILS MODAL --- */}
      {detailsModalOpen && selectedTransaction && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="font-black text-slate-900 text-lg">Transaction Details</h3>
              <button onClick={() => setDetailsModalOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-2 rounded-lg border border-slate-200 shadow-sm"><Icons.Close /></button>
            </div>
            <div className="p-6 space-y-5">
               <div>
                 <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Transaction ID & Date</p>
                 <p className="font-black text-indigo-700 text-lg">
                   {selectedTransaction.transfer_id ? `TXN-${selectedTransaction.transfer_id.split('-')[0].toUpperCase()}` : `TXN-${selectedTransaction.id.split('-')[0].toUpperCase()}`}
                 </p>
                 <p className="text-xs font-bold text-slate-500 mt-1">{new Date(selectedTransaction.created_at).toLocaleString()}</p>
               </div>
               
               <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4 shadow-sm">
                 <div>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Product</p>
                   <p className="font-bold text-slate-900 text-sm mt-0.5">{selectedTransaction.products?.name}</p>
                 </div>
                 
                 <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                   <div>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quantity Received</p>
                     <p className="font-black text-emerald-600 text-xl mt-0.5">+{selectedTransaction.quantity} <span className="text-[10px] font-bold text-slate-500 uppercase ml-1">{selectedTransaction.products?.unit_type}</span></p>
                   </div>
                   <div className="text-right">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PO / Ref No</p>
                     <p className="font-bold text-slate-800 text-sm mt-0.5">{selectedTransaction.reference_no || 'N/A'}</p>
                   </div>
                 </div>

                 <div className="flex justify-between items-start pt-4 border-t border-slate-200">
                   <div className="flex-1 pr-3">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Source / From</p>
                     <p className="font-bold text-slate-800 text-sm mt-0.5">{getWhName(selectedTransaction.stock_transfers?.from_warehouse_id)}</p>
                   </div>
                   <div className="text-right flex-1 pl-3 border-l border-slate-200">
                     <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Target Warehouse</p>
                     <p className="font-bold text-indigo-900 text-sm mt-0.5">{getWhName(selectedTransaction.warehouse_id)}</p>
                   </div>
                 </div>
               </div>

               <div>
                 <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Remarks & Audit</p>
                 <p className="text-sm font-medium text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200 leading-relaxed">{selectedTransaction.remarks || 'No remarks provided.'}</p>
                 <p className="text-[10px] font-bold text-slate-400 mt-2 font-mono bg-slate-100 inline-block px-2 py-1 rounded">Logged by: {selectedTransaction.created_by_email || 'System'}</p>
               </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}