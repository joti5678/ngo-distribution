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

const INCIDENT_TYPES = [
  "Damaged / Broken",
  "Missing / Shortage (Gap)",
  "Expired / Unusable",
  "Cylinder Leaked / Defective (LPG)",
  "Other Loss"
];

export default function GapDamagePage() {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [availableStock, setAvailableStock] = useState<any[]>([]);
  const [damageLogs, setDamageLogs] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Form States
  const [entryDate, setEntryDate] = useState('');
  const [selectedWh, setSelectedWh] = useState('');
  const [incidentType, setIncidentType] = useState(INCIDENT_TYPES[0]);
  const [reportedBy, setReportedBy] = useState('');
  const [remarks, setRemarks] = useState('');
  const [referenceNo, setReferenceNo] = useState('');

  // Builder States
  const [bagItems, setBagItems] = useState<any[]>([]);
  const [stockSearch, setStockSearch] = useState('');
  const [tableSearch, setTableSearch] = useState('');

  // Modals States
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<any>(null);
  const [editQty, setEditQty] = useState<number | ''>('');
  const [editMaxCapacity, setEditMaxCapacity] = useState(0);
  const [editCurrentStock, setEditCurrentStock] = useState(0);
  const [editRemarks, setEditRemarks] = useState('');

  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [txnToRevert, setTxnToRevert] = useState<any>(null);

  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedTxnDetails, setSelectedTxnDetails] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUser(user);
    });

    const today = new Date();
    const dateStr = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    setEntryDate(dateStr);

    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    const { data: whData } = await supabase.from('warehouses').select('id, name, code').order('name');
    if (whData) setWarehouses(whData);

    await loadDamageLogs();
    setIsLoading(false);
  };

  const loadDamageLogs = async () => {
    const { data } = await supabase
      .from('inventory_transactions')
      .select(`
        *,
        warehouses (name, code),
        products (name, code, unit_type, product_type)
      `)
      .eq('transaction_type', 'DAMAGE')
      .order('created_at', { ascending: false })
      .limit(100);

    if (data) setDamageLogs(data);
  };

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  useEffect(() => {
    if (selectedWh) {
      fetchAvailableStock(selectedWh);
      setBagItems([]);
    } else {
      setAvailableStock([]);
      setBagItems([]);
    }
  }, [selectedWh]);

  const fetchAvailableStock = async (warehouseId: string) => {
    const { data } = await supabase
      .from('inventory')
      .select(`id, quantity, product_id, products (id, name, code, unit_type, product_type)`)
      .eq('warehouse_id', warehouseId)
      .gt('quantity', 0);
    if (data) setAvailableStock(data);
  };

  const handleAddToBag = (stockItem: any) => {
    if (bagItems.find(item => item.product_id === stockItem.product_id)) {
      showMessage("Item is already in the deduction bag.", "error");
      return;
    }
    setBagItems([...bagItems, {
      product_id: stockItem.product_id,
      products: stockItem.products,
      max_qty: stockItem.quantity,
      loss_qty: 1
    }]);
  };

  const handleUpdateBagQty = (productId: string, qtyStr: string) => {
    const qty = parseInt(qtyStr) || 0;
    setBagItems(bagItems.map(item => {
      if (item.product_id === productId) {
        const validQty = qty > item.max_qty ? item.max_qty : (qty < 0 ? 0 : qty);
        return { ...item, loss_qty: validQty };
      }
      return item;
    }));
  };

  const handleRemoveFromBag = (productId: string) => {
    setBagItems(bagItems.filter(i => i.product_id !== productId));
  };

  const handleSubmitLoss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWh || bagItems.length === 0) {
      showMessage("Please select a warehouse and add at least one item.", "error");
      return;
    }
    if (bagItems.some(i => i.loss_qty <= 0)) {
      showMessage("Loss/Damage quantities must be greater than 0.", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      const entryDateTime = new Date(entryDate);
      const now = new Date();
      entryDateTime.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

      const reportInfo = reportedBy ? ` (Reported by: ${reportedBy})` : '';
      const finalRemarks = `[${incidentType}]${reportInfo} ${remarks ? `- ${remarks}` : ''}`.trim();

      for (const item of bagItems) {
        // 1. Deduct from inventory
        const currentStock = availableStock.find(s => s.product_id === item.product_id)?.quantity || 0;
        const newStock = currentStock - item.loss_qty;

        await supabase
          .from('inventory')
          .update({ quantity: newStock < 0 ? 0 : newStock, last_updated: new Date().toISOString() })
          .match({ warehouse_id: selectedWh, product_id: item.product_id });

        // 2. Log into inventory_transactions as DAMAGE
        await supabase.from('inventory_transactions').insert([{
          warehouse_id: selectedWh,
          product_id: item.product_id,
          transaction_type: 'DAMAGE',
          quantity: item.loss_qty,
          reference_no: referenceNo || null,
          remarks: finalRemarks,
          created_by: currentUser?.id || null,
          created_by_email: currentUser?.email || null,
          created_at: entryDateTime.toISOString()
        }]);
      }

      showMessage("Gap/Damage recorded and stock deducted successfully!", "success");
      setBagItems([]);
      setReportedBy('');
      setRemarks('');
      setReferenceNo('');
      fetchAvailableStock(selectedWh);
      await loadDamageLogs();

    } catch (err: any) {
      showMessage(`Failed to record loss: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = async (txn: any) => {
    setEditingTxn(txn);
    setEditQty(txn.quantity);
    setEditRemarks(txn.remarks || '');
    setEditModalOpen(true);

    // Fetch current stock to calculate max allowed edit
    const { data: invData } = await supabase
      .from('inventory')
      .select('quantity')
      .eq('warehouse_id', txn.warehouse_id)
      .eq('product_id', txn.product_id)
      .single();

    const currStock = invData ? invData.quantity : 0;
    setEditCurrentStock(currStock);
    setEditMaxCapacity(currStock + txn.quantity); // Available + Already Deducted
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTxn) return;

    const newQty = Number(editQty);
    if (isNaN(newQty) || newQty <= 0) {
      showMessage("Quantity must be greater than 0.", "error");
      return;
    }
    if (newQty > editMaxCapacity) {
      showMessage(`Cannot exceed maximum available capacity (${editMaxCapacity}).`, "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const diff = newQty - editingTxn.quantity; // Positive means more damage (deduct more), Negative means less damage (return to stock)

      const { data: invRecord } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('warehouse_id', editingTxn.warehouse_id)
        .eq('product_id', editingTxn.product_id)
        .single();

      if (invRecord) {
        const updatedStock = invRecord.quantity - diff;
        if (updatedStock < 0) {
          throw new Error("Insufficient stock in warehouse to deduct this amount.");
        }
        await supabase.from('inventory').update({ quantity: updatedStock, last_updated: new Date().toISOString() }).eq('id', invRecord.id);
      }

      await supabase.from('inventory_transactions').update({
        quantity: newQty,
        remarks: editRemarks,
        updated_by: currentUser?.id || null,
        updated_by_email: currentUser?.email || null,
        updated_at: new Date().toISOString()
      }).eq('id', editingTxn.id);

      showMessage("Record updated and stock adjusted!", "success");
      setEditModalOpen(false);
      if (selectedWh === editingTxn.warehouse_id) fetchAvailableStock(selectedWh);
      await loadDamageLogs();

    } catch (err: any) {
      showMessage(`Update failed: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmRevert = async () => {
    if (!txnToRevert) return;
    setIsSubmitting(true);

    try {
      // Return the deducted damage quantity back to the warehouse inventory
      const { data: invRecord } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('warehouse_id', txnToRevert.warehouse_id)
        .eq('product_id', txnToRevert.product_id)
        .single();

      if (invRecord) {
        await supabase.from('inventory')
          .update({ quantity: invRecord.quantity + txnToRevert.quantity, last_updated: new Date().toISOString() })
          .eq('id', invRecord.id);
      } else {
        await supabase.from('inventory').insert([{
          warehouse_id: txnToRevert.warehouse_id,
          product_id: txnToRevert.product_id,
          quantity: txnToRevert.quantity
        }]);
      }

      await supabase.from('inventory_transactions').delete().eq('id', txnToRevert.id);

      showMessage("Incident record deleted and stock restored to warehouse!", "success");
      setRevertModalOpen(false);
      if (selectedWh === txnToRevert.warehouse_id) fetchAvailableStock(selectedWh);
      await loadDamageLogs();

    } catch (err: any) {
      showMessage(`Revert failed: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportExcel = () => {
    const exportData = filteredLogs.map(t => {
      const txnId = `TXN-${t.id.split('-')[0].toUpperCase()}`;
      return {
        "Date": new Date(t.created_at).toLocaleDateString(),
        "Time": new Date(t.created_at).toLocaleTimeString(),
        "System TXN ID": txnId,
        "Ref / Report No": t.reference_no || 'N/A',
        "Warehouse": t.warehouses?.name || 'Unknown',
        "Product Code": t.products?.code || 'N/A',
        "Product Name": t.products?.name || 'Unknown',
        "Product Type": t.products?.product_type || 'N/A',
        "Deducted Qty (LOSS)": t.quantity,
        "Unit": t.products?.unit_type || '',
        "Incident & Remarks": t.remarks || 'N/A',
        "Logged By (Email)": t.created_by_email || 'System',
        "Last Updated By": t.updated_by_email || 'N/A',
        "Updated At": t.updated_at ? new Date(t.updated_at).toLocaleString() : 'N/A'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Gap_And_Damage");
    XLSX.writeFile(workbook, `Gap_Damage_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text("Warehouse Gap, Damage & Loss - Audit Report", 14, 15);
    
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 21);

    const tableColumn = [
      "Date & Time", 
      "TXN ID & Ref", 
      "Warehouse", 
      "Product Details", 
      "Qty (Loss)", 
      "Incident Type & Remarks", 
      "User Audit (Logged / Updated)"
    ];
    const tableRows: any[] = [];

    filteredLogs.forEach(t => {
      const txnId = `TXN-${t.id.split('-')[0].toUpperCase()}`;
      const dateStr = new Date(t.created_at).toLocaleDateString();
      const timeStr = new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const createdAudit = `Log: ${t.created_by_email || 'System'}`;
      const updatedAudit = t.updated_by_email ? `\nUpd: ${t.updated_by_email}` : '';

      tableRows.push([
        `${dateStr}\n${timeStr}`,
        `${txnId}${t.reference_no ? `\nRef: ${t.reference_no}` : ''}`,
        t.warehouses?.name || 'Unknown',
        `${t.products?.name || 'Unknown'}\n[${t.products?.code || 'N/A'}]`,
        `-${t.quantity} ${t.products?.unit_type || ''}`,
        t.remarks || '-',
        `${createdAudit}${updatedAudit}`
      ]);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 26,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [225, 29, 72], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [255, 241, 242] },
    });

    doc.save(`Gap_Damage_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const filteredStock = availableStock.filter(s => 
    s.products?.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
    s.products?.code.toLowerCase().includes(stockSearch.toLowerCase())
  );

  const filteredLogs = damageLogs.filter(t => {
    const q = tableSearch.toLowerCase();
    const txnId = `TXN-${t.id.split('-')[0].toUpperCase()}`;
    return txnId.toLowerCase().includes(q) ||
           (t.reference_no || '').toLowerCase().includes(q) ||
           (t.products?.name || '').toLowerCase().includes(q) ||
           (t.warehouses?.name || '').toLowerCase().includes(q) ||
           (t.remarks || '').toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 relative">
      
      {/* Header */}
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 shadow-sm z-10">
        <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Gap, Damage & Loss</h2>
          <p className="text-sm text-slate-500 hidden md:block">Log damaged, expired, or missing inventory to adjust stock balances accurately</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        
        {/* Toast Notification */}
        {msg.text && (
          <div className={`p-4 rounded-xl shadow-md border text-sm font-bold animate-in slide-in-from-top-2 flex justify-between items-center shrink-0 fixed top-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="flex items-center"><span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}</span>
            <button onClick={() => setMsg({text:'', type:''})} className="p-1 rounded-md hover:bg-black/5"><Icons.Close /></button>
          </div>
        )}

        {/* Top Settings Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Incident Date</label>
              <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-rose-500" />
            </div>

            <div>
              <label className="block text-xs font-bold text-rose-600 uppercase tracking-wide mb-1.5">Select Warehouse</label>
              <select value={selectedWh} onChange={(e) => setSelectedWh(e.target.value)} className="w-full px-4 py-2.5 bg-rose-50/50 border border-rose-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-rose-500">
                <option value="">-- Choose Affected Warehouse --</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Incident / Loss Type</label>
              <select value={incidentType} onChange={(e) => setIncidentType(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-rose-500">
                {INCIDENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 2-Column Interactive Builder */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row h-[640px] overflow-hidden">
          
          {/* Left Column: Available Stock in Warehouse */}
          <div className="w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50">
            <div className="p-4 border-b border-slate-200 bg-white shrink-0">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide mb-3">Available Stock in Warehouse</h4>
              <input 
                type="text" 
                placeholder="Search available items..." 
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                disabled={!selectedWh}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-rose-500 disabled:bg-slate-100"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {!selectedWh ? (
                <div className="text-center p-8 text-slate-400 text-sm font-medium border-2 border-dashed border-slate-200 rounded-xl m-2">
                  Please select a warehouse above to view its stock.
                </div>
              ) : filteredStock.length === 0 ? (
                <div className="text-center p-8 text-slate-400 text-sm font-medium">No stock available in this warehouse.</div>
              ) : (
                filteredStock.map(stock => (
                  <div key={stock.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-white shadow-sm hover:border-rose-300 transition-colors">
                    <div className="truncate pr-2">
                      <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${stock.products?.product_type === 'LPG' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {stock.products?.product_type}
                        </span>
                        <p className="font-bold text-slate-900 text-xs truncate">{stock.products?.name}</p>
                      </div>
                      <p className="text-[10px] text-slate-500 font-mono mt-1">
                        Code: {stock.products?.code} | Current Stock: <span className="font-bold text-slate-800">{stock.quantity}</span> {stock.products?.unit_type}
                      </p>
                    </div>
                    <button onClick={() => handleAddToBag(stock)} className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shrink-0 hover:bg-rose-600 hover:text-white transition-colors shadow-sm">
                      <Icons.Plus />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Deduction Bag & Bottom Fields */}
          <div className="w-full md:w-1/2 flex flex-col bg-white">
            <div className="p-4 border-b border-rose-100 bg-rose-50 shrink-0 flex justify-between items-center">
              <h4 className="font-bold text-rose-900 text-xs uppercase tracking-wide flex items-center">
                <span className="mr-2 text-base">⚠️</span> Loss / Damage Deduction Bag
              </h4>
              <span className="bg-rose-600 text-white text-[10px] font-bold px-2 py-1 rounded-full">{bagItems.length} Items</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar relative">
              {bagItems.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-center p-4">
                  <span className="text-4xl mb-3 opacity-50">🗑️</span>
                  <p className="text-xs font-bold text-slate-500">No items selected for deduction</p>
                  <p className="text-[10px] mt-1">Click the + button on available stock items to add them here</p>
                </div>
              ) : (
                bagItems.map(item => (
                  <div key={item.product_id} className="bg-slate-50 p-3 rounded-xl border border-rose-100 shadow-sm relative">
                    <div className="flex justify-between items-start mb-2 pr-6 border-b border-slate-200 pb-2">
                      <p className="font-bold text-slate-900 text-xs leading-tight">{item.products?.name}</p>
                      <button onClick={() => handleRemoveFromBag(item.product_id)} className="text-rose-400 hover:text-rose-600 bg-rose-50 p-1.5 rounded-lg transition-colors absolute top-2 right-2">
                        <Icons.Trash />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[9px] font-bold text-slate-500 uppercase">Current Stock: <strong className="text-slate-800">{item.max_qty}</strong></span>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-bold text-rose-600 uppercase">Loss Qty:</span>
                        <input 
                          type="number" min="1" max={item.max_qty}
                          value={item.loss_qty || ''}
                          onChange={(e) => handleUpdateBagQty(item.product_id, e.target.value)}
                          className="w-20 text-right px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-bold text-rose-700 outline-none focus:border-rose-500"
                        />
                        <span className="text-[9px] font-bold text-slate-500 uppercase w-8">{item.products?.unit_type}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Bottom Section: Reported By, Ref No, Detailed Cause & Submit */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Reported By</label>
                  <input type="text" value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder="Name / Designation" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-bold outline-none focus:border-rose-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Incident / Ref No (Optional)</label>
                  <input type="text" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="Leave blank if N/A" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-bold outline-none focus:border-rose-500" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Specific Cause / Detailed Remarks</label>
                <textarea 
                  rows={3} 
                  value={remarks} 
                  onChange={(e) => setRemarks(e.target.value)} 
                  placeholder="Write detailed explanation of the gap, damage, or loss..." 
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-medium outline-none focus:border-rose-500 resize-none custom-scrollbar"
                ></textarea>
              </div>
              <button onClick={handleSubmitLoss} disabled={isSubmitting || bagItems.length === 0} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-md flex items-center justify-center disabled:opacity-50">
                {isSubmitting ? <><Icons.Spinner /> Processing Deduction...</> : 'Confirm & Deduct Damaged Stock'}
              </button>
            </div>
          </div>
        </div>

        {}
        {/* Bottom List: Historical Gap & Damage Logs */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-fit overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Recorded Gap & Damage History</h3>
            <div className="flex space-x-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icons.Search /></div>
                <input type="text" placeholder="Search TXN, Product, Cause..." value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-rose-500" />
              </div>
              <button onClick={handleExportExcel} className="flex items-center justify-center px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-colors shadow-sm shrink-0">
                <Icons.Download /> <span className="ml-1 hidden sm:inline">Excel</span>
              </button>
              <button onClick={handleExportPDF} className="flex items-center justify-center px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl hover:bg-rose-100 transition-colors shadow-sm shrink-0">
                <Icons.Download /> <span className="ml-1 hidden sm:inline">PDF</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse table-auto min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Date & TXN</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Warehouse</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Product Details</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Incident / Cause</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Deducted Qty</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center"><Icons.Spinner /></td></tr>
                ) : filteredLogs.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-sm text-slate-500 font-medium">No gap or damage records found.</td></tr>
                ) : (
                  filteredLogs.map(txn => {
                    const txnId = `TXN-${txn.id.split('-')[0].toUpperCase()}`;
                    return (
                      <tr key={txn.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-4 py-3 align-top">
                          <p className="font-bold text-slate-900 text-sm">{new Date(txn.created_at).toLocaleDateString()}</p>
                          <p className="text-[10px] text-indigo-600 font-mono font-bold mt-1">{txnId}</p>
                          {txn.reference_no && <p className="text-[9px] text-slate-400 mt-0.5">Ref: {txn.reference_no}</p>}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="font-bold text-slate-800 text-sm">{txn.warehouses?.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">Code: {txn.warehouses?.code}</p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="font-bold text-slate-900 text-sm">{txn.products?.name}</p>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${txn.products?.product_type === 'LPG' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
                              {txn.products?.product_type}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">Code: {txn.products?.code}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="text-[9px] font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded border border-rose-100 inline-block mb-1 uppercase">
                            TYPE: DAMAGE / LOSS
                          </span>
                          <p className="text-xs text-slate-700 font-medium whitespace-pre-wrap">{txn.remarks}</p>
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <span className="font-black text-rose-600 text-base">{txn.quantity}</span>
                          <span className="text-[10px] text-slate-500 ml-1 uppercase">{txn.products?.unit_type}</span>
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <div className="flex justify-end items-center space-x-1.5">
                            <button onClick={() => { setSelectedTxnDetails(txn); setDetailsModalOpen(true); }} className="px-2 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-[10px] font-bold border border-indigo-100 transition-colors">
                              Details
                            </button>
                            <button onClick={() => openEditModal(txn)} className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit Quantity">
                              <Icons.Edit />
                            </button>
                            <button onClick={() => { setTxnToRevert(txn); setRevertModalOpen(true); }} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Revert & Restore Stock">
                              <Icons.Trash />
                            </button>
                          </div>
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

      {/* --- DETAILS MODAL --- */}
      {detailsModalOpen && selectedTxnDetails && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900">Incident Details</h3>
                <p className="text-[10px] text-indigo-600 font-mono font-bold mt-0.5">TXN-{selectedTxnDetails.id.split('-')[0].toUpperCase()}</p>
              </div>
              <button onClick={() => setDetailsModalOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200"><Icons.Close /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                <div className="flex justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Warehouse</p>
                    <p className="font-bold text-slate-800 text-sm">{selectedTxnDetails.warehouses?.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Date & Time</p>
                    <p className="font-bold text-slate-800 text-xs">{new Date(selectedTxnDetails.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Affected Product</p>
                    <p className="font-bold text-slate-900 text-sm">{selectedTxnDetails.products?.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">Code: {selectedTxnDetails.products?.code}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-rose-500 uppercase">Deducted Loss</p>
                    <p className="font-black text-rose-600 text-lg">{selectedTxnDetails.quantity} <span className="text-xs text-slate-500">{selectedTxnDetails.products?.unit_type}</span></p>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Incident Cause & Remarks</p>
                <p className="text-xs font-medium text-slate-700 bg-rose-50/50 p-3 rounded-xl border border-rose-100 whitespace-pre-wrap">{selectedTxnDetails.remarks}</p>
              </div>
              <div className="text-[10px] text-slate-400 font-mono border-t border-slate-100 pt-3 space-y-1">
                <p>Logged By: {selectedTxnDetails.created_by_email || 'System'}</p>
                {selectedTxnDetails.updated_by_email && (
                  <p>Last Edited By: {selectedTxnDetails.updated_by_email} ({new Date(selectedTxnDetails.updated_at).toLocaleString()})</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT MODAL --- */}
      {editModalOpen && editingTxn && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900">Edit Loss / Damage Record</h3>
                <p className="text-[10px] text-indigo-600 font-mono font-bold mt-0.5">TXN-{editingTxn.id.split('-')[0].toUpperCase()}</p>
              </div>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200"><Icons.Close /></button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <p className="text-xs font-bold text-slate-800">{editingTxn.products?.name}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">
                  Max Allowed Capacity: <span className="text-emerald-600 font-black">{editMaxCapacity}</span> {editingTxn.products?.unit_type}
                  <span className="text-slate-400 font-normal ml-1 normal-case">(In Stock: {editCurrentStock} + Logged Loss: {editingTxn.quantity})</span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Adjusted Loss Quantity</label>
                <div className="flex items-center space-x-2">
                  <input 
                    type="number" min="1" max={editMaxCapacity}
                    value={editQty} 
                    onChange={(e) => setEditQty(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-rose-600 outline-none focus:border-indigo-500 text-right"
                  />
                  <span className="text-xs font-bold text-slate-500 uppercase w-12">{editingTxn.products?.unit_type}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Incident Cause / Remarks</label>
                <textarea 
                  rows={3}
                  value={editRemarks} 
                  onChange={(e) => setEditRemarks(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 resize-none custom-scrollbar"
                ></textarea>
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm shadow-md transition-all flex justify-center items-center disabled:opacity-50">
                {isSubmitting ? <><Icons.Spinner /> Updating...</> : 'Save Changes & Adjust Stock'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- REVERT CONFIRMATION MODAL --- */}
      {revertModalOpen && txnToRevert && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-5 border-b border-rose-100 bg-rose-50 flex justify-between items-center">
              <h3 className="font-bold text-rose-900">Revert & Restore Stock</h3>
              <button onClick={() => setRevertModalOpen(false)} className="text-rose-400 hover:text-rose-700 bg-white p-1.5 rounded-lg border border-rose-200"><Icons.Close /></button>
            </div>
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">🔄</div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">Restore Damaged Stock?</h4>
              <p className="text-sm text-slate-500 mb-6">
                Deleting this record will return <strong>{txnToRevert.quantity} {txnToRevert.products?.unit_type}</strong> of <strong>{txnToRevert.products?.name}</strong> back to the available stock of <strong>{txnToRevert.warehouses?.name}</strong>.
              </p>
              <button onClick={confirmRevert} disabled={isSubmitting} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-md transition-all flex justify-center items-center">
                {isSubmitting ? <><Icons.Spinner /> Restoring...</> : 'Yes, Delete Record & Restore Stock'}
              </button>
              <button onClick={() => setRevertModalOpen(false)} className="w-full bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold py-3 rounded-xl mt-3 transition-all">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}