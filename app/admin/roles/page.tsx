"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from '../../components/Icons';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function RoleManagementPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    setIsLoading(true);
    const { data } = await supabase.from('system_roles').select('*').order('created_at', { ascending: true });
    if (data) setRoles(data);
    setIsLoading(false);
  };

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName) return;

    const { data, error } = await supabase
      .from('system_roles')
      .insert([{ role_name: newRoleName, description: newRoleDesc }])
      .select();

    if (!error && data) {
      setRoles([...roles, data[0]]);
      setNewRoleName('');
      setNewRoleDesc('');
    } else {
      alert("Failed to add role. It might already exist.");
    }
  };

  const handleDeleteRole = async (id: string, name: string) => {
    if(name === 'Super Admin') {
      alert("Super Admin role cannot be deleted!");
      return;
    }
    if(!confirm(`Delete role '${name}'?`)) return;
    
    const { error } = await supabase.from('system_roles').delete().eq('id', id);
    if (!error) setRoles(roles.filter(r => r.id !== id));
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center justify-between px-6 md:px-8 shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">Role Management</h2>
          <p className="text-sm text-slate-500">Create and manage custom system roles</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Add New Role Form */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-1 h-fit">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mr-3"><Icons.Plus /></div>
            Add New Role
          </h3>
          <form onSubmit={handleAddRole} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Role Name</label>
              <input type="text" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-all" placeholder="e.g. Field Officer" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Description</label>
              <textarea value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} rows={3} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-all resize-none" placeholder="What does this role do?"></textarea>
            </div>
            <button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white py-3 rounded-xl text-sm font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all mt-2">
              Create Role
            </button>
          </form>
        </div>

        {/* Roles List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm lg:col-span-2 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
             <h3 className="text-lg font-bold text-slate-800">System Roles</h3>
             <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full">{roles.length} Roles</span>
          </div>
          <div className="p-6 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center p-8"><Icons.Spinner /></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {roles.map((role) => (
                  <div key={role.id} className="group p-5 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all relative">
                    <h4 className="font-bold text-slate-800 text-base mb-1">{role.role_name}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed mb-4 min-h-[40px]">{role.description || 'No description provided.'}</p>
                    
                    <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                      <span className="text-[10px] text-slate-400 font-mono">ID: {role.id.split('-')[0]}</span>
                      {role.role_name !== 'Super Admin' && (
                        <button onClick={() => handleDeleteRole(role.id, role.role_name)} className="text-rose-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-colors">
                          <Icons.Trash />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}