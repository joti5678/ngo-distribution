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

// টাইমজোন শিফট ছাড়াই পূর্ববর্তী দিনের তারিখ (YYYY-MM-DD) বের করার হেল্পার
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

// YYYY-MM-DD কে DD.MM.YYYY ফরম্যাটে দেখানোর হেল্পার
const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const clean = dateStr.split('T')[0];
  const [y, m, d] = clean.split('-');
  return y && m && d ? `${d}.${m}.${y}` : clean;
};

interface CuboidWarehouseOption {
  code: string;
  name: string;
}

export default function CuboidStockPage() {
  const [cuboidWarehouses, setCuboidWarehouses] = useState<CuboidWarehouseOption[]>([]);
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
  const [filterDiffMode, setFilterDiffMode] = useState<'ALL' | 'CHANGED' | 'INCREASED' | 'DECREASED' | 'UNCHANGED'>('ALL');

  // Raw & Processed Data States
  const [rawOpeningRows, setRawOpeningRows] = useState<any[]>([]);
  const [rawClosingRows, setRawClosingRows] = useState<any[]>([]);
  const [displayData, setDisplayData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const [summary, setSummary] = useState({
    totalRows: 0,
    uniqueProducts: 0,
    warehouseCount: 0,
    openingSourceDate: '',
    closingSourceDate: '',
    openingHasData: false,
    closingHasData: false,
    lastFetched: '' as string | null
  });

  const uniqueProductNames = Array.from(new Set(displayData.map(item => item.product_name))).sort();

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

  // ১,০০০ রো-এর লিমিট এড়াতে ব্যাচ ফেচিং
  const fetchAllCuboidStocksForDate = async (targetDate: string) => {
    if (!targetDate) return [];
    const allRows: any[] = [];
    const batchSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('donor_warehouse_stock')
        .select('id, warehouse_code, warehouse_name, product_code, product_name, quantity, stock_date, fetch_date')
        .eq('stock_date', targetDate)
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
      const [mapRes, recentRes] = await Promise.all([
        supabase.from('warehouse_mappings').select('donor_wh_code, donor_wh_name'),
        supabase
          .from('donor_warehouse_stock')
          .select('warehouse_code, warehouse_name, stock_date')
          .order('stock_date', { ascending: false })
          .limit(1000)
      ]);

      const whMap = new Map<string, string>();

      (mapRes.data || []).forEach((m: any) => {
        const code = String(m.donor_wh_code || '').trim();
        if (code) {
          whMap.set(code, String(m.donor_wh_name || code).trim());
        }
      });

      const dateSet = new Set<string>();
      (recentRes.data || []).forEach((r: any) => {
        const code = String(r.warehouse_code || '').trim();
        const name = String(r.warehouse_name || code).trim();
        if (code && !whMap.has(code)) {
          whMap.set(code, name);
        }
        if (r.stock_date) {
          dateSet.add(String(r.stock_date).split('T')[0]);
        }
      });

      const sortedWhs: CuboidWarehouseOption[] = Array.from(whMap.entries())
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const sortedDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a)).slice(0, 7);

      setCuboidWarehouses(sortedWhs);
      setRecentDates(sortedDates);

      await loadCuboidStockRange(defaultFrom, defaultTo, 'ALL_SUM', sortedWhs);
    } catch (err: any) {
      console.error("Error loading initial CUBOID metadata:", err);
      showMessage(`Failed to load CUBOID data: ${err.message || 'Unknown error'}`, "error");
    }
    setIsLoading(false);
  };

  // Opening (FromDate - 1 day) এবং Closing (ToDate) ডেটা একসাথে প্রসেস করা
  const processViewData = (
    openingRows: any[],
    closingRows: any[],
    whSelection: string,
    whOptions: CuboidWarehouseOption[],
    openingSourceDate: string,
    closingSourceDate: string
  ) => {
    const whNameLookup = new Map<string, string>();
    whOptions.forEach(w => whNameLookup.set(w.code, w.name));

    const isSum = whSelection === 'ALL_SUM';
    const isSep = whSelection === 'ALL_SEP';

    const scopedOpening = (isSum || isSep)
      ? openingRows
      : openingRows.filter(r => String(r.warehouse_code || '').trim() === String(whSelection).trim());

    const scopedClosing = (isSum || isSep)
      ? closingRows
      : closingRows.filter(r => String(r.warehouse_code || '').trim() === String(whSelection).trim());

    const processed: any[] = [];

    if (isSum) {
      // সব ওয়্যারহাউসের স্টক প্রোডাক্ট কোড অনুযায়ী Sum করে Opening, Closing ও Difference বের করা
      const sumMap = new Map<string, any>();

      const addRecord = (r: any, type: 'opening' | 'closing') => {
        const pCodeRaw = String(r.product_code || '').trim();
        const key = normalizeCode(pCodeRaw);
        if (!key) return;

        const qty = Number(r.quantity) || 0;
        const wCode = String(r.warehouse_code || '').trim();

        if (!sumMap.has(key)) {
          sumMap.set(key, {
            key,
            warehouse_code: 'Multiple',
            warehouse_name: 'All Warehouses (Sum)',
            warehouse_codes_set: new Set<string>(wCode ? [wCode] : []),
            product_code: pCodeRaw,
            product_name: String(r.product_name || pCodeRaw).trim(),
            opening_qty: type === 'opening' ? qty : 0,
            closing_qty: type === 'closing' ? qty : 0,
            fetch_date: type === 'closing' ? (r.fetch_date || null) : null
          });
        } else {
          const existing = sumMap.get(key);
          if (type === 'opening') existing.opening_qty += qty;
          else existing.closing_qty += qty;
          if (wCode) existing.warehouse_codes_set.add(wCode);
          if (type === 'closing' && r.fetch_date && (!existing.fetch_date || r.fetch_date > existing.fetch_date)) {
            existing.fetch_date = r.fetch_date;
          }
        }
      };

      scopedOpening.forEach(r => addRecord(r, 'opening'));
      scopedClosing.forEach(r => addRecord(r, 'closing'));

      sumMap.forEach(item => {
        const whCount = item.warehouse_codes_set.size;
        processed.push({
          ...item,
          warehouse_code: whCount > 0 ? `${whCount} WH(s)` : 'Multiple',
          wh_list_text: Array.from(item.warehouse_codes_set).sort().join(', '),
          difference: item.closing_qty - item.opening_qty
        });
      });
    } else {
      // Separate অথবা নির্দিষ্ট একটি ওয়্যারহাউস
      const sepMap = new Map<string, any>();

      const addRecord = (r: any, type: 'opening' | 'closing') => {
        const wCode = String(r.warehouse_code || '').trim();
        const wName = String(r.warehouse_name || whNameLookup.get(wCode) || wCode).trim();
        const pCodeRaw = String(r.product_code || '').trim();
        const pKey = normalizeCode(pCodeRaw);
        if (!pKey) return;

        const key = `${wCode}__${pKey}`;
        const qty = Number(r.quantity) || 0;

        if (!sepMap.has(key)) {
          sepMap.set(key, {
            key,
            warehouse_code: wCode || 'N/A',
            warehouse_name: wName || 'Unknown Warehouse',
            product_code: pCodeRaw,
            product_name: String(r.product_name || pCodeRaw).trim(),
            opening_qty: type === 'opening' ? qty : 0,
            closing_qty: type === 'closing' ? qty : 0,
            fetch_date: type === 'closing' ? (r.fetch_date || null) : null
          });
        } else {
          const existing = sepMap.get(key);
          if (type === 'opening') existing.opening_qty += qty;
          else existing.closing_qty += qty;
          if (type === 'closing' && r.fetch_date && (!existing.fetch_date || r.fetch_date > existing.fetch_date)) {
            existing.fetch_date = r.fetch_date;
          }
        }
      };

      scopedOpening.forEach(r => addRecord(r, 'opening'));
      scopedClosing.forEach(r => addRecord(r, 'closing'));

      sepMap.forEach(item => {
        processed.push({
          ...item,
          difference: item.closing_qty - item.opening_qty
        });
      });
    }

    // WH Code ও Product Code অনুযায়ী সর্ট
    processed.sort((a, b) => {
      const codeCmp = String(a.product_code || '').localeCompare(String(b.product_code || ''), undefined, { numeric: true });
      if (codeCmp !== 0) return codeCmp;
      return String(a.warehouse_code || '').localeCompare(String(b.warehouse_code || ''), undefined, { numeric: true });
    });

    const uniqueProdSet = new Set(processed.map(i => normalizeCode(i.product_code)));
    const uniqueWhSet = new Set(
      [...scopedOpening, ...scopedClosing]
        .map(r => String(r.warehouse_code || '').trim())
        .filter(Boolean)
    );

    let latestFetch: string | null = null;
    scopedClosing.forEach(r => {
      if (r.fetch_date && (!latestFetch || r.fetch_date > latestFetch)) {
        latestFetch = r.fetch_date;
      }
    });

    setDisplayData(processed);
    setSelectedProducts([]);
    setSummary({
      totalRows: processed.length,
      uniqueProducts: uniqueProdSet.size,
      warehouseCount: uniqueWhSet.size,
      openingSourceDate,
      closingSourceDate,
      openingHasData: scopedOpening.length > 0,
      closingHasData: scopedClosing.length > 0,
      lastFetched: latestFetch
    });
  };

  const loadCuboidStockRange = async (
    targetFrom: string,
    targetTo: string,
    targetWh: string,
    currentWhOptions = cuboidWarehouses
  ) => {
    if (!targetFrom || !targetTo) {
      showMessage("Please select both From Date and To Date.", "error");
      return;
    }
    if (targetFrom > targetTo) {
      showMessage("From Date cannot be later than To Date.", "error");
      return;
    }

    setIsLoading(true);
    try {
      // Starting date-এর আগের দিনের Closing Balance-ই হলো Starting date-এর Opening Balance
      const prevDateForOpening = getPreviousDateStr(targetFrom);

      const [openingRows, closingRows] = await Promise.all([
        fetchAllCuboidStocksForDate(prevDateForOpening),
        fetchAllCuboidStocksForDate(targetTo)
      ]);

      setRawOpeningRows(openingRows);
      setRawClosingRows(closingRows);

      // নতুন কোনো ওয়্যারহাউস পাওয়া গেলে ড্রপডাউনে আপডেট করা
      const updatedMap = new Map<string, string>();
      currentWhOptions.forEach(w => updatedMap.set(w.code, w.name));
      [...openingRows, ...closingRows].forEach(r => {
        const code = String(r.warehouse_code || '').trim();
        const name = String(r.warehouse_name || code).trim();
        if (code && !updatedMap.has(code)) {
          updatedMap.set(code, name);
        }
      });
      const updatedWhList = Array.from(updatedMap.entries())
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setCuboidWarehouses(updatedWhList);

      processViewData(openingRows, closingRows, targetWh, updatedWhList, prevDateForOpening, targetTo);

      if (openingRows.length === 0 && closingRows.length === 0) {
        showMessage(
          `No CUBOID stock found for Opening (${formatDisplayDate(prevDateForOpening)}) or Closing (${formatDisplayDate(targetTo)}).`,
          "error"
        );
      }
    } catch (err: any) {
      console.error("Error fetching CUBOID stock:", err);
      showMessage(`Error loading CUBOID stock: ${err.message || 'Unknown error'}`, "error");
    }
    setIsLoading(false);
  };

  const handleApplyFilters = () => {
    loadCuboidStockRange(fromDate, toDate, selectedWh);
  };

  // ১ দিনের রিপোর্ট দেখার জন্য (From = d, To = d -> Opening হবে d-1 এর Closing)
  const handleQuickSingleDayClick = (dateStr: string) => {
    setFromDate(dateStr);
    setToDate(dateStr);
    loadCuboidStockRange(dateStr, dateStr, selectedWh);
  };

  // মাসের ১ তারিখ থেকে আজকের তারিখ পর্যন্ত কুইক বাটন
  const handleThisMonthClick = () => {
    const { firstDayStr, todayStr } = getDefaultMonthDates();
    setFromDate(firstDayStr);
    setToDate(todayStr);
    loadCuboidStockRange(firstDayStr, todayStr, selectedWh);
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

  // 🚀 Excel Export: ওপরের ১-৪ রো ছাড়া সরাসরি Row 1 থেকে হেডার + SL এর পরে Stock Date + নতুন কলাম স্ট্রাকচার
  const handleExportExcel = async () => {
    if (filteredData.length === 0) return;
    setIsExportingExcel(true);

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'NGO Distribution System';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('CUBOID Stock', {
        views: [{ state: 'frozen', ySplit: 1 }],
        pageSetup: {
          paperSize: 9,
          orientation: 'landscape',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0
        }
      });

      const thinBorder: Partial<ExcelJS.Borders> = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };

      const headerBorder: Partial<ExcelJS.Borders> = {
        top: { style: 'medium', color: { argb: 'FF064E3B' } },
        left: { style: 'thin', color: { argb: 'FF047857' } },
        bottom: { style: 'medium', color: { argb: 'FF064E3B' } },
        right: { style: 'thin', color: { argb: 'FF047857' } }
      };

      // কলাম স্ট্রাকচার: SL | Stock Date | WH Code | Warehouse Name | Product Code | Product Name | Opening Balance | CUBOID Qty (Closing) | Difference
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

      // Row 1: সরাসরি টেবিল হেডার (কোনো টপ ব্যানার রো নেই)
      const headerRow = sheet.addRow([
        'SL',
        'Stock Date',
        'WH Code',
        'Warehouse Name',
        'Product Code',
        'Product Name',
        `Opening Balance (${openingDateLabel})`,
        `CUBOID Qty / Closing (${closingDateLabel})`,
        'Difference'
      ]);
      headerRow.height = 32;

      headerRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        let headerBg = 'FF059669';
        if (colNumber === 7) headerBg = 'FF0F766E';
        else if (colNumber === 8) headerBg = 'FF047857';
        else if (colNumber === 9) headerBg = 'FF1E293B';

        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBg } };
        cell.border = headerBorder;
        cell.alignment = {
          vertical: 'middle',
          horizontal: colNumber === 4 || colNumber === 6 ? 'left' : colNumber >= 7 ? 'right' : 'center',
          wrapText: true
        };
      });

      // Row 2 থেকে ডেটা রো
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

        // টেক্সট র‍্যাপ অনুযায়ী ডাইনামিক রো হাইট
        const whLines = Math.ceil(String(item.warehouse_name || '').length / 30);
        const nameLines = Math.ceil(String(item.product_name || '').length / 34);
        const codeLines = Math.ceil(String(whCodeDisplay || '').length / (selectedWh === 'ALL_SUM' ? 18 : 11));
        const maxLines = Math.max(1, whLines, nameLines, codeLines);
        dataRow.height = Math.max(24, maxLines * 16 + 8);

        const isEven = idx % 2 === 0;
        const rowBgArgb = isEven ? 'FFFFFFFF' : 'FFEFF6FF';
        const openingBgArgb = isEven ? 'FFF8FAFC' : 'FFE2E8F0';
        const closingBgArgb = isEven ? 'FFF0FDF4' : 'FFDCFCE7';
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
            cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF047857' } };
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

      // AutoFilter শুধুমাত্র ডেটা রেঞ্জের ওপর (যাতে Total রো ফিল্টার না হয়)
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: lastDataRowIdx, column: 9 }
      };

      // Total Footer Row (ডাইনামিক SUBTOTAL ফর্মুলা)
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
      totalCloseCell.font = { name: 'Calibri', size: 11.5, bold: true, color: { argb: 'FF34D399' } };
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

      const fileDateSuffix = isSingleDay ? toDate : `${fromDate}_to_${toDate}`;
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }),
        `CUBOID_Stock_${selectedWh}_${fileDateSuffix}.xlsx`
      );
      showMessage("Excel report exported successfully!", "success");
    } catch (err: any) {
      console.error("Excel Export Error:", err);
      showMessage(`Failed to export Excel: ${err.message || 'Unknown error'}`, "error");
    } finally {
      setIsExportingExcel(false);
    }
  };

  // PDF Export (নতুন কলাম স্ট্রাকচার সহ Landscape মোড)
  const handleExportPDF = () => {
    if (filteredData.length === 0) return;

    const doc = new jsPDF('landscape');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(`CUBOID Warehouse Stock & Difference Report (${stockDateRangeLabel})`, 14, 15);

    let whTitle = "All Warehouses (Sum)";
    if (selectedWh === 'ALL_SEP') whTitle = "All Warehouses (Separate)";
    else if (selectedWh !== 'ALL_SUM') {
      const found = cuboidWarehouses.find(w => w.code === selectedWh);
      whTitle = found ? `[${found.code}] ${found.name}` : selectedWh;
    }

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `CUBOID Warehouse: ${whTitle}  |  Opening Base (Prev Closing): ${openingPrevLabel}  |  Closing: ${closingDateLabel}  |  Generated: ${new Date().toLocaleString()}`,
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
      `CUBOID Qty / Closing\n(${closingDateLabel})`,
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
      headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' },
      alternateRowStyles: { fillColor: [239, 246, 255] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { halign: 'center', cellWidth: 26 },
        2: { halign: 'left', cellWidth: 55 },
        3: { halign: 'center', cellWidth: 24 },
        4: { halign: 'left' },
        5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
        6: { halign: 'right', cellWidth: 32, fontStyle: 'bold', textColor: [4, 120, 87] },
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

    const fileDateSuffix = isSingleDay ? toDate : `${fromDate}_to_${toDate}`;
    doc.save(`CUBOID_Stock_${selectedWh}_${fileDateSuffix}.pdf`);
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
            <h2 className="text-lg md:text-2xl font-bold text-slate-900 leading-tight truncate">CUBOID Warehouse Stock</h2>
            <p className="text-[11px] md:text-xs text-slate-500 hidden sm:block">
              View CUBOID stock &amp; identify opening-to-closing balance difference across any date range
            </p>
          </div>
        </div>

        <div className="flex w-full sm:w-auto space-x-2 shrink-0">
          <button
            onClick={handleExportExcel}
            disabled={filteredData.length === 0 || isExportingExcel}
            className="flex-1 sm:flex-none justify-center px-3.5 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-colors flex items-center shadow-sm disabled:opacity-50"
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

        {/* 1. SINGLE COLUMN TOP SECTION: Compact Filter Bar (Date From & Date To) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">CUBOID Warehouse</label>
              <select
                value={selectedWh}
                onChange={(e) => {
                  const nextWh = e.target.value;
                  setSelectedWh(nextWh);
                  processViewData(
                    rawOpeningRows,
                    rawClosingRows,
                    nextWh,
                    cuboidWarehouses,
                    summary.openingSourceDate || getPreviousDateStr(fromDate),
                    summary.closingSourceDate || toDate
                  );
                }}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 font-bold outline-none focus:border-emerald-500 focus:bg-white transition-colors cursor-pointer"
              >
                {cuboidWarehouses.map(w => (
                  <option key={w.code} value={w.code}>
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
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 font-bold outline-none focus:border-emerald-500 focus:bg-white transition-colors cursor-pointer"
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
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 font-bold outline-none focus:border-emerald-500 focus:bg-white transition-colors cursor-pointer"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-2">
              <button
                onClick={handleApplyFilters}
                disabled={isLoading || !fromDate || !toDate}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-sm transition-all text-xs md:text-sm disabled:opacity-50 flex justify-center items-center h-[42px]"
              >
                {isLoading ? <Icons.Spinner /> : <><Icons.Search /> <span className="ml-2">Load</span></>}
              </button>
            </div>
          </div>

          {/* Quick Presets + Recent Fetched Dates Strip */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-slate-100">
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
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                    }`}
                  >
                    {formatDisplayDate(d)}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

{/* 2. SINGLE COLUMN THIN SUMMARY BAR */}
        <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 px-4 md:px-5 py-3 rounded-2xl border border-slate-800 shadow-md text-white">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Left: Date Range & Opening Base */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="text-xs font-black text-emerald-400 uppercase tracking-wider whitespace-nowrap">
                {stockDateRangeLabel}
              </span>
              <span className="text-[11px] font-semibold bg-white/10 text-slate-200 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                Opening: {openingPrevLabel}
                {!summary.openingHasData && !isLoading ? ' (No data)' : ''}
              </span>
            </div>

            {/* Right: Metrics (Natural flex spacing — zero overlap) */}
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
                <span className="text-[10px] text-emerald-400 font-bold uppercase">Closing</span>
                <span className="text-base md:text-lg font-black text-emerald-400">{filteredTotalClosing.toLocaleString()}</span>
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
                <span className="text-base mr-2">📋</span> CUBOID Warehouse Stock &amp; Difference
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
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-bold text-slate-700 bg-white hover:border-emerald-500 transition-colors flex justify-between items-center shadow-xs"
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
                        className="mr-2.5 accent-emerald-600 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-slate-800">Select All ({uniqueProductNames.length})</span>
                    </div>
                    {uniqueProductNames.length === 0 ? (
                      <div className="p-3 text-xs text-slate-400 text-center">No products loaded</div>
                    ) : (
                      uniqueProductNames.map(name => (
                        <div
                          key={name}
                          className="p-2.5 border-b border-slate-50 hover:bg-emerald-50/40 cursor-pointer flex items-center"
                          onClick={() => handleProductSelect(name)}
                        >
                          <input
                            type="checkbox"
                            checked={selectedProducts.includes(name)}
                            onChange={() => {}}
                            className="mr-2.5 accent-emerald-600 cursor-pointer shrink-0"
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
                className="w-full xl:w-44 px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none focus:border-emerald-500 font-bold text-slate-700 shadow-xs"
              />

              {/* Search Product Code */}
              <input
                type="text"
                placeholder="Code (e.g. 2303, 2306)..."
                value={filterProductCode}
                onChange={e => setFilterProductCode(e.target.value)}
                className="w-full xl:w-44 px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none focus:border-emerald-500 font-bold text-slate-700 shadow-xs"
              />

              {/* Difference Filter */}
              <select
                value={filterDiffMode}
                onChange={e => setFilterDiffMode(e.target.value as any)}
                className="w-full xl:w-40 px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none focus:border-emerald-500 font-bold text-slate-700 shadow-xs cursor-pointer"
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
                No CUBOID stock records found for <span className="text-emerald-700">{stockDateRangeLabel}</span>.
              </p>
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE (Requested Column Structure) */}
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
                      <th className="py-3.5 px-3.5 w-36 text-right border-r border-slate-200/70 bg-emerald-50/70 text-emerald-900">
                        <div>CUBOID Qty</div>
                        <div className="text-[9px] font-semibold text-emerald-700 normal-case mt-0.5">
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
                            idx % 2 === 0 ? 'bg-white' : 'bg-blue-50/40'
                          } hover:bg-emerald-50/50 transition-colors`}
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

                          <td className="py-3 px-3.5 text-right border-r border-slate-200/50 bg-emerald-50/25">
                            <span className="text-base font-black text-emerald-700">
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
                      <td className="py-3 px-3.5 text-right text-base font-black text-emerald-400">
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
                      className={`p-3.5 space-y-2.5 ${idx % 2 === 0 ? 'bg-white' : 'bg-blue-50/40'}`}
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
                        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl px-2.5 py-1.5 text-center">
                          <span className="block text-[9px] font-bold text-emerald-800 uppercase">CUBOID Qty</span>
                          <span className="text-sm font-black text-emerald-700">
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
                    <span className="block text-[9px] font-bold text-emerald-400 uppercase">Total Closing</span>
                    <span className="text-sm font-black text-emerald-400">{filteredTotalClosing.toLocaleString()}</span>
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