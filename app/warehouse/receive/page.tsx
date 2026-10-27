"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Icons } from '../../components/Icons';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function ProductReceivePage() {
  const [inTransitTransfers, setInTransitTransfers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const [searchPO, setSearchPO] = useState('');
  const [searchProduct, setSearchProduct] = useState('');
  const [searchSource, setSearchSource] = useState('');
  const [filterDate, setFilterDate] = useState('');

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<any>(null);
  const [transferItems, setTransferItems] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectStep, setRejectStep] = useState(1);

  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUser(user);
    });
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    
    const [transfersRes, txnsRes, whsRes, prodsRes, partsRes] = await Promise.all([
      supabase.from('stock_transfers').select('*').eq('status', 'In Transit').eq('destination_type', 'WH').order('created_at', { ascending: false }),
      supabase.from('inventory_transactions').select(`
        *,
        warehouses (name, code),
        products (name, code, unit_type, product_type),
        partners (name),
        stock_transfers (from_warehouse_id)
      `).eq('transaction_type', 'IN').order('created_at', { ascending: false }).limit(100),
      supabase.from('warehouses').select('id, name, code'),
      supabase.from('products').select('id, name, code, unit_type, product_type'),
      supabase.from('partners').select('id, name')
    ]);

    const whs = whsRes.data || [];
    
    if (transfersRes.data) {
      const mappedTransfers = transfersRes.data.map(t => ({
        ...t,
        from_warehouse: whs.find(w => w.id === t.from_warehouse_id),
        to_warehouse: whs.find(w => w.id === t.to_warehouse_id)
      }));
      setInTransitTransfers(mappedTransfers);
    }

    if (txnsRes.data) {
      // mapping source exact warehouse name using the relation
      const mappedTxns = txnsRes.data.map(t => {
        let sourceName = 'Unknown Source';
        if (t.partners?.name) {
          sourceName = t.partners.name;
        } else if (t.stock_transfers?.from_warehouse_id) {
          const sWh = whs.find(w => w.id === t.stock_transfers.from_warehouse_id);
          if (sWh) sourceName = sWh.name;
        } else if (t.remarks?.toLowerCase().includes('from')) {
          sourceName = t.remarks.split(/from/i)[1].trim();
        } else {
          sourceName = 'Internal/Bulk Entry';
        }
        
        return {
          ...t,
          exact_source: sourceName
        };
      });
      setTransactions(mappedTxns);
    }
    setIsLoading(false);
  };

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const openTransferModal = async (transfer: any) => {
    setSelectedTransfer(transfer);
    setTransferModalOpen(true);
    const { data } = await supabase.from('stock_transfer_items').select('*').eq('transfer_id', transfer.id);
    if(data) {
      const productIds = data.map(d => d.product_id);
      const { data: prods } = await supabase.from('products').select('*').in('id', productIds);
      const mappedItems = data.map(d => ({ ...d, products: prods?.find(p => p.id === d.product_id) }));
      setTransferItems(mappedItems);
    }
  };

  const openRejectModal = (transfer: any) => {
    setSelectedTransfer(transfer);
    setRejectStep(1);
    setRejectModalOpen(true);
  };

  const handleConfirmTransferReceive = async () => {
    if(!selectedTransfer || transferItems.length === 0) return;
    setIsProcessing(true);

    try {
      const whId = selectedTransfer.to_warehouse.id;
      const ledgerEntries = [];
      const txnId = `TXN-${selectedTransfer.id.split('-')[0].toUpperCase()}`;

      for (const item of transferItems) {
        const { data: invRecord } = await supabase.from('inventory')
          .select('*').eq('warehouse_id', whId).eq('product_id', item.products.id).single();

        if (invRecord) {
          await supabase.from('inventory').update({ quantity: invRecord.quantity + item.quantity, last_updated: new Date().toISOString() }).eq('id', invRecord.id);
        } else {
          await supabase.from('inventory').insert([{ warehouse_id: whId, product_id: item.products.id, quantity: item.quantity }]);
        }

        ledgerEntries.push({
          warehouse_id: whId,
          product_id: item.products.id,
          transaction_type: 'IN',
          quantity: item.quantity,
          reference_no: selectedTransfer.reference_no || null,
          transfer_id: selectedTransfer.id,
          remarks: `${txnId} | Received from ${selectedTransfer.from_warehouse?.name}`,
          created_by: currentUser?.id || null,
          created_by_email: currentUser?.email || null
        });
      }

      await supabase.from('inventory_transactions').insert(ledgerEntries);
      await supabase.from('stock_transfers').update({ 
        status: 'Received',
        updated_by: currentUser?.id || null,
        updated_by_email: currentUser?.email || null,
        updated_at: new Date().toISOString()
      }).eq('id', selectedTransfer.id);

      showMessage(`Successfully received transfer! System ID: ${txnId}`);
      setTransferModalOpen(false);
      fetchInitialData();
    } catch (err: any) {
      showMessage(`Error receiving stock: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectTransfer = async () => {
    if(!selectedTransfer) return;
    setIsProcessing(true);
    try {
      const { data: items } = await supabase.from('stock_transfer_items').select('*').eq('transfer_id', selectedTransfer.id);
      if (items) {
        for (const item of items) {
          const { data: currentInv } = await supabase.from('inventory').select('id, quantity').eq('warehouse_id', selectedTransfer.from_warehouse_id).eq('product_id', item.product_id).single();
          if (currentInv) {
            await supabase.from('inventory').update({ quantity: currentInv.quantity + item.quantity }).eq('id', currentInv.id);
          }
        }
      }
      
      // Delete OUT transaction from source
      await supabase.from('inventory_transactions').delete().eq('transfer_id', selectedTransfer.id).eq('transaction_type', 'OUT');
      
      await supabase.from('stock_transfers').update({ 
        status: 'Rejected',
        updated_by: currentUser?.id || null,
        updated_by_email: currentUser?.email || null,
        updated_at: new Date().toISOString()
      }).eq('id', selectedTransfer.id);

      showMessage("Transfer Rejected and stock returned to source.", "success");
      setRejectModalOpen(false);
      fetchInitialData();
    } catch (err: any) {
      showMessage(`Error rejecting transfer: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
      setRejectStep(1);
    }
  };

  const handleExportExcel = () => {
    const exportData = filteredTransactions.map(t => {
      const txnIdString = t.transfer_id ? `TXN-${t.transfer_id.split('-')[0].toUpperCase()}` : `TXN-${t.id.split('-')[0].toUpperCase()}`;
      return {
        "Date": new Date(t.created_at).toLocaleDateString(),
        "Time": new Date(t.created_at).toLocaleTimeString(),
        "System TXN ID": txnIdString,
        "PO / Ref No": t.reference_no || 'N/A',
        "Source / From": t.exact_source,
        "Receiving Warehouse": t.warehouses?.name || 'Unknown',
        "Product Code": t.products?.code || 'N/A',
        "Product Name": t.products?.name || 'Unknown',
        "Product Type": t.products?.product_type || 'N/A',
        "Quantity Received (IN)": t.quantity,
        "Unit": t.products?.unit_type || '',
        "Remarks": t.remarks || 'N/A',
        "Logged By (Email)": t.created_by_email || 'System',
        "Logged By (User ID)": t.created_by || 'N/A',
        "Last Updated By": t.updated_by_email || 'N/A',
        "Updated At": t.updated_at ? new Date(t.updated_at).toLocaleString() : 'N/A'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inbound_Receives");
    XLSX.writeFile(workbook, `Product_Receive_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text("Internal Product Receive - Detailed Audit Report", 14, 15);
    
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 21);

    const tableColumn = [
      "Date & Time", 
      "TXN ID & PO", 
      "Source / From", 
      "Target WH", 
      "Product Details", 
      "Qty (IN)", 
      "Remarks", 
      "User Audit (Logged / Updated)"
    ];
    const tableRows: any[] = [];

    filteredTransactions.forEach(t => {
      const txnIdString = t.transfer_id ? `TXN-${t.transfer_id.split('-')[0].toUpperCase()}` : `TXN-${t.id.split('-')[0].toUpperCase()}`;
      const dateStr = new Date(t.created_at).toLocaleDateString();
      const timeStr = new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const createdAudit = `Log: ${t.created_by_email || 'System'}`;
      const updatedAudit = t.updated_by_email ? `\nUpd: ${t.updated_by_email}` : '';

      tableRows.push([
        `${dateStr}\n${timeStr}`,
        `${txnIdString}${t.reference_no ? `\nPO: ${t.reference_no}` : ''}`,
        t.exact_source,
        t.warehouses?.name || 'N/A',
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
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    doc.save(`Product_Receive_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const filteredTransactions = transactions.filter(t => {
    const txnIdString = t.transfer_id ? `TXN-${t.transfer_id.split('-')[0].toUpperCase()}` : `TXN-${t.id.split('-')[0].toUpperCase()}`;
    const matchTXN = txnIdString.toLowerCase().includes(searchPO.toLowerCase());
    const matchPO = (t.reference_no || '').toLowerCase().includes(searchPO.toLowerCase());
    const matchProduct = (t.products?.name || '').toLowerCase().includes(searchProduct.toLowerCase()) || (t.products?.code || '').toLowerCase().includes(searchProduct.toLowerCase());
    const matchSource = (t.exact_source || '').toLowerCase().includes(searchSource.toLowerCase());
    const matchDate = filterDate ? t.created_at.startsWith(filterDate) : true;
    
    return (matchTXN || matchPO) && matchProduct && matchSource && matchDate;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 relative">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 shadow-sm z-10">
        <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Internal Product Receive</h2>
          <p className="text-sm text-slate-500 hidden md:block">Receive products sent from other warehouses</p>
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

        <div className="bg-gradient-to-r from-indigo-600 to-cyan-600 rounded-2xl p-6 text-white shadow-md flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h3 className="text-lg font-bold flex items-center"><span className="mr-2 text-2xl">📥</span> Need to receive from a Donor or Bulk Entry?</h3>
            <p className="text-indigo-100 text-sm mt-1">Use the interactive Bulk Entry Builder to add new stock quickly.</p>
          </div>
          <Link href="/warehouse/entry" className="px-6 py-3 bg-white text-indigo-700 font-bold rounded-xl shadow-sm hover:shadow-lg hover:scale-105 transition-all whitespace-nowrap">
            Go to Bulk Entry →
          </Link>
        </div>
        
        {/* Pending In Transit Transfers */}
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden flex flex-col shrink-0">
           <div className="p-4 border-b border-amber-200 bg-amber-50/50 flex justify-between items-center">
              <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wide flex items-center">
                <span className="mr-2 text-lg">🚚</span> Incoming Transfers (Pending)
              </h3>
              <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-full">{inTransitTransfers.length} Pending</span>
           </div>
           <div className="p-2 space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar bg-slate-50">
              {isLoading ? (
                <div className="p-4 text-center"><Icons.Spinner /></div>
              ) : inTransitTransfers.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500 font-medium">No pending incoming transfers.</div>
              ) : (
                inTransitTransfers.map(t => {
                  const txnId = `TXN-${t.id.split('-')[0].toUpperCase()}`;
                  return (
                    <div key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-amber-300 transition-all gap-4">
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{new Date(t.transfer_date).toLocaleDateString()}</p>
                        <p className="text-[10px] font-bold text-indigo-600 mt-1">{txnId}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-bold uppercase">Source: <span className="text-slate-600">{t.from_warehouse?.name || 'Unknown'}</span></p>
                        {t.reference_no && <p className="text-[10px] text-slate-400 mt-0.5">PO: {t.reference_no}</p>}
                      </div>
                      <div className="flex flex-col items-end shrink-0 gap-2">
                        <span className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 uppercase">DESTINATION: {t.to_warehouse?.name}</span>
                        <div className="flex space-x-2">
                          <button onClick={() => openRejectModal(t)} className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold rounded-lg hover:bg-rose-100 transition-colors">
                            Reject
                          </button>
                          <button onClick={() => openTransferModal(t)} className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow-md transition-all">
                            Review & Receive
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
           </div>
        </div>

        {/* Recent Receives List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden min-h-[500px]">
           <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Recent Receives (History)</h3>
              <div className="flex space-x-2">
                <button onClick={handleExportExcel} className="flex items-center px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-colors shadow-sm">
                  <Icons.Download /> <span className="ml-1">Excel</span>
                </button>
                <button onClick={handleExportPDF} className="flex items-center px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl hover:bg-rose-100 transition-colors shadow-sm">
                  <Icons.Download /> <span className="ml-1">PDF</span>
                </button>
              </div>
           </div>
           
           <div className="p-4 border-b border-slate-100 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icons.Search /></div>
                <input type="text" placeholder="Search TXN / PO..." value={searchPO} onChange={(e) => setSearchPO(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" />
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icons.Search /></div>
                <input type="text" placeholder="Search Product..." value={searchProduct} onChange={(e) => setSearchProduct(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" />
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icons.Search /></div>
                <input type="text" placeholder="Search Source..." value={searchSource} onChange={(e) => setSearchSource(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" />
              </div>
              <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" />
           </div>

           <div className="flex-1 overflow-y-auto p-3 bg-slate-50/50 space-y-3 custom-scrollbar">
              {isLoading ? (
                <div className="p-10 text-center"><Icons.Spinner /></div>
              ) : filteredTransactions.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500 font-medium">No transactions found matching criteria.</div>
              ) : (
                filteredTransactions.map(txn => {
                  const txnIdString = txn.transfer_id ? `TXN-${txn.transfer_id.split('-')[0].toUpperCase()}` : `TXN-${txn.id.split('-')[0].toUpperCase()}`;
                  
                  return (
                    <div key={txn.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-indigo-200 transition-colors">
                      <div className="flex-1">
                        <div className="flex flex-wrap gap-2 items-center mb-2">
                           <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">{new Date(txn.created_at).toLocaleDateString()}</span>
                           <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">{txnIdString}</span>
                           {txn.reference_no && <span className="text-[10px] font-bold text-slate-400 border border-slate-200 px-2 py-0.5 rounded">PO: {txn.reference_no}</span>}
                        </div>
                        
                        <div className="flex items-center space-x-2 my-2">
                           <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${txn.products?.product_type === 'LPG' ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                             {txn.products?.product_type}
                           </span>
                           <p className="font-bold text-slate-800 text-sm truncate">{txn.products?.name}</p>
                        </div>
                        
                        <div className="flex items-center gap-4 mt-2 border-t border-slate-100 pt-2">
                          <span className="text-xs text-slate-500">
                            <span className="text-[9px] font-bold text-slate-400 uppercase mr-1">Source:</span> 
                            <span className="font-semibold text-slate-700">{txn.exact_source}</span>
                          </span>
                          <span className="text-xs text-slate-500">
                            <span className="text-[9px] font-bold text-slate-400 uppercase mr-1">Target WH:</span> 
                            <span className="font-semibold text-slate-700">{txn.warehouses?.name}</span>
                          </span>
                          <span className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100 uppercase">TYPE: IN</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2 border-t border-slate-100 pt-3 sm:border-0 sm:pt-0 shrink-0">
                        <div className="text-right flex items-center">
                          <span className="font-black text-emerald-600 text-xl">+{txn.quantity}</span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase ml-1">{txn.products?.unit_type}</span>
                        </div>
                        <button onClick={() => {setSelectedTransaction(txn); setDetailsModalOpen(true);}} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors border border-indigo-100 mt-2">
                          View Details
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
           </div>
        </div>
      </div>

      {/* Transfer Modals omitted for brevity - UI exactly same as before but uses showMessage instead of alert */}
      {/* ... [Modals logic unchanged visually, replaced alert() with showMessage()] ... */}

      {transferModalOpen && selectedTransfer && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Receive Internal Transfer</h3>
                <p className="text-xs font-bold text-indigo-600 mt-0.5">TXN-{selectedTransfer.id.split('-')[0].toUpperCase()}</p>
              </div>
              <button onClick={() => setTransferModalOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200"><Icons.Close /></button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
               <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Manifested Items</h4>
               <div className="space-y-3">
                 {transferItems.map((item, idx) => (
                   <div key={idx} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
                     <div className="flex items-center space-x-3">
                       <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${item.products?.product_type === 'LPG' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
                         {item.products?.product_type}
                       </span>
                       <div>
                         <p className="text-sm font-bold text-slate-900">{item.products?.name}</p>
                         <p className="text-[10px] text-slate-500 font-mono mt-0.5">{item.products?.code}</p>
                       </div>
                     </div>
                     <div className="text-right">
                       <p className="text-base font-black text-emerald-600">+{item.quantity}</p>
                       <p className="text-[10px] font-bold text-slate-400 uppercase">{item.products?.unit_type}</p>
                     </div>
                   </div>
                 ))}
               </div>
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 shrink-0">
               <button onClick={handleConfirmTransferReceive} disabled={isProcessing} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-md flex justify-center items-center">
                 {isProcessing ? <><Icons.Spinner /> Processing...</> : '✅ Confirm & Add to Inventory'}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject 2-Step Modal */}
      {rejectModalOpen && selectedTransfer && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-5 border-b border-rose-100 bg-rose-50 flex justify-between items-center">
              <h3 className="font-bold text-rose-900">Reject Incoming Transfer</h3>
              <button onClick={() => setRejectModalOpen(false)} className="text-rose-400 hover:text-rose-700 bg-white p-1.5 rounded-lg border border-rose-200"><Icons.Close /></button>
            </div>
            
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">⚠️</div>
              
              {rejectStep === 1 ? (
                <>
                  <h4 className="text-lg font-bold text-slate-900 mb-2">Are you sure?</h4>
                  <p className="text-sm text-slate-500 mb-6">You are about to reject TXN-{selectedTransfer.id.split('-')[0].toUpperCase()} from <strong>{selectedTransfer.from_warehouse?.name}</strong>.</p>
                  <button onClick={() => setRejectStep(2)} className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-xl shadow-md transition-all">Yes, Proceed to Reject</button>
                  <button onClick={() => setRejectModalOpen(false)} className="w-full bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold py-3 rounded-xl mt-3 transition-all">Cancel</button>
                </>
              ) : (
                <>
                  <h4 className="text-lg font-bold text-rose-600 mb-2">Final Confirmation</h4>
                  <p className="text-sm text-slate-600 mb-6 bg-rose-50 p-3 rounded-lg border border-rose-100">Click below to permanently reject and return the stock to source.</p>
                  <button onClick={handleRejectTransfer} disabled={isProcessing} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl shadow-md transition-all flex justify-center">
                    {isProcessing ? <><Icons.Spinner /> Returning Stock...</> : 'Confirm Rejection'}
                  </button>
                  <button onClick={() => setRejectModalOpen(false)} className="w-full bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold py-3 rounded-xl mt-3 transition-all">Cancel</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {detailsModalOpen && selectedTransaction && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Transaction Details</h3>
              <button onClick={() => setDetailsModalOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200"><Icons.Close /></button>
            </div>
            <div className="p-6 space-y-4">
               <div>
                 <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Transaction ID & Date</p>
                 <p className="font-bold text-indigo-700 text-lg">
                   {selectedTransaction.transfer_id ? `TXN-${selectedTransaction.transfer_id.split('-')[0].toUpperCase()}` : `TXN-${selectedTransaction.id.split('-')[0].toUpperCase()}`}
                 </p>
                 <p className="text-xs text-slate-500 mt-1">{new Date(selectedTransaction.created_at).toLocaleString()}</p>
               </div>
               <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                 <div>
                   <p className="text-[10px] font-bold text-slate-500 uppercase">Product</p>
                   <p className="font-bold text-slate-800 text-sm">{selectedTransaction.products?.name}</p>
                 </div>
                 
                 <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                   <div>
                     <p className="text-[10px] font-bold text-slate-500 uppercase">Quantity Received</p>
                     <p className="font-black text-emerald-600 text-base">+{selectedTransaction.quantity} <span className="text-[10px] text-slate-500 uppercase ml-1">{selectedTransaction.products?.unit_type}</span></p>
                   </div>
                   <div className="text-right">
                     <p className="text-[10px] font-bold text-slate-500 uppercase">PO / Ref No</p>
                     <p className="font-bold text-slate-700 text-sm">{selectedTransaction.reference_no || 'N/A'}</p>
                   </div>
                 </div>

                 <div className="flex justify-between items-start pt-3 border-t border-slate-200">
                   <div className="flex-1 pr-2">
                     <p className="text-[10px] font-bold text-slate-500 uppercase">Source / From</p>
                     <p className="font-bold text-slate-800 text-sm">{selectedTransaction.exact_source}</p>
                   </div>
                   <div className="text-right flex-1 pl-2 border-l border-slate-200">
                     <p className="text-[10px] font-bold text-slate-500 uppercase">Target Warehouse</p>
                     <p className="font-bold text-slate-800 text-sm">{selectedTransaction.warehouses?.name}</p>
                   </div>
                 </div>
               </div>
               <div>
                 <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Remarks & Audit</p>
                 <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">{selectedTransaction.remarks || 'No remarks provided.'}</p>
                 <p className="text-[10px] text-slate-400 mt-2 font-mono">Logged by: {selectedTransaction.created_by_email || 'System'}</p>
               </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}