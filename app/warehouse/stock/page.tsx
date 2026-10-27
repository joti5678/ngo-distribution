"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './../../components/Icons';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function CurrentStockPage() {
  const [rawStock, setRawStock] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWhIds, setSelectedWhIds] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [todayStr, setTodayStr] = useState('');

  // Custom Drag & Drop Sorting State
  const [orderedProductIds, setOrderedProductIds] = useState<string[]>([]);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const today = new Date();
    const dateStr = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    setTodayStr(dateStr);
    setSelectedDate(dateStr);
    fetchWarehouses();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchStockData();
    }
  }, [selectedDate]);

  const fetchWarehouses = async () => {
    const { data: whData } = await supabase.from('warehouses').select('*').order('name', { ascending: true });
    if (whData) {
      setWarehouses(whData);
      // Select all warehouses by default
      setSelectedWhIds(whData.map(w => w.id));
    }
  };

  const fetchStockData = async () => {
    setIsLoading(true);
    const isHistorical = selectedDate && todayStr && selectedDate !== todayStr;

    if (!isHistorical) {
      // 1. Fetch Current Real-Time Inventory
      const { data: invData } = await supabase
        .from('inventory')
        .select(`
          id,
          quantity,
          warehouse_id,
          product_id,
          warehouses (id, name, code),
          products (id, name, code, unit_type, product_type)
        `)
        .gt('quantity', 0);
        
      if (invData) setRawStock(invData);
    } else {
      // 2. Calculate Historical Stock up to the end of Selected Date
      const targetDate = new Date(selectedDate);
      targetDate.setHours(23, 59, 59, 999);

      const { data: txns } = await supabase
        .from('inventory_transactions')
        .select(`
          warehouse_id, product_id, quantity, transaction_type,
          warehouses (id, name, code),
          products (id, name, code, unit_type, product_type)
        `)
        .lte('created_at', targetDate.toISOString());

      if (txns) {
        const stockMap: Record<string, any> = {};
        
        txns.forEach(t => {
          const key = `${t.warehouse_id}_${t.product_id}`;
          if (!stockMap[key]) {
            stockMap[key] = {
              id: key,
              warehouse_id: t.warehouse_id,
              product_id: t.product_id,
              warehouses: t.warehouses,
              products: t.products,
              quantity: 0
            };
          }
          
          if (t.transaction_type === 'IN' || t.transaction_type === 'RECEIVE') {
            stockMap[key].quantity += t.quantity;
          } else if (['OUT', 'TRANSFER', 'DAMAGE'].includes(t.transaction_type)) {
            stockMap[key].quantity -= t.quantity;
          }
        });

        const calculatedInventory = Object.values(stockMap).filter((item: any) => item.quantity > 0);
        setRawStock(calculatedInventory);
      }
    }

    setIsLoading(false);
  };

  const toggleWarehouse = (id: string) => {
    if (selectedWhIds.includes(id)) {
      setSelectedWhIds(selectedWhIds.filter(item => item !== id));
    } else {
      setSelectedWhIds([...selectedWhIds, id]);
    }
  };

  const toggleAllWarehouses = () => {
    if (selectedWhIds.length === warehouses.length) {
      setSelectedWhIds([]);
    } else {
      setSelectedWhIds(warehouses.map(w => w.id));
    }
  };

  // Group & Sum by Product based on selected warehouses
  const aggregatedStock = React.useMemo(() => {
    if (selectedWhIds.length === 0) return [];

    // Filter raw stock by selected warehouses
    const filteredByWh = rawStock.filter(item => {
      const whId = item.warehouse_id || item.warehouses?.id;
      return selectedWhIds.includes(whId);
    });

    // Aggregate quantities by product_id so each item appears only once
    const productMap: Record<string, any> = {};

    filteredByWh.forEach(item => {
      const prodId = item.product_id || item.products?.id;
      if (!prodId || !item.products) return;

      if (!productMap[prodId]) {
        productMap[prodId] = {
          product_id: prodId,
          name: item.products.name || 'Unknown',
          code: item.products.code || 'N/A',
          unit_type: item.products.unit_type || '',
          product_type: item.products.product_type || 'NFI',
          total_quantity: 0
        };
      }
      productMap[prodId].total_quantity += Number(item.quantity) || 0;
    });

    // Filter by search query
    const filteredList = Object.values(productMap).filter((p: any) => 
      p.total_quantity > 0 && (
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
    );

    // Sort according to user's Drag & Drop order, fallback to alphabetical
    return filteredList.sort((a: any, b: any) => {
      const idxA = orderedProductIds.indexOf(a.product_id);
      const idxB = orderedProductIds.indexOf(b.product_id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [rawStock, selectedWhIds, searchQuery, orderedProductIds]);

  // Keep orderedProductIds synced when new items load
  useEffect(() => {
    if (aggregatedStock.length > 0) {
      setOrderedProductIds(prev => {
        const currentIds = aggregatedStock.map((i: any) => i.product_id);
        const existingValid = prev.filter(id => currentIds.includes(id));
        const newIds = currentIds.filter(id => !existingValid.includes(id));
        if (newIds.length > 0 || existingValid.length !== prev.length) {
          return [...existingValid, ...newIds];
        }
        return prev;
      });
    }
  }, [rawStock, selectedWhIds]);

  // Drag and Drop Handlers
  const handleDragStart = (index: number) => {
    setDraggedIdx(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverIdx !== index) {
      setDragOverIdx(index);
    }
  };

  const handleDrop = (dropIndex: number) => {
    if (draggedIdx === null || draggedIdx === dropIndex) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }

    const currentIds = aggregatedStock.map((item: any) => item.product_id);
    const updatedOrder = [...currentIds];
    const [movedId] = updatedOrder.splice(draggedIdx, 1);
    updatedOrder.splice(dropIndex, 0, movedId);

    setOrderedProductIds(updatedOrder);
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const getSelectedWarehouseNames = () => {
    if (selectedWhIds.length === 0) return "None Selected";
    return warehouses
      .filter(w => selectedWhIds.includes(w.id))
      .map(w => w.code ? `${w.name} (${w.code})` : w.name)
      .join(", ");
  };

  const handleExportExcel = () => {
    const whHeader = getSelectedWarehouseNames();
    
    const exportData = aggregatedStock.map((item: any, idx: number) => ({
      "SL": idx + 1,
      "Product Name": item.name,
      "Product Code": item.code,
      "Measurement Unit": item.unit_type,
      "Available Stock": item.total_quantity,
      "Stock Date": selectedDate,
      "Warehouse(s)": whHeader
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Current_Stock");
    XLSX.writeFile(workbook, `Stock_Report_${selectedDate}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('portrait');
    const whHeader = getSelectedWarehouseNames();

    // Clean Header without dark background
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text("Warehouse Stock Balance Report", 14, 16);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85); // slate-700
    const splitWh = doc.splitTextToSize(`Warehouse / Camp: ${whHeader}`, 182);
    doc.text(splitWh, 14, 23);

    const nextY = 23 + (splitWh.length * 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Stock As Of Date: ${new Date(selectedDate).toLocaleDateString()}   |   Generated: ${new Date().toLocaleTimeString()}`, 14, nextY);

    // Subtle divider line
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.line(14, nextY + 3, 196, nextY + 3);

    const tableColumn = ["SL", "Product Name", "Product Code", "Measurement Unit", "Available Stock"];
    const tableRows: any[] = [];

    aggregatedStock.forEach((item: any, idx: number) => {
      tableRows.push([
        idx + 1,
        item.name,
        item.code,
        item.unit_type,
        item.total_quantity.toLocaleString()
      ]);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: nextY + 7,
      theme: 'grid',
      styles: { fontSize: 9.5, cellPadding: 3.5, valign: 'middle', textColor: [30, 41, 59], lineColor: [226, 232, 240] },
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', lineWidth: 0.3, lineColor: [203, 213, 225] },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 'auto', fontStyle: 'bold' },
        2: { cellWidth: 38, halign: 'left' },
        3: { cellWidth: 36, halign: 'center' },
        4: { cellWidth: 36, halign: 'right', fontStyle: 'bold' }
      },
      alternateRowStyles: { fillColor: [250, 250, 250] },
    });

    doc.save(`Warehouse_Stock_Report_${selectedDate}.pdf`);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 relative">
      
      {/* Header */}
      <header className="flex h-20 bg-white border-b border-slate-200 items-center justify-between px-4 md:px-6 shrink-0 shadow-sm z-20">
        <div className="flex items-center">
          <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">Current Stock Balance</h2>
            <p className="text-xs md:text-sm text-slate-500 hidden sm:block">View real-time or historical combined stock across selected camps & warehouses</p>
          </div>
        </div>

        <div className="flex space-x-2 pr-12 md:pr-14">
          <button onClick={handleExportExcel} disabled={aggregatedStock.length === 0} className="flex items-center px-3 md:px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-colors shadow-sm disabled:opacity-50">
            <Icons.Download /> <span className="ml-1 hidden sm:inline">Excel</span>
          </button>
          <button onClick={handleExportPDF} disabled={aggregatedStock.length === 0} className="flex items-center px-3 md:px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl hover:bg-rose-100 transition-colors shadow-sm disabled:opacity-50">
            <Icons.Download /> <span className="ml-1 hidden sm:inline">PDF</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col space-y-5">
        
        {/* Filter Bar (High z-index so dropdown never clips) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 items-end relative z-30">
          
          {/* 1. Date Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Stock As Of Date</label>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* 2. Multi-Select Camp / Warehouse Tick Mark Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1.5">
              Select Warehouses / Camps ({warehouses.length} Available)
            </label>
            <button 
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full px-4 py-2.5 bg-indigo-50/60 border border-indigo-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 flex justify-between items-center transition-all shadow-sm"
            >
              <span className="truncate pr-2">
                {selectedWhIds.length === 0 
                  ? "No Warehouse Selected" 
                  : selectedWhIds.length === warehouses.length 
                  ? `All Warehouses Selected (${warehouses.length})` 
                  : `${selectedWhIds.length} of ${warehouses.length} Selected`}
              </span>
              <svg className={`w-4 h-4 text-indigo-600 transition-transform shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu with Checkboxes */}
            {isDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in zoom-in-95 duration-150">
                <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                  <label className="flex items-center space-x-2.5 cursor-pointer select-none w-full">
                    <input 
                      type="checkbox" 
                      checked={warehouses.length > 0 && selectedWhIds.length === warehouses.length}
                      onChange={toggleAllWarehouses}
                      className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                    />
                    <span className="text-xs font-black text-indigo-900 uppercase tracking-wider">
                      Select All Warehouses ({warehouses.length})
                    </span>
                  </label>
                </div>
                <div className="p-2 max-h-64 overflow-y-auto divide-y divide-slate-100 custom-scrollbar bg-white">
                  {warehouses.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 font-medium">No warehouses configured in database.</div>
                  ) : (
                    warehouses.map(w => {
                      const isChecked = selectedWhIds.includes(w.id);
                      return (
                        <label 
                          key={w.id} 
                          className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer select-none transition-colors ${
                            isChecked ? 'bg-indigo-50/70 text-indigo-950' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center space-x-3 truncate pr-2">
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={() => toggleWarehouse(w.id)}
                              className="w-4 h-4 accent-indigo-600 rounded cursor-pointer shrink-0"
                            />
                            <div className="truncate">
                              <p className="text-xs font-bold leading-tight truncate">{w.name}</p>
                              <p className="text-[10px] text-slate-500 font-mono mt-0.5">Code: {w.code || 'N/A'}</p>
                            </div>
                          </div>
                          {isChecked && <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md shrink-0">✓ Selected</span>}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 3. Product Search */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Search Product</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icons.Search /></div>
              <input 
                type="text" 
                placeholder="Search by product name or code..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

        </div>

        {/* Active Context Banner */}
        <div className="bg-indigo-900 text-white px-5 py-3.5 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 relative z-10">
          <div className="flex items-center space-x-2.5 text-xs overflow-hidden">
            <span className="bg-indigo-700 text-indigo-200 font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider shrink-0">
              {selectedWhIds.length > 1 ? 'Combined Sum Mode' : 'Single Warehouse Mode'}
            </span>
            <p className="font-semibold text-indigo-100 truncate" title={getSelectedWarehouseNames()}>
              Warehouse(s): <strong className="text-white">{getSelectedWarehouseNames()}</strong>
            </p>
          </div>
          <div className="text-xs font-bold text-emerald-300 shrink-0 flex items-center space-x-3">
            <span className="text-indigo-200 font-normal hidden lg:inline">↕ Drag rows to reorder</span>
            <span>Date: {selectedDate ? new Date(selectedDate).toLocaleDateString() : 'Today'} • {aggregatedStock.length} Items</span>
          </div>
        </div>

        {/* 5-Column Stock Table with Serial Number & Drag-and-Drop Sorting */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col relative z-10">
          <div className="overflow-x-auto w-full flex-1">
            <table className="w-full text-left border-collapse table-auto">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-20">SL</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Product Name</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Product Code</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Measurement Unit</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Available Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={5} className="p-12 text-center"><Icons.Spinner /></td></tr>
                ) : selectedWhIds.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-sm text-rose-500 font-bold">
                      ⚠️ Please tick at least one Warehouse / Camp from the filter above to view stock.
                    </td>
                  </tr>
                ) : aggregatedStock.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-sm text-slate-500 font-medium">
                      No available stock found for the selected warehouse(s) on {selectedDate}.
                    </td>
                  </tr>
                ) : (
                  aggregatedStock.map((item: any, index: number) => {
                    const isDragged = draggedIdx === index;
                    const isDragOver = dragOverIdx === index;

                    return (
                      <tr 
                        key={item.product_id} 
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null); }}
                        onDrop={() => handleDrop(index)}
                        className={`transition-all group cursor-grab active:cursor-grabbing ${
                          isDragged ? 'opacity-40 bg-indigo-50' : 'hover:bg-slate-50'
                        } ${isDragOver ? 'border-t-2 border-indigo-600 bg-indigo-50/40' : ''}`}
                      >
                        
                        {/* 1. Serial Number (SL) + Drag Handle */}
                        <td className="px-6 py-4 align-middle">
                          <div className="flex items-center space-x-2.5">
                            <span className="text-slate-300 group-hover:text-indigo-500 transition-colors cursor-grab select-none text-base leading-none" title="Drag up or down to sort">
                              ⋮⋮
                            </span>
                            <span className="text-xs font-extrabold text-slate-500 bg-slate-100 border border-slate-200 w-6 h-6 rounded-md flex items-center justify-center">
                              {index + 1}
                            </span>
                          </div>
                        </td>

                        {/* 2. Product Name (Clean without LPG/NFI badge) */}
                        <td className="px-6 py-4 align-middle">
                          <p className="font-bold text-slate-900 text-sm">{item.name}</p>
                        </td>

                        {/* 3. Product Code */}
                        <td className="px-6 py-4 align-middle">
                          <span className="bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-mono font-bold">
                            {item.code}
                          </span>
                        </td>

                        {/* 4. Measurement Unit */}
                        <td className="px-6 py-4 align-middle">
                          <span className="text-xs font-bold text-slate-700 uppercase bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg">
                            {item.unit_type || 'Piece'}
                          </span>
                        </td>
                        
                        {/* 5. Available Stock (Summed) */}
                        <td className="px-6 py-4 text-right align-middle">
                          <span className="text-lg font-black text-indigo-600">
                            {item.total_quantity.toLocaleString()}
                          </span>
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