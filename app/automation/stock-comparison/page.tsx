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

// Normalize product code for matching (handles spaces, casing, and leading zeros on numeric codes)
const normalizeProductKey = (code: any): string => {
  const cleaned = String(code || '').trim().toLowerCase();
  if (!cleaned) return '';
  if (/^\d+$/.test(cleaned)) {
    return cleaned.replace(/^0+/, '') || '0';
  }
  return cleaned;
};

const normalizeWhCode = (code: any): string => String(code || '').trim().toLowerCase();

interface UnifiedWhOption {
  key: string;
  system_wh_id: string | null;
  code: string;
  name: string;
  donor_codes: string[];
}

interface AnyDict {
  [key: string]: any;
}

interface BoolDict {
  [key: string]: boolean;
}

export default function StockComparisonPage() {
  const [warehouseOptions, setWarehouseOptions] = useState<UnifiedWhOption[]>([]);
  const [productsById, setProductsById] = useState<AnyDict>({});
  const [recentDates, setRecentDates] = useState<string[]>([]);

  // Main Filters (Single Date + Warehouse)
  const [selectedWh, setSelectedWh] = useState('ALL_SUM');
  const [stockDate, setStockDate] = useState('');
  const [showZeroRows, setShowZeroRows] = useState(false);

  // Table Filters
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  const [filterSearch, setFilterSearch] = useState('');
  const [filterProductCode, setFilterProductCode] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Raw & Compared Data States
  const [rawCuboidRows, setRawCuboidRows] = useState<any[]>([]);
  const [rawInvRows, setRawInvRows] = useState<any[]>([]);
  const [rawTxnRows, setRawTxnRows] = useState<any[]>([]);
  const [comparisonData, setComparisonData] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Deduplicate product names for multi-select dropdown
  const uniqueNameDict: BoolDict = {};
  comparisonData.forEach(item => {
    const label = item.display_product_name;
    if (label && label !== '-') uniqueNameDict[label] = true;
  });
  const uniqueProductNames = Object.keys(uniqueNameDict).sort();

  useEffect(() => {
    const today = new Date();
    const todayStr = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    setStockDate(todayStr);
    fetchInitialMetadata(todayStr);
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

  // Batch fetch: donor_warehouse_stock for a single closing date
  const fetchAllCuboidForDate = async (targetDate: string) => {
    if (!targetDate) return [];
    const allRows: any[] = [];
    const batchSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('donor_warehouse_stock')
        .select('id, warehouse_code, warehouse_name, product_code, product_name, quantity, stock_date')
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

  // Batch fetch: inventory records for assigned warehouses
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

  // Batch fetch: inventory_transactions up to the selected closing date
  const fetchAllTransactionsUpToDate = async (whIds: string[], targetDate: string) => {
    if (whIds.length === 0 || !targetDate) return [];
    const allRows: any[] = [];
    const batchSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('warehouse_id, product_id, transaction_type, quantity, created_at')
        .in('warehouse_id', whIds)
        .lte('created_at', `${targetDate}T23:59:59.999Z`)
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

  const fetchInitialMetadata = async (defaultDate: string) => {
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

      const [whRes, mapRes, prodRes, recentCuboidRes] = await Promise.all([
        supabase.from('warehouses').select('id, name, code').order('name'),
        supabase.from('warehouse_mappings').select('system_wh_id, donor_wh_code, donor_wh_name'),
        supabase.from('products').select('id, name, code, unit_type, product_type, status'),
        supabase
          .from('donor_warehouse_stock')
          .select('warehouse_code, warehouse_name, stock_date')
          .order('stock_date', { ascending: false })
          .limit(1000)
      ]);

      const allSysWhs = whRes.data || [];
      const mySysWhs = isSuperAdmin
        ? allSysWhs
        : allSysWhs.filter((w: any) => assignedIds.includes(String(w.id).trim()));

      const mapRows = mapRes.data || [];

      // Build unified warehouse list linking system WH -> donor_wh_codes (with code fallback)
      const unifiedList: UnifiedWhOption[] = [];
      const claimedDonorCodeDict: BoolDict = {};

      mySysWhs.forEach((w: any) => {
        const sysId = String(w.id).trim();
        const sysCode = String(w.code || '').trim();
        const sysName = String(w.name || sysCode || 'Unknown Warehouse').trim();

        const donorCodeDict: BoolDict = {};
        mapRows.forEach((m: any) => {
          if (String(m.system_wh_id || '').trim() === sysId && m.donor_wh_code) {
            const dc = String(m.donor_wh_code).trim();
            donorCodeDict[dc] = true;
            claimedDonorCodeDict[normalizeWhCode(dc)] = true;
          }
        });

        // Always include system WH code as fallback link if no explicit mapping exists
        if (Object.keys(donorCodeDict).length === 0 && sysCode) {
          donorCodeDict[sysCode] = true;
          claimedDonorCodeDict[normalizeWhCode(sysCode)] = true;
        } else if (sysCode) {
          claimedDonorCodeDict[normalizeWhCode(sysCode)] = true;
        }

        const donorCodes = Object.keys(donorCodeDict);
        unifiedList.push({
          key: `SYS__${sysId}`,
          system_wh_id: sysId,
          code: sysCode || donorCodes[0] || 'N/A',
          name: sysName,
          donor_codes: donorCodes
        });
      });

      // Extract recent CUBOID dates + any unmapped CUBOID warehouses (for Super Admin)
      const dateDict: BoolDict = {};
      const unmappedCuboidDict: AnyDict = {};

      (recentCuboidRes.data || []).forEach((r: any) => {
        if (r.stock_date) {
          const d = extractYYYYMMDD(r.stock_date);
          if (d) dateDict[d] = true;
        }
        if (isSuperAdmin && r.warehouse_code) {
          const rawCode = String(r.warehouse_code).trim();
          const normCode = normalizeWhCode(rawCode);
          if (normCode && !claimedDonorCodeDict[normCode] && !unmappedCuboidDict[normCode]) {
            unmappedCuboidDict[normCode] = {
              key: `CUBOID__${rawCode}`,
              system_wh_id: null,
              code: rawCode,
              name: String(r.warehouse_name || rawCode).trim(),
              donor_codes: [rawCode]
            };
          }
        }
      });

      Object.values(unmappedCuboidDict).forEach((u: any) => unifiedList.push(u));
      unifiedList.sort((a, b) => a.name.localeCompare(b.name));

      const sortedDates = Object.keys(dateDict).sort((a, b) => b.localeCompare(a)).slice(0, 7);

      const pDict: AnyDict = {};
      (prodRes.data || []).forEach((p: any) => {
        pDict[String(p.id)] = p;
      });

      setWarehouseOptions(unifiedList);
      setProductsById(pDict);
      setRecentDates(sortedDates);

      const initialDate = dateDict[defaultDate] ? defaultDate : (sortedDates[0] || defaultDate);
      setStockDate(initialDate);

      await loadComparisonData(initialDate, 'ALL_SUM', unifiedList, pDict, false);
    } catch (err: any) {
      console.error("Error loading initial comparison metadata:", err);
      showMessage(`Failed to initialize: ${err.message || 'Unknown error'}`, "error");
    }
    setIsLoading(false);
  };

  // Core comparison engine: CUBOID Stock vs Our WH Stock for a single date
  const buildComparisonData = (
    cuboidRows: any[],
    invRows: any[],
    txnRows: any[],
    whSelection: string,
    whOpts: UnifiedWhOption[],
    pDict: AnyDict,
    targetDate: string,
    includeZeroRows: boolean
  ) => {
    const isSum = whSelection === 'ALL_SUM';
    const isSep = whSelection === 'ALL_SEP';

    const targetWhList = (isSum || isSep)
      ? whOpts
      : whOpts.filter(w => w.key === whSelection);

    const results: any[] = [];

    const compareScope = (
      scopeKey: string,
      whCodeLabel: string,
      whNameLabel: string,
      scopedCuboid: any[],
      scopedInv: any[],
      scopedTxns: any[]
    ) => {
      // 1. Aggregate CUBOID stock by normalized product code
      const cuboidMap: AnyDict = {};
      scopedCuboid.forEach(r => {
        const rawCode = String(r.product_code || '').trim();
        const pKey = normalizeProductKey(rawCode);
        if (!pKey) return;

        const qty = Number(r.quantity) || 0;
        const wCode = String(r.warehouse_code || '').trim();

        if (!cuboidMap[pKey]) {
          const whSet: BoolDict = {};
          if (wCode) whSet[wCode] = true;
          cuboidMap[pKey] = {
            code: rawCode,
            name: String(r.product_name || rawCode).trim(),
            qty,
            wh_codes_dict: whSet
          };
        } else {
          cuboidMap[pKey].qty += qty;
          if (wCode) cuboidMap[pKey].wh_codes_dict[wCode] = true;
        }
      });

      // 2. Aggregate Our WH stock (closing balance up to targetDate) by normalized product code
      const ourMap: AnyDict = {};

      const ensureOurProd = (productId: string) => {
        const prod = pDict[String(productId)];
        if (!prod) return null;
        const rawCode = String(prod.code || '').trim();
        const pKey = normalizeProductKey(rawCode);
        if (!pKey) return null;

        if (!ourMap[pKey]) {
          ourMap[pKey] = {
            code: rawCode,
            name: String(prod.name || rawCode).trim(),
            unit: prod.unit_type || '',
            status: prod.status || 'Active',
            qty: 0
          };
        }
        return ourMap[pKey];
      };

      scopedInv.forEach(inv => {
        ensureOurProd(inv.product_id);
      });

      scopedTxns.forEach(t => {
        const txnDateStr = extractYYYYMMDD(t.created_at);
        if (txnDateStr > targetDate) return;

        const rec = ensureOurProd(t.product_id);
        if (!rec) return;

        const qty = Number(t.quantity) || 0;
        if (t.transaction_type === 'IN' || t.transaction_type === 'RECEIVE') {
          rec.qty += qty;
        } else if (t.transaction_type === 'OUT' || t.transaction_type === 'DAMAGE') {
          rec.qty -= qty;
        }
      });

      // 3. Union of all product keys from both CUBOID and Our WH
      const allKeyDict: BoolDict = {};
      Object.keys(cuboidMap).forEach(k => { allKeyDict[k] = true; });
      Object.keys(ourMap).forEach(k => { allKeyDict[k] = true; });

      Object.keys(allKeyDict).forEach(pKey => {
        const cRec = cuboidMap[pKey];
        const oRec = ourMap[pKey];

        const hasCuboid = Boolean(cRec);
        const hasOur = Boolean(oRec);

        const cuboidQty = hasCuboid ? Number(cRec.qty) || 0 : 0;
        const ourQty = hasOur ? Number(oRec.qty) || 0 : 0;

        // Hide rows that are 0 on both sides unless "Show 0-Balance Items" is enabled
        if (!includeZeroRows && cuboidQty === 0 && ourQty === 0) {
          return;
        }

        const difference = ourQty - cuboidQty;
        let status = 'MATCHED';

        if (hasCuboid && !hasOur) {
          status = cuboidQty === 0 ? 'MATCHED' : 'MISSING_IN_OUR_WH';
        } else if (!hasCuboid && hasOur) {
          status = ourQty === 0 ? 'MATCHED' : 'MISSING_IN_CUBOID';
        } else {
          status = ourQty === cuboidQty ? 'MATCHED' : 'MISMATCHED';
        }

        const primaryCode = hasCuboid ? cRec.code : oRec.code;
        const displayProductName = hasOur ? oRec.name : cRec.name;

        results.push({
          row_key: `${scopeKey}__${pKey}`,
          date_str: targetDate,
          wh_code: whCodeLabel,
          wh_name: whNameLabel,
          cuboid_product_code: hasCuboid ? cRec.code : '-',
          cuboid_product_name: hasCuboid ? cRec.name : '-',
          wh_product_code: hasOur ? oRec.code : '-',
          wh_product_name: hasOur ? oRec.name : '-',
          has_cuboid: hasCuboid,
          has_our: hasOur,
          cuboid_stock: cuboidQty,
          our_wh_stock: ourQty,
          difference,
          status,
          sort_code: primaryCode,
          display_product_name: displayProductName
        });
      });
    };

    if (isSum) {
      // Combine all allowed warehouses
      const allowedDonorDict: BoolDict = {};
      const allowedSysIdDict: BoolDict = {};

      targetWhList.forEach(w => {
        if (w.system_wh_id) allowedSysIdDict[w.system_wh_id] = true;
        w.donor_codes.forEach(dc => {
          allowedDonorDict[normalizeWhCode(dc)] = true;
        });
      });

      const scopedCuboid = cuboidRows.filter(r => allowedDonorDict[normalizeWhCode(r.warehouse_code)]);
      const scopedInv = invRows.filter(r => allowedSysIdDict[String(r.warehouse_id)]);
      const scopedTxns = txnRows.filter(r => allowedSysIdDict[String(r.warehouse_id)]);

      compareScope(
        'ALL_SUM',
        'ALL',
        'All Warehouses (Sum)',
        scopedCuboid,
        scopedInv,
        scopedTxns
      );
    } else {
      // Specific warehouse OR All Warehouses (Separate)
      targetWhList.forEach(wh => {
        const whDonorDict: BoolDict = {};
        wh.donor_codes.forEach(dc => {
          whDonorDict[normalizeWhCode(dc)] = true;
        });

        const scopedCuboid = cuboidRows.filter(r => whDonorDict[normalizeWhCode(r.warehouse_code)]);
        const scopedInv = wh.system_wh_id
          ? invRows.filter(r => String(r.warehouse_id) === wh.system_wh_id)
          : [];
        const scopedTxns = wh.system_wh_id
          ? txnRows.filter(r => String(r.warehouse_id) === wh.system_wh_id)
          : [];

        if (scopedCuboid.length === 0 && scopedInv.length === 0 && scopedTxns.length === 0) {
          return;
        }

        compareScope(
          wh.key,
          wh.code,
          wh.name,
          scopedCuboid,
          scopedInv,
          scopedTxns
        );
      });
    }

    // Sort by Warehouse Code, then Product Code (natural numeric order)
    results.sort((a, b) => {
      const whCmp = String(a.wh_code || '').localeCompare(String(b.wh_code || ''), undefined, { numeric: true });
      if (whCmp !== 0) return whCmp;
      return String(a.sort_code || '').localeCompare(String(b.sort_code || ''), undefined, { numeric: true });
    });

    setComparisonData(results);
    setSelectedProducts([]);
  };

  const loadComparisonData = async (
    targetDate: string,
    targetWh: string,
    currentWhOpts = warehouseOptions,
    currentProdDict = productsById,
    includeZero = showZeroRows
  ) => {
    if (!targetDate) {
      showMessage("Please select a date first.", "error");
      return;
    }

    setIsLoading(true);
    try {
      const sysWhIds = currentWhOpts
        .map(w => w.system_wh_id)
        .filter((id): id is string => Boolean(id));

      const [cuboidRows, invRows, txnRows] = await Promise.all([
        fetchAllCuboidForDate(targetDate),
        fetchAllInventory(sysWhIds),
        fetchAllTransactionsUpToDate(sysWhIds, targetDate)
      ]);

      setRawCuboidRows(cuboidRows);
      setRawInvRows(invRows);
      setRawTxnRows(txnRows);

      buildComparisonData(
        cuboidRows,
        invRows,
        txnRows,
        targetWh,
        currentWhOpts,
        currentProdDict,
        targetDate,
        includeZero
      );

      if (cuboidRows.length === 0 && txnRows.length === 0) {
        showMessage(`No CUBOID or internal stock found for ${formatDisplayDate(targetDate)}.`, "error");
      }
    } catch (err: any) {
      console.error("Error loading comparison data:", err);
      showMessage(`Error loading data: ${err.message || 'Unknown error'}`, "error");
    }
    setIsLoading(false);
  };

  const handleApplyFilters = () => {
    loadComparisonData(stockDate, selectedWh);
  };

  const handleQuickDateClick = (dateStr: string) => {
    setStockDate(dateStr);
    loadComparisonData(dateStr, selectedWh);
  };

  const handleWarehouseChange = (nextWh: string) => {
    setSelectedWh(nextWh);
    buildComparisonData(
      rawCuboidRows,
      rawInvRows,
      rawTxnRows,
      nextWh,
      warehouseOptions,
      productsById,
      stockDate,
      showZeroRows
    );
  };

  const handleToggleZeroRows = (checked: boolean) => {
    setShowZeroRows(checked);
    buildComparisonData(
      rawCuboidRows,
      rawInvRows,
      rawTxnRows,
      selectedWh,
      warehouseOptions,
      productsById,
      stockDate,
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
    setFilterSearch('');
    setFilterProductCode('');
    setFilterStatus('ALL');
  };

  const hasActiveTableFilters =
    selectedProducts.length > 0 ||
    filterSearch.trim() !== '' ||
    filterProductCode.trim() !== '' ||
    filterStatus !== 'ALL';

  const getStatusLabel = (status: string): string => {
    if (status === 'MATCHED') return 'Matched';
    if (status === 'MISMATCHED') return 'Mismatched';
    if (status === 'MISSING_IN_OUR_WH') return 'Missing in Our WH';
    if (status === 'MISSING_IN_CUBOID') return 'Missing in CUBOID';
    return status;
  };

  // Client-side filtering
  const filteredData = comparisonData.filter(item => {
    const matchSelectedProd =
      selectedProducts.length === 0 || selectedProducts.includes(item.display_product_name);

    const q = filterSearch.trim().toLowerCase();
    const matchSearch =
      !q ||
      String(item.cuboid_product_name || '').toLowerCase().includes(q) ||
      String(item.wh_product_name || '').toLowerCase().includes(q) ||
      String(item.wh_name || '').toLowerCase().includes(q) ||
      String(item.wh_code || '').toLowerCase().includes(q);

    const codeQueries = filterProductCode
      .toLowerCase()
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const matchCode =
      codeQueries.length === 0 ||
      codeQueries.some(
        c =>
          String(item.cuboid_product_code || '').toLowerCase().includes(c) ||
          String(item.wh_product_code || '').toLowerCase().includes(c)
      );

    let matchStatus = true;
    if (filterStatus === 'ISSUES_ONLY') matchStatus = item.status !== 'MATCHED';
    else if (filterStatus !== 'ALL') matchStatus = item.status === filterStatus;

    return matchSelectedProd && matchSearch && matchCode && matchStatus;
  });

  // Live filtered summary counts
  let matchedCount = 0;
  let mismatchedCount = 0;
  let missingInCuboidCount = 0;
  let missingInOurWhCount = 0;
  let totalCuboidQty = 0;
  let totalOurWhQty = 0;

  filteredData.forEach(item => {
    if (item.status === 'MATCHED') matchedCount++;
    else if (item.status === 'MISMATCHED') mismatchedCount++;
    else if (item.status === 'MISSING_IN_CUBOID') missingInCuboidCount++;
    else if (item.status === 'MISSING_IN_OUR_WH') missingInOurWhCount++;

    totalCuboidQty += Number(item.cuboid_stock) || 0;
    totalOurWhQty += Number(item.our_wh_stock) || 0;
  });

  const totalNetDiff = totalOurWhQty - totalCuboidQty;
  const formattedDate = formatDisplayDate(stockDate);

  // Interactive Excel Export (All 12 columns, Row 1 Header, AutoFilter, Zebra Rows, Cell Borders, Text Wrap, SUBTOTAL)
  const handleExportExcel = async () => {
    if (filteredData.length === 0) return;
    setIsExportingExcel(true);

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'NGO Distribution System';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('Stock Comparison', {
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
        top: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        right: { style: 'thin', color: { argb: 'FF334155' } }
      };

      sheet.columns = [
        { key: 'sl', width: 6 },
        { key: 'date', width: 13 },
        { key: 'wh_code', width: 14 },
        { key: 'wh_name', width: 32 },
        { key: 'cuboid_code', width: 18 },
        { key: 'cuboid_name', width: 32 },
        { key: 'wh_prod_code', width: 16 },
        { key: 'wh_prod_name', width: 32 },
        { key: 'cuboid_stock', width: 15 },
        { key: 'our_wh_stock', width: 15 },
        { key: 'difference', width: 14 },
        { key: 'status', width: 20 }
      ];

      // Row 1: Direct Table Header
      const headerRow = sheet.addRow([
        'SL',
        'Date',
        'Warehouse Code',
        'Warehouse Name',
        'CUBOID Product Code',
        'CUBOID Product Name',
        'WH Product Code',
        'WH Product Name',
        'CUBOID Stock',
        'Our WH Stock',
        'Difference',
        'Status'
      ]);
      headerRow.height = 32;

      headerRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
        let headerBg = 'FF1E293B';
        if (colNumber === 5 || colNumber === 6 || colNumber === 9) headerBg = 'FF059669';
        else if (colNumber === 7 || colNumber === 8 || colNumber === 10) headerBg = 'FF4F46E5';
        else if (colNumber === 11 || colNumber === 12) headerBg = 'FF0F172A';

        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBg } };
        cell.border = headerBorder;
        cell.alignment = {
          vertical: 'middle',
          horizontal:
            colNumber === 4 || colNumber === 6 || colNumber === 8
              ? 'left'
              : colNumber >= 9 && colNumber <= 11
              ? 'right'
              : 'center',
          wrapText: true
        };
      });

      const firstDataRowIdx = 2;
      filteredData.forEach((item, idx) => {
        const currentRowNum = firstDataRowIdx + idx;
        const cuboidVal = Number(item.cuboid_stock) || 0;
        const ourVal = Number(item.our_wh_stock) || 0;
        const diffVal = ourVal - cuboidVal;
        const statusText = getStatusLabel(item.status);

        const dataRow = sheet.addRow([
          idx + 1,
          formattedDate,
          String(item.wh_code || ''),
          String(item.wh_name || ''),
          String(item.cuboid_product_code || '-'),
          String(item.cuboid_product_name || '-'),
          String(item.wh_product_code || '-'),
          String(item.wh_product_name || '-'),
          cuboidVal,
          ourVal,
          { formula: `J${currentRowNum}-I${currentRowNum}`, result: diffVal },
          statusText
        ]);

        const whLines = Math.ceil(String(item.wh_name || '').length / 28);
        const cLines = Math.ceil(String(item.cuboid_product_name || '').length / 28);
        const oLines = Math.ceil(String(item.wh_product_name || '').length / 28);
        const maxLines = Math.max(1, whLines, cLines, oLines);
        dataRow.height = Math.max(24, maxLines * 16 + 8);

        const isEven = idx % 2 === 0;
        const baseBg = isEven ? 'FFFFFFFF' : 'FFF1F5F9';
        const cuboidBg = isEven ? 'FFF0FDF4' : 'FFDCFCE7';
        const ourBg = isEven ? 'FFEEF2FF' : 'FFE0E7FF';

        let statusBg = 'FFECFDF5';
        let statusColor = 'FF047857';
        if (item.status === 'MISMATCHED') {
          statusBg = 'FFFFF1F2';
          statusColor = 'FFBE123C';
        } else if (item.status === 'MISSING_IN_CUBOID') {
          statusBg = 'FFFFFBEB';
          statusColor = 'FFB45309';
        } else if (item.status === 'MISSING_IN_OUR_WH') {
          statusBg = 'FFFAF5FF';
          statusColor = 'FF7E22CE';
        }

        dataRow.eachCell((cell, colNumber) => {
          cell.border = thinBorder;

          let bg = baseBg;
          if (colNumber === 9) bg = cuboidBg;
          else if (colNumber === 10) bg = ourBg;
          else if (colNumber === 11) bg = diffVal === 0 ? baseBg : diffVal > 0 ? 'FFFFFBEB' : 'FFFFF1F2';
          else if (colNumber === 12) bg = statusBg;

          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };

          if (colNumber === 1 || colNumber === 2) {
            cell.font = { name: 'Calibri', size: 10, bold: colNumber === 2, color: { argb: 'FF475569' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          } else if (colNumber === 3 || colNumber === 5 || colNumber === 7) {
            cell.font = { name: 'Consolas', size: 10, bold: true, color: { argb: 'FF334155' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          } else if (colNumber === 4) {
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E293B' } };
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
          } else if (colNumber === 6 || colNumber === 8) {
            const isMissing = String(cell.value) === '-';
            cell.font = {
              name: 'Calibri',
              size: 10,
              bold: !isMissing,
              color: { argb: isMissing ? 'FF94A3B8' : 'FF0F172A' }
            };
            cell.alignment = { vertical: 'middle', horizontal: isMissing ? 'center' : 'left', wrapText: true };
          } else if (colNumber === 9) {
            cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF047857' } };
            cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
            cell.numFmt = '#,##0';
          } else if (colNumber === 10) {
            cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF3730A3' } };
            cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
            cell.numFmt = '#,##0';
          } else if (colNumber === 11) {
            const diffColor = diffVal === 0 ? 'FF64748B' : diffVal > 0 ? 'FFB45309' : 'FFBE123C';
            cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: diffColor } };
            cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
            cell.numFmt = '+#,##0;-#,##0;0';
          } else if (colNumber === 12) {
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: statusColor } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          }
        });
      });

      const lastDataRowIdx = firstDataRowIdx + filteredData.length - 1;

      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: lastDataRowIdx, column: 12 }
      };

      const totalRow = sheet.addRow([
        'TOTAL',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        { formula: `SUBTOTAL(9,I${firstDataRowIdx}:I${lastDataRowIdx})`, result: totalCuboidQty },
        { formula: `SUBTOTAL(9,J${firstDataRowIdx}:J${lastDataRowIdx})`, result: totalOurWhQty },
        { formula: `SUBTOTAL(9,K${firstDataRowIdx}:K${lastDataRowIdx})`, result: totalNetDiff },
        ''
      ]);
      const totalRowNum = totalRow.number;
      sheet.mergeCells(`A${totalRowNum}:H${totalRowNum}`);
      totalRow.height = 28;

      const totalLabel = sheet.getCell(`A${totalRowNum}`);
      totalLabel.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      totalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      totalLabel.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
      totalLabel.border = headerBorder;

      const totalCuboidCell = sheet.getCell(`I${totalRowNum}`);
      totalCuboidCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF34D399' } };
      totalCuboidCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      totalCuboidCell.alignment = { vertical: 'middle', horizontal: 'right' };
      totalCuboidCell.numFmt = '#,##0';
      totalCuboidCell.border = headerBorder;

      const totalOurCell = sheet.getCell(`J${totalRowNum}`);
      totalOurCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF818CF8' } };
      totalOurCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      totalOurCell.alignment = { vertical: 'middle', horizontal: 'right' };
      totalOurCell.numFmt = '#,##0';
      totalOurCell.border = headerBorder;

      const totalDiffCell = sheet.getCell(`K${totalRowNum}`);
      totalDiffCell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: totalNetDiff === 0 ? 'FF34D399' : totalNetDiff > 0 ? 'FFFBBF24' : 'FFFB7185' }
      };
      totalDiffCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      totalDiffCell.alignment = { vertical: 'middle', horizontal: 'right' };
      totalDiffCell.numFmt = '+#,##0;-#,##0;0';
      totalDiffCell.border = headerBorder;

      const totalStatusCell = sheet.getCell(`L${totalRowNum}`);
      totalStatusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      totalStatusCell.border = headerBorder;

      const whFileLabel =
        selectedWh === 'ALL_SUM' || selectedWh === 'ALL_SEP'
          ? selectedWh
          : (warehouseOptions.find(w => w.key === selectedWh)?.code || 'WH');

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }),
        `CUBOID_vs_OurWH_${whFileLabel}_${stockDate}.xlsx`
      );
      showMessage("Comparison Excel exported successfully!", "success");
    } catch (err: any) {
      console.error("Excel Export Error:", err);
      showMessage(`Failed to export Excel: ${err.message || 'Unknown error'}`, "error");
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Landscape PDF Export (All 12 columns)
  const handleExportPDF = () => {
    if (filteredData.length === 0) return;

    const doc = new jsPDF('landscape');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(`CUBOID vs Our Warehouse Stock Comparison (${formattedDate})`, 14, 14);

    let whTitle = "All Warehouses (Sum)";
    if (selectedWh === 'ALL_SEP') whTitle = "All Warehouses (Separate)";
    else if (selectedWh !== 'ALL_SUM') {
      const found = warehouseOptions.find(w => w.key === selectedWh);
      whTitle = found ? `[${found.code}] ${found.name}` : selectedWh;
    }

    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Warehouse: ${whTitle}  |  Matched: ${matchedCount}  |  Mismatched: ${mismatchedCount}  |  Missing in CUBOID: ${missingInCuboidCount}  |  Missing in Our WH: ${missingInOurWhCount}`,
      14,
      20
    );

    const tableColumn = [
      "SL",
      "Date",
      "WH Code",
      "Warehouse Name",
      "CUBOID Code",
      "CUBOID Product",
      "WH Code",
      "WH Product",
      "CUBOID",
      "Our WH",
      "Diff",
      "Status"
    ];

    const tableRows = filteredData.map((item, idx) => {
      const diff = Number(item.difference) || 0;
      const diffStr = diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString();
      return [
        idx + 1,
        formattedDate,
        item.wh_code,
        item.wh_name,
        item.cuboid_product_code,
        item.cuboid_product_name,
        item.wh_product_code,
        item.wh_product_name,
        Number(item.cuboid_stock).toLocaleString(),
        Number(item.our_wh_stock).toLocaleString(),
        diffStr,
        getStatusLabel(item.status)
      ];
    });

    const totalDiffStr = totalNetDiff > 0 ? `+${totalNetDiff.toLocaleString()}` : totalNetDiff.toLocaleString();

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      foot: [[
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        `TOTAL (${filteredData.length})`,
        totalCuboidQty.toLocaleString(),
        totalOurWhQty.toLocaleString(),
        totalDiffStr,
        ''
      ]],
      startY: 25,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 9 },
        1: { halign: 'center', cellWidth: 18 },
        2: { halign: 'center', cellWidth: 14 },
        3: { halign: 'left', cellWidth: 34 },
        4: { halign: 'center', cellWidth: 17 },
        5: { halign: 'left', cellWidth: 34 },
        6: { halign: 'center', cellWidth: 15 },
        7: { halign: 'left', cellWidth: 34 },
        8: { halign: 'right', cellWidth: 16, fontStyle: 'bold', textColor: [4, 120, 87] },
        9: { halign: 'right', cellWidth: 16, fontStyle: 'bold', textColor: [55, 48, 163] },
        10: { halign: 'right', cellWidth: 15, fontStyle: 'bold' },
        11: { halign: 'center', cellWidth: 26, fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 11) {
          const val = String(data.cell.raw || '');
          if (val === 'Matched') data.cell.styles.textColor = [4, 120, 87];
          else if (val === 'Mismatched') data.cell.styles.textColor = [190, 18, 60];
          else if (val === 'Missing in CUBOID') data.cell.styles.textColor = [180, 83, 9];
          else if (val === 'Missing in Our WH') data.cell.styles.textColor = [126, 34, 206];
        }
      }
    });

    const whFileLabel =
      selectedWh === 'ALL_SUM' || selectedWh === 'ALL_SEP'
        ? selectedWh
        : (warehouseOptions.find(w => w.key === selectedWh)?.code || 'WH');

    doc.save(`CUBOID_vs_OurWH_${whFileLabel}_${stockDate}.pdf`);
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
            <h2 className="text-lg md:text-2xl font-bold text-slate-900 leading-tight truncate">
              CUBOID vs Our WH Stock
            </h2>
            <p className="text-[11px] md:text-xs text-slate-500 hidden sm:block">
              Side-by-side daily closing balance comparison linked by Warehouse Code &amp; Product Code
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

      <div className="flex-1 p-3 md:p-6 space-y-4 max-w-[1600px] w-full mx-auto">

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

        {/* 1. SINGLE COLUMN COMPACT FILTER BAR */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Linked Warehouse
              </label>
              <select
                value={selectedWh}
                onChange={(e) => handleWarehouseChange(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 focus:bg-white transition-colors cursor-pointer"
              >
                {warehouseOptions.map(w => (
                  <option key={w.key} value={w.key}>
                    [{w.code}] {w.name}{!w.system_wh_id ? ' (CUBOID Only)' : ''}
                  </option>
                ))}
                <option disabled>──────────</option>
                <option value="ALL_SUM">All Warehouses (Sum)</option>
                <option value="ALL_SEP">All Warehouses (Separate)</option>
              </select>
            </div>

            <div className="md:col-span-4">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Closing Date
              </label>
              <input
                type="date"
                value={stockDate}
                onChange={(e) => setStockDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 font-bold outline-none focus:border-indigo-500 focus:bg-white transition-colors cursor-pointer"
              />
            </div>

            <div className="md:col-span-3">
              <button
                onClick={handleApplyFilters}
                disabled={isLoading || !stockDate}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl shadow-sm transition-all text-xs md:text-sm disabled:opacity-50 flex justify-center items-center h-[42px]"
              >
                {isLoading ? <Icons.Spinner /> : <><Icons.Search /> <span className="ml-2">Compare Stock</span></>}
              </button>
            </div>
          </div>

          {/* Recent CUBOID Dates + Zero Rows Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-1.5">
              {recentDates.length > 0 && (
                <>
                  <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Recent CUBOID Dates:</span>
                  {recentDates.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleQuickDateClick(d)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                        stockDate === d
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
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

        {/* 2. SINGLE COLUMN THIN SUMMARY BAR (Non-overlapping) */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 px-4 md:px-5 py-3 rounded-2xl border border-slate-800 shadow-md text-white">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            {/* Left: Date */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="text-xs font-black text-emerald-400 uppercase tracking-wider whitespace-nowrap">
                Closing: {formattedDate || 'N/A'}
              </span>
              <span className="text-[11px] font-semibold bg-white/10 text-slate-200 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                Total: {filteredData.length}
              </span>
            </div>

            {/* Right: Status & Qty Metrics */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end gap-2 sm:gap-x-4 sm:gap-y-2">
              <div className="flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                <span className="text-[10px] text-emerald-400 font-bold uppercase">Matched</span>
                <span className="text-base font-black text-emerald-400">{matchedCount}</span>
              </div>

              <div className="hidden sm:block h-4 w-px bg-slate-700/80" />

              <div className="flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                <span className="text-[10px] text-rose-400 font-bold uppercase">Mismatched</span>
                <span className="text-base font-black text-rose-400">{mismatchedCount}</span>
              </div>

              <div className="hidden sm:block h-4 w-px bg-slate-700/80" />

              <div className="flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                <span className="text-[10px] text-amber-400 font-bold uppercase">Miss CUBOID</span>
                <span className="text-base font-black text-amber-400">{missingInCuboidCount}</span>
              </div>

              <div className="hidden sm:block h-4 w-px bg-slate-700/80" />

              <div className="flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                <span className="text-[10px] text-purple-400 font-bold uppercase">Miss Our WH</span>
                <span className="text-base font-black text-purple-400">{missingInOurWhCount}</span>
              </div>

              <div className="hidden sm:block h-4 w-px bg-slate-700/80" />

              <div className="flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                <span className="text-[10px] text-emerald-300 font-bold uppercase">CUBOID</span>
                <span className="text-base font-black text-emerald-300">{totalCuboidQty.toLocaleString()}</span>
              </div>

              <div className="hidden sm:block h-4 w-px bg-slate-700/80" />

              <div className="flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                <span className="text-[10px] text-indigo-300 font-bold uppercase">Our WH</span>
                <span className="text-base font-black text-indigo-300">{totalOurWhQty.toLocaleString()}</span>
              </div>

              <div className="hidden sm:block h-4 w-px bg-slate-700/80" />

              <div className="col-span-2 sm:col-span-1 flex items-baseline justify-between sm:justify-start gap-1.5 bg-white/5 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg whitespace-nowrap">
                <span className="text-[10px] text-slate-300 font-bold uppercase">Diff</span>
                <span
                  className={`text-base font-black ${
                    totalNetDiff === 0 ? 'text-emerald-400' : totalNetDiff > 0 ? 'text-amber-400' : 'text-rose-400'
                  }`}
                >
                  {totalNetDiff > 0 ? `+${totalNetDiff.toLocaleString()}` : totalNetDiff.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. COMPARISON TABLE CARD */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col w-full">

          {/* Filter Toolbar */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-xs md:text-sm uppercase tracking-wide flex items-center">
                  <span className="text-base mr-2">⚖️</span> Stock Comparison Details
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Difference = Our WH Stock − CUBOID Stock</p>
              </div>
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
                    {selectedProducts.length === 0 ? "All Products" : `${selectedProducts.length} Selected`}
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

              {/* Search Product / Warehouse */}
              <input
                type="text"
                placeholder="Search Product / WH..."
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                className="w-full xl:w-44 px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-700 shadow-xs"
              />

              {/* Search Product Code */}
              <input
                type="text"
                placeholder="Code (e.g. 2303, 0035)..."
                value={filterProductCode}
                onChange={e => setFilterProductCode(e.target.value)}
                className="w-full xl:w-44 px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-700 shadow-xs"
              />

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full xl:w-44 px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-700 shadow-xs cursor-pointer"
              >
                <option value="ALL">All Status</option>
                <option value="ISSUES_ONLY">All Issues (≠ Matched)</option>
                <option value="MATCHED">Matched</option>
                <option value="MISMATCHED">Mismatched</option>
                <option value="MISSING_IN_CUBOID">Missing in CUBOID</option>
                <option value="MISSING_IN_OUR_WH">Missing in Our WH</option>
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
              <span className="text-4xl opacity-30 mb-2">📊</span>
              <p className="text-sm font-bold text-slate-500">
                No comparison records found for <span className="text-slate-900">{formattedDate}</span>.
              </p>
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE (Fits 100% Within 1 Screen — Zero Horizontal Scroll) */}
              <div className="hidden lg:block w-full">
                <table className="w-full table-fixed text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-600 uppercase tracking-wider">
                      <th className="py-3 px-2 w-[8%] text-center border-r border-slate-200/70">SL / Date</th>
                      <th className="py-3 px-2.5 w-[15%] border-r border-slate-200/70">Warehouse</th>
                      <th className="py-3 px-2.5 w-[19%] border-r border-slate-200/70 bg-emerald-50/70 text-emerald-900">
                        CUBOID Product
                      </th>
                      <th className="py-3 px-2.5 w-[19%] border-r border-slate-200/70 bg-indigo-50/70 text-indigo-900">
                        Our WH Product
                      </th>
                      <th className="py-3 px-2.5 w-[9%] text-right border-r border-slate-200/70 bg-emerald-100/60 text-emerald-900">
                        CUBOID
                      </th>
                      <th className="py-3 px-2.5 w-[9%] text-right border-r border-slate-200/70 bg-indigo-100/60 text-indigo-900">
                        Our WH
                      </th>
                      <th className="py-3 px-2.5 w-[10%] text-right border-r border-slate-200/70 bg-slate-200/70 text-slate-800">
                        Diff
                      </th>
                      <th className="py-3 px-2 w-[11%] text-center bg-slate-200/70 text-slate-800">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70">
                    {filteredData.map((item, idx) => {
                      const diff = Number(item.difference) || 0;
                      return (
                        <tr
                          key={`${item.row_key}-${idx}`}
                          className={`${
                            idx % 2 === 0 ? 'bg-white' : 'bg-slate-100/60'
                          } hover:bg-indigo-50/40 transition-colors`}
                        >
                          {/* SL + Date */}
                          <td className="py-2.5 px-2 text-center border-r border-slate-200/50 align-middle">
                            <p className="text-xs font-black text-slate-500 leading-none">{idx + 1}</p>
                            <p className="text-[10px] font-semibold text-slate-400 mt-1 whitespace-nowrap">
                              {formattedDate}
                            </p>
                          </td>

                          {/* Warehouse Code + Name */}
                          <td className="py-2.5 px-2.5 border-r border-slate-200/50 align-middle">
                            <span className="inline-block text-[10px] font-mono font-bold text-slate-700 bg-white border border-slate-200 px-1.5 py-0.5 rounded mb-1">
                              {item.wh_code}
                            </span>
                            <p className="text-xs font-bold text-slate-800 leading-snug break-words">
                              {item.wh_name}
                            </p>
                          </td>

                          {/* CUBOID Code + Product Name */}
                          <td className="py-2.5 px-2.5 border-r border-slate-200/50 bg-emerald-50/20 align-middle">
                            {item.has_cuboid ? (
                              <>
                                <span className="inline-block text-[10px] font-mono font-bold text-emerald-800 bg-white border border-emerald-200 px-1.5 py-0.5 rounded mb-1">
                                  {item.cuboid_product_code}
                                </span>
                                <p className="text-xs font-bold text-slate-900 leading-snug break-words">
                                  {item.cuboid_product_name}
                                </p>
                              </>
                            ) : (
                              <span className="text-xs font-bold text-slate-300">-</span>
                            )}
                          </td>

                          {/* Our WH Code + Product Name */}
                          <td className="py-2.5 px-2.5 border-r border-slate-200/50 bg-indigo-50/20 align-middle">
                            {item.has_our ? (
                              <>
                                <span className="inline-block text-[10px] font-mono font-bold text-indigo-800 bg-white border border-indigo-200 px-1.5 py-0.5 rounded mb-1">
                                  {item.wh_product_code}
                                </span>
                                <p className="text-xs font-bold text-slate-900 leading-snug break-words">
                                  {item.wh_product_name}
                                </p>
                              </>
                            ) : (
                              <span className="text-xs font-bold text-slate-300">-</span>
                            )}
                          </td>

                          {/* CUBOID Stock */}
                          <td className="py-2.5 px-2.5 text-right border-r border-slate-200/50 bg-emerald-50/35 align-middle">
                            <span
                              className={`text-xs xl:text-sm font-black whitespace-nowrap ${
                                item.has_cuboid ? 'text-emerald-700' : 'text-slate-400'
                              }`}
                            >
                              {Number(item.cuboid_stock).toLocaleString()}
                            </span>
                          </td>

                          {/* Our WH Stock */}
                          <td className="py-2.5 px-2.5 text-right border-r border-slate-200/50 bg-indigo-50/35 align-middle">
                            <span
                              className={`text-xs xl:text-sm font-black whitespace-nowrap ${
                                item.our_wh_stock < 0
                                  ? 'text-rose-600'
                                  : item.has_our
                                  ? 'text-indigo-700'
                                  : 'text-slate-400'
                              }`}
                            >
                              {Number(item.our_wh_stock).toLocaleString()}
                            </span>
                          </td>

                          {/* Difference */}
                          <td className="py-2.5 px-2 text-right border-r border-slate-200/50 align-middle">
                            {diff === 0 ? (
                              <span className="text-xs font-bold text-slate-400">0</span>
                            ) : (
                              <span
                                className={`inline-block text-[11px] xl:text-xs font-black px-1.5 py-0.5 rounded-md border whitespace-nowrap ${
                                  diff > 0
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                {diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-2.5 px-2 text-center align-middle">
                            {item.status === 'MATCHED' && (
                              <span className="inline-block text-[9px] xl:text-[10px] font-black bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-1 rounded-md uppercase leading-tight">
                                Matched
                              </span>
                            )}
                            {item.status === 'MISMATCHED' && (
                              <span className="inline-block text-[9px] xl:text-[10px] font-black bg-rose-50 border border-rose-200 text-rose-700 px-2 py-1 rounded-md uppercase leading-tight">
                                Mismatched
                              </span>
                            )}
                            {item.status === 'MISSING_IN_CUBOID' && (
                              <span className="inline-block text-[9px] xl:text-[10px] font-black bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded-md uppercase leading-tight">
                                Missing CUBOID
                              </span>
                            )}
                            {item.status === 'MISSING_IN_OUR_WH' && (
                              <span className="inline-block text-[9px] xl:text-[10px] font-black bg-purple-50 border border-purple-200 text-purple-700 px-2 py-1 rounded-md uppercase leading-tight">
                                Missing Our WH
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900 text-white font-bold">
                      <td colSpan={4} className="py-3 px-4 text-right text-xs uppercase tracking-wider text-slate-300">
                        Total ({filteredData.length} Items)
                      </td>
                      <td className="py-3 px-2.5 text-right text-xs xl:text-sm font-black text-emerald-400 whitespace-nowrap">
                        {totalCuboidQty.toLocaleString()}
                      </td>
                      <td className="py-3 px-2.5 text-right text-xs xl:text-sm font-black text-indigo-300 whitespace-nowrap">
                        {totalOurWhQty.toLocaleString()}
                      </td>
                      <td
                        className={`py-3 px-2.5 text-right text-xs xl:text-sm font-black whitespace-nowrap ${
                          totalNetDiff === 0 ? 'text-emerald-400' : totalNetDiff > 0 ? 'text-amber-400' : 'text-rose-400'
                        }`}
                      >
                        {totalNetDiff > 0 ? `+${totalNetDiff.toLocaleString()}` : totalNetDiff.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-center text-[10px] text-slate-400 uppercase">Summary</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* MOBILE & TABLET CARD LIST */}
              <div className="lg:hidden flex flex-col divide-y divide-slate-200">
                {filteredData.map((item, idx) => {
                  const diff = Number(item.difference) || 0;
                  return (
                    <div
                      key={`${item.row_key}-${idx}`}
                      className={`p-3.5 space-y-2.5 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100/70'}`}
                    >
                      {/* Top row: SL, Date, WH & Status */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-black text-slate-400">#{idx + 1}</span>
                          <span className="text-[10px] font-bold text-slate-500">{formattedDate}</span>
                          <span className="text-[10px] font-mono font-bold bg-white border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                            WH: {item.wh_code}
                          </span>
                        </div>
                        <div className="shrink-0">
                          {item.status === 'MATCHED' && (
                            <span className="text-[9px] font-black bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-md uppercase">
                              Matched
                            </span>
                          )}
                          {item.status === 'MISMATCHED' && (
                            <span className="text-[9px] font-black bg-rose-50 border border-rose-200 text-rose-700 px-2 py-0.5 rounded-md uppercase">
                              Mismatched
                            </span>
                          )}
                          {item.status === 'MISSING_IN_CUBOID' && (
                            <span className="text-[9px] font-black bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-md uppercase">
                              Missing in CUBOID
                            </span>
                          )}
                          {item.status === 'MISSING_IN_OUR_WH' && (
                            <span className="text-[9px] font-black bg-purple-50 border border-purple-200 text-purple-700 px-2 py-0.5 rounded-md uppercase">
                              Missing in Our WH
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Warehouse Name */}
                      <p className="text-[11px] font-bold text-slate-600 truncate">🏢 {item.wh_name}</p>

                      {/* Side-by-side CUBOID vs Our WH Product Info */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="bg-emerald-50/50 border border-emerald-200/70 rounded-xl p-2.5">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[9px] font-black text-emerald-800 uppercase">CUBOID Product</span>
                            <span className="text-[10px] font-mono font-bold text-emerald-700">
                              {item.cuboid_product_code}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-900 leading-snug break-words">
                            {item.cuboid_product_name}
                          </p>
                        </div>

                        <div className="bg-indigo-50/50 border border-indigo-200/70 rounded-xl p-2.5">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[9px] font-black text-indigo-800 uppercase">Our WH Product</span>
                            <span className="text-[10px] font-mono font-bold text-indigo-700">
                              {item.wh_product_code}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-900 leading-snug break-words">
                            {item.wh_product_name}
                          </p>
                        </div>
                      </div>

                      {/* Quantities & Difference */}
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl px-2 py-1.5 text-center">
                          <span className="block text-[9px] font-bold text-emerald-800 uppercase">CUBOID</span>
                          <span className="text-sm font-black text-emerald-700">
                            {Number(item.cuboid_stock).toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-indigo-50 border border-indigo-200/80 rounded-xl px-2 py-1.5 text-center">
                          <span className="block text-[9px] font-bold text-indigo-800 uppercase">Our WH</span>
                          <span className="text-sm font-black text-indigo-700">
                            {Number(item.our_wh_stock).toLocaleString()}
                          </span>
                        </div>
                        <div
                          className={`rounded-xl px-2 py-1.5 text-center border ${
                            diff === 0
                              ? 'bg-slate-50 border-slate-200 text-slate-500'
                              : diff > 0
                              ? 'bg-amber-50 border-amber-200 text-amber-700'
                              : 'bg-rose-50 border-rose-200 text-rose-700'
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
                    <span className="block text-[9px] font-bold text-emerald-400 uppercase">Total CUBOID</span>
                    <span className="text-sm font-black text-emerald-400">{totalCuboidQty.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-indigo-300 uppercase">Total Our WH</span>
                    <span className="text-sm font-black text-indigo-300">{totalOurWhQty.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-300 uppercase">Net Diff</span>
                    <span
                      className={`text-sm font-black ${
                        totalNetDiff === 0 ? 'text-emerald-400' : totalNetDiff > 0 ? 'text-amber-400' : 'text-rose-400'
                      }`}
                    >
                      {totalNetDiff > 0 ? `+${totalNetDiff.toLocaleString()}` : totalNetDiff.toLocaleString()}
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