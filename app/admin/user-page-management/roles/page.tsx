"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function RoleManagementPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form States
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  
  // Edit States
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState('');

  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    fetchRoles();
  }, []);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const fetchRoles = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('user_roles').select('*').order('created_at', { ascending: true });
    if (error) {
      console.error(error);
      showMessage("Error loading roles. Make sure 'user_roles' table exists.", "error");
    }
    if (data) setRoles(data);
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) return;

    // Check Duplicate
    const existing = roles.find(r => r.role_name.toLowerCase() === roleName.toLowerCase() && r.id !== editId);
    if (existing) {
        showMessage("A role with this name already exists.", "error");
        return;
    }

    const payload = { role_name: roleName.trim(), description: roleDesc.trim() };

    if (isEditing && editId) {
       const { error } = await supabase.from('user_roles').update(payload).eq('id', editId);
       if (error) {
           showMessage(error.message, "error");
       } else {
           showMessage("Role updated successfully!");
           setRoles(roles.map(r => r.id === editId ? { ...r, ...payload } : r));
           resetForm();
       }
    } else {
       const { data, error } = await supabase.from('user_roles').insert([payload]).select();
       if (error) {
           showMessage(error.message, "error");
       } else if (data) {
           showMessage("New role created successfully!");
           setRoles([...roles, data[0]]);
           resetForm();
       }
    }
  };

  const handleEdit = (role: any) => {
    setIsEditing(true);
    setEditId(role.id);
    setRoleName(role.role_name);
    setRoleDesc(role.description || '');
  };

  const handleDelete = async (role: any) => {
    if (role.role_name === 'Super Admin') {
        alert("Cannot delete the core Super Admin role!");
        return;
    }
    
    if(!confirm(`Are you sure you want to delete the role "${role.role_name}"?`)) return;
    
    const { error } = await supabase.from('user_roles').delete().eq('id', role.id);
    if (error) {
        showMessage(error.message, "error");
    } else {
        setRoles(roles.filter(r => r.id !== role.id));
        showMessage("Role deleted successfully.");
        if (isEditing && editId === role.id) resetForm();
    }
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditId('');
    setRoleName('');
    setRoleDesc('');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500">
      
      {/* Header */}
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-6 shrink-0 shadow-sm z-10 justify-between">
        <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center" title="Back">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Role Management</h1>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">User & Page Management System</p>
            </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 overflow-y-auto p-6">
        
        {msg.text && (
          <div className={`mb-6 p-4 rounded-xl shadow-sm border text-sm font-bold flex items-center animate-in fade-in ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
           
           {/* Left Col: Create/Edit Form */}
           <div className="xl:col-span-1">
             <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sticky top-6">
               <h2 className="text-lg font-black text-slate-800 mb-5 flex items-center">
                  <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mr-3">
                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  </span>
                  {isEditing ? 'Edit System Role' : 'Create New Role'}
               </h2>

               <form onSubmit={handleSubmit} className="space-y-4">
                 <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Role Name *</label>
                   <input 
                     type="text" 
                     value={roleName} 
                     onChange={(e) => setRoleName(e.target.value)} 
                     required 
                     placeholder="e.g. Field Worker"
                     className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 focus:bg-white transition-colors shadow-sm" 
                   />
                 </div>
                 
                 <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Description / Notes</label>
                   <textarea 
                     value={roleDesc} 
                     onChange={(e) => setRoleDesc(e.target.value)} 
                     rows={4}
                     placeholder="Briefly describe what this role does..."
                     className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 font-medium outline-none focus:border-indigo-500 focus:bg-white transition-colors shadow-sm resize-none custom-scrollbar" 
                   ></textarea>
                 </div>

                 <div className="pt-2 flex flex-col space-y-2">
                   <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex justify-center items-center">
                     {isEditing ? 'Save Changes' : 'Create Role'}
                   </button>
                   {isEditing && (
                     <button type="button" onClick={resetForm} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-xl transition-all">
                       Cancel Edit
                     </button>
                   )}
                 </div>
               </form>
             </div>
           </div>

           {/* Right Col: Roles List */}
           <div className="xl:col-span-2">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[500px]">
                 <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Available System Roles</h3>
                    <span className="bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1 rounded-full">{roles.length} Roles</span>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
                    {isLoading ? (
                       <div className="flex justify-center items-center h-40 text-slate-400">Loading roles...</div>
                    ) : roles.length === 0 ? (
                       <div className="flex flex-col justify-center items-center h-40 text-slate-400">
                          <span className="text-4xl mb-3">👥</span>
                          <p className="font-bold text-sm">No roles found.</p>
                       </div>
                    ) : (
                       roles.map(role => (
                          <div key={role.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-slate-200 rounded-2xl bg-white hover:border-indigo-300 hover:shadow-md transition-all group">
                             <div className="mb-4 sm:mb-0 pr-4">
                               <div className="flex items-center space-x-2">
                                  <h4 className="font-black text-slate-900 text-base">{role.role_name}</h4>
                                  {role.role_name === 'Super Admin' && (
                                     <span className="bg-rose-100 text-rose-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-rose-200">Core</span>
                                  )}
                               </div>
                               <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                                  {role.description || <span className="italic opacity-50">No description provided</span>}
                               </p>
                             </div>
                             
                             <div className="flex items-center space-x-2 shrink-0">
                                <button onClick={() => handleEdit(role)} className="px-3 py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 font-bold text-xs transition-colors flex items-center">
                                   <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                   Edit
                                </button>
                                {role.role_name !== 'Super Admin' && (
                                  <button onClick={() => handleDelete(role)} className="p-2 bg-slate-50 border border-slate-200 text-slate-400 rounded-lg hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors" title="Delete Role">
                                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                )}
                             </div>
                          </div>
                       ))
                    )}
                 </div>
              </div>
           </div>

        </div>
      </main>
    </div>
  );
}

