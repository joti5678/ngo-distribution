"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ============================================================================
// SYSTEM FOLDER STRUCTURE (VIRTUAL FILE SYSTEM)
// When you create a new page in Next.js, simply add it to this list.
// It will automatically appear in the left panel's folder structure.
// ============================================================================
const APP_TREE = [
  {
    folder: 'General / Dashboard',
    items: [
      { path: '/dashboard', title: 'Main Dashboard' }
    ]
  },
  {
    folder: 'Distribution',
    items: [
      { path: '/distribution/manifests', title: 'Manifest Management' },
      { path: '/distribution/reports', title: 'Distribution Reports' }
    ]
  },
  {
    folder: 'Inventory',
    items: [
      { path: '/inventory/receive', title: 'Receive Stock' },
      { path: '/inventory/transfer', title: 'Transfer Stock' },
      { path: '/inventory/damage', title: 'Damage & Shortage' }
    ]
  },
  {
    folder: 'Catalog & Products',
    items: [
      { path: '/catalog', title: 'Product Catalog' },
      { path: '/catalog/groups', title: 'Product Packages' }
    ]
  },
  {
    folder: 'Admin Settings',
    items: [
      { path: '/admin', title: 'Admin Control Panel' },
      { path: '/admin/dp-setup', title: 'Distribution Points (DPs)' },
      { path: '/admin/wh-setup', title: 'Warehouses (WH)' },
      { path: '/admin/dp-wh-connection', title: 'DP & WH Mapping' },
      { path: '/admin/partners', title: 'Partner Setup' },
      { path: '/admin/product-history', title: 'Product Audit History' }
    ]
  },
  {
    folder: 'Access Control',
    items: [
      { path: '/admin/user-page-management', title: 'Management Hub' },
      { path: '/admin/user-page-management/roles', title: 'Role Management' },
      { path: '/admin/user-page-management/routes', title: 'Route Management' },
      { path: '/admin/user-page-management/access', title: 'Page Access Control' },
      { path: '/admin/user-page-management/users', title: 'User Management' },
      { path: '/database-management/force-delete', title: 'Database Hard Delete' }
    ]
  }
];

export default function RouteManagementPage() {
  const [registeredRoutes, setRegisteredRoutes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Drag & Drop Refs for Right Panel reordering
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    fetchRoutes();
  }, []);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const fetchRoutes = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('app_routes').select('*').order('sort_order', { ascending: true });
    
    if (error) {
      showMessage("Error loading routes. Ensure 'app_routes' table exists.", "error");
    } else if (data) {
      setRegisteredRoutes(data);
    }
    setIsLoading(false);
  };

  // Check if a path is already registered
  const isRegistered = (path: string) => {
    return registeredRoutes.some(r => r.path === path);
  };

  // --- ACTIONS ---

  const handleAddSingleRoute = async (item: any, folderName: string) => {
    if (isRegistered(item.path)) return;
    
    const newOrder = registeredRoutes.length;
    const payload = { 
        title: item.title, 
        path: item.path, 
        group_name: folderName,
        is_active: true,
        sort_order: newOrder
    };

    const { error } = await supabase.from('app_routes').insert([payload]);
    if (error) {
        showMessage(error.message, "error");
    } else {
        fetchRoutes();
    }
  };

  const handleAddFolder = async (folder: any) => {
    // Filter items that are not yet registered
    const unregisteredItems = folder.items.filter((item: any) => !isRegistered(item.path));
    if (unregisteredItems.length === 0) return; // All already registered

    const currentLength = registeredRoutes.length;
    const payloads = unregisteredItems.map((item: any, idx: number) => ({
        title: item.title, 
        path: item.path, 
        group_name: folder.folder,
        is_active: true,
        sort_order: currentLength + idx
    }));

    const { error } = await supabase.from('app_routes').insert(payloads);
    if (error) {
        showMessage(error.message, "error");
    } else {
        showMessage(`Successfully added ${payloads.length} pages from ${folder.folder}`);
        fetchRoutes();
    }
  };

  const handleRemoveRoute = async (id: string, title: string) => {
    const { error } = await supabase.from('app_routes').delete().eq('id', id);
    if (error) {
        showMessage(error.message, "error");
    } else {
        setRegisteredRoutes(registeredRoutes.filter(r => r.id !== id));
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
      const newStatus = !currentStatus;
      const { error } = await supabase.from('app_routes').update({ is_active: newStatus }).eq('id', id);
      if (error) {
          showMessage(error.message, "error");
      } else {
          setRegisteredRoutes(registeredRoutes.map(r => r.id === id ? { ...r, is_active: newStatus } : r));
      }
  };

  const handleSort = async () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    
    let _routes = [...registeredRoutes];
    const draggedItemContent = _routes.splice(dragItem.current, 1)[0];
    _routes.splice(dragOverItem.current, 0, draggedItemContent);
    
    dragItem.current = null;
    dragOverItem.current = null;
    
    setRegisteredRoutes(_routes);
    
    // Batch update sort orders in background
    for (let i = 0; i < _routes.length; i++) {
        await supabase.from('app_routes').update({ sort_order: i }).eq('id', _routes[i].id);
    }
  };

  // SVGs for Icons
  const FolderIcon = () => <svg className="w-5 h-5 text-indigo-400 mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>;
  const FileIcon = () => <svg className="w-4 h-4 text-slate-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 overflow-hidden">
      
      {/* Header */}
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-6 shrink-0 shadow-sm z-10 justify-between">
        <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center" title="Back">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Route & Page Management</h1>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Strict Access Control Registry</p>
            </div>
        </div>
        <div className="hidden md:flex items-center bg-rose-50 border border-rose-200 px-4 py-2 rounded-lg">
           <span className="text-xl mr-2">🛡️</span>
           <p className="text-[10px] font-bold text-rose-700 leading-tight">Unregistered pages are strictly restricted.<br/>Move pages to right to enable access.</p>
        </div>
      </header>

      {/* Main Dual-Pane Grid */}
      <main className="flex-1 overflow-hidden p-6">
        
        {msg.text && (
          <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-50 p-4 rounded-xl shadow-lg border text-sm font-bold flex items-center animate-in slide-in-from-top-4 ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}
          </div>
        )}

        <div className="flex flex-col xl:flex-row h-full gap-6">
           
           {/* ========================================================= */}
           {/* LEFT PANE: SYSTEM FILE EXPLORER (AVAILABLE UNREGISTERED PAGES) */}
           {/* ========================================================= */}
           <div className="xl:w-1/2 flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden h-full">
             <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
               <div>
                 <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">Available System Pages</h2>
                 <p className="text-[10px] text-slate-500 font-medium mt-1">Select whole folder or specific pages to register.</p>
               </div>
               <span className="text-2xl opacity-50">📂</span>
             </div>

             <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-4">
                {APP_TREE.map((folder, fIdx) => {
                   // Calculate how many items are already registered in this folder
                   const unregisteredItems = folder.items.filter(item => !isRegistered(item.path));
                   const isFullyRegistered = unregisteredItems.length === 0;

                   return (
                     <div key={fIdx} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                       {/* Folder Header */}
                       <div className="bg-slate-50 p-3 flex justify-between items-center border-b border-slate-100">
                          <div className="flex items-center">
                             <FolderIcon />
                             <span className={`font-black text-sm ${isFullyRegistered ? 'text-slate-400' : 'text-slate-700'}`}>{folder.folder}</span>
                          </div>
                          <button 
                             onClick={() => handleAddFolder(folder)}
                             disabled={isFullyRegistered}
                             className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors border ${isFullyRegistered ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 shadow-sm'}`}
                          >
                             {isFullyRegistered ? 'All Added' : '+ Add Entire Folder'}
                          </button>
                       </div>
                       
                       {/* Folder Items */}
                       <div className="divide-y divide-slate-50 p-1">
                          {folder.items.map((item, iIdx) => {
                             const registered = isRegistered(item.path);
                             return (
                               <div key={iIdx} className={`flex justify-between items-center p-2.5 transition-colors rounded-lg ${registered ? 'opacity-40 bg-slate-50' : 'hover:bg-slate-50'}`}>
                                 <div className="flex flex-col ml-6">
                                    <div className="flex items-center">
                                       <FileIcon />
                                       <span className={`font-bold text-xs ${registered ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{item.title}</span>
                                    </div>
                                    <span className="text-[9px] text-slate-400 font-mono ml-6 mt-0.5">{item.path}</span>
                                 </div>
                                 <button 
                                   onClick={() => handleAddSingleRoute(item, folder.folder)}
                                   disabled={registered}
                                   className={`w-7 h-7 flex items-center justify-center rounded-md shrink-0 transition-colors ${registered ? 'text-slate-300' : 'text-indigo-600 bg-white border border-slate-200 hover:border-indigo-400 shadow-sm'}`}
                                 >
                                    {registered ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
                                 </button>
                               </div>
                             );
                          })}
                       </div>
                     </div>
                   );
                })}
             </div>
           </div>


           {/* ========================================================= */}
           {/* RIGHT PANE: REGISTERED ROUTES (ALLOWED TO ASSIGN ACCESS) */}
           {/* ========================================================= */}
           <div className="xl:w-1/2 flex flex-col bg-white rounded-3xl shadow-sm border border-indigo-200 overflow-hidden h-full ring-4 ring-indigo-50/50">
             <div className="p-5 border-b border-indigo-100 bg-indigo-50/50 flex justify-between items-center shrink-0">
               <div>
                 <h2 className="text-sm font-black text-indigo-900 uppercase tracking-wide">Registered & Active Routes</h2>
                 <p className="text-[10px] text-indigo-500 font-medium mt-1">These pages can now be assigned to user roles. Drag to reorder.</p>
               </div>
               <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">{registeredRoutes.length} Pages</span>
             </div>

             <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-slate-50/30" onDragOver={(e) => e.preventDefault()}>
                {isLoading ? (
                   <div className="flex justify-center items-center h-40 text-slate-400">Loading registered routes...</div>
                ) : registeredRoutes.length === 0 ? (
                   <div className="flex flex-col justify-center items-center h-full text-slate-400">
                      <span className="text-5xl mb-4 opacity-30">🛡️</span>
                      <p className="font-bold text-sm text-slate-500">No pages registered.</p>
                      <p className="text-xs mt-1">Select pages from the left panel to allow access.</p>
                   </div>
                ) : (
                   <div className="space-y-3">
                     {registeredRoutes.map((route, index) => (
                        <div 
                          key={route.id} 
                          draggable
                          onDragStart={() => dragItem.current = index}
                          onDragEnter={() => dragOverItem.current = index}
                          onDragEnd={handleSort}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-2xl transition-all group cursor-move shadow-sm ${route.is_active === false ? 'bg-slate-100 border-slate-200 opacity-70' : 'bg-white border-indigo-100 hover:border-indigo-300'}`}
                        >
                           <div className="flex items-start space-x-4 mb-3 sm:mb-0 overflow-hidden flex-1">
                             <div className="pt-1 cursor-grab text-slate-300 group-hover:text-indigo-400 transition-colors">
                               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
                             </div>
                             <div className="truncate">
                               <div className="flex items-center space-x-2">
                                  <h4 className={`font-black text-sm truncate ${route.is_active === false ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{route.title}</h4>
                                  <span className="bg-slate-100 text-slate-500 text-[8px] font-bold uppercase px-2 py-0.5 rounded border border-slate-200 shrink-0">
                                     {route.group_name}
                                  </span>
                               </div>
                               <p className="text-[10px] text-slate-500 font-mono mt-1 truncate">
                                  {route.path}
                               </p>
                             </div>
                           </div>
                           
                           <div className="flex items-center space-x-2 shrink-0 ml-9 sm:ml-0">
                              <button 
                                 onClick={() => handleToggleStatus(route.id, route.is_active !== false)} 
                                 className={`px-3 py-1.5 rounded-lg font-bold text-[10px] transition-colors uppercase border shadow-sm ${route.is_active !== false ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-200 text-slate-500 border-slate-300 hover:bg-slate-300'}`}
                              >
                                 {route.is_active !== false ? 'Active' : 'Inactive'}
                              </button>
                              
                              <button 
                                onClick={() => handleRemoveRoute(route.id, route.title)} 
                                className="p-1.5 text-rose-400 bg-rose-50 hover:bg-rose-100 hover:text-rose-600 rounded-lg border border-rose-100 transition-colors" 
                                title="Remove Registration"
                              >
                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                           </div>
                        </div>
                     ))}
                   </div>
                )}
             </div>
           </div>

        </div>
      </main>
    </div>
  );
}
