"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from './../../components/Icons';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function BatchDistributionPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [assignedDps, setAssignedDps] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  
  const [activeManifests, setActiveManifests] = useState<any[]>([]);
  const [selectedManifest, setSelectedManifest] = useState<any>(null);
  const [manifestProducts, setManifestProducts] = useState<any[]>([]);
  const [whStockMap, setWhStockMap] = useState<Record<string, number>>({});
  
  const [distDate, setDistDate] = useState('');
  const [leftDpFilter, setLeftDpFilter] = useState('ALL');
  const [rightProductSearch, setRightProductSearch] = useState('');
  const [distQuantities, setDistQuantities] = useState<Record<string, number | ''>>({});
  const [remarks, setRemarks] = useState('');

  const [history, setHistory] = useState<any[]>([]);
  const [filterDpId, setFilterDpId] = useState('ALL');
  const [filterDate, setFilterDate] = useState('');
  const [filterProductSearch, setFilterProductSearch] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Modals
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [distToRevert, setDistToRevert] = useState<any>(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [distToEdit, setDistToEdit] = useState<any>(null);
  const [editQtys, setEditQtys] = useState<Record<string, number | ''>>({});
  const [editMaxStocks, setEditMaxStocks] = useState<Record<string, number>>({});
  const [editRemarks, setEditRemarks] = useState('');

  useEffect(() => {
    const todayStr = new Date().toLocaleDateString('en-CA'); 
    setDistDate(todayStr);
    initPageData(todayStr);
  }, []);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4500);
  };

  const initPageData = async (todayStr: string) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let profileData: any = null;
      if (user) {
        setCurrentUser(user);
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (prof) profileData = prof;
      }

      const [whRes, dpRes] = await Promise.all([
        supabase.from('warehouses').select('id, name, code'),
        supabase.from('distribution_points').select('*').order('name')
      ]);

      const allWhs = whRes.data || [];
      setWarehouses(allWhs);
      const allDps = dpRes.data || [];
      
      let allowedDps = allDps;
      if (profileData && profileData.role !== 'Super Admin' && Array.isArray(profileData.assigned_dp_ids) && profileData.assigned_dp_ids.length > 0) {
        allowedDps = allDps.filter(dp => profileData.assigned_dp_ids.includes(dp.id));
      }

      const enrichedDps = allowedDps.map(dp => ({ 
        ...dp, 
        nfi_warehouse: allWhs.find(w => w.id === dp.nfi_warehouse_id) || null,
        lpg_warehouse: allWhs.find(w => w.id === dp.lpg_warehouse_id) || null 
      }));
      
      setAssignedDps(enrichedDps);
      const allowedDpIds = enrichedDps.map(d => d.id);

      if (allowedDpIds.length > 0) {
        await fetchDistributionHistory(allowedDpIds, enrichedDps, todayStr);
      } else {
        setActiveManifests([]);
        setHistory([]);
      }
    } catch (err: any) {
      showMessage(`Error loading data: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDistributionHistory = async (dpIds: string[], dpList: any[], dateContext: string) => {
    if (dpIds.length === 0) return;
    const { data } = await supabase
      .from('distributions')
      .select(`*, manifests (title, manifest_code, manifest_type), distribution_items (id, quantity, product_id, products (id, name, code, unit_type, product_type))`)
      .in('distribution_point_id', dpIds)
      .order('distribution_date', { ascending: false })
      .order('created_at', { ascending: false }).limit(100);

    let enrichedHistory: any[] = [];
    if (data) {
      enrichedHistory = data.map(d => ({ ...d, dp: dpList.find(dp => dp.id === d.distribution_point_id) }));
      setHistory(enrichedHistory);
    }
    await fetchActiveManifests(dpIds, dpList, enrichedHistory, dateContext);
  };

  const fetchActiveManifests = async (dpIds: string[], dpList: any[], historyList: any[], dateContext: string) => {
    // We removed strict date filtering here so if it's "Active" in DB, it will show up!
    const { data, error } = await supabase.from('manifests')
      .select('*')
      .in('distribution_point_id', dpIds)
      .eq('status', 'Active')
      .order('created_at', { ascending: false });

    if (data) {
      const mapped = data.map(m => {
        const isSubmittedToday = historyList.some(h => h.manifest_id === m.id && h.distribution_date === dateContext);
        return { ...m, dp: dpList.find(d => d.id === m.distribution_point_id), isSubmittedToday };
      });
      
      setActiveManifests(mapped);
      
      if (mapped.length > 0 && !selectedManifest) {
         handleSelectManifest(mapped[0]);
      } else if (selectedManifest) {
         const updatedSelected = mapped.find(m => m.id === selectedManifest.id);
         if (updatedSelected) handleSelectManifest(updatedSelected);
      }
    }
  };

  useEffect(() => {
    if (assignedDps.length > 0) {
      const dpIds = assignedDps.map(d => d.id);
      fetchActiveManifests(dpIds, assignedDps, history, distDate);
    }
  }, [distDate]);

  const handleSelectManifest = async (manifest: any) => {
    setSelectedManifest(manifest);
    setIsLoadingItems(true);
    setRightProductSearch('');

    try {
      const { data: mItems } = await supabase.from('manifest_items')
        .select(`id, target_qty, distributed_qty, product_id, products (id, name, code, unit_type, product_type)`)
        .eq('manifest_id', manifest.id);

      const items = mItems || [];
      setManifestProducts(items);

      const initQtys: Record<string, number | ''> = {};
      items.forEach((item: any) => { initQtys[item.product_id] = ''; });
      setDistQuantities(initQtys);

      // Smart Warehouse Fetching - Check ANY connected warehouse of this DP without strict product_type dependency
      const nfiWhId = manifest.dp?.nfi_warehouse_id;
      const lpgWhId = manifest.dp?.lpg_warehouse_id;
      const productIds = items.map((i: any) => i.product_id);
      const targetWhIds = [nfiWhId, lpgWhId].filter(Boolean);

      let stockRecord: Record<string, number> = {};
      
      if (targetWhIds.length > 0 && productIds.length > 0) {
         const { data: invData } = await supabase.from('inventory')
           .select('warehouse_id, product_id, quantity')
           .in('warehouse_id', targetWhIds)
           .in('product_id', productIds);

         items.forEach((item: any) => {
           // Find if this product exists in ANY connected warehouse
           const inv = invData?.find((inv: any) => inv.product_id === item.product_id);
           stockRecord[item.product_id] = inv ? Number(inv.quantity) : 0;
         });
      }
      setWhStockMap(stockRecord);

    } catch (err: any) {
      showMessage(`Failed to load items: ${err.message}`, 'error');
    } finally {
      setIsLoadingItems(false);
    }
  };

  const handleQtyChange = (productId: string, val: string, maxStock: number) => {
    if (val === '') { setDistQuantities(prev => ({ ...prev, [productId]: '' })); return; }
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0) return;
    if (num > maxStock) {
      showMessage(`Quantity cannot exceed warehouse stock (${maxStock})!`, 'error');
      setDistQuantities(prev => ({ ...prev, [productId]: maxStock }));
      return;
    }
    setDistQuantities(prev => ({ ...prev, [productId]: num }));
  };

  const handleSubmitDistributionReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedManifest) { showMessage("Please select an active manifest.", "error"); return; }

    const itemsToSubmit = manifestProducts.filter(item => {
      const q = Number(distQuantities[item.product_id]);
      return !isNaN(q) && q > 0;
    });

    if (itemsToSubmit.length === 0) { showMessage("Enter a distributed quantity > 0.", "error"); return; }

    setIsSubmitting(true);
    try {
      const { data: distHeader, error: distErr } = await supabase
        .from('distributions')
        .insert([{
          distribution_point_id: selectedManifest.distribution_point_id, 
          manifest_id: selectedManifest.id,
          distribution_date: distDate, 
          distribution_type: 'MIXED', 
          remarks: remarks || null,
          created_by: currentUser?.id || null, 
          created_by_email: currentUser?.email || null
        }]).select().single();

      if (distErr) throw distErr;

      const distRefCode = `DIST-${distHeader.id.split('-')[0].toUpperCase()}`;
      const distItemsPayload = [];
      const ledgerPayload = [];
      const connectedWhIds = [selectedManifest.dp?.nfi_warehouse_id, selectedManifest.dp?.lpg_warehouse_id].filter(Boolean);

      const entryDateTime = new Date(distDate);
      entryDateTime.setHours(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds());

      for (const item of itemsToSubmit) {
        const distQty = Number(distQuantities[item.product_id]);
        const currentWhStock = whStockMap[item.product_id] || 0;
        const currentManifestDist = Number(item.distributed_qty) || 0;

        // Dynamically find which warehouse holds the stock
        const { data: invFind } = await supabase.from('inventory')
          .select('warehouse_id')
          .in('warehouse_id', connectedWhIds)
          .eq('product_id', item.product_id)
          .order('quantity', { ascending: false })
          .limit(1);

        const targetWhId = (invFind && invFind.length > 0) ? invFind[0].warehouse_id : selectedManifest.dp?.nfi_warehouse_id;

        if (!targetWhId) {
          throw new Error(`Missing connected warehouse for ${item.products?.name}. Please map warehouses to this DP first.`);
        }

        distItemsPayload.push({ distribution_id: distHeader.id, product_id: item.product_id, quantity: distQty });

        await supabase.from('manifest_items').update({ distributed_qty: currentManifestDist + distQty }).eq('id', item.id);
        
        await supabase.from('inventory').update({ quantity: Math.max(0, currentWhStock - distQty), last_updated: new Date().toISOString() })
          .match({ warehouse_id: targetWhId, product_id: item.product_id });

        ledgerPayload.push({
          warehouse_id: targetWhId, product_id: item.product_id, transaction_type: 'OUT',
          quantity: distQty, reference_no: distRefCode, 
          remarks: `Distribution at ${selectedManifest.dp?.name} | Manifest: ${selectedManifest.manifest_code}`,
          created_by: currentUser?.id, created_by_email: currentUser?.email, created_at: entryDateTime.toISOString()
        });
      }

      await supabase.from('distribution_items').insert(distItemsPayload);
      await supabase.from('inventory_transactions').insert(ledgerPayload);

      showMessage(`Distribution Report (${distRefCode}) submitted!`, "success");
      setRemarks('');
      await handleSelectManifest(selectedManifest);
      const allowedDpIds = assignedDps.map(d => d.id);
      await fetchDistributionHistory(allowedDpIds, assignedDps, distDate);
    } catch (err: any) {
      showMessage(`Submission failed: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = async (dist: any) => {
    setDistToEdit(dist);
    setEditRemarks(dist.remarks || '');
    setEditModalOpen(true);
    
    const qtys: Record<string, number> = {};
    const maxStocks: Record<string, number> = {};
    const connectedWhIds = [dist.dp?.nfi_warehouse_id, dist.dp?.lpg_warehouse_id].filter(Boolean);

    for (const item of dist.distribution_items) {
      qtys[item.product_id] = item.quantity;
      
      if (connectedWhIds.length > 0) {
        const { data: invItem } = await supabase.from('inventory')
          .select('quantity')
          .in('warehouse_id', connectedWhIds)
          .eq('product_id', item.product_id)
          .order('quantity', { ascending: false })
          .limit(1);
          
        const currentStock = (invItem && invItem.length > 0) ? Number(invItem[0].quantity) : 0;
        maxStocks[item.product_id] = currentStock + item.quantity;
      } else {
        maxStocks[item.product_id] = item.quantity;
      }
    }
    setEditQtys(qtys);
    setEditMaxStocks(maxStocks);
  };

  const handleSaveEditDistribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!distToEdit) return;
    setIsSubmitting(true);
    
    try {
      const distRefCode = `DIST-${distToEdit.id.split('-')[0].toUpperCase()}`;
      const connectedWhIds = [distToEdit.dp?.nfi_warehouse_id, distToEdit.dp?.lpg_warehouse_id].filter(Boolean);

      for (const item of distToEdit.distribution_items) {
        const newQty = Number(editQtys[item.product_id] || 0);
        const oldQty = Number(item.quantity);
        const diff = newQty - oldQty;

        const { data: invFind } = await supabase.from('inventory')
          .select('warehouse_id')
          .in('warehouse_id', connectedWhIds)
          .eq('product_id', item.product_id)
          .order('quantity', { ascending: false })
          .limit(1);
          
        const targetWhId = (invFind && invFind.length > 0) ? invFind[0].warehouse_id : distToEdit.dp?.nfi_warehouse_id;

        if (diff !== 0 && targetWhId) {
          // 1. Update manifest_items progress
          const { data: mItem } = await supabase.from('manifest_items').select('id, distributed_qty').eq('manifest_id', distToEdit.manifest_id).eq('product_id', item.product_id).single();
          if (mItem) {
            await supabase.from('manifest_items').update({ distributed_qty: Math.max(0, (Number(mItem.distributed_qty) || 0) + diff) }).eq('id', mItem.id);
          }

          // 2. Adjust Warehouse Inventory
          const { data: invItem } = await supabase.from('inventory').select('id, quantity').eq('warehouse_id', targetWhId).eq('product_id', item.product_id).single();
          if (invItem) {
            const updatedStock = Number(invItem.quantity) - diff;
            if (updatedStock < 0) throw new Error(`Not enough stock to increase distribution for ${item.products?.name}`);
            await supabase.from('inventory').update({ quantity: updatedStock, last_updated: new Date().toISOString() }).eq('id', invItem.id);
          }

          // 3. Update distribution_items table
          await supabase.from('distribution_items').update({ quantity: newQty }).eq('id', item.id);

          // 4. Update inventory_transactions ledger
          const { data: txn } = await supabase.from('inventory_transactions').select('id').eq('reference_no', distRefCode).eq('product_id', item.product_id).eq('transaction_type', 'OUT').single();
          if (txn) {
            await supabase.from('inventory_transactions').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', txn.id);
          }
        }
      }

      await supabase.from('distributions').update({ remarks: editRemarks, updated_at: new Date().toISOString() }).eq('id', distToEdit.id);
      
      showMessage(`Distribution Report updated successfully!`, "success");
      setEditModalOpen(false);
      if (selectedManifest) await handleSelectManifest(selectedManifest);
      const allowedDpIds = assignedDps.map(d => d.id);
      await fetchDistributionHistory(allowedDpIds, assignedDps, distDate);

    } catch (err: any) {
      showMessage(`Edit failed: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmRevertDistribution = async () => {
    if (!distToRevert) return;
    setIsSubmitting(true);
    try {
      const distRefCode = `DIST-${distToRevert.id.split('-')[0].toUpperCase()}`;
      const connectedWhIds = [distToRevert.dp?.nfi_warehouse_id, distToRevert.dp?.lpg_warehouse_id].filter(Boolean);

      if (distToRevert.distribution_items && distToRevert.distribution_items.length > 0) {
        for (const dItem of distToRevert.distribution_items) {
          
          const { data: invFind } = await supabase.from('inventory')
            .select('warehouse_id')
            .in('warehouse_id', connectedWhIds)
            .eq('product_id', dItem.product_id)
            .order('quantity', { ascending: false })
            .limit(1);

          const targetWhId = (invFind && invFind.length > 0) ? invFind[0].warehouse_id : distToRevert.dp?.nfi_warehouse_id;

          const { data: mItem } = await supabase.from('manifest_items').select('id, distributed_qty').eq('manifest_id', distToRevert.manifest_id).eq('product_id', dItem.product_id).single();
          if (mItem) await supabase.from('manifest_items').update({ distributed_qty: Math.max(0, (Number(mItem.distributed_qty) || 0) - Number(dItem.quantity)) }).eq('id', mItem.id);

          if (targetWhId) {
            const { data: invItem } = await supabase.from('inventory').select('id, quantity').eq('warehouse_id', targetWhId).eq('product_id', dItem.product_id).single();
            if (invItem) await supabase.from('inventory').update({ quantity: Number(invItem.quantity) + Number(dItem.quantity) }).eq('id', invItem.id);
          }
        }
      }

      await supabase.from('inventory_transactions').delete().eq('reference_no', distRefCode).eq('transaction_type', 'OUT');
      await supabase.from('distributions').delete().eq('id', distToRevert.id);

      showMessage(`Distribution deleted! Stock restored.`, "success");
      setRevertModalOpen(false);
      setDistToRevert(null);
      if (selectedManifest) await handleSelectManifest(selectedManifest);
      const allowedDpIds = assignedDps.map(d => d.id);
      await fetchDistributionHistory(allowedDpIds, assignedDps, distDate);
    } catch (err: any) {
      showMessage(`Failed to delete: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredLeftManifests = activeManifests.filter(m => leftDpFilter === 'ALL' ? true : m.distribution_point_id === leftDpFilter);
  const filteredRightProducts = manifestProducts.filter(item => {
    const q = rightProductSearch.toLowerCase();
    return (item.products?.name || '').toLowerCase().includes(q) || (item.products?.code || '').toLowerCase().includes(q);
  });
  
  const filteredHistory = history.filter(d => {
    const matchDp = filterDpId === 'ALL' ? true : d.distribution_point_id === filterDpId;
    const matchDate = filterDate ? d.distribution_date === filterDate : true;
    const q = filterProductSearch.toLowerCase().trim();
    const matchProduct = !q ? true : ((d.manifests?.title || '').toLowerCase().includes(q) || (d.manifests?.manifest_code || '').toLowerCase().includes(q) || d.distribution_items?.some((item: any) => (item.products?.name || '').toLowerCase().includes(q) || (item.products?.code || '').toLowerCase().includes(q)));
    return matchDp && matchDate && matchProduct;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 relative">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center justify-between px-4 md:px-6 shrink-0 shadow-sm z-20">
        <div className="flex items-center">
          <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">Batch Distribution Entry</h2>
            <p className="text-xs md:text-sm text-slate-500 hidden sm:block">Submit end-of-day distribution quantities against active manifests</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 pr-12 md:pr-14">
          <span className="hidden md:inline-flex items-center px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold">
            🏕️ Assigned Camps: {assignedDps.length}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        
        {msg.text && (
          <div className={`p-4 rounded-xl shadow-lg border text-sm font-bold animate-in slide-in-from-top-2 flex justify-between items-center shrink-0 fixed top-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="flex items-center"><span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}</span>
            <button onClick={() => setMsg({text:'', type:''})} className="p-1 rounded-md hover:bg-black/5"><Icons.Close /></button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* LEFT PANE */}
          <div className="xl:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[620px] overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-sm uppercase flex items-center"><Icons.Manifest /> <span className="ml-2">1. Active Manifests</span></h3>
                <p className="text-[11px] text-slate-300 mt-0.5">Select a manifest to input today&apos;s distribution</p>
              </div>
              <span className="bg-indigo-500 text-white text-xs font-extrabold px-2.5 py-1 rounded-full">{filteredLeftManifests.length}</span>
            </div>
            <div className="p-3 bg-slate-50 border-b border-slate-200 shrink-0">
              <select value={leftDpFilter} onChange={(e) => setLeftDpFilter(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500">
                <option value="ALL">All Assigned Distribution Points</option>
                {assignedDps.map(dp => <option key={dp.id} value={dp.id}>[{dp.code}] {dp.name}</option>)}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar bg-slate-50/50">
              {isLoading ? (
                <div className="p-10 text-center"><Icons.Spinner /></div>
              ) : filteredLeftManifests.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs font-medium border-2 border-dashed border-slate-200 rounded-xl m-2">
                  No active manifests found.
                </div>
              ) : (
                filteredLeftManifests.map(m => {
                  const isSelected = selectedManifest?.id === m.id;
                  return (
                    <div key={m.id} onClick={() => handleSelectManifest(m)} className={`p-4 rounded-xl border transition-all cursor-pointer select-none relative ${isSelected ? 'bg-indigo-50/80 border-indigo-500 shadow-md ring-2 ring-indigo-500/20' : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'}`}>
                      {m.isSubmittedToday && (
                        <div className="absolute -top-2 -right-2 bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-emerald-200 shadow-sm flex items-center">
                          <span className="mr-1">✅</span> Submitted Today
                        </div>
                      )}
                      <div className="flex justify-between items-start gap-2">
                        <div className="truncate">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">{m.manifest_type || 'MIXED'}</span>
                          <h4 className="font-bold text-slate-900 text-sm mt-1.5 truncate">{m.title}</h4>
                        </div>
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex flex-col gap-1 text-[11px]">
                        <div className="flex justify-between text-slate-600"><span className="font-semibold text-slate-400 uppercase text-[10px]">Camp / DP:</span><span className="font-bold text-slate-800 truncate">{m.dp?.name}</span></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT PANE */}
          <form onSubmit={handleSubmitDistributionReport} className="xl:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[620px] overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-sm uppercase">2. Assigned Products & Stock Input</h3>
                {selectedManifest ? (
                  <p className="text-xs text-slate-600 mt-0.5">Manifest: <strong className="text-indigo-700">{selectedManifest.title}</strong></p>
                ) : <p className="text-xs text-slate-400 mt-0.5">Select an active manifest to load products</p>}
              </div>
              <div className="flex items-center space-x-3 shrink-0">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Distribution Date</label>
                  <input type="date" value={distDate} onChange={(e) => setDistDate(e.target.value)} required className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Search Product</label>
                  <input type="text" placeholder="Filter items..." value={rightProductSearch} onChange={(e) => setRightProductSearch(e.target.value)} disabled={!selectedManifest} className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 w-36 sm:w-44 disabled:bg-slate-100" />
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {!selectedManifest ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center"><span className="text-4xl mb-3 opacity-50">📋</span><p className="text-sm font-bold text-slate-600">No Active Manifest Selected</p></div>
              ) : isLoadingItems ? (
                <div className="h-full flex items-center justify-center p-10"><Icons.Spinner /></div>
              ) : filteredRightProducts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center"><p className="text-sm font-bold text-slate-600">No products assigned to this manifest.</p></div>
              ) : (
                <table className="w-full text-left border-collapse table-auto">
                  <thead className="bg-slate-100/80 border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase w-12 text-center">SL</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Product Details</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-center">Progress</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-indigo-600 uppercase text-right">WH Stock</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-indigo-700 uppercase text-right w-44">Input Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRightProducts.map((item, idx) => {
                      const availStock = whStockMap[item.product_id] || 0;
                      const isTargetless = Number(item.target_qty) === 0;
                      const prevDist = Number(item.distributed_qty) || 0;
                      const remainingTarget = isTargetless ? 'Open' : Math.max(0, Number(item.target_qty) - prevDist);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3.5 text-center"><span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md border">{idx + 1}</span></td>
                          <td className="px-4 py-3.5">
                            <p className="font-bold text-slate-900 text-sm">{item.products?.name}</p>
                            <div className="flex items-center space-x-2 mt-0.5">
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${item.products?.product_type === 'LPG' ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                                {item.products?.product_type || 'NFI'}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500">Code: {item.products?.code} • {item.products?.unit_type}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {isTargetless ? <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full border">Done: {prevDist}</span> : (
                              <div className="inline-flex flex-col items-center"><span className="text-xs font-bold text-slate-800">{prevDist} / {item.target_qty}</span><span className="text-[10px] text-indigo-600 font-bold">Rem: {remainingTarget}</span></div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right"><span className={`text-base font-black ${availStock > 0 ? 'text-indigo-600' : 'text-rose-500'}`}>{availStock.toLocaleString()}</span></td>
                          <td className="px-4 py-3.5 text-right">
                            <input type="number" min="0" max={availStock} disabled={availStock <= 0} value={distQuantities[item.product_id] ?? ''} onChange={(e) => handleQtyChange(item.product_id, e.target.value, availStock)} placeholder={availStock > 0 ? "0" : "No Stock"} className="w-full text-right px-3 py-2 bg-indigo-50/40 border border-indigo-300 rounded-xl text-sm font-black text-indigo-800 outline-none focus:border-indigo-600 focus:bg-white disabled:bg-slate-100 disabled:border-slate-200 transition-all" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center gap-3 shrink-0">
              <div className="w-full sm:flex-1"><input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Daily Summary Note (e.g., Total 120 HH served today)..." className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" /></div>
              <button type="submit" disabled={isSubmitting || !selectedManifest || manifestProducts.length === 0} className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md transition-all flex items-center justify-center shrink-0 disabled:opacity-50">
                {isSubmitting ? <><Icons.Spinner /> Submitting...</> : 'Confirm & Submit Distribution'}
              </button>
            </div>
          </form>
        </div>

        {/* BOTTOM SECTION */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div><h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Submitted Reports</h3></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:flex items-end gap-3">
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Distribution Point</label><select value={filterDpId} onChange={(e) => setFilterDpId(e.target.value)} className="w-full lg:w-40 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"><option value="ALL">All DPs</option>{assignedDps.map(dp => <option key={dp.id} value={dp.id}>{dp.name}</option>)}</select></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Date</label><input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-full lg:w-36 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" /></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Search Product / Manifest</label><input type="text" placeholder="Search..." value={filterProductSearch} onChange={(e) => setFilterProductSearch(e.target.value)} className="w-full lg:w-48 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" /></div>
            </div>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse table-auto min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase">Date & Report ID</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase">Distribution Point</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase">Manifest</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase text-right">Distributed Products</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase text-right w-36">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={5} className="p-10 text-center"><Icons.Spinner /></td></tr>
                ) : filteredHistory.length === 0 ? (
                  <tr><td colSpan={5} className="p-10 text-center text-sm text-slate-500 font-medium">No distribution reports found.</td></tr>
                ) : (
                  filteredHistory.map((d, index) => {
                    const distId = `DIST-${d.id.split('-')[0].toUpperCase()}`;
                    return (
                      <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4 align-top">
                          <p className="font-bold text-slate-900 text-sm">{new Date(d.distribution_date).toLocaleDateString()}</p>
                          <p className="text-[10px] font-mono font-bold text-indigo-600 mt-0.5">{distId}</p>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <p className="font-bold text-slate-900 text-sm">{d.dp?.name}</p>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <p className="font-bold text-slate-800 text-sm">{d.manifests?.title || 'N/A'}</p>
                          <p className="text-[10px] font-mono text-slate-500 mt-0.5">{d.manifests?.manifest_code}</p>
                        </td>
                        <td className="px-5 py-4 align-top text-right space-y-1">
                          {d.distribution_items?.map((item: any) => (
                            <div key={item.id} className="text-xs flex items-center justify-end space-x-2">
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${item.products?.product_type === 'LPG' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>{item.products?.product_type || 'NFI'}</span>
                              <span className="font-bold text-slate-800">{item.products?.name}</span>
                              <span className="font-black text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">{item.quantity}</span>
                            </div>
                          ))}
                        </td>
                        <td className="px-5 py-4 align-top text-right">
                          <div className="flex justify-end items-center space-x-2">
                            <button onClick={() => openEditModal(d)} className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100" title="Edit Quantity"><Icons.Edit /></button>
                            <button onClick={() => { setDistToRevert(d); setRevertModalOpen(true); }} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100" title="Delete & Restore"><Icons.Trash /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- EDIT DISTRIBUTION MODAL --- */}
      {editModalOpen && distToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900">Edit Distribution Report</h3>
                <p className="text-[10px] text-indigo-600 font-mono font-bold mt-1">DIST-{distToEdit.id.split('-')[0].toUpperCase()}</p>
              </div>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200"><Icons.Close /></button>
            </div>
            
            <form onSubmit={handleSaveEditDistribution} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Distributed Items</label>
                 <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                    {distToEdit.distribution_items?.map((item: any) => (
                      <div key={item.id} className="flex justify-between items-center text-sm border-b border-slate-200 pb-3 mb-3 last:border-0 last:pb-0 last:mb-0">
                         <div className="pr-2">
                           <span className="font-bold text-slate-800 block text-sm">{item.products?.name}</span>
                           <span className="text-[10px] font-bold text-slate-500 uppercase mt-0.5 block">
                             Max Available: <span className="text-indigo-600 font-black">{editMaxStocks[item.product_id] || 0}</span> {item.products?.unit_type}
                           </span>
                         </div>
                         <div className="flex items-center space-x-2 shrink-0">
                           <input 
                             type="number" min="0" max={editMaxStocks[item.product_id] || 0}
                             value={editQtys[item.product_id] ?? ''}
                             onChange={(e) => {
                               const val = e.target.value === '' ? '' : Number(e.target.value);
                               setEditQtys(prev => ({ ...prev, [item.product_id]: val }));
                             }}
                             required
                             className="w-16 text-right px-2 py-1.5 bg-white border border-slate-300 rounded-md text-sm font-bold text-indigo-700 outline-none focus:border-indigo-500 transition-all"
                           />
                         </div>
                      </div>
                    ))}
                 </div>
               </div>

               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Remarks / Note</label>
                 <input type="text" value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 transition-colors" />
               </div>
               
               <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-md flex justify-center items-center mt-2 disabled:opacity-50">
                 {isSubmitting ? <><Icons.Spinner /> Saving...</> : 'Save & Adjust Balance'}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* --- REVERT MODAL --- */}
      {revertModalOpen && distToRevert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-5 border-b border-rose-100 bg-rose-50 flex justify-between items-center">
              <h3 className="font-bold text-rose-900">Delete Distribution Report?</h3>
              <button onClick={() => setRevertModalOpen(false)} className="text-rose-400 hover:text-rose-700 bg-white p-1.5 rounded-lg border border-rose-200"><Icons.Close /></button>
            </div>
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">🗑️</div>
              <h4 className="text-base font-bold text-slate-900 mb-2">Delete & Restore Stock?</h4>
              <p className="text-xs text-slate-600 mb-6 leading-relaxed">Deleting this report will return all distributed quantities back to the warehouse and deduct them from the manifest progress.</p>
              <button onClick={confirmRevertDistribution} disabled={isSubmitting} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl shadow-md transition-all flex justify-center items-center text-sm">
                 {isSubmitting ? <><Icons.Spinner /> Deleting...</> : 'Yes, Delete & Restore Stock'}
              </button>
              <button onClick={() => setRevertModalOpen(false)} className="w-full bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold py-2.5 rounded-xl mt-2.5 text-xs transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}