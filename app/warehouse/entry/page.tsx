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

export default function BulkEntryPage() {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Form Settings
  const [entryDate, setEntryDate] = useState('');
  const [receiveSourceType, setReceiveSourceType] = useState('DONOR_PARTNER'); 
  const [bulkPartnerId, setBulkPartnerId] = useState('');
  const [bulkWarehouseId, setBulkWarehouseId] = useState('');
  const [bulkRefNo, setBulkRefNo] = useState(''); 
  const [bulkRemarks, setBulkRemarks] = useState('');
  
  // Interactive Builder States
  const [bagItems, setBagItems] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filters for Table
  const [searchTable, setSearchTable] = useState('');

  // Custom Edit Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<any>(null);
  const [editQty, setEditQty] = useState<number | ''>('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Custom Revert Modal State
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [txnToRevert, setTxnToRevert] = useState<any>(null);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

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
    
    const [whRes, prodRes, partRes] = await Promise.all([
      supabase.from('warehouses').select('id, name, code').order('name'),
      supabase.from('products').select('id, name, code, unit_type, product_type').order('name'),
      supabase.from('partners').select('id, name, type').order('name')
    ]);

    if (whRes.data) setWarehouses(whRes.data);
    if (prodRes.data) setProducts(prodRes.data);
    if (partRes.data) setPartners(partRes.data);

    await loadTransactions();
    setIsLoading(false);
  };

  const loadTransactions = async () => {
    const { data } = await supabase
      .from('inventory_transactions')
      .select(`
        *,
        warehouses (name, code),
        products (name, code, unit_type, product_type),
        partners (name)
      `)
      .eq('transaction_type', 'IN')
      .is('transfer_id', null) // Only show bulk entries, not transfers
      .not('remarks', 'ilike', '%Transfer%') 
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (data) setTransactions(data);
  };

  const handleAddToBag = (product: any) => {
    if (bagItems.find(item => item.product_id === product.id)) return;
    setBagItems(prev => [...prev, { product_id: product.id, qty: '', ...product }]);
  };

  const handleRemoveFromBag = (productId: string) => {
    setBagItems(bagItems.filter(i => i.product_id !== productId));
  };

  const handleUpdateQty = (productId: string, val: string) => {
    setBagItems(bagItems.map(item => item.product_id === productId ? { ...item, qty: val === '' ? '' : Number(val) } : item));
  };

  const handleDragStart = (e: React.DragEvent, product: any) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(product));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const product = JSON.parse(e.dataTransfer.getData('text/plain'));
      handleAddToBag(product);
    } catch(err) { }
  };

  const handleStockEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkWarehouseId || bagItems.length === 0) {
      showMessage("Please select a warehouse and add at least one product.", "error");
      return;
    }
    
    const invalidItems = bagItems.filter(i => !i.qty || i.qty <= 0);
    if(invalidItems.length > 0) {
      showMessage("Please enter a valid quantity for all items in the bag.", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      const sourceName = receiveSourceType === 'CONTINGENCY' ? 'Contingency Stock' : 
                         receiveSourceType === 'BULK_ENTRY' ? 'Initial Bulk Entry' : 'Donor/Partner';

      for (const item of bagItems) {
        const { data: invData } = await supabase.from('inventory')
          .select('*').eq('warehouse_id', bulkWarehouseId).eq('product_id', item.product_id).single();

        if (invData) {
          await supabase.from('inventory')
            .update({ quantity: invData.quantity + item.qty, last_updated: new Date().toISOString() })
            .eq('id', invData.id);
        } else {
          await supabase.from('inventory')
            .insert([{ warehouse_id: bulkWarehouseId, product_id: item.product_id, quantity: item.qty }]);
        }

        const entryDateTime = new Date(entryDate);
        const now = new Date();
        entryDateTime.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

        await supabase.from('inventory_transactions').insert([{
          warehouse_id: bulkWarehouseId,
          product_id: item.product_id,
          partner_id: receiveSourceType === 'DONOR_PARTNER' ? (bulkPartnerId || null) : null,
          transaction_type: 'IN',
          quantity: item.qty,
          reference_no: bulkRefNo || null,
          remarks: bulkRemarks || `Received via ${sourceName}`,
          created_by: currentUser?.id || null,
          created_by_email: currentUser?.email || null,
          created_at: entryDateTime.toISOString() 
        }]);
      }

      showMessage("Bulk stock entry recorded successfully!", "success");
      setBagItems([]); setBulkRemarks(''); setBulkRefNo('');
      await loadTransactions();

    } catch (err) {
      showMessage("Failed to process entry. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (txn: any) => {
    setEditingTxn(txn);
    setEditQty(txn.quantity);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTxn) return;
    
    const newQty = Number(editQty);
    if (isNaN(newQty) || newQty <= 0) {
      showMessage("Invalid quantity entered.", "error");
      return;
    }

    const qtyDiff = newQty - editingTxn.quantity;
    if (qtyDiff === 0) {
      setIsEditModalOpen(false);
      return;
    }

    setIsSavingEdit(true);
    try {
      // 1. Adjust Inventory
      const { data: invRecord } = await supabase.from('inventory')
        .select('id, quantity').eq('warehouse_id', editingTxn.warehouse_id).eq('product_id', editingTxn.product_id).single();

      if (invRecord) {
        const updatedQty = invRecord.quantity + qtyDiff;
        if(updatedQty < 0) {
          showMessage("Error: Not enough stock to reduce this much!", "error");
          setIsSavingEdit(false);
          return;
        }
        await supabase.from('inventory').update({ quantity: updatedQty }).eq('id', invRecord.id);
      } else if (qtyDiff > 0) {
         await supabase.from('inventory').insert([{ warehouse_id: editingTxn.warehouse_id, product_id: editingTxn.product_id, quantity: qtyDiff }]);
      }

      // 2. Update Transaction Log with Audit Details
      await supabase.from('inventory_transactions').update({ 
        quantity: newQty,
        updated_by: currentUser?.id || null,
        updated_by_email: currentUser?.email || null,
        updated_at: new Date().toISOString()
      }).eq('id', editingTxn.id);

      showMessage("Transaction quantity updated successfully!", "success");
      await loadTransactions();
      setIsEditModalOpen(false);
    } catch (error) {
      showMessage("Failed to edit transaction.", "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const confirmRevertTransaction = async () => {
    if (!txnToRevert) return;
    setIsSavingEdit(true);
    try {
      const { data: invRecord } = await supabase.from('inventory')
        .select('id, quantity').eq('warehouse_id', txnToRevert.warehouse_id).eq('product_id', txnToRevert.product_id).single();

      if (invRecord) {
        const newQty = invRecord.quantity - txnToRevert.quantity;
        await supabase.from('inventory').update({ quantity: newQty < 0 ? 0 : newQty }).eq('id', invRecord.id);
      }
      await supabase.from('inventory_transactions').delete().eq('id', txnToRevert.id);
      showMessage("Entry reverted and stock adjusted.", "success");
      setRevertModalOpen(false);
      await loadTransactions();
    } catch (error) {
      showMessage("Failed to revert transaction.", "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleExportExcel = () => {
    const exportData = filteredTransactions.map(t => {
      const txnId = `TXN-${t.id.split('-')[0].toUpperCase()}`;
      return {
        "Date": new Date(t.created_at).toLocaleDateString(),
        "Time": new Date(t.created_at).toLocaleTimeString(),
        "System TXN ID": txnId,
        "PO / Ref No": t.reference_no || 'N/A',
        "Receiving Warehouse": t.warehouses?.name || 'Unknown',
        "Source / Partner": t.partners?.name || 'Internal / Direct',
        "Product Code": t.products?.code || 'N/A',
        "Product Name": t.products?.name || 'Unknown',
        "Product Type": t.products?.product_type || 'N/A',
        "Quantity (IN)": t.quantity,
        "Unit": t.products?.unit_type || '',
        "Remarks / Details": t.remarks || 'N/A',
        "Created By (Email)": t.created_by_email || 'System',
        "Created By (ID)": t.created_by || 'N/A',
        "Last Updated By": t.updated_by_email || 'N/A',
        "Updated At": t.updated_at ? new Date(t.updated_at).toLocaleString() : 'N/A'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bulk_Entries");
    XLSX.writeFile(workbook, `Bulk_Entry_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text("Direct Stock Entry (Bulk) - Detailed Audit Report", 14, 15);
    
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 21);

    const tableColumn = [
      "Date & Time", 
      "TXN ID & PO", 
      "Target Warehouse", 
      "Source / Partner", 
      "Product Details", 
      "Qty (IN)", 
      "Remarks", 
      "User Audit (Created / Updated)"
    ];
    const tableRows: any[] = [];

    filteredTransactions.forEach(t => {
      const txnId = `TXN-${t.id.split('-')[0].toUpperCase()}`;
      const dateStr = new Date(t.created_at).toLocaleDateString();
      const timeStr = new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const createdAudit = `Cr: ${t.created_by_email || 'System'}`;
      const updatedAudit = t.updated_by_email ? `\nUpd: ${t.updated_by_email} (${new Date(t.updated_at).toLocaleDateString()})` : '';

      tableRows.push([
        `${dateStr}\n${timeStr}`,
        `${txnId}${t.reference_no ? `\nPO: ${t.reference_no}` : ''}`,
        t.warehouses?.name || 'Unknown',
        t.partners?.name || 'Direct / Bulk',
        `${t.products?.name || 'Unknown'}\n[${t.products?.code || 'N/A'}]`,
        `+${t.quantity} ${t.products?.unit_type || ''}`,
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
      headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    doc.save(`Bulk_Entry_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
    p.code.toLowerCase().includes(productSearch.toLowerCase())
  );

  const filteredTransactions = transactions.filter(t => {
    const txnId = `TXN-${t.id.split('-')[0].toUpperCase()}`;
    return txnId.toLowerCase().includes(searchTable.toLowerCase()) ||
           (t.reference_no || '').toLowerCase().includes(searchTable.toLowerCase()) || 
           (t.products?.name || '').toLowerCase().includes(searchTable.toLowerCase()) ||
           (t.warehouses?.name || '').toLowerCase().includes(searchTable.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 relative">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 shadow-sm">
        <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Direct Stock Entry (Bulk)</h2>
          <p className="text-sm text-slate-500 hidden md:block">Record goods directly from external Suppliers, Donors or Initial Stock</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        
        {/* Toast Message */}
        {msg.text && (
          <div className={`p-4 rounded-xl shadow-md border text-sm font-bold animate-in slide-in-from-top-2 flex justify-between items-center shrink-0 fixed top-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="flex items-center"><span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}</span>
            <button onClick={() => setMsg({text:'', type:''})} className="p-1 rounded-md hover:bg-black/5"><Icons.Close /></button>
          </div>
        )}

        {/* Compact Settings Card (Remarks & PO moved to bottom of Entry Bag) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Entry Date</label>
              <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-emerald-500" />
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Source Type</label>
              <select value={receiveSourceType} onChange={(e) => {setReceiveSourceType(e.target.value); setBulkPartnerId('');}} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-emerald-500">
                <option value="DONOR_PARTNER">Donor / Partner</option>
                <option value="CONTINGENCY">Contingency Stock</option>
                <option value="BULK_ENTRY">Initial Bulk Entry</option>
              </select>
            </div>

            {receiveSourceType === 'DONOR_PARTNER' && (
              <div className="md:col-span-1 animate-in fade-in">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Select Partner</label>
                <select value={bulkPartnerId} onChange={(e) => setBulkPartnerId(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-emerald-500">
                  <option value="">-- Internal / Direct --</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            <div className={receiveSourceType === 'DONOR_PARTNER' ? "md:col-span-1" : "md:col-span-2"}>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Receiving Warehouse</label>
              <select value={bulkWarehouseId} onChange={(e) => setBulkWarehouseId(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-emerald-500 border-emerald-300">
                <option value="">-- Select Destination --</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 2-Column Builder */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row h-[560px] overflow-hidden">
          
          {/* Left: Products */}
          <div className="w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50">
            <div className="p-4 border-b border-slate-200 bg-white shrink-0">
               <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide mb-3">Available Products</h4>
               <input 
                 type="text" 
                 placeholder="Search by name or code..." 
                 value={productSearch}
                 onChange={(e) => setProductSearch(e.target.value)}
                 className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-emerald-500"
               />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
               {filteredProducts.map(product => (
                 <div key={product.id} draggable onDragStart={(e) => handleDragStart(e, product)} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-white shadow-sm cursor-grab active:cursor-grabbing hover:border-emerald-300 transition-colors">
                   <div className="flex items-center space-x-2 truncate pr-2">
                     <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${product.product_type === 'LPG' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
                       {product.product_type}
                     </span>
                     <div className="truncate">
                       <p className="font-bold text-slate-900 text-xs truncate">{product.name}</p>
                       <p className="text-[9px] text-slate-500 font-mono mt-0.5">Code: {product.code} | Unit: {product.unit_type}</p>
                     </div>
                   </div>
                   <button onClick={() => handleAddToBag(product)} className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 hover:bg-emerald-600 hover:text-white transition-colors shadow-sm">
                     <Icons.Plus />
                   </button>
                 </div>
               ))}
            </div>
          </div>

          {/* Right: Entry Bag + Bottom Fields */}
          <div className="w-full md:w-1/2 flex flex-col bg-white" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
            <div className="p-4 border-b border-emerald-100 bg-emerald-50 shrink-0 flex justify-between items-center">
               <h4 className="font-bold text-emerald-900 text-xs uppercase tracking-wide flex items-center">
                 <span className="mr-2 text-base">📥</span> Entry Bag
               </h4>
               <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded-full">{bagItems.length} Added</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar relative">
               {bagItems.length === 0 ? (
                 <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-center p-4">
                   <span className="text-4xl mb-3 opacity-50">📦</span>
                   <p className="text-xs font-bold text-slate-500">Drag & Drop products here</p>
                   <p className="text-[10px] mt-1">Or click the + button</p>
                 </div>
               ) : (
                 bagItems.map(item => (
                   <div key={item.product_id} className="bg-slate-50 p-3 rounded-xl border border-emerald-100 shadow-sm relative">
                     <div className="flex justify-between items-start mb-2 pr-6 border-b border-slate-100 pb-2">
                       <p className="font-bold text-slate-900 text-xs leading-tight">{item.name}</p>
                       <button onClick={() => handleRemoveFromBag(item.product_id)} className="text-rose-400 hover:text-rose-600 bg-rose-50 p-1.5 rounded-lg transition-colors absolute top-2 right-2">
                         <Icons.Trash />
                       </button>
                     </div>
                     <div className="flex items-center justify-between mt-2">
                       <span className="text-[10px] font-bold text-slate-600 uppercase">Received Qty:</span>
                       <div className="flex items-center space-x-2">
                         <input 
                           type="number" min="1"
                           value={item.qty} 
                           onChange={(e) => handleUpdateQty(item.product_id, e.target.value)}
                           className="w-20 text-right px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-bold text-emerald-700 outline-none focus:border-emerald-500"
                           placeholder="0"
                         />
                         <span className="text-[9px] font-bold text-slate-500 uppercase w-8">{item.unit_type}</span>
                       </div>
                     </div>
                   </div>
                 ))
               )}
            </div>

            {/* Bottom Section: Remarks, PO & Submit Button */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0 space-y-3">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                 <div>
                   <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Remarks / Details</label>
                   <input type="text" value={bulkRemarks} onChange={(e) => setBulkRemarks(e.target.value)} placeholder="e.g. Received via Truck" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-bold outline-none focus:border-emerald-500" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">PO / Reference No (Optional)</label>
                   <input type="text" value={bulkRefNo} onChange={(e) => setBulkRefNo(e.target.value)} placeholder="Leave blank if N/A" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-bold outline-none focus:border-emerald-500" />
                 </div>
               </div>
               <button onClick={handleStockEntry} disabled={isSubmitting || bagItems.length === 0} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-md flex items-center justify-center disabled:opacity-50">
                 {isSubmitting ? <><Icons.Spinner /> Processing...</> : 'Confirm & Save Stock'}
               </button>
            </div>
          </div>
        </div>

        {/* Recent Entries List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-fit overflow-hidden">
           <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
             <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Recent Inbound Transactions</h3>
             <div className="flex space-x-2 w-full sm:w-auto">
               <div className="relative flex-1 sm:w-64">
                 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icons.Search /></div>
                 <input type="text" placeholder="Search TXN, PO, Product..." value={searchTable} onChange={(e) => setSearchTable(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500" />
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
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Product Details</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Warehouse & Source</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Items / Qty</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr><td colSpan={5} className="p-8 text-center"><Icons.Spinner /></td></tr>
                  ) : filteredTransactions.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-sm text-slate-500 font-medium">No direct entries found.</td></tr>
                  ) : (
                    filteredTransactions.map((txn) => {
                      const txnId = `TXN-${txn.id.split('-')[0].toUpperCase()}`;
                      return (
                        <tr key={txn.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-4 py-3 align-top">
                            <p className="font-bold text-slate-900 text-sm">{new Date(txn.created_at).toLocaleDateString()}</p>
                            <p className="text-[10px] text-indigo-600 font-bold mt-1">{txnId}</p>
                            {txn.reference_no && <p className="text-[10px] text-slate-400 mt-0.5">PO: {txn.reference_no}</p>}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <p className="font-bold text-slate-800 text-sm line-clamp-1">{txn.products?.name}</p>
                            <div className="flex items-center space-x-2 mt-1">
                               <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${txn.products?.product_type === 'LPG' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                 {txn.products?.product_type}
                               </span>
                               <span className="text-[10px] text-slate-500 font-mono">Code: {txn.products?.code}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                             <p className="font-semibold text-slate-800 text-sm line-clamp-1">{txn.warehouses?.name}</p>
                             <p className="text-[10px] text-slate-500 mt-0.5">{txn.remarks}</p>
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                             <span className="font-black text-emerald-600 text-base">+{txn.quantity}</span>
                             <span className="text-[10px] text-slate-500 ml-1 uppercase">{txn.products?.unit_type}</span>
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                             <div className="flex justify-end space-x-2">
                               <button onClick={() => openEditModal(txn)} className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100" title="Edit Quantity">
                                 <Icons.Edit />
                               </button>
                               <button onClick={() => { setTxnToRevert(txn); setRevertModalOpen(true); }} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100" title="Delete & Revert">
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

      {/* --- CUSTOM EDIT MODAL --- */}
      {isEditModalOpen && editingTxn && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900">Edit Transaction</h3>
                <p className="text-[10px] text-indigo-600 font-mono font-bold mt-1">TXN-{editingTxn.id.split('-')[0].toUpperCase()}</p>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200"><Icons.Close /></button>
            </div>
            
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Product</label>
                 <p className="text-sm font-bold text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-100">{editingTxn.products?.name}</p>
               </div>
               
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Quantity</label>
                 <div className="flex items-center space-x-2">
                   <input 
                     type="number" min="1"
                     value={editQty} 
                     onChange={(e) => setEditQty(e.target.value === '' ? '' : Number(e.target.value))} 
                     required
                     className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 transition-colors text-right" 
                   />
                   <span className="text-[10px] font-bold text-slate-500 uppercase">{editingTxn.products?.unit_type}</span>
                 </div>
                 <p className="text-[10px] text-slate-500 mt-1">Current logged quantity is {editingTxn.quantity}. Changing this will update inventory stock.</p>
               </div>

               <button type="submit" disabled={isSavingEdit} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-md flex justify-center items-center mt-2 disabled:opacity-50">
                 {isSavingEdit ? <><Icons.Spinner /> Saving...</> : 'Save Changes'}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* --- CUSTOM REVERT CONFIRMATION MODAL --- */}
      {revertModalOpen && txnToRevert && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-rose-100 bg-rose-50 flex justify-between items-center">
              <h3 className="font-bold text-rose-900">Revert & Delete Entry</h3>
              <button onClick={() => setRevertModalOpen(false)} className="text-rose-400 hover:text-rose-700 bg-white p-1.5 rounded-lg border border-rose-200"><Icons.Close /></button>
            </div>
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">⚠️</div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">Are you sure?</h4>
              <p className="text-sm text-slate-500 mb-6">
                Reverting <strong>{txnToRevert.products?.name}</strong> will permanently delete this transaction log and deduct <strong>{txnToRevert.quantity} {txnToRevert.products?.unit_type}</strong> from {txnToRevert.warehouses?.name}.
              </p>
              <button onClick={confirmRevertTransaction} disabled={isSavingEdit} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl shadow-md transition-all flex justify-center items-center">
                {isSavingEdit ? <><Icons.Spinner /> Reverting...</> : 'Yes, Revert & Deduct Stock'}
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