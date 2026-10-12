"use client";

import React, { useState } from 'react';
import { Icons } from '../components/Icons';

export default function ProfilePage() {
  // Form States
  const [name, setName] = useState('Admin User');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });

  // Dummy access data (This will come from database later)
  const userRole = "Super Admin";
  const userEmail = "admin@ngo.org";
  
  const assignedWarehouses = [
    { id: 1, name: 'Central Warehouse Dhaka', code: 'WH-DHK-01' },
    { id: 2, name: 'Regional Warehouse Cox', code: 'WH-COX-02' }
  ];

  const assignedDPs = [
    { id: 1, name: 'Mirpur Point A', type: 'Urban' },
    { id: 2, name: 'Balukhali Camp 9', type: 'Camp' },
    { id: 3, name: 'Kutupalong Point C', type: 'Camp' }
  ];

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if user is trying to change password without current password
    if (newPassword && !currentPassword) {
      setMessage({ text: 'Current password is required to set a new password.', type: 'error' });
      return;
    }

    setMessage({ text: 'Profile updated successfully!', type: 'success' });
    
    // Clear password fields after success
    setCurrentPassword('');
    setNewPassword('');
    
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500">
      
      {/* Page Header */}
      <header className="flex h-20 bg-white border-b border-slate-200 items-center justify-between px-6 md:px-8 shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">My Profile</h2>
          <p className="text-sm text-slate-500">Manage your account settings and view access</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Form Settings */}
          <div className="lg:col-span-2 space-y-6">
            
            {message.text && (
              <div className={`p-4 rounded-xl text-sm font-medium border ${message.type === 'error' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                {message.text}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 p-6 bg-slate-50/50">
                <h3 className="text-lg font-bold text-slate-800">Personal Information</h3>
              </div>
              <form onSubmit={handleUpdateProfile} className="p-6 space-y-5">
                
                {/* Email & Role (Disabled) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Email Address</label>
                    <input type="email" value={userEmail} disabled className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed" />
                    <p className="text-[10px] text-slate-400 mt-1">Email cannot be changed.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Current Role</label>
                    <input type="text" value={userRole} disabled className="w-full px-4 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700 font-medium cursor-not-allowed" />
                    <p className="text-[10px] text-slate-400 mt-1">Contact Super Admin to change role.</p>
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Full Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-indigo-500 transition-colors" />
                </div>

                <hr className="border-slate-100 my-4" />
                
                <h4 className="text-sm font-bold text-slate-700 mb-2">Change Password</h4>
                
                {/* Password Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Current Password</label>
                    <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-indigo-500 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">New Password</label>
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-indigo-500 transition-colors" />
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button type="submit" className="px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Right Column: Access List */}
          <div className="space-y-6">
            
            {/* Warehouses Access */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 p-5 bg-slate-50/50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">Assigned Warehouses</h3>
                <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">{assignedWarehouses.length}</span>
              </div>
              <div className="p-4 space-y-3">
                {assignedWarehouses.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No warehouse access</p>
                ) : (
                  assignedWarehouses.map(wh => (
                    <div key={wh.id} className="flex items-center space-x-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                        <Icons.Catalog />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{wh.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{wh.code}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Distribution Points Access */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 p-5 bg-slate-50/50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">Distribution Points</h3>
                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">{assignedDPs.length}</span>
              </div>
              <div className="p-4 space-y-3">
                {assignedDPs.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No point access</p>
                ) : (
                  assignedDPs.map(dp => (
                    <div key={dp.id} className="flex items-center space-x-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                        <Icons.Manifest />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{dp.name}</p>
                        <p className="text-[10px] text-slate-500 uppercase">{dp.type}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}