"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function PageAccessControl() {
  const [roles, setRoles] = useState<any[]>([]);
  const [appMenus, setAppMenus] = useState<any[]>([]);
  
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [allowedMenuIds, setAllowedMenuIds] = useState<Set<string>>(new Set());
  
  // Track which folders are open/expanded in the UI
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    const { data: rolesData } = await supabase.from('user_roles').select('*').order('created_at', { ascending: true });
    setRoles(rolesData || []);

    const { data: menusData } = await supabase.from('app_menus').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    setAppMenus(menusData || []);
    setIsLoading(false);
  };

  useEffect(() => {
    if (selectedRoleId) {
      loadRoleAccess(selectedRoleId);
    } else {
      setAllowedMenuIds(new Set());
    }
  }, [selectedRoleId, appMenus]);

  const loadRoleAccess = async (roleId: string) => {
    const { data: accessData } = await supabase.from('role_route_access').select('menu_id').eq('role_id', roleId);
    if (accessData) {
        setAllowedMenuIds(new Set(accessData.map(a => a.menu_id)));
    } else {
        setAllowedMenuIds(new Set());
    }
  };

  // --- ACCESS LOGIC ---
  const toggleParentAccess = (parentId: string, childrenIds: string[], isCurrentlyAllowed: boolean) => {
      const newAccess = new Set(allowedMenuIds);
      if (isCurrentlyAllowed) {
          // Revoke parent and clean up children
          newAccess.delete(parentId);
          childrenIds.forEach(id => newAccess.delete(id));
      } else {
          // Grant parent (Wildcard)
          newAccess.add(parentId);
      }
      setAllowedMenuIds(newAccess);
  };

  const toggleChildAccess = (childId: string, parentId: string) => {
      if (allowedMenuIds.has(parentId)) {
          showMessage("Folder has wildcard access! Revoke folder access to select individual pages.", "error");
          return;
      }

      const newAccess = new Set(allowedMenuIds);
      if (newAccess.has(childId)) {
          newAccess.delete(childId);
      } else {
          newAccess.add(childId);
      }
      setAllowedMenuIds(newAccess);
  };

  const toggleFolderExpand = (folderId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const newExpanded = new Set(expandedFolders);
      if (newExpanded.has(folderId)) {
          newExpanded.delete(folderId);
      } else {
          newExpanded.add(folderId);
      }
      setExpandedFolders(newExpanded);
  };

  const handleSaveAccess = async () => {
    if (!selectedRoleId) return;
    setIsSaving(true);
    try {
      await supabase.from('role_route_access').delete().eq('role_id', selectedRoleId);
      
      const allowedArray = Array.from(allowedMenuIds);
      if (allowedArray.length > 0) {
         const payload = allowedArray.map(menuId => ({
            role_id: selectedRoleId,
            menu_id: menuId
         }));
         const { error } = await supabase.from('role_route_access').insert(payload);
         if (error) throw error;
      }
      showMessage("Access configuration saved securely!");
    } catch (err: any) {
      showMessage(err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const parents = appMenus.filter(m => m.is_parent);

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 overflow-hidden">
      
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-6 shrink-0 shadow-sm z-10 justify-between">
        <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Page Access Control</h1>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Hierarchical Wildcard Mapping</p>
            </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-4 md:p-6 flex flex-col xl:flex-row gap-6 relative">
        
        {msg.text && (
          <div className={`absolute top-10 left-1/2 -translate-x-1/2 z-50 p-4 rounded-xl shadow-xl border text-sm font-bold flex items-center animate-in slide-in-from-top-4 ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}
          </div>
        )}

        {/* LEFT COL: ROLES */}
        <div className="xl:w-1/4 flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden h-full">
           <div className="p-5 border-b border-slate-100 bg-slate-900 text-white shrink-0">
             <h2 className="text-sm font-black uppercase tracking-wide">1. Select User Role</h2>
           </div>
           <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2 bg-slate-50/50">
              {isLoading ? (
                  <div className="text-center p-4 text-slate-400 font-bold">Loading...</div>
              ) : roles.map(role => (
                 <button 
                   key={role.id}
                   onClick={() => setSelectedRoleId(role.id)}
                   className={`w-full text-left p-4 rounded-xl transition-all border ${selectedRoleId === role.id ? 'bg-indigo-600 border-indigo-700 text-white shadow-md scale-[1.02]' : 'bg-white border-slate-200 hover:border-indigo-300 text-slate-700'}`}
                 >
                    <div className="flex justify-between items-center">
                       <span className="font-black text-sm">{role.role_name}</span>
                    </div>
                 </button>
              ))}
           </div>
        </div>

        {/* RIGHT COL: MATRIX */}
        <div className="xl:w-3/4 flex flex-col h-full">
           {!selectedRoleId ? (
              <div className="flex-1 bg-white rounded-3xl border border-slate-200 border-dashed flex flex-col items-center justify-center text-slate-400 shadow-sm">
                 <span className="text-6xl mb-4 opacity-50">🔐</span>
                 <p className="font-bold text-lg text-slate-600">No Role Selected</p>
              </div>
           ) : (
              <div className="flex-1 flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                 <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                    <div>
                      <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">2. Configure Role Access</h2>
                      <p className="text-[10px] text-slate-500 font-medium mt-1">Click a folder to expand and select specific sub-pages.</p>
                    </div>
                    <button 
                       onClick={handleSaveAccess}
                       disabled={isSaving}
                       className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-md transition-all flex items-center disabled:opacity-50 text-xs"
                    >
                       {isSaving ? 'Saving...' : '💾 Save Security Matrix'}
                    </button>
                 </div>

                 <div className="flex-1 overflow-y-auto p-6 bg-slate-100/50 custom-scrollbar">
                    
                    {/* FIXED MASONRY LAYOUT TO PREVENT OVERLAPPING */}
                    <div className="columns-1 lg:columns-2 gap-6 pb-20">
                        {parents.map(parent => {
                            const children = appMenus.filter(m => m.parent_id === parent.id);
                            const childrenIds = children.map(c => c.id);
                            
                            const isParentAllowed = allowedMenuIds.has(parent.id);
                            const isExpanded = expandedFolders.has(parent.id);
                            
                            const hasAllowedChildren = children.some(c => allowedMenuIds.has(c.id));
                            const isPartiallyAllowed = !isParentAllowed && hasAllowedChildren;
                            
                            return (
                               <div key={parent.id} className={`break-inside-avoid mb-6 bg-white rounded-2xl border transition-all shadow-sm overflow-hidden ${(isParentAllowed || isPartiallyAllowed) ? 'border-indigo-400 ring-2 ring-indigo-50' : 'border-slate-200'}`}>
                                   
                                   {/* Parent Folder Main Bar */}
                                   <div className={`flex items-center justify-between p-3 pr-4 border-b transition-colors ${(isParentAllowed || isPartiallyAllowed) ? 'bg-indigo-50/50 border-indigo-100' : 'bg-white border-slate-100'}`}>
                                      
                                      {/* Expand/Collapse Button */}
                                      <button 
                                          onClick={(e) => toggleFolderExpand(parent.id, e)}
                                          className={`p-2 rounded-lg transition-colors flex items-center justify-center shrink-0 ${isExpanded ? 'bg-slate-200 text-slate-600' : 'text-slate-400 hover:bg-slate-100 hover:text-indigo-600'}`}
                                          title={isExpanded ? "Collapse Folder" : "Expand Folder"}
                                      >
                                          <svg className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                      </button>

                                      {/* Folder Info */}
                                      <div 
                                          onClick={() => toggleParentAccess(parent.id, childrenIds, isParentAllowed)} 
                                          className="flex-1 flex items-center space-x-3 cursor-pointer pl-2 py-2"
                                      >
                                          <span className="text-2xl opacity-90">📁</span>
                                          <div>
                                             <h3 className={`font-black text-sm ${(isParentAllowed || isPartiallyAllowed) ? 'text-indigo-900' : 'text-slate-700'}`}>{parent.title}</h3>
                                             {isParentAllowed ? (
                                                 <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mt-0.5">Wildcard Access Granted</p>
                                             ) : isPartiallyAllowed ? (
                                                 <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest mt-0.5">Partial Access Granted</p>
                                             ) : (
                                                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{children.length} Pages</p>
                                             )}
                                          </div>
                                      </div>

                                      {/* Master Toggle Checkbox */}
                                      <div 
                                          onClick={() => toggleParentAccess(parent.id, childrenIds, isParentAllowed)} 
                                          className={`w-7 h-7 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all shrink-0 ${isParentAllowed ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : isPartiallyAllowed ? 'bg-indigo-100 border-indigo-400 text-indigo-600' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
                                      >
                                          {(isParentAllowed || isPartiallyAllowed) && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                      </div>
                                   </div>

                                   {/* Expandable Child Pages Area */}
                                   {isExpanded && children.length > 0 && (
                                       <div className="divide-y divide-slate-100 p-2 bg-slate-50/50">
                                          {children.map(child => {
                                              const isChildAllowed = allowedMenuIds.has(child.id);
                                              const isInherited = isParentAllowed; // Child inherently gets access if parent has it
                                              const isVisuallyChecked = isChildAllowed || isInherited;

                                              return (
                                                  <div 
                                                     key={child.id}
                                                     onClick={() => toggleChildAccess(child.id, parent.id)}
                                                     className={`flex items-center justify-between p-3 rounded-xl transition-colors ${isInherited ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-slate-200'}`}
                                                     title={isInherited ? "Access inherited from Folder Wildcard" : "Click to toggle access"}
                                                  >
                                                     <div className="flex items-center space-x-3 pl-8 border-l-2 border-slate-200 ml-4">
                                                        <span className="text-slate-400">📄</span>
                                                        <div>
                                                            <span className={`text-xs font-bold ${isVisuallyChecked ? 'text-indigo-700' : 'text-slate-600'}`}>{child.title}</span>
                                                            <p className="text-[9px] font-mono text-slate-500">{child.path}</p>
                                                        </div>
                                                     </div>
                                                     
                                                     <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isVisuallyChecked ? (isInherited ? 'bg-indigo-400 border-indigo-400 text-white' : 'bg-indigo-600 border-indigo-600 text-white shadow-sm') : 'border-slate-300 bg-white'}`}>
                                                        {isVisuallyChecked && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                     </div>
                                                  </div>
                                              );
                                          })}
                                       </div>
                                   )}
                                   
                                   {isExpanded && children.length === 0 && (
                                       <div className="p-4 text-center text-xs font-bold text-slate-400 bg-slate-50">
                                           No sub-pages inside this folder.
                                       </div>
                                   )}

                               </div>
                            );
                        })}
                    </div>
                 </div>
              </div>
           )}
        </div>
      </main>
    </div>
  );
}