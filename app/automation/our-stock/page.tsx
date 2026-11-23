"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './../../components/Icons';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const normalizeCode = (code: any) => String(code || '').trim().toLowerCase();

// Extract YYYY-MM-DD directly without timezone shifting
const extractYYYYMMDD = (dateString: string): string => {
  if (!dateString) return '';
  const match = String(dateString).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : String(dateString).substring(0, 10);
};

// Get previous calendar day (YYYY-MM-DD) safely in UTC
const getPreviousDateStr = (dateStr: string): string => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const py = dt.getUTCFullYear();
  const pm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(dt.getUTCDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
};

// Format YYYY-MM-DD as DD.MM.YYYY
const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const clean = extractYYYYMMDD(dateStr);
  const [y, m, d] = clean.split('-');
  return y && m && d ? `${d}.${m}.${y}` : clean;
};

interface WarehouseOption {
  id: string;
  code: string;
  name: string;
}

interface ProductDict {
  [id: string]: any;
}

interface WarehouseDict {
  [id: string]: WarehouseOption;
}

interface BoolDict {
  [key: string]: boolean;
}

export default function OurWarehouseStockPage() {
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [productsById, setProductsById] = useState<ProductDict>({});
  const [recentDates, setRecentDates] = useState<string[]>([]);

  // Main Filters (Date Range)
  const [selectedWh, setSelectedWh] = useState('ALL_SUM');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Product / Table Filters
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  const [filterProductName, setFilterProductName] = useState('');
  const [filterProductCode, setFilterProductCode] = useState('');
  const [filterDiffMode, setFilterDiffMode] = useState('ALL');
  const [showZeroRows, setShowZeroRows] = useState(false);

  // Raw & Processed Data States
  const [rawInventoryRows, setRawInventoryRows] = useState<any[]>([]);
  const [rawTxnRows, setRawTxnRows] = useState<any[]>([]);
  const [displayData, setDisplayData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const [summary, setSummary] = useState({
    totalRows: 0,
    uniqueProducts: 0,
    warehouseCount: 0,
    openingSourceDate: '',
    closingSourceDate: ''
  });

  // Deduplicate product names using a plain object
  const uniqueProductNameDict: BoolDict = {};
  displayData.forEach(item => {
    if (item.product_name) uniqueProductNameDict[item.product_name] = true;
  });
  const uniqueProductNames = Object.keys(uniqueProductNameDict).sort();

  const getDefaultMonthDates = () => {
    const today = new Date();
    const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
    const todayStr = localToday.toISOString().split('T')[0];
    const firstDayStr = `${todayStr.substring(0, 7)}-01`;
    return { firstDayStr, todayStr };
  };

  useEffect(() => {
    const { firstDayStr, todayStr } = getDefaultMonthDates();
    setFromDate(firstDayStr);
    setToDate(todayStr);
    fetchInitialMetadata(firstDayStr, todayStr);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4500);
  };

  // Batch fetch inventory_transactions to bypass Supabase 1,000-row cap
  const fetchAllTransactionsUpToDate = async (whIds: string[], endDate: string) => {
    if (whIds.length === 0 || !endDate) return [];
    const allRows: any[] = [];
    const batchSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('warehouse_id, product_id, transaction_type, quantity, created_at')
        .in('warehouse_id', whIds)
        .lte('created_at', `${endDate}T23:59:59.999Z`)
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

  // Batch fetch inventory records
  const fetchAllInventory = async (whIds: string[]) => {
    if (whIds.length === 0) return [];
    const allRows: any[] = [];
    const batchSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('inventory')
        .select('warehouse_id, product_id, quantity')
        .in('warehouse_id', whIds)
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

  const fetchInitialMetadata = async (defaultFrom: string, defaultTo: string) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const sessionStr = localStorage.getItem('user_session');
      const sessionUser = sessionStr ? JSON.parse(sessionStr) : null;

      let profile: any = null;
      if (user?.id) {
        const { data } = await supabase
          .from('profiles')
          .select('role, assigned_wh_ids, user_roles(role_name)')
          .eq('id', user.id)
          .single();
        profile = data;
      }

      const roleData: any = profile?.user_roles;
      const roleName = String(
        roleData?.role_name ||
          profile?.role ||
          sessionUser?.user_roles?.role_name ||
          sessionUser?.role ||
          ''
      ).toUpperCase();
      const isSuperAdmin =
        roleName.includes('SUPER ADMIN') || roleName === 'ADMIN' || roleName.includes('WEB ADMIN');

      let rawIds = sessionUser?.assigned_wh_ids ?? profile?.assigned_wh_ids;
      if (!rawIds && user?.id) {
        const { data: uData } = await supabase.from('users').select('assigned_wh_ids').eq('id', user.id).single();
        if (uData?.assigned_wh_ids) rawIds = uData.assigned_wh_ids;
      }
      if (!rawIds && user?.user_metadata?.assigned_wh_ids) {
        rawIds = user.user_metadata.assigned_wh_ids;
      }

      let assignedIds: string[] = [];
      if (typeof rawIds === 'string') {
        try {
          assignedIds = JSON.parse(rawIds);
        } catch {
          assignedIds = rawIds.split(',');
        }
      } else if (Array.isArray(rawIds)) {
        assignedIds = rawIds;
      } else if (rawIds && typeof rawIds === 'object') {
        assignedIds = Object.values(rawIds);
      }
      assignedIds = assignedIds.map(id => String(id).trim()).filter(Boolean);

      const [whRes, prodRes] = await Promise.all([
        supabase.from('warehouses').select('id, name, code').order('name'),
        supabase.from('products').select('id, name, code, unit_type, product_type, status')
      ]);

      const allWhs: WarehouseOption[] = (whRes.data || []).map((w: any) => ({
        id: String(w.id),
        code: String(w.code || '').trim(),
        name: String(w.name || '').trim()
      }));

      const myWhs = isSuperAdmin
        ? allWhs
        : allWhs.filter(w => assignedIds.includes(String(w.id).trim()));

      const pDict: ProductDict = {};
      (prodRes.data || []).forEach((p: any) => {
        pDict[String(p.id)] = p;
      });

      setWarehouses(myWhs);
      setProductsById(pDict);

      const myWhIds = myWhs.map(w => w.id);
      if (myWhIds.length > 0) {
        const { data: recentTxnDates } = await supabase
          .from('inventory_transactions')
          .select('created_at')
          .in('warehouse_id', myWhIds)
          .order('created_at', { ascending: false })
          .limit(500);

        const dateDict: BoolDict = {};
        (recentTxnDates || []).forEach((r: any) => {
          const d = extractYYYYMMDD(r.created_at);
          if (d) dateDict[d] = true;
        });
        const sortedDates = Object.keys(dateDict).sort((a, b) => b.localeCompare(a)).slice(0, 7);
        setRecentDates(sortedDates);

        await loadOurStockRange(defaultFrom, defaultTo, 'ALL_SUM', myWhs, pDict, false);
      } else {
        setDisplayData([]);
        showMessage("No warehouses assigned to your account.", "error");
      }
    } catch (err: any) {
      console.error("Error loading initial warehouse stock metadata:", err);
      showMessage(`Failed to load data: ${err.message || 'Unknown error'}`, "error");
    }
    setIsLoading(false);
  };

  // Compute Opening (created_at < fromDate) and Closing (created_at <= toDate)
  const processViewData = (
    invRows: any[],
    txnRows: any[],
    whSelection: string,
    whOptions: WarehouseOption[],
    pDict: ProductDict,
    targetFrom: string,
    targetTo: string,
    includeZeroRows: boolean
  ) => {
    const whLookup: WarehouseDict = {};
    whOptions.forEach(w => {
      whLookup[String(w.id)] = w;
    });

    const isSum = whSelection === 'ALL_SUM';
    const isSep = whSelection === 'ALL_SEP';

    const scopedInv = (isSum || isSep)
      ? invRows
      : invRows.filter(r => String(r.warehouse_id) === String(whSelection));

    const scopedTxns = (isSum || isSep)
      ? txnRows
      : txnRows.filter(r => String(r.warehouse_id) === String(whSelection));

    const processed: any[] = [];
    const activeWhDict: BoolDict = {};

    if (isSum) {
      const sumDict: ProductDict = {};

      const ensureProduct = (productId: string, whId?: string) => {
        const prod = pDict[String(productId)];
        if (!prod) return null;

        const key = String(prod.id);
        const whObj = whId ? whLookup[String(whId)] : undefined;

        if (!sumDict[key]) {
          const whCodesDict: BoolDict = {};
          if (whObj?.code) whCodesDict[whObj.code] = true;

          sumDict[key] = {
            key,
            warehouse_code: 'Multiple',
            warehouse_name: 'All Warehouses (Sum)',
            warehouse_codes_dict: whCodesDict,
            product_code: String(prod.code || '').trim(),
            product_name: String(prod.name || '').trim(),
            unit_type: prod.unit_type || '',
            opening_qty: 0,
            closing_qty: 0
          };
        } else if (whObj?.code) {
          sumDict[key].warehouse_codes_dict[whObj.code] = true;
        }
        return sumDict[key];
      };

      scopedInv.forEach(inv => {
        ensureProduct(inv.product_id, inv.warehouse_id);
      });

      scopedTxns.forEach(t => {
        const rec = ensureProduct(t.product_id, t.warehouse_id);
        if (!rec) return;

        const txnDateStr = extractYYYYMMDD(t.created_at);
        const qty = Number(t.quantity) || 0;
        let delta = 0;

        if (t.transaction_type === 'IN' || t.transaction_type === 'RECEIVE') delta = qty;
        else if (t.transaction_type === 'OUT' || t.transaction_type === 'DAMAGE') delta = -qty;

        if (delta === 0) return;

        if (txnDateStr < targetFrom) {
          rec.opening_qty += delta;
        }
        if (txnDateStr <= targetTo) {
          rec.closing_qty += delta;
        }
      });

      Object.values(sumDict).forEach((item: any) => {
        if (!includeZeroRows && item.opening_qty === 0 && item.closing_qty === 0) return;
        const whCodesArr = Object.keys(item.warehouse_codes_dict).sort();
        whCodesArr.forEach(c => {
          activeWhDict[c] = true;
        });

        processed.push({
          ...item,
          warehouse_code: whCodesArr.length > 0 ? `${whCodesArr.length} WH(s)` : 'Multiple',
          wh_list_text: whCodesArr.join(', '),
          difference: item.closing_qty - item.opening_qty
        });
      });
    } else {
      const sepDict: ProductDict = {};

      const ensureWhProduct = (whId: string, productId: string) => {
        const whObj = whLookup[String(whId)];
        const prod = pDict[String(productId)];
        if (!whObj || !prod) return null;

        const key = `${whObj.id}__${prod.id}`;
        if (!sepDict[key]) {
          sepDict[key] = {
            key,
            warehouse_id: whObj.id,
            warehouse_code: whObj.code || 'N/A',
            warehouse_name: whObj.name || 'Unknown Warehouse',
            product_code: String(prod.code || '').trim(),
            product_name: String(prod.name || '').trim(),
            unit_type: prod.unit_type || '',
            opening_qty: 0,
            closing_qty: 0
          };
        }
        return sepDict[key];
      };

      scopedInv.forEach(inv => {
        ensureWhProduct(inv.warehouse_id, inv.product_id);
      });

      scopedTxns.forEach(t => {
        const rec = ensureWhProduct(t.warehouse_id, t.product_id);
        if (!rec) return;

        const txnDateStr = extractYYYYMMDD(t.created_at);
        const qty = Number(t.quantity) || 0;
        let delta = 0;

        if (t.transaction_type === 'IN' || t.transaction_type === 'RECEIVE') delta = qty;
        else if (t.transaction_type === 'OUT' || t.transaction_type === 'DAMAGE') delta = -qty;

        if (delta === 0) return;

        if (txnDateStr < targetFrom) {
          rec.opening_qty += delta;
        }
        if (txnDateStr <= targetTo) {
          rec.closing_qty += delta;
        }
      });

      Object.values(sepDict).forEach((item: any) => {
        if (!includeZeroRows && item.opening_qty === 0 && item.closing_qty === 0) return;
        activeWhDict[item.warehouse_code] = true;
        processed.push({
          ...item,
          difference: item.closing_qty - item.opening_qty
        });
      });
    }

    processed.sort((a, b) => {
      const codeCmp = String(a.product_code || '').localeCompare(String(b.product_code || ''), undefined, { numeric: true });
      if (codeCmp !== 0) return codeCmp;
      return String(a.warehouse_code || '').localeCompare(String(b.warehouse_code || ''), undefined, { numeric: true });
    });

    const uniqueProdDict: BoolDict = {};
    processed.forEach(i => {
      const k = normalizeCode(i.product_code);
      if (k) uniqueProdDict[k] = true;
    });

    setDisplayData(processed);
    setSelectedProducts([]);
    setSummary({
      totalRows: processed.length,
      uniqueProducts: Object.keys(uniqueProdDict).length,
      warehouseCount: Object.keys(activeWhDict).length,
      openingSourceDate: getPreviousDateStr(targetFrom),
      closingSourceDate: targetTo
    });
  };

  const loadOurStockRange = async (
    targetFrom: string,
    targetTo: string,
    targetWh: string,
    currentWhList = warehouses,
    currentProdDict = productsById,
    includeZero = showZeroRows
  ) => {
    if (!targetFrom || !targetTo) {
      showMessage("Please select both From Date and To Date.", "error");
      return;
    }
    if (targetFrom > targetTo) {
      showMessage("From Date cannot be later than To Date.", "error");
      return;
    }

    const whIds = currentWhList.map(w => w.id);
    if (whIds.length === 0) {
      setDisplayData([]);
      return;
    }

    setIsLoading(true);
    try {
      const [invRows, txnRows] = await Promise.all([
        fetchAllInventory(whIds),
        fetchAllTransactionsUpToDate(whIds, targetTo)
      ]);

      setRawInventoryRows(invRows);
      setRawTxnRows(txnRows);

      processViewData(
        invRows,
        txnRows,
        targetWh,
        currentWhList,
        currentProdDict,
        targetFrom,
        targetTo,
        includeZero
      );

      if (txnRows.length === 0 && invRows.length === 0) {
        showMessage(`No warehouse transactions found up to ${formatDisplayDate(targetTo)}.`, "error");
      }
    } catch (err: any) {
      console.error("Error calculating our warehouse stock:", err);
      showMessage(`Error loading stock: ${err.message || 'Unknown error'}`, "error");
    }
    setIsLoading(false);
  };

  const handleApplyFilters = () => {
    loadOurStockRange(fromDate, toDate, selectedWh);
  };

  const handleQuickSingleDayClick = (dateStr: string) => {
    setFromDate(dateStr);
    setToDate(dateStr);
    loadOurStockRange(dateStr, dateStr, selectedWh);
  };

  const handleThisMonthClick = () => {
    const { firstDayStr, todayStr } = getDefaultMonthDates();
    setFromDate(firstDayStr);
    setToDate(todayStr);
    loadOurStockRange(firstDayStr, todayStr, selectedWh);
  };

  const handleToggleZeroRows = (checked: boolean) => {
    setShowZeroRows(checked);
    processViewData(
      rawInventoryRows,
      rawTxnRows,
      selectedWh,
      warehouses,
      productsById,
      fromDate,
      toDate,
      checked
    );
  };

  const handleProductSelect = (productName: string) => {
    if (selectedProducts.includes(productName)) {
      setSelectedProducts(selectedProducts.filter(p => p !== productName));
    } else {
      setSelectedProducts([...selectedProducts, productName]);
    }
  };

  const handleSelectAllProducts = () => {
    if (selectedProducts.length === uniqueProductNames.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts([...uniqueProductNames]);
    }
  };

  const clearTableFilters = () => {
    setSelectedProducts([]);
    setFilterProductName('');
    setFilterProductCode('');
    setFilterDiffMode('ALL');
  };

  const hasActiveTableFilters =
    selectedProducts.length > 0 ||
    filterProductName.trim() !== '' ||
    filterProductCode.trim() !== '' ||
    filterDiffMode !== 'ALL';

  // Client-side Filtering
  const filteredData = displayData.filter(item => {
    const matchSelectedProducts =
      selectedProducts.length === 0 || selectedProducts.includes(item.product_name);

    const nameQuery = filterProductName.trim().toLowerCase();
    const matchNameSearch =
      !nameQuery ||
      String(item.product_name || '').toLowerCase().includes(nameQuery) ||
      String(item.warehouse_name || '').toLowerCase().includes(nameQuery);

    const codeQueries = filterProductCode
      .toLowerCase()
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const matchCode =
      codeQueries.length === 0 ||
      codeQueries.some(q => String(item.product_code || '').toLowerCase().includes(q));

    let matchDiff = true;
    if (filterDiffMode === 'CHANGED') matchDiff = item.difference !== 0;
    else if (filterDiffMode === 'INCREASED') matchDiff = item.difference > 0;
    else if (filterDiffMode === 'DECREASED') matchDiff = item.difference < 0;
    else if (filterDiffMode === 'UNCHANGED') matchDiff = item.difference === 0;

    return matchSelectedProducts && matchNameSearch && matchCode && matchDiff;
  });

  const filteredTotalOpening = filteredData.reduce((acc, item) => acc + (Number(item.opening_qty) || 0), 0);
  const filteredTotalClosing = filteredData.reduce((acc, item) => acc + (Number(item.closing_qty) || 0), 0);
  const filteredTotalDiff = filteredTotalClosing - filteredTotalOpening;

  const isSingleDay = fromDate === toDate;
  const stockDateRangeLabel = isSingleDay
    ? formatDisplayDate(toDate)
    : `${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)}`;
  const openingDateLabel = formatDisplayDate(fromDate);
  const openingPrevLabel = formatDisplayDate(summary.openingSourceDate || getPreviousDateStr(fromDate));
  const closingDateLabel = formatDisplayDate(toDate);

  // Interactive Excel Export (Row 1 Header, Stock Date after SL, AutoFilter, SUBTOTAL)
  const handleExportExcel = async () => {
    if (filteredData.length === 0) return;
    setIsExportingExcel(true);

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'NGO Distribution System';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('Our Warehouse Stock', {
        views: [{ state: 'frozen', ySplit: 1 }],
        pageSetup: {
          paperSize: 9,
          orientation: 'landscape',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0
        }
      });

      const thinBorder: any = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };

      const headerBorder: any = {
        top: { style: 'medium', color: { argb: 'FF1E1B4B' } },
        left: { style: 'thin', color: { argb: 'FF3730A3' } },
        bottom: { style: 'medium', color: { argb: 'FF1E1B4B' } },
        right: { style: 'thin', color: { argb: 'FF3730A3' } }
      };

      sheet.columns = [
        { key: 'sl', width: 7 },
        { key: 'stock_date', width: isSingleDay ? 14 : 24 },
        { key: 'wh_code', width: selectedWh === 'ALL_SUM' ? 22 : 13 },
        { key: 'wh_name', width: 34 },
        { key: 'product_code', width: 15 },
        { key: 'product_name', width: 38 },
        { key: 'opening_qty', width: 20 },
        { key: 'closing_qty', width: 22 },
        { key: 'difference', width: 16 }
      ];

      // Row 1: Table Header
      const headerRow = sheet.addRow([
        'SL',
        'Stock Date',
        'WH Code',
        'Warehouse Name',
        'Product Code',
        'Product Name',
        `Opening Balance (${openingDateLabel})`,
        `Our Stock / Closing (${closingDateLabel})`,
        'Difference'
      ]);
      headerRow.height = 32;

      headerRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        let headerBg = 'FF4F46E5';
        if (colNumber === 7) headerBg = 'FF0E7490';
        else if (colNumber === 8) headerBg = 'FF3730A3';
        else if (colNumber === 9) headerBg = 'FF1E293B';

        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBg } };
        cell.border = headerBorder;
        cell.alignment = {
          vertical: 'middle',
          horizontal: colNumber === 4 || colNumber === 6 ? 'left' : colNumber >= 7 ? 'right' : 'center',
          wrapText: true
        };
      });

      const firstDataRowIdx = 2;
      filteredData.forEach((item, idx) => {
        const currentRowNum = firstDataRowIdx + idx;
        const whCodeDisplay =
          selectedWh === 'ALL_SUM'
            ? (item.wh_list_text || item.warehouse_code)
            : item.warehouse_code;

        const openingVal = Number(item.opening_qty) || 0;
        const closingVal = Number(item.closing_qty) || 0;
        const diffVal = closingVal - openingVal;

        const dataRow = sheet.addRow([
          idx + 1,
          stockDateRangeLabel,
          String(whCodeDisplay || ''),
          String(item.warehouse_name || ''),
          String(item.product_code || ''),
          String(item.product_name || ''),
          openingVal,
          closingVal,
          { formula: `H${currentRowNum}-G${currentRowNum}`, result: diffVal }
        ]);

        const whLines = Math.ceil(String(item.warehouse_name || '').length / 30);
        const nameLines = Math.ceil(String(item.product_name || '').length / 34);
        const codeLines = Math.ceil(String(whCodeDisplay || '').length / (selectedWh === 'ALL_SUM' ? 18 : 11));
        const maxLines = Math.max(1, whLines, nameLines, codeLines);
        dataRow.height = Math.max(24, maxLines * 16 + 8);

        const isEven = idx % 2 === 0;
        const rowBgArgb = isEven ? 'FFFFFFFF' : 'FFEEF2FF';
        const openingBgArgb = isEven ? 'FFF8FAFC' : 'FFE2E8F0';
        const closingBgArgb = isEven ? 'FFEEF2FF' : 'FFE0E7FF';
        const diffBgArgb = diffVal > 0 ? 'FFECFDF5' : diffVal < 0 ? 'FFFFF1F2' : rowBgArgb;

        dataRow.eachCell((cell, colNumber) => {
          cell.border = thinBorder;
          let bg = rowBgArgb;
          if (colNumber === 7) bg = openingBgArgb;
          else if (colNumber === 8) bg = closingBgArgb;
          else if (colNumber === 9) bg = diffBgArgb;

          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };

          if (colNumber === 1) {
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF64748B' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          } else if (colNumber === 2) {
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          } else if (colNumber === 3 || colNumber === 5) {
            cell.font = { name: 'Consolas', size: 10, bold: true, color: { argb: 'FF334155' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          } else if (colNumber === 4) {
            cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
          } else if (colNumber === 6) {
            cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
          } else if (colNumber === 7) {
            cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF334155' } };
            cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
            cell.numFmt = '#,##0';
          } else if (colNumber === 8) {
            cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF3730A3' } };
            cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
            cell.numFmt = '#,##0';
          } else if (colNumber === 9) {
            const diffColor = diffVal > 0 ? 'FF059669' : diffVal < 0 ? 'FFE11D48' : 'FF64748B';
            cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: diffColor } };
            cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
            cell.numFmt = '+#,##0;-#,##0;0';
          }
        });
      });

      const lastDataRowIdx = firstDataRowIdx + filteredData.length - 1;

      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: lastDataRowIdx, column: 9 }
      };

      const totalRow = sheet.addRow([
        'TOTAL',
        '',
        '',
        '',
        '',
        '',
        { formula: `SUBTOTAL(9,G${firstDataRowIdx}:G${lastDataRowIdx})`, result: filteredTotalOpening },
        { formula: `SUBTOTAL(9,H${firstDataRowIdx}:H${lastDataRowIdx})`, result: filteredTotalClosing },
        { formula: `SUBTOTAL(9,I${firstDataRowIdx}:I${lastDataRowIdx})`, result: filteredTotalDiff }
      ]);
      const totalRowNum = totalRow.number;
      sheet.mergeCells(`A${totalRowNum}:F${totalRowNum}`);
      totalRow.height = 28;

      const totalLabelCell = sheet.getCell(`A${totalRowNum}`);
      totalLabelCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      totalLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      totalLabelCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
      totalLabelCell.border = headerBorder;

      const totalOpenCell = sheet.getCell(`G${totalRowNum}`);
      totalOpenCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFE2E8F0' } };
      totalOpenCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      totalOpenCell.alignment = { vertical: 'middle', horizontal: 'right' };
      totalOpenCell.numFmt = '#,##0';
      totalOpenCell.border = headerBorder;

      const totalCloseCell = sheet.getCell(`H${totalRowNum}`);
      totalCloseCell.font = { name: 'Calibri', size: 11.5, bold: true, color: { argb: 'FF818CF8' } };
      totalCloseCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      totalCloseCell.alignment = { vertical: 'middle', horizontal: 'right' };
      totalCloseCell.numFmt = '#,##0';
      totalCloseCell.border = headerBorder;

      const totalDiffCell = sheet.getCell(`I${totalRowNum}`);
      totalDiffCell.font = {
        name: 'Calibri',
        size: 11.5,
        bold: true,
        color: { argb: filteredTotalDiff >= 0 ? 'FF34D399' : 'FFFB7185' }
      };
      totalDiffCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      totalDiffCell.alignment = { vertical: 'middle', horizontal: 'right' };
      totalDiffCell.numFmt = '+#,##0;-#,##0;0';
      totalDiffCell.border = headerBorder;

      const whFileLabel =
        selectedWh === 'ALL_SUM' || selectedWh === 'ALL_SEP'
          ? selectedWh
          : (warehouses.find(w => w.id === selectedWh)?.code || 'WH');
      const fileDateSuffix = isSingleDay ? toDate : `${fromDate}_to_${toDate}`;

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }),
        `Our_Warehouse_Stock_${whFileLabel}_${fileDateSuffix}.xlsx`
      );
      showMessage("Excel report exported successfully!", "success");
    } catch (err: any) {
      console.error("Excel Export Error:", err);
      showMessage(`Failed to export Excel: ${err.message || 'Unknown error'}`, "error");
    } finally {
      setIsExportingExcel(false);
    }
  };

  // PDF Export (Landscape)
  const handleExportPDF = () => {
    if (filteredData.length === 0) return;

    const doc = new jsPDF('landscape');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(`Our Warehouse Stock & Difference Report (${stockDateRangeLabel})`, 14, 15);

    let whTitle = "All Warehouses (Sum)";
    if (selectedWh === 'ALL_SEP') whTitle = "All Warehouses (Separate)";
    else if (selectedWh !== 'ALL_SUM') {
      const found = warehouses.find(w => w.id === selectedWh);
      whTitle = found ? `[${found.code}] ${found.name}` : selectedWh;
    }

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Warehouse: ${whTitle}  |  Opening Base (Prev Closing): ${openingPrevLabel}  |  Closing: ${closingDateLabel}  |  Generated: ${new Date().toLocaleString()}`,
      14,
      21
    );

    const tableColumn = [
      "SL",
      "WH Code",
      "Warehouse Name",
      "Product Code",
      "Product Name",
      `Opening Balance\n(${openingDateLabel})`,
      `Our Stock / Closing\n(${closingDateLabel})`,
      "Difference"
    ];

    const tableRows = filteredData.map((item, idx) => {
      const diff = Number(item.difference) || 0;
      const diffText = diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString();
      return [
        idx + 1,
        selectedWh === 'ALL_SUM' ? (item.wh_list_text || item.warehouse_code) : item.warehouse_code,
        item.warehouse_name,
        item.product_code,
        item.product_name,
        Number(item.opening_qty).toLocaleString(),
        Number(item.closing_qty).toLocaleString(),
        diffText
      ];
    });

    const totalDiffText =
      filteredTotalDiff > 0 ? `+${filteredTotalDiff.toLocaleString()}` : filteredTotalDiff.toLocaleString();

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      foot: [[
        '',
        '',
        '',
        '',
        `TOTAL (${filteredData.length} Items)`,
        filteredTotalOpening.toLocaleString(),
        filteredTotalClosing.toLocaleString(),
        totalDiffText
      ]],
      startY: 26,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' },
      alternateRowStyles: { fillColor: [238, 242, 255] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { halign: 'center', cellWidth: 26 },
        2: { halign: 'left', cellWidth: 55 },
        3: { halign: 'center', cellWidth: 24 },
        4: { halign: 'left' },
        5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
        6: { halign: 'right', cellWidth: 32, fontStyle: 'bold', textColor: [55, 48, 163] },
        7: { halign: 'right', cellWidth: 26, fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 7) {
          const rawStr = String(data.cell.raw || '');
          if (rawStr.startsWith('+')) data.cell.styles.textColor = [5, 150, 105];
          else if (rawStr.startsWith('-')) data.cell.styles.textColor = [225, 29, 72];
          else data.cell.styles.textColor = [100, 116, 139];
        }
      }
    });

    const whFileLabel =
      selectedWh === 'ALL_SUM' || selectedWh === 'ALL_SEP'
        ? selectedWh
        : (warehouses.find(w => w.id === selectedWh)?.code || 'WH');
    const fileDateSuffix = isSingleDay ? toDate : `${fromDate}_to_${toDate}`;
    doc.save(`Our_Warehouse_Stock_${whFileLabel}_${fileDateSuffix}.pdf`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 w-full animate-in fade-in duration-500 relative">

      {/* Header */}
      <header className="flex flex-col sm:flex-row min-h-16 md:h-20 bg-white border-b border-slate-200 items-start sm:items-center px-4 md:px-6 pr-16 md:pr-20 py-3 md:py-0 shrink-0 shadow-sm justify-between sticky top-0 z-30 gap-3">
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
            <h2 className="text-lg md:text-2xl font-bold text-slate-900 leading-tight truncate">Our Warehouse Stock</h2>
            <p className="text-[11px] md:text-xs text-slate-500 hidden sm:block">
              Calculated from internal inventory &amp; transaction ledger across any date range
            </p>
          </div>
        </div>

        <div className="flex w-full sm:w-auto space-x-2 shrink-0">
          <button
            onClick={handleExportExcel}
            disabled={filteredData.length === 0 || isExportingExcel}
            className="flex-1 sm:flex-none justify-center px-3.5 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl hover:bg-indigo-100 transition-colors flex items-center shadow-sm disabled:opacity-50"
          >
            {isExportingExcel ? <Icons.Spinner /> : <Icons.Download />}
            <span className="ml-1.5">{isExportingExcel ? 'Exporting...' : 'Excel'}</span>
          </button>
          <button
            onClick={handleExportPDF}
            disabled={filteredData.length === 0}
            className="flex-1 sm:flex-none justify-center px-3.5 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl hover:bg-rose-100 transition-colors flex items-center shadow-sm disabled:opacity-50"
          >
            <Icons.Download /> <span className="ml-1.5">PDF</span>
          </button>
        </div>
      </header>

      <div className="flex-1 p-3 md:p-6 space-y-4 max-w-7xl w-full mx-auto">

        {/* Toast Message */}
        {msg.text && (
          <div className={`p-3.5 rounded-xl shadow-md border text-xs md:text-sm font-bold animate-in slide-in-from-top-2 flex justify-between items-center ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span className="flex items-center">
              <span className="mr-2 text-base">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}
            </span>
            <button onClick={() => setMsg({ text: '', type: '' })} className="p-1 rounded-md hover:bg-black/5">
              <Icons.Close />
            </button>
          </div>
        )}

        {/* 1. SINGLE COLUMN TOP SECTION: Compact Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Our Warehouse</label>
              <select
                value={selectedWh}
                onChange={(e) => {
                  const nextWh = e.target.value;
                  setSelectedWh(nextWh);
                  processViewData(
                    rawInventoryRows,
                    rawTxnRows,
                    nextWh,
                    warehouses,
                    productsById,
                    fromDate,
                    toDate,
                    showZeroRows
                  );
                }}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 focus:bg-white transition-colors cursor-pointer"
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    [{w.code}] {w.name}
                  </option>
                ))}
                <option disabled>──────────</option>
                <option value="ALL_SUM">All Warehouses (Sum)</option>
                <option value="ALL_SEP">All Warehouses (Separate)</option>
              </select>
            </div>

            <div className="lg:col-span-3">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                From Date <span className="text-slate-400 font-normal normal-case">(Opening = Prev Day)</span>
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 focus:bg-white transition-colors cursor-pointer"
              />
            </div>

            <div className="lg:col-span-3">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                To Date <span className="text-slate-400 font-normal normal-case">(Closing Balance)</span>
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 focus:bg-white transition-colors cursor-pointer"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-2">
              <button
                onClick={handleApplyFilters}
                disabled={isLoading || !fromDate || !toDate || warehouses.length === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-sm transition-all text-xs md:text-sm disabled:opacity-50 flex justify-center items-center h-[42px]"
              >
                {isLoading ? <Icons.Spinner /> : <><Icons.Search /> <span className="ml-2">Load</span></>}
              </button>
            </div>
          </div>

          {/* Quick Presets + Recent Transaction Dates + Zero Row Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleThisMonthClick}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 transition-colors mr-1"
              >
                This Month
              </button>
              {recentDates.length > 0 && (
                <>
                  <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Single Day (Recent):</span>
                  {recentDates.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleQuickSingleDayClick(d)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                        fromDate === d && toDate === d
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200'
                      }`}
                    >
                      {formatDisplayDate(d)}
                    </button>
                  ))}
                </>
              )}
            </div>

            <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showZeroRows}
                onChange={(e) => handleToggleZeroRows(e.target.checked)}
                className="accent-indigo-600 rounded cursor-pointer"
              />
              Show 0-Balance Items
            </label>
          </div>
        </div>

        {/* 2. SINGLE COLUMN THIN SUMMARY BAR */}
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-900 px-4 md:px-5 py-3 rounded-2xl border border-slate-800 shadow-md text-white">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Left: Date Range & Opening Base */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="text-xs font-black text-indigo-300 uppercase tracking-wider whitespace-nowrap">
                {stockDateRangeLabel}
              </span>
              <span className="text-[11px] font-semibold bg-white/10 text-slate-200 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                Opening: {openingPrevLabel}
              </span>
            </div>

            {/* Right: Metrics */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end gap-2 sm:gap-x-5 sm:gap-y-2">
              <div className="flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Records</span>
                <span className="text-base md:text-lg font-black text-white">{filteredData.length}</span>
              </div>

              <div className="hidden sm:block h-4 w-px bg-slate-700/80" />

              <div className="flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                <span className="text-[10px] text-amber-400 font-bold uppercase">WHs</span>
                <span className="text-base md:text-lg font-black text-amber-400">{summary.warehouseCount}</span>
              </div>

              <div className="hidden sm:block h-4 w-px bg-slate-700/80" />

              <div className="flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                <span className="text-[10px] text-cyan-400 font-bold uppercase">Opening</span>
                <span className="text-base md:text-lg font-black text-cyan-400">{filteredTotalOpening.toLocaleString()}</span>
              </div>

              <div className="hidden sm:block h-4 w-px bg-slate-700/80" />

              <div className="flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                <span className="text-[10px] text-indigo-300 font-bold uppercase">Closing</span>
                <span className="text-base md:text-lg font-black text-indigo-300">{filteredTotalClosing.toLocaleString()}</span>
              </div>

              <div className="hidden sm:block h-4 w-px bg-slate-700/80" />

              <div className="col-span-2 sm:col-span-1 flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                <span className="text-[10px] text-slate-300 font-bold uppercase">Diff</span>
                <span
                  className={`text-base md:text-lg font-black ${
                    filteredTotalDiff > 0 ? 'text-emerald-400' : filteredTotalDiff < 0 ? 'text-rose-400' : 'text-slate-300'
                  }`}
                >
                  {filteredTotalDiff > 0 ? `+${filteredTotalDiff.toLocaleString()}` : filteredTotalDiff.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. PRODUCT LIST CARD */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col w-full">

          {/* Clean Responsive Filter Toolbar */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-xs md:text-sm uppercase tracking-wide flex items-center">
                <span className="text-base mr-2">🏢</span> Our Warehouse Stock &amp; Difference
              </h3>
              {hasActiveTableFilters && (
                <button
                  onClick={clearTableFilters}
                  className="xl:hidden text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200"
                >
                  Clear Filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:flex xl:flex-row items-stretch sm:items-center gap-2.5 w-full xl:w-auto">
              {/* Multi-Select Product Dropdown */}
              <div className="relative w-full xl:w-48" ref={productDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-bold text-slate-700 bg-white hover:border-indigo-500 transition-colors flex justify-between items-center shadow-xs"
                >
                  <span className="truncate">
                    {selectedProducts.length === 0
                      ? "All Products"
                      : `${selectedProducts.length} Selected`}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-2">▼</span>
                </button>

                {isProductDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-full sm:w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto custom-scrollbar">
                    <div
                      className="p-2.5 border-b border-slate-100 hover:bg-slate-50 cursor-pointer flex items-center sticky top-0 bg-white z-10"
                      onClick={handleSelectAllProducts}
                    >
                      <input
                        type="checkbox"
                        checked={selectedProducts.length === uniqueProductNames.length && uniqueProductNames.length > 0}
                        onChange={() => {}}
                        className="mr-2.5 accent-indigo-600 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-slate-800">Select All ({uniqueProductNames.length})</span>
                    </div>
                    {uniqueProductNames.length === 0 ? (
                      <div className="p-3 text-xs text-slate-400 text-center">No products loaded</div>
                    ) : (
                      uniqueProductNames.map(name => (
                        <div
                          key={name}
                          className="p-2.5 border-b border-slate-50 hover:bg-indigo-50/40 cursor-pointer flex items-center"
                          onClick={() => handleProductSelect(name)}
                        >
                          <input
                            type="checkbox"
                            checked={selectedProducts.includes(name)}
                            onChange={() => {}}
                            className="mr-2.5 accent-indigo-600 cursor-pointer shrink-0"
                          />
                          <span className="text-xs font-medium text-slate-700 truncate">{name}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Search Product Name */}
              <input
                type="text"
                placeholder="Search Product / WH..."
                value={filterProductName}
                onChange={e => setFilterProductName(e.target.value)}
                className="w-full xl:w-44 px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-700 shadow-xs"
              />

              {/* Search Product Code */}
              <input
                type="text"
                placeholder="Code (e.g. 2303, 2306)..."
                value={filterProductCode}
                onChange={e => setFilterProductCode(e.target.value)}
                className="w-full xl:w-44 px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-700 shadow-xs"
              />

              {/* Difference Filter */}
              <select
                value={filterDiffMode}
                onChange={e => setFilterDiffMode(e.target.value)}
                className="w-full xl:w-40 px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-700 shadow-xs cursor-pointer"
              >
                <option value="ALL">All Differences</option>
                <option value="CHANGED">Changed Only (≠ 0)</option>
                <option value="INCREASED">Increased (+)</option>
                <option value="DECREASED">Decreased (-)</option>
                <option value="UNCHANGED">No Change (0)</option>
              </select>

              {hasActiveTableFilters && (
                <button
                  onClick={clearTableFilters}
                  className="hidden xl:inline-flex items-center px-3 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Loading / Empty State */}
          {isLoading ? (
            <div className="p-12 text-center flex justify-center"><Icons.Spinner /></div>
          ) : filteredData.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <span className="text-4xl opacity-30 mb-2">📦</span>
              <p className="text-sm font-bold text-slate-500">
                No warehouse stock records found for <span className="text-indigo-700">{stockDateRangeLabel}</span>.
              </p>
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE */}
              <div className="hidden md:block w-full overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-600 uppercase tracking-wider">
                      <th className="py-3.5 px-3 w-14 text-center border-r border-slate-200/70">SL</th>
                      <th className="py-3.5 px-3 w-28 text-center border-r border-slate-200/70">WH Code</th>
                      <th className="py-3.5 px-3.5 w-60 border-r border-slate-200/70">Warehouse Name</th>
                      <th className="py-3.5 px-3 w-28 text-center border-r border-slate-200/70">Product Code</th>
                      <th className="py-3.5 px-3.5 border-r border-slate-200/70">Product Name</th>
                      <th className="py-3.5 px-3.5 w-36 text-right border-r border-slate-200/70 bg-cyan-50/60 text-cyan-900">
                        <div>Opening Balance</div>
                        <div className="text-[9px] font-semibold text-cyan-700 normal-case mt-0.5">
                          ({openingDateLabel})
                        </div>
                      </th>
                      <th className="py-3.5 px-3.5 w-36 text-right border-r border-slate-200/70 bg-indigo-50/70 text-indigo-900">
                        <div>Our Stock</div>
                        <div className="text-[9px] font-semibold text-indigo-700 normal-case mt-0.5">
                          Closing ({closingDateLabel})
                        </div>
                      </th>
                      <th className="py-3.5 px-4 w-32 text-right bg-slate-200/70 text-slate-800">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70">
                    {filteredData.map((item, idx) => {
                      const diff = Number(item.difference) || 0;
                      return (
                        <tr
                          key={`${item.key}-${idx}`}
                          className={`${
                            idx % 2 === 0 ? 'bg-white' : 'bg-indigo-50/35'
                          } hover:bg-indigo-50/70 transition-colors`}
                        >
                          <td className="py-3 px-3 text-center text-xs font-bold text-slate-400 border-r border-slate-200/50">
                            {idx + 1}
                          </td>

                          <td className="py-3 px-3 text-center border-r border-slate-200/50">
                            <span
                              className="inline-block text-[11px] font-mono font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-md shadow-2xs"
                              title={item.wh_list_text ? `WH Codes: ${item.wh_list_text}` : undefined}
                            >
                              {item.warehouse_code}
                            </span>
                          </td>

                          <td className="py-3 px-3.5 border-r border-slate-200/50">
                            <p className="text-xs font-bold text-slate-800 leading-snug">{item.warehouse_name}</p>
                            {selectedWh === 'ALL_SUM' && item.wh_list_text && (
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[220px]" title={`WH Codes: ${item.wh_list_text}`}>
                                {item.wh_list_text}
                              </p>
                            )}
                          </td>

                          <td className="py-3 px-3 text-center border-r border-slate-200/50">
                            <span className="inline-block text-xs font-mono font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-md shadow-2xs">
                              {item.product_code}
                            </span>
                          </td>

                          <td className="py-3 px-3.5 border-r border-slate-200/50">
                            <p className="font-bold text-slate-900 text-sm leading-snug">{item.product_name}</p>
                          </td>

                          <td className="py-3 px-3.5 text-right border-r border-slate-200/50 bg-cyan-50/20">
                            <span className="text-sm font-bold text-slate-700">
                              {Number(item.opening_qty).toLocaleString()}
                            </span>
                          </td>

                          <td className="py-3 px-3.5 text-right border-r border-slate-200/50 bg-indigo-50/25">
                            <span className={`text-base font-black ${item.closing_qty < 0 ? 'text-rose-600' : 'text-indigo-700'}`}>
                              {Number(item.closing_qty).toLocaleString()}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right">
                            {diff === 0 ? (
                              <span className="text-xs font-bold text-slate-400">0</span>
                            ) : (
                              <span
                                className={`inline-block text-xs font-black px-2.5 py-1 rounded-lg border ${
                                  diff > 0
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                {diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900 text-white font-bold">
                      <td colSpan={5} className="py-3 px-4 text-right text-xs uppercase tracking-wider text-slate-300">
                        Total ({filteredData.length} Items)
                      </td>
                      <td className="py-3 px-3.5 text-right text-sm font-black text-cyan-300">
                        {filteredTotalOpening.toLocaleString()}
                      </td>
                      <td className="py-3 px-3.5 text-right text-base font-black text-indigo-300">
                        {filteredTotalClosing.toLocaleString()}
                      </td>
                      <td
                        className={`py-3 px-4 text-right text-base font-black ${
                          filteredTotalDiff > 0 ? 'text-emerald-400' : filteredTotalDiff < 0 ? 'text-rose-400' : 'text-slate-300'
                        }`}
                      >
                        {filteredTotalDiff > 0 ? `+${filteredTotalDiff.toLocaleString()}` : filteredTotalDiff.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* MOBILE CARD LIST */}
              <div className="md:hidden flex flex-col divide-y divide-slate-200">
                {filteredData.map((item, idx) => {
                  const diff = Number(item.difference) || 0;
                  return (
                    <div
                      key={`${item.key}-${idx}`}
                      className={`p-3.5 space-y-2.5 ${idx % 2 === 0 ? 'bg-white' : 'bg-indigo-50/40'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-black text-slate-400">#{idx + 1}</span>
                            <span className="text-[10px] font-mono font-bold bg-white border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                              WH: {item.warehouse_code}
                            </span>
                            <span className="text-[10px] font-mono font-bold bg-white border border-slate-200 text-indigo-700 px-1.5 py-0.5 rounded">
                              Code: {item.product_code}
                            </span>
                          </div>
                          <p className="font-bold text-slate-900 text-sm leading-snug break-words">
                            {item.product_name}
                          </p>
                          <p className="text-[11px] font-semibold text-slate-600 truncate mt-0.5">
                            🏢 {item.warehouse_name}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/70">
                        <div className="bg-cyan-50/60 border border-cyan-100 rounded-xl px-2.5 py-1.5 text-center">
                          <span className="block text-[9px] font-bold text-cyan-800 uppercase">Opening</span>
                          <span className="text-sm font-black text-slate-800">
                            {Number(item.opening_qty).toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl px-2.5 py-1.5 text-center">
                          <span className="block text-[9px] font-bold text-indigo-800 uppercase">Our Stock</span>
                          <span className="text-sm font-black text-indigo-700">
                            {Number(item.closing_qty).toLocaleString()}
                          </span>
                        </div>
                        <div
                          className={`rounded-xl px-2.5 py-1.5 text-center border ${
                            diff > 0
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : diff < 0
                              ? 'bg-rose-50 border-rose-200 text-rose-700'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          <span className="block text-[9px] font-bold uppercase opacity-80">Difference</span>
                          <span className="text-sm font-black">
                            {diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Mobile Total Footer */}
                <div className="p-3.5 bg-slate-900 text-white grid grid-cols-3 gap-2 text-center">
                  <div>
                    <span className="block text-[9px] font-bold text-cyan-400 uppercase">Total Opening</span>
                    <span className="text-sm font-black text-cyan-300">{filteredTotalOpening.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-indigo-300 uppercase">Total Closing</span>
                    <span className="text-sm font-black text-indigo-300">{filteredTotalClosing.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-300 uppercase">Total Diff</span>
                    <span className={`text-sm font-black ${filteredTotalDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {filteredTotalDiff > 0 ? `+${filteredTotalDiff.toLocaleString()}` : filteredTotalDiff.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}