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

export default function ManifestsPage() {
  const [manifests, setManifests] = useState<any[]>([]);
  const [distributionPoints, setDistributionPoints] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [allPackages, setAllPackages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dynamic Manifest Types State (Strictly Database Driven)
  const [manifestTypes, setManifestTypes] = useState<any[]>([]);
  const [isManageTypesOpen, setIsManageTypesOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editTypeValue, setEditTypeValue] = useState('');
  
  // Security PIN State for Types
  const [isPinPromptOpen, setIsPinPromptOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');

  // Filters
  const [filterDp, setFilterDp] = useState('ALL');
  const [filterMonth, setFilterMonth] = useState(''); 
  const [filterType, setFilterType] = useState('ALL'); 
  const [searchTerm, setSearchTerm] = useState('');

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

  // Drag and Drop Refs
  const dragTypeItem = useRef<number | null>(null);
  const dragTypeOverItem = useRef<number | null>(null);
  const dragBagItem = useRef<number | null>(null);
  const dragBagOverItem = useRef<number | null>(null);

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
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    setFilterMonth(`${yyyy}-${mm}`);

    fetchInitialData();
    generateAutoCode();
  }, []);

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

    const { data: { user } } = await supabase.auth.getUser();
    let profileData: any = null;
    if (user) {
      setCurrentUser(user);
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (prof) profileData = prof;
    }

    const { data: dpData } = await supabase.from('distribution_points').select('id, name, code').order('name');
    let allowedDps = dpData || [];
    
    if (profileData && profileData.role !== 'Super Admin' && Array.isArray(profileData.assigned_dp_ids) && profileData.assigned_dp_ids.length > 0) {
      allowedDps = allowedDps.filter(dp => profileData.assigned_dp_ids.includes(dp.id));
    }
    
    setDistributionPoints(allowedDps);
    await loadManifests(allowedDps.map(dp => dp.id));
    setIsLoading(false);
  };

  const loadManifestTypes = async () => {
     const { data, error } = await supabase.from('manifest_types').select('*').order('sort_order');
     
     if (error) {
         console.error("Error loading manifest types:", error);
         showMessage("Database table 'manifest_types' not found or RLS is blocking access!", "error");
         return;
     }

     if (data) {
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
              // Reactivate existing inactive type
              const { error } = await supabase.from('manifest_types').update({ is_active: true }).eq('id', existingType.id);
              if (error) {
                  showMessage(`Error activating type: ${error.message}`, "error");
                  return;
              }
              const updatedTypes = manifestTypes.map(t => t.id === existingType.id ? { ...t, is_active: true } : t);
              setManifestTypes(updatedTypes);
              setManifestType(existingType.name);
              setNewTypeName('');
              showMessage(`"${typeName}" was inactive and has been reactivated successfully!`);
          } else {
              alert('This Type already exists and is active!');
          }
          return;
      }
      
      // If truly new, Insert it
      const newOrder = manifestTypes.length;
      const newTypeObj = { name: typeName, sort_order: newOrder, is_active: true };
      
      const { data, error } = await supabase.from('manifest_types').insert([newTypeObj]).select();
      
      if (error) {
          showMessage(`Error adding type: ${error.message}`, "error");
          return;
      }
      
      if (data && data.length > 0) {
          setManifestTypes([...manifestTypes, data[0]]);
          setManifestType(data[0].name);
          setNewTypeName('');
          showMessage(`Type "${typeName}" added successfully!`);
      }
  };
  
  const handleEditManifestType = async (id: string) => {
      if (!editTypeValue.trim()) return;
      
      const { error } = await supabase.from('manifest_types').update({ name: editTypeValue }).eq('id', id);
      
      if (error) {
          showMessage(`Error: ${error.message}`, "error");
          return;
      }

      const updatedTypes = manifestTypes.map(t => t.id === id ? { ...t, name: editTypeValue } : t);
      setManifestTypes(updatedTypes);
      
      if (manifestType === manifestTypes.find(t => t.id === id)?.name) {
          setManifestType(editTypeValue);
      }
      setEditingType(null);
      showMessage(`Type updated successfully!`);
  };

  const handleToggleTypeStatus = async (id: string, currentStatus: boolean) => {
      const newStatus = !currentStatus;
      const { error } = await supabase.from('manifest_types').update({ is_active: newStatus }).eq('id', id);
      
      if (error) {
          showMessage(`Error: ${error.message}`, "error");
          return;
      }

      const updatedTypes = manifestTypes.map(t => t.id === id ? { ...t, is_active: newStatus } : t);
      setManifestTypes(updatedTypes);
  };

  const handleDeleteManifestType = async (id: string, typeName: string) => {
      if(!confirm(`Hard delete "${typeName}"? If this is used in old records, it's safer to just set it to 'Inactive'. Proceed with hard delete?`)) return;
      
      const { error } = await supabase.from('manifest_types').delete().eq('id', id);
      if (error) {
          showMessage(`Error: ${error.message}`, "error");
          return;
      }

      const newTypes = manifestTypes.filter(t => t.id !== id);
      setManifestTypes(newTypes);
      
      if (manifestType === typeName) {
          const activeTypes = newTypes.filter(t => t.is_active);
          setManifestType(activeTypes.length > 0 ? activeTypes[0].name : '');
      }
      showMessage(`Type "${typeName}" completely removed.`);
  };

  const handleTypeSort = async () => {
    if (dragTypeItem.current === null || dragTypeOverItem.current === null) return;
    let _types = [...manifestTypes];
    const draggedItemContent = _types.splice(dragTypeItem.current, 1)[0];
    _types.splice(dragTypeOverItem.current, 0, draggedItemContent);
    
    dragTypeItem.current = null;
    dragTypeOverItem.current = null;
    
    setManifestTypes(_types);
    
    // Save new order to DB directly
    for (let i = 0; i < _types.length; i++) {
        await supabase.from('manifest_types').update({ sort_order: i }).eq('id', _types[i].id);
    }
  };

  const loadManifests = async (allowedDpIds: string[]) => {
    if (allowedDpIds.length === 0) { setManifests([]); return; }
    const { data } = await supabase.from('manifests')
      .select(`*, distribution_points (id, name, code), manifest_items (target_qty, distributed_qty, products (name))`)
      .in('distribution_point_id', allowedDpIds)
      .order('valid_to', { ascending: false }); 
    if (data) setManifests(data);
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
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  const activeSection = filteredData.filter(m => {
    const validToDate = new Date(m.valid_to);
    validToDate.setHours(0, 0, 0, 0);
    return m.status === 'Active' && validToDate >= todayDate;
  });

  const inactiveSection = filteredData.filter(m => {
    const validToDate = new Date(m.valid_to);
    validToDate.setHours(0, 0, 0, 0);
    return m.status !== 'Active' || validToDate < todayDate;
  });

  // --- Export Logic ---
  const handleExportExcel = () => {
    const [year, monthNum] = filterMonth ? filterMonth.split('-') : ['', ''];
    const monthName = filterMonth ? new Date(parseInt(year), parseInt(monthNum) - 1, 1).toLocaleString('default', { month: 'long' }) : 'All Time';
    const displayYear = filterMonth ? year : 'All';
    const exportData: any[] = [];
    filteredData.forEach(m => {
      const validToDate = new Date(m.valid_to);
      validToDate.setHours(0,0,0,0);
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
          tableRows.push([ monthName, displayYear, m.title, m.distribution_points?.name || 'N/A', mi.products?.name || 'Unknown', target === 0 ? 'Open' : target, achievement, remaining, percentage ]);
        });
      } else {
        tableRows.push([ monthName, displayYear, m.title, m.distribution_points?.name || 'N/A', "No Items Assigned", "-", "-", "-", "-" ]);
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

  const handleCreateManifest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manifestCode || !title || !selectedDp || !validFrom || !validTo || !manifestType) {
        alert("Please fill all required fields and select a Manifest Type.");
        return;
    }
    const payload = {
      manifest_code: manifestCode, title, valid_from: validFrom, valid_to: validTo,
      distribution_point_id: selectedDp, manifest_type: manifestType, status: status
    };
    try {
      const { error } = await supabase.from('manifests').insert([payload]);
      if (error) throw error;
      showMessage("Manifest created successfully!");
      await loadManifests(distributionPoints.map(dp => dp.id));
      resetCreateForm();
    } catch (err: any) { showMessage(`Error creating manifest: ${err.message}`, "error"); }
  };

  const resetCreateForm = () => {
    setTitle(''); setValidFrom(''); setValidTo('');
    const activeTypes = manifestTypes.filter(t => t.is_active !== false);
    if(activeTypes.length > 0) setManifestType(activeTypes[0].name); 
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
    setIsSubmittingEdit(true);
    const payload = {
      title: editTitle, valid_from: editValidFrom, valid_to: editValidTo,
      distribution_point_id: editSelectedDp, manifest_type: editManifestType, status: editStatus
    };
    try {
      const { error } = await supabase.from('manifests').update(payload).eq('id', manifestToEdit.id);
      if (error) throw error;
      showMessage("Manifest updated successfully!");
      await loadManifests(distributionPoints.map(dp => dp.id));
      setIsEditModalOpen(false);
    } catch (err: any) { showMessage(`Error updating manifest: ${err.message}`, "error"); } 
    finally { setIsSubmittingEdit(false); }
  };

  const handleDeleteManifest = async (id: string) => {
    if(!confirm("Are you sure? This will delete the manifest and all assigned items.")) return;
    const { error } = await supabase.from('manifests').delete().eq('id', id);
    if (!error) {
      setManifests(manifests.filter(m => m.id !== id));
      showMessage("Manifest deleted successfully!");
    }
  };

  const openDetailsView = async (manifest: any) => {
    setActiveManifest(manifest);
    setIsDetailsOpen(true);
    const { data } = await supabase.from('manifest_items').select(`id, target_qty, distributed_qty, product_id, sort_order, products (name, code, unit_type, product_type)`).eq('manifest_id', manifest.id);
    if (data) {
        const sorted = data.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        setDetailsItems(sorted);
    }
  };

  const openManifestBuilder = async (manifest: any) => {
    setActiveManifest(manifest);
    setIsBuilderOpen(true);
    setProductSearch('');
    const { data: prodData } = await supabase.from('products').select('id, name, code, unit_type, product_type').order('name');
    if (prodData) setAllProducts(prodData);
    const { data: pkgData } = await supabase.from('product_groups').select(`id, group_name, group_code, product_group_items( product_id, products(id, name, code, unit_type, product_type) )`);
    if (pkgData) setAllPackages(pkgData);
    await loadBagItems(manifest.id);
  };

  const loadBagItems = async (manifestId: string) => {
    const { data } = await supabase.from('manifest_items').select(`id, target_qty, product_id, sort_order, products (id, name, code, unit_type, product_type)`).eq('manifest_id', manifestId);
    if (data) {
        const sorted = data.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        setBagItems(sorted.map(item => ({ db_id: item.id, product_id: item.product_id, target_qty: item.target_qty, ...item.products })));
    }
  };

  const handleAddToBag = async (product: any) => {
    if (bagItems.find(item => item.product_id === product.id)) return; 
    const newOrder = bagItems.length;
    const { data, error } = await supabase.from('manifest_items').insert([{ manifest_id: activeManifest.id, product_id: product.id, target_qty: 0, sort_order: newOrder }]).select();
    if (!error && data) setBagItems(prev => [...prev, { db_id: data[0].id, product_id: product.id, target_qty: 0, ...product }]);
  };

  const handleAddPackageToBag = async (pkg: any) => {
    let addedCount = 0;
    for (const item of pkg.product_group_items) {
       const product = item.products;
       if (!bagItems.find(b => b.product_id === product.id)) {
          const newOrder = bagItems.length + addedCount;
          const { data, error } = await supabase.from('manifest_items').insert([{ manifest_id: activeManifest.id, product_id: product.id, target_qty: 0, sort_order: newOrder }]).select();
          if (!error && data) {
            setBagItems(prev => [...prev, { db_id: data[0].id, product_id: product.id, target_qty: 0, ...product }]);
            addedCount++;
          }
       }
    }
    if (addedCount > 0) showMessage(`Successfully added ${addedCount} products from ${pkg.group_name}!`, "success");
    else showMessage("All products in this package are already in the manifest.", "error");
  };

  const handleRemoveFromBag = async (db_id: string) => {
    await supabase.from('manifest_items').delete().eq('id', db_id);
    setBagItems(bagItems.filter(i => i.db_id !== db_id));
  };

  const handleUpdateQty = async (db_id: string, newQty: string) => {
    const val = newQty === '' ? 0 : parseInt(newQty);
    if (val < 0) return;
    await supabase.from('manifest_items').update({ target_qty: val }).eq('id', db_id);
    setBagItems(bagItems.map(item => item.db_id === db_id ? { ...item, target_qty: val } : item));
  };

  const handleBagSort = async () => {
    if (dragBagItem.current === null || dragBagOverItem.current === null) return;
    let _items = [...bagItems];
    const draggedItemContent = _items.splice(dragBagItem.current, 1)[0];
    _items.splice(dragBagOverItem.current, 0, draggedItemContent);
    
    dragBagItem.current = null;
    dragBagOverItem.current = null;
    
    setBagItems(_items);
    for (let i = 0; i < _items.length; i++) {
        if (_items[i].db_id) {
            await supabase.from('manifest_items').update({ sort_order: i }).eq('id', _items[i].db_id);
        }
    }
  };

  const filteredProducts = allProducts.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.code.toLowerCase().includes(productSearch.toLowerCase()));

  const getStatusColor = (status: string, isExpired: boolean) => {
    if (isExpired) return 'bg-rose-50 text-rose-700 border-rose-200';
    if (status === 'Active') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'Hold') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-slate-50 text-slate-700 border-slate-200';
  };

  // SVG Icons Fallback if not in Icons.tsx
  const SettingsIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  );

  return (
    <div className="flex flex-col h-full w-full animate-in fade-in duration-500 relative bg-slate-50">
      
      {/* Header with Back Button */}
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 z-20 shadow-sm">
        <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div>
          <h2 className="text-lg md:text-2xl font-bold text-slate-900">Manifest Management</h2>
          <p className="text-xs md:text-sm text-slate-500 hidden md:block">Create manifests and assign products to Distribution Points</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 xl:grid-cols-4 gap-4 md:gap-6 relative">
        
        {msg.text && (
          <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 p-4 rounded-xl shadow-lg border text-sm font-bold animate-in slide-in-from-top-2 flex items-center ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}
          </div>
        )}

        {/* --- LEFT COL: CREATE FORM --- */}
        <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm xl:col-span-1 h-fit">
          <div className="flex justify-between items-center mb-5">
             <h3 className="text-base md:text-lg font-bold text-slate-900 flex items-center whitespace-nowrap">
               New Manifest
             </h3>
             <button onClick={() => setIsPinPromptOpen(true)} className="p-1.5 bg-indigo-50 text-indigo-600 rounded border border-indigo-100 hover:bg-indigo-100 transition-colors shrink-0" title="Manage Manifest Types">
                <SettingsIcon />
             </button>
          </div>

          <form onSubmit={handleCreateManifest} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Manifest Title</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-bold outline-none focus:border-indigo-500" placeholder="e.g. Camp-04_Ext_LPGREP" />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex justify-between">
                  Type
                  {manifestTypes.filter(t => t.is_active !== false).length === 0 && <span className="text-[9px] text-rose-500">Please Add a Type First</span>}
              </label>
              <select value={manifestType} onChange={(e) => setManifestType(e.target.value)} required className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-bold outline-none focus:border-indigo-500">
                {manifestTypes.filter(t => t.is_active !== false).length === 0 ? <option value="">-- No Active Types --</option> : ''}
                {manifestTypes.filter(t => t.is_active !== false).map(type => <option key={type.id} value={type.name}>{type.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-bold outline-none focus:border-indigo-500">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-indigo-600 uppercase mb-1">Distribution Point</label>
              <select value={selectedDp} onChange={(e) => setSelectedDp(e.target.value)} required className="w-full px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-900 font-bold outline-none focus:border-indigo-500">
                <option value="">-- Select Target DP --</option>
                {distributionPoints.map(dp => <option key={dp.id} value={dp.id}>{dp.name}</option>)}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Valid From</label>
                <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} required className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-bold outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Valid To</label>
                <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} required className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-bold outline-none focus:border-indigo-500" />
              </div>
            </div>
            <button type="submit" disabled={manifestTypes.filter(t => t.is_active !== false).length === 0} className="w-full text-white bg-gradient-to-r from-indigo-600 to-cyan-600 py-3 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all mt-2 disabled:opacity-50">
              Create Manifest
            </button>
          </form>
        </div>

        {/* --- RIGHT COL: FILTER & LISTS --- */}
        <div className="xl:col-span-3 flex flex-col space-y-6">
           
           {/* Top Responsive Filter Bar */}
           <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                <div>
                  <label className="block text-[10px] font-bold text-indigo-600 uppercase mb-1">Filter by Target DP</label>
                  <select value={filterDp} onChange={(e) => setFilterDp(e.target.value)} className="w-full px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-900 outline-none focus:border-indigo-500">
                    <option value="ALL">All Allowed DPs</option>
                    {distributionPoints.map(dp => <option key={dp.id} value={dp.id}>{dp.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Filter by Month</label>
                  <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Filter by Type</label>
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500">
                    <option value="ALL">All Types</option>
                    {manifestTypes.map(type => <option key={type.id} value={type.name}>{type.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 whitespace-nowrap overflow-hidden text-ellipsis">Search Manifest</label>
                  <input type="text" placeholder="Type to search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div className="flex space-x-2 shrink-0 items-end justify-end mt-2 xl:mt-0">
                <button onClick={handleExportExcel} disabled={filteredData.length === 0} className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-colors flex items-center shadow-sm disabled:opacity-50 h-9">
                  <Icons.Download /> <span className="ml-1">Excel</span>
                </button>
                <button onClick={handleExportPDF} disabled={filteredData.length === 0} className="px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl hover:bg-rose-100 transition-colors flex items-center shadow-sm disabled:opacity-50 h-9">
                  <Icons.Download /> <span className="ml-1">PDF</span>
                </button>
              </div>
           </div>

           {/* Section 1: Active Manifests */}
           <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden flex flex-col h-fit">
             <div className="bg-emerald-50/50 p-4 border-b border-emerald-100 flex items-center justify-between">
               <h3 className="font-bold text-emerald-800 text-sm uppercase tracking-wide flex items-center">
                 <span className="mr-2 text-lg">🟢</span> Active & Valid Manifests
               </h3>
               <span className="bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">{activeSection.length}</span>
             </div>
             <div className="w-full overflow-x-auto">
               <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase w-64">Manifest Title & Type</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase">Target DP</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase">Validity Dates</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoading ? (
                      <tr><td colSpan={4} className="p-10 text-center"><Icons.Spinner /></td></tr>
                    ) : activeSection.length === 0 ? (
                      <tr><td colSpan={4} className="p-10 text-center text-sm text-slate-500 bg-slate-50/50">No active manifests found for this selection.</td></tr>
                    ) : (
                      activeSection.map((manifest) => (
                        <tr key={manifest.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="p-4">
                            <p className="font-bold text-slate-900 text-sm break-words">{manifest.title}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-bold border border-indigo-100">{manifest.manifest_type}</span>
                            </div>
                          </td>
                          <td className="p-4">
                             <p className="font-bold text-slate-900 text-sm">{manifest.distribution_points?.name || 'Unassigned'}</p>
                          </td>
                          <td className="p-4">
                             <div className="flex items-center space-x-2">
                               <div>
                                 <p className="text-xs font-bold text-slate-700">{new Date(manifest.valid_from).toLocaleDateString()}</p>
                                 <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">TO {new Date(manifest.valid_to).toLocaleDateString()}</p>
                               </div>
                             </div>
                          </td>
                          <td className="p-4 text-right">
                             <div className="flex items-center justify-end space-x-2">
                               <button onClick={() => openDetailsView(manifest)} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold rounded-lg hover:bg-emerald-100 transition-colors flex items-center">
                                 <span className="mr-1">👁️</span> Details
                               </button>
                               <button onClick={() => openManifestBuilder(manifest)} className="px-3 py-1.5 bg-slate-800 text-white text-[10px] font-bold rounded-lg hover:bg-slate-900 transition-colors flex items-center">
                                 Items Builder
                               </button>
                               <button onClick={() => openEditModal(manifest)} className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-md border border-transparent hover:border-amber-100 transition-colors" title="Edit Manifest"><Icons.Edit /></button>
                               <button onClick={() => handleDeleteManifest(manifest.id)} className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-md border border-transparent hover:border-rose-100 transition-colors" title="Delete Manifest"><Icons.Trash /></button>
                             </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
               </table>
             </div>
           </div>

           {/* Section 2: Expired, Hold, Inactive */}
           <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-fit opacity-90">
             <div className="bg-slate-100/80 p-4 border-b border-slate-200 flex items-center justify-between">
               <h3 className="font-bold text-slate-600 text-sm uppercase tracking-wide flex items-center">
                 <span className="mr-2 text-lg">⏸️</span> Expired, Hold & Inactive
               </h3>
               <span className="bg-slate-300 text-slate-700 text-xs font-bold px-2.5 py-1 rounded-full">{inactiveSection.length}</span>
             </div>
             <div className="w-full overflow-x-auto">
               <table className="w-full text-left opacity-90">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase w-64">Manifest Title & Type</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase">Target DP</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase">Validity & Status</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoading ? (
                      <tr><td colSpan={4} className="p-10 text-center"><Icons.Spinner /></td></tr>
                    ) : inactiveSection.length === 0 ? (
                      <tr><td colSpan={4} className="p-10 text-center text-sm text-slate-500 bg-slate-50/50">No inactive manifests found for this selection.</td></tr>
                    ) : (
                      inactiveSection.map((manifest) => {
                        const validToDate = new Date(manifest.valid_to);
                        validToDate.setHours(0, 0, 0, 0);
                        const isExpired = validToDate < todayDate;
                        const statusColor = getStatusColor(manifest.status, isExpired);
                        const displayStatus = isExpired && manifest.status === 'Active' ? 'Expired' : manifest.status;

                        return (
                        <tr key={manifest.id} className="hover:bg-slate-50 transition-colors group grayscale-[20%]">
                          <td className="p-4">
                            <p className="font-bold text-slate-700 text-sm break-words">{manifest.title}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-bold border border-slate-200">{manifest.manifest_type}</span>
                            </div>
                          </td>
                          <td className="p-4">
                             <p className="font-bold text-slate-700 text-sm">{manifest.distribution_points?.name || 'Unassigned'}</p>
                          </td>
                          <td className="p-4">
                             <div className="flex items-center space-x-2">
                               <div>
                                 <p className="text-xs font-bold text-slate-600">{new Date(manifest.valid_from).toLocaleDateString()}</p>
                                 <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">TO {new Date(manifest.valid_to).toLocaleDateString()}</p>
                               </div>
                               <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${statusColor}`}>
                                 {displayStatus}
                               </span>
                             </div>
                          </td>
                          <td className="p-4 text-right">
                             <div className="flex items-center justify-end space-x-2">
                               <button onClick={() => openDetailsView(manifest)} className="px-3 py-1.5 bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold rounded-lg hover:bg-slate-200 transition-colors flex items-center">
                                 <span className="mr-1">👁️</span> Details
                               </button>
                               <button onClick={() => openEditModal(manifest)} className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-md border border-transparent hover:border-amber-100 transition-colors" title="Edit Manifest"><Icons.Edit /></button>
                               <button onClick={() => handleDeleteManifest(manifest.id)} className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-md border border-transparent hover:border-rose-100 transition-colors" title="Delete Manifest"><Icons.Trash /></button>
                             </div>
                          </td>
                        </tr>
                      )})
                    )}
                  </tbody>
               </table>
             </div>
           </div>

        </div>
      </div>

      {/* ---------------- PIN PROMPT MODAL ---------------- */}
      {isPinPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
             <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
               <h3 className="font-bold text-lg text-slate-900">Security Verification</h3>
               <button onClick={() => {setIsPinPromptOpen(false); setPinInput('');}} className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg"><Icons.Close /></button>
             </div>
             <div className="p-5">
               <p className="text-xs text-slate-500 mb-4 font-bold text-center">Enter Admin PIN to manage Manifest Types</p>
               <input 
                 type="password" 
                 autoFocus 
                 value={pinInput} 
                 onChange={e => setPinInput(e.target.value)} 
                 className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-xl text-center text-2xl tracking-[0.5em] font-black focus:border-indigo-500 outline-none mb-4" 
               />
               <button onClick={handleVerifyPin} className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-md">Verify PIN</button>
             </div>
          </div>
        </div>
      )}

      {/* ---------------- MANAGE TYPES MODAL ---------------- */}
      {isManageTypesOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
             <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
               <div>
                 <h3 className="font-bold text-lg text-slate-900">Manage Types</h3>
                 <p className="text-[10px] text-slate-500 mt-0.5">Add, edit, reorder or toggle visibility of Types</p>
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
                    className="flex-1 px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 shadow-sm"
                 />
                 <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-lg text-sm hover:bg-indigo-700 shadow-sm shrink-0">Add</button>
               </form>

               <div 
                  className="max-h-[50vh] overflow-y-auto custom-scrollbar border border-slate-200 rounded-xl divide-y divide-slate-100"
                  onDragOver={(e) => e.preventDefault()}
               >
                  {manifestTypes.length === 0 ? (
                     <div className="p-4 text-center text-sm text-slate-400 font-bold">No types available.</div>
                  ) : (
                     manifestTypes.map((type, index) => (
                       <div 
                         key={type.id} 
                         draggable={editingType !== type.id}
                         onDragStart={() => dragTypeItem.current = index}
                         onDragEnter={() => dragTypeOverItem.current = index}
                         onDragEnd={handleTypeSort}
                         className="flex justify-between items-center p-3 hover:bg-slate-50 group transition-colors cursor-move bg-white"
                       >
                          {editingType === type.id ? (
                             <div className="flex flex-1 items-center space-x-2">
                               <input 
                                 type="text" 
                                 value={editTypeValue} 
                                 onChange={e => setEditTypeValue(e.target.value)} 
                                 className="flex-1 px-2 py-1.5 border border-indigo-300 rounded text-sm font-bold text-slate-900 outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm" 
                                 autoFocus 
                               />
                               <button onClick={() => handleEditManifestType(type.id)} className="text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 rounded text-xs font-bold shadow-sm">Save</button>
                               <button onClick={() => setEditingType(null)} className="text-slate-500 bg-slate-200 hover:bg-slate-300 px-3 py-1.5 rounded text-xs font-bold">Cancel</button>
                             </div>
                          ) : (
                             <>
                                <div className="flex items-center space-x-3 flex-1 overflow-hidden pr-2">
                                   <span className="text-slate-300 cursor-move text-xl opacity-50 group-hover:opacity-100 transition-opacity">≡</span>
                                   <span className={`font-bold text-sm truncate ${type.is_active === false ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{type.name}</span>
                                </div>
                                <div className="flex items-center space-x-2 shrink-0">
                                   <button 
                                      onClick={() => handleToggleTypeStatus(type.id, type.is_active !== false)} 
                                      className={`text-[10px] px-2 py-1 rounded font-bold border transition-colors ${type.is_active !== false ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                                      title="Toggle Active/Inactive"
                                   >
                                      {type.is_active !== false ? 'Active' : 'Inactive'}
                                   </button>
                                   <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 border-l border-slate-200 pl-2">
                                      <button onClick={() => { setEditingType(type.id); setEditTypeValue(type.name); }} className="text-amber-500 hover:text-amber-600 p-1 bg-amber-50 rounded hover:bg-amber-100 transition-colors" title="Edit Name">
                                         <Icons.Edit />
                                      </button>
                                      <button onClick={() => handleDeleteManifestType(type.id, type.name)} className="text-rose-400 hover:text-rose-600 p-1 bg-rose-50 rounded hover:bg-rose-100 transition-colors" title="Permanent Hard Delete">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Edit Manifest</h3>
                <p className="text-xs text-indigo-600 font-mono mt-1 font-bold">{manifestToEdit.manifest_code}</p>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-100"><Icons.Close /></button>
            </div>
            
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Manifest Title</label>
                 <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-bold outline-none focus:border-indigo-500" />
               </div>
               
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                 <select value={editManifestType} onChange={(e) => setEditManifestType(e.target.value)} className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-bold outline-none focus:border-indigo-500">
                   {/* Fallback to show old name if it was deleted or made inactive */}
                   {!manifestTypes.filter(t => t.is_active !== false).find(t => t.name === editManifestType) && <option value={editManifestType}>{editManifestType} (Legacy/Inactive)</option>}
                   {manifestTypes.filter(t => t.is_active !== false).map(type => <option key={type.id} value={type.name}>{type.name}</option>)}
                 </select>
               </div>
               
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
                 <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-bold outline-none focus:border-indigo-500">
                   {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
               </div>

               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Distribution Point</label>
                 <select value={editSelectedDp} onChange={(e) => setEditSelectedDp(e.target.value)} required className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-bold outline-none focus:border-indigo-500">
                   <option value="">-- Select Point --</option>
                   {distributionPoints.map(dp => <option key={dp.id} value={dp.id}>{dp.name}</option>)}
                 </select>
               </div>

               <div className="grid grid-cols-2 gap-3">
                 <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Valid From</label>
                   <input type="date" value={editValidFrom} onChange={(e) => setEditValidFrom(e.target.value)} required className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-bold outline-none focus:border-indigo-500" />
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Valid To</label>
                   <input type="date" value={editValidTo} onChange={(e) => setEditValidTo(e.target.value)} required className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-bold outline-none focus:border-indigo-500" />
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
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg text-slate-900">{activeManifest.title}</h3>
                <p className="text-xs text-indigo-600 font-mono mt-1 font-bold">{activeManifest.manifest_code}</p>
              </div>
              <button onClick={() => setIsDetailsOpen(false)} className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-100"><Icons.Close /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-slate-50/50">
                
                {/* Meta Header */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4 shadow-sm mb-2">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Target DP</p>
                    <p className="font-bold text-slate-800 text-sm">{activeManifest.distribution_points?.name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Type</p>
                    <p className="font-bold text-slate-800 text-sm">{activeManifest.manifest_type}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Validity</p>
                    <p className="font-bold text-slate-800 text-xs">{new Date(activeManifest.valid_from).toLocaleDateString()} to {new Date(activeManifest.valid_to).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Status</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border inline-block mt-0.5 ${getStatusColor(activeManifest.status, new Date(activeManifest.valid_to) < new Date(new Date().setHours(0,0,0,0)))}`}>
                      {new Date(activeManifest.valid_to) < new Date(new Date().setHours(0,0,0,0)) ? 'Expired' : activeManifest.status}
                    </span>
                  </div>
                </div>

                {detailsItems.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 font-medium">No items assigned to this manifest yet.</div>
                ) : (
                  detailsItems.map((item, idx) => {
                    const isTargetless = item.target_qty === 0;
                    const progress = isTargetless ? 0 : Math.min(100, ((item.distributed_qty || 0) / item.target_qty) * 100);
                    
                    return (
                      <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:border-indigo-200 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-bold text-slate-900">{item.products.name}</p>
                            <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded mt-1 inline-block border ${item.products.product_type === 'LPG' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                              {item.products.product_type} | {item.products.unit_type}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-800">
                              Distributed: <span className="text-emerald-600 text-lg font-black ml-1">{item.distributed_qty || 0}</span>
                              {!isTargetless && <span className="text-slate-400 text-xs ml-1">/ {item.target_qty}</span>}
                            </p>
                            {isTargetless ? (
                              <p className="text-[10px] font-bold text-indigo-500 mt-0.5 bg-indigo-50 px-2 py-0.5 rounded inline-block border border-indigo-100">OPEN TARGET</p>
                            ) : (
                              <p className="text-[10px] font-bold text-slate-400 mt-0.5">{progress.toFixed(1)}% Completed</p>
                            )}
                          </div>
                        </div>
                        
                        {!isTargetless && (
                          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                            <div className={`h-2.5 rounded-full transition-all duration-1000 ${progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progress}%` }}></div>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- BUILDER MODAL ---------------- */}
      {isBuilderOpen && activeManifest && (
        <div className="absolute inset-0 z-50 flex flex-col bg-slate-900/70 backdrop-blur-sm p-2 md:p-6">
          <div className="bg-white w-full max-w-6xl mx-auto rounded-xl shadow-2xl border border-slate-200 flex flex-col flex-1 overflow-hidden h-full animate-in zoom-in-95">
            <div className="p-3 md:p-4 border-b border-slate-200 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2">
                <span className="text-xl">📋</span>
                <div>
                  <h3 className="font-bold text-sm md:text-lg">Manifest Items Builder</h3>
                  <p className="text-[10px] md:text-xs text-emerald-400">Editing items for: <span className="font-bold">{activeManifest.title}</span></p>
                </div>
              </div>
              <button onClick={() => setIsBuilderOpen(false)} className="text-white bg-slate-800 p-1.5 rounded-lg hover:bg-slate-700 transition-colors"><Icons.Close /></button>
            </div>
            
            <div className="flex-1 flex flex-row bg-slate-100 overflow-hidden">
              <div className="w-1/2 flex flex-col border-r border-slate-200 bg-white">
                <div className="p-3 md:p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-slate-800 text-xs uppercase">Available</h4>
                    <div className="flex bg-slate-200 rounded-lg p-0.5">
                      <button onClick={() => setActiveTab('products')} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${activeTab === 'products' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Products</button>
                      <button onClick={() => setActiveTab('packages')} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${activeTab === 'packages' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Packages</button>
                    </div>
                  </div>
                  {activeTab === 'products' && (
                    <input type="text" placeholder="Search items by name or code..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" />
                  )}
                </div>
                
                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                  {activeTab === 'products' ? (
                    filteredProducts.map(product => (
                      <div key={product.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-slate-50 hover:border-indigo-300 transition-colors">
                        <div className="flex items-center space-x-2 truncate pr-2">
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${product.product_type === 'LPG' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>{product.product_type}</span>
                          <div className="truncate">
                            <p className="font-bold text-slate-900 text-xs truncate">{product.name}</p>
                            <p className="text-[9px] text-slate-500 font-mono mt-0.5">Code: {product.code} | Unit: {product.unit_type}</p>
                          </div>
                        </div>
                        <button onClick={() => handleAddToBag(product)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-indigo-600 flex items-center justify-center shrink-0 hover:border-indigo-500 hover:bg-indigo-50 transition-colors shadow-sm"><Icons.Plus /></button>
                      </div>
                    ))
                  ) : (
                    allPackages.map(pkg => (
                      <div key={pkg.id} className="p-3 border border-indigo-100 rounded-xl bg-indigo-50/30">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-bold text-indigo-900 text-xs">{pkg.group_name}</p>
                            <p className="text-[9px] text-slate-500 mt-0.5">Contains {pkg.product_group_items.length} items</p>
                          </div>
                          <button onClick={() => handleAddPackageToBag(pkg)} className="px-2 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 transition-colors shadow-sm">+ ADD FULL PACK</button>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                           {pkg.product_group_items.map((pi:any, idx:number) => (
                              <span key={idx} className="text-[8px] bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{pi.products.name}</span>
                           ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="w-1/2 flex flex-col bg-slate-50">
                <div className="p-3 md:p-4 border-b border-indigo-100 bg-indigo-50 flex justify-between items-center shrink-0">
                  <h4 className="font-bold text-indigo-900 text-xs uppercase flex items-center"><span className="mr-2 text-base">📥</span> Manifest Bag</h4>
                  <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded-full">{bagItems.length} Added</span>
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
                        onDragStart={() => dragBagItem.current = index}
                        onDragEnter={() => dragBagOverItem.current = index}
                        onDragEnd={handleBagSort}
                        className="bg-white p-3 rounded-xl border border-indigo-100 shadow-sm relative cursor-move group hover:border-indigo-300 transition-colors"
                      >
                        <div className="flex justify-between items-start mb-3 border-b border-slate-50 pb-2">
                          <div className="pr-8 flex space-x-2 items-start">
                            <span className="text-slate-300 group-hover:text-slate-500 cursor-move text-lg mt-0.5 transition-colors">≡</span>
                            <div>
                                <p className="font-bold text-slate-900 text-xs leading-tight">{item.name}</p>
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase mt-1 inline-block ${item.product_type === 'LPG' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>{item.product_type}</span>
                            </div>
                          </div>
                          <button onClick={() => handleRemoveFromBag(item.db_id)} className="text-rose-400 hover:text-rose-600 bg-rose-50 p-1.5 rounded-lg transition-colors absolute top-2 right-2" title="Remove from bag"><Icons.Trash /></button>
                        </div>
                        <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200 ml-6">
                          <span className="text-[10px] font-bold text-slate-600 uppercase">Target Qty:</span>
                          <div className="flex items-center space-x-2">
                            <input type="number" min="0" placeholder="0 = Open" value={item.target_qty || ''} onChange={(e) => handleUpdateQty(item.db_id, e.target.value)} className="w-20 text-right px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-bold text-indigo-700 outline-none focus:border-indigo-500" />
                            <span className="text-[9px] font-bold text-slate-500 uppercase w-8">{item.unit_type}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-3 bg-white border-t border-slate-200">
                  <button onClick={() => setIsBuilderOpen(false)} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-xl text-sm transition-all shadow-md flex items-center justify-center">✅ Done & Close Builder</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
