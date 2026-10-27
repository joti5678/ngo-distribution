"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function PageAccessControl() {
  const [roles, setRoles] = useState<any[]>([]);
  const [allRoutes, setAllRoutes] = useState<any[]>([]);
  
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  
  // Dual-pane states
  const [unassignedRoutes, setUnassignedRoutes] = useState<any[]>([]);
  const [assignedRoutes, setAssignedRoutes] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Drag & Drop Refs
  const dragItem = useRef<{ index: number, source: 'unassigned' | 'assigned' } | null>(null);
  const dragOverItem = useRef<{ index: number, target: 'unassigned' | 'assigned' } | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    
    // Fetch Roles
    const { data: rolesData, error: rolesError } = await supabase.from('user_roles').select('*').order('created_at', { ascending: true });
    if (rolesError) showMessage("Error loading roles", "error");
    else setRoles(rolesData || []);

    // Fetch Active Routes
    const { data: routesData, error: routesError } = await supabase.from('app_routes').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    if (routesError) showMessage("Error loading routes", "error");
    else setAllRoutes(routesData || []);

    setIsLoading(false);
  };

  // Load access mapping when a role is selected
  useEffect(() => {
    if (selectedRoleId) {
      loadRoleAccess(selectedRoleId);
    } else {
      setUnassignedRoutes([]);
      setAssignedRoutes([]);
    }
  }, [selectedRoleId, allRoutes]);

  const loadRoleAccess = async (roleId: string) => {
    // Super Admin override logic can be handled here or in middleware. 
    // Usually Super Admin gets everything implicitly, but we'll map it visually anyway.
    const { data: accessData } = await supabase.from('role_route_access').select('route_id').eq('role_id', roleId);
    
    const assignedIds = accessData ? accessData.map(a => a.route_id) : [];
    
    const assigned = allRoutes.filter(r => assignedIds.includes(r.id));
    const unassigned = allRoutes.filter(r => !assignedIds.includes(r.id));
    
    setAssignedRoutes(assigned);
    setUnassignedRoutes(unassigned);
  };

  // --- ACTIONS ---

  const handleGrantAccess = (route: any) => {
    setUnassignedRoutes(unassignedRoutes.filter(r => r.id !== route.id));
    setAssignedRoutes([...assignedRoutes, route]);
  };

  const handleRevokeAccess = (route: any) => {
    setAssignedRoutes(assignedRoutes.filter(r => r.id !== route.id));
    setUnassignedRoutes([...unassignedRoutes, route]);
  };

  const handleGrantAll = () => {
    setAssignedRoutes([...assignedRoutes, ...unassignedRoutes]);
    setUnassignedRoutes([]);
  };

  const handleRevokeAll = () => {
    setUnassignedRoutes([...unassignedRoutes, ...assignedRoutes]);
    setAssignedRoutes([]);
  };

  const handleSaveAccess = async () => {
    if (!selectedRoleId) return;
    setIsSaving(true);
    
    try {
      // 1. Delete existing access for this role
      await supabase.from('role_route_access').delete().eq('role_id', selectedRoleId);
      
      // 2. Insert new access array
      if (assignedRoutes.length > 0) {
         const payload = assignedRoutes.map(route => ({
            role_id: selectedRoleId,
            route_id: route.id
         }));
         const { error } = await supabase.from('role_route_access').insert(payload);
         if (error) throw error;
      }
      
      showMessage("Access configuration saved successfully!");
    } catch (err: any) {
      showMessage(err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // --- DRAG AND DROP HANDLERS ---
  const handleDragStart = (e: React.DragEvent, index: number, source: 'unassigned' | 'assigned') => {
    dragItem.current = { index, source };
  };

  const handleDragEnter = (e: React.DragEvent, index: number, target: 'unassigned' | 'assigned') => {
    e.preventDefault();
    dragOverItem.current = { index, target };
  };

  const handleDragOverContainer = (e: React.DragEvent, target: 'unassigned' | 'assigned') => {
    e.preventDefault();
    // Allow dropping into empty container
    if (dragOverItem.current?.target !== target) {
        dragOverItem.current = { index: -1, target };
    }
  };

  const handleDrop = () => {
    if (!dragItem.current || !dragOverItem.current) return;

    const { index: sourceIndex, source } = dragItem.current;
    const { index: targetIndex, target } = dragOverItem.current;

    let sourceList = source === 'unassigned' ? [...unassignedRoutes] : [...assignedRoutes];
    let targetList = target === 'unassigned' ? [...unassignedRoutes] : [...assignedRoutes];

    // Get the dragged item
    const draggedItemContent = sourceList.splice(sourceIndex, 1)[0];

    // If moving within the SAME list
    if (source === target) {
        sourceList.splice(targetIndex === -1 ? sourceList.length : targetIndex, 0, draggedItemContent);
        if (source === 'unassigned') setUnassignedRoutes(sourceList);
        else setAssignedRoutes(sourceList);
    } 
    // If moving to DIFFERENT list
    else {
        targetList.splice(targetIndex === -1 ? targetList.length : targetIndex, 0, draggedItemContent);
        if (source === 'unassigned') {
            setUnassignedRoutes(sourceList);
            setAssignedRoutes(targetList);
        } else {
            setAssignedRoutes(sourceList);
            setUnassignedRoutes(targetList);
        }
    }

    dragItem.current = null;
    dragOverItem.current = null;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 overflow-hidden">
      
      {/* Header */}
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-6 shrink-0 shadow-sm z-10 justify-between">
        <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center" title="Back">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Page Access Control</h1>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Role-based Route Mapping</p>
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden p-6 flex flex-col xl:flex-row gap-6 relative">
        
        {msg.text && (
          <div className={`absolute top-10 left-1/2 -translate-x-1/2 z-50 p-4 rounded-xl shadow-lg border text-sm font-bold flex items-center animate-in slide-in-from-top-4 ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}
          </div>
        )}

        {/* --- LEFT COL: SELECT ROLE --- */}
        <div className="xl:w-1/4 flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden h-full">
           <div className="p-5 border-b border-slate-100 bg-slate-900 text-white shrink-0">
             <h2 className="text-sm font-black uppercase tracking-wide">1. Select User Role</h2>
             <p className="text-[10px] text-slate-400 font-medium mt-1">Choose a role to configure access.</p>
           </div>
           
           <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2 bg-slate-50/50">
              {isLoading ? (
                  <div className="text-center p-4 text-slate-400 text-sm font-bold">Loading...</div>
              ) : roles.map(role => (
                 <button 
                   key={role.id}
                   onClick={() => setSelectedRoleId(role.id)}
                   className={`w-full text-left p-4 rounded-xl transition-all border ${selectedRoleId === role.id ? 'bg-indigo-600 border-indigo-700 text-white shadow-md scale-[1.02]' : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm text-slate-700'}`}
                 >
                    <div className="flex justify-between items-center">
                       <span className="font-black text-sm">{role.role_name}</span>
                       {role.role_name === 'Super Admin' && <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${selectedRoleId === role.id ? 'bg-indigo-700 border-indigo-500 text-white' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>Core</span>}
                    </div>
                    <p className={`text-[10px] mt-1 line-clamp-2 leading-relaxed ${selectedRoleId === role.id ? 'text-indigo-200' : 'text-slate-500'}`}>{role.description || 'No description'}</p>
                 </button>
              ))}
           </div>
        </div>

        {/* --- RIGHT COL: DUAL PANE DRAG & DROP --- */}
        <div className="xl:w-3/4 flex flex-col h-full opacity-100 transition-opacity">
           
           {!selectedRoleId ? (
              <div className="flex-1 bg-white rounded-3xl border border-slate-200 border-dashed flex flex-col items-center justify-center text-slate-400 shadow-sm">
                 <span className="text-6xl mb-4 opacity-50">🔐</span>
                 <p className="font-bold text-lg text-slate-600">No Role Selected</p>
                 <p className="text-sm">Please select a role from the left menu to manage page access.</p>
              </div>
           ) : (
              <div className="flex-1 flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                 
                 <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                    <div>
                      <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">2. Configure Page Access</h2>
                      <p className="text-[10px] text-slate-500 font-medium mt-1">Drag and drop pages between panels or use the action buttons.</p>
                    </div>
                    <button 
                       onClick={handleSaveAccess}
                       disabled={isSaving}
                       className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-md transition-all flex items-center disabled:opacity-50 text-xs"
                    >
                       {isSaving ? 'Saving...' : '💾 Save Access Configuration'}
                    </button>
                 </div>

                 <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-100/50 p-6 gap-6">
                    
                    {/* Unassigned Pane */}
                    <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                       <div className="bg-slate-100 p-4 border-b border-slate-200 flex justify-between items-center shrink-0">
                          <div>
                            <h3 className="font-bold text-slate-700 text-xs uppercase flex items-center"><span className="mr-2 text-base">🚫</span> Restricted (No Access)</h3>
                          </div>
                          <button onClick={handleGrantAll} disabled={unassignedRoutes.length === 0} className="text-[10px] font-bold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50">
                             Grant All &rarr;
                          </button>
                       </div>
                       <div 
                         className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-[150px]"
                         onDragOver={(e) => handleDragOverContainer(e, 'unassigned')}
                         onDrop={handleDrop}
                       >
                          {unassignedRoutes.length === 0 ? (
                             <div className="h-full flex items-center justify-center text-slate-400 text-xs font-bold">List is empty.</div>
                          ) : (
                             unassignedRoutes.map((route, index) => (
                                <div 
                                  key={route.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, index, 'unassigned')}
                                  onDragEnter={(e) => handleDragEnter(e, index, 'unassigned')}
                                  onDragEnd={handleDrop}
                                  className="flex items-center justify-between p-3 border border-slate-200 bg-slate-50 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all cursor-move group"
                                >
                                   <div className="flex items-start space-x-3 overflow-hidden">
                                      <span className="text-slate-300 group-hover:text-indigo-400 transition-colors mt-0.5">≡</span>
                                      <div className="truncate">
                                         <p className="font-bold text-slate-800 text-sm truncate">{route.title}</p>
                                         <p className="text-[9px] font-mono text-slate-500 mt-0.5 truncate">{route.path}</p>
                                      </div>
                                   </div>
                                   <button onClick={() => handleGrantAccess(route)} className="text-indigo-600 bg-white border border-slate-200 p-1.5 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-colors shrink-0 shadow-sm" title="Grant Access">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                   </button>
                                </div>
                             ))
                          )}
                       </div>
                    </div>

                    {/* Assigned Pane */}
                    <div className="flex-1 flex flex-col bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden ring-4 ring-indigo-50/50">
                       <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex justify-between items-center shrink-0">
                          <div>
                            <h3 className="font-bold text-indigo-900 text-xs uppercase flex items-center"><span className="mr-2 text-base">✅</span> Allowed Access</h3>
                          </div>
                          <button onClick={handleRevokeAll} disabled={assignedRoutes.length === 0} className="text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200 px-3 py-1.5 rounded-lg hover:bg-rose-100 transition-colors shadow-sm disabled:opacity-50">
                             &larr; Revoke All
                          </button>
                       </div>
                       <div 
                         className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-[150px]"
                         onDragOver={(e) => handleDragOverContainer(e, 'assigned')}
                         onDrop={handleDrop}
                       >
                          {assignedRoutes.length === 0 ? (
                             <div className="h-full flex items-center justify-center text-slate-400 text-xs font-bold">No pages assigned yet.</div>
                          ) : (
                             assignedRoutes.map((route, index) => (
                                <div 
                                  key={route.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, index, 'assigned')}
                                  onDragEnter={(e) => handleDragEnter(e, index, 'assigned')}
                                  onDragEnd={handleDrop}
                                  className="flex items-center justify-between p-3 border border-indigo-100 bg-white rounded-xl hover:border-indigo-300 hover:shadow-md transition-all cursor-move group"
                                >
                                   <div className="flex items-start space-x-3 overflow-hidden">
                                      <span className="text-slate-300 group-hover:text-indigo-400 transition-colors mt-0.5">≡</span>
                                      <div className="truncate">
                                         <p className="font-bold text-slate-800 text-sm truncate">{route.title}</p>
                                         <p className="text-[9px] font-mono text-indigo-500 mt-0.5 truncate">{route.path}</p>
                                      </div>
                                   </div>
                                   <button onClick={() => handleRevokeAccess(route)} className="text-rose-500 bg-rose-50 border border-rose-100 p-1.5 rounded-lg hover:border-rose-300 hover:bg-rose-100 transition-colors shrink-0 shadow-sm" title="Revoke Access">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                   </button>
                                </div>
                             ))
                          )}
                       </div>
                    </div>

                 </div>
              </div>
           )}

        </div>
      </main>
    </div>
  );
}
