"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../components/Icons';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const STANDARD_UNITS = ["Piece", "Box", "Packet", "Bag", "Kg", "Liter", "Cylinder", "Set", "Kit", "Carton", "Bundle", "Others"];

export default function CatalogPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form States
  const [newProdName, setNewProdName] = useState('');
  const [newProdCode, setNewProdCode] = useState('');
  const [newProdUnit, setNewProdUnit] = useState('Piece');
  const [customUnit, setCustomUnit] = useState('');
  const [newProdPieces, setNewProdPieces] = useState(1);
  const [newProdType, setNewProdType] = useState('NFI'); 
  const [newProdStatus, setNewProdStatus] = useState('Active'); 
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Edit Modal Specific States
  const [editName, setEditName] = useState('');
  const [editUnit, setEditUnit] = useState('Piece');
  const [editCustomUnit, setEditCustomUnit] = useState('');
  const [editPieces, setEditPieces] = useState(1);
  const [editType, setEditType] = useState('NFI'); 
  const [editStatus, setEditStatus] = useState('Active'); 

  // 2-Step Edit Modal States
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2-Step Delete Modal States
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<any>(null);
  const [deleteStep, setDeleteStep] = useState(1);

  // Bulk Upload States
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);

  // Drag and Drop States
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUser(user);
    });
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const { data: prodData } = await supabase
      .from('products')
      .select('*')
      .eq('status', 'Active') // Only show ACTIVE products in catalog as per instructions
      .order('sort_order', { ascending: true }) 
      .order('created_at', { ascending: false });
      
    if (prodData) setProducts(prodData);
    setIsLoading(false);
  };

  const logAudit = async (productId: string, action: string, oldData: any, newData: any) => {
    await supabase.from('product_audit_logs').insert([{
      product_id: productId, action, old_data: oldData, new_data: newData,
      changed_by: currentUser?.id, changed_by_email: currentUser?.email
    }]);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(''); setSuccessMsg('');
    
    if (!newProdName || !newProdCode) { setErrorMsg("Please fill all required fields."); return; }
    const finalUnit = newProdUnit === 'Others' ? customUnit : newProdUnit;
    if (!finalUnit) { setErrorMsg("Please specify the unit type."); return; }

    const payload = {
      name: newProdName, code: newProdCode, unit_type: finalUnit, 
      pieces_per_pack: newProdPieces, product_type: newProdType, status: newProdStatus
    };

    const nextSortOrder = products.length > 0 ? Math.max(...products.map(p => p.sort_order || 0)) + 1 : 1;
    const { data, error } = await supabase.from('products').insert([{ ...payload, sort_order: nextSortOrder }]).select().single();

    if (!error && data) {
      await logAudit(data.id, 'CREATE', null, payload);
      if(payload.status === 'Active') setProducts([...products, data]);
      setSuccessMsg("Product created successfully!");
      resetForm();
    } else {
      setErrorMsg("Failed to add. Product Code must be unique.");
    }
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const submitEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setIsSubmitting(true);
    
    const finalUnit = editUnit === 'Others' ? editCustomUnit : editUnit;
    if (!finalUnit) { setErrorMsg("Please specify the unit type."); setIsSubmitting(false); return; }

    const newData = {
      name: editName, unit_type: finalUnit, pieces_per_pack: editPieces, product_type: editType, status: editStatus
    };

    const { error } = await supabase.from('products').update(newData).eq('id', editingProduct.id);

    if (!error) {
      await logAudit(editingProduct.id, 'UPDATE', editingProduct, newData);
      setSuccessMsg("Product updated successfully!");
      setEditModalOpen(false);
      setEditingProduct(null);
      fetchData(); // Refresh to reflect changes in list
    } else {
      setErrorMsg("Failed to update product.");
    }
    setIsSubmitting(false);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleEditClick = (prod: any) => {
    setEditingProduct(prod);
    setEditName(prod.name);
    setEditPieces(prod.pieces_per_pack);
    setEditType(prod.product_type || 'NFI');
    setEditStatus(prod.status || 'Active');
    
    if (STANDARD_UNITS.includes(prod.unit_type)) {
      setEditUnit(prod.unit_type); setEditCustomUnit('');
    } else {
      setEditUnit('Others'); setEditCustomUnit(prod.unit_type);
    }
    setEditModalOpen(true);
  };

  const resetForm = () => {
    setEditingProduct(null); setNewProdName(''); setNewProdCode(''); setNewProdPieces(1);
    setNewProdType('NFI'); setNewProdUnit('Piece'); setCustomUnit(''); setNewProdStatus('Active');
  };

  const initiateDelete = (prod: any) => {
    setProductToDelete(prod);
    setDeleteStep(1);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if(!productToDelete) return;
    setIsSubmitting(true);
    
    // Soft Delete: status = 'Deleted', alter code to free it up for reuse
    const archivedCode = `${productToDelete.code}_DEL_${Date.now().toString().slice(-6)}`;
    const newData = { status: 'Deleted', code: archivedCode };

    const { error } = await supabase.from('products').update(newData).eq('id', productToDelete.id);
      
    if(!error) {
      await logAudit(productToDelete.id, 'DELETE', productToDelete, newData);
      setProducts(products.filter(p => p.id !== productToDelete.id));
      setSuccessMsg("Product soft-deleted successfully.");
      setDeleteModalOpen(false);
    } else {
      setErrorMsg("Failed to delete product.");
    }
    setIsSubmitting(false);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleDrop = async (dropIndex: number) => {
    if (draggedIdx === null || draggedIdx === dropIndex) {
      setDraggedIdx(null); setDragOverIdx(null); return;
    }
    const updatedItems = [...products];
    const [movedItem] = updatedItems.splice(draggedIdx, 1);
    updatedItems.splice(dropIndex, 0, movedItem);

    const reorderedItems = updatedItems.map((item, index) => ({ ...item, sort_order: index + 1 }));
    setProducts(reorderedItems);
    setDraggedIdx(null); setDragOverIdx(null);

    for (const item of reorderedItems) {
      await supabase.from('products').update({ sort_order: item.sort_order }).eq('id', item.id);
    }
  };

  const handleExportExcel = () => {
    const exportData = products.map((p, i) => ({
      "SL": i + 1, "Product Code": p.code, "Product Name": p.name, "Item Type": p.product_type,
      "Unit Type": p.unit_type, "Qty Per Pack": p.pieces_per_pack, "Status": p.status
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Product_Catalog");
    XLSX.writeFile(workbook, `Product_Catalog.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('portrait');
    doc.setFontSize(14); doc.text("Master Product Catalog", 14, 15);
    doc.setFontSize(9); doc.setTextColor(100); doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 21);

    const tableColumn = ["SL", "Type", "Product Code", "Product Name", "Unit", "Qty/Pack"];
    const tableRows = products.map((p, i) => [i + 1, p.product_type, p.code, p.name, p.unit_type, p.pieces_per_pack]);

    autoTable(doc, { head: [tableColumn], body: tableRows, startY: 26, theme: 'grid', styles: { fontSize: 8.5 }});
    doc.save(`Product_Catalog.pdf`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(firstSheet);
      
      const { data: dbProducts } = await supabase.from('products').select('id, code');
      const codeMap = new Map(dbProducts?.map(p => [p.code.toLowerCase(), p.id]));

      const parsedData = rows.map(row => {
        const code = row["Product Code"]?.toString().trim();
        const name = row["Product Name"]?.toString().trim();
        const type = row["Item Type"]?.toString().trim().toUpperCase() === 'LPG' ? 'LPG' : 'NFI';
        const unit = row["Unit Type"]?.toString().trim() || 'Piece';
        const qty = parseInt(row["Qty Per Pack"]) || 1;

        let status: 'NEW' | 'UPDATE' | 'ERROR' = 'NEW';
        let existingId = null;

        if (!code || !name) {
          status = 'ERROR';
        } else if (codeMap.has(code.toLowerCase())) {
          status = 'UPDATE';
          existingId = codeMap.get(code.toLowerCase());
        }

        return { code, name, product_type: type, unit_type: unit, pieces_per_pack: qty, status, existingId };
      });

      setPreviewData(parsedData);
      setIsPreviewOpen(true);
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmBulkUpload = async () => {
    setIsSubmitting(true);
    let successCount = 0;
    const maxSortOrder = products.length > 0 ? Math.max(...products.map(p => p.sort_order || 0)) : 0;

    for (let i = 0; i < previewData.length; i++) {
      const item = previewData[i];
      if (item.status === 'ERROR') continue;

      const payload = { name: item.name, code: item.code, product_type: item.product_type, unit_type: item.unit_type, pieces_per_pack: item.pieces_per_pack, status: 'Active' };

      if (item.status === 'UPDATE' && item.existingId) {
        await supabase.from('products').update(payload).eq('id', item.existingId);
        await logAudit(item.existingId, 'UPDATE', null, payload); 
        successCount++;
      } else if (item.status === 'NEW') {
        const { data } = await supabase.from('products').insert([{ ...payload, sort_order: maxSortOrder + i + 1 }]).select().single();
        if(data) await logAudit(data.id, 'CREATE', null, payload);
        successCount++;
      }
    }

    setIsSubmitting(false); setIsPreviewOpen(false);
    setSuccessMsg(`${successCount} products processed successfully!`);
    fetchData();
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 relative">
      
      <header className="flex flex-col md:flex-row h-auto md:h-20 bg-white border-b border-slate-200 md:items-center justify-between px-4 md:px-6 py-4 md:py-0 pr-16 md:pr-24 shrink-0 shadow-sm z-10 gap-4 md:gap-0">
        <div className="flex items-center">
          <button onClick={() => window.history.back()} className="mr-3 md:mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 leading-tight">Product Catalog</h2>
            <p className="text-[10px] md:text-sm text-slate-500">Manage NFI & LPG Inventory Definitions</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <button onClick={handleExportExcel} className="flex items-center px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-xs font-bold rounded-xl transition-all shadow-sm">
            <Icons.Download /> <span className="ml-1">Excel Export</span>
          </button>
          <button onClick={handleExportPDF} className="flex items-center px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-bold rounded-xl transition-all shadow-sm">
            <Icons.Download /> <span className="ml-1">PDF</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-bold rounded-xl transition-all shadow-sm">
            <Icons.Upload /> <span className="ml-1">Bulk Upload</span>
          </button>
          <input type="file" accept=".xlsx, .xls" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
        {errorMsg && <div className="mb-4 p-3 bg-rose-50 text-rose-700 text-sm font-bold rounded-xl border border-rose-200">{errorMsg}</div>}
        {successMsg && <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 text-sm font-bold rounded-xl border border-emerald-200">{successMsg}</div>}

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
          
          {/* Form */}
          <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm xl:col-span-1 h-fit sticky top-0">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mr-3 bg-indigo-50 text-indigo-600">
                <Icons.Plus />
              </div>
              Add Product
            </h3>
            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Item Type</label>
                <div className="flex space-x-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" value="NFI" checked={newProdType === 'NFI'} onChange={(e) => setNewProdType(e.target.value)} className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-bold text-slate-800">NFI Item</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" value="LPG" checked={newProdType === 'LPG'} onChange={(e) => setNewProdType(e.target.value)} className="w-4 h-4 text-orange-600" />
                    <span className="text-sm font-bold text-slate-800">LPG Item</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Product Name</label>
                <input type="text" value={newProdName} onChange={(e) => setNewProdName(e.target.value)} required className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">SKU / Code (Unique)</label>
                <input type="text" value={newProdCode} onChange={(e) => setNewProdCode(e.target.value)} required className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500" />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Unit Type</label>
                  <select value={newProdUnit} onChange={(e) => setNewProdUnit(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 mb-2">
                    {STANDARD_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                  {newProdUnit === 'Others' && (
                    <input type="text" value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} required placeholder="Custom unit..." className="w-full px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500" />
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Qty per pack</label>
                  <input type="number" min="1" value={newProdPieces} onChange={(e) => setNewProdPieces(parseInt(e.target.value))} required className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500" />
                </div>
              </div>

              {/* Status Toggle */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Visibility Status</label>
                <select value={newProdStatus} onChange={(e) => setNewProdStatus(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500">
                  <option value="Active">Active (Visible)</option>
                  <option value="Inactive">Inactive (Hidden)</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Inactive items won&apos;t show in distribution menus.</p>
              </div>
              
              <button type="submit" className="w-full text-white py-3 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all mt-2 bg-indigo-600 hover:bg-indigo-700">
                Add to Catalog
              </button>
            </form>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm xl:col-span-3 overflow-hidden flex flex-col h-fit">
            <div className="overflow-x-auto w-full custom-scrollbar">
              <table className="w-full text-left min-w-[700px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase w-20 text-center">SL</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Product Details</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Unit & Qty</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr><td colSpan={4} className="p-10 text-center"><Icons.Spinner /></td></tr>
                  ) : products.length === 0 ? (
                    <tr><td colSpan={4} className="p-10 text-center text-slate-500 font-medium text-sm">No active products found.</td></tr>
                  ) : (
                    products.map((prod, index) => {
                      const isDragged = draggedIdx === index;
                      const isDragOver = dragOverIdx === index;
                      return (
                        <tr 
                          key={prod.id} 
                          draggable
                          onDragStart={() => setDraggedIdx(index)}
                          onDragOver={(e) => { e.preventDefault(); setDragOverIdx(index); }}
                          onDrop={() => handleDrop(index)}
                          onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null); }}
                          className={`transition-all group cursor-grab active:cursor-grabbing ${isDragged ? 'opacity-40 bg-indigo-50' : 'hover:bg-slate-50'} ${isDragOver ? 'border-t-2 border-indigo-600 bg-indigo-50/40' : ''}`}
                        >
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              <span className="text-slate-300 group-hover:text-indigo-500 cursor-grab select-none">⋮⋮</span>
                              <span className="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1 rounded-md">{index + 1}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-start space-x-3">
                              <span className={`px-2 py-0.5 mt-0.5 text-[9px] font-bold uppercase rounded border shrink-0 ${prod.product_type === 'LPG' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                {prod.product_type || 'NFI'}
                              </span>
                              <div>
                                <p className="font-bold text-slate-900 text-sm leading-tight">{prod.name}</p>
                                <p className="text-[10px] text-slate-500 font-mono mt-1">Code: {prod.code}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <p className="text-sm font-bold text-slate-800">{prod.unit_type}</p>
                            <p className="text-[10px] text-slate-500 uppercase font-bold mt-0.5">{prod.pieces_per_pack} per pack</p>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end space-x-2">
                              <button onClick={() => handleEditClick(prod)} className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit Product">
                                <Icons.Edit />
                              </button>
                              <button onClick={() => initiateDelete(prod)} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete Product">
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
      </div>

      {/* 2-Step Edit Modal */}
      {editModalOpen && editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
              <div>
                <h4 className="font-bold text-xl text-slate-900 flex items-center">
                  <span className="w-8 h-8 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center mr-3 text-sm"><Icons.Edit /></span>
                  Edit Product
                </h4>
              </div>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-lg transition-colors"><Icons.Close /></button>
            </div>
            
            <form onSubmit={submitEditProduct} className="space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Item Type</label>
                <div className="flex space-x-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" value="NFI" checked={editType === 'NFI'} onChange={(e) => setEditType(e.target.value)} className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-bold text-slate-800">NFI Item</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" value="LPG" checked={editType === 'LPG'} onChange={(e) => setEditType(e.target.value)} className="w-4 h-4 text-orange-600" />
                    <span className="text-sm font-bold text-slate-800">LPG Item</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Product Name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-amber-500 transition-colors" />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 flex justify-between">
                  SKU / Code 
                  <span className="text-rose-500 font-normal normal-case">Code modification restricted</span>
                </label>
                <input type="text" value={editingProduct.code} disabled className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 font-bold cursor-not-allowed" />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Unit Type</label>
                  <select value={editUnit} onChange={(e) => setEditUnit(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-amber-500 mb-2">
                    {STANDARD_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                  {editUnit === 'Others' && (
                    <input type="text" value={editCustomUnit} onChange={(e) => setEditCustomUnit(e.target.value)} required placeholder="Custom unit..." className="w-full px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-amber-500" />
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Qty per pack</label>
                  <input type="number" min="1" value={editPieces} onChange={(e) => setEditPieces(parseInt(e.target.value))} required className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-amber-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Visibility Status</label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-amber-500">
                  <option value="Active">Active (Visible)</option>
                  <option value="Inactive">Inactive (Hidden)</option>
                </select>
              </div>

              <div className="flex space-x-3 pt-3">
                <button type="button" onClick={() => setEditModalOpen(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl text-sm shadow-md transition-colors disabled:opacity-50">
                  {isSubmitting ? 'Saving...' : 'Update Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2-Step Delete Modal */}
      {deleteModalOpen && productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">⚠️</div>
            
            {deleteStep === 1 ? (
              <>
                <h4 className="font-bold text-xl mb-2 text-slate-900">Delete Product?</h4>
                <p className="text-sm text-slate-500 mb-6 leading-relaxed">You are about to delete <strong>{productToDelete.name}</strong>. It will be hidden from the system but kept in audit history.</p>
                <button onClick={() => setDeleteStep(2)} className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-xl mb-3 text-sm shadow-md transition-colors">Proceed to Delete</button>
                <button onClick={() => setDeleteModalOpen(false)} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition-colors">Cancel</button>
              </>
            ) : (
              <>
                <h4 className="font-bold text-xl mb-2 text-rose-600">Final Confirmation</h4>
                <p className="text-sm text-slate-600 mb-6 bg-rose-50 p-3 rounded-lg border border-rose-100">Click below to permanently soft-delete this product.</p>
                <button onClick={confirmDelete} disabled={isSubmitting} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl mb-3 text-sm shadow-md transition-colors disabled:opacity-50">
                  {isSubmitting ? 'Deleting...' : 'Confirm Deletion'}
                </button>
                <button onClick={() => setDeleteModalOpen(false)} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition-colors">Cancel</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bulk Upload Preview Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Bulk Upload Preview</h3>
                <p className="text-xs text-slate-500 mt-1">Review your Excel data before saving</p>
              </div>
              <button onClick={() => setIsPreviewOpen(false)} className="bg-white border border-slate-200 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"><Icons.Close /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-3 text-xs font-bold text-slate-600 uppercase">Status</th>
                    <th className="p-3 text-xs font-bold text-slate-600 uppercase">Product Code</th>
                    <th className="p-3 text-xs font-bold text-slate-600 uppercase">Product Name</th>
                    <th className="p-3 text-xs font-bold text-slate-600 uppercase">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.length === 0 ? (
                    <tr><td colSpan={4} className="p-6 text-center text-slate-500">No valid data found in Excel.</td></tr>
                  ) : (
                    previewData.map((item, idx) => (
                      <tr key={idx} className={item.status === 'ERROR' ? 'bg-rose-50/50' : (item.status === 'UPDATE' ? 'bg-amber-50/30' : '')}>
                        <td className="p-3">
                          {item.status === 'NEW' && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded border border-emerald-200">NEW</span>}
                          {item.status === 'UPDATE' && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded border border-amber-200">UPDATE</span>}
                          {item.status === 'ERROR' && <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-1 rounded border border-rose-200">INVALID</span>}
                        </td>
                        <td className="p-3 font-mono text-xs font-bold text-slate-700">{item.code || 'N/A'}</td>
                        <td className="p-3 font-bold text-slate-900">{item.name || 'Missing Name'}</td>
                        <td className="p-3 text-xs text-slate-600">{item.product_type}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-5 border-t border-slate-200 bg-slate-50 shrink-0 flex justify-between items-center">
               <p className="text-xs font-bold text-slate-500">
                 Valid Items: <span className="text-indigo-600">{previewData.filter(d => d.status !== 'ERROR').length}</span>
               </p>
               <button onClick={handleConfirmBulkUpload} disabled={isSubmitting || previewData.filter(d => d.status !== 'ERROR').length === 0} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center">
                 {isSubmitting ? <><Icons.Spinner /> Saving...</> : 'Confirm & Save'}
               </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}