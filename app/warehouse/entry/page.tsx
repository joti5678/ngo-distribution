"use client";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './../../components/Icons';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ডেট ফরম্যাট করার জন্য হেল্পার ফাংশন
const formatDisplayDate = (dateString: string) => {
  if (!dateString) return '';
  const datePart = dateString.split('T')[0]; 
  const [year, month, day] = datePart.split('-');
  return `${day}/${month}/${year}`;
};

// সিলেক্ট করা তারিখের সাথে বর্তমান সময় যুক্ত করার ফাংশন (সঠিক সর্টিংয়ের জন্য)
const getSortableDateString = (selectedDateStr: string) => {
  if (!selectedDateStr) return '';
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${selectedDateStr}T${hours}:${minutes}:${seconds}.000Z`;
};

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
  const [historyWhFilter, setHistoryWhFilter] = useState('ALL');
  const [historyDateFilter, setHistoryDateFilter] = useState('');

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageChunk, setPageChunk] = useState(0); 
  const itemsPerPage = 5;

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<any>(null);
  const [editQty, setEditQty] = useState<number | ''>('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [txnToRevert, setTxnToRevert] = useState<any>(null);

  // Excel Bulk Upload States
  const [isExcelPreviewOpen, setIsExcelPreviewOpen] = useState(false);
  const [excelPreviewData, setExcelPreviewData] = useState<any[]>([]);
  const [invalidExcelRows, setInvalidExcelRows] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  useEffect(() => {
    const today = new Date();
    const dateStr = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    setEntryDate(dateStr);
    
    fetchInitialData();
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
    setPageChunk(0);
  }, [searchTable, historyWhFilter, historyDateFilter]);

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

        const [whRes, prodRes, partRes] = await Promise.all([
          supabase.from('warehouses').select('id, name, code').order('name'),
          supabase.from('products').select('id, name, code, unit_type, product_type').order('name'),
          supabase.from('partners').select('id, name, type').order('name')
        ]);

        if (prodRes.data) setProducts(prodRes.data);
        if (partRes.data) setPartners(partRes.data);

        const allWhs = whRes.data || [];
        const myWhs = isSuperAdmin ? allWhs : allWhs.filter(w => sessionWhIds.includes(w.id));
        setWarehouses(myWhs);

        await loadTransactions(isSuperAdmin, sessionWhIds);
    } catch (err) {
        console.error("Error fetching data:", err);
    }
    
    setIsLoading(false);
  };

  const loadTransactions = async (isSuperAdmin: boolean, assignedIds: string[]) => {
    let tQuery = supabase
      .from('inventory_transactions')
      .select(`
        *,
        warehouses (name, code),
        products (name, code, unit_type, product_type),
        partners (name)
      `)
      .eq('transaction_type', 'IN')
      .is('transfer_id', null) 
      .not('remarks', 'ilike', '%Transfer%') 
      .order('created_at', { ascending: false })
      .limit(500); 

      if (!isSuperAdmin) {
        if (assignedIds.length > 0) {
            tQuery = tQuery.in('warehouse_id', assignedIds);
        } else {
            tQuery = tQuery.eq('id', '00000000-0000-0000-0000-000000000000'); 
        }
      }

    const { data } = await tQuery;
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

      // 🚀 FIXED: Generating exact timestamp based on selected date to ensure proper sorting
      const exactDateTimeStr = getSortableDateString(entryDate);

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
          created_at: exactDateTimeStr // 👈 Time included for sorting, but exact date maintained
        }]);
      }

      showMessage("Bulk stock entry recorded successfully!", "success");
      setBagItems([]); setBulkRemarks(''); setBulkRefNo('');
      
      const sessionStr = localStorage.getItem('user_session');
      const sessionUser = sessionStr ? JSON.parse(sessionStr) : null;
      const roleName = String(sessionUser?.user_roles?.role_name || sessionUser?.role || '').toUpperCase();
      const isSuperAdmin = roleName.includes('SUPER ADMIN') || roleName === 'ADMIN' || roleName.includes('WEB ADMIN');
      await loadTransactions(isSuperAdmin, sessionUser?.assigned_wh_ids || []);

    } catch (err) {
      showMessage("Failed to process entry. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadDemoExcel = () => {
    const ws = XLSX.utils.json_to_sheet([{ "Product Code": "LPG-001", "Quantity": 50 }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bulk_Upload_Template");
    XLSX.writeFile(wb, "Bulk_Upload_Template.xlsx");
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
          let codeStr = row["Product Code"] || row["product_code"] || row["ProductCode"] || "";
          codeStr = String(codeStr).trim();
          const qtyStr = row["Quantity"] || row["quantity"] || row["Qty"] || "";
          const qty = Number(qtyStr);

          if (!codeStr || isNaN(qty) || qty <= 0) {
              invalidItems.push({ row: index + 2, code: codeStr, error: "Missing code or invalid quantity" });
              return;
          }

          const product = products.find(p => p.code.toLowerCase() === codeStr.toLowerCase());
          if (product) {
              validItems.push({ product_id: product.id, qty: qty, ...product });
          } else {
              invalidItems.push({ row: index + 2, code: codeStr, error: "Product code not found in DB" });
          }
        });

        setExcelPreviewData(validItems);
        setInvalidExcelRows(invalidItems);
        setIsExcelPreviewOpen(true);

      } catch (err) {
        showMessage("Failed to read Excel file. Please use the demo format.", "error");
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = ''; 
  };

  const confirmExcelImport = () => {
    const newBag = [...bagItems];
    excelPreviewData.forEach(excelItem => {
        const existingIndex = newBag.findIndex(b => b.product_id === excelItem.product_id);
        if (existingIndex >= 0) {
            newBag[existingIndex].qty = Number(newBag[existingIndex].qty || 0) + excelItem.qty;
        } else {
            newBag.push(excelItem);
        }
    });
    setBagItems(newBag);
    setIsExcelPreviewOpen(false);
    showMessage(`${excelPreviewData.length} products added to Entry Bag!`, "success");
  };

  const openEditModal = (txn: any) => { setEditingTxn(txn); setEditQty(txn.quantity); setIsEditModalOpen(true); };
  
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTxn) return;
    const newQty = Number(editQty);
    if (isNaN(newQty) || newQty <= 0) { showMessage("Invalid quantity entered.", "error"); return; }
    const qtyDiff = newQty - editingTxn.quantity;
    if (qtyDiff === 0) { setIsEditModalOpen(false); return; }
    setIsSavingEdit(true);
    try {
      const { data: invRecord } = await supabase.from('inventory').select('id, quantity').eq('warehouse_id', editingTxn.warehouse_id).eq('product_id', editingTxn.product_id).single();
      if (invRecord) {
        const updatedQty = invRecord.quantity + qtyDiff;
        if(updatedQty < 0) { showMessage("Error: Not enough stock to reduce this amount!", "error"); setIsSavingEdit(false); return; }
        await supabase.from('inventory').update({ quantity: updatedQty }).eq('id', invRecord.id);
      } else if (qtyDiff > 0) {
         await supabase.from('inventory').insert([{ warehouse_id: editingTxn.warehouse_id, product_id: editingTxn.product_id, quantity: qtyDiff }]);
      }
      
      await supabase.from('inventory_transactions').update({ 
        quantity: newQty, 
        updated_by: currentUser?.id || null, 
        updated_by_email: currentUser?.email || null, 
        updated_at: new Date().toISOString() 
      }).eq('id', editingTxn.id);
      
      showMessage("Transaction updated.", "success");
      const sessionStr = localStorage.getItem('user_session');
      const sessionUser = sessionStr ? JSON.parse(sessionStr) : null;
      const roleName = String(sessionUser?.user_roles?.role_name || sessionUser?.role || '').toUpperCase();
      const isSuperAdmin = roleName.includes('SUPER ADMIN') || roleName === 'ADMIN' || roleName.includes('WEB ADMIN');
      await loadTransactions(isSuperAdmin, sessionUser?.assigned_wh_ids || []);
      setIsEditModalOpen(false);
    } catch (error) { showMessage("Failed to edit.", "error"); } finally { setIsSavingEdit(false); }
  };

  const confirmRevertTransaction = async () => {
    if (!txnToRevert) return;
    setIsSavingEdit(true);
    try {
      const { data: invRecord } = await supabase.from('inventory').select('id, quantity').eq('warehouse_id', txnToRevert.warehouse_id).eq('product_id', txnToRevert.product_id).single();
      if (invRecord) {
        const newQty = invRecord.quantity - txnToRevert.quantity;
        await supabase.from('inventory').update({ quantity: newQty < 0 ? 0 : newQty }).eq('id', invRecord.id);
      }
      await supabase.from('inventory_transactions').delete().eq('id', txnToRevert.id);
      showMessage("Entry reverted.", "success");
      setRevertModalOpen(false);
      const sessionStr = localStorage.getItem('user_session');
      const sessionUser = sessionStr ? JSON.parse(sessionStr) : null;
      const roleName = String(sessionUser?.user_roles?.role_name || sessionUser?.role || '').toUpperCase();
      const isSuperAdmin = roleName.includes('SUPER ADMIN') || roleName === 'ADMIN' || roleName.includes('WEB ADMIN');
      await loadTransactions(isSuperAdmin, sessionUser?.assigned_wh_ids || []);
    } catch (error) { showMessage("Failed to revert.", "error"); } finally { setIsSavingEdit(false); }
  };

  const preventScroll = (e: React.WheelEvent<HTMLInputElement>) => {
    (e.target as HTMLInputElement).blur();
  };

  // --- UI FILTERING LOGIC ---
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.code.toLowerCase().includes(productSearch.toLowerCase()));
  
  const filteredTransactions = transactions.filter(t => {
    const query = searchTable.toLowerCase();
    const txnId = `txn-${t.id.split('-')[0]}`.toLowerCase();
    
    // Product code added in search match
    const searchMatch = txnId.includes(query) || 
           (t.reference_no || '').toLowerCase().includes(query) || 
           (t.products?.name || '').toLowerCase().includes(query) || 
           (t.products?.code || '').toLowerCase().includes(query) || 
           (t.warehouses?.name || '').toLowerCase().includes(query);

    const filterWhMatch = historyWhFilter === 'ALL' || t.warehouse_id === historyWhFilter;
    
    const tDateStr = t.created_at.split('T')[0];
    const filterDateMatch = !historyDateFilter || tDateStr === historyDateFilter;

    return searchMatch && filterWhMatch && filterDateMatch;
  });

  // --- PAGINATION LOGIC ---
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const currentChunkStartPage = pageChunk * 5 + 1;
  const currentChunkEndPage = Math.min(currentChunkStartPage + 4, totalPages);
  
  const displayedPages = [];
  for (let i = currentChunkStartPage; i <= currentChunkEndPage; i++) {
    displayedPages.push(i);
  }

  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleNextPage = () => {
    if (currentPage < totalPages) {
        const nextPage = currentPage + 1;
        setCurrentPage(nextPage);
        if (nextPage > currentChunkEndPage) setPageChunk(pageChunk + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
        const prevPage = currentPage - 1;
        setCurrentPage(prevPage);
        if (prevPage < currentChunkStartPage) setPageChunk(pageChunk - 1);
    }
  };

  const handleLoadMoreChunk = () => {
      if (currentChunkEndPage < totalPages) {
          setPageChunk(pageChunk + 1);
          setCurrentPage(currentChunkEndPage + 1);
      }
  };


  // EXCEL & PDF EXPORT
  const handleExportExcel = () => {
    const exportData = filteredTransactions.map(t => ({
      "Date": formatDisplayDate(t.created_at),
      "System TXN ID": `TXN-${t.id.split('-')[0].toUpperCase()}`,
      "Target Warehouse": t.warehouses?.name || 'Unknown',
      "Product Name": t.products?.name || 'Unknown',
      "Quantity Added (IN)": t.quantity,
      "Unit": t.products?.unit_type || '',
      "Source/Remarks": t.remarks || 'N/A'
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bulk_Entries");
    XLSX.writeFile(wb, `Bulk_Entry_Report.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(14); doc.text("Bulk Stock Entry - History", 14, 15);
    const tableColumn = ["Date & TXN", "Warehouse", "Product", "Qty (IN)", "Status"];
    const tableRows = filteredTransactions.map(t => [
      `${formatDisplayDate(t.created_at)}
TXN-${t.id.split('-')[0].toUpperCase()}`,
      t.warehouses?.name || 'Unknown',
      t.products?.name || 'Unknown',
      `+${t.quantity} ${t.products?.unit_type || ''}`,
      'Completed'
    ]);
    autoTable(doc, { 
      head: [tableColumn], body: tableRows, startY: 25, 
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] }
    });
    doc.save(`Bulk_Entry_Report.pdf`);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 relative">
      
      <style dangerouslySetInnerHTML={{__html: `
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}} />

      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 shadow-sm justify-between">
        <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">Direct Stock Entry (Bulk)</h2>
            <p className="text-sm text-slate-500 hidden md:block">Record goods directly from external Suppliers or Donors</p>
            </div>
        </div>
        
        <div className="flex space-x-2">
            <button onClick={downloadDemoExcel} className="hidden sm:flex bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold py-2 px-3 rounded-lg text-xs shadow-sm items-center transition-colors">
                <Icons.Download /> <span className="ml-1">Demo Format</span>
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg text-xs shadow-sm flex items-center transition-colors">
                <span className="mr-1 text-base">📊</span> Excel Upload
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" className="hidden" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar">
        
        {msg.text && (
          <div className={`p-4 rounded-xl shadow-md border text-sm font-bold animate-in slide-in-from-top-2 flex justify-between items-center shrink-0 fixed top-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="flex items-center"><span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}</span>
            <button onClick={() => setMsg({text:'', type:''})} className="p-1 rounded-md hover:bg-black/5"><Icons.Close /></button>
          </div>
        )}

        {/* Compact Settings Card */}
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
                {warehouses.length === 0 ? (
                    <option value="">-- No Warehouses Assigned --</option>
                ) : (
                    <option value="">-- Select Destination --</option>
                )}
                {warehouses.map(w => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 2-Column Builder */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row min-h-[500px] overflow-hidden">
          
          {/* Left: Products */}
          <div className="w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50 min-h-[350px]">
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
            <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[400px] md:max-h-none custom-scrollbar">
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
          <div className="w-full md:w-1/2 flex flex-col bg-white min-h-[400px]" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
            <div className="p-4 border-b border-emerald-100 bg-emerald-50 shrink-0 flex justify-between items-center">
               <h4 className="font-bold text-emerald-900 text-xs uppercase tracking-wide flex items-center">
                 <span className="mr-2 text-base">📥</span> Entry Bag
               </h4>
               <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded-full">{bagItems.length} Added</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-[400px] md:max-h-none custom-scrollbar relative">
               {bagItems.length === 0 ? (
                 <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-center p-4">
                   <span className="text-4xl mb-3 opacity-50">📦</span>
                   <p className="text-xs font-bold text-slate-500">Drag & Drop products here</p>
                   <p className="text-[10px] mt-1">Or use Excel Upload</p>
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
                           onWheel={preventScroll}
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

            {/* Bottom Section */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0 space-y-3 mt-auto">
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

        {/* --- BOTTOM SECTION: Bulk Entry History --- */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col shrink-0 mt-4">
           <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row justify-between items-center bg-slate-50/50 gap-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Recent Bulk Entries</h3>
              <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-3 w-full lg:w-auto">
                 
                 {/* New Date Filter */}
                 <div className="w-full sm:w-auto">
                   <input 
                     type="date" 
                     value={historyDateFilter} 
                     onChange={(e) => setHistoryDateFilter(e.target.value)}
                     className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500" 
                     title="Filter by Entry Date"
                   />
                 </div>

                 <div className="w-full sm:w-auto">
                   <select value={historyWhFilter} onChange={(e) => setHistoryWhFilter(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500">
                     <option value="ALL">All My Warehouses</option>
                     {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                   </select>
                 </div>

                 <div className="relative w-full sm:w-64">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icons.Search /></div>
                   <input type="text" placeholder="Search TXN, Product, Code..." value={searchTable} onChange={(e) => setSearchTable(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500" />
                 </div>
                 
                 <div className="flex space-x-2 shrink-0">
                   <button onClick={handleExportExcel} className="flex px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-colors shadow-sm">
                     <Icons.Download /> <span className="ml-1 hidden sm:inline">Excel</span>
                   </button>
                   <button onClick={handleExportPDF} className="flex px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl hover:bg-rose-100 transition-colors shadow-sm">
                     <Icons.Download /> <span className="ml-1 hidden sm:inline">PDF</span>
                   </button>
                 </div>
              </div>
           </div>
           
           <div className="overflow-x-auto w-full custom-scrollbar">
             <table className="w-full text-left border-collapse table-auto min-w-[900px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase w-32">Date & TXN</th>
                    <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase">Target Warehouse</th>
                    <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase">Product</th>
                    <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase text-right">Added Qty</th>
                    <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase text-center w-28">Status</th>
                    <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase text-right w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr><td colSpan={6} className="p-10 text-center"><Icons.Spinner /></td></tr>
                  ) : paginatedTransactions.length === 0 ? (
                    <tr><td colSpan={6} className="p-10 text-center text-sm text-slate-500 font-medium">No recent bulk entries found.</td></tr>
                  ) : (
                    paginatedTransactions.map((t) => {
                      const txnId = `TXN-${t.id.split('-')[0].toUpperCase()}`;
                      
                      return (
                        <tr key={t.id} className="hover:bg-slate-50 group transition-colors">
                          <td className="px-4 py-3 align-top">
                            <p className="font-bold text-slate-900 text-sm">{formatDisplayDate(t.created_at)}</p>
                            <p className="text-[10px] text-emerald-600 font-mono mt-0.5 font-bold">{txnId}</p>
                            {t.reference_no && <p className="text-[9px] text-slate-400 mt-0.5">Ref: {t.reference_no}</p>}
                          </td>
                          
                          <td className="px-4 py-3 align-top">
                             <p className="font-bold text-slate-900 text-sm">{t.warehouses?.name || 'Unknown'}</p>
                             <p className="text-[10px] text-slate-500 mt-0.5">Code: {t.warehouses?.code || 'N/A'}</p>
                          </td>
                          
                          <td className="px-4 py-3 align-top">
                             <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border mb-1 inline-block uppercase ${t.products?.product_type === 'LPG' ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                               {t.products?.product_type}
                             </span>
                             <p className="font-bold text-slate-900 text-sm">{t.products?.name}</p>
                             <p className="text-[10px] text-slate-500 mt-0.5">Code: {t.products?.code}</p>
                          </td>
                          
                          <td className="px-4 py-3 text-right align-top">
                             <div className="flex flex-col items-end justify-start">
                               <div className="flex items-baseline space-x-1">
                                 <span className="font-black text-emerald-600 text-lg">+{t.quantity}</span>
                                 <span className="text-[10px] text-slate-500 uppercase">{t.products?.unit_type}</span>
                               </div>
                               <span className="text-[8px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-100 mt-1 inline-block uppercase">STORE/IN</span>
                             </div>
                          </td>

                          <td className="px-4 py-3 align-top text-center">
                             <span className="text-[10px] font-bold px-2 py-1 rounded-full border inline-block mt-1 bg-emerald-50 text-emerald-700 border-emerald-200">
                               Completed
                             </span>
                          </td>
                          
                          <td className="px-4 py-3 align-top text-right">
                             <div className="flex justify-end items-center">
                               <button onClick={() => openEditModal(t)} className="p-1.5 rounded-lg transition-colors border mr-1 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 border-transparent hover:border-emerald-100" title="Edit Quantity">
                                 <Icons.Edit />
                               </button>
                               <button onClick={() => { setTxnToRevert(t); setRevertModalOpen(true); }} className="p-1.5 rounded-lg transition-colors border text-rose-400 hover:text-rose-600 hover:bg-rose-50 border-transparent hover:border-rose-100" title="Delete & Revert Stock">
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

           {/* --- PAGINATION CONTROLS --- */}
           {totalPages > 1 && (
             <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <p className="text-xs text-slate-500 font-medium">
                  Showing <span className="font-bold text-slate-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-slate-900">{Math.min(currentPage * itemsPerPage, filteredTransactions.length)}</span> of <span className="font-bold text-slate-900">{filteredTransactions.length}</span> entries
                </p>
                
                <div className="flex items-center space-x-1">
                  <button 
                    onClick={handlePrevPage} 
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-bold text-slate-600 disabled:opacity-50 hover:bg-slate-100 transition-colors"
                  >
                    Prev
                  </button>
                  
                  {displayedPages.map(page => (
                    <button 
                      key={page} 
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${currentPage === page ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                    >
                      {page}
                    </button>
                  ))}

                  {currentChunkEndPage < totalPages && (
                    <button onClick={handleLoadMoreChunk} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-lg hover:bg-indigo-100 transition-colors ml-1">
                      See More...
                    </button>
                  )}

                  <button 
                    onClick={handleNextPage} 
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-bold text-slate-600 disabled:opacity-50 hover:bg-slate-100 transition-colors ml-1"
                  >
                    Next
                  </button>
                </div>
             </div>
           )}

        </div>
      </div>

      {/* --- EXCEL PREVIEW MODAL --- */}
      {isExcelPreviewOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[80vh] animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-black text-slate-900 text-lg">Excel Import Validation</h3>
                <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-widest">{excelPreviewData.length} Valid | {invalidExcelRows.length} Invalid</p>
              </div>
              <button onClick={() => setIsExcelPreviewOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-2 rounded-lg border border-slate-200 shadow-sm"><Icons.Close /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar space-y-6">
                
                {invalidExcelRows.length > 0 && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl overflow-hidden">
                        <div className="bg-rose-100 px-4 py-2 font-bold text-xs text-rose-800 uppercase border-b border-emerald-100 flex justify-between">Errors Found (Will be ignored)</div>
                        <ul className="p-4 space-y-2 text-xs font-medium text-rose-600">
                            {invalidExcelRows.map((err, i) => (
                                <li key={i} className="flex space-x-2">
                                    <span>Row {err.row}:</span>
                                    <span className="font-mono text-black">{err.code}</span>
                                    <span>- {err.error}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {excelPreviewData.length > 0 ? (
                    <div className="border border-emerald-200 rounded-xl overflow-hidden bg-white shadow-sm">
                        <div className="bg-emerald-50 px-4 py-2 font-bold text-xs text-emerald-800 uppercase border-b border-emerald-100 flex justify-between">
                            <span>Valid Products Ready for Entry</span>
                            <span>{excelPreviewData.length} Items</span>
                        </div>
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-2">Code</th>
                                    <th className="px-4 py-2">Product Name</th>
                                    <th className="px-4 py-2 text-right">Quantity</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {excelPreviewData.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-4 py-2 font-mono text-xs text-slate-500">{item.code}</td>
                                        <td className="px-4 py-2 text-xs font-bold text-slate-800">{item.name}</td>
                                        <td className="px-4 py-2 text-xs font-black text-emerald-600 text-right">+{item.qty} {item.unit_type}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center p-10 text-slate-400 font-bold">No valid products found in the file.</div>
                )}
            </div>

            <div className="p-5 border-t border-slate-200 bg-white shrink-0 flex justify-end space-x-3">
                <button onClick={() => setIsExcelPreviewOpen(false)} className="px-6 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-slate-50 transition-colors text-sm">Cancel</button>
                <button onClick={confirmExcelImport} disabled={excelPreviewData.length === 0} className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-md transition-colors text-sm disabled:opacity-50 flex items-center">
                    Add {excelPreviewData.length} Valid Items to Bag
                </button>
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT MODAL --- */}
      {isEditModalOpen && editingTxn && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 mt-16 md:mt-0">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95">
             <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center rounded-t-2xl">
               <div>
                 <h3 className="font-black text-slate-900">Edit Entry Quantity</h3>
                 <p className="text-[10px] text-emerald-600 font-bold font-mono mt-0.5">TXN-{editingTxn.id.split('-')[0].toUpperCase()}</p>
               </div>
               <button onClick={() => setIsEditModalOpen(false)} className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-slate-600"><Icons.Close /></button>
             </div>
             
             <form onSubmit={handleSaveEdit} className="p-6">
                <div className="mb-4">
                   <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Product</p>
                   <p className="text-sm font-bold text-slate-900">{editingTxn.products?.name}</p>
                </div>
                
                <div className="mb-6">
                   <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Adjust Quantity</label>
                   <div className="flex items-center space-x-3">
                     <input 
                       type="number" min="1" 
                       value={editQty} 
                       onChange={(e) => setEditQty(e.target.value ? Number(e.target.value) : '')}
                       onWheel={preventScroll}
                       required
                       className="w-full text-lg font-black text-emerald-700 px-4 py-2 border-2 border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-center"
                     />
                     <span className="text-xs font-bold text-slate-500 uppercase">{editingTxn.products?.unit_type}</span>
                   </div>
                </div>

                <button type="submit" disabled={isSavingEdit} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-md transition-all flex justify-center disabled:opacity-50">
                  {isSavingEdit ? 'Saving...' : 'Update Quantity & Stock'}
                </button>
             </form>
          </div>
        </div>
      )}

      {/* --- REVERT MODAL --- */}
      {revertModalOpen && txnToRevert && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 mt-16 md:mt-0">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95">
             <div className="p-5 border-b border-rose-100 bg-rose-50 flex justify-between items-center rounded-t-2xl">
               <h3 className="font-bold text-rose-900">Revert Transaction</h3>
               <button onClick={() => setRevertModalOpen(false)} className="p-1.5 bg-white border border-rose-200 rounded-lg text-rose-400 hover:text-rose-600"><Icons.Close /></button>
             </div>
             
             <div className="p-6 text-center">
                <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">⚠️</div>
                <h4 className="text-lg font-bold text-slate-900 mb-2">Are you sure?</h4>
                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                  This will delete the transaction and permanently remove <span className="font-bold text-slate-800">{txnToRevert.quantity} {txnToRevert.products?.unit_type}</span> of <span className="font-bold text-slate-800">{txnToRevert.products?.name}</span> from the warehouse stock.
                </p>

                <button onClick={confirmRevertTransaction} disabled={isSavingEdit} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl shadow-md transition-all flex justify-center disabled:opacity-50">
                  {isSavingEdit ? 'Reverting...' : 'Yes, Delete & Revert Stock'}
                </button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
}