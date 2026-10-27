"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from '../../components/Icons';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function ProductGroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Creation Form States
  const [groupName, setGroupName] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [description, setDescription] = useState('');

  // Edit Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // 2-Column Builder States
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<any>(null);
  const [bagItems, setBagItems] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');

  // Details Modal States
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    // Fetch Groups
    const { data: grpData } = await supabase.from('product_groups').select('*').order('created_at', { ascending: false });
    if (grpData) setGroups(grpData);

    // Fetch ONLY Active Products for the Builder
    const { data: prodData } = await supabase
      .from('products')
      .select('id, name, code, unit_type, product_type')
      .eq('status', 'Active') // <--- New Logic: Only fetch Active products
      .order('name');
    if (prodData) setProducts(prodData);
    
    setIsLoading(false);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName || !groupCode) return;

    const { data, error } = await supabase
      .from('product_groups')
      .insert([{ group_name: groupName, group_code: groupCode, description }])
      .select();

    if (!error && data) {
      setGroups([data[0], ...groups]);
      setGroupName(''); setGroupCode(''); setDescription('');
      showMessage("Package created successfully!");
    } else {
      showMessage("Failed to create package. Package Code must be unique.", "error");
    }
  };

  const openEditModal = (grp: any) => {
    setEditingGroup(grp);
    setEditName(grp.group_name);
    setEditCode(grp.group_code);
    setEditDesc(grp.description || '');
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;
    setIsSavingEdit(true);

    const { error } = await supabase
      .from('product_groups')
      .update({ group_name: editName, group_code: editCode, description: editDesc })
      .eq('id', editingGroup.id);

    if (!error) {
      setGroups(groups.map(g => g.id === editingGroup.id ? { ...g, group_name: editName, group_code: editCode, description: editDesc } : g));
      showMessage("Package updated successfully!");
      setIsEditModalOpen(false);
    } else {
      showMessage("Failed to update package.", "error");
    }
    setIsSavingEdit(false);
  };

  const handleDeleteGroup = async (id: string) => {
    if(!confirm("Are you sure? This will delete the package and remove it from all manifests if applicable.")) return;
    const { error } = await supabase.from('product_groups').delete().eq('id', id);
    if (!error) {
      setGroups(groups.filter(g => g.id !== id));
      showMessage("Package deleted.");
    }
  };

  const openBuilderModal = async (group: any) => {
    setActiveGroup(group);
    setProductSearch('');
    setIsBuilderOpen(true);
    await loadBagItems(group.id);
  };

  const loadBagItems = async (groupId: string) => {
    const { data } = await supabase
      .from('product_group_items')
      .select(`id, product_id, products (id, name, code, unit_type, product_type)`)
      .eq('group_id', groupId);
      
    if (data) {
      setBagItems(data.map(item => ({
        db_id: item.id,
        product_id: item.product_id,
        ...item.products
      })));
    }
  };

  const handleAddToBag = async (product: any) => {
    if (bagItems.find(item => item.product_id === product.id)) {
      showMessage("Product is already in this package.", "error");
      return;
    }
    const { data, error } = await supabase.from('product_group_items').insert([{
      group_id: activeGroup.id,
      product_id: product.id
    }]).select();

    if (!error && data) {
      setBagItems(prev => [...prev, { db_id: data[0].id, product_id: product.id, ...product }]);
    } else {
      showMessage("Error adding product.", "error");
    }
  };

  const handleRemoveFromBag = async (db_id: string) => {
    await supabase.from('product_group_items').delete().eq('id', db_id);
    setBagItems(bagItems.filter(i => i.db_id !== db_id));
  };

  const openDetailsModal = async (group: any) => {
    setActiveGroup(group);
    setIsDetailsOpen(true);
    await loadBagItems(group.id);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
    p.code.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 relative">
      
      {/* Header */}
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 shadow-sm z-10">
        <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Product Packages & Kits</h2>
          <p className="text-sm text-slate-500 hidden md:block">Create standard groups (e.g., CRI, Winter Kit) to assign easily</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Toast Notification */}
        {msg.text && (
          <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 p-4 rounded-xl shadow-lg border text-sm font-bold animate-in slide-in-from-top-2 flex items-center ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}
          </div>
        )}

        {/* Create Form (Left Column) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm xl:col-span-1 h-fit">
          <h3 className="text-lg font-bold text-slate-900 mb-5 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mr-3">
              <Icons.Plus />
            </div>
            Create New Package
          </h3>
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Package Name</label>
              <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Standard CRI Kit" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Package Code</label>
              <input type="text" value={groupCode} onChange={(e) => setGroupCode(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. PKG-CRI-01" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Description (Optional)</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium outline-none focus:border-indigo-500 transition-colors resize-none" placeholder="What does this package contain?"></textarea>
            </div>
            
            <button type="submit" className="w-full text-white bg-gradient-to-r from-indigo-600 to-cyan-600 py-3 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all mt-2">
              Save Package
            </button>
          </form>
        </div>

        {/* Groups List (Right Column) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm xl:col-span-2 overflow-hidden flex flex-col h-fit">
           <div className="overflow-x-auto w-full">
             <table className="w-full text-left border-collapse min-w-[600px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Package Name & Code</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Description</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr><td colSpan={3} className="p-10 text-center"><Icons.Spinner /></td></tr>
                  ) : groups.length === 0 ? (
                    <tr><td colSpan={3} className="p-10 text-center text-sm text-slate-500 font-medium">No packages created yet.</td></tr>
                  ) : (
                    groups.map((grp) => (
                      <tr key={grp.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          <p className="font-bold text-slate-900 text-sm">{grp.group_name}</p>
                          <p className="text-xs text-indigo-600 font-mono font-bold mt-0.5">{grp.group_code}</p>
                        </td>
                        <td className="p-4">
                          <p className="text-xs text-slate-600 font-medium">{grp.description || 'No description'}</p>
                        </td>
                        <td className="p-4 text-right space-x-2 flex justify-end items-center">
                           <button onClick={() => openDetailsModal(grp)} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-lg hover:bg-emerald-100 transition-colors border border-emerald-100 shadow-sm flex items-center">
                             <span className="mr-1">👁️</span> Details
                           </button>
                           <button onClick={() => openBuilderModal(grp)} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors shadow-sm">
                             Manage Items
                           </button>
                           <button onClick={() => openEditModal(grp)} className="p-2 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors border border-transparent hover:border-amber-200" title="Edit Package">
                             <Icons.Edit />
                           </button>
                           <button onClick={() => handleDeleteGroup(grp.id)} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200" title="Delete Package">
                             <Icons.Trash />
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

      {/* ---------------- EDIT MODAL ---------------- */}
      {isEditModalOpen && editingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Edit Package</h3>
                <p className="text-xs text-indigo-600 font-mono mt-1 font-bold">{editingGroup.group_code}</p>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-100"><Icons.Close /></button>
            </div>
            
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Package Name</label>
                 <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 transition-colors" />
               </div>
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Package Code</label>
                 <input type="text" value={editCode} onChange={(e) => setEditCode(e.target.value)} required className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 transition-colors" />
               </div>
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Description (Optional)</label>
                 <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-medium outline-none focus:border-indigo-500 transition-colors resize-none"></textarea>
               </div>
               
               <button type="submit" disabled={isSavingEdit} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-md flex justify-center items-center mt-2 disabled:opacity-50">
                 {isSavingEdit ? <><Icons.Spinner /> Saving...</> : 'Save Changes'}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- 2-COLUMN BUILDER MODAL ---------------- */}
      {isBuilderOpen && activeGroup && (
        <div className="absolute inset-0 z-50 flex flex-col bg-slate-900/70 backdrop-blur-sm p-2 md:p-6">
          <div className="bg-white w-full max-w-5xl mx-auto rounded-xl shadow-2xl border border-slate-200 flex flex-col flex-1 overflow-hidden h-full animate-in zoom-in-95">
            
            <div className="p-3 md:p-4 border-b border-slate-200 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-3">
                <div className="bg-white/20 p-2 rounded-lg"><Icons.Catalog /></div>
                <div>
                  <h3 className="font-bold text-sm md:text-lg">Package Items Builder</h3>
                  <p className="text-[10px] md:text-xs text-indigo-300">Editing items for: <span className="font-bold text-white">{activeGroup.group_name}</span></p>
                </div>
              </div>
              <button onClick={() => setIsBuilderOpen(false)} className="text-white bg-slate-800 p-1.5 rounded-lg hover:bg-slate-700 transition-colors"><Icons.Close /></button>
            </div>
            
            <div className="flex-1 flex flex-col md:flex-row bg-slate-100 overflow-hidden">
              
              {/* Left Column: Available Products */}
              <div className="w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-white">
                <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                  <h4 className="font-bold text-slate-800 text-xs uppercase mb-3">Available Products</h4>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icons.Search /></div>
                    <input 
                      type="text" 
                      placeholder="Search products by name or code..." 
                      value={productSearch} 
                      onChange={(e) => setProductSearch(e.target.value)} 
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 transition-colors" 
                    />
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                  {filteredProducts.length === 0 ? (
                    <div className="text-center text-xs font-bold text-slate-400 p-8">No active products found matching your search.</div>
                  ) : (
                    filteredProducts.map(product => (
                      <div key={product.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-slate-50 hover:border-indigo-300 transition-colors group">
                        <div className="flex items-center space-x-3 truncate pr-2">
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${product.product_type === 'LPG' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {product.product_type}
                          </span>
                          <div className="truncate">
                            <p className="font-bold text-slate-900 text-sm truncate">{product.name}</p>
                            <p className="text-[10px] text-slate-500 font-mono mt-0.5">Code: {product.code} | Unit: {product.unit_type}</p>
                          </div>
                        </div>
                        <button onClick={() => handleAddToBag(product)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-indigo-600 flex items-center justify-center shrink-0 hover:border-indigo-500 hover:bg-indigo-50 transition-colors shadow-sm">
                          <Icons.Plus />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Package Bag */}
              <div className="w-full md:w-1/2 flex flex-col bg-slate-50">
                <div className="p-4 border-b border-indigo-100 bg-indigo-50/80 flex justify-between items-center shrink-0">
                  <h4 className="font-bold text-indigo-900 text-xs uppercase flex items-center">
                    <span className="mr-2 text-base">📥</span> Package Bag
                  </h4>
                  <span className="bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-sm">{bagItems.length} Added</span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-3 space-y-3 relative custom-scrollbar">
                  {bagItems.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-center p-4">
                      <span className="text-4xl mb-3 opacity-50">📦</span>
                      <p className="text-sm font-bold text-slate-500">Bag is empty</p>
                      <p className="text-[10px] mt-1">Add products from the left panel</p>
                    </div>
                  ) : (
                    bagItems.map(item => (
                      <div key={item.db_id} className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm relative group flex items-center justify-between transition-colors hover:border-indigo-300">
                        <div className="pr-10">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${item.product_type === 'LPG' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
                              {item.product_type}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 font-mono uppercase tracking-wider">{item.unit_type}</span>
                          </div>
                          <p className="font-bold text-slate-900 text-sm leading-tight">{item.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">Code: {item.code}</p>
                        </div>
                        <button onClick={() => handleRemoveFromBag(item.db_id)} className="text-rose-400 hover:text-rose-600 bg-rose-50 p-2 rounded-xl border border-transparent hover:border-rose-200 transition-colors shrink-0">
                          <Icons.Trash />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                  <button onClick={() => setIsBuilderOpen(false)} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-md flex items-center justify-center">
                    <span className="mr-2 text-emerald-400">✅</span> Done & Close Builder
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- DETAILS VIEW MODAL ---------------- */}
      {isDetailsOpen && activeGroup && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Package Details</h3>
                <p className="text-xs text-slate-500 mt-0.5"><span className="font-bold text-indigo-600">{activeGroup.group_name}</span></p>
              </div>
              <button onClick={() => setIsDetailsOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm"><Icons.Close /></button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
               <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Products included</h4>
               {bagItems.length === 0 ? (
                 <p className="text-sm text-slate-500 text-center p-4 bg-slate-50 rounded-xl border border-slate-100">No products added to this package yet.</p>
               ) : (
                 <ul className="space-y-3">
                   {bagItems.map(item => (
                     <li key={item.db_id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50">
                       <div className="flex items-center space-x-3">
                         <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${item.product_type === 'LPG' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
                           {item.product_type}
                         </span>
                         <div>
                           <p className="text-sm font-bold text-slate-900">{item.name}</p>
                           <p className="text-[10px] text-slate-500 font-mono mt-0.5">{item.code}</p>
                         </div>
                       </div>
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.unit_type}</span>
                     </li>
                   ))}
                 </ul>
               )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}