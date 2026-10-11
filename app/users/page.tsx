"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const USER_ROLES = [
  "Super Admin", "Admin", "Partner", "Distribution Manager", 
  "Distribution Officer", "Warehouse Officer", "Distributor", 
  "Report Viewer", "Dashboard Viewer"
];

export default function UserManagementPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    const { data: profiles, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (!error && profiles) setUsers(profiles);
    setIsLoading(false);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (!error) setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
    const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', userId);
    if (!error) setUsers(users.map(u => u.id === userId ? { ...u, status: newStatus } : u));
  };

  const handleDelete = async (userId: string) => {
    if(!confirm("Warning: Deleting a user profile cannot be undone. Proceed?")) return;
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (!error) setUsers(users.filter(u => u.id !== userId));
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center justify-between px-4 md:px-8 shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">User Management</h2>
          <p className="text-xs md:text-sm text-slate-500">Manage roles, access, and account status</p>
        </div>
        <button className="flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 shadow-sm">
          <Icons.Plus /> <span className="ml-2">Invite User</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col space-y-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm w-full max-w-md">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icons.Search /></div>
            <input type="text" placeholder="Search users..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-indigo-500" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm w-full overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">User Email</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Assigned Role</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={4} className="p-8 text-center"><Icons.Spinner /></td></tr>
                ) : (
                  users.filter(u => u.email?.toLowerCase().includes(searchQuery.toLowerCase())).map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 group">
                      <td className="p-4">
                        <p className="font-semibold text-slate-900 text-sm">{user.email}</p>
                        <p className="text-xs text-slate-500">Joined: {new Date(user.created_at).toLocaleDateString()}</p>
                      </td>
                      <td className="p-4">
                        <select className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-900 outline-none focus:border-indigo-500" value={user.role || 'Dashboard Viewer'} onChange={(e) => handleRoleChange(user.id, e.target.value)}>
                          {USER_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                        </select>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${user.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                          {user.status || 'Active'}
                        </span>
                      </td>
                      <td className="p-4 text-right flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => handleToggleStatus(user.id, user.status || 'Active')} className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-medium rounded-lg transition-colors">
                           {user.status === 'Active' ? 'Deactivate' : 'Activate'}
                         </button>
                         <button onClick={() => handleDelete(user.id)} className="px-2 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors">
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
    </div>
  );
}