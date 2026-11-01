"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from '../../components/Icons';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function CurrentStockPage() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWh, setSelectedWh] = useState('');

  useEffect(() => {
    fetchStockData();
  }, []);

  const fetchStockData = async () => {
    setIsLoading(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        const sessionStr = localStorage.getItem('user_session');
        const sessionUser = sessionStr ? JSON.parse(sessionStr) : null;
        const roleName = (sessionUser?.user_roles?.role_name || '').toUpperCase();
        const isSuperAdmin = roleName.includes('SUPER ADMIN') || roleName === 'ADMIN' || roleName.includes('WEB ADMIN');

        // Bulletproof Logic for Fetching assigned_wh_ids
        let rawIds = sessionUser?.assigned_wh_ids;
        if (!rawIds && user?.id) {
            const { data: pData } = await supabase.from('profiles').select('assigned_wh_ids').eq('id', user.id).single();
            if (pData?.assigned_wh_ids) rawIds = pData.assigned_wh_ids;
            else {
                const { data: uData } = await supabase.from('users').select('assigned_wh_ids').eq('id', user.id).single();
                if (uData?.assigned_wh_ids) rawIds = uData.assigned_wh_ids;
            }
        }
        if (!rawIds && user?.user_metadata?.assigned_wh_ids) {
            rawIds = user.user_metadata.assigned_wh_ids;
        }

        let assignedIds: string[] = [];
        if (typeof rawIds === 'string') {
            try { assignedIds = JSON.parse(rawIds); } 
            catch { assignedIds = rawIds.split(','); }
        } else if (Array.isArray(rawIds)) {
            assignedIds = rawIds;
        } else if (rawIds && typeof rawIds === 'object') {
            assignedIds = Object.values(rawIds);
        }
        assignedIds = assignedIds.map(id => String(id).trim()).filter(id => id !== '');

        const { data: whs } = await supabase.from('warehouses').select('id, name, code').order('name');
        
        if (whs) {
            if (isSuperAdmin) {
                setWarehouses(whs);
            } else {
                setWarehouses(whs.filter(w => assignedIds.includes(String(w.id))));
            }
        }

        let query = supabase.from('inventory').select(`
            id, quantity, last_updated,
            warehouses (id, name, code),
            products (id, name, code, unit_type, product_type)
        `).gt('quantity', 0);

        if (!isSuperAdmin && assignedIds.length > 0) {
            query = query.in('warehouse_id', assignedIds);
        } else if (!isSuperAdmin && assignedIds.length === 0) {
            query = query.eq('warehouse_id', 'none'); 
        }

        const { data: invData } = await query.order('last_updated', { ascending: false });
        
        if (invData) {
            setInventory(invData);
        }

    } catch (err) {
        console.error("Error fetching stock:", err);
    }
    setIsLoading(false);
  };

  const handleExportExcel = () => {
    const exportData = filteredInventory.map(item => ({
        "Warehouse": item.warehouses?.name || 'Unknown',
        "WH Code": item.warehouses?.code || '',
        "Product Code": item.products?.code || 'N/A',
        "Product Name": item.products?.name || 'Unknown',
        "Type / Category": item.products?.product_type || 'N/A',
        "Available Stock": item.quantity,
        "Unit": item.products?.unit_type || '',
        "Last Updated": new Date(item.last_updated).toLocaleString()
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Current_Stock");
    XLSX.writeFile(workbook, `Current_Stock_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59); 
    doc.text("Warehouse Current Stock Report", 14, 15);
    
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139); 
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 21);

    const tableColumn = [
      "Warehouse", 
      "Product Details", 
      "Category", 
      "Available Stock", 
      "Last Updated"
    ];
    
    const tableRows: any[] = [];

    filteredInventory.forEach(item => {
      tableRows.push([
        `${item.warehouses?.name || 'Unknown'}\n[${item.warehouses?.code || ''}]`,
        `${item.products?.name || 'Unknown'}\nCode: ${item.products?.code || 'N/A'}`,
        item.products?.product_type || 'N/A',
        `${item.quantity} ${item.products?.unit_type || ''}`,
        new Date(item.last_updated).toLocaleString()
      ]);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 26,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    doc.save(`Current_Stock_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const filteredInventory = inventory.filter(item => {
    const q = searchQuery.toLowerCase();
    const matchSearch = 
        (item.products?.name || '').toLowerCase().includes(q) ||
        (item.products?.code || '').toLowerCase().includes(q) ||
        (item.warehouses?.name || '').toLowerCase().includes(q);
    
    const matchWh = selectedWh ? item.warehouses?.id === selectedWh : true;

    return matchSearch && matchWh;
  });

  const totalUniqueItems = filteredInventory.length;
  const totalUnits = filteredInventory.reduce((acc, curr) => acc + (curr.quantity || 0), 0);

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 relative">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 shadow-sm z-10 justify-between">
        <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900">Current Stock Overview</h2>
              <p className="text-sm text-slate-500 hidden md:block">Real-time inventory levels across your assigned warehouses</p>
            </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col space-y-6">
        
        {/* TOP STATS & FILTERS */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col xl:flex-row gap-6 justify-between items-start xl:items-center shrink-0">
            
            <div className="flex space-x-6">
                <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total Unique Items</p>
                    <p className="text-3xl font-black text-indigo-700">{totalUniqueItems}</p>
                </div>
                <div className="pl-6 border-l border-slate-200">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total Available Units</p>
                    <p className="text-3xl font-black text-emerald-600">{totalUnits}</p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                <div className="relative w-full sm:w-64">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icons.Search /></div>
                   <input 
                      type="text" 
                      placeholder="Search Product, Code..." 
                      value={searchQuery} 
                      onChange={(e) => setSearchQuery(e.target.value)} 
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 transition-colors shadow-inner" 
                   />
                </div>
                <select 
                   value={selectedWh} 
                   onChange={(e) => setSelectedWh(e.target.value)} 
                   className="w-full sm:w-48 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 transition-colors shadow-inner"
                >
                   <option value="">All Warehouses</option>
                   {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <div className="flex gap-2">
                    <button onClick={handleExportExcel} className="flex-1 sm:flex-none flex justify-center items-center px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-colors shadow-sm whitespace-nowrap">
                        <Icons.Download /> <span className="ml-1.5">Excel</span>
                    </button>
                    <button onClick={handleExportPDF} className="flex-1 sm:flex-none flex justify-center items-center px-4 py-2.5 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl hover:bg-rose-100 transition-colors shadow-sm whitespace-nowrap">
                        <Icons.Download /> <span className="ml-1.5">PDF</span>
                    </button>
                </div>
            </div>
        </div>

        {/* DATA TABLE */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden min-h-[500px]">
           <div className="overflow-x-auto w-full flex-1">
             <table className="w-full text-left border-collapse table-auto min-w-[800px]">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Product Name & Code</th>
                    <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Category</th>
                    <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Warehouse Location</th>
                    <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Available Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {isLoading ? (
                    <tr><td colSpan={4} className="p-10 text-center"><Icons.Spinner /></td></tr>
                  ) : filteredInventory.length === 0 ? (
                    <tr><td colSpan={4} className="p-10 text-center text-sm text-slate-500 font-medium">No stock available matching criteria.</td></tr>
                  ) : (
                    filteredInventory.map((item) => (
                        <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors group">
                          
                          <td className="px-5 py-4 align-middle">
                             <p className="font-bold text-slate-900 text-sm group-hover:text-indigo-700 transition-colors">{item.products?.name || 'Unknown'}</p>
                             <p className="text-[10px] text-slate-500 font-mono mt-0.5">Code: <span className="font-bold text-slate-700">{item.products?.code || 'N/A'}</span></p>
                          </td>
                          
                          <td className="px-5 py-4 align-middle">
                             <span className={`text-[9px] font-bold px-2 py-1 rounded-full border uppercase ${item.products?.product_type === 'LPG' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                               {item.products?.product_type || 'N/A'}
                             </span>
                          </td>

                          <td className="px-5 py-4 align-middle">
                             <div className="flex items-center space-x-2">
                                <span className="text-xl opacity-50">🏢</span>
                                <div>
                                   <p className="font-bold text-slate-800 text-sm">{item.warehouses?.name || 'Unknown'}</p>
                                   <p className="text-[10px] text-slate-400 mt-0.5 font-bold uppercase">{item.warehouses?.code}</p>
                                </div>
                             </div>
                          </td>
                          
                          <td className="px-5 py-4 text-right align-middle">
                             <div className="flex flex-col items-end justify-center">
                               <div className="flex items-baseline space-x-1.5">
                                 <span className={`font-black text-2xl ${item.quantity < 10 ? 'text-rose-600' : 'text-emerald-600'}`}>{item.quantity}</span>
                                 <span className="text-[11px] font-bold text-slate-500 uppercase">{item.products?.unit_type}</span>
                               </div>
                               {item.quantity < 10 && <span className="text-[9px] font-bold bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded border border-rose-100 mt-1 inline-block uppercase animate-pulse">Low Stock</span>}
                             </div>
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
