"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function RouteManagementPage() {
  const [appMenus, setAppMenus] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [modalType, setModalType] = useState<'folder' | 'page'>('page');
  const [editId, setEditId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
      title: '',
      path: '',
      parent_id: '',
      icon_name: 'Folder'
  });

  useEffect(() => {
    fetchMenus();
  }, []);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const fetchMenus = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('app_menus').select('*').order('sort_order', { ascending: true });
    if (error) showMessage(error.message, "error");
    else setAppMenus(data || []);
    setIsLoading(false);
  };

  const parents = appMenus.filter(m => m.is_parent);

  const openModal = (mode: 'add' | 'edit', type: 'folder' | 'page', menuData: any = null) => {
      setModalMode(mode);
      setModalType(type);
      setEditId(menuData ? menuData.id : null);
      
      if (mode === 'edit' && menuData) {
          setFormData({
              title: menuData.title,
              path: menuData.path,
              parent_id: menuData.parent_id || '',
              icon_name: menuData.icon_name || 'Folder'
          });
      } else {
          setFormData({
              title: '',
              path: '',
              parent_id: type === 'page' && parents.length > 0 ? parents[0].id : '',
              icon_name: 'Folder'
          });
      }
      setIsModalOpen(true);
  };

  const handleSaveMenu = async (e: React.FormEvent) => {
      e.preventDefault();
      
      const payload: any = {
          title: formData.title,
          path: formData.path,
          is_parent: modalType === 'folder',
          parent_id: modalType === 'page' ? formData.parent_id : null,
          icon_name: modalType === 'folder' ? formData.icon_name : null,
          is_active: true
      };

      try {
          if (modalMode === 'add') {
              payload.sort_order = appMenus.length * 10; 
              const { error } = await supabase.from('app_menus').insert([payload]);
              if (error) throw error;
              showMessage(`${modalType === 'folder' ? 'Folder' : 'Page'} created successfully!`);
          } else {
              const { error } = await supabase.from('app_menus').update(payload).eq('id', editId);
              if (error) throw error;
              showMessage(`Updated successfully!`);
          }
          fetchMenus();
          setIsModalOpen(false);
      } catch (err: any) {
          showMessage(err.message, "error");
      }
  };

  const handleDelete = async (id: string) => {
      if(!window.confirm("Are you sure? Deleting a folder will also delete all pages inside it!")) return;
      const { error } = await supabase.from('app_menus').delete().eq('id', id);
      if (error) showMessage(error.message, "error");
      else {
          showMessage("Deleted successfully!");
          fetchMenus();
      }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
      const { error } = await supabase.from('app_menus').update({ is_active: !currentStatus }).eq('id', id);
      if (error) showMessage(error.message, "error");
      else fetchMenus();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 overflow-hidden relative">
      {msg.text && (
        <div className={`fixed top-10 left-1/2 -translate-x-1/2 z-[9999] p-4 rounded-xl shadow-2xl border text-sm font-bold flex items-center animate-in slide-in-from-top-4 ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          <span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}
        </div>
      )}

      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 shadow-sm z-10 justify-between">
        <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-3 md:mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
              <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Route & Menu Builder</h1>
              <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Dynamic Hierarchical Architecture</p>
            </div>
        </div>
        <div className="flex space-x-3">
            <button onClick={() => openModal('add', 'page')} className="bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold py-2.5 px-4 rounded-xl text-sm shadow-sm transition-colors flex items-center">
               + Add Sub-Page
            </button>
            <button onClick={() => openModal('add', 'folder')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-sm shadow-md transition-colors flex items-center">
               + Create New Menu
            </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        <div className="max-w-5xl mx-auto space-y-6">
            {isLoading ? (
                <div className="text-center p-10 text-slate-400 font-bold">Loading System Architecture...</div>
            ) : parents.map(parent => (
                <div key={parent.id} className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                    <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
                        <div className="flex items-center space-x-3">
                            <span className="text-xl opacity-70">📁</span>
                            <div>
                                <h3 className="font-black text-base">{parent.title}</h3>
                                <p className="text-[10px] font-mono text-slate-400 mt-0.5">{parent.path}</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <button onClick={() => handleToggleActive(parent.id, parent.is_active)} className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase border ${parent.is_active ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                                {parent.is_active ? 'Active' : 'Inactive'}
                            </button>
                            <button onClick={() => openModal('edit', 'folder', parent)} className="p-1.5 text-amber-300 hover:bg-amber-400/20 rounded-lg transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                            <button onClick={() => handleDelete(parent.id)} className="p-1.5 text-rose-400 hover:bg-rose-500/20 rounded-lg transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                        </div>
                    </div>
                    
                    <div className="p-2 bg-slate-50/50">
                        <table className="w-full text-left border-collapse">
                            <tbody>
                                {appMenus.filter(m => m.parent_id === parent.id).map(child => (
                                    <tr key={child.id} className="border-b border-slate-100 hover:bg-white transition-colors group">
                                        <td className="p-3 pl-8 flex items-center space-x-3">
                                            <span className="text-slate-300">📄</span>
                                            <div>
                                                <p className={`text-sm font-bold ${child.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{child.title}</p>
                                                <p className="text-[10px] font-mono text-slate-500">{child.path}</p>
                                            </div>
                                        </td>
                                        <td className="p-3 text-right">
                                            <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleToggleActive(child.id, child.is_active)} className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase border ${child.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-200 text-slate-500 border-slate-300'}`}>
                                                    {child.is_active ? 'Active' : 'Inactive'}
                                                </button>
                                                <button onClick={() => openModal('edit', 'page', child)} className="p-1.5 text-amber-500 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                                <button onClick={() => handleDelete(child.id)} className="p-1.5 text-rose-500 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
      </main>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-black text-lg text-slate-900">{modalMode === 'add' ? 'Create New' : 'Edit'} {modalType === 'folder' ? 'Menu' : 'Page'}</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-100"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            
            <form onSubmit={handleSaveMenu} className="p-6 space-y-5">
               {modalType === 'page' && (
                 <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Parent Menu (Folder) *</label>
                   <select value={formData.parent_id} onChange={e => setFormData({...formData, parent_id: e.target.value})} required className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 shadow-sm">
                     {parents.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                   </select>
                 </div>
               )}
               
               <div>
                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Title / Name *</label>
                 <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required placeholder="e.g. Employee List" className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 shadow-sm" />
               </div>

               <div>
                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">URL Path *</label>
                 <input type="text" value={formData.path} onChange={e => setFormData({...formData, path: e.target.value})} required placeholder="e.g. /hr/employees" className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-mono text-slate-900 outline-none focus:border-indigo-500 shadow-sm" />
                 <p className="text-[10px] text-slate-400 mt-1">Must start with a forward slash (/). Ex: <b>/distribution</b> or <b>/distribution/report</b></p>
               </div>

               {modalType === 'folder' && (
                 <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Icon Name (Optional)</label>
                   <input type="text" value={formData.icon_name} onChange={e => setFormData({...formData, icon_name: e.target.value})} placeholder="e.g. Users, Catalog, Dashboard" className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 shadow-sm" />
                 </div>
               )}
               
               <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl text-sm transition-all shadow-lg flex justify-center items-center mt-6">
                 {modalMode === 'add' ? '➕ Create Now' : '💾 Update Changes'}
               </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
