"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Icons } from './../../../components/Icons';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const STATUS_OPTIONS = ["Active", "Hold", "Inactive"];

export default function UserManagementPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [dps, setDps] = useState<any[]>([]);
  const [whs, setWhs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // PIN Security States
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinAction, setPinAction] = useState<{ type: string, user: any, payload?: any } | null>(null);
  const [isPinConfirmed, setIsPinConfirmed] = useState(false);

  // Manual Add / Edit Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentUserData, setCurrentUserData] = useState<any>(null);
  
  // Form Fields
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDesignation, setFormDesignation] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formStatus, setFormStatus] = useState('Active');
  const [formPassword, setFormPassword] = useState('');

  // Facility Access Modal States (WH & DP)
  const [isFacilityModalOpen, setIsFacilityModalOpen] = useState(false);
  const [facilityUser, setFacilityUser] = useState<any>(null);
  const [selectedDPs, setSelectedDPs] = useState<string[]>([]);
  const [selectedWHs, setSelectedWHs] = useState<string[]>([]);

  const [msg, setMsg] = useState({ text: '', type: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    
    // Fetch Master Data
    const [{ data: rolesData }, { data: dpData }, { data: whData }] = await Promise.all([
        supabase.from('user_roles').select('*'),
        supabase.from('distribution_points').select('id, name, code').order('name'),
        supabase.from('warehouses').select('id, name, code').order('name')
    ]);
    
    if (rolesData) {
        setRoles(rolesData);
        if(rolesData.length > 0) setFormRole(rolesData[0].id);
    }
    if (dpData) setDps(dpData);
    if (whData) setWhs(whData);

    // Fetch Users
    const { data: usersData, error } = await supabase
      .from('profiles')
      .select(`
        *,
        user_roles (role_name)
      `)
      .order('created_at', { ascending: false });
      
    if (error) {
        showMessage(`Database Error: ${error.message}`, "error");
        setUsers([]);
    } else if (usersData) {
        setUsers(usersData);
    }
    
    setIsLoading(false);
  };

  // --- PIN VERIFICATION LOGIC ---
  const handleInitiateSecureAction = (type: string, user: any, payload?: any) => {
      setPinAction({ type, user, payload });
      setPinInput('');
      setIsPinConfirmed(false);
      setIsPinModalOpen(true);
  };

  const executeSecureAction = async () => {
      const savedPin = localStorage.getItem('db_admin_pin') || '123456';
      if (pinInput !== savedPin) {
          alert('Incorrect Security PIN!');
          setPinInput('');
          return;
      }

      if (!pinAction) return;
      setIsPinModalOpen(false);

      try {
          if (pinAction.type === 'DELETE') {
              const { error } = await supabase.from('profiles').delete().eq('id', pinAction.user.id);
              if (error) throw error;
              setUsers(users.filter(u => u.id !== pinAction.user.id));
              showMessage("User deleted successfully.");
          } 
          else if (pinAction.type === 'STATUS') {
              const { error } = await supabase.from('profiles').update({ status: pinAction.payload }).eq('id', pinAction.user.id);
              if (error) throw error;
              setUsers(users.map(u => u.id === pinAction.user.id ? { ...u, status: pinAction.payload } : u));
              showMessage(`User status updated to ${pinAction.payload}.`);
          }
          else if (pinAction.type === 'EDIT_OPEN') {
              openModal(true, pinAction.user);
          }
      } catch (err: any) {
          showMessage(err.message, "error");
      }
      setPinAction(null);
  };

  // --- MODAL & FORM LOGIC ---
  const openModal = (editMode = false, user: any = null) => {
      setIsEditing(editMode);
      if (editMode && user) {
          setCurrentUserData(user);
          setFormEmail(user.email || '');
          setFormName(user.full_name || '');
          setFormPhone(user.phone || '');
          setFormDesignation(user.designation || '');
          setFormRole(user.role_id || '');
          setFormStatus(user.status || 'Active');
          setFormPassword(''); 
      } else {
          setCurrentUserData(null);
          setFormEmail('');
          setFormName('');
          setFormPhone('');
          setFormDesignation('');
          setFormRole(roles.length > 0 ? roles[0].id : '');
          setFormStatus('Active');
          setFormPassword('');
      }
      setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formEmail || !formName || !formRole) {
          showMessage("Please fill all required fields.", "error");
          return;
      }

      const payload = {
          email: formEmail,
          full_name: formName,
          phone: formPhone,
          designation: formDesignation,
          role_id: formRole,
          status: formStatus
      };

      try {
          if (isEditing && currentUserData) {
              const { error } = await supabase.from('profiles').update(payload).eq('id', currentUserData.id);
              if (error) throw error;
              showMessage("User updated successfully!");
          } else {
              if (!formPassword) { alert("Initial Password is required for new users."); return; }
              
              // Instead of inserting just standard fields, we omit `id` entirely from our manual insert.
              // We also ensure password_hash is sent.
              const insertPayload = {
                  ...payload,
                  password_hash: formPassword
              };
              
              const { error } = await supabase.from('profiles').insert([insertPayload]);
              
              if (error) {
                  // If it still complains about ID, it means the table was created without a default UUID generation 
                  // or the trigger is missing. We can explicitly generate one here as a fallback using crypto API.
                  if (error.code === '23502' && error.message.includes('"id"')) {
                      const fallbackId = crypto.randomUUID();
                      const { error: fallbackError } = await supabase.from('profiles').insert([{ id: fallbackId, ...insertPayload }]);
                      if (fallbackError) throw fallbackError;
                  } else {
                      throw error;
                  }
              }
              showMessage("New user created successfully!");
          }
          fetchInitialData();
          setIsModalOpen(false);
      } catch (err: any) {
          showMessage(err.message, "error");
      }
  };

  // --- FACILITY ACCESS (DP & WH) LOGIC ---
  const openFacilityModal = (user: any) => {
      setFacilityUser(user);
      setSelectedDPs(user.assigned_dp_ids || []);
      setSelectedWHs(user.assigned_wh_ids || []);
      setIsFacilityModalOpen(true);
  };

  const toggleDP = (id: string) => {
      if (selectedDPs.includes(id)) setSelectedDPs(selectedDPs.filter(dpId => dpId !== id));
      else setSelectedDPs([...selectedDPs, id]);
  };

  const toggleWH = (id: string) => {
      if (selectedWHs.includes(id)) setSelectedWHs(selectedWHs.filter(whId => whId !== id));
      else setSelectedWHs([...selectedWHs, id]);
  };

  const handleSaveFacilities = async () => {
      if (!facilityUser) return;
      try {
          const payload = { assigned_dp_ids: selectedDPs, assigned_wh_ids: selectedWHs };
          const { error } = await supabase.from('profiles').update(payload).eq('id', facilityUser.id);
          if (error) throw error;
          
          setUsers(users.map(u => u.id === facilityUser.id ? { ...u, ...payload } : u));
          showMessage("Facility access updated successfully!");
          setIsFacilityModalOpen(false);
      } catch (err: any) {
          showMessage(err.message, "error");
      }
  };


  // --- BULK UPLOAD & TEMPLATE ---
  const handleDownloadTemplate = () => {
      const templateData = [{
          "Email": "user1@example.com", "Full Name": "John Doe", "Designation": "Field Officer", "Phone": "+8801700000000",
          "Role Name": roles.length > 0 ? roles[0].role_name : "Field Worker", "Initial Password": "Password@123"
      }];
      const worksheet = XLSX.utils.json_to_sheet(templateData);
      worksheet['!cols'] = [ {wch: 25}, {wch: 20}, {wch: 20}, {wch: 15}, {wch: 20}, {wch: 20} ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Users_Template");
      XLSX.writeFile(workbook, "Bulk_User_Upload_Template.xlsx");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
          try {
              const bstr = evt.target?.result;
              const wb = XLSX.read(bstr, { type: 'binary' });
              const data: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

              if (data.length === 0) return;
              let successCount = 0; let errorCount = 0;

              for (const row of data) {
                  const roleObj = roles.find(r => r.role_name.toLowerCase() === (row['Role Name'] || '').toString().toLowerCase());
                  if (!row['Email'] || !row['Full Name']) { errorCount++; continue; }

                  const payload = {
                      id: crypto.randomUUID(), // Force ID generation for bulk as well to bypass constraint issues
                      email: row['Email'], full_name: row['Full Name'], designation: row['Designation'] || null,
                      phone: row['Phone'] || null, role_id: roleObj ? roleObj.id : null, status: 'Active'
                  };
                  const { error } = await supabase.from('profiles').insert([payload]);
                  if (error) errorCount++; else successCount++;
              }
              fetchInitialData();
              showMessage(`Bulk upload complete! ${successCount} added, ${errorCount} failed.`);
          } catch (error) { showMessage("Failed to process Excel file.", "error"); }
          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsBinaryString(file);
  };

  // --- EXPORT LIST ---
  const getFilteredUsers = () => {
      return users.filter(u => {
          const matchRole = filterRole === 'ALL' || u.role_id === filterRole;
          const matchStatus = filterStatus === 'ALL' || u.status === filterStatus;
          const matchSearch = u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              u.email?.toLowerCase().includes(searchTerm.toLowerCase()) || u.phone?.includes(searchTerm);
          return matchRole && matchStatus && matchSearch;
      });
  };

  const filteredUsers = getFilteredUsers();

  const handleExportExcel = () => {
      const exportData = filteredUsers.map((u, idx) => ({
          "SL": idx + 1, "Full Name": u.full_name || 'N/A', "Designation": u.designation || 'N/A',
          "Email": u.email, "Phone": u.phone || 'N/A', "Role": u.user_roles?.role_name || 'Unassigned',
          "Assigned DPs": u.assigned_dp_ids?.length || 0, "Assigned WHs": u.assigned_wh_ids?.length || 0,
          "Status": u.status || 'Active', "Joined Date": new Date(u.created_at).toLocaleDateString()
      }));
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "System_Users");
      XLSX.writeFile(workbook, "System_Users_List.xlsx");
  };

  const handleExportPDF = () => {
      const doc = new jsPDF('landscape');
      doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("System Users & Access Registry", 14, 15);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100, 116, 139);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 21);

      const tableColumn = ["SL", "Full Name", "Designation", "Email", "Role", "DP Access", "WH Access", "Status"];
      const tableRows = filteredUsers.map((u, idx) => [
          idx + 1, u.full_name || 'N/A', u.designation || '-', u.email, u.user_roles?.role_name || 'Unassigned',
          `${u.assigned_dp_ids?.length || 0} DPs`, `${u.assigned_wh_ids?.length || 0} WHs`, u.status || 'Active'
      ]);

      autoTable(doc, { head: [tableColumn], body: tableRows, startY: 26, theme: 'grid', styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [79, 70, 229] } });
      doc.save("System_Users_List.pdf");
  };

  const getStatusBadge = (status: string) => {
      if (status === 'Active') return <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-black uppercase">Active</span>;
      if (status === 'Hold') return <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-black uppercase">On Hold</span>;
      return <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-black uppercase">Inactive</span>;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 overflow-hidden relative">
      
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 shadow-sm z-10 justify-between">
        <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-3 md:mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
              <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">User Management</h1>
              <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5 hidden sm:block">Accounts & Security Controls</p>
            </div>
        </div>
        <div className="mr-14 md:mr-24 shrink-0">
          <button onClick={() => openModal()} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 md:py-2.5 md:px-5 rounded-lg md:rounded-xl text-xs md:text-sm shadow-md transition-all flex items-center whitespace-nowrap">
              <span className="mr-1.5 md:mr-2 text-base md:text-lg">+</span> Manual Add
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-4 md:p-6 flex flex-col relative z-0">
        {msg.text && (
          <div className={`absolute top-6 left-1/2 -translate-x-1/2 z-50 p-4 rounded-xl shadow-lg border text-sm font-bold flex items-center animate-in slide-in-from-top-4 ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}
          </div>
        )}

        <div className="flex flex-col h-full bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
           
           <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col xl:flex-row justify-between xl:items-center gap-4 shrink-0">
               <div className="flex flex-wrap items-center gap-3">
                   <button onClick={handleDownloadTemplate} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold py-2 px-4 rounded-xl text-xs shadow-sm flex items-center transition-colors">
                      <Icons.Download /> <span className="ml-2">Excel Template</span>
                   </button>
                   <div className="relative">
                      <input type="file" accept=".xlsx, .xls, .csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                      <button onClick={() => fileInputRef.current?.click()} className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-4 rounded-xl text-xs shadow-sm flex items-center transition-colors">
                         <span className="mr-2 text-base">📤</span> Bulk Upload
                      </button>
                   </div>
               </div>

               <div className="flex flex-wrap items-center gap-3">
                   <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 shadow-sm w-32">
                      <option value="ALL">All Roles</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.role_name}</option>)}
                   </select>
                   <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 shadow-sm w-28">
                      <option value="ALL">All Status</option>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                   </select>
                   <input type="text" placeholder="Search users..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="px-4 py-2 w-full sm:w-64 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 shadow-sm" />
                   <div className="flex space-x-2 xl:border-l border-slate-200 xl:pl-3">
                      <button onClick={handleExportExcel} disabled={filteredUsers.length === 0} className="px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg hover:bg-emerald-100 transition-colors shadow-sm disabled:opacity-50">Excel</button>
                      <button onClick={handleExportPDF} disabled={filteredUsers.length === 0} className="px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg hover:bg-rose-100 transition-colors shadow-sm disabled:opacity-50">PDF</button>
                   </div>
               </div>
           </div>

           <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                 <thead className="bg-slate-100/80 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                    <tr>
                       <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">User Info & Designation</th>
                       <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">Contact</th>
                       <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">Role & Access</th>
                       <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">Status</th>
                       <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right pr-6">Actions</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 bg-white">
                    {isLoading ? (
                       <tr><td colSpan={5} className="p-10 text-center text-slate-400 font-bold">Loading DB Profiles...</td></tr>
                    ) : filteredUsers.length === 0 ? (
                       <tr><td colSpan={5} className="p-10 text-center text-slate-400 font-bold">No users found.</td></tr>
                    ) : (
                       filteredUsers.map(user => (
                          <tr key={user.id} className="hover:bg-slate-50/80 transition-colors group">
                             <td className="p-4">
                                <div className="flex items-center space-x-3">
                                   <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-600 flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">
                                      {user.full_name ? user.full_name.charAt(0).toUpperCase() : (user.email ? user.email.charAt(0).toUpperCase() : 'U')}
                                   </div>
                                   <div>
                                      <p className="font-bold text-slate-900 text-sm leading-tight">{user.full_name || 'N/A'}</p>
                                      <p className="text-xs text-slate-500 mt-0.5">{user.designation || <span className="italic opacity-50">No Designation</span>}</p>
                                   </div>
                                </div>
                             </td>
                             <td className="p-4">
                                <p className="font-mono text-xs font-bold text-slate-600">{user.phone || '-'}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{user.email}</p>
                             </td>
                             <td className="p-4">
                                <div className="flex flex-col items-start space-y-1.5">
                                   <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap">
                                      {user.user_roles?.role_name || 'Unassigned Role'}
                                   </span>
                                   <div className="flex space-x-2 text-[9px] font-bold text-slate-500 uppercase tracking-wide mt-1">
                                      <span>{user.assigned_dp_ids?.length || 0} DPs</span>
                                      <span className="text-slate-300">|</span>
                                      <span>{user.assigned_wh_ids?.length || 0} WHs</span>
                                   </div>
                                </div>
                             </td>
                             <td className="p-4">
                                {getStatusBadge(user.status || 'Active')}
                             </td>
                             <td className="p-4 text-right pr-6">
                                <div className="flex items-center justify-end space-x-2">
                                   <div className="flex space-x-1 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {user.status !== 'Active' && <button onClick={() => handleInitiateSecureAction('STATUS', user, 'Active')} className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold rounded hover:bg-emerald-100 transition-colors">Active</button>}
                                      {user.status !== 'Hold' && <button onClick={() => handleInitiateSecureAction('STATUS', user, 'Hold')} className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold rounded hover:bg-amber-100 transition-colors">Hold</button>}
                                      {user.status !== 'Inactive' && <button onClick={() => handleInitiateSecureAction('STATUS', user, 'Inactive')} className="px-2 py-1 bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold rounded hover:bg-slate-200 transition-colors">Inactive</button>}
                                   </div>
                                   
                                   {/* FACILITY ACCESS BUTTON */}
                                   <button onClick={() => openFacilityModal(user)} className="px-3 py-1.5 bg-slate-800 text-white text-[10px] font-bold rounded-lg hover:bg-slate-900 transition-colors shadow-sm flex items-center" title="Manage Warehouse & DP Access">
                                      🏢 Facilities
                                   </button>
                                   
                                   <button onClick={() => handleInitiateSecureAction('EDIT_OPEN', user)} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg border border-transparent hover:border-amber-200 transition-colors" title="Edit User"><Icons.Edit /></button>
                                   <button onClick={() => handleInitiateSecureAction('DELETE', user)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-200 transition-colors" title="Delete User"><Icons.Trash /></button>
                                </div>
                             </td>
                          </tr>
                       ))
                    )}
                 </tbody>
              </table>
           </div>
        </div>
      </main>

      {/* ---------------- MANUAL ADD / EDIT MODAL ---------------- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-black text-lg text-slate-900">{isEditing ? 'Edit User Details' : 'Register New User'}</h3>
                {isEditing && <p className="text-xs text-slate-500 mt-1">{currentUserData?.email}</p>}
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-100"><Icons.Close /></button>
            </div>
            
            <form onSubmit={handleSaveUser} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
               <div>
                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Email Address *</label>
                 <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} required disabled={isEditing} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 disabled:opacity-60 shadow-sm" />
               </div>
               
               <div>
                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Full Name *</label>
                 <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} required className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 shadow-sm" />
               </div>

               <div>
                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Designation</label>
                 <input type="text" value={formDesignation} onChange={(e) => setFormDesignation(e.target.value)} placeholder="e.g. DP Manager" className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 shadow-sm" />
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Phone Number</label>
                   <input type="text" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 shadow-sm" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Account Status</label>
                   <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 shadow-sm">
                     {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                   </select>
                 </div>
               </div>

               <div>
                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Assigned Role *</label>
                 <select value={formRole} onChange={(e) => setFormRole(e.target.value)} required className="w-full px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-900 font-bold outline-none focus:border-indigo-500 shadow-sm">
                   {roles.map(r => <option key={r.id} value={r.id}>{r.role_name}</option>)}
                 </select>
               </div>
               
               {!isEditing && (
                 <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex justify-between">
                      Initial Password *
                      <span className="text-rose-500 lowercase normal-case font-medium">Must ask user to change later</span>
                   </label>
                   <input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required={!isEditing} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 shadow-sm" />
                 </div>
               )}
               
               <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl text-sm transition-all shadow-lg flex justify-center items-center mt-6">
                 {isEditing ? '💾 Save User Configuration' : 'Create New User Account'}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- FACILITY ACCESS MODAL (DP & WH) ---------------- */}
      {isFacilityModalOpen && facilityUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[85vh] animate-in zoom-in-95">
             <div className="p-5 border-b border-slate-200 bg-slate-900 text-white flex justify-between items-center shrink-0">
               <div>
                  <h3 className="font-black text-lg">Facility Access Management</h3>
                  <p className="text-xs font-medium mt-1 text-slate-400">Configuring access for <strong className="text-indigo-400">{facilityUser.full_name}</strong> ({facilityUser.user_roles?.role_name})</p>
               </div>
               <button onClick={() => setIsFacilityModalOpen(false)} className="p-2 bg-slate-800 text-slate-400 rounded-xl hover:bg-rose-500 hover:text-white transition-colors"><Icons.Close /></button>
             </div>

             <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-100 p-4 gap-4">
                 
                 {/* DP Pane */}
                 <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex justify-between items-center shrink-0">
                       <h3 className="font-bold text-indigo-900 text-sm flex items-center"><span className="mr-2 text-xl">⛺</span> Distribution Points</h3>
                       <div className="flex space-x-2">
                          <button onClick={() => setSelectedDPs(dps.map(d => d.id))} className="text-[10px] font-bold bg-white text-indigo-600 border border-indigo-200 px-2.5 py-1.5 rounded shadow-sm hover:bg-indigo-100">Select All</button>
                          <button onClick={() => setSelectedDPs([])} className="text-[10px] font-bold bg-white text-slate-500 border border-slate-200 px-2.5 py-1.5 rounded shadow-sm hover:bg-slate-100">Clear All</button>
                       </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                        {dps.length === 0 ? <p className="text-center text-slate-400 text-xs mt-10">No DPs found</p> : dps.map(dp => {
                            const isSelected = selectedDPs.includes(dp.id);
                            return (
                                <label key={dp.id} className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50 border-indigo-300 shadow-sm' : 'bg-white border-slate-200 hover:border-indigo-200'}`}>
                                   <div className="flex items-center space-x-3 truncate pr-4">
                                      <input type="checkbox" checked={isSelected} onChange={() => toggleDP(dp.id)} className="w-5 h-5 accent-indigo-600 rounded shrink-0" />
                                      <div className="truncate">
                                         <p className={`font-bold text-sm truncate ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>{dp.name}</p>
                                         <p className="text-[10px] font-mono text-slate-400 truncate">{dp.code}</p>
                                      </div>
                                   </div>
                                </label>
                            );
                        })}
                    </div>
                 </div>

                 {/* WH Pane */}
                 <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-emerald-50 p-4 border-b border-emerald-100 flex justify-between items-center shrink-0">
                       <h3 className="font-bold text-emerald-900 text-sm flex items-center"><span className="mr-2 text-xl">🏭</span> Warehouses</h3>
                       <div className="flex space-x-2">
                          <button onClick={() => setSelectedWHs(whs.map(w => w.id))} className="text-[10px] font-bold bg-white text-emerald-600 border border-emerald-200 px-2.5 py-1.5 rounded shadow-sm hover:bg-emerald-100">Select All</button>
                          <button onClick={() => setSelectedWHs([])} className="text-[10px] font-bold bg-white text-slate-500 border border-slate-200 px-2.5 py-1.5 rounded shadow-sm hover:bg-slate-100">Clear All</button>
                       </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                        {whs.length === 0 ? <p className="text-center text-slate-400 text-xs mt-10">No Warehouses found</p> : whs.map(wh => {
                            const isSelected = selectedWHs.includes(wh.id);
                            return (
                                <label key={wh.id} className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-white border-slate-200 hover:border-emerald-200'}`}>
                                   <div className="flex items-center space-x-3 truncate pr-4">
                                      <input type="checkbox" checked={isSelected} onChange={() => toggleWH(wh.id)} className="w-5 h-5 accent-emerald-600 rounded shrink-0" />
                                      <div className="truncate">
                                         <p className={`font-bold text-sm truncate ${isSelected ? 'text-emerald-900' : 'text-slate-700'}`}>{wh.name}</p>
                                         <p className="text-[10px] font-mono text-slate-400 truncate">{wh.code}</p>
                                      </div>
                                   </div>
                                </label>
                            );
                        })}
                    </div>
                 </div>

             </div>

             <div className="p-4 border-t border-slate-200 bg-white flex justify-end shrink-0">
                 <button onClick={() => setIsFacilityModalOpen(false)} className="px-6 py-3 font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl mr-3 transition-colors">Cancel</button>
                 <button onClick={handleSaveFacilities} className="px-8 py-3 font-black text-white bg-slate-900 hover:bg-indigo-600 rounded-xl shadow-md transition-all flex items-center">
                    💾 Save Facility Access
                 </button>
             </div>
          </div>
        </div>
      )}

      {/* ---------------- SECURE PIN PROMPT MODAL ---------------- */}
      {isPinModalOpen && pinAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
             <div className={`p-6 border-b flex justify-between items-center ${pinAction.type === 'DELETE' ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-200'}`}>
               <div>
                  <h3 className={`font-black text-xl ${pinAction.type === 'DELETE' ? 'text-rose-600' : 'text-slate-900'}`}>
                    {pinAction.type === 'DELETE' ? '⚠️ Delete User' : '🔐 Security Check'}
                  </h3>
                  <p className="text-xs font-bold mt-1 text-slate-500">
                    {pinAction.type === 'EDIT_OPEN' ? 'Enter PIN to edit user.' : 
                     pinAction.type === 'STATUS' ? `Enter PIN to change status to ${pinAction.payload}.` : 
                     'Enter PIN to permanently delete.'}
                  </p>
               </div>
               <button onClick={() => {setIsPinModalOpen(false); setPinAction(null);}} className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg"><Icons.Close /></button>
             </div>

             <div className="p-6 space-y-5">
               <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Target User</p>
                  <p className="font-bold text-slate-800">{pinAction.user.full_name || pinAction.user.email}</p>
                  <p className="text-xs font-mono text-slate-500 mt-1">{pinAction.user.email}</p>
               </div>

               {pinAction.type === 'DELETE' && (
                  <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl flex items-start space-x-3">
                     <input 
                        type="checkbox" 
                        checked={isPinConfirmed} 
                        onChange={(e) => setIsPinConfirmed(e.target.checked)} 
                        className="mt-1 w-5 h-5 accent-rose-600 rounded cursor-pointer shrink-0" 
                     />
                     <span className="text-xs font-bold text-rose-900 leading-tight">I double confirm that I want to permanently delete this user from the system.</span>
                  </div>
               )}

               <div>
                 <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 text-center tracking-widest">Database Admin PIN</label>
                 <input 
                   type="password" 
                   autoFocus 
                   value={pinInput} 
                   onChange={e => setPinInput(e.target.value)} 
                   className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-center text-3xl tracking-[0.5em] font-black focus:border-indigo-500 outline-none shadow-inner" 
                 />
               </div>

               <button 
                 onClick={executeSecureAction} 
                 disabled={pinAction.type === 'DELETE' ? (!pinInput || !isPinConfirmed) : !pinInput}
                 className={`w-full text-white font-black py-4 rounded-2xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${pinAction.type === 'DELETE' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'}`}
               >
                 {pinAction.type === 'DELETE' ? 'CONFIRM DELETION' : 'VERIFY & PROCEED'}
               </button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
}
