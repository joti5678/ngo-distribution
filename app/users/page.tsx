"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const USER_ROLES = [
  "Admin", "Partner", "Distribution Manager", 
  "Distribution Officer", "Warehouse Officer", "Distributor", 
  "Report Viewer", "Dashboard Viewer"
]; // Removed Super Admin from selectable list for safety

export default function UserManagementPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Role Change Modal States
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [newRole, setNewRole] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    const { data: profiles, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (!error && profiles) setUsers(profiles);
    setIsLoading(false);
  };

  const handleOpenRoleModal = (user: any) => {
    if (user.role === 'Super Admin') {
      alert("🔒 SECURITY RESTRICTION: Super Admin modifications require Advanced Email/OTP Verification. Action denied.");
      return;
    }
    setSelectedUser(user);
    setNewRole(user.role || 'Dashboard Viewer');
    setIsRoleModalOpen(true);
  };

  const handleSaveRole = async () => {
    if (!selectedUser) return;
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', selectedUser.id);
    if (!error) {
      setUsers(users.map(u => u.id === selectedUser.id ? { ...u, role: newRole } : u));
      setIsRoleModalOpen(false);
    } else {
      alert("Failed to update role.");
    }
  };

  const handleToggleStatus = async (user: any) => {
    if (user.role === 'Super Admin') {
      alert("🔒 SECURITY RESTRICTION: Super Admin account cannot be deactivated directly.");
      return;
    }
    const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
    const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', user.id);
    if (!error) setUsers(users.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
  };

  const handleDelete = async (user: any) => {
    if (user.role === 'Super Admin') {
      alert("🔒 CRITICAL RESTRICTION: Super Admin accounts cannot be deleted.");
      return;
    }
    if(!confirm(`Warning: Deleting user ${user.email} cannot be undone. Proceed?`)) return;
    const { error } = await supabase.from('profiles').delete().eq('id', user.id);
    if (!error) setUsers(users.filter(u => u.id !== user.id));
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 relative">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center justify-between px-6 md:px-8 shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">User Management</h2>
          <p className="text-sm text-slate-500">View detailed profiles and manage access securely</p>
        </div>
        <button className="flex items-center px-4 py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white text-sm font-bold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all">
          <Icons.Plus /> <span className="ml-2">Invite New User</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col space-y-6">
        
        {/* Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm w-full max-w-md">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icons.Search /></div>
            <input type="text" placeholder="Search by email or name..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-indigo-500 transition-colors" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm w-full overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-5 text-xs font-bold text-slate-500 uppercase tracking-wide">User Details</th>
                  <th className="p-5 text-xs font-bold text-slate-500 uppercase tracking-wide">Assigned Role</th>
                  <th className="p-5 text-xs font-bold text-slate-500 uppercase tracking-wide">Account Status</th>
                  <th className="p-5 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={4} className="p-8 text-center"><Icons.Spinner /></td></tr>
                ) : (
                  users.filter(u => u.email?.toLowerCase().includes(searchQuery.toLowerCase())).map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-5 flex items-center space-x-4">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0">
                          {user.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{user.email}</p>
                          <p className="text-xs text-slate-500 mt-0.5">Joined: {new Date(user.created_at).toLocaleDateString()}</p>
                        </div>
                      </td>
                      
                      <td className="p-5">
                        <div className="flex items-center space-x-3">
                          <span className={`inline-flex px-3 py-1 text-xs rounded-lg font-bold border ${user.role === 'Super Admin' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                            {user.role || 'No Role'}
                          </span>
                          <button onClick={() => handleOpenRoleModal(user)} className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100 transition-colors">
                            CHANGE
                          </button>
                        </div>
                      </td>
                      
                      <td className="p-5">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${user.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-2 ${user.status === 'Active' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                          {user.status || 'Active'}
                        </span>
                      </td>
                      
                      <td className="p-5 text-right flex justify-end space-x-2">
                         <button onClick={() => handleToggleStatus(user)} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 text-xs font-bold rounded-xl transition-all shadow-sm">
                           {user.status === 'Active' ? 'Deactivate' : 'Activate'}
                         </button>
                         <button onClick={() => handleDelete(user)} className={`p-2 rounded-xl transition-all shadow-sm ${user.role === 'Super Admin' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white border border-rose-100'}`} title={user.role === 'Super Admin' ? 'Protected Account' : 'Delete User'}>
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

      {/* Role Change Modal */}
      {isRoleModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800">Change User Role</h3>
              <button onClick={() => setIsRoleModalOpen(false)} className="text-slate-400 hover:text-slate-700"><Icons.Close /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">User Email</p>
                <p className="text-sm font-semibold text-slate-900">{selectedUser?.email}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Select New Role</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-500">
                  {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <p className="text-[10px] text-amber-600 mt-2 leading-relaxed">Changing a role will immediately update the user's access permissions across the system.</p>
              </div>
              <button onClick={handleSaveRole} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition-colors shadow-md mt-4">
                Confirm & Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}