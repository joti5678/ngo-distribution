"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from './../../components/Icons';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// Dynamic Theme Colors for Manifests
const MANIFEST_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', numBg: 'bg-blue-200/50', active: 'bg-blue-500' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', numBg: 'bg-emerald-200/50', active: 'bg-emerald-500' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', numBg: 'bg-amber-200/50', active: 'bg-amber-500' },
  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', numBg: 'bg-purple-200/50', active: 'bg-purple-500' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900', numBg: 'bg-rose-200/50', active: 'bg-rose-500' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-900', numBg: 'bg-cyan-200/50', active: 'bg-cyan-500' },
];

export default function DailyDistributionReportPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [distributionPoints, setDistributionPoints] = useState<any[]>([]);
  
  // Left Panel States
  const [activeManifests, setActiveManifests] = useState<any[]>([]);
  const [leftDpFilter, setLeftDpFilter] = useState('ALL');
  
  // Right Panel Data
  const [allManifestItems, setAllManifestItems] = useState<any[]>([]);
  const [whStockMap, setWhStockMap] = useState<Record<string, number>>({});
  
  // Input State mapping: key = manifestId_productId
  const [inputs, setInputs] = useState<Record<string, { qty: number | '', hh: number | '' }>>({});
  const [distDate, setDistDate] = useState('');
  const [remarks, setRemarks] = useState('');
  
  // Bottom List States
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [filterDpId, setFilterDpId] = useState('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [distToEdit, setDistToEdit] = useState<any>(null);
  const [editValues, setEditValues] = useState<Record<string, { qty: number | '', hh: number | '' }>>({});
  const [editMaxStocks, setEditMaxStocks] = useState<Record<string, number>>({}); // Mapped by product_id now
  const [editRemarks, setEditRemarks] = useState('');

  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [txnToRevert, setTxnToRevert] = useState<any>(null);

  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsData, setDetailsData] = useState<any>(null);

  useEffect(() => {
    // Timezone safe date
    const today = new Date();
    const dateStr = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    setDistDate(dateStr);
    initData();
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterDpId, filterStartDate, filterEndDate, tableSearch]);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4500);
    if(type === 'error') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const initData = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUser(user);

    const { data: dps } = await supabase.from('distribution_points').select('*').order('name');
    if (dps) setDistributionPoints(dps);

    await loadManifestsAndData(dps || []);
    setIsLoading(false);
  };

  const loadManifestsAndData = async (dps: any[]) => {
    const { data: mData } = await supabase.from('manifests')
      .select('*, dp:distribution_points(*)')
      .eq('status', 'Active')
      .order('created_at', { ascending: false });

    // Timezone-safe date check for Active Manifests
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    const validManifests = (mData || []).filter(m => {
      if (!m.valid_to) return true;
      const [year, month, day] = m.valid_to.split('-');
      const validToDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      validToDate.setHours(0, 0, 0, 0);
      return validToDate >= todayDate;
    });

    setActiveManifests(validManifests);

    const manifestIds = validManifests.map(m => m.id);
    
    if (manifestIds.length > 0) {
      const { data: mItems } = await supabase.from('manifest_items')
        .select(`id, target_qty, distributed_qty, manifest_id, product_id, products (id, name, code, unit_type, product_type)`)
        .in('manifest_id', manifestIds);
      
      const items = mItems || [];
      setAllManifestItems(items);

      const initInputs: Record<string, { qty: number | '', hh: number | '' }> = {};
      items.forEach((item: any) => {
        initInputs[`${item.manifest_id}_${item.product_id}`] = { qty: '', hh: '' };
      });
      setInputs(initInputs);

      const { data: invData } = await supabase.from('inventory').select('warehouse_id, product_id, quantity');
      const stockMap: Record<string, number> = {};
      invData?.forEach(inv => {
          stockMap[`${inv.warehouse_id}_${inv.product_id}`] = Number(inv.quantity) || 0;
      });
      setWhStockMap(stockMap);
    } else {
      setAllManifestItems([]);
      setInputs({});
    }

    const { data: hData } = await supabase.from('distributions')
      .select(`
        id, distribution_date, remarks, created_by_email, updated_by_email, updated_at, created_at,
        distribution_points (id, name, code, nfi_warehouse_id, lpg_warehouse_id),
        distribution_items (
          id, quantity, total_hh, product_id, manifest_id,
          products (name, code, unit_type, product_type),
          manifests (title, manifest_code)
        )
      `)
      .order('distribution_date', { ascending: false })
      .order('created_at', { ascending: false });

    setHistoryItems(hData || []);
  };

  const handleQtyChange = (manifestId: string, productId: string, val: string, maxStock: number) => {
    const key = `${manifestId}_${productId}`;
    const prevHH = inputs[key]?.hh;
    const prevQty = inputs[key]?.qty;

    if (val === '') { 
      setInputs(prev => ({ ...prev, [key]: { qty: '', hh: '' } })); 
      return; 
    }
    
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0) return;
    
    if (num > maxStock) {
      showMessage(`Distributed Quantity exceeds available warehouse stock (${maxStock})!`, 'error');
      return;
    }

    // Auto-fill HH if it was empty or matched the previous quantity
    let newHH = prevHH;
    if (prevHH === '' || prevHH === prevQty) {
      newHH = num;
    }

    setInputs(prev => ({ ...prev, [key]: { qty: num, hh: newHH } }));
  };

  const handleHHChange = (manifestId: string, productId: string, val: string) => {
    const key = `${manifestId}_${productId}`;
    if (val === '') { 
      setInputs(prev => ({ ...prev, [key]: { ...prev[key], hh: '' } })); 
      return; 
    }
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0) return;
    setInputs(prev => ({ ...prev, [key]: { ...prev[key], hh: num } }));
  };

  const handleSubmitAll = async () => {
    const dpGroups: Record<string, { dp: any, payloads: any[] }> = {};
    
    filteredLeftManifests.forEach(manifest => {
      const items = allManifestItems.filter(i => i.manifest_id === manifest.id);
      const validItems = items.filter(item => {
         const key = `${manifest.id}_${item.product_id}`;
         const q = Number(inputs[key]?.qty);
         return !isNaN(q) && q > 0;
      });
      
      if (validItems.length > 0) {
        if (!dpGroups[manifest.distribution_point_id]) {
          dpGroups[manifest.distribution_point_id] = { dp: manifest.dp, payloads: [] };
        }
        dpGroups[manifest.distribution_point_id].payloads.push({ manifest, items: validItems });
      }
    });

    const dpIdsToSubmit = Object.keys(dpGroups);
    if (dpIdsToSubmit.length === 0) {
      showMessage("Please enter at least one distributed quantity.", "error");
      return;
    }

    // ==========================================
    // OVERALL STOCK CAPACITY VALIDATION (Mock Deduction)
    // ==========================================
    const tempStockMap = { ...whStockMap };
    for (const dpId of dpIdsToSubmit) {
      const groupData = dpGroups[dpId];
      for (const payload of groupData.payloads) {
        const { manifest, items } = payload;
        for (const item of items) {
          const key = `${manifest.id}_${item.product_id}`;
          const distQty = Number(inputs[key].qty);
          if (distQty > 0) {
            const stockKey1 = `${manifest.dp?.nfi_warehouse_id}_${item.product_id}`;
            const stockKey2 = `${manifest.dp?.lpg_warehouse_id}_${item.product_id}`;
            
            let deducted = false;
            let remainingToDeduct = distQty;

            // Try deduct from warehouse 1
            if ((tempStockMap[stockKey1] || 0) >= remainingToDeduct) {
              tempStockMap[stockKey1] -= remainingToDeduct;
              remainingToDeduct = 0;
              deducted = true;
            } else if ((tempStockMap[stockKey1] || 0) > 0) {
              remainingToDeduct -= tempStockMap[stockKey1];
              tempStockMap[stockKey1] = 0;
            }

            // Try deduct from warehouse 2 if needed
            if (remainingToDeduct > 0 && (tempStockMap[stockKey2] || 0) >= remainingToDeduct) {
              tempStockMap[stockKey2] -= remainingToDeduct;
              remainingToDeduct = 0;
              deducted = true;
            }

            if (remainingToDeduct > 0) {
               // Capacity Exceeded!
               showMessage(`ERROR: Total input sum for ${item.products?.name} across manifests exceeds available warehouse stock! Please adjust quantities.`, "error");
               return; // Blocks execution
            }
          }
        }
      }
    }
    // ==========================================

    setIsSubmitting(true);
    try {
      const entryDateTime = new Date(distDate);
      entryDateTime.setHours(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds());

      for (const dpId of dpIdsToSubmit) {
        const groupData = dpGroups[dpId];
        
        const { data: distHeader, error: distErr } = await supabase.from('distributions').insert([{
          distribution_point_id: dpId, 
          distribution_date: distDate, 
          remarks: remarks || null,
          created_by: currentUser?.id || null, 
          created_by_email: currentUser?.email || null
        }]).select().single();

        if (distErr) throw distErr;
        const distRefCode = `DIST-${distHeader.id.split('-')[0].toUpperCase()}`;

        for (const payload of groupData.payloads) {
          const { manifest, items } = payload;
          const connectedWhIds = [manifest.dp?.nfi_warehouse_id, manifest.dp?.lpg_warehouse_id].filter(Boolean);

          for (const item of items) {
            const key = `${manifest.id}_${item.product_id}`;
            const distQty = Number(inputs[key].qty);
            const distHH = Number(inputs[key].hh) || 0; 

            const { data: invFind } = await supabase.from('inventory')
              .select('id, warehouse_id, quantity')
              .in('warehouse_id', connectedWhIds)
              .eq('product_id', item.product_id)
              .order('quantity', { ascending: false })
              .limit(1);

            const targetWh = (invFind && invFind.length > 0) ? invFind[0] : null;
            if (!targetWh) throw new Error(`Stock record missing for ${item.products?.name}`);

            const currentManifestDist = Number(item.distributed_qty) || 0;
            await supabase.from('manifest_items').update({ distributed_qty: currentManifestDist + distQty }).eq('id', item.id);
            
            await supabase.from('inventory').update({ quantity: Math.max(0, targetWh.quantity - distQty), last_updated: new Date().toISOString() }).eq('id', targetWh.id);

            await supabase.from('distribution_items').insert([{ 
              distribution_id: distHeader.id, 
              product_id: item.product_id, 
              manifest_id: manifest.id,
              quantity: distQty,
              total_hh: distHH
            }]);

            await supabase.from('inventory_transactions').insert([{
              warehouse_id: targetWh.warehouse_id, product_id: item.product_id, transaction_type: 'OUT',
              quantity: distQty, reference_no: distRefCode, 
              remarks: `Distributed at ${manifest.dp?.name} | MNF: ${manifest.manifest_code}`,
              created_by: currentUser?.id, created_by_email: currentUser?.email, created_at: entryDateTime.toISOString()
            }]);
          }
        }
      }

      showMessage(`Distribution submitted successfully!`, "success");
      setRemarks('');
      
      const initInputs: Record<string, { qty: number | '', hh: number | '' }> = {};
      allManifestItems.forEach((item: any) => {
        initInputs[`${item.manifest_id}_${item.product_id}`] = { qty: '', hh: '' };
      });
      setInputs(initInputs);

      await loadManifestsAndData(distributionPoints);

    } catch (err: any) {
      showMessage(`Submission failed: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = async (distTxn: any) => {
    setDistToEdit(distTxn);
    setEditRemarks(distTxn.remarks || '');
    
    const vals: any = {};
    const productTotals: Record<string, number> = {};
    
    for (const item of distTxn.distribution_items) {
      vals[item.id] = { qty: item.quantity, hh: item.total_hh };
      productTotals[item.product_id] = (productTotals[item.product_id] || 0) + item.quantity;
    }
    
    const maxStocks: Record<string, number> = {}; // Now mapped by product_id
    const connectedWhIds = [distTxn.distribution_points.nfi_warehouse_id, distTxn.distribution_points.lpg_warehouse_id].filter(Boolean);
    const uniqueProductIds = Object.keys(productTotals);

    if (uniqueProductIds.length > 0 && connectedWhIds.length > 0) {
      const { data: invData } = await supabase.from('inventory')
          .select('product_id, quantity')
          .in('warehouse_id', connectedWhIds)
          .in('product_id', uniqueProductIds);
      
      for (const pid of uniqueProductIds) {
          const currentStock = (invData || []).filter((i:any) => i.product_id === pid).reduce((sum:number, i:any) => sum + i.quantity, 0);
          maxStocks[pid] = currentStock + productTotals[pid];
      }
    } else {
      for (const pid of uniqueProductIds) maxStocks[pid] = productTotals[pid];
    }
    
    setEditValues(vals);
    setEditMaxStocks(maxStocks);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!distToEdit) return;
    
    // ==========================================
    // OVERALL STOCK CAPACITY VALIDATION (Edit)
    // ==========================================
    const newProductTotals: Record<string, number> = {};
    for (const item of distToEdit.distribution_items) {
        const newQty = Number(editValues[item.id]?.qty || 0);
        newProductTotals[item.product_id] = (newProductTotals[item.product_id] || 0) + newQty;
    }

    for (const pid of Object.keys(newProductTotals)) {
        if (newProductTotals[pid] > (editMaxStocks[pid] || 0)) {
            showMessage(`Total edit quantity for a product exceeds its Shared Max Qty (${editMaxStocks[pid]}).`, "error");
            return; // ABORT
        }
    }
    // ==========================================

    setIsSubmitting(true);
    try {
      const connectedWhIds = [distToEdit.distribution_points.nfi_warehouse_id, distToEdit.distribution_points.lpg_warehouse_id].filter(Boolean);
      const distRefCode = `DIST-${distToEdit.id.split('-')[0].toUpperCase()}`;

      // Sort items: process negative differences (returns to stock) first to prevent false Out-Of-Stock errors
      const sortedItems = [...distToEdit.distribution_items].sort((a, b) => {
        const diffA = Number(editValues[a.id]?.qty || 0) - Number(a.quantity);
        const diffB = Number(editValues[b.id]?.qty || 0) - Number(b.quantity);
        return diffA - diffB; 
      });

      for (const item of sortedItems) {
        const newQty = Number(editValues[item.id]?.qty || 0);
        const newHh = Number(editValues[item.id]?.hh || 0);
        const oldQty = Number(item.quantity);
        const diffQty = newQty - oldQty;

        if (diffQty !== 0) {
          const { data: invFind } = await supabase.from('inventory')
            .select('id, warehouse_id, quantity')
            .in('warehouse_id', connectedWhIds)
            .eq('product_id', item.product_id)
            .order('quantity', { ascending: false })
            .limit(1);
          
          if (!invFind || invFind.length === 0) throw new Error("Warehouse stock record missing.");
          const targetWh = invFind[0];

          const { data: mItem } = await supabase.from('manifest_items').select('id, distributed_qty').eq('manifest_id', item.manifest_id).eq('product_id', item.product_id).single();
          if (mItem) await supabase.from('manifest_items').update({ distributed_qty: Math.max(0, (Number(mItem.distributed_qty) || 0) + diffQty) }).eq('id', mItem.id);

          const updatedStock = targetWh.quantity - diffQty;
          if (updatedStock < 0) throw new Error(`Not enough stock for ${item.products.name}`);
          await supabase.from('inventory').update({ quantity: updatedStock, last_updated: new Date().toISOString() }).eq('id', targetWh.id);
          
          const { data: txn } = await supabase.from('inventory_transactions').select('id').eq('reference_no', distRefCode).eq('product_id', item.product_id).single();
          if (txn) await supabase.from('inventory_transactions').update({ quantity: newQty }).eq('id', txn.id);
        }

        await supabase.from('distribution_items').update({ quantity: newQty, total_hh: newHh }).eq('id', item.id);
      }

      await supabase.from('distributions').update({ remarks: editRemarks }).eq('id', distToEdit.id);
      
      showMessage(`Transaction updated successfully!`, "success");
      setEditModalOpen(false);
      await loadManifestsAndData(distributionPoints);

    } catch (err: any) {
      showMessage(`Edit failed: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevertTransaction = async () => {
    if (!txnToRevert) return;
    setIsSubmitting(true);
    try {
      const connectedWhIds = [txnToRevert.distribution_points.nfi_warehouse_id, txnToRevert.distribution_points.lpg_warehouse_id].filter(Boolean);
      const distRefCode = `DIST-${txnToRevert.id.split('-')[0].toUpperCase()}`;

      for (const item of txnToRevert.distribution_items) {
        const { data: invFind } = await supabase.from('inventory').select('id, quantity').in('warehouse_id', connectedWhIds).eq('product_id', item.product_id).order('quantity', { ascending: false }).limit(1);
        if (invFind && invFind.length > 0) {
          await supabase.from('inventory').update({ quantity: invFind[0].quantity + item.quantity }).eq('id', invFind[0].id);
        }

        const { data: mItem } = await supabase.from('manifest_items').select('id, distributed_qty').eq('manifest_id', item.manifest_id).eq('product_id', item.product_id).single();
        if (mItem) {
           await supabase.from('manifest_items').update({ distributed_qty: Math.max(0, (Number(mItem.distributed_qty) || 0) - item.quantity) }).eq('id', mItem.id);
        }
      }

      await supabase.from('inventory_transactions').delete().eq('reference_no', distRefCode);
      await supabase.from('distributions').delete().eq('id', txnToRevert.id);

      showMessage(`Entire transaction deleted & stock restored.`, "success");
      setRevertModalOpen(false);
      await loadManifestsAndData(distributionPoints);
    } catch (err: any) {
      showMessage(`Delete failed: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredLeftManifests = activeManifests.filter(m => leftDpFilter === 'ALL' ? true : m.distribution_point_id === leftDpFilter);
  
  const filteredHistory = historyItems.filter(dist => {
    const matchDp = filterDpId === 'ALL' ? true : dist.distribution_points.id === filterDpId;
    
    let matchDate = true;
    if (filterStartDate && filterEndDate) {
      matchDate = dist.distribution_date >= filterStartDate && dist.distribution_date <= filterEndDate;
    } else if (filterStartDate) {
      matchDate = dist.distribution_date >= filterStartDate;
    } else if (filterEndDate) {
      matchDate = dist.distribution_date <= filterEndDate;
    }

    const q = tableSearch.toLowerCase();
    const matchSearch = q ? dist.distribution_items.some((item: any) => 
      item.products.name.toLowerCase().includes(q) || 
      item.manifests?.title.toLowerCase().includes(q) ||
      dist.id.toLowerCase().includes(q)
    ) : true;
    
    return matchDp && matchDate && matchSearch;
  });

  const totalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE);
  const paginatedHistory = filteredHistory.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleExportExcel = () => {
    const exportData: any[] = [];
    filteredHistory.forEach(dist => {
      const distRefCode = `DIST-${dist.id.split('-')[0].toUpperCase()}`;
      const dateStr = new Date(dist.distribution_date).toLocaleDateString();
      dist.distribution_items.forEach((item: any) => {
        exportData.push({
          "Date": dateStr,
          "System TXN ID": distRefCode,
          "Distribution Point": dist.distribution_points.name,
          "Manifest Name": item.manifests?.title || 'Unknown',
          "Product Name": item.products.name,
          "Product Code": item.products.code,
          "Distributed Quantity": item.quantity,
          "Total HH": item.total_hh || 0,
          "Unit": item.products.unit_type,
          "User Name": dist.created_by_email || 'System'
        });
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Distribution_History");
    XLSX.writeFile(workbook, `Distribution_History_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    let dateRangeText = 'All Time';
    if (filterStartDate && filterEndDate) dateRangeText = `${filterStartDate} to ${filterEndDate}`;
    else if (filterStartDate) dateRangeText = `From ${filterStartDate}`;
    else if (filterEndDate) dateRangeText = `Until ${filterEndDate}`;

    let dpNameText = filterDpId === 'ALL' ? 'All Assigned Camps' : distributionPoints.find(d => d.id === filterDpId)?.name || '';

    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(`Distribution History - ${dpNameText}`, 14, 15);
    
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Period: ${dateRangeText} | Generated on: ${new Date().toLocaleString()}`, 14, 21);
    
    const tableColumn = ["Date", "TXN ID", "Distribution Point", "Manifest Name", "Product Name", "Code", "Dist. Qty", "Total HH", "Unit", "User Name"];
    const tableRows: any[] = [];

    filteredHistory.forEach(dist => {
      const distRefCode = `DIST-${dist.id.split('-')[0].toUpperCase()}`;
      const dateStr = new Date(dist.distribution_date).toLocaleDateString();
      dist.distribution_items.forEach((item: any) => {
        tableRows.push([
          dateStr,
          distRefCode,
          dist.distribution_points.name,
          item.manifests?.title || 'Unknown',
          item.products.name,
          item.products.code,
          item.quantity,
          item.total_hh || 0,
          item.products.unit_type,
          dist.created_by_email || 'System'
        ]);
      });
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 26,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [15, 23, 42], overflow: 'linebreak' },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', lineWidth: 0.2 },
      columnStyles: {
        6: { halign: 'center', fontStyle: 'bold', textColor: [5, 150, 105] },
        7: { halign: 'center', fontStyle: 'bold', textColor: [79, 70, 229] } 
      }
    });

    doc.save(`Distribution_History_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="flex flex-col min-h-screen flex-1 bg-slate-50 w-full animate-in fade-in duration-500 relative">
      
      {/* Header */}
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 shadow-sm z-20 sticky top-0">
        <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-900 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Daily Distribution Report</h2>
          <p className="text-xs md:text-sm text-slate-600 hidden sm:block">Submit end-of-day quantities against active manifests</p>
        </div>
      </header>

      <div className="flex-1 p-4 md:p-6 space-y-6">
        
        {msg.text && (
          <div className={`p-4 rounded-xl shadow-lg border text-sm font-bold animate-in slide-in-from-top-2 flex justify-between items-center fixed top-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md ${msg.type === 'error' ? 'bg-rose-50 text-slate-900 border-rose-200' : 'bg-emerald-50 text-slate-900 border-emerald-200'}`}>
            <span>{msg.type === 'error' ? '⚠️' : '✅'} {msg.text}</span>
            <button onClick={() => setMsg({text:'', type:''})} className="hover:bg-slate-200 rounded p-1 text-slate-900"><Icons.Close /></button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* LEFT PANE */}
          <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
            <div className="p-3 border-b border-slate-200 bg-slate-900 text-white flex justify-between items-center shrink-0 rounded-t-2xl">
              <h3 className="font-bold text-xs uppercase flex items-center"><Icons.Manifest /> <span className="ml-1">1. Active Manifests</span></h3>
              <span className="bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{filteredLeftManifests.length}</span>
            </div>
            <div className="p-2 bg-slate-50 border-b border-slate-200 shrink-0">
              <select value={leftDpFilter} onChange={(e) => setLeftDpFilter(e.target.value)} className="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-500">
                <option value="ALL">All Distribution Points</option>
                {distributionPoints.map(dp => <option key={dp.id} value={dp.id}>[{dp.code}] {dp.name}</option>)}
              </select>
            </div>
            
            <div className="p-2 space-y-2 bg-slate-50/50 rounded-b-2xl max-h-[600px] overflow-y-auto custom-scrollbar">
              {isLoading ? (
                <div className="p-6 text-center"><Icons.Spinner /></div>
              ) : filteredLeftManifests.length === 0 ? (
                <div className="p-6 text-center text-slate-900 text-xs font-bold border-2 border-dashed border-slate-200 rounded-xl m-1">No active manifests found.</div>
              ) : (
                filteredLeftManifests.map((m, idx) => {
                  const theme = MANIFEST_COLORS[idx % MANIFEST_COLORS.length];
                  return (
                    <div key={m.id} className={`p-3 rounded-xl border ${theme.bg} ${theme.border} shadow-sm relative flex flex-col`}>
                      <div className="flex justify-between items-start mb-1.5">
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200 shadow-sm inline-block`}>
                          {m.manifest_type || 'MIXED'}
                        </span>
                        <span className={`text-[10px] font-black ${theme.numBg} ${theme.text} px-2 py-0.5 rounded-full`}>#{idx + 1}</span>
                      </div>
                      
                      <div className="flex items-start">
                        {/* Common Green Blinking Dot */}
                        <div title="Active Manifest" className="relative flex h-2.5 w-2.5 mr-2 mt-1.5 shrink-0 cursor-help">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className={`font-bold ${theme.text} text-sm break-words whitespace-normal leading-tight`}>
                            {m.title}
                          </h4>
                        </div>
                      </div>
                      
                      <p className="text-[10px] text-slate-600 mt-2 font-semibold break-words whitespace-normal bg-white px-2 py-1 rounded-md border border-slate-200 inline-block self-start">
                        {m.dp?.name}
                      </p>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* RIGHT PANE */}
          <div className="xl:col-span-9 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
            
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-slate-900 text-sm uppercase">2. Input Daily Distribution</h3>
                <p className="text-[10px] text-slate-600 mt-0.5 font-bold">Submit distributed items & Total HH for all active manifests</p>
              </div>
              <div className="flex space-x-2 shrink-0">
                <input type="date" value={distDate} onChange={(e) => setDistDate(e.target.value)} required className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" />
              </div>
            </div>
            
            <div className="p-4 space-y-6 bg-slate-50/30">
              {filteredLeftManifests.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-slate-900 p-10"><span className="text-4xl mb-3 opacity-50">📋</span><p className="text-sm font-bold">No Active Manifests</p></div>
              ) : (
                filteredLeftManifests.map((manifest, idx) => {
                  const theme = MANIFEST_COLORS[idx % MANIFEST_COLORS.length];
                  const items = allManifestItems.filter(i => i.manifest_id === manifest.id);
                  if (items.length === 0) return null;
                  
                  return (
                    <div key={manifest.id} className={`bg-white border ${theme.border} rounded-xl shadow-sm overflow-hidden`}>
                      
                      <div className={`${theme.bg} p-3 md:p-4 border-b ${theme.border} flex justify-between items-start rounded-t-xl`}>
                        <div className="flex items-start flex-1 min-w-0 pr-2">
                           {/* Common Green Blinking Dot */}
                           <div title="Active Manifest" className="relative flex h-3 w-3 mr-2.5 mt-1.5 shrink-0 cursor-help">
                             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                             <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                           </div>
                           <div className="flex-1 min-w-0">
                             <h4 className={`font-bold ${theme.text} text-base break-words whitespace-normal leading-tight flex items-start`}>
                               <span className={`text-[10px] font-black ${theme.numBg} px-2 py-0.5 rounded-full mr-2 shrink-0 mt-0.5`}>{idx + 1}</span> 
                               <span>{manifest.title}</span>
                             </h4>
                           </div>
                        </div>
                        {manifest.manifest_code && (
                           <span className="text-[10px] font-bold bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded shrink-0 shadow-sm ml-2 hidden sm:block">
                             {manifest.manifest_code}
                           </span>
                        )}
                      </div>

                      <div className="overflow-x-auto w-full">
                        <table className="w-full text-left">
                          <thead className="bg-white border-b border-slate-100">
                            <tr>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Product Details</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-center w-24">Progress</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-center w-24">WH Stock</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-900 uppercase text-right w-36">Distributed Qty</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-900 uppercase text-right w-28">Total HH</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {items.map(item => {
                              const stockKey1 = `${manifest.dp?.nfi_warehouse_id}_${item.product_id}`;
                              const stockKey2 = `${manifest.dp?.lpg_warehouse_id}_${item.product_id}`;
                              const availStock = (whStockMap[stockKey1] || 0) + (whStockMap[stockKey2] || 0);
                              
                              const inputKey = `${manifest.id}_${item.product_id}`;
                              const qVal = inputs[inputKey]?.qty ?? '';
                              const hhVal = inputs[inputKey]?.hh ?? '';

                              const isTargetless = item.target_qty === 0;
                              const remText = isTargetless ? '∞' : Math.max(0, item.target_qty - (item.distributed_qty || 0));

                              return (
                                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-4 min-w-[150px]">
                                    <p className="font-bold text-slate-900 text-sm break-words whitespace-normal leading-tight">{item.products?.name}</p>
                                    <span className="text-[10px] text-slate-500 font-medium font-mono break-words mt-0.5 inline-block">{item.products?.code}</span>
                                  </td>
                                  <td className="px-4 py-4 text-center">
                                    <div className="text-xs font-bold text-slate-800">{item.distributed_qty || 0} / {isTargetless ? '∞' : item.target_qty}</div>
                                    <div className="text-[10px] text-indigo-600 font-bold mt-0.5">Rem: {remText}</div>
                                  </td>
                                  <td className="px-4 py-4 text-center">
                                    <span className={`text-base font-black ${availStock > 0 ? 'text-indigo-600' : 'text-rose-500'}`}>{availStock.toLocaleString()}</span>
                                  </td>
                                  <td className="px-4 py-4 text-right">
                                    <input 
                                      type="number" min="0" max={availStock} disabled={availStock <= 0} 
                                      value={qVal} onChange={(e) => handleQtyChange(manifest.id, item.product_id, e.target.value, availStock)} 
                                      placeholder={availStock > 0 ? "0" : "No Stock"} 
                                      className="w-full text-right px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:border-slate-200 transition-colors" 
                                    />
                                  </td>
                                  <td className="px-4 py-4 text-right">
                                    <input 
                                      type="number" min="0" disabled={availStock <= 0} 
                                      value={hhVal} onChange={(e) => handleHHChange(manifest.id, item.product_id, e.target.value)} 
                                      placeholder="0" 
                                      className="w-full text-right px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:border-slate-200 transition-colors" 
                                    />
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center gap-3 shrink-0 rounded-b-2xl">
              <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Daily Summary Note..." className="w-full sm:flex-1 px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" />
              <button onClick={handleSubmitAll} disabled={isSubmitting || filteredLeftManifests.length === 0} className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md disabled:opacity-50 flex items-center justify-center">
                {isSubmitting ? <><Icons.Spinner /> Processing...</> : 'Submit All Distributions'}
              </button>
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION - HISTORY */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mt-6 mb-10">
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex flex-col lg:flex-row justify-between lg:items-center gap-4 rounded-t-2xl">
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Distribution History</h3>
            
            <div className="flex flex-wrap lg:flex-nowrap gap-2 items-center w-full lg:w-auto">
               <select value={filterDpId} onChange={(e) => setFilterDpId(e.target.value)} className="w-full sm:w-auto px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-500">
                  <option value="ALL">All DPs</option>
                  {distributionPoints.map(dp => <option key={dp.id} value={dp.id}>{dp.name}</option>)}
               </select>
               
               <div className="flex items-center space-x-1 w-full sm:w-auto">
                 <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="w-full sm:w-32 px-2 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" title="From Date" />
                 <span className="text-xs font-bold text-slate-400">-</span>
                 <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="w-full sm:w-32 px-2 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" title="To Date" />
               </div>
               
               <input type="text" placeholder="Search..." value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} className="w-full sm:w-auto flex-1 lg:w-40 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" />
               
               <div className="flex items-center space-x-2 shrink-0 ml-auto lg:ml-0">
                 <button onClick={handleExportExcel} className="px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg hover:bg-emerald-100 transition-colors flex items-center">
                   <Icons.Download /> <span className="ml-1">Excel</span>
                 </button>
                 <button onClick={handleExportPDF} className="px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg hover:bg-rose-100 transition-colors flex items-center">
                   <Icons.Download /> <span className="ml-1">PDF</span>
                 </button>
               </div>
            </div>
          </div>
          
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase border-r border-slate-100 w-24">Date & TXN</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase border-r border-slate-100 w-36">Distribution Point</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase border-r border-slate-100">Distributed Items (Manifest, Product, Qty, Total HH)</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase text-center w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={4} className="p-8 text-center"><Icons.Spinner /></td></tr>
                ) : paginatedHistory.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-sm font-medium text-slate-500">No records found.</td></tr>
                ) : (
                  paginatedHistory.map((dist) => (
                    <tr key={dist.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 align-top border-r border-slate-100">
                        <p className="font-bold text-slate-900 text-sm">{new Date(dist.distribution_date).toLocaleDateString()}</p>
                        <p className="text-[10px] text-indigo-600 font-bold font-mono mt-1 break-words whitespace-normal">DIST-{dist.id.split('-')[0].toUpperCase()}</p>
                      </td>
                      <td className="px-4 py-4 align-top border-r border-slate-100">
                        <p className="font-bold text-slate-900 text-sm break-words whitespace-normal">{dist.distribution_points.name}</p>
                      </td>
                      <td className="px-4 py-4 align-top border-r border-slate-100">
                         <div className="flex flex-col space-y-3 min-w-0">
                           {dist.distribution_items.map((item: any) => (
                             <div key={item.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col min-w-0">
                               <div className="bg-slate-50 px-3 py-2 border-b border-slate-100">
                                 <p className="text-xs font-bold text-slate-900 break-words whitespace-normal leading-relaxed">{item.manifests?.title}</p>
                               </div>
                               <div className="flex justify-between items-center px-3 py-2.5">
                                 <p className="text-sm font-semibold text-slate-800 flex-1 min-w-0 break-words whitespace-normal pr-2 leading-tight">{item.products.name}</p>
                                 <div className="flex items-center space-x-4 shrink-0">
                                   <p className="text-sm font-black text-indigo-600 text-right w-16">{item.quantity} <span className="text-[9px] font-bold text-slate-500 uppercase">{item.products.unit_type}</span></p>
                                   <p className="text-sm font-black text-emerald-600 text-right w-12">{item.total_hh} <span className="text-[9px] font-bold text-slate-500 uppercase">HH</span></p>
                                 </div>
                               </div>
                             </div>
                           ))}
                         </div>
                      </td>
                      <td className="px-4 py-4 text-center align-top">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <button onClick={() => { setDetailsData(dist); setDetailsModalOpen(true); }} className="w-full py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-bold rounded-lg hover:bg-indigo-100 transition-colors">Details</button>
                          <button onClick={() => openEditModal(dist)} className="w-full py-2 bg-amber-50 text-amber-700 border border-amber-100 text-xs font-bold rounded-lg hover:bg-amber-100 transition-colors">Edit</button>
                          <button onClick={() => { setTxnToRevert(dist); setRevertModalOpen(true); }} className="w-full py-2 bg-rose-50 text-rose-700 border border-rose-100 text-xs font-bold rounded-lg hover:bg-rose-100 transition-colors">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {filteredHistory.length > 0 && (
            <div className="flex justify-between items-center p-4 bg-white border-t border-slate-200 rounded-b-2xl">
              <span className="text-xs font-bold text-slate-500">Showing page {currentPage} of {totalPages} ({filteredHistory.length} entries)</span>
              <div className="flex space-x-2">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-lg transition-colors">Prev</button>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-lg transition-colors">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- DETAILS MODAL --- */}
      {detailsModalOpen && detailsData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0 rounded-t-2xl">
               <div>
                 <h3 className="font-bold text-slate-900 text-lg">Transaction Details</h3>
                 <p className="text-xs text-indigo-600 font-bold font-mono mt-0.5 break-words whitespace-normal">DIST-{detailsData.id.split('-')[0].toUpperCase()}</p>
               </div>
               <button onClick={() => setDetailsModalOpen(false)} className="bg-rose-500 text-white p-1.5 rounded-lg hover:bg-rose-600 transition-colors shadow-sm"><Icons.Close /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-5 custom-scrollbar">
               <div className="flex justify-between items-center bg-slate-50 border border-slate-200 p-4 rounded-xl">
                 <div>
                   <p className="text-[10px] font-bold text-slate-500 uppercase">Distribution Point</p>
                   <p className="font-bold text-slate-900 text-sm break-words whitespace-normal">{detailsData.distribution_points.name}</p>
                 </div>
                 <div className="text-right">
                   <p className="text-[10px] font-bold text-slate-500 uppercase">Date</p>
                   <p className="font-bold text-slate-900 text-sm">{new Date(detailsData.distribution_date).toLocaleDateString()}</p>
                 </div>
               </div>
               <div>
                 <p className="text-xs font-bold text-slate-500 uppercase mb-2">Distributed Items</p>
                 <div className="border border-slate-200 rounded-xl overflow-hidden">
                   <table className="w-full text-left">
                     <thead className="bg-slate-50 border-b border-slate-100">
                       <tr>
                         <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Manifest</th>
                         <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Product</th>
                         <th className="p-3 text-[10px] font-bold text-slate-500 uppercase text-right">Distributed Qty</th>
                         <th className="p-3 text-[10px] font-bold text-slate-500 uppercase text-right">Total HH</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                       {detailsData.distribution_items.map((item: any) => (
                         <tr key={item.id} className="hover:bg-slate-50">
                           <td className="p-3 text-xs font-bold text-slate-900 break-words whitespace-normal">{item.manifests?.title}</td>
                           <td className="p-3 text-xs font-semibold text-slate-800 break-words whitespace-normal">{item.products.name}</td>
                           <td className="p-3 text-sm font-black text-indigo-600 text-right whitespace-nowrap">{item.quantity} <span className="text-[9px] font-bold text-slate-500 uppercase">{item.products.unit_type}</span></td>
                           <td className="p-3 text-sm font-black text-emerald-600 text-right whitespace-nowrap">{item.total_hh} <span className="text-[9px] font-bold text-slate-500 uppercase">HH</span></td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               </div>
               {detailsData.remarks && (
                 <div>
                   <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Remarks</p>
                   <p className="text-xs font-medium text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-200 break-words whitespace-normal">{detailsData.remarks}</p>
                 </div>
               )}
            </div>
          </div>
        </div>
      )}

      {/* --- UNIFIED EDIT MODAL --- */}
      {editModalOpen && distToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0 rounded-t-2xl">
               <div>
                 <h3 className="font-bold text-slate-900 text-lg">Edit Full Transaction</h3>
                 <p className="text-xs text-indigo-600 font-bold font-mono mt-0.5 break-words whitespace-normal">DIST-{distToEdit.id.split('-')[0].toUpperCase()} • {distToEdit.distribution_points.name}</p>
               </div>
               <button onClick={() => setEditModalOpen(false)} className="bg-rose-500 text-white p-1.5 rounded-lg hover:bg-rose-600 transition-colors shadow-sm"><Icons.Close /></button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 overflow-y-auto flex-1 space-y-5 custom-scrollbar">
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Edit Quantities & Total HH</label>
                 <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    {distToEdit.distribution_items.map((item: any) => (
                      <div key={item.id} className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-200 last:border-0 last:pb-0">
                         <div>
                           <p className="font-bold text-slate-900 text-sm break-words whitespace-normal">{item.products.name}</p>
                           <p className="text-[10px] text-slate-600 font-medium mt-0.5 break-words whitespace-normal">Manifest: <span className="font-bold">{item.manifests?.title}</span></p>
                           <p className="text-[10px] font-bold text-emerald-600 mt-1">
                             Shared Max Qty: {editMaxStocks[item.product_id] || 0}
                             <span className="block text-slate-400 font-normal mt-0.5">(Shared stock available across manifests)</span>
                           </p>
                         </div>
                         <div className="flex space-x-3 items-start justify-end">
                           <div>
                             <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1 text-right">Dist. Qty</label>
                             <div className="flex items-center space-x-1">
                               <input type="number" min="0" max={editMaxStocks[item.product_id] || 0} value={editValues[item.id]?.qty ?? ''} onChange={(e) => setEditValues(prev => ({...prev, [item.id]: {...prev[item.id], qty: e.target.value === '' ? '' : Number(e.target.value)}}))} className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-right font-bold text-slate-900 outline-none focus:border-indigo-500" required />
                               <span className="text-[9px] font-bold text-slate-500 uppercase">{item.products.unit_type}</span>
                             </div>
                           </div>
                           <div>
                             <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1 text-right">Total HH</label>
                             <div className="flex items-center space-x-1">
                               <input type="number" min="0" value={editValues[item.id]?.hh ?? ''} onChange={(e) => setEditValues(prev => ({...prev, [item.id]: {...prev[item.id], hh: e.target.value === '' ? '' : Number(e.target.value)}}))} className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-right font-bold text-slate-900 outline-none focus:border-indigo-500" required />
                               <span className="text-[9px] font-bold text-slate-500 uppercase">HH</span>
                             </div>
                           </div>
                         </div>
                      </div>
                    ))}
                 </div>
               </div>
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Remarks</label>
                 <input type="text" value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-indigo-500" placeholder="Remarks..." />
               </div>
               <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm mt-2 shadow-md transition-colors disabled:opacity-50">
                 {isSubmitting ? 'Saving...' : 'Save All Changes & Adjust Balance'}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* --- REVERT MODAL --- */}
      {revertModalOpen && txnToRevert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">⚠️</div>
            <h4 className="font-bold text-xl mb-2 text-slate-900">Delete Transaction?</h4>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">This will delete all items under DIST-{txnToRevert.id.split('-')[0].toUpperCase()} and restore the deducted stock to the warehouse.</p>
            <button onClick={handleRevertTransaction} disabled={isSubmitting} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl mb-3 text-sm shadow-md transition-colors disabled:opacity-50">{isSubmitting ? 'Deleting...' : 'Yes, Delete Transaction'}</button>
            <button onClick={() => setRevertModalOpen(false)} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition-colors">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}