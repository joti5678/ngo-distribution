"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function DatabaseForceDelete() {
  // Settings & Security State
  const [adminPin, setAdminPin] = useState('123456');
  const [isChangePinOpen, setIsChangePinOpen] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Delete Form State
  const [selectedDataset, setSelectedDataset] = useState('');
  const [dateRangeType, setDateRangeType] = useState('all'); // 'all' or 'range'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');

  useEffect(() => {
    // Load PIN from local storage or set default
    const savedPin = localStorage.getItem('db_admin_pin');
    if (savedPin) {
      setAdminPin(savedPin);
    } else {
      localStorage.setItem('db_admin_pin', '123456');
    }

    // Set default dates to current month
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  }, []);

  const handleChangePin = () => {
    if (oldPin !== adminPin) return alert('Old PIN is incorrect!');
    if (newPin !== confirmPin) return alert('New PINs do not match!');
    if (newPin.length < 4) return alert('PIN must be at least 4 characters long.');
    
    localStorage.setItem('db_admin_pin', newPin);
    setAdminPin(newPin);
    setIsChangePinOpen(false);
    setOldPin(''); setNewPin(''); setConfirmPin('');
    alert('Admin PIN updated successfully!');
  };

  const openDeleteModal = () => {
    if (!selectedDataset) return alert('Please select a dataset to delete.');
    if (dateRangeType === 'range' && (!startDate || !endDate) && selectedDataset !== 'reset_cache') return alert('Please select both start and end dates.');
    
    setDeleteError('');
    setDeleteSuccess('');
    setEnteredPin('');
    setIsConfirmed(false); // Reset confirmation
    setDeleteStep(1);
    setIsDeleteModalOpen(true);
  };

  const executeHardDelete = async () => {
    if (enteredPin !== adminPin) {
      setDeleteError('Incorrect Security PIN!');
      return;
    }

    setIsDeleting(true);
    setDeleteError('');
    
    try {
      // --- SPECIAL CASE: RESET CACHED STOCK ---
      if (selectedDataset === 'reset_cache') {
         await supabase.from('products').update({ current_stock: 0 }).not('id', 'is', null);
         await supabase.from('products').update({ stock: 0 }).not('id', 'is', null);
         await supabase.from('warehouse_stocks').update({ quantity: 0 }).not('id', 'is', null);
         
         setDeleteSuccess('Cached stock balances have been successfully forced to ZERO.');
         setDeleteStep(3);
         setIsDeleting(false);
         return;
      }

      let query;
      let tableName = '';
      let dateColumn = 'created_at';

      // 1. Determine Table & Date Column
      if (selectedDataset === 'distributions') {
        tableName = 'distributions';
        dateColumn = 'distribution_date';
      } else if (selectedDataset === 'manifests') {
        tableName = 'manifests';
        dateColumn = 'created_at';
      } else if (selectedDataset === 'inventory_table') {
        tableName = 'inventory';
        dateColumn = 'last_updated';
      } else if (selectedDataset === 'inventory_transfer') {
        tableName = 'stock_transfers';
        dateColumn = 'created_at';
      } else if (selectedDataset.startsWith('inventory')) {
        tableName = 'inventory_transactions';
        dateColumn = 'created_at';
      } else if (selectedDataset === 'products') {
        tableName = 'products';
      } else if (selectedDataset === 'dps') {
        tableName = 'distribution_points';
      } else if (selectedDataset === 'warehouses') {
        tableName = 'warehouses';
      } else {
        throw new Error('Invalid dataset selected.');
      }

      // Pre-emptively attempt to delete manifest children to avoid FK issues
      if (tableName === 'manifests' && dateRangeType === 'all') {
         await supabase.from('manifest_items').delete().not('manifest_id', 'is', null);
      }

      // 2. Base Query
      query = supabase.from(tableName).delete();

      // 3. Apply Granular Transaction Filters
      if (tableName === 'inventory_transactions') {
        if (selectedDataset === 'inventory_receive') {
          query = query.eq('transaction_type', 'RECEIVE');
        } else if (selectedDataset === 'inventory_initial') {
          query = query.is('transfer_id', null).in('transaction_type', ['IN', 'INITIAL']);
        } else if (selectedDataset === 'inventory_damage') {
          query = query.eq('transaction_type', 'DAMAGE');
        }
      }

      // 4. Apply Date Filters or Fallback
      if (dateRangeType === 'range' && (tableName === 'distributions' || tableName === 'inventory_transactions' || tableName === 'stock_transfers' || tableName === 'manifests' || tableName === 'inventory')) {
        if (tableName === 'inventory_transactions' || tableName === 'stock_transfers' || tableName === 'manifests' || tableName === 'inventory') {
           query = query.gte(dateColumn, `${startDate}T00:00:00.000Z`).lte(dateColumn, `${endDate}T23:59:59.999Z`);
        } else {
           query = query.gte(dateColumn, startDate).lte(dateColumn, endDate);
        }
      } else {
        // inventory table might not have 'id' column, so we use 'product_id'
        if (tableName === 'inventory') {
           query = query.not('product_id', 'is', null);
        } else {
           query = query.not('id', 'is', null);
        }
      }

      // 5. Execute
      const { error } = await query;
      
      if (error) {
        if (error.code === '23503') {
           throw new Error(`Cannot delete from ${tableName.toUpperCase()} because they are linked to other data. Please delete the related transactional data first.`);
        }
        throw error;
      }

      const formattedName = selectedDataset.replace('_', ' ').toUpperCase();
      setDeleteSuccess(`Successfully wiped records from ${formattedName}.`);
      setDeleteStep(3); // Success Step

    } catch (err: any) {
      setDeleteError(err.message || 'An error occurred during deletion.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 font-sans overflow-y-auto">
      
      {/* SECURE HEADER */}
      <header className="h-20 bg-slate-900 border-b border-slate-800 flex items-center px-8 shrink-0 shadow-md justify-between sticky top-0 z-20">
         <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-5 p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-slate-300 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <span className="text-3xl mr-3 drop-shadow-md">⚠️</span>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Database Hard Delete (Wipe)</h1>
              <p className="text-xs font-bold text-slate-400 mt-0.5 uppercase tracking-widest">System Administration</p>
            </div>
         </div>
         
         <button onClick={() => setIsChangePinOpen(true)} className="flex items-center px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-colors border border-slate-700 shadow-inner">
            <svg className="w-4 h-4 mr-2 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4v-3l1.9-1.9A6 6 0 1115 7h0z" /></svg>
            Change Security PIN
         </button>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-8 pb-20 max-w-4xl mx-auto w-full">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* Danger Header Banner */}
              <div className="bg-gradient-to-r from-rose-600 to-red-600 p-8 text-white flex items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 opacity-10 pointer-events-none">
                  <svg className="w-64 h-64 -mt-10 -mr-10" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 16h2v2h-2v-2zm0-6h2v4h-2v-4z"/></svg>
                </div>
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mr-6 shrink-0 shadow-inner z-10">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </div>
                <div className="z-10">
                  <h2 className="text-2xl font-black">Destructive Zone</h2>
                  <p className="text-rose-100 mt-1 font-medium">Data deleted from this panel is physically removed from the database and cannot be recovered unless a backup exists.</p>
                </div>
              </div>

              <div className="p-8 md:p-10">
                
                {/* 1. Dataset Selection */}
                <div className="mb-10">
                  <label className="block text-sm font-black text-slate-900 mb-3 uppercase tracking-wider">1. Select Target Dataset</label>
                  <select 
                    value={selectedDataset} 
                    onChange={(e) => setSelectedDataset(e.target.value)}
                    className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-slate-900 font-bold focus:border-rose-500 focus:ring-0 outline-none transition-colors appearance-none cursor-pointer text-lg shadow-sm"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1.25rem center', backgroundSize: '1.5em 1.5em' }}
                  >
                      <option value="" disabled>-- Choose Dataset to Purge --</option>
                      <optgroup label="Emergency Tools">
                        <option value="inventory_table">🛠️ Delete All Inventory Records (Clear Inventory to 0)</option>
                        <option value="reset_cache">🛠️ Reset Cached Stock Balances</option>
                      </optgroup>
                      <optgroup label="Transaction Data">
                        <option value="manifests">Delete All Manifests (With added products)</option>
                        <option value="distributions">Distributions & Distribution Items (Daily Reports)</option>
                        <option value="inventory_all">All Inventory Transactions (Receive, Transfer, Entry, Damage)</option>
                        <option value="inventory_receive">Inventory: Stock Receives (UNHCR / Partners)</option>
                        <option value="inventory_transfer">Inventory: Stock Transfers (Deletes entire Transfer Document)</option>
                        <option value="inventory_initial">Inventory: Initial Stock Entries</option>
                        <option value="inventory_damage">Inventory: Damages & Shortages</option>
                      </optgroup>
                      <optgroup label="Master Data (Cannot use Date Filter)">
                        <option value="products">Products Master Data</option>
                        <option value="dps">Distribution Points (DPs)</option>
                        <option value="warehouses">Warehouses</option>
                      </optgroup>
                  </select>
                </div>

                {/* 2. Date Configuration */}
                <div className="mb-10">
                  <label className="block text-sm font-black text-slate-900 mb-3 uppercase tracking-wider">2. Date Filter Strategy</label>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                      <label className={`flex items-center p-5 border-2 rounded-2xl cursor-pointer transition-all ${dateRangeType === 'all' ? 'border-rose-500 bg-rose-50 text-rose-900 shadow-md' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'}`}>
                        <input type="radio" name="rangeType" checked={dateRangeType === 'all'} onChange={() => setDateRangeType('all')} className="w-5 h-5 accent-rose-600 mr-4" />
                        <div>
                          <span className="font-bold block text-base">Delete ALL DATA</span>
                          <span className="text-xs font-semibold opacity-70 mt-0.5 block">Wipe entire selected table/cache</span>
                        </div>
                      </label>
                      
                      <label className={`flex items-center p-5 border-2 rounded-2xl cursor-pointer transition-all ${dateRangeType === 'range' ? 'border-indigo-500 bg-indigo-50 text-indigo-900 shadow-md' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'} ${(selectedDataset === 'products' || selectedDataset === 'dps' || selectedDataset === 'warehouses' || selectedDataset === 'reset_cache') ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}>
                        <input type="radio" name="rangeType" checked={dateRangeType === 'range'} onChange={() => setDateRangeType('range')} className="w-5 h-5 accent-indigo-600 mr-4" disabled={selectedDataset === 'products' || selectedDataset === 'dps' || selectedDataset === 'warehouses' || selectedDataset === 'reset_cache'} />
                        <div>
                          <span className="font-bold block text-base">Specific Date Range</span>
                          <span className="text-xs font-semibold opacity-70 mt-0.5 block">Applicable for transactions only</span>
                        </div>
                      </label>
                  </div>

                  {dateRangeType === 'range' && (
                    <div className="grid grid-cols-2 gap-6 bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100 animate-in zoom-in-95 duration-300 shadow-inner">
                        <div>
                          <label className="block text-xs font-bold text-indigo-900 mb-2 uppercase tracking-wide">From Date</label>
                          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-3.5 bg-white border border-indigo-200 rounded-xl font-bold text-slate-900 focus:border-indigo-500 outline-none shadow-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-indigo-900 mb-2 uppercase tracking-wide">To Date (Inclusive)</label>
                          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full p-3.5 bg-white border border-indigo-200 rounded-xl font-bold text-slate-900 focus:border-indigo-500 outline-none shadow-sm" />
                        </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 pt-8 flex justify-end">
                    <button onClick={openDeleteModal} className="bg-rose-600 hover:bg-rose-700 text-white px-10 py-4 rounded-2xl font-black text-lg shadow-xl shadow-rose-600/30 transition-all hover:scale-105 flex items-center">
                      <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      INITIATE HARD DELETE
                    </button>
                </div>

              </div>
          </div>
      </main>

      {/* 2-STEP DELETE MODAL */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            
            {deleteStep === 1 && (
              <div className="p-8">
                <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl shadow-inner border-4 border-white ring-4 ring-rose-50">⚠️</div>
                <h3 className="text-2xl font-black text-center text-slate-900 mb-2">Step 1: Confirm Intent</h3>
                <p className="text-center text-slate-600 font-bold mb-6 text-sm leading-relaxed">
                  You are attempting to execute <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 uppercase">{dateRangeType === 'all' ? 'ALL DATA' : 'DATE RANGE DATA'}</span> command on the <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 uppercase">{selectedDataset.replace('_', ' ')}</span> target.
                </p>

                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl mb-8">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input 
                       type="checkbox" 
                       checked={isConfirmed} 
                       onChange={(e) => setIsConfirmed(e.target.checked)} 
                       className="mt-1 w-5 h-5 accent-amber-600 rounded cursor-pointer shrink-0" 
                    />
                    <span className="text-sm font-bold text-amber-900 leading-tight">I understand that this action is irreversible and the data will be permanently wiped or reset from the database.</span>
                  </label>
                </div>

                <div className="flex space-x-3">
                  <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 px-4 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">Cancel</button>
                  <button disabled={!isConfirmed} onClick={() => setDeleteStep(2)} className="flex-1 px-4 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-rose-600/30">Proceed to Step 2</button>
                </div>
              </div>
            )}

            {deleteStep === 2 && (
              <div className="p-8">
                <div className="w-20 h-20 bg-slate-900 text-white rounded-full flex items-center justify-center mx-auto mb-6 text-4xl shadow-inner border-4 border-white ring-4 ring-slate-100">🔐</div>
                <h3 className="text-2xl font-black text-center text-slate-900 mb-2">Step 2: Security Verification</h3>
                <p className="text-center text-slate-600 font-bold mb-8 text-sm">Enter your Database Admin PIN to execute.</p>

                {deleteError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 font-bold p-4 rounded-2xl mb-6 text-sm text-center flex items-center justify-center animate-in shake">
                    <svg className="w-5 h-5 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>{deleteError}</span>
                  </div>
                )}

                <div className="mb-8">
                   <input 
                     type="password" 
                     value={enteredPin}
                     onChange={(e) => setEnteredPin(e.target.value)}
                     placeholder="• • • • • •"
                     className="w-full text-center text-3xl tracking-[1em] p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-slate-900 font-black focus:border-rose-500 outline-none transition-colors"
                     autoFocus
                   />
                </div>

                <div className="flex space-x-3">
                  <button onClick={() => setDeleteStep(1)} disabled={isDeleting} className="flex-1 px-4 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">Go Back</button>
                  <button onClick={executeHardDelete} disabled={!enteredPin || isDeleting} className="flex-1 px-4 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl transition-all shadow-lg shadow-rose-600/30 flex items-center justify-center disabled:opacity-50">
                    {isDeleting ? (
                      <span className="flex items-center"><svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> EXECUTING...</span>
                    ) : 'EXECUTE COMMAND'}
                  </button>
                </div>
              </div>
            )}

            {deleteStep === 3 && (
              <div className="p-8 text-center bg-emerald-50">
                 <div className="w-24 h-24 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 text-5xl shadow-xl shadow-emerald-500/30 border-4 border-white">✓</div>
                 <h3 className="text-3xl font-black text-emerald-900 mb-3">Target Destroyed</h3>
                 <p className="text-emerald-700 font-bold mb-8 text-sm">{deleteSuccess}</p>
                 <button onClick={() => { setIsDeleteModalOpen(false); setSelectedDataset(''); setEnteredPin(''); }} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-xl shadow-lg shadow-emerald-600/20 transition-all">RETURN TO PANEL</button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* CHANGE PIN MODAL */}
      {isChangePinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
               <h3 className="font-black text-slate-900 text-lg flex items-center">
                 <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4v-3l1.9-1.9A6 6 0 1115 7h0z" /></svg>
                 Update Security PIN
               </h3>
               <button onClick={() => setIsChangePinOpen(false)} className="text-slate-400 hover:text-slate-900 bg-white p-2 rounded-full shadow-sm border border-slate-200"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
             </div>
             <div className="p-6 space-y-4">
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Current PIN</label>
                  <input type="password" value={oldPin} onChange={e => setOldPin(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900 text-center tracking-[0.5em] focus:border-indigo-500 outline-none" placeholder="••••" />
               </div>
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">New PIN</label>
                  <input type="password" value={newPin} onChange={e => setNewPin(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-indigo-600 text-center tracking-[0.5em] focus:border-indigo-500 outline-none" placeholder="••••" />
               </div>
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Confirm New PIN</label>
                  <input type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-emerald-600 text-center tracking-[0.5em] focus:border-indigo-500 outline-none" placeholder="••••" />
               </div>
             </div>
             <div className="p-6 border-t border-slate-100 bg-slate-50">
               <button onClick={handleChangePin} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-4 rounded-xl shadow-lg transition-all">SAVE NEW PIN</button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
}
