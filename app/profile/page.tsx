"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [assignedWhs, setAssignedWhs] = useState<any[]>([]);
  const [assignedDps, setAssignedDps] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Form Fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  
  // Password Fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadProfileData();
  }, []);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const loadProfileData = async () => {
    setIsLoading(true);
    const sessionStr = localStorage.getItem('user_session');
    
    if (sessionStr) {
      const userData = JSON.parse(sessionStr);
      setUser(userData);
      
      // Populate fields
      setFullName(userData.full_name || '');
      setPhone(userData.phone || '');
      setDesignation(userData.designation || '');

      const roleName = userData.user_roles?.role_name?.toUpperCase() || '';
      const isSuperAdmin = roleName.includes('SUPER ADMIN') || roleName.includes('WEB ADMIN') || roleName === 'ADMIN';

      if (isSuperAdmin) {
          const [{ data: whData }, { data: dpData }] = await Promise.all([
              supabase.from('warehouses').select('*').order('name'),
              supabase.from('distribution_points').select('*').order('name')
          ]);
          
          if (whData) setAssignedWhs(whData);
          if (dpData) setAssignedDps(dpData);

      } else {
          // FETCH FROM NEW MAPPING TABLES
          const [whMapping, dpMapping] = await Promise.all([
              supabase.from('user_warehouses').select('warehouse_id').eq('user_id', userData.id),
              supabase.from('user_dps').select('dp_id').eq('user_id', userData.id)
          ]);
          
          const whIds = whMapping.data?.map(m => m.warehouse_id) || [];
          const dpIds = dpMapping.data?.map(m => m.dp_id) || [];

          if (whIds.length > 0) {
              const { data: whData } = await supabase.from('warehouses').select('*').in('id', whIds).order('name');
              if (whData) setAssignedWhs(whData);
          }
          
          if (dpIds.length > 0) {
              const { data: dpData } = await supabase.from('distribution_points').select('*').in('id', dpIds).order('name');
              if (dpData) setAssignedDps(dpData);
          }
      }
    }
    setIsLoading(false);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSaving(true);
      setMsg({ text: '', type: '' });

      try {
          // Prepare Payload with all standard fields
          const payload: any = { 
              full_name: fullName,
              phone: phone,
              designation: designation
          };

          if (newPassword) {
              if (!currentPassword) {
                  showMessage("Please enter your current password to set a new one.", "error");
                  setIsSaving(false);
                  return;
              }
              if (newPassword.length < 8) {
                  showMessage("New password must be at least 8 characters.", "error");
                  setIsSaving(false);
                  return;
              }

              const { data: verifyData, error: verifyError } = await supabase
                  .from('profiles')
                  .select('password_hash')
                  .eq('id', user.id)
                  .single();
              
              if (verifyError || !verifyData) {
                  showMessage("Error verifying current password.", "error");
                  setIsSaving(false);
                  return;
              }

              // Check if current password matches (handles both bcrypt and legacy plain text)
              let isMatch = false;
              try {
                  isMatch = bcrypt.compareSync(currentPassword, verifyData.password_hash);
              } catch (e) {
                  isMatch = false;
              }
              
              // Fallback for non-hashed existing passwords
              if (!isMatch && currentPassword === verifyData.password_hash) {
                  isMatch = true;
              }

              if (!isMatch) {
                  showMessage("Incorrect current password.", "error");
                  setIsSaving(false);
                  return;
              }

              // Encrypt new password
              const salt = bcrypt.genSaltSync(10);
              payload.password_hash = bcrypt.hashSync(newPassword, salt);
          }

          const { error } = await supabase.from('profiles').update(payload).eq('id', user.id);
          if (error) throw error;

          // Update Session securely (never store plain password)
          const updatedUser = { ...user, full_name: fullName, phone: phone, designation: designation };
          if (newPassword) updatedUser.password_hash = payload.password_hash;
          
          localStorage.setItem('user_session', JSON.stringify(updatedUser));
          setUser(updatedUser);

          showMessage("Profile updated successfully!");
          setCurrentPassword('');
          setNewPassword('');

      } catch (err: any) {
          showMessage(`Update failed: ${err.message}`, "error");
      }
      setIsSaving(false);
  };

  if (isLoading) {
      return (
         <div className="flex-1 h-full bg-slate-50 flex items-center justify-center">
             <div className="animate-spin text-4xl">⏳</div>
         </div>
      );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 overflow-hidden relative">
      
      {/* Toast Notification */}
      {msg.text && (
        <div className={`fixed top-10 left-1/2 -translate-x-1/2 z-[9999] p-4 rounded-xl shadow-2xl border text-sm font-bold flex items-center animate-in slide-in-from-top-4 ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          <span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}
        </div>
      )}

      {/* Header with Back Button */}
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 shadow-sm z-10 justify-between">
        <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-3 md:mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
              <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">My Profile</h1>
              <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Account settings & access</p>
            </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
         <div className="max-w-7xl mx-auto flex flex-col xl:flex-row gap-8">
            
            {/* LEFT COLUMN: Personal Info Form */}
            <div className="xl:w-2/3 flex flex-col space-y-6">
                <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm">
                    <h2 className="text-lg font-black text-slate-800 mb-6">Personal Information</h2>
                    
                    <form onSubmit={handleUpdateProfile} className="space-y-6">
                        
                        {/* Disabled Fields */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email Address</label>
                                <input 
                                   type="email" 
                                   value={user?.email || ''} 
                                   disabled 
                                   className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 outline-none cursor-not-allowed" 
                                />
                                <p className="text-[9px] text-slate-400 font-medium mt-1.5">Email cannot be changed.</p>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Current Role</label>
                                <input 
                                   type="text" 
                                   value={user?.user_roles?.role_name || 'N/A'} 
                                   disabled 
                                   className="w-full px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl text-sm font-bold text-indigo-700 outline-none cursor-not-allowed" 
                                />
                                <p className="text-[9px] text-slate-400 font-medium mt-1.5">Contact Admin to change role.</p>
                            </div>
                        </div>

                        {/* Editable Fields: Name, Phone, Designation */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                            <div className="md:col-span-2">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Full Name</label>
                                <input 
                                   type="text" 
                                   value={fullName}
                                   onChange={(e) => setFullName(e.target.value)}
                                   required
                                   className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 shadow-sm transition-colors" 
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Phone Number</label>
                                <input 
                                   type="text" 
                                   value={phone}
                                   onChange={(e) => setPhone(e.target.value)}
                                   className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 shadow-sm transition-colors" 
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Designation</label>
                                <input 
                                   type="text" 
                                   value={designation}
                                   onChange={(e) => setDesignation(e.target.value)}
                                   className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 shadow-sm transition-colors" 
                                />
                            </div>
                        </div>

                        {/* Password Change Section */}
                        <div className="pt-6 border-t border-slate-100">
                            <h3 className="text-sm font-black text-slate-800 mb-4">Change Password</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Current Password</label>
                                    <input 
                                       type="password" 
                                       value={currentPassword}
                                       onChange={(e) => setCurrentPassword(e.target.value)}
                                       placeholder="Enter current password"
                                       className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 shadow-sm transition-colors" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">New Password</label>
                                    <input 
                                       type="password" 
                                       value={newPassword}
                                       onChange={(e) => setNewPassword(e.target.value)}
                                       placeholder="Enter new password"
                                       className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 shadow-sm transition-colors" 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-4">
                           <button 
                              type="submit" 
                              disabled={isSaving}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3.5 px-8 rounded-xl text-sm shadow-md transition-all flex items-center justify-center disabled:opacity-50"
                           >
                              {isSaving ? 'Saving Changes...' : '💾 Save Profile Updates'}
                           </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* RIGHT COLUMN: Access Cards */}
            <div className="xl:w-1/3 flex flex-col space-y-6">
                
                {/* Warehouses Card */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                   <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
                      <div>
                          <h3 className="font-black text-slate-800">Assigned Warehouses</h3>
                      </div>
                      <span className="bg-indigo-100 text-indigo-700 font-black text-xs px-2.5 py-1 rounded-full">{assignedWhs.length}</span>
                   </div>
                   <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                      {assignedWhs.length === 0 ? (
                         <p className="text-xs font-bold text-slate-400 text-center py-4">No warehouses assigned.</p>
                      ) : (
                         assignedWhs.map(wh => (
                            <div key={wh.id} className="flex items-center space-x-3 p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-white hover:border-indigo-100 transition-colors">
                               <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-500 flex items-center justify-center shrink-0">🏭</div>
                               <div>
                                  <p className="text-sm font-bold text-slate-800 leading-tight">{wh.name}</p>
                                  <p className="text-[10px] font-mono text-slate-400 mt-0.5">{wh.code}</p>
                               </div>
                            </div>
                         ))
                      )}
                   </div>
                </div>

                {/* Distribution Points Card */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                   <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
                      <div>
                          <h3 className="font-black text-slate-800">Distribution Points</h3>
                      </div>
                      <span className="bg-emerald-100 text-emerald-700 font-black text-xs px-2.5 py-1 rounded-full">{assignedDps.length}</span>
                   </div>
                   <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                      {assignedDps.length === 0 ? (
                         <p className="text-xs font-bold text-slate-400 text-center py-4">No distribution points assigned.</p>
                      ) : (
                         assignedDps.map(dp => (
                            <div key={dp.id} className="flex items-center space-x-3 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl hover:bg-white hover:border-emerald-200 transition-colors">
                               <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">⛺</div>
                               <div>
                                  <p className="text-sm font-bold text-slate-800 leading-tight">{dp.name}</p>
                                  <p className="text-[10px] font-mono text-slate-500 mt-0.5">{dp.code}</p>
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
