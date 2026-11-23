"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from './../../components/Icons';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const GLOBAL_SETTINGS_ID = 'warehouse_stock_report';

// Extract YYYY-MM-DD without timezone shifting
const extractYYYYMMDD = (dateString: string): string => {
  if (!dateString) return '';
  const match = String(dateString).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : String(dateString).substring(0, 10);
};

// Format YYYY-MM-DD as DD.MM.YYYY
const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const clean = extractYYYYMMDD(dateStr);
  const [y, m, d] = clean.split('-');
  return y && m && d ? `${d}.${m}.${y}` : clean;
};

// Normalize product codes (case-insensitive, trimmed, leading-zero safe for numeric codes)
const normalizeProductKey = (code: any): string => {
  const cleaned = String(code || '').trim().toLowerCase();
  if (!cleaned) return '';
  if (/^\d+$/.test(cleaned)) {
    return cleaned.replace(/^0+/, '') || '0';
  }
  return cleaned;
};

const normalizeWhCode = (code: any): string => String(code || '').trim().toLowerCase();

interface WarehouseItem {
  id: string;
  name: string;
  code: string;
  donor_codes: string[];
}

interface ProductItem {
  id: string;
  name: string;
  code: string;
  unit_type: string;
  product_type: string;
}

interface MismatchItem {
  id: string;
  wh_id: string;
  wh_code: string;
  wh_name: string;
  product_code: string;
  product_name: string;
  unit: string;
  our_qty: number;
  cuboid_qty: number;
  diff: number;
  issue_type: 'MISMATCH' | 'MISSING_IN_CUBOID' | 'MISSING_IN_OUR_WH';
}

interface AnyDict {
  [key: string]: any;
}

interface BoolDict {
  [key: string]: boolean;
}

interface NumberDict {
  [key: string]: number;
}

export default function WarehouseStockReportPage() {
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [allProducts, setAllProducts] = useState<ProductItem[]>([]);
  const [recentCuboidDates, setRecentCuboidDates] = useState<string[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Main Filters
  const [targetDate, setTargetDate] = useState('');
  const [selectedWhs, setSelectedWhs] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  // Inline Selector Searches
  const [whSearch, setWhSearch] = useState('');
  const [prodSearch, setProdSearch] = useState('');

  // Table View Filters
  const [tableSearch, setTableSearch] = useState('');
  const [showCuboidCompare, setShowCuboidCompare] = useState(true);
  const [onlyMismatchedRows, setOnlyMismatchedRows] = useState(false);
  const [mismatchWhFilter, setMismatchWhFilter] = useState('ALL');
  const [mismatchTypeFilter, setMismatchTypeFilter] = useState('ALL');

  // Report Data & Reconciliation State
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportWhs, setReportWhs] = useState<WarehouseItem[]>([]);
  const [mismatches, setMismatches] = useState<MismatchItem[]>([]);
  const [cuboidHasData, setCuboidHasData] = useState(false);
  const [whMismatchCounts, setWhMismatchCounts] = useState<NumberDict>({});
  const [hasGenerated, setHasGenerated] = useState(false);

  // UI & Modals
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [pendingExportType, setPendingExportType] = useState<'excel' | 'pdf' | null>(null);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4500);
  };

  useEffect(() => {
    const today = new Date();
    const currentDay = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
      .toISOString()
      .split('T')[0];
    setTargetDate(currentDay);
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [authRes, whRes, mapRes, prodRes, recentDateRes, globalCfgRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('warehouses').select('id, name, code').order('name'),
        supabase.from('warehouse_mappings').select('system_wh_id, donor_wh_code, donor_wh_name'),
        supabase
          .from('products')
          .select('id, name, code, unit_type, product_type, status')
          .eq('status', 'Active')
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
        supabase
          .from('donor_warehouse_stock')
          .select('stock_date')
          .order('stock_date', { ascending: false })
          .limit(500),
        supabase
          .from('report_builder_settings')
          .select('report_settings')
          .eq('id', GLOBAL_SETTINGS_ID)
          .maybeSingle()
      ]);

      if (authRes.data?.user?.email) {
        setCurrentUserEmail(authRes.data.user.email);
      }

      const mapRows = mapRes.data || [];

      const formattedWhs: WarehouseItem[] = (whRes.data || []).map((w: any) => {
        const sysId = String(w.id).trim();
        const sysCode = String(w.code || '').trim();
        const donorDict: BoolDict = {};

        mapRows.forEach((m: any) => {
          if (String(m.system_wh_id || '').trim() === sysId && m.donor_wh_code) {
            donorDict[String(m.donor_wh_code).trim()] = true;
          }
        });

        if (Object.keys(donorDict).length === 0 && sysCode) {
          donorDict[sysCode] = true;
        }

        return {
          id: sysId,
          name: String(w.name || '').trim(),
          code: sysCode || Object.keys(donorDict)[0] || '',
          donor_codes: Object.keys(donorDict)
        };
      });

      const formattedProds: ProductItem[] = (prodRes.data || []).map((p: any) => ({
        id: String(p.id),
        name: String(p.name || '').trim(),
        code: String(p.code || '').trim(),
        unit_type: String(p.unit_type || 'Pc').trim(),
        product_type: String(p.product_type || '').trim()
      }));

      const dateDict: BoolDict = {};
      (recentDateRes.data || []).forEach((r: any) => {
        const d = extractYYYYMMDD(r.stock_date);
        if (d) dateDict[d] = true;
      });
      const sortedDates = Object.keys(dateDict).sort((a, b) => b.localeCompare(a)).slice(0, 7);

      // Load Global Settings from DB (fallback to Select All if not yet configured)
      const savedCfg = globalCfgRes.data?.report_settings || {};
      const validWhIdDict: BoolDict = {};
      formattedWhs.forEach(w => {
        validWhIdDict[w.id] = true;
      });
      const validProdIdDict: BoolDict = {};
      formattedProds.forEach(p => {
        validProdIdDict[p.id] = true;
      });

      let initialWhIds = formattedWhs.map(w => w.id);
      if (Array.isArray(savedCfg.selected_wh_ids)) {
        initialWhIds = savedCfg.selected_wh_ids
          .map((id: any) => String(id).trim())
          .filter((id: string) => validWhIdDict[id]);
      }

      let initialProdIds = formattedProds.map(p => p.id);
      if (Array.isArray(savedCfg.selected_product_ids)) {
        initialProdIds = savedCfg.selected_product_ids
          .map((id: any) => String(id).trim())
          .filter((id: string) => validProdIdDict[id]);
      }

      if (typeof savedCfg.show_cuboid_compare === 'boolean') {
        setShowCuboidCompare(savedCfg.show_cuboid_compare);
      }

      setWarehouses(formattedWhs);
      setSelectedWhs(initialWhIds);
      setAllProducts(formattedProds);
      setSelectedProducts(initialProdIds);
      setRecentCuboidDates(sortedDates);
    } catch (err: any) {
      console.error('Error fetching initial data:', err);
      showMessage(`Failed to load master data: ${err.message || 'Unknown error'}`, 'error');
    }
    setIsLoading(false);
  };

  // Save current warehouse & product selections globally in Supabase
  const handleSaveGlobalSettings = async () => {
    setIsSavingSettings(true);
    try {
      const { error } = await supabase
        .from('report_builder_settings')
        .upsert(
          {
            id: GLOBAL_SETTINGS_ID,
            report_settings: {
              selected_wh_ids: selectedWhs,
              selected_product_ids: selectedProducts,
              show_cuboid_compare: showCuboidCompare
            },
            updated_by: currentUserEmail,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'id' }
        );

      if (error) throw error;
      showMessage(
        `Saved globally (${selectedWhs.length} WHs, ${selectedProducts.length} Products) for all users!`,
        'success'
      );
    } catch (err: any) {
      console.error('Error saving global settings:', err);
      showMessage(`Failed to save global settings: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Batch fetch inventory_transactions up to targetDate (bypasses 1,000-row limit)
  const fetchAllTransactionsUpToDate = async (whIds: string[], dateStr: string) => {
    if (whIds.length === 0 || !dateStr) return [];
    const allRows: any[] = [];
    const batchSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('warehouse_id, product_id, transaction_type, quantity, created_at')
        .in('warehouse_id', whIds)
        .lte('created_at', `${dateStr}T23:59:59.999Z`)
        .range(from, from + batchSize - 1);

      if (error) throw error;
      if (data && data.length > 0) {
        allRows.push(...data);
        from += batchSize;
        if (data.length < batchSize) hasMore = false;
      } else {
        hasMore = false;
      }
    }
    return allRows;
  };

  // Batch fetch donor_warehouse_stock for targetDate
  const fetchAllCuboidForDate = async (donorCodes: string[], dateStr: string) => {
    if (donorCodes.length === 0 || !dateStr) return [];
    const allRows: any[] = [];
    const batchSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('donor_warehouse_stock')
        .select('warehouse_code, warehouse_name, product_code, product_name, quantity, stock_date')
        .in('warehouse_code', donorCodes)
        .eq('stock_date', dateStr)
        .range(from, from + batchSize - 1);

      if (error) throw error;
      if (data && data.length > 0) {
        allRows.push(...data);
        from += batchSize;
        if (data.length < batchSize) hasMore = false;
      } else {
        hasMore = false;
      }
    }
    return allRows;
  };

  const handleWhToggle = (whId: string) => {
    setSelectedWhs(prev => (prev.includes(whId) ? prev.filter(id => id !== whId) : [...prev, whId]));
  };

  const handleProductToggle = (prodId: string) => {
    setSelectedProducts(prev => (prev.includes(prodId) ? prev.filter(id => id !== prodId) : [...prev, prodId]));
  };

  // Unique product types (e.g., LPG, NFI) for quick type-wise selection buttons
  const productTypeDict: BoolDict = {};
  allProducts.forEach(p => {
    const t = String(p.product_type || '').trim();
    if (t) productTypeDict[t] = true;
  });
  const productTypes = Object.keys(productTypeDict).sort();

  const handleSelectByProductType = (typeName: string) => {
    const typeIds = allProducts
      .filter(p => String(p.product_type || '').trim().toLowerCase() === typeName.toLowerCase())
      .map(p => p.id);
    setSelectedProducts(typeIds);
  };

  const isExactTypeSelected = (typeName: string): boolean => {
    const typeIds = allProducts
      .filter(p => String(p.product_type || '').trim().toLowerCase() === typeName.toLowerCase())
      .map(p => p.id);
    if (typeIds.length === 0 || selectedProducts.length !== typeIds.length) return false;
    return typeIds.every(id => selectedProducts.includes(id));
  };

  const handleGenerateReport = async (overrideDate?: string) => {
    const activeDate = overrideDate || targetDate;
    if (!activeDate) {
      showMessage('Please select a target date.', 'error');
      return;
    }
    if (selectedWhs.length === 0) {
      showMessage('Please select at least one warehouse.', 'error');
      return;
    }
    if (selectedProducts.length === 0) {
      showMessage('Please select at least one product.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const activeWhs = warehouses.filter(w => selectedWhs.includes(w.id));
      const activeProducts = allProducts.filter(p => selectedProducts.includes(p.id));

      // Collect all linked CUBOID warehouse codes for selected warehouses
      const donorCodeDict: BoolDict = {};
      activeWhs.forEach(wh => {
        wh.donor_codes.forEach(dc => {
          if (dc) donorCodeDict[dc] = true;
        });
      });
      const allDonorCodes = Object.keys(donorCodeDict);

      // Fetch our transactions and CUBOID stock in parallel
      const [txns, cuboidRows] = await Promise.all([
        fetchAllTransactionsUpToDate(selectedWhs, activeDate),
        fetchAllCuboidForDate(allDonorCodes, activeDate)
      ]);

      // 1. Aggregate Our Warehouse Stock: key = `${warehouse_id}__${product_id}`
      const ourStockMap: NumberDict = {};
      txns.forEach(tx => {
        const txDateStr = extractYYYYMMDD(tx.created_at);
        if (txDateStr > activeDate) return;

        const key = `${tx.warehouse_id}__${tx.product_id}`;
        const qty = Number(tx.quantity) || 0;
        if (!ourStockMap[key]) ourStockMap[key] = 0;

        if (tx.transaction_type === 'IN' || tx.transaction_type === 'RECEIVE') {
          ourStockMap[key] += qty;
        } else if (tx.transaction_type === 'OUT' || tx.transaction_type === 'DAMAGE') {
          ourStockMap[key] -= qty;
        }
      });

      // 2. Map normalized donor_wh_code -> system warehouse IDs
      const donorToWhIds: AnyDict = {};
      activeWhs.forEach(wh => {
        wh.donor_codes.forEach(dc => {
          const norm = normalizeWhCode(dc);
          if (!norm) return;
          if (!donorToWhIds[norm]) donorToWhIds[norm] = [];
          if (!donorToWhIds[norm].includes(wh.id)) donorToWhIds[norm].push(wh.id);
        });
      });

      // Aggregate CUBOID Stock per (wh.id, normalizedProductCode)
      const cuboidByWh: AnyDict = {};
      activeWhs.forEach(wh => {
        cuboidByWh[wh.id] = {};
      });

      cuboidRows.forEach(r => {
        const normWh = normalizeWhCode(r.warehouse_code);
        const mappedWhIds: string[] = donorToWhIds[normWh] || [];
        const pKey = normalizeProductKey(r.product_code);
        if (!pKey || mappedWhIds.length === 0) return;

        const qty = Number(r.quantity) || 0;
        mappedWhIds.forEach(whId => {
          if (!cuboidByWh[whId][pKey]) {
            cuboidByWh[whId][pKey] = {
              qty: 0,
              product_code: String(r.product_code || '').trim(),
              product_name: String(r.product_name || r.product_code || '').trim()
            };
          }
          cuboidByWh[whId][pKey].qty += qty;
        });
      });

      // 3. Build Report Rows & Collect Mismatches STRICTLY for Selected Products Only
      const generatedRows: any[] = [];
      const foundMismatches: MismatchItem[] = [];
      const whMismatchCounter: NumberDict = {};

      activeWhs.forEach(wh => {
        whMismatchCounter[wh.id] = 0;
      });

      activeProducts.forEach((prod, index) => {
        const pKey = normalizeProductKey(prod.code);
        const rowData: any = {
          sl: index + 1,
          product_id: prod.id,
          product_name: prod.name,
          product_code: prod.code || 'N/A',
          unit: prod.unit_type || 'Pc',
          product_type: prod.product_type || '',
          wh_values: {} as AnyDict,
          row_has_mismatch: false
        };

        let ourTotal = 0;
        let cuboidTotal = 0;

        activeWhs.forEach(wh => {
          const ourQty = ourStockMap[`${wh.id}__${prod.id}`] || 0;
          const cuboidRec = pKey ? cuboidByWh[wh.id]?.[pKey] : undefined;
          const hasCuboidRec = Boolean(cuboidRec);
          const cuboidQty = hasCuboidRec ? Number(cuboidRec.qty) || 0 : 0;

          const diff = ourQty - cuboidQty;
          const isMismatch = diff !== 0;

          let status: 'MATCHED' | 'MISMATCH' | 'MISSING_IN_CUBOID' | 'MISSING_IN_OUR_WH' = 'MATCHED';
          if (isMismatch) {
            if (ourQty > 0 && !hasCuboidRec) status = 'MISSING_IN_CUBOID';
            else if (ourQty === 0 && hasCuboidRec && cuboidQty > 0) status = 'MISSING_IN_OUR_WH';
            else status = 'MISMATCH';

            rowData.row_has_mismatch = true;
            whMismatchCounter[wh.id] = (whMismatchCounter[wh.id] || 0) + 1;

            foundMismatches.push({
              id: `${wh.id}__${prod.id}`,
              wh_id: wh.id,
              wh_code: wh.code,
              wh_name: wh.name,
              product_code: prod.code || 'N/A',
              product_name: prod.name,
              unit: prod.unit_type || 'Pc',
              our_qty: ourQty,
              cuboid_qty: cuboidQty,
              diff,
              issue_type: status
            });
          }

          rowData[wh.name] = ourQty;
          rowData.wh_values[wh.id] = {
            our_qty: ourQty,
            cuboid_qty: cuboidQty,
            has_cuboid: hasCuboidRec,
            diff,
            status
          };

          ourTotal += ourQty;
          cuboidTotal += cuboidQty;
        });

        rowData.Total = ourTotal;
        rowData.CuboidTotal = cuboidTotal;
        rowData.TotalDiff = ourTotal - cuboidTotal;
        generatedRows.push(rowData);
      });

      // Sort mismatches by Warehouse name, then Product code
      foundMismatches.sort((a, b) => {
        const whCmp = a.wh_name.localeCompare(b.wh_name);
        if (whCmp !== 0) return whCmp;
        return String(a.product_code).localeCompare(String(b.product_code), undefined, { numeric: true });
      });

      setReportWhs(activeWhs);
      setReportData(generatedRows);
      setMismatches(foundMismatches);
      setWhMismatchCounts(whMismatchCounter);
      setCuboidHasData(cuboidRows.length > 0);
      setHasGenerated(true);
      setMismatchWhFilter('ALL');
      setMismatchTypeFilter('ALL');

      if (cuboidRows.length === 0) {
        showMessage(`Our stock calculated, but no CUBOID data found for ${formatDisplayDate(activeDate)}.`, 'error');
      } else if (foundMismatches.length === 0) {
        showMessage(`All selected products matched 100% with CUBOID for ${formatDisplayDate(activeDate)}!`, 'success');
      } else {
        showMessage(`Report ready — ${foundMismatches.length} mismatch/missing item(s) among selected products.`, 'error');
      }
    } catch (err: any) {
      console.error('Error generating report:', err);
      showMessage(`Failed to generate report: ${err.message || 'Unknown error'}`, 'error');
    }
    setIsLoading(false);
  };

  // Pre-export verification gate (only checks mismatches of selected products)
  const requestExport = (type: 'excel' | 'pdf') => {
    if (reportData.length === 0) return;

    if (mismatches.length > 0 || !cuboidHasData) {
      setPendingExportType(type);
      setExportConfirmOpen(true);
    } else {
      if (type === 'excel') executeExportExcel();
      else executeExportPDF();
    }
  };

  const confirmProceedExport = () => {
    const typeToRun = pendingExportType;
    setExportConfirmOpen(false);
    setPendingExportType(null);
    if (typeToRun === 'excel') executeExportExcel();
    else if (typeToRun === 'pdf') executeExportPDF();
  };

  // EXCEL EXPORT (Our Warehouse Stock Only — Fixed "TOTAL" at top of merged rightmost column)
  const executeExportExcel = () => {
    if (reportData.length === 0) return;
    const wb = XLSX.utils.book_new();

    const borderStyle = {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } }
    };

    const activeWhs = reportWhs;
    const aoa: any[][] = [];

    const header1 = ['SL', 'Goods Name', 'Unit'];
    const header2 = ['', '', ''];

    activeWhs.forEach(wh => {
      header1.push('CUBOID & Physical Qty');
      header2.push(wh.name);
    });

    // FIXED: Place "TOTAL" in top cell of the vertical merge so Excel renders it visibly
    header1.push('TOTAL');
    header2.push('');

    aoa.push([`Stock Summary Reports (As of ${targetDate})`]);
    aoa.push([]);
    aoa.push(header1);
    aoa.push(header2);

    reportData.forEach(row => {
      const rowData = [row.sl, row.product_name, row.unit];
      activeWhs.forEach(wh => rowData.push(row[wh.name]));
      rowData.push(row.Total);
      aoa.push(rowData);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa) as any;

    for (const key in ws) {
      if (key[0] === '!') continue;
      const cell = ws[key];
      const rowNum = parseInt(key.replace(/[^\d]/g, ''), 10) - 1;

      cell.s = { alignment: { vertical: 'center', horizontal: 'center', wrapText: true } };

      if (rowNum === 0) {
        cell.s.font = { bold: true, sz: 14, color: { rgb: '000000' } };
        cell.s.alignment = { horizontal: 'left', vertical: 'center' };
      } else if (rowNum > 0) {
        cell.s.border = borderStyle;

        if (rowNum === 2 || rowNum === 3) {
          cell.s.font = { bold: true, color: { rgb: '000000' } };
          cell.s.fill = { fgColor: { rgb: 'E2E8F0' } };
        } else {
          cell.s.font = { color: { rgb: '000000' } };
          if (cell.v === 0) cell.s.font.color = { rgb: '94A3B8' };
        }
      }
    }

    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }); // SL
    ws['!merges'].push({ s: { r: 2, c: 1 }, e: { r: 3, c: 1 } }); // Goods Name
    ws['!merges'].push({ s: { r: 2, c: 2 }, e: { r: 3, c: 2 } }); // Unit

    if (activeWhs.length > 0) {
      ws['!merges'].push({ s: { r: 2, c: 3 }, e: { r: 2, c: 3 + activeWhs.length - 1 } });
    }

    // Merge TOTAL column across rows 3 & 4 (0-indexed 2..3)
    ws['!merges'].push({ s: { r: 2, c: 3 + activeWhs.length }, e: { r: 3, c: 3 + activeWhs.length } });

    const colWidths = aoa[2].map((_, colIndex) => {
      let maxLength = colIndex === 0 ? 5 : 10;
      for (let r = 2; r < aoa.length; r++) {
        const val = aoa[r][colIndex] ? aoa[r][colIndex].toString() : '';
        if (val.length > maxLength) maxLength = val.length;
      }
      return { wch: Math.min(maxLength + 2, 40) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Stocks');
    XLSX.writeFile(wb, `Stock_Summary_Report_${targetDate}.xlsx`);
    showMessage('Our Warehouse Stock Excel exported successfully!', 'success');
  };

  // PDF EXPORT (Our Warehouse Stock Only)
  const executeExportPDF = () => {
    if (reportData.length === 0) return;
    const doc = new jsPDF('landscape');

    doc.setFontSize(14);
    doc.text('Stock Summary Reports', 14, 15);
    doc.setFontSize(9);
    doc.text(`As of Date: ${targetDate} | Generated on: ${new Date().toLocaleString()}`, 14, 21);

    const activeWhs = reportWhs;

    const head1: any[] = [
      { content: 'SL', rowSpan: 2 },
      { content: 'Goods Name', rowSpan: 2 },
      { content: 'Unit', rowSpan: 2 }
    ];

    if (activeWhs.length > 0) {
      head1.push({ content: 'CUBOID & Physical Qty', colSpan: activeWhs.length, styles: { halign: 'center' } });
    }
    head1.push({
      content: 'TOTAL',
      rowSpan: 2,
      styles: { halign: 'center', fillColor: [226, 232, 240], textColor: [0, 0, 0] }
    });

    const head2: any[] = [];
    activeWhs.forEach(wh => head2.push(wh.name));

    const body = reportData.map(row => {
      const r = [row.sl, row.product_name, row.unit];
      activeWhs.forEach(wh => r.push(row[wh.name]));
      r.push(row.Total);
      return r;
    });

    autoTable(doc, {
      head: [head1, head2],
      body: body,
      startY: 26,
      styles: { fontSize: 7, cellPadding: 2, textColor: [0, 0, 0], lineColor: [200, 200, 200], lineWidth: 0.1 },
      headStyles: { fillColor: [241, 245, 249], textColor: [0, 0, 0] },
      theme: 'grid'
    });

    doc.save(`Stock_Summary_Report_${targetDate}.pdf`);
    showMessage('Our Warehouse Stock PDF exported successfully!', 'success');
  };

  const getIssueLabel = (type: MismatchItem['issue_type']) => {
    if (type === 'MISMATCH') return 'Qty Mismatch';
    if (type === 'MISSING_IN_CUBOID') return 'Missing in CUBOID';
    if (type === 'MISSING_IN_OUR_WH') return 'Missing in Our WH';
    return type;
  };

  const handleCopyMismatchLog = async () => {
    if (mismatches.length === 0) return;
    const lines = [
      `Stock Reconciliation Discrepancies (${formatDisplayDate(targetDate)})`,
      `Total Issues (Selected Products): ${mismatches.length}`,
      '----------------------------------------',
      ...mismatches.map(
        (m, idx) =>
          `${idx + 1}. [${m.wh_code}] ${m.wh_name} | [${m.product_code}] ${m.product_name} -> Our WH: ${m.our_qty}, CUBOID: ${m.cuboid_qty}, Diff: ${m.diff > 0 ? `+${m.diff}` : m.diff} (${getIssueLabel(m.issue_type)})`
      )
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      showMessage('Mismatch details copied to clipboard!', 'success');
    } catch {
      showMessage('Could not copy automatically.', 'error');
    }
  };

  // Filtered selector lists
  const filteredWhOptions = warehouses.filter(wh => {
    const q = whSearch.trim().toLowerCase();
    if (!q) return true;
    return wh.name.toLowerCase().includes(q) || wh.code.toLowerCase().includes(q);
  });

  const filteredProdOptions = allProducts.filter(p => {
    const q = prodSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.product_type.toLowerCase().includes(q)
    );
  });

  // Filtered table rows for web preview
  const filteredReportRows = reportData.filter(row => {
    const q = tableSearch.trim().toLowerCase();
    const matchSearch =
      !q ||
      String(row.product_name || '').toLowerCase().includes(q) ||
      String(row.product_code || '').toLowerCase().includes(q);
    const matchMismatch = !onlyMismatchedRows || row.row_has_mismatch;
    return matchSearch && matchMismatch;
  });

  // Filtered mismatches for bottom log panel
  const filteredMismatches = mismatches.filter(m => {
    const matchWh = mismatchWhFilter === 'ALL' || m.wh_id === mismatchWhFilter;
    const matchType = mismatchTypeFilter === 'ALL' || m.issue_type === mismatchTypeFilter;
    return matchWh && matchType;
  });

  // Summary Totals
  const grandOurTotal = reportData.reduce((sum, r) => sum + (Number(r.Total) || 0), 0);
  const grandCuboidTotal = reportData.reduce((sum, r) => sum + (Number(r.CuboidTotal) || 0), 0);
  const grandDiff = grandOurTotal - grandCuboidTotal;

  const qtyMismatchCount = mismatches.filter(m => m.issue_type === 'MISMATCH').length;
  const missingCuboidCount = mismatches.filter(m => m.issue_type === 'MISSING_IN_CUBOID').length;
  const missingOurWhCount = mismatches.filter(m => m.issue_type === 'MISSING_IN_OUR_WH').length;

  return (
    <div className="flex flex-col min-h-screen w-full animate-in fade-in duration-500 relative bg-slate-50 text-black">

      {/* Toast Notification */}
      {msg.text && (
        <div
          className={`fixed top-24 left-1/2 -translate-x-1/2 z-[120] w-[92%] max-w-lg px-4 py-3 rounded-xl shadow-lg border text-xs md:text-sm font-bold flex items-center justify-between animate-in slide-in-from-top-2 ${
            msg.type === 'error'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}
        >
          <span>
            {msg.type === 'error' ? '⚠️' : '✅'} {msg.text}
          </span>
          <button onClick={() => setMsg({ text: '', type: '' })} className="p-1 rounded hover:bg-black/5 ml-2">
            <Icons.Close />
          </button>
        </div>
      )}

      {/* Pre-Export Mismatch Confirmation Modal */}
      {exportConfirmOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95">
            <div className="p-5 border-b border-rose-200 bg-rose-50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center text-xl shrink-0">
                  ⚠️
                </div>
                <div>
                  <h3 className="font-black text-rose-950 text-base md:text-lg leading-tight">
                    {!cuboidHasData && mismatches.length === 0
                      ? 'CUBOID Data Not Found for This Date'
                      : 'Stock Mismatch / Missing Items Detected'}
                  </h3>
                  <p className="text-xs text-rose-700 font-semibold mt-0.5">
                    {!cuboidHasData
                      ? `No CUBOID snapshot exists for ${formatDisplayDate(targetDate)} to verify against.`
                      : `${mismatches.length} discrepancy item(s) found among your selected products.`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setExportConfirmOpen(false);
                  setPendingExportType(null);
                }}
                className="p-1.5 bg-white border border-rose-200 text-rose-500 rounded-lg hover:bg-rose-100"
              >
                <Icons.Close />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
              {mismatches.length > 0 && (
                <>
                  <div className="grid grid-cols-3 gap-2.5 text-center">
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                      <p className="text-[10px] font-bold text-rose-600 uppercase">Qty Mismatch</p>
                      <p className="text-xl font-black text-rose-700">{qtyMismatchCount}</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                      <p className="text-[10px] font-bold text-amber-700 uppercase">Missing in CUBOID</p>
                      <p className="text-xl font-black text-amber-700">{missingCuboidCount}</p>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-2.5">
                      <p className="text-[10px] font-bold text-purple-700 uppercase">Missing in Our WH</p>
                      <p className="text-xl font-black text-purple-700">{missingOurWhCount}</p>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-100 px-3.5 py-2 text-[10px] font-black text-slate-600 uppercase border-b border-slate-200">
                      Discrepancy Summary ({mismatches.length} Lines)
                    </div>
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 bg-white custom-scrollbar">
                      {mismatches.map((m, i) => (
                        <div key={m.id} className="px-3.5 py-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                          <div className="min-w-0">
                            <span className="font-black text-slate-400 mr-1.5">{i + 1}.</span>
                            <span className="font-bold text-slate-900">[{m.wh_code}] {m.wh_name}</span>
                            <span className="mx-1.5 text-slate-400">•</span>
                            <span className="font-mono font-bold text-indigo-700">{m.product_code}</span>{' '}
                            <span className="font-semibold text-slate-700">{m.product_name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-[11px] font-bold">
                            <span className="text-indigo-700">Our: {m.our_qty.toLocaleString()}</span>
                            <span className="text-emerald-700">CUBOID: {m.cuboid_qty.toLocaleString()}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${m.diff > 0 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
                              {m.diff > 0 ? `+${m.diff.toLocaleString()}` : m.diff.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 font-medium leading-relaxed">
                The exported <strong>{pendingExportType === 'excel' ? 'Excel' : 'PDF'}</strong> file will contain{' '}
                <strong>Our Warehouse Stock only</strong> (as of <strong>{formatDisplayDate(targetDate)}</strong>). Do you still want to proceed?
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row justify-end gap-2.5 shrink-0">
              <button
                onClick={() => {
                  setExportConfirmOpen(false);
                  setPendingExportType(null);
                }}
                className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-100 text-xs md:text-sm transition-colors"
              >
                Cancel &amp; Review
              </button>
              <button
                onClick={confirmProceedExport}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs md:text-sm shadow-md transition-colors"
              >
                Yes, Proceed &amp; Export {pendingExportType === 'excel' ? 'Excel' : 'PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header (pr-16 md:pr-20 avoids floating profile overlap) */}
      <header className="flex flex-col sm:flex-row min-h-16 md:h-20 bg-white border-b border-slate-200 items-start sm:items-center px-4 md:px-6 pr-16 md:pr-20 shrink-0 z-20 shadow-sm justify-between gap-3 py-3 sticky top-0">
        <div className="flex items-center min-w-0">
          <button
            onClick={() => window.history.back()}
            className="mr-3 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="min-w-0">
            <h2 className="text-lg md:text-2xl font-bold text-slate-900 leading-tight truncate">
              Warehouse Stock Report
            </h2>
            <p className="text-[11px] md:text-xs text-slate-500 hidden sm:block">
              Our Warehouse Closing Stock verified against CUBOID before export (Global Settings)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            onClick={() => requestExport('excel')}
            disabled={reportData.length === 0 || isLoading}
            className="flex-1 sm:flex-none justify-center px-3.5 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-colors flex items-center shadow-xs disabled:opacity-50"
          >
            <Icons.Download /> <span className="ml-1.5">Export Excel</span>
          </button>

          <button
            onClick={() => requestExport('pdf')}
            disabled={reportData.length === 0 || isLoading}
            className="flex-1 sm:flex-none justify-center px-3.5 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl hover:bg-rose-100 transition-colors flex items-center shadow-xs disabled:opacity-50"
          >
            <Icons.Download /> <span className="ml-1.5">Export PDF</span>
          </button>
        </div>
      </header>

      <div className="flex-1 p-3 md:p-6 flex flex-col space-y-4 max-w-[1600px] w-full mx-auto">

        {/* 1. FILTER BAR + SIDE-BY-SIDE WAREHOUSE & PRODUCT SELECTION */}
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
          <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-1">
              <div className="w-full sm:w-52">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                  Target Date (Closing As Of)
                </label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={e => setTargetDate(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-black outline-none focus:border-indigo-500 focus:bg-white shadow-xs cursor-pointer"
                />
              </div>

              {recentCuboidDates.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">CUBOID Dates:</span>
                  {recentCuboidDates.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setTargetDate(d);
                        handleGenerateReport(d);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                        targetDate === d
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700'
                      }`}
                    >
                      {formatDisplayDate(d)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSaveGlobalSettings}
                disabled={isSavingSettings || isLoading}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs md:text-sm font-bold rounded-xl transition-colors shadow-sm flex items-center justify-center h-[42px] disabled:opacity-50"
                title="Save selected Warehouses and Products globally for all users"
              >
                {isSavingSettings ? <Icons.Spinner /> : <span>💾</span>}
                <span className="ml-2">{isSavingSettings ? 'Saving...' : 'Save Global Settings'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleGenerateReport()}
                disabled={isLoading}
                className="flex-1 sm:flex-none px-6 py-2.5 bg-indigo-600 text-white text-xs md:text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-md flex items-center justify-center h-[42px] disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Icons.Spinner /> <span className="ml-2">Calculating...</span>
                  </>
                ) : (
                  <>
                    <Icons.Search /> <span className="ml-2">Generate &amp; Compare</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 2-Column Side-by-Side Selection: Warehouses (Left) & Products (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* LEFT: Warehouse Selection */}
            <div className="flex flex-col border border-slate-200 rounded-xl bg-slate-50/70 overflow-hidden">
              <div className="p-3 bg-white border-b border-slate-200 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                      Select Warehouses (Columns)
                    </label>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {selectedWhs.length} / {warehouses.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedWhs(warehouses.map(w => w.id))}
                      className="px-2 py-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedWhs([])}
                      className="px-2 py-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-md hover:bg-rose-100 transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Search warehouse name or code..."
                  value={whSearch}
                  onChange={e => setWhSearch(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="flex flex-wrap gap-1.5 content-start h-44 overflow-y-auto custom-scrollbar p-2.5">
                {warehouses.length === 0 ? (
                  <span className="text-xs text-slate-400 p-1 font-bold">Loading Warehouses...</span>
                ) : filteredWhOptions.length === 0 ? (
                  <span className="text-xs text-slate-400 p-1 font-bold">No matching warehouses.</span>
                ) : (
                  filteredWhOptions.map(wh => {
                    const isChecked = selectedWhs.includes(wh.id);
                    const whErrCount = hasGenerated ? whMismatchCounts[wh.id] || 0 : 0;
                    return (
                      <label
                        key={wh.id}
                        className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer text-xs font-bold transition-colors ${
                          isChecked
                            ? 'bg-emerald-100/80 border-emerald-300 text-emerald-950'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleWhToggle(wh.id)}
                          className="w-3.5 h-3.5 accent-emerald-600 rounded"
                        />
                        <span className="font-mono text-[10px] text-slate-500">[{wh.code}]</span>
                        <span>{wh.name}</span>
                        {hasGenerated && isChecked && whErrCount > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[9px] font-black">
                            {whErrCount}
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* RIGHT: Product Selection (With Product Type Buttons: All LPG / All NFI) */}
            <div className="flex flex-col border border-slate-200 rounded-xl bg-slate-50/70 overflow-hidden">
              <div className="p-3 bg-white border-b border-slate-200 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                      Select Products (Rows)
                    </label>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                      {selectedProducts.length} / {allProducts.length}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedProducts(allProducts.map(p => p.id))}
                      className="px-2 py-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedProducts([])}
                      className="px-2 py-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-md hover:bg-rose-100 transition-colors"
                    >
                      Clear All
                    </button>

                    {productTypes.map(typeName => {
                      const typeCount = allProducts.filter(
                        p => p.product_type.toLowerCase() === typeName.toLowerCase()
                      ).length;
                      const isActive = isExactTypeSelected(typeName);
                      const isLpg = typeName.toUpperCase() === 'LPG';

                      return (
                        <button
                          key={typeName}
                          type="button"
                          onClick={() => handleSelectByProductType(typeName)}
                          className={`px-2 py-1 text-[10px] font-black rounded-md border transition-colors ${
                            isActive
                              ? isLpg
                                ? 'bg-orange-600 text-white border-orange-600 shadow-2xs'
                                : 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                              : isLpg
                              ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          All {typeName} ({typeCount})
                        </button>
                      );
                    })}
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Search product name, code, or type..."
                  value={prodSearch}
                  onChange={e => setProdSearch(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div className="flex flex-wrap gap-1.5 content-start h-44 overflow-y-auto custom-scrollbar p-2.5">
                {allProducts.length === 0 ? (
                  <span className="text-xs text-slate-400 p-1 font-bold">Loading Products...</span>
                ) : filteredProdOptions.length === 0 ? (
                  <span className="text-xs text-slate-400 p-1 font-bold">No matching products.</span>
                ) : (
                  filteredProdOptions.map(prod => {
                    const isChecked = selectedProducts.includes(prod.id);
                    const isLpg = prod.product_type.toUpperCase() === 'LPG';
                    return (
                      <label
                        key={prod.id}
                        className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer text-xs font-bold transition-colors ${
                          isChecked
                            ? 'bg-indigo-100/80 border-indigo-300 text-indigo-950'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleProductToggle(prod.id)}
                          className="w-3.5 h-3.5 accent-indigo-600 rounded"
                        />
                        {prod.product_type && (
                          <span
                            className={`text-[8px] font-black px-1 py-0.5 rounded uppercase ${
                              isLpg ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {prod.product_type}
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-slate-500">[{prod.code}]</span>
                        <span>{prod.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        </div>

        {/* 2. COMPACT RECONCILIATION SUMMARY BAR */}
        {hasGenerated && (
          <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 px-4 md:px-5 py-3 rounded-2xl border border-slate-800 shadow-md text-white">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="text-xs font-black text-indigo-300 uppercase tracking-wider whitespace-nowrap">
                  As of {formatDisplayDate(targetDate)}
                </span>
                {!cuboidHasData ? (
                  <span className="text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                    No CUBOID Data Found
                  </span>
                ) : mismatches.length === 0 ? (
                  <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                    ✓ 100% Matched with CUBOID
                  </span>
                ) : (
                  <span className="text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-400/30 px-2.5 py-0.5 rounded-full whitespace-nowrap animate-pulse">
                    ⚠ {mismatches.length} Mismatch / Missing Found
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end gap-2 sm:gap-x-5 sm:gap-y-2">
                <div className="flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Products</span>
                  <span className="text-base font-black text-white">{reportData.length}</span>
                </div>

                <div className="hidden sm:block h-4 w-px bg-slate-700/80" />

                <div className="flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                  <span className="text-[10px] text-indigo-300 font-bold uppercase">Our Total</span>
                  <span className="text-base font-black text-indigo-300">{grandOurTotal.toLocaleString()}</span>
                </div>

                <div className="hidden sm:block h-4 w-px bg-slate-700/80" />

                <div className="flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase">CUBOID Total</span>
                  <span className="text-base font-black text-emerald-400">{grandCuboidTotal.toLocaleString()}</span>
                </div>

                <div className="hidden sm:block h-4 w-px bg-slate-700/80" />

                <div className="flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                  <span className="text-[10px] text-slate-300 font-bold uppercase">Net Diff</span>
                  <span
                    className={`text-base font-black ${
                      grandDiff === 0 ? 'text-emerald-400' : grandDiff > 0 ? 'text-amber-400' : 'text-rose-400'
                    }`}
                  >
                    {grandDiff > 0 ? `+${grandDiff.toLocaleString()}` : grandDiff.toLocaleString()}
                  </span>
                </div>

                <div className="hidden sm:block h-4 w-px bg-slate-700/80" />

                <div className="col-span-2 sm:col-span-1 flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                  <span className="text-[10px] text-rose-400 font-bold uppercase">Issues</span>
                  <span className={`text-base font-black ${mismatches.length === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {mismatches.length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. MATRIX REPORT PREVIEW (With Per-Warehouse CUBOID Comparison Column) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[420px]">
          <div className="p-3.5 md:p-4 border-b border-slate-200 bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-xs md:text-sm uppercase tracking-wide flex items-center">
                <span className="mr-2 text-base">📊</span> Stock Matrix Preview
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Preview compares Our WH vs CUBOID per warehouse — Excel &amp; PDF export Our WH Stock only
              </p>
            </div>

            {hasGenerated && (
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="text"
                  placeholder="Filter Product Name or Code..."
                  value={tableSearch}
                  onChange={e => setTableSearch(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 w-full sm:w-52"
                />

                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showCuboidCompare}
                    onChange={e => setShowCuboidCompare(e.target.checked)}
                    className="accent-emerald-600 rounded cursor-pointer"
                  />
                  Show CUBOID Cols
                </label>

                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-200 rounded-xl text-xs font-bold text-rose-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyMismatchedRows}
                    onChange={e => setOnlyMismatchedRows(e.target.checked)}
                    className="accent-rose-600 rounded cursor-pointer"
                  />
                  Mismatches Only
                </label>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar bg-white relative max-h-[560px]">
            {isLoading ? (
              <div className="p-16 flex flex-col items-center justify-center">
                <Icons.Spinner />
                <span className="mt-2 text-xs font-bold text-slate-500">
                  Calculating our stock &amp; comparing with CUBOID...
                </span>
              </div>
            ) : !hasGenerated ? (
              <div className="p-16 flex flex-col items-center justify-center text-slate-400 text-center">
                <span className="text-5xl mb-3 opacity-60">📦</span>
                <p className="font-bold text-slate-700 text-sm">Select date, warehouses &amp; products, then click Generate &amp; Compare</p>
                <p className="text-xs text-slate-400 mt-1">
                  Only selected products will be exported and checked against CUBOID
                </p>
              </div>
            ) : filteredReportRows.length === 0 ? (
              <div className="p-12 text-center text-sm font-bold text-slate-500">
                No products match your current filter.
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-max">
                <thead className="sticky top-0 z-20 bg-white shadow-xs">
                  <tr>
                    <th
                      rowSpan={showCuboidCompare ? 2 : 1}
                      className="p-2.5 bg-slate-100 border border-slate-300 text-[10px] font-black text-slate-700 text-center w-12 uppercase sticky left-0 z-30"
                    >
                      SL
                    </th>
                    <th
                      rowSpan={showCuboidCompare ? 2 : 1}
                      className="p-2.5 bg-slate-100 border border-slate-300 text-[10px] font-black text-slate-700 text-center w-24 uppercase sticky left-12 z-30"
                    >
                      Code
                    </th>
                    <th
                      rowSpan={showCuboidCompare ? 2 : 1}
                      className="p-2.5 bg-slate-100 border border-slate-300 text-[10px] font-black text-slate-700 w-56 uppercase sticky left-[144px] z-30"
                    >
                      Goods Name
                    </th>
                    <th
                      rowSpan={showCuboidCompare ? 2 : 1}
                      className="p-2.5 bg-slate-100 border border-slate-300 text-[10px] font-black text-slate-700 text-center w-14 uppercase"
                    >
                      Unit
                    </th>

                    {reportWhs.map(wh => {
                      const errCount = whMismatchCounts[wh.id] || 0;
                      return (
                        <th
                          key={wh.id}
                          colSpan={showCuboidCompare ? 2 : 1}
                          className={`p-2 border border-slate-300 text-[10px] font-black text-center leading-tight ${
                            errCount > 0 ? 'bg-rose-50 text-rose-900' : 'bg-indigo-50 text-indigo-950'
                          }`}
                        >
                          <div className="max-w-[160px] mx-auto break-words">
                            [{wh.code}] {wh.name}
                          </div>
                          {errCount > 0 && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-black">
                              {errCount} Issue{errCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </th>
                      );
                    })}

                    <th
                      colSpan={showCuboidCompare ? 2 : 1}
                      className="p-2 bg-slate-800 border border-slate-700 text-[10px] font-black text-white text-center uppercase"
                    >
                      TOTAL
                    </th>
                  </tr>

                  {showCuboidCompare && (
                    <tr>
                      {reportWhs.map(wh => (
                        <React.Fragment key={`sub-${wh.id}`}>
                          <th className="py-1.5 px-2 bg-indigo-100/70 border border-slate-300 text-[9px] font-black text-indigo-900 text-center uppercase w-20">
                            Our WH
                          </th>
                          <th className="py-1.5 px-2 bg-emerald-100/70 border border-slate-300 text-[9px] font-black text-emerald-900 text-center uppercase w-20">
                            CUBOID
                          </th>
                        </React.Fragment>
                      ))}
                      <th className="py-1.5 px-2 bg-slate-700 border border-slate-600 text-[9px] font-black text-indigo-200 text-center uppercase w-20">
                        Our WH
                      </th>
                      <th className="py-1.5 px-2 bg-slate-700 border border-slate-600 text-[9px] font-black text-emerald-300 text-center uppercase w-20">
                        CUBOID
                      </th>
                    </tr>
                  )}
                </thead>

                <tbody>
                  {filteredReportRows.map((row, idx) => (
                    <tr
                      key={row.product_id}
                      className={`${
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                      } hover:bg-indigo-50/30 transition-colors`}
                    >
                      <td className="p-2.5 border border-slate-200 text-xs font-bold text-slate-500 text-center sticky left-0 bg-inherit z-10">
                        {row.sl}
                      </td>
                      <td className="p-2.5 border border-slate-200 text-center sticky left-12 bg-inherit z-10">
                        <span className="text-[11px] font-mono font-bold text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                          {row.product_code}
                        </span>
                      </td>
                      <td className="p-2.5 border border-slate-200 sticky left-[144px] bg-inherit z-10 max-w-[240px]">
                        <p className="font-bold text-slate-900 text-xs leading-snug break-words">{row.product_name}</p>
                      </td>
                      <td className="p-2.5 border border-slate-200 text-[11px] font-bold text-slate-600 text-center">
                        {row.unit}
                      </td>

                      {reportWhs.map(wh => {
                        const cell = row.wh_values[wh.id] || {
                          our_qty: 0,
                          cuboid_qty: 0,
                          has_cuboid: false,
                          diff: 0,
                          status: 'MATCHED'
                        };
                        const isDiff = cell.diff !== 0;

                        return (
                          <React.Fragment key={`val-${row.product_id}-${wh.id}`}>
                            <td
                              className={`p-2 border border-slate-200 text-right font-bold text-xs whitespace-nowrap ${
                                isDiff
                                  ? 'bg-rose-50/70 text-rose-700'
                                  : cell.our_qty === 0
                                  ? 'text-slate-400'
                                  : 'text-indigo-700'
                              }`}
                            >
                              {cell.our_qty.toLocaleString()}
                            </td>

                            {showCuboidCompare && (
                              <td
                                className={`p-2 border border-slate-200 text-right font-bold text-xs whitespace-nowrap ${
                                  isDiff
                                    ? 'bg-amber-50/80 text-amber-900'
                                    : cell.cuboid_qty === 0
                                    ? 'text-slate-400 bg-emerald-50/15'
                                    : 'text-emerald-700 bg-emerald-50/25'
                                }`}
                                title={
                                  isDiff
                                    ? `Our WH: ${cell.our_qty} vs CUBOID: ${cell.cuboid_qty} (Diff: ${cell.diff > 0 ? `+${cell.diff}` : cell.diff})`
                                    : 'Matched'
                                }
                              >
                                <div className="flex flex-col items-end">
                                  <span>{cell.has_cuboid ? cell.cuboid_qty.toLocaleString() : '0'}</span>
                                  {isDiff && (
                                    <span
                                      className={`text-[9px] font-black px-1 rounded mt-0.5 ${
                                        cell.diff > 0 ? 'bg-amber-200/80 text-amber-900' : 'bg-rose-200/80 text-rose-900'
                                      }`}
                                    >
                                      {cell.diff > 0 ? `+${cell.diff}` : cell.diff}
                                    </span>
                                  )}
                                </div>
                              </td>
                            )}
                          </React.Fragment>
                        );
                      })}

                      <td className="p-2.5 border border-slate-200 text-xs font-black text-indigo-900 text-right bg-slate-100 whitespace-nowrap">
                        {Number(row.Total).toLocaleString()}
                      </td>
                      {showCuboidCompare && (
                        <td
                          className={`p-2.5 border border-slate-200 text-xs font-black text-right whitespace-nowrap ${
                            row.TotalDiff !== 0 ? 'bg-rose-100/70 text-rose-800' : 'bg-emerald-50/60 text-emerald-800'
                          }`}
                        >
                          {Number(row.CuboidTotal).toLocaleString()}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 4. BOTTOM NOTIFICATION SECTION: SELECTED PRODUCTS MISMATCHES ONLY */}
        {hasGenerated && (
          <div
            className={`rounded-2xl border shadow-sm overflow-hidden ${
              !cuboidHasData
                ? 'bg-amber-50 border-amber-200'
                : mismatches.length === 0
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-white border-rose-200'
            }`}
          >
            {!cuboidHasData ? (
              <div className="p-4 md:p-5 flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h4 className="font-black text-amber-900 text-sm">
                    No CUBOID Stock Found for {formatDisplayDate(targetDate)}
                  </h4>
                  <p className="text-xs text-amber-800 mt-1">
                    Our Warehouse Stock was calculated accurately from transactions, but no CUBOID portal snapshot exists for this date. You can pick one of the recent CUBOID dates above or still export Our Warehouse Stock.
                  </p>
                </div>
              </div>
            ) : mismatches.length === 0 ? (
              <div className="p-4 md:p-5 flex items-center gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <h4 className="font-black text-emerald-900 text-sm">
                    Reconciliation Passed — 0 Mismatches Found ({formatDisplayDate(targetDate)})
                  </h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    All {reportData.length} selected product(s) across {reportWhs.length} selected warehouse(s) match CUBOID stock. Ready for export!
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className="p-4 bg-rose-50 border-b border-rose-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">🚨</span>
                    <div>
                      <h4 className="font-black text-rose-950 text-xs md:text-sm uppercase tracking-wide">
                        CUBOID Verification Alerts — {mismatches.length} Mismatch / Missing Item(s)
                      </h4>
                      <p className="text-[11px] text-rose-700 font-semibold mt-0.5">
                        Checking selected products only — unselected products are ignored
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={mismatchWhFilter}
                      onChange={e => setMismatchWhFilter(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-rose-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-rose-500 cursor-pointer"
                    >
                      <option value="ALL">All Warehouses ({mismatches.length})</option>
                      {reportWhs
                        .filter(w => (whMismatchCounts[w.id] || 0) > 0)
                        .map(w => (
                          <option key={w.id} value={w.id}>
                            [{w.code}] {w.name} ({whMismatchCounts[w.id]})
                          </option>
                        ))}
                    </select>

                    <select
                      value={mismatchTypeFilter}
                      onChange={e => setMismatchTypeFilter(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-rose-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-rose-500 cursor-pointer"
                    >
                      <option value="ALL">All Issue Types</option>
                      <option value="MISMATCH">Qty Mismatch ({qtyMismatchCount})</option>
                      <option value="MISSING_IN_CUBOID">Missing in CUBOID ({missingCuboidCount})</option>
                      <option value="MISSING_IN_OUR_WH">Missing in Our WH ({missingOurWhCount})</option>
                    </select>

                    <button
                      onClick={handleCopyMismatchLog}
                      className="px-3 py-1.5 bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg text-xs font-bold transition-colors shadow-2xs"
                    >
                      📋 Copy Log
                    </button>
                  </div>
                </div>

                {/* One-by-one Mismatch Lines */}
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto custom-scrollbar">
                  {filteredMismatches.map((m, idx) => (
                    <div
                      key={m.id}
                      className={`px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-rose-50/25'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-1.5 leading-relaxed">
                        <span className="font-black text-slate-400 w-6">{idx + 1}.</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-bold text-slate-800">
                          [{m.wh_code}] {m.wh_name}
                        </span>
                        <span className="text-slate-400 font-bold">→</span>
                        <span className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                          {m.product_code}
                        </span>
                        <span className="font-bold text-slate-900">{m.product_name}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0 pl-7 md:pl-0">
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 font-bold border border-indigo-100">
                          Our WH: {m.our_qty.toLocaleString()} {m.unit}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold border border-emerald-100">
                          CUBOID: {m.cuboid_qty.toLocaleString()} {m.unit}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-black border ${
                            m.diff > 0
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          Diff: {m.diff > 0 ? `+${m.diff.toLocaleString()}` : m.diff.toLocaleString()}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                            m.issue_type === 'MISMATCH'
                              ? 'bg-rose-100 text-rose-800 border-rose-200'
                              : m.issue_type === 'MISSING_IN_CUBOID'
                              ? 'bg-amber-100 text-amber-800 border-amber-200'
                              : 'bg-purple-100 text-purple-800 border-purple-200'
                          }`}
                        >
                          {getIssueLabel(m.issue_type)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}