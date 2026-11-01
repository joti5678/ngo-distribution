"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from '../../components/Icons';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function ProductTransferPage() {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [allWarehouses, setAllWarehouses] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [availableStock, setAvailableStock] = useState<any[]>([]);
  const [recentTransfers, setRecentTransfers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const [transferDate, setTransferDate] = useState(''); 
  const [sourceWh, setSourceWh] = useState('');
  const [destType, setDestType] = useState('WH'); 
  const [destId, setDestId] = useState(''); 
  const [remarks, setRemarks] = useState('');
  const [referenceNo, setReferenceNo] = useState(''); 
  
  const [transferItems, setTransferItems] = useState<any[]>([]);
  
  // History Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [historyWhFilter, setHistoryWhFilter] = useState('ALL');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [transferToEdit, setTransferToEdit] = useState<any>(null);
  const [editDate, setEditDate] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editItems, setEditItems] = useState<any[]>([]);
  const [originalEditItems, setOriginalEditItems] = useState<any[]>([]);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [transferToCancel, setTransferToCancel] = useState<any>(null);
  
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedTransferDetails, setSelectedTransferDetails] = useState<any>(null);

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [parsedBulkData, setParsedBulkData] = useState<any[]>([]);
  const [invalidRows, setInvalidRows] = useState<any[]>([]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setCurrentUser(user);

        const sessionStr = localStorage.getItem('user_session');
        const sessionUser = sessionStr ? JSON.parse(sessionStr) : null;
        
        const { data: profile } = await supabase.from('profiles').select('role, user_roles(role_name)').eq('id', user?.id).single();
        const roleName = String(profile?.user_roles?.role_name || profile?.role || sessionUser?.role || '').toUpperCase();
        const isSuperAdmin = roleName.includes('SUPER ADMIN') || roleName === 'ADMIN' || roleName.includes('WEB ADMIN');

        // Bulletproof Logic for Fetching assigned_wh_ids (From OLD Code)
        let rawIds = sessionUser?.assigned_wh_ids;
        if (!rawIds && user?.id) {
            const { data: pData } = await supabase.from('profiles').select('assigned_wh_ids').eq('id', user.id).single();
            if (pData?.assigned_wh_ids) rawIds = pData.assigned_wh_ids;
            else {
                const { data: uData } = await supabase.from('users').select('assigned_wh_ids').eq('id', user.id).single();
                if (uData?.assigned_wh_ids) rawIds = uData.assigned_wh_ids;
            }
        }
        if (!rawIds && user?.user_metadata?.assigned_wh_ids) {
            rawIds = user.user_metadata.assigned_wh_ids;
        }

        let assignedIds: string[] = [];
        if (typeof rawIds === 'string') {
            try { assignedIds = JSON.parse(rawIds); } 
            catch { assignedIds = rawIds.split(','); }
        } else if (Array.isArray(rawIds)) {
            assignedIds = rawIds;
        } else if (rawIds && typeof rawIds === 'object') {
            assignedIds = Object.values(rawIds);
        }
        assignedIds = assignedIds.map(id => String(id).trim()).filter(id => id !== '');

        const today = new Date();
        const dateStr = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        setTransferDate(dateStr);

        const [whRes, partnerRes] = await Promise.all([
          supabase.from('warehouses').select('id, name, code').order('name'),
          supabase.from('partners').select('id, name, type').order('name')
        ]);

        const whs = whRes.data || [];
        const pts = partnerRes.data || [];

        setAllWarehouses(whs); 

        // Strictly Filter Source Warehouses based on Assignment (From OLD Code)
        if (isSuperAdmin) {
           setWarehouses(whs);
        } else {
           const filteredWhs = whs.filter(w => assignedIds.includes(String(w.id)));
           setWarehouses(filteredWhs);
        }
        if (pts.length) setPartners(pts);
        
        // Fetch Transfers logic - Show if user's WH is Source OR Destination
        let tQuery = supabase.from('stock_transfers').select(`
            *,
            stock_transfer_items (
              id, quantity, product_id,
              products (name, code, unit_type, product_type)
            )
        `).order('created_at', { ascending: false }).limit(150);

        if (!isSuperAdmin) {
            if (assignedIds.length > 0) {
                const idStr = assignedIds.join(',');
                tQuery = tQuery.or(`from_warehouse_id.in.(${idStr}),to_warehouse_id.in.(${idStr})`);
            } else {
                tQuery = tQuery.eq('id', '00000000-0000-0000-0000-000000000000'); // Force empty if no access
            }
        }

        const { data: transferResData } = await tQuery;
        
        if (transferResData) {
          const mappedTransfers = transferResData.map(t => ({
            ...t,
            from_warehouse: whs.find(w => w.id === t.from_warehouse_id),
            to_warehouse: whs.find(w => w.id === t.to_warehouse_id),
            to_partner: pts.find(p => p.id === t.to_partner_id)
          }));
          setRecentTransfers(mappedTransfers);
        }
    } catch (err) {
        console.error("Error fetching transfer data:", err);
    }
    setIsLoading(false);
  };

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  useEffect(() => {
    if (sourceWh) {
      fetchAvailableStock(sourceWh);
      setTransferItems([]);
    } else {
      setAvailableStock([]);
      setTransferItems([]);
    }
  }, [sourceWh]);

  const fetchAvailableStock = async (warehouseId: string) => {
    const { data } = await supabase
      .from('inventory')
      .select(`id, quantity, product_id, products (id, name, code, unit_type, product_type)`)
      .eq('warehouse_id', warehouseId)
      .gt('quantity', 0); 
    if (data) setAvailableStock(data);
  };

  const handleAddToBag = (stockItem: any) => {
    if (transferItems.find(item => item.product_id === stockItem.product_id)) {
      showMessage("Item is already in the transfer bag.", "error");
      return;
    }
    setTransferItems([...transferItems, { 
      product_id: stockItem.product_id, 
      products: stockItem.products,
      max_qty: stockItem.quantity,
      transfer_qty: 1 
    }]);
  };

  const handleUpdateTransferQty = (productId: string, qtyStr: string) => {
    const qty = parseInt(qtyStr) || 0;
    setTransferItems(transferItems.map(item => {
      if (item.product_id === productId) {
        const validQty = qty > item.max_qty ? item.max_qty : (qty < 0 ? 0 : qty);
        return { ...item, transfer_qty: validQty };
      }
      return item;
    }));
  };

  const handleRemoveFromBag = (productId: string) => {
    setTransferItems(transferItems.filter(i => i.product_id !== productId));
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{ "Product Code": "P-001", "Quantity": 100 }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transfer Template");
    XLSX.writeFile(wb, "Transfer_Upload_Template.xlsx");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!sourceWh) {
       showMessage("Select Source Warehouse first.", "error");
       e.target.value = '';
       return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws, { raw: false }) as any[];

        const validItems: any[] = [];
        const invalid: any[] = [];

        rawData.forEach((row, index) => {
          let codeStr = row['Product Code'] || row['product code'] || row['Product_Code'];
          let qty = parseInt(row['Quantity'] || row['quantity'] || '0', 10);
          
          if (codeStr && qty > 0) {
             codeStr = codeStr.toString().trim();
             const stockItem = availableStock.find(s => s.products.code === codeStr);
             
             if (stockItem) {
                 const transferQty = qty > stockItem.quantity ? stockItem.quantity : qty;
                 validItems.push({
                    product_id: stockItem.product_id,
                    products: stockItem.products,
                    max_qty: stockItem.quantity,
                    transfer_qty: transferQty,
                    requested_qty: qty
                 });
             } else {
                 invalid.push({ row: index + 2, code: codeStr, error: 'Not in stock' });
             }
          } else {
             if(codeStr) invalid.push({ row: index + 2, code: codeStr, error: 'Invalid Qty' });
          }
        });

        const mergedValid: any[] = [];
        validItems.forEach(item => {
            const existing = mergedValid.find(v => v.product_id === item.product_id);
            if (existing) {
                existing.transfer_qty += item.transfer_qty;
                if(existing.transfer_qty > existing.max_qty) existing.transfer_qty = existing.max_qty;
            } else {
                mergedValid.push(item);
            }
        });

        setParsedBulkData(mergedValid);
        setInvalidRows(invalid);
        setBulkModalOpen(true);
      } catch (error) {
        showMessage("Error parsing Excel file.", "error");
      }
      e.target.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const confirmBulkUpload = () => {
     const newBag = [...transferItems];
     parsedBulkData.forEach(item => {
         const existing = newBag.find(b => b.product_id === item.product_id);
         if (existing) {
             existing.transfer_qty += item.transfer_qty;
             if(existing.transfer_qty > existing.max_qty) existing.transfer_qty = existing.max_qty;
         } else {
             newBag.push(item);
         }
     });
     
     setTransferItems(newBag);
     setBulkModalOpen(false);
     setParsedBulkData([]);
     setInvalidRows([]);
     showMessage(`${parsedBulkData.length} items added to bag.`, "success");
  };

  // 🚀 DIRECT STORE LOGIC (Removed "In Transit")
  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceWh || transferItems.length === 0) {
      showMessage("Please select source and at least one item.", "error");
      return;
    }
    if ((destType === 'WH' || destType === 'PARTNER') && !destId) {
      showMessage("Please select the target destination.", "error");
      return;
    }
    if (transferItems.some(i => i.transfer_qty <= 0)) {
      showMessage("Transfer quantities must be greater than 0.", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      const statusStr = 'Completed'; // Direct complete!
      
      // 1. Create Transfer Header
      const { data: transferData, error: transferError } = await supabase
        .from('stock_transfers')
        .insert([{
          reference_no: referenceNo || null,
          from_warehouse_id: sourceWh,
          to_warehouse_id: destType === 'WH' ? destId : null,
          to_partner_id: destType === 'PARTNER' ? destId : null,
          destination_type: destType,
          transfer_date: transferDate,
          remarks: remarks,
          status: statusStr,
          created_by: currentUser?.id || null,
          created_by_email: currentUser?.email || null
        }]).select().single();

      if (transferError) throw transferError;

      const itemsToInsert = [];
      const ledgerEntries = [];
      const txnIdString = `TXN-${transferData.id.split('-')[0].toUpperCase()}`;

      // 2. Loop Items & Directly update Inventories
      for (const item of transferItems) {
        itemsToInsert.push({
          transfer_id: transferData.id,
          product_id: item.product_id,
          quantity: item.transfer_qty
        });

        // A. SOURCE WAREHOUSE LEDGER & INVENTORY (OUT)
        ledgerEntries.push({
          warehouse_id: sourceWh,
          product_id: item.product_id,
          transaction_type: 'OUT',
          quantity: item.transfer_qty,
          reference_no: referenceNo || null,
          transfer_id: transferData.id,
          remarks: `${txnIdString} | Sent to ${destType}`,
          created_by: currentUser?.id || null,
          created_by_email: currentUser?.email || null
        });

        const currentStock = availableStock.find(s => s.product_id === item.product_id)?.quantity || 0;
        await supabase
          .from('inventory')
          .update({ quantity: currentStock - item.transfer_qty, last_updated: new Date().toISOString() })
          .match({ warehouse_id: sourceWh, product_id: item.product_id });

        // B. DESTINATION WAREHOUSE LEDGER & INVENTORY (IN) if target is WH
        if (destType === 'WH') {
            const { data: targetInv } = await supabase.from('inventory').select('id, quantity').eq('warehouse_id', destId).eq('product_id', item.product_id).single();
            if (targetInv) {
                await supabase.from('inventory').update({ quantity: targetInv.quantity + item.transfer_qty, last_updated: new Date().toISOString() }).eq('id', targetInv.id);
            } else {
                await supabase.from('inventory').insert([{ warehouse_id: destId, product_id: item.product_id, quantity: item.transfer_qty }]);
            }
            
            ledgerEntries.push({
              warehouse_id: destId,
              product_id: item.product_id,
              transaction_type: 'IN',
              quantity: item.transfer_qty,
              reference_no: referenceNo || null,
              transfer_id: transferData.id,
              remarks: `${txnIdString} | Direct Received from WH Transfer`,
              created_by: currentUser?.id || null,
              created_by_email: currentUser?.email || null
            });
        }
      }

      await supabase.from('stock_transfer_items').insert(itemsToInsert);
      await supabase.from('inventory_transactions').insert(ledgerEntries);

      showMessage(`Transfer Completed Successfully! System ID: ${txnIdString}`, "success");
      
      setDestId(''); setRemarks(''); setTransferItems([]); setReferenceNo('');
      fetchAvailableStock(sourceWh);
      await fetchInitialData();
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

    } catch (error: any) {
      showMessage(`Transfer failed: ${error.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCancelModal = (transfer: any) => {
    if(transfer.status === 'Cancelled') return;
    setTransferToCancel(transfer);
    setCancelModalOpen(true);
  };

  const confirmCancelTransfer = async () => {
    if(!transferToCancel) return;
    setIsSubmitting(true);
    try {
      const { data: items } = await supabase.from('stock_transfer_items').select('*').eq('transfer_id', transferToCancel.id);
      
      if (items) {
        for (const item of items) {
          // Revert Source WH (Add stock back)
          const { data: sourceInv } = await supabase.from('inventory').select('id, quantity').eq('warehouse_id', transferToCancel.from_warehouse_id).eq('product_id', item.product_id).single();
          if (sourceInv) {
            await supabase.from('inventory').update({ quantity: sourceInv.quantity + item.quantity }).eq('id', sourceInv.id);
          }

          // Revert Target WH (Remove stock) if WH transfer
          if (transferToCancel.destination_type === 'WH' && transferToCancel.to_warehouse_id) {
             const { data: targetInv } = await supabase.from('inventory').select('id, quantity').eq('warehouse_id', transferToCancel.to_warehouse_id).eq('product_id', item.product_id).single();
             if (targetInv) {
               await supabase.from('inventory').update({ quantity: Math.max(0, targetInv.quantity - item.quantity) }).eq('id', targetInv.id);
             }
          }
        }
      }

      // Delete BOTH IN and OUT transactions for this transfer
      await supabase.from('inventory_transactions').delete().eq('transfer_id', transferToCancel.id);
      
      await supabase.from('stock_transfers').update({ 
        status: 'Cancelled',
        updated_by: currentUser?.id || null,
        updated_by_email: currentUser?.email || null,
        updated_at: new Date().toISOString()
      }).eq('id', transferToCancel.id);

      showMessage(`Transaction deleted and stock reverted back perfectly.`, "success");
      setCancelModalOpen(false);
      if(sourceWh === transferToCancel.from_warehouse_id) fetchAvailableStock(sourceWh);
      await fetchInitialData();

    } catch (err: any) {
      showMessage(`Failed to delete transfer: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = async (transfer: any) => {
    if (transfer.status === 'Cancelled') return;
    
    setTransferToEdit(transfer);
    setEditDate(transfer.transfer_date || '');
    setEditRemarks(transfer.remarks || '');
    setEditItems([]);
    setOriginalEditItems([]);
    setEditModalOpen(true);

    const { data } = await supabase
      .from('stock_transfer_items')
      .select(`id, product_id, quantity, products(name, code, unit_type)`)
      .eq('transfer_id', transfer.id);
    
    if (data) {
      const productIds = data.map(d => d.product_id);
      const { data: invData } = await supabase
        .from('inventory')
        .select('product_id, quantity')
        .eq('warehouse_id', transfer.from_warehouse_id)
        .in('product_id', productIds);

      const mappedData = data.map(item => {
        const inv = invData?.find(i => i.product_id === item.product_id);
        const currentStock = inv ? inv.quantity : 0;
        const maxCapacity = currentStock + item.quantity; 
        
        return {
          ...item,
          current_stock: currentStock,
          max_capacity: maxCapacity, 
          original_qty: item.quantity
        };
      });

      setEditItems(JSON.parse(JSON.stringify(mappedData))); 
      setOriginalEditItems(mappedData); 
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!transferToEdit) return;
    if (transferToEdit.status === 'Cancelled') {
      showMessage("Cannot edit a cancelled transfer.", "error");
      return;
    }

    if (editItems.some(i => !i.quantity || i.quantity <= 0)) {
      showMessage("All transferred items must have a valid quantity greater than 0.", "error");
      return;
    }
    
    setIsSubmitting(true);

    try {
      for (const item of editItems) {
        const oldItem = originalEditItems.find(oi => oi.id === item.id);
        if (oldItem && oldItem.original_qty !== item.quantity) {
          const diff = item.quantity - oldItem.original_qty;

          // Process Source WH (Takes stock OUT)
          const { data: sourceInv } = await supabase.from('inventory')
            .select('id, quantity').eq('warehouse_id', transferToEdit.from_warehouse_id)
            .eq('product_id', item.product_id).single();

          if (diff > 0 && (!sourceInv || sourceInv.quantity < diff)) {
             throw new Error(`Not enough stock at Source for ${item.products?.name}.`);
          }

          if (sourceInv) {
            await supabase.from('inventory').update({ quantity: sourceInv.quantity - diff }).eq('id', sourceInv.id);
          }

          // Process Target WH (Puts stock IN)
          if (transferToEdit.destination_type === 'WH' && transferToEdit.to_warehouse_id) {
             const { data: targetInv } = await supabase.from('inventory')
                .select('id, quantity').eq('warehouse_id', transferToEdit.to_warehouse_id)
                .eq('product_id', item.product_id).single();
             
             if (targetInv) {
                await supabase.from('inventory').update({ quantity: Math.max(0, targetInv.quantity + diff) }).eq('id', targetInv.id);
             }
          }

          // Update Item Record
          await supabase.from('stock_transfer_items').update({ quantity: item.quantity }).eq('id', item.id);

          // Update Source Ledger (OUT)
          const { data: outTxn } = await supabase.from('inventory_transactions')
            .select('id, quantity').eq('transfer_id', transferToEdit.id).eq('transaction_type', 'OUT').eq('product_id', item.product_id).single();
          if (outTxn) await supabase.from('inventory_transactions').update({ quantity: item.quantity }).eq('id', outTxn.id);

          // Update Target Ledger (IN)
          if (transferToEdit.destination_type === 'WH') {
             const { data: inTxn } = await supabase.from('inventory_transactions')
                .select('id, quantity').eq('transfer_id', transferToEdit.id).eq('transaction_type', 'IN').eq('product_id', item.product_id).single();
             if (inTxn) await supabase.from('inventory_transactions').update({ quantity: item.quantity }).eq('id', inTxn.id);
          }
        }
      }

      await supabase.from('stock_transfers')
        .update({ 
          transfer_date: editDate, 
          remarks: editRemarks,
          updated_by: currentUser?.id || null,
          updated_by_email: currentUser?.email || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', transferToEdit.id);

      showMessage("Transfer details updated and stock re-adjusted everywhere!", "success");
      setEditModalOpen(false);
      
      if(sourceWh === transferToEdit.from_warehouse_id) fetchAvailableStock(sourceWh);
      await fetchInitialData();
    } catch (err: any) {
      showMessage(`Error updating: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportExcel = () => {
    const exportData: any[] = [];
    
    filteredTransfers.forEach(t => {
      const destName = t.destination_type === 'WH' ? t.to_warehouse?.name : (t.destination_type === 'PARTNER' ? t.to_partner?.name : 'Contingency Stock');
      const txnId = `TXN-${t.id.split('-')[0].toUpperCase()}`;
      
      if (t.stock_transfer_items && t.stock_transfer_items.length > 0) {
        t.stock_transfer_items.forEach((item: any) => {
          exportData.push({
            "Date": new Date(t.transfer_date).toLocaleDateString(),
            "System TXN ID": txnId,
            "PO / Ref No": t.reference_no || 'N/A',
            "Source Warehouse": t.from_warehouse?.name || 'Unknown',
            "Target Destination": destName || '',
            "Destination Type": t.destination_type,
            "Status": t.status,
            "Product Code": item.products?.code || 'N/A',
            "Product Name": item.products?.name || 'Unknown',
            "Quantity": item.quantity,
            "Unit": item.products?.unit_type || '',
            "Remarks / Details": t.remarks || 'N/A',
            "Created By (Email)": t.created_by_email || 'System',
            "Last Updated By": t.updated_by_email || 'N/A'
          });
        });
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transfer_Details");
    XLSX.writeFile(workbook, `Stock_Transfer_Details_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(14); doc.setTextColor(30, 41, 59); 
    doc.text("Stock Transfer/Direct Store - Detailed Audit Report", 14, 15);
    doc.setFontSize(9); doc.setTextColor(100, 116, 139); 
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 21);

    const tableColumn = [
      "Date & Time", "TXN ID & PO", "Source WH", "Destination", "Product Details", "Qty", "Status", "Remarks", "User Audit"
    ];
    const tableRows: any[] = [];

    filteredTransfers.forEach(t => {
      const destName = t.destination_type === 'WH' ? t.to_warehouse?.name : (t.destination_type === 'PARTNER' ? t.to_partner?.name : 'Contingency Stock');
      const txnId = `TXN-${t.id.split('-')[0].toUpperCase()}`;
      const dateStr = new Date(t.transfer_date).toLocaleDateString();
      const timeStr = t.created_at ? new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      
      const createdAudit = `Cr: ${t.created_by_email || 'System'}`;
      const updatedAudit = t.updated_by_email ? `\nUpd: ${t.updated_by_email} (${new Date(t.updated_at).toLocaleDateString()})` : '';
      
      if (t.stock_transfer_items && t.stock_transfer_items.length > 0) {
        t.stock_transfer_items.forEach((item: any) => {
          tableRows.push([
            `${dateStr}\n${timeStr}`,
            `${txnId}${t.reference_no ? `\nPO: ${t.reference_no}` : ''}`,
            t.from_warehouse?.name || 'Unknown',
            `${destName || 'N/A'}\n(${t.destination_type})`,
            `${item.products?.name || 'Unknown'}\n[${item.products?.code || 'N/A'}]`,
            `${item.quantity} ${item.products?.unit_type || ''}`,
            t.status,
            t.remarks || '-',
            `${createdAudit}${updatedAudit}`
          ]);
        });
      }
    });

    autoTable(doc, {
      head: [tableColumn], body: tableRows, startY: 26, theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    doc.save(`Stock_Transfer_Detailed_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const filteredTransfers = recentTransfers.filter(t => {
    const query = searchQuery.toLowerCase();
    const destName = t.destination_type === 'WH' ? t.to_warehouse?.name : (t.destination_type === 'PARTNER' ? t.to_partner?.name : 'Contingency Stock');
    const txnMatch = t.id.toLowerCase().includes(query);
    const poMatch = (t.reference_no || '').toLowerCase().includes(query);
    
    const searchCondition = txnMatch || poMatch ||
           (t.from_warehouse?.name || '').toLowerCase().includes(query) ||
           (destName || '').toLowerCase().includes(query);

    const filterCondition = historyWhFilter === 'ALL' 
           ? true 
           : (t.from_warehouse_id === historyWhFilter || t.to_warehouse_id === historyWhFilter);

    return searchCondition && filterCondition;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 relative">
      
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 shadow-sm z-10">
        <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Direct Store / Transfer</h2>
          <p className="text-sm text-slate-500 hidden md:block">Instantly transfer products to other Warehouses, Partners or Contingency</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col space-y-6">
        
        {msg.text && (
          <div className={`p-4 rounded-xl shadow-md border text-sm font-bold animate-in slide-in-from-top-2 flex justify-between items-center shrink-0 fixed top-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="flex items-center"><span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}</span>
            <button onClick={() => setMsg({text:'', type:''})} className="p-1 rounded-md hover:bg-black/5"><Icons.Close /></button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 shrink-0">
          
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm xl:col-span-1 h-fit flex flex-col">
            <h3 className="text-lg font-bold text-slate-900 mb-5 flex items-center">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mr-3"><Icons.Upload /></div>
              Issue Details
            </h3>
            
            <form id="transfer-form" onSubmit={handleSubmitTransfer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Date</label>
                <input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 text-indigo-600">Source Warehouse</label>
                <select value={sourceWh} onChange={(e) => setSourceWh(e.target.value)} required className="w-full px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 transition-colors shadow-sm">
                  {warehouses.length === 0 ? (
                      <option value="">-- No Assigned Warehouses --</option>
                  ) : (
                      <option value="">-- Select Origin --</option>
                  )}
                  {warehouses.map(w => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
                </select>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                 <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Destination Type</label>
                   <select value={destType} onChange={(e) => {setDestType(e.target.value); setDestId('');}} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500">
                     <option value="WH">Another Warehouse (Direct Store)</option>
                     <option value="PARTNER">Issued to Other Partner/Inst.</option>
                     <option value="CONTINGENCY">Issued to Contingency Stock</option>
                   </select>
                 </div>

                 {destType !== 'CONTINGENCY' && (
                   <div className="animate-in fade-in">
                     <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Select Target</label>
                     <select value={destId} onChange={(e) => setDestId(e.target.value)} required className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500">
                       <option value="">-- Choose Target --</option>
                       {destType === 'WH' 
                         ? allWarehouses.filter(w => w.id !== sourceWh).map(w => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)
                         : partners.map(p => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)
                       }
                     </select>
                   </div>
                 )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Remarks / Details</label>
                <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500" placeholder="e.g. Sent via Truck DHA-11" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">PO / Ref No (Optional)</label>
                <input 
                  type="text" 
                  value={referenceNo} 
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="Leave blank if N/A"
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 transition-colors" 
                />
              </div>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm xl:col-span-2 flex flex-col h-[650px] xl:h-auto overflow-hidden">
             <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                <div className="w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50">
                   <div className="p-4 border-b border-slate-200 bg-white shrink-0">
                     <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide">Available in Source</h4>
                     <p className="text-[10px] text-slate-500 mt-0.5">Select a source warehouse first.</p>
                   </div>
                   <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                     {isLoading ? (
                       <div className="text-center p-6"><Icons.Spinner /></div>
                     ) : !sourceWh ? (
                       <div className="text-center p-6 text-slate-400 text-sm font-medium border-2 border-dashed border-slate-200 rounded-xl m-2">
                         Select Source Warehouse
                       </div>
                     ) : availableStock.length === 0 ? (
                       <div className="text-center p-6 text-slate-400 text-sm font-medium">No stock available.</div>
                     ) : (
                       availableStock.map(stock => (
                         <div key={stock.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-white shadow-sm hover:border-indigo-300 transition-colors">
                           <div className="truncate pr-2">
                              <div className="flex items-center space-x-2">
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${stock.products.product_type === 'LPG' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                  {stock.products.product_type}
                                </span>
                                <p className="font-bold text-slate-900 text-xs truncate">{stock.products.name}</p>
                              </div>
                              <p className="text-[10px] text-slate-500 font-mono mt-1">
                                Avail: <span className="font-bold text-indigo-600">{stock.quantity}</span> {stock.products.unit_type}
                              </p>
                           </div>
                           <button onClick={() => handleAddToBag(stock)} className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 hover:bg-indigo-600 hover:text-white transition-colors shadow-sm">
                             <Icons.Plus />
                           </button>
                         </div>
                       ))
                     )}
                   </div>
                </div>

                <div className="w-full md:w-1/2 flex flex-col bg-white">
                   <div className="p-4 border-b border-indigo-100 bg-indigo-50 shrink-0 flex justify-between items-center">
                     <h4 className="font-bold text-indigo-900 text-xs uppercase flex items-center">
                       <Icons.Manifest /> <span className="ml-2">Issue Bag</span>
                     </h4>
                     <div className="flex items-center space-x-2">
                        <button onClick={downloadTemplate} title="Download Excel Template" className="p-1.5 bg-white text-indigo-600 rounded-md shadow-sm border border-indigo-200 hover:bg-indigo-600 hover:text-white transition-colors">
                           <Icons.Download />
                        </button>
                        <div className="relative">
                           <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" title="Upload Bulk Excel" />
                           <button className="px-3 py-1 bg-white text-indigo-600 font-bold text-[10px] uppercase rounded-md shadow-sm border border-indigo-200 pointer-events-none">
                              Bulk Upload
                           </button>
                        </div>
                        <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded-full">{transferItems.length} Items</span>
                     </div>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar relative">
                     {transferItems.length === 0 ? (
                       <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-center p-4">
                         <span className="text-4xl mb-3 opacity-50">📦</span>
                         <p className="text-sm font-bold text-slate-500">Bag is empty</p>
                       </div>
                     ) : (
                       transferItems.map(item => (
                         <div key={item.product_id} className="bg-slate-50 p-3 rounded-xl border border-indigo-100 shadow-sm relative">
                           <div className="flex justify-between items-start mb-2 pr-6">
                             <p className="font-bold text-slate-900 text-xs leading-tight">{item.products.name}</p>
                             <button type="button" onClick={() => handleRemoveFromBag(item.product_id)} className="text-rose-400 hover:text-rose-600 bg-rose-50 p-1.5 rounded-lg transition-colors absolute top-2 right-2">
                               <Icons.Trash />
                             </button>
                           </div>
                           <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
                             <div className="text-[9px] font-bold text-slate-500">
                               MAX: <span className="text-slate-800">{item.max_qty}</span>
                             </div>
                             <div className="flex items-center space-x-2">
                               <span className="text-[10px] font-bold text-slate-700 uppercase">Qty:</span>
                               <input 
                                 type="number" min="1" max={item.max_qty}
                                 value={item.transfer_qty || ''} 
                                 onChange={(e) => handleUpdateTransferQty(item.product_id, e.target.value)}
                                 className="w-20 text-right px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-bold text-emerald-700 outline-none focus:border-emerald-500"
                               />
                             </div>
                           </div>
                         </div>
                       ))
                     )}
                   </div>
                   <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0">
                      <button type="submit" form="transfer-form" disabled={isSubmitting || transferItems.length === 0} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-md flex justify-center disabled:opacity-50">
                        {isSubmitting ? <><Icons.Spinner /> Processing...</> : 'Confirm Direct Transfer'}
                      </button>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* BOTTOM SECTION: List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col shrink-0 mt-4">
           <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row justify-between items-center bg-slate-50/50 gap-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Recent Transfers / Issues</h3>
              <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-3 w-full lg:w-auto">
                 <div className="w-full sm:w-auto">
                   <select value={historyWhFilter} onChange={(e) => setHistoryWhFilter(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500">
                     <option value="ALL">All My Warehouses</option>
                     {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                   </select>
                 </div>

                 <div className="relative w-full sm:w-64">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icons.Search /></div>
                   <input type="text" placeholder="Search TXN, Source, Dest..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500" />
                 </div>
                 
                 <div className="flex space-x-2 shrink-0">
                   <button onClick={handleExportExcel} className="flex px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-colors shadow-sm">
                     <Icons.Download /> <span className="ml-1 hidden sm:inline">Excel</span>
                   </button>
                   <button onClick={handleExportPDF} className="flex px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl hover:bg-rose-100 transition-colors shadow-sm">
                     <Icons.Download /> <span className="ml-1 hidden sm:inline">PDF</span>
                   </button>
                 </div>
              </div>
           </div>
           
           <div className="overflow-x-auto w-full">
             <table className="w-full text-left border-collapse table-auto min-w-[900px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase w-32">Date & TXN</th>
                    <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase">Source</th>
                    <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase">Destination</th>
                    <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase text-right">Items / Qty</th>
                    <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase text-center w-28">Status</th>
                    <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase text-right w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr><td colSpan={6} className="p-10 text-center"><Icons.Spinner /></td></tr>
                  ) : filteredTransfers.length === 0 ? (
                    <tr><td colSpan={6} className="p-10 text-center text-sm text-slate-500 font-medium">No recent transfers found.</td></tr>
                  ) : (
                    filteredTransfers.map((t) => {
                      const isDisabled = t.status === 'Cancelled' || t.status === 'Rejected';
                      const txnId = `TXN-${t.id.split('-')[0].toUpperCase()}`;
                      const totalQty = t.stock_transfer_items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0;
                      
                      return (
                        <tr key={t.id} className={`hover:bg-slate-50 group transition-colors ${isDisabled ? 'grayscale opacity-70' : ''}`}>
                          <td className="px-4 py-3 align-top">
                            <p className="font-bold text-slate-900 text-sm">{new Date(t.transfer_date).toLocaleDateString()}</p>
                            <p className="text-[10px] text-indigo-600 font-mono mt-0.5 font-bold">{txnId}</p>
                            {t.reference_no && <p className="text-[9px] text-slate-400 mt-0.5">PO: {t.reference_no}</p>}
                          </td>
                          
                          <td className="px-4 py-3 align-top">
                             <p className="font-bold text-slate-900 text-sm">{t.from_warehouse?.name || 'Unknown'}</p>
                             <p className="text-[10px] text-slate-500 mt-0.5">Code: {t.from_warehouse?.code || 'N/A'}</p>
                          </td>
                          
                          <td className="px-4 py-3 align-top">
                             {t.destination_type === 'WH' && (
                               <><span className="text-[8px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100 mb-1 inline-block uppercase">WAREHOUSE</span>
                               <p className="font-bold text-slate-900 text-sm">{t.to_warehouse?.name}</p></>
                             )}
                             {t.destination_type === 'PARTNER' && (
                               <><span className="text-[8px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-100 mb-1 inline-block uppercase">PARTNER/NGO</span>
                               <p className="font-bold text-slate-900 text-sm">{t.to_partner?.name}</p></>
                             )}
                             {t.destination_type === 'CONTINGENCY' && (
                               <><span className="text-[8px] font-bold bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-100 mb-1 inline-block uppercase">CONTINGENCY</span>
                               <p className="font-bold text-slate-900 text-sm">Contingency Stock</p></>
                             )}
                          </td>
                          
                          <td className="px-4 py-3 text-right align-top">
                             <div className="flex flex-col items-end justify-start">
                               <div className="flex items-baseline space-x-1">
                                 <span className="font-black text-rose-600 text-lg">{totalQty}</span>
                                 <span className="text-[10px] text-slate-500 uppercase">Units</span>
                               </div>
                               <span className="text-[8px] font-bold bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-100 mt-1 inline-block uppercase">STORE/OUT</span>
                             </div>
                          </td>

                          <td className="px-4 py-3 align-top text-center">
                             <span className={`text-[10px] font-bold px-2 py-1 rounded-full border inline-block mt-1 ${t.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                               {t.status}
                             </span>
                          </td>
                          
                          <td className="px-4 py-3 align-top text-right">
                             <div className="flex justify-end items-center">
                               <button onClick={() => { setSelectedTransferDetails(t); setDetailsModalOpen(true); }} className="px-2 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-[10px] font-bold border border-indigo-100 transition-colors mr-2 whitespace-nowrap">
                                 View Details
                               </button>
                               <button onClick={() => openEditModal(t)} disabled={isDisabled} className={`p-1.5 rounded-lg transition-colors border mr-1 ${isDisabled ? 'text-slate-300 border-transparent cursor-not-allowed' : 'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 border-transparent hover:border-indigo-100'}`} title={isDisabled ? 'Cancelled' : 'Edit Quantities'}>
                                 <Icons.Edit />
                               </button>
                               <button onClick={() => openCancelModal(t)} disabled={isDisabled} className={`p-1.5 rounded-lg transition-colors border ${isDisabled ? 'text-slate-300 border-transparent cursor-not-allowed' : 'text-rose-400 hover:text-rose-600 hover:bg-rose-50 border-transparent hover:border-rose-100'}`} title={isDisabled ? 'Cancelled' : 'Delete & Revert Stock'}>
                                 <Icons.Trash />
                               </button>
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

      {detailsModalOpen && selectedTransferDetails && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900">Transfer Details</h3>
                <p className="text-[10px] text-indigo-600 font-mono font-bold mt-1">TXN-{selectedTransferDetails.id.split('-')[0].toUpperCase()}</p>
              </div>
              <button onClick={() => setDetailsModalOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200"><Icons.Close /></button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
               
               <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                 <div>
                   <p className="text-[9px] font-bold text-slate-500 uppercase">Transfer Date</p>
                   <p className="text-sm font-bold text-slate-800">{new Date(selectedTransferDetails.transfer_date).toLocaleDateString()}</p>
                 </div>
                 <div>
                   <p className="text-[9px] font-bold text-slate-500 uppercase">Status</p>
                   <p className="text-xs font-bold text-emerald-600">{selectedTransferDetails.status}</p>
                 </div>
                 <div className="col-span-2 pt-2 border-t border-slate-200">
                   <p className="text-[9px] font-bold text-slate-500 uppercase">Source Warehouse</p>
                   <p className="text-sm font-bold text-slate-800">{selectedTransferDetails.from_warehouse?.name}</p>
                 </div>
                 <div className="col-span-2 pt-2 border-t border-slate-200">
                   <p className="text-[9px] font-bold text-slate-500 uppercase">Target Destination ({selectedTransferDetails.destination_type})</p>
                   <p className="text-sm font-bold text-slate-800">
                     {selectedTransferDetails.destination_type === 'WH' && selectedTransferDetails.to_warehouse?.name}
                     {selectedTransferDetails.destination_type === 'PARTNER' && selectedTransferDetails.to_partner?.name}
                     {selectedTransferDetails.destination_type === 'CONTINGENCY' && "Contingency Stock"}
                   </p>
                 </div>
               </div>

               <div>
                 <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Items Included</p>
                 <div className="space-y-2">
                   {selectedTransferDetails.stock_transfer_items?.map((item: any, idx: number) => (
                     <div key={idx} className="flex justify-between items-center bg-white border border-slate-200 p-3 rounded-lg shadow-sm">
                       <div>
                         <p className="text-sm font-bold text-slate-900">{item.products?.name}</p>
                         <p className="text-[9px] text-slate-500 font-mono mt-0.5">Code: {item.products?.code}</p>
                       </div>
                       <div className="text-right">
                         <span className="font-black text-rose-600 text-base">{item.quantity}</span>
                         <span className="text-[9px] font-bold text-slate-500 uppercase ml-1">{item.products?.unit_type}</span>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>

               {selectedTransferDetails.remarks && (
                 <div>
                   <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Remarks</p>
                   <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">{selectedTransferDetails.remarks}</p>
                 </div>
               )}
            </div>
          </div>
        </div>
      )}

      {editModalOpen && transferToEdit && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900">Edit Transfer Details</h3>
                <p className="text-[10px] text-indigo-600 font-mono font-bold mt-1">TXN-{transferToEdit.id.split('-')[0].toUpperCase()}</p>
              </div>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200"><Icons.Close /></button>
            </div>
            
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Transfer Date</label>
                 <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} required className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 transition-colors" />
               </div>

               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Transferred Items</label>
                 <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-2 custom-scrollbar">
                    {editItems.length === 0 ? (
                      <div className="text-center text-xs text-slate-400 py-4"><Icons.Spinner /> Loading...</div>
                    ) : (
                      editItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-200 pb-3 mb-3 last:border-0 last:pb-0 last:mb-0">
                           <div className="pr-2">
                             <span className="font-bold text-slate-800 block text-sm">{item.products?.name}</span>
                             <span className="text-[10px] font-bold text-slate-500 uppercase mt-0.5 block">
                               Max Allowed: <span className="text-emerald-600 font-black">{item.max_capacity}</span> {item.products?.unit_type}
                               <span className="text-slate-400 font-normal ml-1 normal-case">(Avail: {item.current_stock} + Transferred: {item.original_qty})</span>
                             </span>
                           </div>
                           <div className="flex items-center space-x-2 shrink-0">
                             <input 
                               type="number" min="1" max={item.max_capacity}
                               value={item.quantity || ''}
                               onChange={(e) => {
                                 const val = parseInt(e.target.value) || 0;
                                 setEditItems(editItems.map((i, currIdx) => currIdx === idx ? { ...i, quantity: val } : i));
                               }}
                               className="w-16 text-right px-2 py-1.5 bg-white border border-slate-300 rounded-md text-sm font-bold text-indigo-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                             />
                             <span className="text-[10px] text-slate-500 uppercase font-bold w-8">{item.products?.unit_type}</span>
                           </div>
                        </div>
                      ))
                    )}
                 </div>
               </div>

               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Remarks / Details</label>
                 <input type="text" value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 transition-colors" />
               </div>
               
               <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-md flex justify-center items-center mt-2 disabled:opacity-50">
                 {isSubmitting ? <><Icons.Spinner /> Saving...</> : 'Save Changes & Update DB'}
               </button>
            </form>
          </div>
        </div>
      )}

      {cancelModalOpen && transferToCancel && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-5 border-b border-rose-100 bg-rose-50 flex justify-between items-center">
              <h3 className="font-bold text-rose-900">Delete & Revert Stock</h3>
              <button onClick={() => setCancelModalOpen(false)} className="text-rose-400 hover:text-rose-700 bg-white p-1.5 rounded-lg border border-rose-200"><Icons.Close /></button>
            </div>
            
            <div className="p-6 text-center">
               <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">⚠️</div>
               <h4 className="text-lg font-bold text-slate-900 mb-2">Are you sure?</h4>
               <p className="text-sm text-slate-500 mb-6">
                 Deleting TXN-{transferToCancel.id.split('-')[0].toUpperCase()} will permanently revert the stock back from Destination to Source Warehouse.
               </p>
               <button onClick={confirmCancelTransfer} disabled={isSubmitting} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl shadow-md transition-all flex justify-center items-center">
                 {isSubmitting ? <><Icons.Spinner /> Reverting...</> : 'Yes, Delete Transaction'}
               </button>
               <button onClick={() => setCancelModalOpen(false)} className="w-full bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold py-3 rounded-xl mt-3 transition-all">
                 Keep Transfer
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}