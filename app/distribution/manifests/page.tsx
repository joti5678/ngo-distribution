"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './../../components/Icons';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const STATUS_OPTIONS = ["Active", "Hold", "Inactive"];

// সিকোয়েন্স (1, 2, 3...) অনুযায়ী ম্যানিফেস্ট সর্ট করার হেল্পার (Distribution Report পেজের সাথে ১০০% মিল থাকবে)
const sortManifestsBySequence = (list: any[]) => {
  return [...list].sort((a, b) => {
    const seqA = Number(a.sort_order) || 0;
    const seqB = Number(b.sort_order) || 0;
    if (seqA !== seqB) {
      if (seqA <= 0) return 1;
      if (seqB <= 0) return -1;
      return seqA - seqB;
    }
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
};

// সিকোয়েন্স (1, 2, 3...) অনুযায়ী ম্যানিফেস্টের প্রোডাক্ট সর্ট করার হেল্পার
const sortBagItemsBySequence = (list: any[]) => {
  return [...list].sort((a, b) => {
    const seqA = Number(a.sort_order) || 0;
    const seqB = Number(b.sort_order) || 0;
    if (seqA !== seqB) {
      if (seqA <= 0) return 1;
      if (seqB <= 0) return -1;
      return seqA - seqB;
    }
    return String(a.products?.name || a.name || '').localeCompare(String(b.products?.name || b.name || ''));
  });
};

export default function ManifestsPage() {
  const [manifests, setManifests] = useState<any[]>([]);
  const [distributionPoints, setDistributionPoints] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [allPackages, setAllPackages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dynamic Manifest Types State
  const [manifestTypes, setManifestTypes] = useState<any[]>([]);
  const [isManageTypesOpen, setIsManageTypesOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editTypeValue, setEditTypeValue] = useState('');

  // Security PIN
  const [isPinPromptOpen, setIsPinPromptOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');

  // Filters
  const [filterDp, setFilterDp] = useState('ALL');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination States
  const [activePage, setActivePage] = useState(1);
  const [inactivePage, setInactivePage] = useState(1);
  const MANIFESTS_PER_PAGE = 5;

  // Form States (Create)
  const [manifestCode, setManifestCode] = useState('');
  const [title, setTitle] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [selectedDp, setSelectedDp] = useState('');
  const [manifestType, setManifestType] = useState('');
  const [status, setStatus] = useState(STATUS_OPTIONS[0]);

  // Builder States
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [activeManifest, setActiveManifest] = useState<any>(null);
  const [bagItems, setBagItems] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'products' | 'packages'>('products');
  const [isSavingBagOrder, setIsSavingBagOrder] = useState(false);

  // Manifest Sequence Modal States
  const [isSequenceModalOpen, setIsSequenceModalOpen] = useState(false);
  const [sequenceModalDp, setSequenceModalDp] = useState('ALL');
  const [sequenceModalItems, setSequenceModalItems] = useState<any[]>([]);
  const [isSavingManifestOrder, setIsSavingManifestOrder] = useState(false);

  // Drag and Drop Refs
  const dragTypeItem = useRef<number | null>(null);
  const dragTypeOverItem = useRef<number | null>(null);
  const dragBagItem = useRef<number | null>(null);
  const dragBagOverItem = useRef<number | null>(null);
  const dragActiveManifestItem = useRef<number | null>(null);
  const dragActiveManifestOverItem = useRef<number | null>(null);
  const dragSeqModalItem = useRef<number | null>(null);
  const dragSeqModalOverItem = useRef<number | null>(null);

  // Details States
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsItems, setDetailsItems] = useState<any[]>([]);

  // Edit Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [manifestToEdit, setManifestToEdit] = useState<any>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editValidFrom, setEditValidFrom] = useState('');
  const [editValidTo, setEditValidTo] = useState('');
  const [editSelectedDp, setEditSelectedDp] = useState('');
  const [editManifestType, setEditManifestType] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    fetchInitialData();
    generateAutoCode();
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setActivePage(1);
    setInactivePage(1);
  }, [filterDp, filterMonth, filterType, searchTerm]);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const generateAutoCode = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.floor(1000 + Math.random() * 9000);
    setManifestCode(`MNF-${dateStr}-${randomStr}`);
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    await loadManifestTypes();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUser(user);

      const sessionStr = localStorage.getItem('user_session');
      const sessionUser = sessionStr ? JSON.parse(sessionStr) : null;

      let profile: any = null;
      if (user) {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        profile = data;
      }

      const roleStr = String(profile?.role || sessionUser?.role || '').toUpperCase();
      const isSuperAdmin = roleStr === 'SUPER ADMIN' || roleStr === 'ADMIN' || roleStr.includes('WEB ADMIN');

      const { data: dpData } = await supabase.from('distribution_points').select('id, name, code').order('name');
      const allDps = dpData || [];
      let allowedDps: any[] = [];

      if (isSuperAdmin) {
        allowedDps = allDps;
      } else {
        const rawIds = profile?.assigned_dp_ids || sessionUser?.assigned_dp_ids || [];
        let dpIds: string[] = [];

        if (typeof rawIds === 'string') {
          try {
            dpIds = JSON.parse(rawIds);
          } catch {
            dpIds = rawIds.includes(',') ? rawIds.split(',') : [rawIds];
          }
        } else if (Array.isArray(rawIds)) {
          dpIds = rawIds;
        } else if (rawIds && typeof rawIds === 'object') {
          dpIds = Object.values(rawIds);
        }

        const cleanDpIds = dpIds.map(id => String(id).trim()).filter(id => id !== '');
        allowedDps = allDps.filter(dp => cleanDpIds.includes(String(dp.id).trim()));
      }

      setDistributionPoints(allowedDps);
      const idsToFetch = allowedDps.length > 0 ? allowedDps.map(dp => dp.id) : ['NONE-NO-ACCESS'];
      await loadManifests(idsToFetch);
    } catch (err) {
      console.error("Error fetching DP assignment:", err);
    }
    setIsLoading(false);
  };

  const loadManifestTypes = async () => {
    const { data, error } = await supabase.from('manifest_types').select('*').order('sort_order');
    if (!error && data) {
      setManifestTypes(data);
      const activeTypes = data.filter(t => t.is_active !== false);
      if (activeTypes.length > 0) setManifestType(activeTypes[0].name);
    }
  };

  const handleVerifyPin = () => {
    const savedPin = localStorage.getItem('db_admin_pin') || '123456';
    if (pinInput === savedPin) {
      setIsPinPromptOpen(false);
      setPinInput('');
      setIsManageTypesOpen(true);
    } else {
      alert('Incorrect PIN!');
      setPinInput('');
    }
  };

  const handleAddManifestType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName.trim()) return;
    const typeName = newTypeName.trim();

    const existingType = manifestTypes.find(t => t.name.toLowerCase() === typeName.toLowerCase());

    if (existingType) {
      if (existingType.is_active === false) {
        const { error } = await supabase.from('manifest_types').update({ is_active: true }).eq('id', existingType.id);
        if (!error) {
          const updatedTypes = manifestTypes.map(t => t.id === existingType.id ? { ...t, is_active: true } : t);
          setManifestTypes(updatedTypes);
          setManifestType(existingType.name);
          setNewTypeName('');
          showMessage(`"${typeName}" has been reactivated successfully!`);
        }
      } else alert('This Type already exists and is active!');
      return;
    }

    const newOrder = manifestTypes.length;
    const { data, error } = await supabase.from('manifest_types').insert([{ name: typeName, sort_order: newOrder, is_active: true }]).select();

    if (!error && data && data.length > 0) {
      setManifestTypes([...manifestTypes, data[0]]);
      setManifestType(data[0].name);
      setNewTypeName('');
      showMessage(`Type "${typeName}" added successfully!`);
    }
  };

  const handleEditManifestType = async (id: string) => {
    if (!editTypeValue.trim()) return;
    const { error } = await supabase.from('manifest_types').update({ name: editTypeValue }).eq('id', id);

    if (!error) {
      const updatedTypes = manifestTypes.map(t => t.id === id ? { ...t, name: editTypeValue } : t);
      setManifestTypes(updatedTypes);
      if (manifestType === manifestTypes.find(t => t.id === id)?.name) setManifestType(editTypeValue);
      setEditingType(null);
      showMessage(`Type updated successfully!`);
    }
  };

  const handleToggleTypeStatus = async (id: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    const { error } = await supabase.from('manifest_types').update({ is_active: newStatus }).eq('id', id);
    if (!error) {
      setManifestTypes(manifestTypes.map(t => t.id === id ? { ...t, is_active: newStatus } : t));
    }
  };

  const handleDeleteManifestType = async (id: string, typeName: string) => {
    if (!confirm(`Hard delete "${typeName}"? Proceed with caution.`)) return;
    const { error } = await supabase.from('manifest_types').delete().eq('id', id);
    if (!error) {
      const newTypes = manifestTypes.filter(t => t.id !== id);
      setManifestTypes(newTypes);
      if (manifestType === typeName) {
        const activeTypes = newTypes.filter(t => t.is_active);
        setManifestType(activeTypes.length > 0 ? activeTypes[0].name : '');
      }
      showMessage(`Type "${typeName}" completely removed.`);
    }
  };

  const handleTypeSort = async () => {
    if (dragTypeItem.current === null || dragTypeOverItem.current === null) return;
    const _types = [...manifestTypes];
    const draggedItemContent = _types.splice(dragTypeItem.current, 1)[0];
    _types.splice(dragTypeOverItem.current, 0, draggedItemContent);
    dragTypeItem.current = null;
    dragTypeOverItem.current = null;
    setManifestTypes(_types);
    for (let i = 0; i < _types.length; i++) {
      await supabase.from('manifest_types').update({ sort_order: i }).eq('id', _types[i].id);
    }
  };

  const loadManifests = async (allowedDpIds: string[]) => {
    if (allowedDpIds.length === 0 || allowedDpIds.includes('NONE-NO-ACCESS')) {
      setManifests([]);
      return;
    }
    const { data } = await supabase
      .from('manifests')
      .select(`*, distribution_points (id, name, code), manifest_items (id, target_qty, distributed_qty, sort_order, products (name))`)
      .in('distribution_point_id', allowedDpIds)
      .order('created_at', { ascending: false });

    if (data) {
      const normalized = data.map(m => ({
        ...m,
        manifest_items: sortBagItemsBySequence(m.manifest_items || [])
      }));
      setManifests(sortManifestsBySequence(normalized));
    }
  };

  const getFilteredManifests = () => {
    return manifests.filter(m => {
      const matchDp = filterDp === 'ALL' ? true : m.distribution_point_id === filterDp;
      let matchMonth = true;
      if (filterMonth) {
        const [year, month] = filterMonth.split('-');
        const monthStart = new Date(parseInt(year), parseInt(month) - 1, 1);
        const monthEnd = new Date(parseInt(year), parseInt(month), 0);
        monthEnd.setHours(23, 59, 59, 999);
        const mStart = new Date(m.valid_from); mStart.setHours(0, 0, 0, 0);
        const mEnd = new Date(m.valid_to); mEnd.setHours(23, 59, 59, 999);
        matchMonth = mStart <= monthEnd && mEnd >= monthStart;
      }
      let matchSearch = true;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        matchSearch =
          m.title.toLowerCase().includes(q) ||
          m.manifest_code.toLowerCase().includes(q) ||
          (m.manifest_items && m.manifest_items.some((mi: any) => mi.products?.name.toLowerCase().includes(q)));
      }
      const matchType = filterType === 'ALL' ? true : m.manifest_type === filterType;
      return matchDp && matchMonth && matchSearch && matchType;
    });
  };

  const filteredData = getFilteredManifests();
  const todayDate = typeof window !== 'undefined' ? new Date() : new Date("2026-01-01");
  todayDate.setHours(0, 0, 0, 0);

  const isManifestCurrentlyActive = (m: any) => {
    if (m.status !== 'Active') return false;
    if (!m.valid_to) return true;
    const validToDate = new Date(m.valid_to);
    validToDate.setHours(0, 0, 0, 0);
    return validToDate >= todayDate;
  };

  const activeSection = sortManifestsBySequence(filteredData.filter(isManifestCurrentlyActive));
  const inactiveSection = filteredData.filter(m => !isManifestCurrentlyActive(m));

  // Apply Pagination
  const totalActivePages = Math.ceil(activeSection.length / MANIFESTS_PER_PAGE);
  const paginatedActive = activeSection.slice((activePage - 1) * MANIFESTS_PER_PAGE, activePage * MANIFESTS_PER_PAGE);

  const totalInactivePages = Math.ceil(inactiveSection.length / MANIFESTS_PER_PAGE);
  const paginatedInactive = inactiveSection.slice((inactivePage - 1) * MANIFESTS_PER_PAGE, inactivePage * MANIFESTS_PER_PAGE);

  // =========================================================================
  // MANIFEST SEQUENCE PERSISTENCE (1-based: 1, 2, 3...)
  // =========================================================================
  const persistManifestSequence = async (orderedList: any[]) => {
    if (orderedList.length === 0) return true;
    setIsSavingManifestOrder(true);
    try {
      const orderLookup: { [id: string]: number } = {};
      orderedList.forEach((m, idx) => {
        orderLookup[m.id] = idx + 1;
      });

      // UI সাথে সাথে আপডেট করা
      setManifests(prev => {
        const updated = prev.map(m => (orderLookup[m.id] ? { ...m, sort_order: orderLookup[m.id] } : m));
        return sortManifestsBySequence(updated);
      });

      const updateResults = await Promise.all(
        orderedList.map((m, idx) =>
          supabase.from('manifests').update({ sort_order: idx + 1 }).eq('id', m.id)
        )
      );

      const firstError = updateResults.find(r => r.error)?.error;
      if (firstError) throw firstError;

      showMessage('Manifest sequence updated! It will now reflect on the Distribution Report page.');
      return true;
    } catch (err: any) {
      console.error('Error saving manifest sequence:', err);
      showMessage(`Failed to save manifest sequence: ${err.message || 'Check sort_order column'}`, 'error');
      return false;
    } finally {
      setIsSavingManifestOrder(false);
    }
  };

  // সরাসরি Active Manifests টেবিলের ভেতর ড্র্যাগ-অ্যান্ড-ড্রপ
  const handleActiveManifestDragEnd = async () => {
    if (dragActiveManifestItem.current === null || dragActiveManifestOverItem.current === null) return;
    const fromLocalIdx = dragActiveManifestItem.current;
    const toLocalIdx = dragActiveManifestOverItem.current;

    dragActiveManifestItem.current = null;
    dragActiveManifestOverItem.current = null;

    if (fromLocalIdx === toLocalIdx) return;

    const pageOffset = (activePage - 1) * MANIFESTS_PER_PAGE;
    const fromFullIdx = pageOffset + fromLocalIdx;
    const toFullIdx = pageOffset + toLocalIdx;

    const reordered = [...activeSection];
    const [moved] = reordered.splice(fromFullIdx, 1);
    if (!moved) return;
    reordered.splice(toFullIdx, 0, moved);

    await persistManifestSequence(reordered);
  };

  // সরাসরি Active Manifests টেবিলের ↑ / ↓ বাটন
  const handleMoveActiveManifest = async (localIdx: number, direction: 'up' | 'down') => {
    const pageOffset = (activePage - 1) * MANIFESTS_PER_PAGE;
    const fromFullIdx = pageOffset + localIdx;
    const targetFullIdx = direction === 'up' ? fromFullIdx - 1 : fromFullIdx + 1;

    if (targetFullIdx < 0 || targetFullIdx >= activeSection.length) return;

    const reordered = [...activeSection];
    const [moved] = reordered.splice(fromFullIdx, 1);
    reordered.splice(targetFullIdx, 0, moved);

    await persistManifestSequence(reordered);
  };

  // Arrange Sequence মোডাল ওপেন করা (৫টির বেশি ম্যানিফেস্ট একসাথে সাজানোর জন্য)
  const openSequenceModal = () => {
    const initialDp = filterDp || 'ALL';
    setSequenceModalDp(initialDp);
    const list = sortManifestsBySequence(
      manifests.filter(m => isManifestCurrentlyActive(m) && (initialDp === 'ALL' ? true : m.distribution_point_id === initialDp))
    );
    setSequenceModalItems(list);
    setIsSequenceModalOpen(true);
  };

  const handleSequenceModalDpChange = (nextDp: string) => {
    setSequenceModalDp(nextDp);
    const list = sortManifestsBySequence(
      manifests.filter(m => isManifestCurrentlyActive(m) && (nextDp === 'ALL' ? true : m.distribution_point_id === nextDp))
    );
    setSequenceModalItems(list);
  };

  const handleSeqModalDragEnd = () => {
    if (dragSeqModalItem.current === null || dragSeqModalOverItem.current === null) return;
    const fromIdx = dragSeqModalItem.current;
    const toIdx = dragSeqModalOverItem.current;
    dragSeqModalItem.current = null;
    dragSeqModalOverItem.current = null;
    if (fromIdx === toIdx) return;

    const updated = [...sequenceModalItems];
    const [moved] = updated.splice(fromIdx, 1);
    if (!moved) return;
    updated.splice(toIdx, 0, moved);
    setSequenceModalItems(updated);
  };

  const handleMoveSeqModalItem = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sequenceModalItems.length) return;
    const updated = [...sequenceModalItems];
    const [moved] = updated.splice(idx, 1);
    updated.splice(targetIdx, 0, moved);
    setSequenceModalItems(updated);
  };

  const handleSaveSequenceModal = async () => {
    const ok = await persistManifestSequence(sequenceModalItems);
    if (ok) {
      setIsSequenceModalOpen(false);
    }
  };

  // =========================================================================
  // EXPORTS (UNCHANGED)
  // =========================================================================
  const handleExportExcel = () => {
    const [year, monthNum] = filterMonth ? filterMonth.split('-') : ['', ''];
    const monthName = filterMonth ? new Date(parseInt(year), parseInt(monthNum) - 1, 1).toLocaleString('default', { month: 'long' }) : 'All Time';
    const displayYear = filterMonth ? year : 'All';
    const exportData: any[] = [];
    filteredData.forEach(m => {
      const validToDate = new Date(m.valid_to);
      validToDate.setHours(0, 0, 0, 0);
      const isExpired = validToDate < todayDate;
      const finalStatus = isExpired && m.status === 'Active' ? 'Expired' : m.status;
      if (m.manifest_items && m.manifest_items.length > 0) {
        m.manifest_items.forEach((mi: any) => {
          const target = mi.target_qty || 0;
          const achievement = mi.distributed_qty || 0;
          const remaining = target === 0 ? 'Open' : (target - achievement);
          const percentage = target === 0 ? 'N/A' : ((achievement / target) * 100).toFixed(1) + '%';
          exportData.push({
            "Month": monthName, "Year": displayYear, "Manifest Title": m.title, "Type": m.manifest_type,
            "Target DP": m.distribution_points?.name || 'Unassigned',
            "Validity": `${new Date(m.valid_from).toLocaleDateString()} to ${new Date(m.valid_to).toLocaleDateString()}`,
            "Status": finalStatus, "Item Name": mi.products?.name || 'Unknown',
            "Target Qty": target === 0 ? 'Open' : target, "Achievement": achievement,
            "Remaining": remaining, "Achievement %": percentage
          });
        });
      } else {
        exportData.push({
          "Month": monthName, "Year": displayYear, "Manifest Title": m.title, "Type": m.manifest_type,
          "Target DP": m.distribution_points?.name || 'Unassigned',
          "Validity": `${new Date(m.valid_from).toLocaleDateString()} to ${new Date(m.valid_to).toLocaleDateString()}`,
          "Status": finalStatus, "Item Name": "No Items Assigned",
          "Target Qty": "-", "Achievement": "-", "Remaining": "-", "Achievement %": "-"
        });
      }
    });
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Manifest_Items");
    XLSX.writeFile(workbook, `Manifest_Items_Report_${monthName}_${displayYear}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    const [year, monthNum] = filterMonth ? filterMonth.split('-') : ['', ''];
    const monthName = filterMonth ? new Date(parseInt(year), parseInt(monthNum) - 1, 1).toLocaleString('default', { month: 'long' }) : 'All Time';
    const displayYear = filterMonth ? year : 'All';
    const dpName = filterDp === 'ALL' ? 'All Assigned Camps' : distributionPoints.find(d => d.id === filterDp)?.name;

    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(15, 23, 42);
    doc.text(`Manifest Target & Achievement Report - ${dpName}`, 14, 15);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100, 116, 139);
    doc.text(`Period: ${monthName} ${displayYear}   |   Generated: ${new Date().toLocaleString()}`, 14, 21);
    const tableColumn = ["Month", "Year", "Manifest Title", "Target DP", "Item Name", "Target", "Achieved", "Rem.", "Achieved %"];
    const tableRows: any[] = [];
    filteredData.forEach(m => {
      if (m.manifest_items && m.manifest_items.length > 0) {
        m.manifest_items.forEach((mi: any) => {
          const target = mi.target_qty || 0; const achievement = mi.distributed_qty || 0;
          const remaining = target === 0 ? 'Open' : (target - achievement);
          const percentage = target === 0 ? 'N/A' : ((achievement / target) * 100).toFixed(1) + '%';
          tableRows.push([monthName, displayYear, m.title, m.distribution_points?.name || 'N/A', mi.products?.name || 'Unknown', target === 0 ? 'Open' : target, achievement, remaining, percentage]);
        });
      } else {
        tableRows.push([monthName, displayYear, m.title, m.distribution_points?.name || 'N/A', "No Items Assigned", "-", "-", "-", "-"]);
      }
    });
    autoTable(doc, {
      head: [tableColumn], body: tableRows, startY: 26, theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak', textColor: [30, 41, 59] },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
      columnStyles: { 2: { cellWidth: 50 }, 4: { cellWidth: 50 }, 5: { halign: 'center', fontStyle: 'bold' }, 6: { halign: 'center', textColor: [5, 150, 105], fontStyle: 'bold' }, 7: { halign: 'center' }, 8: { halign: 'right', fontStyle: 'bold' } }
    });
    doc.save(`Manifest_Report_${monthName}_${displayYear}.pdf`);
  };

  // =========================================================================
  // CREATE / EDIT / DELETE MANIFEST
  // =========================================================================
  const handleCreateManifest = async (e: React.FormEvent) => {
    e.preventDefault();

    const rawTitle = title.trim();
    if (!manifestCode || !rawTitle || !selectedDp || !validFrom || !validTo || !manifestType) {
      alert("Please fill all required fields and select a Manifest Type.");
      return;
    }

    const isDuplicate = manifests.some(m => m.title.toLowerCase() === rawTitle.toLowerCase());
    if (isDuplicate) {
      showMessage(`A manifest with title "${rawTitle}" already exists! Please use a unique title.`, "error");
      return;
    }

    // নতুন ম্যানিফেস্টের জন্য ওই DP-এর পরবর্তী ১-বেসড sort_order নির্ধারণ
    const dpManifests = manifests.filter(m => m.distribution_point_id === selectedDp && isManifestCurrentlyActive(m));
    const maxOrder = dpManifests.reduce((max, m) => Math.max(max, Number(m.sort_order) || 0), 0);
    const nextOrder = Math.max(maxOrder, dpManifests.length) + 1;

    const payload = {
      manifest_code: manifestCode, title: rawTitle, valid_from: validFrom, valid_to: validTo,
      distribution_point_id: selectedDp, manifest_type: manifestType, status: status,
      sort_order: nextOrder
    };
    try {
      const { error } = await supabase.from('manifests').insert([payload]);
      if (error) throw error;
      showMessage("Manifest created successfully!");

      await fetchInitialData();
      resetCreateForm();
    } catch (err: any) { showMessage(`Error creating manifest: ${err.message}`, "error"); }
  };

  const resetCreateForm = () => {
    setTitle(''); setValidFrom(''); setValidTo('');
    const activeTypes = manifestTypes.filter(t => t.is_active !== false);
    if (activeTypes.length > 0) setManifestType(activeTypes[0].name);
    setStatus(STATUS_OPTIONS[0]); generateAutoCode();
  };

  const openEditModal = (manifest: any) => {
    setManifestToEdit(manifest);
    setEditTitle(manifest.title);
    setEditValidFrom(manifest.valid_from);
    setEditValidTo(manifest.valid_to);
    setEditSelectedDp(manifest.distribution_point_id || '');
    setEditManifestType(manifest.manifest_type || '');
    setEditStatus(manifest.status || 'Active');
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manifestToEdit) return;

    const rawTitle = editTitle.trim();
    const isDuplicate = manifests.some(m => m.id !== manifestToEdit.id && m.title.toLowerCase() === rawTitle.toLowerCase());
    if (isDuplicate) {
      showMessage(`A manifest with title "${rawTitle}" already exists! Please use a unique title.`, "error");
      return;
    }

    setIsSubmittingEdit(true);
    const payload = {
      title: rawTitle, valid_from: editValidFrom, valid_to: editValidTo,
      distribution_point_id: editSelectedDp, manifest_type: editManifestType, status: editStatus
    };
    try {
      const { error } = await supabase.from('manifests').update(payload).eq('id', manifestToEdit.id);
      if (error) throw error;
      showMessage("Manifest updated successfully!");

      await fetchInitialData();
      setIsEditModalOpen(false);
    } catch (err: any) { showMessage(`Error updating manifest: ${err.message}`, "error"); }
    finally { setIsSubmittingEdit(false); }
  };

  const handleDeleteManifest = async (id: string) => {
    if (!confirm("Are you sure? This will delete the manifest and all assigned items.")) return;
    const { error } = await supabase.from('manifests').delete().eq('id', id);
    if (!error) {
      setManifests(manifests.filter(m => m.id !== id));
      showMessage("Manifest deleted successfully!");
    }
  };

  // =========================================================================
  // DETAILS & ITEM BUILDER (1-BASED PRODUCT SEQUENCE SYNCED TO DB)
  // =========================================================================
  const openDetailsView = async (manifest: any) => {
    setActiveManifest(manifest);
    setIsDetailsOpen(true);
    const { data } = await supabase
      .from('manifest_items')
      .select(`id, target_qty, distributed_qty, product_id, sort_order, products (name, code, unit_type, product_type, is_open_stock)`)
      .eq('manifest_id', manifest.id);
    if (data) {
      setDetailsItems(sortBagItemsBySequence(data));
    }
  };

  const openManifestBuilder = async (manifest: any) => {
    setActiveManifest(manifest);
    setIsBuilderOpen(true);
    setProductSearch('');
    const { data: prodData } = await supabase.from('products').select('id, name, code, unit_type, product_type, is_open_stock').order('name');
    if (prodData) setAllProducts(prodData);
    const { data: pkgData } = await supabase.from('product_groups').select(`id, group_name, group_code, product_group_items( product_id, products(id, name, code, unit_type, product_type, is_open_stock) )`);
    if (pkgData) setAllPackages(pkgData);
    await loadBagItems(manifest.id);
  };

  const loadBagItems = async (manifestId: string) => {
    const { data } = await supabase
      .from('manifest_items')
      .select(`id, target_qty, product_id, sort_order, products (id, name, code, unit_type, product_type, is_open_stock)`)
      .eq('manifest_id', manifestId);
    if (data) {
      const sorted = sortBagItemsBySequence(data);
      setBagItems(
        sorted.map(item => ({
          db_id: item.id,
          product_id: item.product_id,
          target_qty: item.target_qty,
          sort_order: Number(item.sort_order) || 0,
          ...item.products
        }))
      );
    }
  };

  // ১-বেসড (1, 2, 3...) সিকোয়েন্স ডাটাবেজে সেভ করা
  const persistBagSequence = async (orderedBag: any[], silent = false) => {
    if (orderedBag.length === 0) return;
    setIsSavingBagOrder(true);
    try {
      const normalizedBag = orderedBag.map((item, idx) => ({
        ...item,
        sort_order: idx + 1
      }));
      setBagItems(normalizedBag);

      const updateResults = await Promise.all(
        normalizedBag
          .filter(item => Boolean(item.db_id))
          .map((item, idx) =>
            supabase.from('manifest_items').update({ sort_order: idx + 1 }).eq('id', item.db_id)
          )
      );

      const firstError = updateResults.find(r => r.error)?.error;
      if (firstError) throw firstError;

      if (!silent) {
        showMessage('Product sequence saved! It will reflect in Daily Distribution Report.');
      }
    } catch (err: any) {
      console.error('Error saving product sequence:', err);
      showMessage(`Failed to save product sequence: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setIsSavingBagOrder(false);
    }
  };

  const handleAddToBag = async (product: any) => {
    if (bagItems.find(item => item.product_id === product.id)) return;
    const maxOrder = bagItems.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), 0);
    const newOrder = Math.max(maxOrder, bagItems.length) + 1;

    const { data, error } = await supabase
      .from('manifest_items')
      .insert([{ manifest_id: activeManifest.id, product_id: product.id, target_qty: 0, sort_order: newOrder }])
      .select();

    if (!error && data) {
      setBagItems(prev => [
        ...prev,
        { db_id: data[0].id, product_id: product.id, target_qty: 0, sort_order: newOrder, ...product }
      ]);
    }
  };

  const handleAddPackageToBag = async (pkg: any) => {
    let addedCount = 0;
    const baseMax = bagItems.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), 0);
    let nextOrder = Math.max(baseMax, bagItems.length) + 1;

    for (const item of pkg.product_group_items) {
      const product = item.products;
      if (!bagItems.find(b => b.product_id === product.id)) {
        const assignedOrder = nextOrder;
        const { data, error } = await supabase
          .from('manifest_items')
          .insert([{ manifest_id: activeManifest.id, product_id: product.id, target_qty: 0, sort_order: assignedOrder }])
          .select();
        if (!error && data) {
          setBagItems(prev => [
            ...prev,
            { db_id: data[0].id, product_id: product.id, target_qty: 0, sort_order: assignedOrder, ...product }
          ]);
          nextOrder++;
          addedCount++;
        }
      }
    }
    if (addedCount > 0) showMessage(`Successfully added ${addedCount} products from ${pkg.group_name}!`, "success");
    else showMessage("All products in this package are already in the manifest.", "error");
  };

  const handleRemoveFromBag = async (db_id: string) => {
    await supabase.from('manifest_items').delete().eq('id', db_id);
    const remaining = bagItems.filter(i => i.db_id !== db_id);
    setBagItems(remaining);
    if (remaining.length > 0) {
      await persistBagSequence(remaining, true);
    }
  };

  const handleUpdateQty = async (db_id: string, newQty: string) => {
    const val = newQty === '' ? 0 : parseInt(newQty);
    if (val < 0) return;
    await supabase.from('manifest_items').update({ target_qty: val }).eq('id', db_id);
    setBagItems(bagItems.map(item => item.db_id === db_id ? { ...item, target_qty: val } : item));
  };

  const handleBagSort = async () => {
    if (dragBagItem.current === null || dragBagOverItem.current === null) return;
    const fromIdx = dragBagItem.current;
    const toIdx = dragBagOverItem.current;
    dragBagItem.current = null;
    dragBagOverItem.current = null;

    if (fromIdx === toIdx) return;

    const _items = [...bagItems];
    const [draggedItemContent] = _items.splice(fromIdx, 1);
    if (!draggedItemContent) return;
    _items.splice(toIdx, 0, draggedItemContent);

    await persistBagSequence(_items);
  };

  const handleMoveBagItem = async (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= bagItems.length) return;
    const _items = [...bagItems];
    const [moved] = _items.splice(idx, 1);
    _items.splice(targetIdx, 0, moved);
    await persistBagSequence(_items);
  };

  const handleCloseBuilder = async () => {
    // কোনো পুরোনো আইটেমের sort_order ০ বা ফাঁকা থাকলে বন্ধ করার আগে ১..N হিসেবে সেভ করে নেওয়া
    const needsNormalization = bagItems.some((item, idx) => Number(item.sort_order) !== idx + 1);
    if (needsNormalization && bagItems.length > 0) {
      await persistBagSequence(bagItems, true);
    }
    setIsBuilderOpen(false);
    const idsToFetch = distributionPoints.length > 0 ? distributionPoints.map(dp => dp.id) : ['NONE-NO-ACCESS'];
    await loadManifests(idsToFetch);
  };

  const filteredProducts = allProducts.filter(
    p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.code.toLowerCase().includes(productSearch.toLowerCase())
  );

  const getStatusColor = (status: string, isExpired: boolean) => {
    if (isExpired) return 'bg-rose-100 text-rose-800 border-rose-300';
    if (status === 'Active') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (status === 'Hold') return 'bg-amber-100 text-amber-800 border-amber-300';
    return 'bg-slate-100 text-slate-800 border-slate-300';
  };

  const SettingsIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );

  const preventScroll = (e: React.WheelEvent<HTMLInputElement>) => {
    (e.target as HTMLInputElement).blur();
  };

  return (
    <div className="flex flex-col h-full w-full animate-in fade-in duration-500 relative bg-slate-50">

      {/* Global style to hide number input arrows (spinners) */}
      <style dangerouslySetInnerHTML={{__html: `
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}} />

      {/* Header with Back Button */}
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 z-20 shadow-sm">
        <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div>
          <h2 className="text-lg md:text-2xl font-bold text-slate-900">Manifest Management</h2>
          <p className="text-xs md:text-sm text-slate-500 hidden md:block">Create manifests, assign products and manage display sequence</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col space-y-4 md:space-y-6 relative">

        {msg.text && (
          <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[120] p-4 rounded-xl shadow-lg border text-sm font-bold animate-in slide-in-from-top-2 flex items-center ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}
          </div>
        )}

        {/* --- TOP SECTION: CREATE FORM --- */}
        <div className="bg-gradient-to-br from-indigo-100 to-purple-50 p-5 md:p-6 rounded-2xl border border-indigo-200 shadow-md flex flex-col gap-5">

          <div className="flex justify-between items-center pb-2 border-b border-indigo-200/60">
             <h3 className="text-base md:text-lg font-black text-indigo-900 flex items-center whitespace-nowrap">
               New Manifest
             </h3>
             <button onClick={() => setIsPinPromptOpen(true)} className="p-1.5 bg-white text-indigo-600 rounded border border-indigo-200 hover:bg-indigo-50 transition-colors shrink-0 shadow-sm" title="Manage Manifest Types">
                <SettingsIcon />
             </button>
          </div>

          <form onSubmit={handleCreateManifest} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 items-end">

            <div className="lg:col-span-4">
              <label className="block text-xs font-black text-indigo-900 uppercase mb-1">Manifest Title</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full px-3 py-2.5 bg-white border-2 border-indigo-200 rounded-lg text-sm text-black font-bold outline-none focus:border-indigo-600 shadow-sm transition-colors" placeholder="e.g. Camp-04_Ext_LPGREP" />
            </div>

            <div className="lg:col-span-1">
              <label className="block text-xs font-black text-indigo-900 uppercase mb-1">Target DP</label>
              <select value={selectedDp} onChange={(e) => setSelectedDp(e.target.value)} required className="w-full px-3 py-2.5 bg-white border-2 border-indigo-200 rounded-lg text-sm text-black font-bold outline-none focus:border-indigo-600 shadow-sm cursor-pointer transition-colors">
                {distributionPoints.length === 0 ? (
                    <option value="">-- No Assigned DPs --</option>
                ) : (
                    <option value="">-- Select Target DP --</option>
                )}
                {distributionPoints.map(dp => <option key={dp.id} value={dp.id}>{dp.name}</option>)}
              </select>
            </div>

            <div className="lg:col-span-1">
              <label className="block text-xs font-black text-indigo-900 uppercase mb-1 flex justify-between items-center">
                  Type
                  {manifestTypes.filter(t => t.is_active !== false).length === 0 && <span className="text-[9px] text-rose-600 ml-2">Add Type First</span>}
              </label>
              <select value={manifestType} onChange={(e) => setManifestType(e.target.value)} required className="w-full px-3 py-2.5 bg-white border-2 border-indigo-200 rounded-lg text-sm text-black font-bold outline-none focus:border-indigo-600 shadow-sm cursor-pointer transition-colors">
                {manifestTypes.filter(t => t.is_active !== false).length === 0 ? <option value="">-- No Active Types --</option> : ''}
                {manifestTypes.filter(t => t.is_active !== false).map(type => <option key={type.id} value={type.name}>{type.name}</option>)}
              </select>
            </div>

            <div className="lg:col-span-1 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-indigo-900 uppercase mb-1">Valid From</label>
                  <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} required className="w-full px-3 py-2.5 bg-white border-2 border-indigo-200 rounded-lg text-sm text-black font-bold outline-none focus:border-indigo-600 shadow-sm transition-colors cursor-pointer" />
                </div>
                <div>
                  <label className="block text-xs font-black text-indigo-900 uppercase mb-1">Valid To</label>
                  <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} required className="w-full px-3 py-2.5 bg-white border-2 border-indigo-200 rounded-lg text-sm text-black font-bold outline-none focus:border-indigo-600 shadow-sm transition-colors cursor-pointer" />
                </div>
            </div>

            <div className="lg:col-span-1 flex gap-3">
                <div className="w-1/2">
                    <label className="block text-xs font-black text-indigo-900 uppercase mb-1">Status</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-2 py-2.5 bg-white border-2 border-indigo-200 rounded-lg text-sm text-black font-bold outline-none focus:border-indigo-600 shadow-sm cursor-pointer transition-colors">
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <button type="submit" disabled={manifestTypes.filter(t => t.is_active !== false).length === 0} className="w-1/2 text-white bg-indigo-600 hover:bg-indigo-700 py-2.5 rounded-lg text-sm font-black shadow-lg hover:shadow-xl transition-all disabled:opacity-50">
                    Create
                </button>
            </div>
          </form>
        </div>

        {/* --- BOTTOM SECTION: FILTER & LISTS --- */}
        <div className="flex flex-col space-y-6">

           {/* Responsive Filter Bar */}
           <div className="bg-gradient-to-r from-sky-100 to-cyan-100 p-4 rounded-2xl border border-sky-200 shadow-md flex flex-col xl:flex-row justify-between gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                <div>
                  <label className="block text-[10px] font-black text-sky-900 uppercase mb-1">Filter by Target DP</label>
                  <select value={filterDp} onChange={(e) => setFilterDp(e.target.value)} className="w-full px-3 py-2 bg-white border-2 border-sky-200 rounded-xl text-xs font-bold text-black outline-none focus:border-sky-500 shadow-sm cursor-pointer transition-colors">
                    {distributionPoints.length === 0 ? (
                        <option value="ALL">No Assigned DPs</option>
                    ) : (
                        <option value="ALL">All Allowed DPs</option>
                    )}
                    {distributionPoints.map(dp => <option key={dp.id} value={dp.id}>{dp.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-sky-900 uppercase mb-1">Filter by Month</label>
                  <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-full px-3 py-2 bg-white border-2 border-sky-200 rounded-xl text-xs font-bold text-black outline-none focus:border-sky-500 shadow-sm cursor-pointer transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-sky-900 uppercase mb-1">Filter by Type</label>
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full px-3 py-2 bg-white border-2 border-sky-200 rounded-xl text-xs font-bold text-black outline-none focus:border-sky-500 shadow-sm cursor-pointer transition-colors">
                    <option value="ALL">All Types</option>
                    {manifestTypes.map(type => <option key={type.id} value={type.name}>{type.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-sky-900 uppercase mb-1 whitespace-nowrap overflow-hidden text-ellipsis">Search Manifest</label>
                  <input type="text" placeholder="Type to search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-3 py-2 bg-white border-2 border-sky-200 rounded-xl text-xs font-bold text-black outline-none focus:border-sky-500 shadow-sm transition-colors" />
                </div>
              </div>
              <div className="flex space-x-2 shrink-0 items-end justify-end mt-2 xl:mt-0">
                <button onClick={handleExportExcel} disabled={filteredData.length === 0} className="px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-600 transition-colors flex items-center shadow-md disabled:opacity-50 h-9">
                  <Icons.Download /> <span className="ml-1">Excel</span>
                </button>
                <button onClick={handleExportPDF} disabled={filteredData.length === 0} className="px-4 py-2 bg-rose-500 text-white text-xs font-bold rounded-xl hover:bg-rose-600 transition-colors flex items-center shadow-md disabled:opacity-50 h-9">
                  <Icons.Download /> <span className="ml-1">PDF</span>
                </button>
              </div>
           </div>

           {/* Section 1: Active Manifests (With Drag & Drop + Arrange Sequence Modal) */}
           <div className="bg-emerald-50 rounded-2xl border-2 border-emerald-200 shadow-md overflow-hidden flex flex-col h-fit">
             <div className="bg-emerald-100 p-4 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-2">
               <div className="flex items-center gap-2">
                 <h3 className="font-black text-emerald-900 text-sm uppercase tracking-wide flex items-center">
                   <span className="mr-2 text-lg">🟢</span> Active &amp; Valid Manifests
                 </h3>
                 <span className="text-[10px] font-bold text-emerald-800 bg-white/80 px-2 py-0.5 rounded-full border border-emerald-200 hidden sm:inline">
                   Drag rows (≡) to reorder sequence
                 </span>
               </div>
               <div className="flex items-center gap-2">
                 {isSavingManifestOrder && (
                   <span className="text-[10px] font-bold text-emerald-800 animate-pulse">Saving order...</span>
                 )}
                 <button
                   type="button"
                   onClick={openSequenceModal}
                   disabled={manifests.filter(isManifestCurrentlyActive).length < 2}
                   className="px-3 py-1.5 bg-white text-emerald-900 border border-emerald-300 text-xs font-black rounded-lg hover:bg-emerald-600 hover:text-white transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1"
                   title="Arrange all active manifests in one list"
                 >
                   <span>⇅</span> Arrange Sequence
                 </button>
                 <span className="bg-emerald-600 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-sm">{activeSection.length}</span>
               </div>
             </div>
             <div className="w-full overflow-x-auto">
               <table className="w-full text-left">
                  <thead className="bg-white/60 border-b border-emerald-200">
                    <tr>
                      <th className="p-3 text-xs font-black text-emerald-900 uppercase w-24 text-center">Seq</th>
                      <th className="p-4 text-xs font-black text-emerald-900 uppercase w-56 lg:w-64">Manifest Title &amp; Type</th>
                      <th className="p-4 text-xs font-black text-emerald-900 uppercase w-64 lg:w-80">Target DP</th>
                      <th className="p-4 text-xs font-black text-emerald-900 uppercase">Validity Dates</th>
                      <th className="p-4 text-xs font-black text-emerald-900 uppercase text-right w-48">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-200/60" onDragOver={(e) => e.preventDefault()}>
                    {isLoading ? (
                      <tr><td colSpan={5} className="p-10 text-center"><Icons.Spinner /></td></tr>
                    ) : paginatedActive.length === 0 ? (
                      <tr><td colSpan={5} className="p-10 text-center text-sm font-bold text-emerald-700 bg-white/50">No active manifests found for this selection.</td></tr>
                    ) : (
                      paginatedActive.map((manifest, localIdx) => {
                        const globalIdx = (activePage - 1) * MANIFESTS_PER_PAGE + localIdx;
                        return (
                          <tr
                            key={manifest.id}
                            draggable
                            onDragStart={() => { dragActiveManifestItem.current = localIdx; }}
                            onDragEnter={() => { dragActiveManifestOverItem.current = localIdx; }}
                            onDragOver={(e) => e.preventDefault()}
                            onDragEnd={handleActiveManifestDragEnd}
                            className="hover:bg-white transition-colors group cursor-move"
                          >
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="text-slate-400 group-hover:text-emerald-700 text-lg leading-none select-none" title="Drag to reorder">≡</span>
                                <span className="text-[11px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300 px-1.5 py-0.5 rounded-md min-w-[26px] text-center">
                                  #{globalIdx + 1}
                                </span>
                                <div className="flex flex-col">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveActiveManifest(localIdx, 'up')}
                                    disabled={globalIdx === 0 || isSavingManifestOrder}
                                    className="text-[9px] leading-none px-1 py-0.5 text-slate-500 hover:text-emerald-800 hover:bg-emerald-100 rounded disabled:opacity-25"
                                    title="Move Up"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveActiveManifest(localIdx, 'down')}
                                    disabled={globalIdx === activeSection.length - 1 || isSavingManifestOrder}
                                    className="text-[9px] leading-none px-1 py-0.5 text-slate-500 hover:text-emerald-800 hover:bg-emerald-100 rounded disabled:opacity-25"
                                    title="Move Down"
                                  >
                                    ▼
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <p className="font-bold text-black text-sm break-words">{manifest.title}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                <span className="text-[10px] text-indigo-800 bg-indigo-100 px-1.5 py-0.5 rounded font-black border border-indigo-200">{manifest.manifest_type}</span>
                              </div>
                            </td>
                            <td className="p-4">
                               <p className="font-bold text-black text-sm leading-tight break-words">{manifest.distribution_points?.name || 'Unassigned'}</p>
                               <p className="text-[10px] text-slate-500 font-mono mt-0.5 font-bold">{manifest.distribution_points?.code || ''}</p>
                            </td>
                            <td className="p-4">
                               <div className="flex items-center space-x-2">
                                 <div>
                                   <p className="text-xs font-bold text-black">{new Date(manifest.valid_from).toLocaleDateString()}</p>
                                   <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">TO {new Date(manifest.valid_to).toLocaleDateString()}</p>
                                 </div>
                               </div>
                            </td>
                            <td className="p-4 text-right">
                               <div className="flex items-center justify-end space-x-2">
                                 <button onClick={() => openDetailsView(manifest)} className="px-2 py-1.5 bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black rounded-lg hover:bg-emerald-200 transition-colors flex items-center shadow-sm" title="Details">
                                   <span>👁️</span>
                                 </button>
                                 <button onClick={() => openManifestBuilder(manifest)} className="px-3 py-1.5 bg-slate-900 text-white text-[10px] font-black rounded-lg hover:bg-black transition-colors flex items-center shadow-sm whitespace-nowrap">
                                   Items Builder
                                 </button>
                                 <button onClick={() => openEditModal(manifest)} className="p-1.5 text-amber-600 hover:bg-amber-100 rounded-md border border-transparent hover:border-amber-300 transition-colors" title="Edit Manifest"><Icons.Edit /></button>
                                 <button onClick={() => handleDeleteManifest(manifest.id)} className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-md border border-transparent hover:border-rose-300 transition-colors" title="Delete Manifest"><Icons.Trash /></button>
                               </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
               </table>
             </div>
             {/* Pagination for Active Manifests */}
             {activeSection.length > MANIFESTS_PER_PAGE && (
               <div className="flex justify-between items-center p-3 bg-white/60 border-t border-emerald-200">
                 <span className="text-xs font-bold text-emerald-800 ml-2">Page {activePage} of {totalActivePages}</span>
                 <div className="flex space-x-2 mr-2">
                   <button onClick={() => setActivePage(p => Math.max(1, p - 1))} disabled={activePage === 1} className="px-3 py-1.5 bg-white border-2 border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 text-emerald-900 text-xs font-black rounded-lg transition-colors">Prev</button>
                   <button onClick={() => setActivePage(p => Math.min(totalActivePages, p + 1))} disabled={activePage === totalActivePages} className="px-3 py-1.5 bg-white border-2 border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 text-emerald-900 text-xs font-black rounded-lg transition-colors">Next</button>
                 </div>
               </div>
             )}
           </div>

           {/* Section 2: Expired, Hold, Inactive */}
           <div className="bg-slate-100/80 rounded-2xl border-2 border-slate-300 shadow-md overflow-hidden flex flex-col h-fit">
             <div className="bg-slate-200 p-4 border-b border-slate-300 flex items-center justify-between">
               <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide flex items-center">
                 <span className="mr-2 text-lg">⏸️</span> Expired, Hold &amp; Inactive
               </h3>
               <span className="bg-slate-400 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-sm">{inactiveSection.length}</span>
             </div>
             <div className="w-full overflow-x-auto">
               <table className="w-full text-left">
                  <thead className="bg-white/40 border-b border-slate-300">
                    <tr>
                      <th className="p-4 text-xs font-black text-slate-700 uppercase w-56 lg:w-64">Manifest Title &amp; Type</th>
                      <th className="p-4 text-xs font-black text-slate-700 uppercase w-64 lg:w-80">Target DP</th>
                      <th className="p-4 text-xs font-black text-slate-700 uppercase">Validity &amp; Status</th>
                      <th className="p-4 text-xs font-black text-slate-700 uppercase text-right w-48">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300/50">
                    {isLoading ? (
                      <tr><td colSpan={4} className="p-10 text-center"><Icons.Spinner /></td></tr>
                    ) : paginatedInactive.length === 0 ? (
                      <tr><td colSpan={4} className="p-10 text-center text-sm font-bold text-slate-600 bg-white/40">No inactive manifests found for this selection.</td></tr>
                    ) : (
                      paginatedInactive.map((manifest) => {
                        const validToDate = new Date(manifest.valid_to);
                        validToDate.setHours(0, 0, 0, 0);
                        const isExpired = validToDate < todayDate;
                        const statusColor = getStatusColor(manifest.status, isExpired);
                        const displayStatus = isExpired && manifest.status === 'Active' ? 'Expired' : manifest.status;

                        return (
                        <tr key={manifest.id} className="hover:bg-white transition-colors group grayscale-[15%]">
                          <td className="p-4">
                            <p className="font-bold text-black text-sm break-words">{manifest.title}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className="text-[10px] text-slate-700 bg-slate-200 px-1.5 py-0.5 rounded font-black border border-slate-300">{manifest.manifest_type}</span>
                            </div>
                          </td>
                          <td className="p-4">
                             <p className="font-bold text-black text-sm leading-tight break-words">{manifest.distribution_points?.name || 'Unassigned'}</p>
                             <p className="text-[10px] text-slate-500 font-mono mt-0.5 font-bold">{manifest.distribution_points?.code || ''}</p>
                          </td>
                          <td className="p-4">
                             <div className="flex items-center space-x-2">
                               <div>
                                 <p className="text-xs font-bold text-black">{new Date(manifest.valid_from).toLocaleDateString()}</p>
                                 <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">TO {new Date(manifest.valid_to).toLocaleDateString()}</p>
                               </div>
                               <span className={`text-[10px] font-black px-2 py-1 rounded-full border ${statusColor}`}>
                                 {displayStatus}
                               </span>
                             </div>
                          </td>
                          <td className="p-4 text-right">
                             <div className="flex items-center justify-end space-x-2">
                               <button onClick={() => openDetailsView(manifest)} className="px-2 py-1.5 bg-slate-200 text-slate-800 border border-slate-300 text-[10px] font-black rounded-lg hover:bg-slate-300 transition-colors flex items-center shadow-sm" title="Details">
                                 <span>👁️</span>
                               </button>
                               <button onClick={() => openEditModal(manifest)} className="p-1.5 text-amber-600 hover:bg-amber-200 rounded-md border border-transparent hover:border-amber-300 transition-colors" title="Edit Manifest"><Icons.Edit /></button>
                               <button onClick={() => handleDeleteManifest(manifest.id)} className="p-1.5 text-rose-600 hover:bg-rose-200 rounded-md border border-transparent hover:border-rose-300 transition-colors" title="Delete Manifest"><Icons.Trash /></button>
                             </div>
                          </td>
                        </tr>
                      );})
                    )}
                  </tbody>
               </table>
             </div>
             {/* Pagination for Inactive Manifests */}
             {inactiveSection.length > MANIFESTS_PER_PAGE && (
               <div className="flex justify-between items-center p-3 bg-white/40 border-t border-slate-300">
                 <span className="text-xs font-bold text-slate-600 ml-2">Page {inactivePage} of {totalInactivePages}</span>
                 <div className="flex space-x-2 mr-2">
                   <button onClick={() => setInactivePage(p => Math.max(1, p - 1))} disabled={inactivePage === 1} className="px-3 py-1.5 bg-white border-2 border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-900 text-xs font-black rounded-lg transition-colors">Prev</button>
                   <button onClick={() => setInactivePage(p => Math.min(totalInactivePages, p + 1))} disabled={inactivePage === totalInactivePages} className="px-3 py-1.5 bg-white border-2 border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-900 text-xs font-black rounded-lg transition-colors">Next</button>
                 </div>
               </div>
             )}
           </div>

        </div>
      </div>

      {/* ---------------- ARRANGE MANIFEST SEQUENCE MODAL ---------------- */}
      {isSequenceModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95">
            <div className="p-5 border-b border-emerald-200 bg-emerald-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-black text-lg text-emerald-950 flex items-center gap-2">
                  <span>⇅</span> Arrange Manifest Sequence
                </h3>
                <p className="text-xs text-emerald-800 font-semibold mt-0.5">
                  Drag &amp; drop or use arrows to set the exact order shown on Daily Distribution Report
                </p>
              </div>
              <button onClick={() => setIsSequenceModalOpen(false)} className="p-1.5 bg-white border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100">
                <Icons.Close />
              </button>
            </div>

            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
              <label className="text-xs font-black text-slate-600 uppercase">Filter by Target DP:</label>
              <select
                value={sequenceModalDp}
                onChange={(e) => handleSequenceModalDpChange(e.target.value)}
                className="sm:w-72 px-3 py-2 bg-white border-2 border-emerald-200 rounded-xl text-xs font-bold text-black outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="ALL">All Allowed DPs</option>
                {distributionPoints.map(dp => (
                  <option key={dp.id} value={dp.id}>{dp.name}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-slate-50/50" onDragOver={(e) => e.preventDefault()}>
              {sequenceModalItems.length === 0 ? (
                <div className="text-center py-10 text-sm font-bold text-slate-400">
                  No active manifests found for this DP.
                </div>
              ) : (
                sequenceModalItems.map((m, idx) => (
                  <div
                    key={m.id}
                    draggable
                    onDragStart={() => { dragSeqModalItem.current = idx; }}
                    onDragEnter={() => { dragSeqModalOverItem.current = idx; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnd={handleSeqModalDragEnd}
                    className="flex items-center justify-between gap-3 p-3 bg-white border-2 border-slate-200 hover:border-emerald-400 rounded-xl shadow-xs cursor-move group transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-slate-400 group-hover:text-emerald-700 text-xl select-none">≡</span>
                      <span className="text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded-lg shrink-0">
                        #{idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900 text-sm truncate">{m.title}</p>
                        <p className="text-[10px] font-bold text-slate-500 truncate">
                          {m.distribution_points?.name || 'Unassigned'} • <span className="text-indigo-700">{m.manifest_type}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveSeqModalItem(idx, 'up')}
                        disabled={idx === 0}
                        className="px-2 py-1 bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-900 rounded-lg text-xs font-black disabled:opacity-30"
                        title="Move Up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveSeqModalItem(idx, 'down')}
                        disabled={idx === sequenceModalItems.length - 1}
                        className="px-2 py-1 bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-900 rounded-lg text-xs font-black disabled:opacity-30"
                        title="Move Down"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsSequenceModalOpen(false)}
                disabled={isSavingManifestOrder}
                className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSequenceModal}
                disabled={isSavingManifestOrder || sequenceModalItems.length === 0}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md disabled:opacity-50"
              >
                {isSavingManifestOrder ? 'Saving...' : '✓ Save Sequence'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- PIN PROMPT MODAL ---------------- */}
      {isPinPromptOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
             <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
               <h3 className="font-bold text-lg text-black">Security Verification</h3>
               <button onClick={() => { setIsPinPromptOpen(false); setPinInput(''); }} className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg"><Icons.Close /></button>
             </div>
             <div className="p-5">
               <p className="text-xs text-slate-600 mb-4 font-bold text-center">Enter Admin PIN to manage Manifest Types</p>
               <input
                 type="password"
                 autoFocus
                 value={pinInput}
                 onChange={e => setPinInput(e.target.value)}
                 className="w-full p-4 bg-white border-2 border-indigo-200 rounded-xl text-center text-2xl tracking-[0.5em] text-black font-black focus:border-indigo-600 outline-none mb-4"
               />
               <button onClick={handleVerifyPin} className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-md">Verify PIN</button>
             </div>
          </div>
        </div>
      )}

      {/* ---------------- MANAGE TYPES MODAL ---------------- */}
      {isManageTypesOpen && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
             <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
               <div>
                 <h3 className="font-bold text-lg text-black">Manage Types</h3>
                 <p className="text-[10px] text-slate-600 mt-0.5 font-bold">Add, edit, reorder or toggle visibility of Types</p>
               </div>
               <button onClick={() => setIsManageTypesOpen(false)} className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-100"><Icons.Close /></button>
             </div>

             <div className="p-5">
               <form onSubmit={handleAddManifestType} className="flex space-x-2 mb-6">
                 <input
                    type="text"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    placeholder="E.g. Relief, Medical..."
                    required
                    className="flex-1 px-3 py-2.5 bg-white border-2 border-indigo-200 rounded-lg text-sm text-black font-bold outline-none focus:border-indigo-600 shadow-sm"
                 />
                 <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-lg text-sm hover:bg-indigo-700 shadow-sm shrink-0">Add</button>
               </form>

               <div
                  className="max-h-[50vh] overflow-y-auto custom-scrollbar border-2 border-slate-200 rounded-xl divide-y divide-slate-200"
                  onDragOver={(e) => e.preventDefault()}
               >
                  {manifestTypes.length === 0 ? (
                     <div className="p-4 text-center text-sm text-slate-400 font-bold">No types available.</div>
                  ) : (
                     manifestTypes.map((type, index) => (
                       <div
                         key={type.id}
                         draggable={editingType !== type.id}
                         onDragStart={() => { dragTypeItem.current = index; }}
                         onDragEnter={() => { dragTypeOverItem.current = index; }}
                         onDragOver={(e) => e.preventDefault()}
                         onDragEnd={handleTypeSort}
                         className="flex justify-between items-center p-3 hover:bg-slate-50 group transition-colors cursor-move bg-white"
                       >
                          {editingType === type.id ? (
                             <div className="flex flex-1 items-center space-x-2">
                               <input
                                 type="text"
                                 value={editTypeValue}
                                 onChange={e => setEditTypeValue(e.target.value)}
                                 className="flex-1 px-2 py-1.5 border-2 border-indigo-400 rounded text-sm font-bold text-black outline-none focus:border-indigo-600 shadow-sm"
                                 autoFocus
                               />
                               <button onClick={() => handleEditManifestType(type.id)} className="text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded text-xs font-bold shadow-sm">Save</button>
                               <button onClick={() => setEditingType(null)} className="text-slate-600 bg-slate-200 hover:bg-slate-300 px-3 py-1.5 rounded text-xs font-bold">Cancel</button>
                             </div>
                          ) : (
                             <>
                                <div className="flex items-center space-x-3 flex-1 overflow-hidden pr-2">
                                   <span className="text-slate-300 cursor-move text-xl opacity-50 group-hover:opacity-100 transition-opacity">≡</span>
                                   <span className={`font-black text-sm truncate ${type.is_active === false ? 'text-slate-400 line-through' : 'text-black'}`}>{type.name}</span>
                                </div>
                                <div className="flex items-center space-x-2 shrink-0">
                                   <button
                                      onClick={() => handleToggleTypeStatus(type.id, type.is_active !== false)}
                                      className={`text-[10px] px-2 py-1 rounded font-black border transition-colors ${type.is_active !== false ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200' : 'bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300'}`}
                                      title="Toggle Active/Inactive"
                                   >
                                      {type.is_active !== false ? 'Active' : 'Inactive'}
                                   </button>
                                   <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 border-l border-slate-300 pl-2">
                                      <button onClick={() => { setEditingType(type.id); setEditTypeValue(type.name); }} className="text-amber-600 hover:text-amber-800 p-1 bg-amber-100 rounded hover:bg-amber-200 transition-colors" title="Edit Name">
                                         <Icons.Edit />
                                      </button>
                                      <button onClick={() => handleDeleteManifestType(type.id, type.name)} className="text-rose-600 hover:text-rose-800 p-1 bg-rose-100 rounded hover:bg-rose-200 transition-colors" title="Permanent Hard Delete">
                                         <Icons.Trash />
                                      </button>
                                   </div>
                                </div>
                             </>
                          )}
                       </div>
                     ))
                  )}
               </div>
             </div>
          </div>
         </div>
      )}

      {/* ---------------- EDIT MODAL ---------------- */}
      {isEditModalOpen && manifestToEdit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg text-black">Edit Manifest</h3>
                <p className="text-xs text-indigo-600 font-mono mt-1 font-black">{manifestToEdit.manifest_code}</p>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-100"><Icons.Close /></button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
               <div>
                 <label className="block text-xs font-black text-indigo-900 uppercase mb-1">Manifest Title</label>
                 <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required className="w-full px-3 py-2.5 bg-white border-2 border-indigo-200 rounded-lg text-sm text-black font-bold outline-none focus:border-indigo-600 shadow-sm" />
               </div>

               <div>
                 <label className="block text-xs font-black text-indigo-900 uppercase mb-1">Type</label>
                 <select value={editManifestType} onChange={(e) => setEditManifestType(e.target.value)} className="w-full px-3 py-2.5 bg-white border-2 border-indigo-200 rounded-lg text-sm text-black font-bold outline-none focus:border-indigo-600 shadow-sm cursor-pointer">
                   {!manifestTypes.filter(t => t.is_active !== false).find(t => t.name === editManifestType) && <option value={editManifestType}>{editManifestType} (Legacy/Inactive)</option>}
                   {manifestTypes.filter(t => t.is_active !== false).map(type => <option key={type.id} value={type.name}>{type.name}</option>)}
                 </select>
               </div>

               <div>
                 <label className="block text-xs font-black text-indigo-900 uppercase mb-1">Status</label>
                 <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="w-full px-3 py-2.5 bg-white border-2 border-indigo-200 rounded-lg text-sm text-black font-bold outline-none focus:border-indigo-600 shadow-sm cursor-pointer">
                   {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
               </div>

               <div>
                 <label className="block text-xs font-black text-indigo-900 uppercase mb-1">Distribution Point</label>
                 <select value={editSelectedDp} onChange={(e) => setEditSelectedDp(e.target.value)} required className="w-full px-3 py-2.5 bg-white border-2 border-indigo-200 rounded-lg text-sm text-black font-bold outline-none focus:border-indigo-600 shadow-sm cursor-pointer">
                   <option value="">-- Select Point --</option>
                   {distributionPoints.map(dp => <option key={dp.id} value={dp.id}>{dp.name}</option>)}
                 </select>
               </div>

               <div className="grid grid-cols-2 gap-3">
                 <div>
                   <label className="block text-xs font-black text-indigo-900 uppercase mb-1">Valid From</label>
                   <input type="date" value={editValidFrom} onChange={(e) => setEditValidFrom(e.target.value)} required className="w-full px-3 py-2.5 bg-white border-2 border-indigo-200 rounded-lg text-sm text-black font-bold outline-none focus:border-indigo-600 shadow-sm cursor-pointer" />
                 </div>
                 <div>
                   <label className="block text-xs font-black text-indigo-900 uppercase mb-1">Valid To</label>
                   <input type="date" value={editValidTo} onChange={(e) => setEditValidTo(e.target.value)} required className="w-full px-3 py-2.5 bg-white border-2 border-indigo-200 rounded-lg text-sm text-black font-bold outline-none focus:border-indigo-600 shadow-sm cursor-pointer" />
                 </div>
               </div>

               <button type="submit" disabled={isSubmittingEdit} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-md flex justify-center items-center mt-4 disabled:opacity-50">
                 {isSubmittingEdit ? <><Icons.Spinner /> Saving...</> : 'Save Changes'}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- DETAILS MODAL ---------------- */}
      {isDetailsOpen && activeManifest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 mt-16 md:mt-0">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] md:max-h-[90vh] animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg text-black">{activeManifest.title}</h3>
                <p className="text-xs text-indigo-600 font-mono mt-1 font-black">{activeManifest.manifest_code}</p>
              </div>
              <button onClick={() => setIsDetailsOpen(false)} className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-100"><Icons.Close /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-slate-50/50">

                <div className="bg-white p-4 rounded-xl border-2 border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4 shadow-sm mb-2">
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase">Target DP</p>
                    <p className="font-black text-black text-sm">{activeManifest.distribution_points?.name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase">Type</p>
                    <p className="font-black text-black text-sm">{activeManifest.manifest_type}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase">Validity</p>
                    <p className="font-black text-black text-xs">{new Date(activeManifest.valid_from).toLocaleDateString()} to {new Date(activeManifest.valid_to).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase">Status</p>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded border inline-block mt-0.5 ${getStatusColor(activeManifest.status, new Date(activeManifest.valid_to) < new Date(new Date().setHours(0, 0, 0, 0)))}`}>
                      {new Date(activeManifest.valid_to) < new Date(new Date().setHours(0, 0, 0, 0)) ? 'Expired' : activeManifest.status}
                    </span>
                  </div>
                </div>

                {detailsItems.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 font-bold">No items assigned to this manifest yet.</div>
                ) : (
                  detailsItems.map((item, idx) => {
                    const isTargetless = item.target_qty === 0;
                    const progress = isTargetless ? 0 : Math.min(100, ((item.distributed_qty || 0) / item.target_qty) * 100);

                    return (
                      <div key={idx} className="border-2 border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:border-indigo-300 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-black text-black">
                              <span className="text-xs text-indigo-600 mr-1.5">#{idx + 1}</span>
                              {item.products.name}
                            </p>
                            <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded mt-1 inline-block border ${item.products.product_type === 'LPG' ? 'bg-orange-100 text-orange-800 border-orange-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300'}`}>
                              {item.products.product_type} | {item.products.unit_type}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-black">
                              Distributed: <span className="text-emerald-600 text-lg font-black ml-1">{item.distributed_qty || 0}</span>
                              {!isTargetless && <span className="text-slate-500 text-xs font-bold ml-1">/ {item.target_qty}</span>}
                            </p>
                            {isTargetless ? (
                              <p className="text-[10px] font-black text-indigo-700 mt-0.5 bg-indigo-100 px-2 py-0.5 rounded inline-block border border-indigo-300">OPEN TARGET</p>
                            ) : (
                              <p className="text-[10px] font-black text-slate-500 mt-0.5">{progress.toFixed(1)}% Completed</p>
                            )}
                          </div>
                        </div>

                        {!isTargetless && (
                          <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                            <div className={`h-2.5 rounded-full transition-all duration-1000 ${progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progress}%` }}></div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- BUILDER MODAL ---------------- */}
      {isBuilderOpen && activeManifest && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900/70 backdrop-blur-sm p-2 md:p-6 mt-16 md:mt-0">
          <div className="bg-white w-full max-w-6xl mx-auto rounded-xl shadow-2xl border border-slate-200 flex flex-col flex-1 overflow-hidden h-full animate-in zoom-in-95">
            <div className="p-3 md:p-4 border-b border-slate-200 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2">
                <span className="text-xl">📋</span>
                <div>
                  <h3 className="font-bold text-sm md:text-lg text-white">Manifest Items Builder</h3>
                  <p className="text-[10px] md:text-xs text-emerald-400 font-bold">Editing items for: <span className="font-black text-white">{activeManifest.title}</span></p>
                </div>
              </div>
              <button onClick={handleCloseBuilder} className="text-white bg-slate-800 p-1.5 rounded-lg hover:bg-slate-700 transition-colors"><Icons.Close /></button>
            </div>

            <div className="flex-1 flex flex-col md:flex-row bg-slate-100 overflow-hidden">
              <div className="w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-white md:h-full h-1/2">
                <div className="p-3 md:p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-black text-slate-800 text-xs uppercase">Available</h4>
                    <div className="flex bg-slate-200 rounded-lg p-0.5 shadow-inner">
                      <button onClick={() => setActiveTab('products')} className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${activeTab === 'products' ? 'bg-white text-black shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Products</button>
                      <button onClick={() => setActiveTab('packages')} className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${activeTab === 'packages' ? 'bg-white text-black shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Packages</button>
                    </div>
                  </div>
                  {activeTab === 'products' && (
                    <input type="text" placeholder="Search items by name or code..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="w-full px-3 py-2 bg-white border-2 border-slate-300 rounded-lg text-xs font-bold text-black outline-none focus:border-indigo-500 shadow-sm" />
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                  {activeTab === 'products' ? (
                    filteredProducts.map(product => (
                      <div key={product.id} className="flex items-center justify-between p-3 border-2 border-slate-200 rounded-xl bg-slate-50 hover:border-indigo-300 transition-colors">
                        <div className="flex items-center space-x-2 truncate pr-2">
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase border ${product.product_type === 'LPG' ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}`}>{product.product_type}</span>
                          <div className="truncate">
                            <p className="font-black text-black text-xs truncate">{product.name}</p>
                            <p className="text-[9px] text-slate-600 font-mono mt-0.5 font-bold">Code: {product.code} | Unit: {product.unit_type}</p>
                          </div>
                        </div>
                        <button onClick={() => handleAddToBag(product)} className="w-8 h-8 rounded-lg bg-white border-2 border-slate-200 text-indigo-700 flex items-center justify-center shrink-0 hover:border-indigo-500 hover:bg-indigo-50 transition-colors shadow-sm"><Icons.Plus /></button>
                      </div>
                    ))
                  ) : (
                    allPackages.map(pkg => (
                      <div key={pkg.id} className="p-3 border-2 border-indigo-200 rounded-xl bg-indigo-50/50">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-black text-indigo-900 text-xs">{pkg.group_name}</p>
                            <p className="text-[9px] text-slate-600 mt-0.5 font-bold">Contains {pkg.product_group_items.length} items</p>
                          </div>
                          <button onClick={() => handleAddPackageToBag(pkg)} className="px-2 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 transition-colors shadow-sm">+ ADD FULL PACK</button>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                           {pkg.product_group_items.map((pi: any, idx: number) => (
                              <span key={idx} className="text-[8px] bg-white border border-slate-300 text-black font-bold px-1.5 py-0.5 rounded">{pi.products.name}</span>
                           ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="w-full md:w-1/2 flex flex-col bg-slate-50 md:h-full h-1/2">
                <div className="p-3 md:p-4 border-b border-indigo-200 bg-indigo-100 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-black text-indigo-900 text-xs uppercase flex items-center"><span className="mr-2 text-base">📥</span> Manifest Bag</h4>
                    <span className="text-[10px] font-bold text-indigo-700 hidden sm:inline">(Drag ≡ or use ▲▼ to set sequence)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSavingBagOrder && <span className="text-[10px] font-bold text-indigo-700 animate-pulse">Saving...</span>}
                    <span className="bg-indigo-600 text-white text-[10px] font-black px-2 py-1 rounded-full shadow-sm">{bagItems.length} Added</span>
                  </div>
                </div>

                <div
                  className="flex-1 overflow-y-auto p-3 space-y-3 relative custom-scrollbar"
                  onDragOver={(e) => e.preventDefault()}
                >
                  {bagItems.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-center p-4">
                      <span className="text-4xl mb-3 opacity-50">📦</span>
                      <p className="text-xs font-bold text-slate-500">Bag is empty</p>
                    </div>
                  ) : (
                    bagItems.map((item, index) => (
                      <div
                        key={item.db_id}
                        draggable
                        onDragStart={() => { dragBagItem.current = index; }}
                        onDragEnter={() => { dragBagOverItem.current = index; }}
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnd={handleBagSort}
                        className="bg-white p-3 rounded-xl border-2 border-indigo-100 shadow-sm relative cursor-move group hover:border-indigo-400 transition-colors"
                      >
                        <div className="flex justify-between items-start mb-3 border-b border-slate-100 pb-2">
                          <div className="pr-16 flex space-x-2 items-start">
                            <div className="flex flex-col items-center mr-1">
                              <span className="text-slate-400 group-hover:text-indigo-600 cursor-move text-lg leading-none transition-colors">≡</span>
                              <span className="text-[9px] font-black bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded mt-1">#{index + 1}</span>
                            </div>
                            <div>
                              <p className="font-black text-black text-xs leading-tight">{item.name}</p>
                              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase mt-1 inline-block border ${item.product_type === 'LPG' ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}`}>{item.product_type}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 absolute top-2 right-2">
                            <button
                              type="button"
                              onClick={() => handleMoveBagItem(index, 'up')}
                              disabled={index === 0 || isSavingBagOrder}
                              className="px-1.5 py-1 bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-800 rounded text-[10px] font-black disabled:opacity-30"
                              title="Move Up"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveBagItem(index, 'down')}
                              disabled={index === bagItems.length - 1 || isSavingBagOrder}
                              className="px-1.5 py-1 bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-800 rounded text-[10px] font-black disabled:opacity-30"
                              title="Move Down"
                            >
                              ▼
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFromBag(item.db_id)}
                              className="text-rose-500 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 p-1.5 rounded-lg transition-colors shadow-sm"
                              title="Remove from bag"
                            >
                              <Icons.Trash />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border-2 border-slate-200 ml-7">
                          <span className="text-[10px] font-black text-slate-600 uppercase">Target Qty:</span>
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              min="0"
                              placeholder="0 = Open"
                              value={item.target_qty || ''}
                              onChange={(e) => handleUpdateQty(item.db_id, e.target.value)}
                              onWheel={preventScroll}
                              className="w-20 text-right px-2 py-1 bg-white border-2 border-slate-300 rounded-md text-xs font-bold text-black outline-none focus:border-indigo-600 shadow-sm"
                            />
                            <span className="text-[9px] font-black text-slate-500 uppercase w-8">{item.unit_type}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-3 bg-white border-t border-slate-200">
                  <button
                    type="button"
                    onClick={handleCloseBuilder}
                    disabled={isSavingBagOrder}
                    className="w-full bg-slate-900 hover:bg-black text-white font-bold py-2.5 rounded-xl text-sm transition-all shadow-md flex items-center justify-center disabled:opacity-50"
                  >
                    {isSavingBagOrder ? 'Saving Sequence...' : '✅ Done & Close Builder'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}