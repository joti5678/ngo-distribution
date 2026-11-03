"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from './../../components/Icons'; 
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function ReconciliationPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  // Filters
  const [selectedWh, setSelectedWh] = useState('ALL'); 
  const [filterDate, setFilterDate] = useState('');

  // Column Filters
  const [filterProductName, setFilterProductName] = useState('');
  const [filterProductCode, setFilterProductCode] = useState('');
  const [filterDifference, setFilterDifference] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const [reconciliationData, setReconciliationData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const [summary, setSummary] = useState({ total: 0, matched: 0, mismatched: 0, missing: 0 });

  useEffect(() => {
    const today = new Date();
    const dateStr = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    setFilterDate(dateStr);
    fetchInitialData();
  }, []);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setCurrentUser(user);

        const sessionStr = localStorage.getItem('user_session');
        const sessionUser = sessionStr ? JSON.parse(sessionStr) : null;

        let profile = null;
        if (user) {
            const { data } = await supabase.from('profiles').select('*, user_roles(role_name)').eq('id', user.id).single();
            profile = data;
        }

        const dbRoleName = String(profile?.user_roles?.role_name || profile?.role || sessionUser?.role || '').toUpperCase();
        const isSuperAdmin = dbRoleName.includes('SUPER ADMIN') || dbRoleName === 'ADMIN' || dbRoleName.includes('WEB ADMIN');

        const sessionWhIds = sessionUser?.assigned_wh_ids || [];

        const { data: whData } = await supabase.from('warehouses').select('id, name, code').order('name');
        const allWhs = whData || [];

        const myWhs = isSuperAdmin ? allWhs : allWhs.filter(w => sessionWhIds.includes(w.id));
        setWarehouses(myWhs);
    } catch (err) {
        console.error("Error fetching initial data", err);
    }
    setIsLoading(false);
  };

  const handleApplyFilters = () => {
     if (!selectedWh) {
         showMessage("Please select a warehouse first.", "error");
         return;
     }
     loadReconciliationData(warehouses, selectedWh, filterDate);
  };

  const loadReconciliationData = async (whList: any[], targetWhId: string, targetDate: string) => {
    setIsLoading(true);
    try {
      const targetWhIds = targetWhId === 'ALL' ? whList.map(w => w.id) : [targetWhId];
      const targetWhCodes = targetWhId === 'ALL' ? whList.map(w => w.code) : [whList.find(w => w.id === targetWhId)?.code].filter(Boolean);

      if (targetWhIds.length === 0) {
         setReconciliationData([]);
         setSummary({ total: 0, matched: 0, mismatched: 0, missing: 0 });
         setIsLoading(false);
         return;
      }

      // 1. Fetch all active products
      const { data: allProducts } = await supabase.from('products').select('id, name, code, unit_type, product_type').eq('status', 'Active');

      // 2. ONLY fetch products that are physically mapped/available in the target warehouse's inventory
      const { data: invData } = await supabase.from('inventory').select('product_id').in('warehouse_id', targetWhIds);
      const whProductIds = new Set(invData?.map(i => i.product_id) || []);

      const products = (allProducts || []).filter(p => whProductIds.has(p.id));

      if (products.length === 0) {
         setReconciliationData([]);
         setSummary({ total: 0, matched: 0, mismatched: 0, missing: 0 });
         setIsLoading(false);
         return;
      }

      // 3. Fetch historical transactions up to selected date for closing balance
      const endDate = new Date(targetDate);
      endDate.setHours(23, 59, 59, 999);
      const endDateIso = endDate.toISOString();

      const { data: txns } = await supabase
        .from('inventory_transactions')
        .select('product_id, transaction_type, quantity')
        .in('warehouse_id', targetWhIds)
        .lte('created_at', endDateIso);

      const internalStockMap: Record<string, number> = {};
      products.forEach(p => { internalStockMap[p.id] = 0; });

      txns?.forEach(t => {
        if (internalStockMap[t.product_id] !== undefined) {
            if (t.transaction_type === 'IN') internalStockMap[t.product_id] += Number(t.quantity);
            if (t.transaction_type === 'OUT') internalStockMap[t.product_id] -= Number(t.quantity);
        }
      });

      // 4. Fetch CUBOID Stock from the donor table
      const { data: donorStocks } = await supabase
        .from('donor_warehouse_stock')
        .select('product_code, quantity, fetch_date')
        .in('warehouse_code', targetWhCodes)
        .eq('stock_date', targetDate);

      const donorStockMap: Record<string, { qty: number, fetch_date: string }> = {};
      donorStocks?.forEach(d => {
        const pCode = d.product_code.toLowerCase();
        if (!donorStockMap[pCode]) {
            donorStockMap[pCode] = { qty: 0, fetch_date: d.fetch_date };
        }
        donorStockMap[pCode].qty += Number(d.quantity);
      });

      // 5. Merge Data
      const mergedData: any[] = [];
      let matched = 0, mismatched = 0, missing = 0;

      products.forEach(prod => {
        const ourStock = internalStockMap[prod.id] || 0;
        const donorRecord = donorStockMap[prod.code.toLowerCase()];

        const donorQty = donorRecord ? Number(donorRecord.qty) : null;
        let status = 'MATCHED';

        if (donorQty === null) {
            status = 'MISSING_IN_CUBOID';
            missing++;
        } else if (ourStock !== donorQty) {
            status = 'MISMATCH';
            mismatched++;
        } else {
            matched++;
        }

        mergedData.push({
          product_id: prod.id,
          product_name: prod.name,
          product_code: prod.code,
          product_type: prod.product_type,
          unit: prod.unit_type,
          our_stock: ourStock,
          donor_stock: donorQty,
          difference: donorQty !== null ? (ourStock - donorQty) : 0,
          status,
          fetch_date: donorRecord?.fetch_date || null
        });
      });

      mergedData.sort((a, b) => a.product_name.localeCompare(b.product_name));

      setSummary({ total: mergedData.length, matched, mismatched, missing });
      setReconciliationData(mergedData);
    } catch (error) {
      console.error("Error loading reconciliation data", error);
    }
    setIsLoading(false);
  };

  // Client-side dynamic filtering for Columns
  const filteredData = reconciliationData.filter(item => {
     const matchStatus = filterStatus === 'ALL' ? true : item.status === filterStatus;

     // Multi-select simulation for Name and Code using comma separation
     const nameQueries = filterProductName.toLowerCase().split(',').map(s => s.trim()).filter(s => s);
     const matchName = nameQueries.length === 0 || nameQueries.some(q => item.product_name.toLowerCase().includes(q));

     const codeQueries = filterProductCode.toLowerCase().split(',').map(s => s.trim()).filter(s => s);
     const matchCode = codeQueries.length === 0 || codeQueries.some(q => item.product_code.toLowerCase().includes(q));

     const matchDiff = filterDifference === '' || item.difference.toString().includes(filterDifference);

     return matchStatus && matchName && matchCode && matchDiff;
  });

  const handleExportExcel = () => {
    const exportData = filteredData.map((item, idx) => ({
      "SL": idx + 1,
      "Product Code": item.product_code,
      "Product Name": item.product_name,
      "Item Type": item.product_type,
      "Our Stock (System)": item.our_stock,
      "CUBOID Stock (Portal)": item.donor_stock !== null ? item.donor_stock : 'N/A',
      "Difference": item.difference,
      "Status": item.status,
      "Last Fetched": item.fetch_date ? new Date(item.fetch_date).toLocaleString() : 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reconciliation");
    XLSX.writeFile(workbook, `Stock_Reconciliation_${filterDate}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('portrait');
    doc.setFontSize(14); doc.text(`Stock Reconciliation Report - ${filterDate}`, 14, 15);

    let whName = "All Warehouses";
    if (selectedWh !== 'ALL') {
        whName = warehouses.find(w => w.id === selectedWh)?.name || whName;
    }
    doc.setFontSize(9); doc.setTextColor(100); doc.text(`Warehouse: ${whName} | Generated: ${new Date().toLocaleString()}`, 14, 21);

    const tableColumn = ["SL", "Product Code", "Product Name", "Our Stock", "CUBOID Stock", "Diff.", "Status"];
    const tableRows = filteredData.map((item, i) => [
      i + 1, 
      item.product_code, 
      item.product_name, 
      item.our_stock, 
      item.donor_stock !== null ? item.donor_stock : 'N/A', 
      item.difference, 
      item.status === 'MISSING_IN_CUBOID' ? 'MISSING' : item.status
    ]);

    autoTable(doc, { 
      head: [tableColumn], body: tableRows, startY: 26, theme: 'grid', 
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] }
    });
    doc.save(`Stock_Reconciliation_${filterDate}.pdf`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 w-full animate-in fade-in duration-500 relative">

      <header className="flex flex-col md:flex-row h-auto md:h-20 bg-white border-b border-slate-200 items-start md:items-center px-4 md:px-6 py-4 md:py-0 shrink-0 shadow-sm justify-between sticky top-0 z-30 gap-4 md:gap-0">
        <div className="flex items-center">
          <button onClick={() => window.history.back()} className="mr-3 md:mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <div className="pr-12 md:pr-0">
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 leading-tight">Stock Reconciliation</h2>
            <p className="text-[10px] md:text-sm text-slate-500 hidden sm:block">Compare internal historical stock against fetched CUBOID portal data</p>
          </div>
        </div>

        <div className="flex w-full md:w-auto space-x-2 shrink-0">
          <button onClick={handleExportExcel} disabled={filteredData.length === 0} className="flex-1 md:flex-none justify-center px-3 md:px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl hover:bg-indigo-100 transition-colors flex items-center shadow-sm disabled:opacity-50">
            <Icons.Download /> <span className="ml-1 hidden sm:inline">Excel</span>
          </button>
          <button onClick={handleExportPDF} disabled={filteredData.length === 0} className="flex-1 md:flex-none justify-center px-3 md:px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl hover:bg-rose-100 transition-colors flex items-center shadow-sm disabled:opacity-50">
            <Icons.Download /> <span className="ml-1 hidden sm:inline">PDF</span>
          </button>
        </div>
      </header>

      <div className="flex-1 p-3 md:p-6 space-y-4 md:space-y-6">

        {/* Filter & Summary Section */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 md:gap-6">

           <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm xl:col-span-1 flex flex-col space-y-4">
             <h3 className="font-bold text-slate-800 text-xs md:text-sm uppercase tracking-wide">Data Source Filters</h3>
             <div>
               <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Select Warehouse</label>
               <select value={selectedWh} onChange={(e) => setSelectedWh(e.target.value)} className="w-full px-3 md:px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold outline-none focus:border-indigo-500 cursor-pointer">
                 <option value="ALL">-- All My Warehouses --</option>
                 {warehouses.map(w => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
               </select>
             </div>
             <div>
               <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Closing Date (Stock As Of)</label>
               <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-full px-3 md:px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold outline-none focus:border-indigo-500 cursor-pointer" />
             </div>

             <div className="pt-2 md:pt-4 border-t border-slate-100 mt-2">
                <button onClick={handleApplyFilters} disabled={isLoading || !selectedWh} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl shadow-md transition-all text-sm disabled:opacity-50 flex justify-center items-center h-[42px]">
                  {isLoading ? <Icons.Spinner /> : <><Icons.Search /> <span className="ml-2">Apply & Load</span></>}
                </button>
             </div>
           </div>

           <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-5 md:p-6 rounded-2xl border border-slate-700 shadow-lg xl:col-span-3 text-white flex flex-col justify-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                 <span className="text-8xl">📊</span>
              </div>
              <h3 className="font-bold text-slate-300 text-[10px] md:text-xs uppercase tracking-widest mb-4 z-10">Reconciliation Summary ({filterDate})</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 divide-x divide-slate-700 z-10">
                 <div className="px-2 md:px-4 first:pl-0">
                   <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase">Total Products</p>
                   <p className="text-2xl md:text-3xl font-black mt-1">{summary.total}</p>
                 </div>
                 <div className="px-2 md:px-4">
                   <p className="text-[10px] md:text-xs text-emerald-400 font-bold uppercase">Perfect Match</p>
                   <p className="text-2xl md:text-3xl font-black text-emerald-400 mt-1">{summary.matched}</p>
                 </div>
                 <div className="px-2 md:px-4">
                   <p className="text-[10px] md:text-xs text-rose-400 font-bold uppercase">Mismatched</p>
                   <p className="text-2xl md:text-3xl font-black text-rose-400 mt-1">{summary.mismatched}</p>
                 </div>
                 <div className="px-2 md:px-4">
                   <p className="text-[10px] md:text-xs text-amber-400 font-bold uppercase">Missing in CUBOID</p>
                   <p className="text-2xl md:text-3xl font-black text-amber-400 mt-1">{summary.missing}</p>
                 </div>
              </div>
           </div>
        </div>

        {/* Reconciliation List (Fully Responsive without Table Scroll) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden w-full">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row justify-between md:items-center gap-3">
            <h3 className="font-bold text-slate-900 text-xs md:text-sm uppercase flex items-center"><span className="text-lg mr-2">🔎</span> Stock Comparison Details</h3>
          </div>

          {/* Desktop Header Row (Hidden on Mobile) */}
          <div className="hidden md:flex w-full bg-slate-100 border-b border-slate-200 sticky top-20 z-10 shadow-sm">
              <div className="p-3 w-16 text-center shrink-0 border-r border-slate-200"><span className="text-[10px] font-black text-slate-600 uppercase">SL</span></div>
              
              <div className="p-3 flex-1 min-w-[200px] border-r border-slate-200">
                 <div className="flex flex-col space-y-2">
                   <span className="text-[10px] font-black text-slate-600 uppercase">Product Name</span>
                   <input 
                      type="text" placeholder="Filter Name (comma separated)..." 
                      value={filterProductName} onChange={e => setFilterProductName(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded outline-none focus:border-indigo-500 font-medium text-slate-700" 
                   />
                 </div>
              </div>

              <div className="p-3 w-32 shrink-0 border-r border-slate-200">
                 <div className="flex flex-col space-y-2">
                   <span className="text-[10px] font-black text-slate-600 uppercase">Product Code</span>
                   <input 
                      type="text" placeholder="Filter Code..." 
                      value={filterProductCode} onChange={e => setFilterProductCode(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded outline-none focus:border-indigo-500 font-medium text-slate-700" 
                   />
                 </div>
              </div>

              <div className="p-3 w-32 text-center bg-indigo-50/50 shrink-0 border-r border-slate-200 flex flex-col justify-end">
                 <span className="text-[10px] font-black text-indigo-700 uppercase mb-2">Our Stock</span>
              </div>

              <div className="p-3 w-32 text-center bg-emerald-50/50 shrink-0 border-r border-slate-200 flex flex-col justify-end">
                 <span className="text-[10px] font-black text-emerald-700 uppercase mb-2">CUBOID Stock</span>
              </div>

              <div className="p-3 w-28 text-center shrink-0 border-r border-slate-200">
                 <div className="flex flex-col space-y-2">
                   <span className="text-[10px] font-black text-slate-600 uppercase">Difference</span>
                   <input 
                      type="text" placeholder="Filter Diff..." 
                      value={filterDifference} onChange={e => setFilterDifference(e.target.value)}
                      className="w-full px-2 py-1 text-xs text-center border border-slate-300 rounded outline-none focus:border-indigo-500 font-medium text-slate-700" 
                   />
                 </div>
              </div>

              <div className="p-3 w-40 text-center shrink-0">
                 <div className="flex flex-col space-y-2">
                   <span className="text-[10px] font-black text-slate-600 uppercase">Status</span>
                   <select 
                      value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded outline-none focus:border-indigo-500 font-bold text-slate-700 cursor-pointer"
                   >
                      <option value="ALL">All Status</option>
                      <option value="MATCHED">Matched</option>
                      <option value="MISMATCH">Mismatched</option>
                      <option value="MISSING_IN_CUBOID">Missing</option>
                   </select>
                 </div>
              </div>
          </div>

          {/* Mobile Filter Row (Visible only on Mobile) */}
          <div className="md:hidden flex flex-col space-y-3 p-4 bg-slate-50 border-b border-slate-200 sticky top-[72px] z-10 shadow-sm">
              <div className="flex space-x-2">
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="flex-1 px-2 py-1.5 text-xs border border-slate-300 rounded outline-none focus:border-indigo-500 font-bold text-slate-700 cursor-pointer">
                      <option value="ALL">All Status</option>
                      <option value="MATCHED">Matched</option>
                      <option value="MISMATCH">Mismatched</option>
                      <option value="MISSING_IN_CUBOID">Missing</option>
                  </select>
                  <input type="text" placeholder="Diff..." value={filterDifference} onChange={e => setFilterDifference(e.target.value)} className="w-16 px-2 py-1.5 text-xs text-center border border-slate-300 rounded outline-none focus:border-indigo-500 font-medium text-slate-700" />
              </div>
              <div className="flex space-x-2">
                  <input type="text" placeholder="Filter Name (comma separated)..." value={filterProductName} onChange={e => setFilterProductName(e.target.value)} className="flex-1 px-2 py-1.5 text-xs border border-slate-300 rounded outline-none focus:border-indigo-500 font-medium text-slate-700" />
                  <input type="text" placeholder="Filter Code..." value={filterProductCode} onChange={e => setFilterProductCode(e.target.value)} className="w-24 px-2 py-1.5 text-xs border border-slate-300 rounded outline-none focus:border-indigo-500 font-medium text-slate-700" />
              </div>
          </div>

          {/* Data Rows (Responsive Stacking on Mobile) */}
          <div className="flex flex-col w-full divide-y divide-slate-100">
            {isLoading ? (
              <div className="p-10 text-center flex justify-center"><Icons.Spinner /></div>
            ) : filteredData.length === 0 ? (
              <div className="p-10 text-center text-sm font-bold text-slate-500">No data found matching criteria.</div>
            ) : (
              filteredData.map((item, idx) => (
                <div key={idx} className="flex flex-col md:flex-row w-full hover:bg-slate-50 group transition-colors">
                  
                  {/* Mobile Header per item: SL & Status */}
                  <div className="flex md:hidden justify-between items-center bg-slate-100/50 p-2 px-4 border-b border-slate-100">
                      <span className="text-[10px] font-black text-slate-400">#{idx + 1}</span>
                      <div>
                        {item.status === 'MATCHED' && <span className="text-[9px] font-black bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-md uppercase">Matched</span>}
                        {item.status === 'MISMATCH' && <span className="text-[9px] font-black bg-rose-50 border border-rose-200 text-rose-700 px-2 py-0.5 rounded-md uppercase animate-pulse">Mismatch</span>}
                        {item.status === 'MISSING_IN_CUBOID' && <span className="text-[9px] font-black bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-md uppercase">Missing</span>}
                      </div>
                  </div>

                  {/* Desktop SL */}
                  <div className="hidden md:flex p-3 w-16 items-center justify-center border-r border-slate-100 text-xs font-bold text-slate-400 shrink-0">
                     {idx + 1}
                  </div>

                  {/* Product Name */}
                  <div className="p-4 md:p-3 flex-1 min-w-0 md:border-r md:border-slate-100 flex flex-col justify-center">
                     <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase border shrink-0 ${item.product_type === 'LPG' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                          {item.product_type}
                        </span>
                        <p className="font-bold text-slate-900 text-sm break-words leading-tight">{item.product_name}</p>
                     </div>
                     <div className="md:hidden mt-1">
                        <p className="text-xs font-mono font-bold text-slate-500">Code: {item.product_code}</p>
                     </div>
                  </div>

                  {/* Product Code (Desktop only) */}
                  <div className="hidden md:flex p-3 w-32 items-center border-r border-slate-100 shrink-0">
                    <p className="text-xs font-mono font-bold text-slate-600">{item.product_code}</p>
                  </div>

                  {/* Mobile Stock Compare Row */}
                  <div className="flex md:hidden justify-between items-center p-4 border-t border-slate-100 bg-slate-50/50">
                      <div className="flex flex-col items-center">
                          <span className="text-[9px] font-bold text-slate-500 uppercase mb-1">Our Stock</span>
                          <div>
                             <span className="text-lg font-black text-indigo-700">{item.our_stock}</span>
                             <span className="text-[9px] font-bold text-slate-400 ml-1 uppercase">{item.unit}</span>
                          </div>
                      </div>
                      
                      <div className="flex flex-col items-center">
                          <span className="text-[9px] font-bold text-slate-500 uppercase mb-1">Difference</span>
                          {item.difference === 0 ? (
                             <span className="text-sm font-black text-slate-300">-</span>
                          ) : (
                             <span className={`text-sm font-black px-2.5 py-1 rounded-lg shadow-sm ${item.difference > 0 ? 'text-amber-700 bg-amber-50 border border-amber-200' : 'text-rose-700 bg-rose-50 border border-rose-200'}`}>
                                {item.difference > 0 ? `+${item.difference}` : item.difference}
                             </span>
                          )}
                      </div>

                      <div className="flex flex-col items-center">
                          <span className="text-[9px] font-bold text-slate-500 uppercase mb-1">CUBOID Stock</span>
                          {item.donor_stock !== null ? (
                            <div>
                              <span className="text-lg font-black text-emerald-700">{item.donor_stock}</span>
                              <span className="text-[9px] font-bold text-slate-400 ml-1 uppercase">{item.unit}</span>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-amber-500">N/A</span>
                          )}
                      </div>
                  </div>

                  {/* Desktop Columns for Stock */}
                  <div className="hidden md:flex p-3 w-32 items-center justify-center border-r border-slate-100 bg-indigo-50/10 shrink-0">
                    <span className="text-base font-black text-indigo-700">{item.our_stock}</span>
                    <span className="text-[9px] font-bold text-slate-400 ml-1 uppercase">{item.unit}</span>
                  </div>

                  <div className="hidden md:flex p-3 w-32 items-center justify-center border-r border-slate-100 bg-emerald-50/10 shrink-0">
                    {item.donor_stock !== null ? (
                      <><span className="text-base font-black text-emerald-700">{item.donor_stock}</span>
                      <span className="text-[9px] font-bold text-slate-400 ml-1 uppercase">{item.unit}</span></>
                    ) : (
                      <span className="text-xs font-bold text-amber-500">N/A</span>
                    )}
                  </div>

                  <div className="hidden md:flex p-3 w-28 items-center justify-center border-r border-slate-100 shrink-0">
                    {item.difference === 0 ? (
                       <span className="text-sm font-black text-slate-300">-</span>
                    ) : (
                       <span className={`text-sm font-black px-2.5 py-1 rounded-lg shadow-sm ${item.difference > 0 ? 'text-amber-700 bg-amber-50 border border-amber-200' : 'text-rose-700 bg-rose-50 border border-rose-200'}`}>
                          {item.difference > 0 ? `+${item.difference}` : item.difference}
                       </span>
                    )}
                  </div>

                  <div className="hidden md:flex p-3 w-40 items-center justify-center shrink-0">
                    {item.status === 'MATCHED' && <span className="text-[10px] font-black bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-md uppercase shadow-sm inline-block">Matched</span>}
                    {item.status === 'MISMATCH' && <span className="text-[10px] font-black bg-rose-50 border border-rose-200 text-rose-700 px-2.5 py-1 rounded-md uppercase shadow-sm animate-pulse inline-block">Mismatch</span>}
                    {item.status === 'MISSING_IN_CUBOID' && <span className="text-[10px] font-black bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-md uppercase shadow-sm inline-block">Missing</span>}
                  </div>

                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}