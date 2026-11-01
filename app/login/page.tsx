"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function LoginPage() {
  const router = useRouter();
  const [isLoginMode, setIsLoginMode] = useState(true);
  
  // Default minimal static theme to replicate old layout perfectly
  const theme = {
      logoText: 'D', 
      loginHeading: 'Welcome Back!',
      loginSub: 'Sign in to manage your inventory and distributions.',
      primaryColor: '#6366f1',
      inputBg: '#f8fafc',
      inputRadius: 8
  };

  const [roles, setRoles] = useState<any[]>([]);
  
  // Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [roleId, setRoleId] = useState('');
  
  // Action States
  const [isProcessing, setIsProcessing] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    // Basic client check for existing session
    const session = localStorage.getItem('user_session');
    if (session) {
       router.push('/dashboard'); 
    }
    fetchRoles();
  }, [router]);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 5000);
  };

  const fetchRoles = async () => {
    try {
      const { data: rolesData } = await supabase.from('user_roles').select('*');
      if (rolesData) {
          // Filter out Super Admin and Admin from registration
          const filteredRoles = rolesData.filter(r => 
              !['Super Admin', 'Admin', 'WEB ADMIN'].includes(r.role_name)
          );
          setRoles(filteredRoles);
          if (filteredRoles.length > 0) setRoleId(filteredRoles[0].id);
      }
    } catch (err) {
      console.error("Data load error");
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsProcessing(true);
      setMsg({ text: '', type: '' });

      if (isLoginMode) {
          // ================= LOGIN FLOW =================
          try {
              // Fetch user solely by email
              const { data: user, error } = await supabase
                  .from('profiles')
                  .select('*, user_roles(role_name)')
                  .eq('email', email.toLowerCase().trim())
                  .single();

              if (error || !user) {
                  showMessage("Invalid email or password.", "error");
                  setIsProcessing(false);
                  return;
              }

              // Verify password hash securely
              let isPasswordValid = false;
              try {
                  isPasswordValid = bcrypt.compareSync(password, user.password_hash);
              } catch (err) {
                  isPasswordValid = false;
              }

              // Check plain text just in case of unhashed legacy accounts
              if (!isPasswordValid && password === user.password_hash) {
                  isPasswordValid = true;
              }

              if (!isPasswordValid) {
                  showMessage("Invalid email or password.", "error");
                  setIsProcessing(false);
                  return;
              }

              if (user.status === 'Pending') {
                  showMessage("Your account is pending Admin approval. Please wait.", "error");
                  setIsProcessing(false);
                  return;
              } else if (user.status !== 'Active') {
                  showMessage(`Your account is currently ${user.status}. Please contact support.`, "error");
                  setIsProcessing(false);
                  return;
              }

              // --- FETCH RELATIONAL DATA (WH & DP) FOR GLOBAL SESSION ---
              let assignedWhIds: string[] = [];
              let assignedDpIds: string[] = [];

              const [whMapping, dpMapping] = await Promise.all([
                  supabase.from('user_warehouses').select('warehouse_id').eq('user_id', user.id),
                  supabase.from('user_dps').select('dp_id').eq('user_id', user.id)
              ]);

              if (whMapping.data) assignedWhIds = whMapping.data.map(m => m.warehouse_id);
              if (dpMapping.data) assignedDpIds = dpMapping.data.map(m => m.dp_id);

              // Embed into user object
              const sessionUser = {
                  ...user,
                  assigned_wh_ids: assignedWhIds,
                  assigned_dp_ids: assignedDpIds
              };

              // 1. Save session securely in LocalStorage (for client-side legacy uses if any)
              localStorage.setItem('user_session', JSON.stringify(sessionUser));
              
              // 2. Set Cookie for Next.js Middleware Security
              document.cookie = `user_session=${encodeURIComponent(JSON.stringify(sessionUser))}; path=/; max-age=86400; SameSite=Strict`;

              showMessage("Login successful! Redirecting...");
              
              setTimeout(() => {
                  window.location.replace('/dashboard'); // Hard redirect to ensure middleware catches it properly
              }, 800);

          } catch (err: any) {
              showMessage("An error occurred during login.", "error");
              setIsProcessing(false);
          }
      } else {
          // ================= REGISTRATION FLOW =================
          if (!roleId) {
              showMessage("Please select a role.", "error");
              setIsProcessing(false);
              return;
          }
          if (password.length < 8) {
              showMessage("Password must be at least 8 characters long.", "error");
              setIsProcessing(false);
              return;
          }

          try {
              // Check existing email
              const { data: existing } = await supabase.from('profiles').select('id').eq('email', email.toLowerCase().trim()).single();
              
              if (existing) {
                  showMessage("An account with this email already exists.", "error");
                  setIsProcessing(false);
                  return;
              }

              // Hash Password Before Insert
              const salt = bcrypt.genSaltSync(10);
              const hashedPassword = bcrypt.hashSync(password, salt);

              // Insert New Profile with 'Pending' Status
              const payload = {
                  id: crypto.randomUUID(),
                  email: email.toLowerCase().trim(),
                  full_name: fullName.trim(),
                  phone: phone.trim(),
                  designation: designation.trim(),
                  password_hash: hashedPassword, // Stored securely
                  status: 'Pending', // Requires Admin Approval
                  role_id: roleId 
              };

              const { error } = await supabase.from('profiles').insert([payload]);
              
              if (error) throw error;

              showMessage("Registration successful! Your account is Pending admin approval.", "success");
              setIsLoginMode(true);
              setPassword('');
              
          } catch (err: any) {
              showMessage(`Registration failed: ${err.message}`, "error");
          } finally {
              setIsProcessing(false);
          }
      }
  };

  return (
    // Fixed wrapper covers the entire viewport (hiding sidebars/topbars from layout.tsx)
    <div className="fixed inset-0 z-[9999] overflow-y-auto overflow-x-hidden bg-slate-50 font-sans">
      <div className="relative min-h-screen w-full flex flex-col items-center justify-center py-12 px-4">

        {/* Global Message Toast */}
        {msg.text && (
          <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[10000] p-4 rounded-xl shadow-md border text-sm font-bold flex items-center animate-in slide-in-from-top-4 ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}
          </div>
        )}

        {/* Content Container */}
        <div className={`relative z-10 w-full ${isLoginMode ? 'max-w-[400px]' : 'max-w-lg'} transition-all duration-300`}>
           <div className="w-full bg-white rounded-3xl p-8 sm:p-10 flex flex-col items-center text-center shadow-xl animate-in zoom-in-95 duration-500">
                 
                 {/* Solid Minimal Logo */}
                 <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-3xl mb-6 shadow-md" style={{ backgroundColor: theme.primaryColor }}>
                    {theme.logoText}
                 </div>
                 
                 <h2 className="text-2xl font-black text-slate-900 mb-2">
                    {isLoginMode ? theme.loginHeading : 'Request Access'}
                 </h2>
                 <p className="text-sm font-medium text-slate-500 mb-8">
                    {isLoginMode ? theme.loginSub : 'Register your details. Admin approval is required.'}
                 </p>

              <form onSubmit={handleAuth} className="w-full space-y-4">
                 
                 {!isLoginMode && (
                     <div className="animate-in slide-in-from-top-2 grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                        <div className="sm:col-span-2">
                           <input 
                              type="text" 
                              value={fullName}
                              onChange={e => setFullName(e.target.value)}
                              required={!isLoginMode}
                              placeholder="Full Name *"
                              className="w-full h-12 px-4 border border-slate-200 font-bold outline-none focus:border-indigo-500 transition-colors text-slate-900" 
                              style={{ backgroundColor: theme.inputBg, borderRadius: `${theme.inputRadius}px` }} 
                           />
                        </div>
                        <div>
                           <input 
                              type="text" 
                              value={phone}
                              onChange={e => setPhone(e.target.value)}
                              placeholder="Phone (Optional)"
                              className="w-full h-12 px-4 border border-slate-200 font-bold outline-none focus:border-indigo-500 transition-colors text-slate-900" 
                              style={{ backgroundColor: theme.inputBg, borderRadius: `${theme.inputRadius}px` }} 
                           />
                        </div>
                        <div>
                           <input 
                              type="text" 
                              value={designation}
                              onChange={e => setDesignation(e.target.value)}
                              placeholder="Designation"
                              className="w-full h-12 px-4 border border-slate-200 font-bold outline-none focus:border-indigo-500 transition-colors text-slate-900" 
                              style={{ backgroundColor: theme.inputBg, borderRadius: `${theme.inputRadius}px` }} 
                           />
                        </div>
                        <div className="sm:col-span-2">
                           <select 
                              value={roleId}
                              onChange={e => setRoleId(e.target.value)}
                              required={!isLoginMode}
                              className="w-full h-12 px-4 border border-slate-200 font-bold outline-none focus:border-indigo-500 transition-colors text-slate-900" 
                              style={{ backgroundColor: theme.inputBg, borderRadius: `${theme.inputRadius}px` }} 
                           >
                              <option value="" disabled>-- Select a Role --</option>
                              {roles.map(r => <option key={r.id} value={r.id}>{r.role_name}</option>)}
                           </select>
                        </div>
                     </div>
                 )}

                 <div className="text-left">
                    <input 
                       type="email" 
                       value={email}
                       onChange={e => setEmail(e.target.value)}
                       required
                       placeholder="Email Address"
                       className="w-full h-12 px-4 border border-slate-200 font-bold outline-none focus:border-indigo-500 transition-colors text-slate-900" 
                       style={{ backgroundColor: theme.inputBg, borderRadius: `${theme.inputRadius}px` }} 
                    />
                 </div>
                 
                 <div className="text-left">
                    <input 
                       type="password" 
                       value={password}
                       onChange={e => setPassword(e.target.value)}
                       required
                       minLength={8}
                       placeholder="Password"
                       className="w-full h-12 px-4 border border-slate-200 font-bold outline-none focus:border-indigo-500 transition-colors text-slate-900 tracking-widest" 
                       style={{ backgroundColor: theme.inputBg, borderRadius: `${theme.inputRadius}px` }} 
                    />
                    {!isLoginMode && <p className="text-[9px] mt-1 text-slate-400 font-medium">Minimum 8 characters required.</p>}
                 </div>

                 <div className="pt-2">
                    <button 
                       type="submit" 
                       disabled={isProcessing}
                       className="w-full h-12 text-white font-bold transition-transform shadow-md flex items-center justify-center disabled:opacity-50" 
                       style={{ backgroundColor: theme.primaryColor, borderRadius: `${theme.inputRadius}px` }}
                    >
                       {isProcessing ? 'Processing...' : (isLoginMode ? 'Sign In' : 'Submit Registration')}
                    </button>
                 </div>

                 <div className="text-center pt-6">
                    <button 
                       type="button"
                       onClick={() => {
                           setIsLoginMode(!isLoginMode);
                           setMsg({ text: '', type: '' });
                           setPassword('');
                       }}
                       className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors outline-none" 
                    >
                       {isLoginMode ? "Don't have an account? Request Access" : "Already have an account? Login"}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      </div>
    </div>
  );
}
