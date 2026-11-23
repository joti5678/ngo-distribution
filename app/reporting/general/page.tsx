"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from '../../components/Icons';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const GLOBAL_CONFIG_ID = 'general_matrix_report';

const hexToRgb = (hex: string): [number, number, number] => {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const normalized = (hex || '#ffffff').replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [255, 255, 255];
};

const REPORT_COLUMNS = [
  { key: 'opening', name: 'Opening Balance' },
  { key: 'rcv_unhcr', name: 'Received from UNHCR' },
  { key: 'rcv_contingency', name: 'Recived from Contingency Stock' },
  { key: 'rcv_camp', name: 'Received other camp' },
  { key: 'shortage', name: 'Shortage & Gap' },
  { key: 'issue_beneficiary', name: 'Issued for Beneficiary' },
  { key: 'issue_camp', name: 'Issued other camp' },
  { key: 'issue_contingency', name: 'Issued to Contingency Stock' },
  { key: 'issue_inst', name: 'Issued other Inst.' },
  { key: 'hh', name: 'HHs' },
  { key: 'closing', name: 'Closing Balance' }
];

interface HeaderColorItem {
  bg: string;
  text: string;
}

interface HeaderThemeDict {
  [key: string]: HeaderColorItem;
}

interface SectionThemeConfig {
  master: string;
  accumulated: string;
  dps: string[];
}

interface BoolDict {
  [colKey: string]: boolean;
}

interface ProductColDict {
  [productId: string]: BoolDict;
}

interface GroupDict {
  [groupName: string]: string[];
}

interface MatrixRowDict {
  [productId: string]: any;
}

interface MatrixDict {
  [dpId: string]: MatrixRowDict;
}

const DEFAULT_HEADER_COLORS: HeaderThemeDict = {
  'opening': { bg: '#ea580c', text: '#ffffff' },
  'rcv_unhcr': { bg: '#7e22ce', text: '#ffffff' },
  'rcv_contingency': { bg: '#7e22ce', text: '#ffffff' },
  'rcv_camp': { bg: '#7e22ce', text: '#ffffff' },
  'shortage': { bg: '#fef08a', text: '#000000' },
  'issue_beneficiary': { bg: '#fef08a', text: '#000000' },
  'issue_camp': { bg: '#7e22ce', text: '#ffffff' },
  'issue_contingency': { bg: '#7e22ce', text: '#ffffff' },
  'issue_inst': { bg: '#7e22ce', text: '#ffffff' },
  'hh': { bg: '#fef08a', text: '#000000' },
  'closing': { bg: '#ea580c', text: '#ffffff' }
};

const DEFAULT_SECTION_COLORS: SectionThemeConfig = {
  master: '#f1f5f9',
  accumulated: '#ffe4e6',
  dps: ['#eff6ff', '#fef9c3', '#f0fdf4', '#faf5ff', '#fff7ed', '#f8fafc']
};

const mergeHeaderTheme = (raw: any): HeaderThemeDict => {
  const merged: HeaderThemeDict = { ...DEFAULT_HEADER_COLORS };
  if (raw && typeof raw === 'object') {
    REPORT_COLUMNS.forEach(col => {
      if (raw[col.key]?.bg && raw[col.key]?.text) {
        merged[col.key] = { bg: raw[col.key].bg, text: raw[col.key].text };
      }
    });
  }
  return merged;
};

const mergeSectionTheme = (raw: any): SectionThemeConfig => {
  if (!raw || typeof raw !== 'object') return DEFAULT_SECTION_COLORS;
  return {
    master: typeof raw.master === 'string' && raw.master ? raw.master : DEFAULT_SECTION_COLORS.master,
    accumulated: typeof raw.accumulated === 'string' && raw.accumulated ? raw.accumulated : DEFAULT_SECTION_COLORS.accumulated,
    dps: Array.isArray(raw.dps) && raw.dps.length > 0 ? raw.dps : DEFAULT_SECTION_COLORS.dps
  };
};

export default function GeneralReportingBuilder() {
  const [products, setProducts] = useState<any[]>([]);
  const [allDps, setAllDps] = useState<any[]>([]);
  const [canvasDps, setCanvasDps] = useState<any[]>([]);
  const [selectedAvailableDps, setSelectedAvailableDps] = useState<string[]>([]);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingData, setIsProcessingData] = useState(false);
  const [isSavingGlobal, setIsSavingGlobal] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  const [rawTxns, setRawTxns] = useState<any[]>([]);
  const [rawDists, setRawDists] = useState<any[]>([]);
  const [matrixData, setMatrixData] = useState<MatrixDict>({});

  // Theme & Settings States (Global via Supabase)
  const [headerTheme, setHeaderTheme] = useState<HeaderThemeDict>(DEFAULT_HEADER_COLORS);
  const [sectionTheme, setSectionTheme] = useState<SectionThemeConfig>(DEFAULT_SECTION_COLORS);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

  const [reportSettings, setReportSettings] = useState({ hideZeroes: true });
  const [productColSettings, setProductColSettings] = useState<ProductColDict>({});
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Custom DP Grouping States (Global via Supabase)
  const [savedDpGroups, setSavedDpGroups] = useState<GroupDict>({});
  const [newGroupName, setNewGroupName] = useState('');
  const [groupTab, setGroupTab] = useState<'load' | 'save'>('load');
  const [selectedGroupSelect, setSelectedGroupSelect] = useState('');

  // Delete Group Modal States
  const [isDeleteGroupModalOpen, setIsDeleteGroupModalOpen] = useState(false);
  const [deleteGroupStep, setDeleteGroupStep] = useState(1);
  const [groupToDelete, setGroupToDelete] = useState('');

  const showNotice = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg({ text: '', type: '' }), 4000);
  };

  // Persist partial or full global configuration to Supabase
  const persistGlobalConfig = async (payload: {
    dp_groups?: GroupDict;
    report_settings?: { hideZeroes: boolean };
    product_columns?: ProductColDict;
    header_theme?: HeaderThemeDict;
    section_theme?: SectionThemeConfig;
  }) => {
    setIsSavingGlobal(true);
    try {
      const { error } = await supabase
        .from('report_builder_settings')
        .upsert(
          {
            id: GLOBAL_CONFIG_ID,
            ...payload,
            updated_by: currentUserEmail,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'id' }
        );

      if (error) throw error;
      return true;
    } catch (err: any) {
      console.error('Error saving global settings to DB:', err);
      showNotice(`Failed to save globally: ${err.message || 'Check report_builder_settings table'}`, 'error');
      return false;
    } finally {
      setIsSavingGlobal(false);
    }
  };

  // INITIAL LOAD
  useEffect(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayStr = new Date(firstDay.getTime() - (firstDay.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const todayStr = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    setStartDate(firstDayStr);
    setEndDate(todayStr);

    fetchMasterData();
  }, []);

  useEffect(() => {
    if (canvasDps.length > 0 && startDate && endDate && products.length > 0) {
      fetchAndCalculateData();
    } else {
      setMatrixData({});
    }
  }, [canvasDps, startDate, endDate, products]);

  const fetchMasterData = async () => {
    setIsLoading(true);
    try {
      const [authRes, prodRes, dpRes, globalCfgRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('products').select('*').eq('status', 'Active').order('sort_order', { ascending: true }).order('name', { ascending: true }),
        supabase.from('distribution_points').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true }),
        supabase.from('report_builder_settings').select('*').eq('id', GLOBAL_CONFIG_ID).maybeSingle()
      ]);

      const userEmail = authRes.data?.user?.email || null;
      if (userEmail) setCurrentUserEmail(userEmail);

      const prodData = prodRes.data || [];
      const dpData = dpRes.data || [];
      const dbConfig = globalCfgRes.data;

      if (globalCfgRes.error) {
        console.error('Could not load global config:', globalCfgRes.error);
      }

      // Read from DB; if DB is completely uninitialized, check localStorage once to auto-migrate existing setup
      let loadedGroups: GroupDict = (dbConfig?.dp_groups && typeof dbConfig.dp_groups === 'object') ? dbConfig.dp_groups : {};
      let loadedReportSettings = (dbConfig?.report_settings && typeof dbConfig.report_settings === 'object' && typeof dbConfig.report_settings.hideZeroes === 'boolean')
        ? { hideZeroes: dbConfig.report_settings.hideZeroes }
        : { hideZeroes: true };
      let loadedProdCols: ProductColDict = (dbConfig?.product_columns && typeof dbConfig.product_columns === 'object') ? { ...dbConfig.product_columns } : {};
      let loadedHeaderTheme = mergeHeaderTheme(dbConfig?.header_theme);
      let loadedSectionTheme = mergeSectionTheme(dbConfig?.section_theme);

      const dbIsEmpty =
        Object.keys(loadedGroups).length === 0 &&
        Object.keys(loadedProdCols).length === 0 &&
        (!dbConfig?.header_theme || Object.keys(dbConfig.header_theme).length === 0) &&
        (!dbConfig?.section_theme || Object.keys(dbConfig.section_theme).length === 0);

      let migratedFromLocal = false;

      if (dbIsEmpty && typeof window !== 'undefined') {
        try {
          const localGroupsStr = localStorage.getItem('matrix_dp_groups');
          const localSettingsStr = localStorage.getItem('matrix_report_settings');
          const localProdColsStr = localStorage.getItem('matrix_product_columns');
          const localSectionStr = localStorage.getItem('matrix_section_theme');
          const localHeaderStr = localStorage.getItem('matrix_header_theme');

          if (localGroupsStr) {
            const parsed = JSON.parse(localGroupsStr);
            if (parsed && Object.keys(parsed).length > 0) {
              loadedGroups = parsed;
              migratedFromLocal = true;
            }
          }
          if (localSettingsStr) {
            const parsed = JSON.parse(localSettingsStr);
            if (parsed && typeof parsed.hideZeroes === 'boolean') {
              loadedReportSettings = { hideZeroes: parsed.hideZeroes };
              migratedFromLocal = true;
            }
          }
          if (localProdColsStr) {
            const parsed = JSON.parse(localProdColsStr);
            if (parsed && Object.keys(parsed).length > 0) {
              loadedProdCols = parsed;
              migratedFromLocal = true;
            }
          }
          if (localSectionStr) {
            loadedSectionTheme = mergeSectionTheme(JSON.parse(localSectionStr));
            migratedFromLocal = true;
          }
          if (localHeaderStr) {
            loadedHeaderTheme = mergeHeaderTheme(JSON.parse(localHeaderStr));
            migratedFromLocal = true;
          }
        } catch (e) {
          console.error('Error reading local migration settings:', e);
        }
      }

      // Ensure every active product has column visibility entries (preserving existing false values)
      const mergedProdCols: ProductColDict = { ...loadedProdCols };
      prodData.forEach((p: any) => {
        if (!mergedProdCols[p.id]) {
          mergedProdCols[p.id] = {};
          REPORT_COLUMNS.forEach(col => {
            mergedProdCols[p.id][col.key] = true;
          });
        } else {
          REPORT_COLUMNS.forEach(col => {
            if (typeof mergedProdCols[p.id][col.key] !== 'boolean') {
              mergedProdCols[p.id][col.key] = true;
            }
          });
        }
      });

      setProducts(prodData);
      setAllDps(dpData);
      setCanvasDps(dpData);

      setSavedDpGroups(loadedGroups);
      setReportSettings(loadedReportSettings);
      setProductColSettings(mergedProdCols);
      setHeaderTheme(loadedHeaderTheme);
      setSectionTheme(loadedSectionTheme);

      // Push migrated local settings to Supabase automatically on first run
      if (migratedFromLocal && !globalCfgRes.error) {
        await supabase.from('report_builder_settings').upsert(
          {
            id: GLOBAL_CONFIG_ID,
            dp_groups: loadedGroups,
            report_settings: loadedReportSettings,
            product_columns: mergedProdCols,
            header_theme: loadedHeaderTheme,
            section_theme: loadedSectionTheme,
            updated_by: userEmail,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'id' }
        );
        showNotice('Existing local settings synced globally to database!', 'success');
      }
    } catch (err) {
      console.error('Error loading master data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================================
  // DATA PREPARING LOGIC (UNCHANGED)
  // =========================================================================
  const fetchAndCalculateData = async () => {
    setIsProcessingData(true);
    try {
      const connectedWhIds: string[] = [];
      allDps.forEach(dp => {
        if (dp.nfi_warehouse_id) connectedWhIds.push(dp.nfi_warehouse_id);
        if (dp.lpg_warehouse_id) connectedWhIds.push(dp.lpg_warehouse_id);
      });

      if (connectedWhIds.length === 0) { setIsProcessingData(false); return; }

      const { data: txns } = await supabase.from('inventory_transactions')
        .select('*, stock_transfers(destination_type)')
        .in('warehouse_id', connectedWhIds)
        .lte('created_at', `${endDate}T23:59:59.999Z`);

      const { data: dists } = await supabase.from('distributions')
        .select(`id, distribution_point_id, distribution_date, distribution_items(product_id, quantity, total_hh)`)
        .lte('distribution_date', endDate);

      setRawTxns(txns || []);
      setRawDists(dists || []);

      const computedMatrix = computeMatrixForPeriod(startDate, endDate, canvasDps, products, txns || [], dists || []);
      setMatrixData(computedMatrix);
    } catch (err) {
      console.error("Calculation Error:", err);
    } finally {
      setIsProcessingData(false);
    }
  };

  const computeMatrixForPeriod = (periodStart: string, periodEnd: string, dpsToCalc: any[], prods: any[], allTxns: any[], allDists: any[]) => {
    const newMatrix: MatrixDict = {};

    dpsToCalc.forEach(dp => {
      newMatrix[dp.id] = {};
      const whIds = [dp.nfi_warehouse_id, dp.lpg_warehouse_id].filter(Boolean);

      prods.forEach(p => {
        let opening = 0, rcv_unhcr = 0, rcv_contingency = 0, rcv_camp = 0;
        let shortage = 0, issue_camp = 0, issue_contingency = 0, issue_inst = 0;
        let issue_beneficiary = 0, hh = 0;

        const txns = allTxns.filter(t => t.product_id === p.id && whIds.includes(t.warehouse_id));

        txns.forEach(t => {
          const tDate = new Date(t.created_at);
          const txnDateStr = new Date(tDate.getTime() - (tDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
          const rem = (t.remarks || '').toLowerCase();

          // EXACT OPENING BALANCE (Strictly transactions before the start date)
          if (txnDateStr < periodStart) {
             if (t.transaction_type === 'IN' || t.transaction_type === 'RECEIVE') opening += t.quantity;
             if (t.transaction_type === 'OUT' || t.transaction_type === 'DAMAGE') opening -= t.quantity;
          }
          // TRANSACTIONS DURING THE PERIOD
          else if (txnDateStr >= periodStart && txnDateStr <= periodEnd) {
            if (t.transaction_type === 'IN') {
              if (t.transfer_id) {
                rcv_camp += t.quantity;
              } else {
                // Fixed: Initial Bulk Entry goes to Received from UNHCR if it's within the selected period
                if (rem.includes('contingency')) rcv_contingency += t.quantity;
                else rcv_unhcr += t.quantity;
              }
            }
            else if (t.transaction_type === 'DAMAGE') shortage += t.quantity;
            else if (t.transaction_type === 'OUT') {
              if (t.transfer_id) {
                const dest = t.stock_transfers?.destination_type;
                if (dest === 'WH') issue_camp += t.quantity;
                else if (dest === 'CONTINGENCY') issue_contingency += t.quantity;
                else if (dest === 'PARTNER') issue_inst += t.quantity;
              }
            }
          }
        });

        const dists = allDists.filter(d => d.distribution_point_id === dp.id);
        dists.forEach(d => {
          if (d.distribution_date >= periodStart && d.distribution_date <= periodEnd) {
             d.distribution_items?.forEach((di: any) => {
               if (di.product_id === p.id) {
                 issue_beneficiary += di.quantity;
                 hh += di.total_hh || 0;
               }
             });
          }
        });

        const totalIn = opening + rcv_unhcr + rcv_contingency + rcv_camp;
        const totalOut = shortage + issue_beneficiary + issue_camp + issue_contingency + issue_inst;

        newMatrix[dp.id][p.id] = {
          opening, rcv_unhcr, rcv_contingency, rcv_camp, shortage,
          issue_beneficiary, issue_camp, issue_contingency, issue_inst, hh,
          closing: totalIn - totalOut
        };
      });
    });
    return newMatrix;
  };

  const getDisplayValue = (val: number, colKey: string, productId: string) => {
    if (productColSettings[productId] && productColSettings[productId][colKey] === false) return '';
    if (val === 0 && reportSettings.hideZeroes && colKey !== 'opening' && colKey !== 'closing') return '';
    return val;
  };

  const getDatesInRange = (startStr: string, endStr: string) => {
    const dates = [];
    let current = new Date(startStr);
    const end = new Date(endStr);
    while (current <= end) {
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      const dd = String(current.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const formatMonthsInRange = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return '';
    const start = new Date(startStr);
    const end = new Date(endStr);
    const months = new Set<string>();

    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endLimit = new Date(end.getFullYear(), end.getMonth(), 1);

    while (current <= endLimit) {
      months.add(current.toLocaleDateString('en-GB', { month: 'long' }));
      current.setMonth(current.getMonth() + 1);
    }

    const monthArray = Array.from(months);
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    const yearStr = startYear === endYear ? startYear.toString() : `${startYear}-${endYear}`;

    return `${monthArray.join(', ')} ${yearStr}`;
  };

  const handleDragStart = (e: React.DragEvent, dp: any, source: 'available' | 'canvas') => {
    e.dataTransfer.setData("dp", JSON.stringify(dp));
    e.dataTransfer.setData("source", source);
  };
  const handleDropOnCanvas = (e: React.DragEvent) => {
    e.preventDefault();
    const dpStr = e.dataTransfer.getData("dp");
    const source = e.dataTransfer.getData("source");
    if (!dpStr || source === 'canvas') return;
    const dp = JSON.parse(dpStr);
    if (!canvasDps.find(c => c.id === dp.id)) setCanvasDps([...canvasDps, dp]);
  };
  const handleDropOnAvailable = (e: React.DragEvent) => {
    e.preventDefault();
    const dpStr = e.dataTransfer.getData("dp");
    const source = e.dataTransfer.getData("source");
    if (!dpStr || source === 'available') return;
    setCanvasDps(canvasDps.filter(d => d.id !== JSON.parse(dpStr).id));
  };

  const toggleDpSelection = (dpId: string) => {
    if (selectedAvailableDps.includes(dpId)) setSelectedAvailableDps(selectedAvailableDps.filter(id => id !== dpId));
    else setSelectedAvailableDps([...selectedAvailableDps, dpId]);
  };

  const addSelectedToCanvas = () => {
    const dpsToAdd = allDps.filter(dp => selectedAvailableDps.includes(dp.id) && !canvasDps.find(c => c.id === dp.id));
    setCanvasDps([...canvasDps, ...dpsToAdd]);
    setSelectedAvailableDps([]);
  };

  const removeAllFromCanvas = () => setCanvasDps([]);
  const addAllToCanvas = () => {
    const newCanvas = [...canvasDps];
    allDps.forEach(dp => { if (!newCanvas.find(c => c.id === dp.id)) newCanvas.push(dp); });
    setCanvasDps(newCanvas);
  };

  // Save DP group globally (supports either checked Available DPs OR current Canvas DPs)
  const dpIdsToSaveAsGroup =
    selectedAvailableDps.length > 0
      ? selectedAvailableDps
      : canvasDps.map(dp => dp.id);

  const handleSaveGroup = async () => {
    const trimmedName = newGroupName.trim();
    if (!trimmedName || dpIdsToSaveAsGroup.length === 0) return;

    const newGroups: GroupDict = { ...savedDpGroups, [trimmedName]: dpIdsToSaveAsGroup };
    const ok = await persistGlobalConfig({ dp_groups: newGroups });
    if (!ok) return;

    setSavedDpGroups(newGroups);
    setNewGroupName('');
    setGroupTab('load');
    setSelectedGroupSelect(trimmedName);

    // Keep exact saved order on canvas
    const orderedDps = dpIdsToSaveAsGroup
      .map(id => allDps.find(dp => dp.id === id))
      .filter(Boolean);
    setCanvasDps(orderedDps);
    setSelectedAvailableDps([]);
    showNotice(`DP Group "${trimmedName}" saved globally for all users!`, 'success');
  };

  const handleLoadGroup = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const groupName = e.target.value;
    setSelectedGroupSelect(groupName);

    if (groupName && savedDpGroups[groupName]) {
      const dpIds = savedDpGroups[groupName];
      const dpsToLoad = dpIds
        .map(id => allDps.find(dp => dp.id === id))
        .filter(Boolean);
      setCanvasDps(dpsToLoad);
      setSelectedAvailableDps([]);
    } else {
      setCanvasDps([]);
    }
  };

  const initiateDeleteGroup = () => {
    if (!selectedGroupSelect) return;
    setGroupToDelete(selectedGroupSelect);
    setDeleteGroupStep(1);
    setIsDeleteGroupModalOpen(true);
  };

  const confirmDeleteGroup = async () => {
    if (!groupToDelete) return;
    const newGroups: GroupDict = { ...savedDpGroups };
    delete newGroups[groupToDelete];

    const ok = await persistGlobalConfig({ dp_groups: newGroups });
    if (!ok) return;

    setSavedDpGroups(newGroups);
    setSelectedGroupSelect('');
    setIsDeleteGroupModalOpen(false);
    showNotice(`DP Group "${groupToDelete}" deleted globally.`, 'success');
    setGroupToDelete('');
  };

  const availableDps = allDps.filter(dp => !canvasDps.find(c => c.id === dp.id));

  const saveSettingsConfig = async () => {
    const ok = await persistGlobalConfig({
      report_settings: reportSettings,
      product_columns: productColSettings
    });
    if (ok) {
      setIsSettingsModalOpen(false);
      showNotice('Report Data Settings saved globally for all users!', 'success');
    }
  };

  const saveThemeConfig = async () => {
    const ok = await persistGlobalConfig({
      header_theme: headerTheme,
      section_theme: sectionTheme
    });
    if (ok) {
      setIsThemeModalOpen(false);
      showNotice('Matrix Colors saved globally for all users!', 'success');
    }
  };

  const handleToggleProductColumn = (productId: string, colKey: string) => {
    setProductColSettings(prev => {
      const existing: BoolDict = prev[productId] ? { ...prev[productId] } : {};
      REPORT_COLUMNS.forEach(c => {
        if (typeof existing[c.key] !== 'boolean') existing[c.key] = true;
      });
      existing[colKey] = !existing[colKey];
      return { ...prev, [productId]: existing };
    });
  };

  const handleToggleProductAll = (productId: string, state: boolean) => {
    setProductColSettings(prev => {
      const newProdState: BoolDict = {};
      REPORT_COLUMNS.forEach(c => { newProdState[c.key] = state; });
      return { ...prev, [productId]: newProdState };
    });
  };

  // =========================================================================
  // EXCEL & PDF EXPORT LOGIC (UNCHANGED)
  // =========================================================================
  const handleExportExcel = async () => {
    if (canvasDps.length === 0) return;
    setIsProcessingData(true);

    try {
      const workbook = new ExcelJS.Workbook();
      const dateList = getDatesInRange(startDate, endDate);
      const totalCols = 4 + (canvasDps.length * 11) + 11;

      const buildSheet = (sheetName: string, dataMatrix: any, isMonthly: boolean, specDate?: string) => {
        const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', xSplit: 4, ySplit: 5 }] });

        const row1 = sheet.addRow(isMonthly ? [`Monthly Report: ${formatMonthsInRange(startDate, endDate)}`] : ['Daily Report']);
        const row2 = sheet.addRow(isMonthly ? [`Date Range: ${new Date(startDate).toLocaleDateString('en-GB')} to ${new Date(endDate).toLocaleDateString('en-GB')}`] : [`Date: ${new Date(specDate || '').toLocaleDateString('en-GB')}`]);
        const row3 = sheet.addRow([]);
        row3.height = 10;

        sheet.mergeCells(1, 1, 1, totalCols);
        sheet.mergeCells(2, 1, 2, totalCols);

        const titleCell1 = sheet.getCell(1, 1);
        titleCell1.font = { bold: true, size: 14, color: { argb: 'FF1e293b' } };
        titleCell1.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

        const titleCell2 = sheet.getCell(2, 1);
        titleCell2.font = { bold: true, size: 11, color: { argb: 'FF475569' } };
        titleCell2.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

        const row4 = sheet.addRow([]);

        sheet.mergeCells('A4:D4');
        const masterCell = sheet.getCell('A4');
        masterCell.value = 'PRODUCT MASTER DATA';
        masterCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        masterCell.font = { bold: true, size: 12, color: { argb: 'FF1e293b' } };
        masterCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + sectionTheme.master.replace('#', '') } };
        masterCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        let startCol = 5;
        canvasDps.forEach((dp, idx) => {
          const endCol = startCol + 10;
          sheet.mergeCells(4, startCol, 4, endCol);
          const dpCell = sheet.getCell(4, startCol);
          dpCell.value = dp.name;
          dpCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          dpCell.font = { bold: true, size: 12, color: { argb: 'FF000000' } };
          dpCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + sectionTheme.dps[idx % sectionTheme.dps.length].replace('#', '') } };
          dpCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          startCol = endCol + 1;
        });

        sheet.mergeCells(4, startCol, 4, startCol + 10);
        const accCell = sheet.getCell(4, startCol);
        accCell.value = 'ACCUMULATED TOTAL';
        accCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        accCell.font = { bold: true, size: 12, color: { argb: 'FF000000' } };
        accCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + sectionTheme.accumulated.replace('#', '') } };
        accCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        const headerNames = ['SL No.', 'Name of Items', 'Product Code', 'Unit'];
        canvasDps.forEach(() => REPORT_COLUMNS.forEach(c => headerNames.push(c.name)));
        REPORT_COLUMNS.forEach(c => headerNames.push(c.name));

        const row5 = sheet.addRow(headerNames);
        row5.eachCell((cell, colNum) => {
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          cell.font = { bold: true, size: 10 };
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

          if (colNum <= 4) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + sectionTheme.master.replace('#', '') } };
            cell.font = { bold: true, size: 10, color: { argb: 'FF1e293b' } };
          } else {
             const relativeIndex = (colNum - 5) % 11;
             const colKey = REPORT_COLUMNS[relativeIndex].key;
             const theme = headerTheme[colKey] || DEFAULT_HEADER_COLORS[colKey];
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + theme.bg.replace('#', '') } };
             cell.font = { bold: true, size: 10, color: { argb: 'FF' + theme.text.replace('#', '') } };
          }
        });

        products.forEach((product, idx) => {
          const rowData: any[] = [idx + 1, product.name, product.code, product.unit_type];
          const accTotals: { [key: string]: number } = {};
          REPORT_COLUMNS.forEach(col => { accTotals[col.key] = 0; });

          canvasDps.forEach(dp => {
            const dpData = dataMatrix[dp.id]?.[product.id] || {};
            REPORT_COLUMNS.forEach(col => {
              const val = dpData[col.key] || 0;
              rowData.push(getDisplayValue(val, col.key, product.id));
              accTotals[col.key] += val;
            });
          });

          REPORT_COLUMNS.forEach(col => {
             rowData.push(getDisplayValue(accTotals[col.key] || 0, col.key, product.id));
          });

          const dataRow = sheet.addRow(rowData);
          dataRow.eachCell((cell, colNum) => {
            cell.border = { top: { style: 'thin', color: { argb: 'FFcbd5e1' } }, left: { style: 'thin', color: { argb: 'FFcbd5e1' } }, bottom: { style: 'thin', color: { argb: 'FFcbd5e1' } }, right: { style: 'thin', color: { argb: 'FFcbd5e1' } } };
            cell.alignment = { vertical: 'middle', horizontal: colNum > 4 ? 'right' : 'left' };
            if (colNum === 1 || colNum === 3 || colNum === 4) cell.alignment.horizontal = 'center';

            if (colNum <= 4) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + sectionTheme.master.replace('#', '') } };
              cell.font = { color: { argb: 'FF1e293b' }, bold: true };
            } else if (colNum > 4 + (canvasDps.length * 11)) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + sectionTheme.accumulated.replace('#', '') } };
            } else {
              const dpIdx = Math.floor((colNum - 5) / 11);
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + sectionTheme.dps[dpIdx % sectionTheme.dps.length].replace('#', '') } };
            }

            if (colNum > 4 && typeof cell.value === 'number' && cell.value < 0) {
              cell.font = { color: { argb: 'FFFF0000' }, bold: true };
            }
          });
        });

        sheet.getColumn(1).width = 8;
        sheet.getColumn(2).width = 35;
        sheet.getColumn(3).width = 18;
        sheet.getColumn(4).width = 12;
        for (let i = 5; i <= headerNames.length; i++) sheet.getColumn(i).width = 14;
      };

      // 1. Generate Monthly Sheet FIRST
      buildSheet('Monthly', matrixData, true);

      // 2. Generate Daily Sheets
      for (const dateStr of dateList) {
        const displayDate = dateStr.split('-').reverse().join('.');
        const dailyMatrix = computeMatrixForPeriod(dateStr, dateStr, canvasDps, products, rawTxns, rawDists);
        buildSheet(displayDate, dailyMatrix, false, dateStr);
      }

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `General_Report_${startDate}_to_${endDate}.xlsx`);
    } catch (err) {
      console.error("Excel Export Error:", err);
      alert("Failed to export Excel.");
    } finally {
      setIsProcessingData(false);
    }
  };

  const handleExportPDF = () => {
    if (canvasDps.length === 0) return;

    const totalColsForPdf = 4 + (canvasDps.length * 11) + 11;
    const pdfWidth = Math.max(2384, totalColsForPdf * 60 + 100);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [pdfWidth, 1684] });

    doc.setFontSize(22);
    doc.text(`Monthly Report: ${formatMonthsInRange(startDate, endDate)}`, 40, 40);
    doc.setFontSize(12);
    doc.text(`Date Range: ${new Date(startDate).toLocaleDateString('en-GB')} to ${new Date(endDate).toLocaleDateString('en-GB')}   |   Generated: ${new Date().toLocaleString()}`, 40, 60);

    const head1: any[] = [{ content: 'PRODUCT MASTER DATA', colSpan: 4, styles: { halign: 'center', fillColor: hexToRgb(sectionTheme.master), textColor: [30, 41, 59] } }];
    canvasDps.forEach((dp, idx) => {
       const dpColor = hexToRgb(sectionTheme.dps[idx % sectionTheme.dps.length]);
       head1.push({ content: dp.name, colSpan: 11, styles: { halign: 'center', fillColor: dpColor, textColor: [0, 0, 0] } });
    });
    head1.push({ content: 'ACCUMULATED TOTAL', colSpan: 11, styles: { halign: 'center', fillColor: hexToRgb(sectionTheme.accumulated), textColor: [0, 0, 0] } });

    const head2 = ['SL', 'Name of Items', 'Product Code', 'Unit'];
    canvasDps.forEach(() => REPORT_COLUMNS.forEach(c => head2.push(c.name)));
    REPORT_COLUMNS.forEach(c => head2.push(c.name));

    const body: any[] = [];
    products.forEach((product, idx) => {
      const row: any[] = [idx + 1, product.name, product.code, product.unit_type];
      const accTotals: { [key: string]: number } = {};
      REPORT_COLUMNS.forEach(col => { accTotals[col.key] = 0; });

      canvasDps.forEach(dp => {
        const dpData = matrixData[dp.id]?.[product.id] || {};
        REPORT_COLUMNS.forEach(col => {
          const rawVal = dpData[col.key] || 0;
          const displayVal = getDisplayValue(rawVal, col.key, product.id);
          row.push(displayVal === '' ? '-' : displayVal);
          accTotals[col.key] += rawVal;
        });
      });
      REPORT_COLUMNS.forEach(col => {
         const accDisplay = getDisplayValue(accTotals[col.key] || 0, col.key, product.id);
         row.push(accDisplay === '' ? '-' : accDisplay);
      });
      body.push(row);
    });

    autoTable(doc, {
      head: [head1, head2],
      body: body,
      startY: 80,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1, lineColor: [200, 200, 200], halign: 'center', valign: 'middle' },
      bodyStyles: { valign: 'middle' },
      didParseCell: function(data) {
        if (data.section === 'head' && data.row.index === 1) {
          if (data.column.index <= 3) {
            data.cell.styles.fillColor = hexToRgb(sectionTheme.master);
            data.cell.styles.textColor = [30, 41, 59];
          } else {
            const relativeIndex = (data.column.index - 4) % 11;
            const colKey = REPORT_COLUMNS[relativeIndex].key;
            const theme = headerTheme[colKey] || DEFAULT_HEADER_COLORS[colKey];
            data.cell.styles.fillColor = hexToRgb(theme.bg);
            data.cell.styles.textColor = hexToRgb(theme.text);
          }
        }

        if (data.section === 'body') {
          if (data.column.index === 0 || data.column.index === 2 || data.column.index === 3) {
             data.cell.styles.halign = 'center';
          } else if (data.column.index === 1) {
             data.cell.styles.halign = 'left';
          } else {
             data.cell.styles.halign = 'right';
          }

          if (data.column.index <= 3) {
             data.cell.styles.fillColor = hexToRgb(sectionTheme.master);
             data.cell.styles.textColor = [30, 41, 59];
          } else if (data.column.index > 3 + (canvasDps.length * 11)) {
             data.cell.styles.fillColor = hexToRgb(sectionTheme.accumulated);
          } else {
             const dpIdx = Math.floor((data.column.index - 4) / 11);
             data.cell.styles.fillColor = hexToRgb(sectionTheme.dps[dpIdx % sectionTheme.dps.length]);
          }
        }
      }
    });

    doc.save(`General_Report_Monthly_${startDate}_to_${endDate}.pdf`);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 relative overflow-y-auto">

      {/* HEADER */}
      <header className="flex flex-col md:flex-row h-auto md:h-20 bg-white border-b border-slate-200 justify-between items-center px-4 md:px-6 py-4 md:py-0 shrink-0 shadow-sm z-30 pr-16 md:pr-24 gap-3 md:gap-0 sticky top-0">
        <div className="flex items-center w-full md:w-auto">
          <button onClick={() => window.history.back()} className="mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 leading-tight">Report Builder (Matrix)</h2>
            <p className="text-[11px] md:text-sm text-slate-500">Drag &amp; Drop DPs to configure custom layout (Global DB Settings)</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button onClick={handleExportExcel} disabled={canvasDps.length === 0 || isProcessingData} className="flex items-center px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50">
            {isProcessingData ? <Icons.Spinner /> : <Icons.Download />} <span className="ml-1">Export Excel</span>
          </button>
          <button onClick={handleExportPDF} disabled={canvasDps.length === 0 || isProcessingData} className="flex items-center px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 transition-colors shadow-sm disabled:opacity-50">
            <Icons.Download /> <span className="ml-1">Export PDF</span>
          </button>
        </div>
      </header>

      {/* TOAST NOTICE */}
      {statusMsg.text && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[120] w-[90%] max-w-md px-4 py-3 rounded-xl shadow-lg border text-xs md:text-sm font-bold flex items-center justify-between animate-in slide-in-from-top-2 ${statusMsg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          <span>{statusMsg.type === 'error' ? '⚠️' : '✅'} {statusMsg.text}</span>
          <button onClick={() => setStatusMsg({ text: '', type: '' })} className="p-1 rounded hover:bg-black/5">
            <Icons.Close />
          </button>
        </div>
      )}

      {/* 50/50 SPLIT WORKSPACE */}
      <div className="flex-1 p-4 md:p-6 space-y-6">

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch shrink-0">

          {/* LEFT PANEL */}
          <div className="flex flex-col space-y-4">

            {/* Top Row of Left Panel: Dates & Group Manager */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Date Configuration */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">1. Date Configuration</h3>
                <div className="space-y-4 flex-1">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">Date From</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 transition-colors shadow-sm" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">Date To (Inclusive)</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 transition-colors shadow-sm" />
                  </div>
                </div>
              </div>

              {/* Group Manager (Global DB) */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">DP Group Manager</h3>
                  <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full uppercase">Global</span>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-lg mb-4 shrink-0">
                  <button onClick={() => setGroupTab('load')} className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all ${groupTab === 'load' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-indigo-600'}`}>Load Group</button>
                  <button onClick={() => setGroupTab('save')} className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all ${groupTab === 'save' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-indigo-600'}`}>Save Group</button>
                </div>

                <div className="flex-1 flex flex-col justify-center">
                  {groupTab === 'load' ? (
                    <div className="flex flex-col space-y-3 animate-in fade-in">
                      <label className="block text-[10px] font-bold text-slate-700">Select a group to auto-fill canvas:</label>
                      <div className="flex space-x-2">
                        <select value={selectedGroupSelect} onChange={handleLoadGroup} className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 shadow-sm cursor-pointer">
                          <option value="">- Select Group -</option>
                          {Object.keys(savedDpGroups).map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        {selectedGroupSelect && (
                          <button onClick={initiateDeleteGroup} className="px-3 py-2.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl hover:bg-rose-100 transition-colors shadow-sm shrink-0" title="Delete Group">
                            <Icons.Trash />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col space-y-3 animate-in fade-in">
                      {dpIdsToSaveAsGroup.length === 0 ? (
                        <p className="text-xs text-amber-700 font-bold bg-amber-50 p-3 rounded-xl border border-amber-200 text-center leading-tight">
                          Select DPs from the list below or add DPs to the canvas first.
                        </p>
                      ) : (
                        <>
                          <label className="block text-[10px] font-bold text-slate-700">
                            {selectedAvailableDps.length > 0
                              ? `Save ${selectedAvailableDps.length} selected DPs as:`
                              : `Save current ${canvasDps.length} canvas DPs as:`}
                          </label>
                          <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Type group name..." className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 shadow-sm" />
                          <button onClick={handleSaveGroup} disabled={isSavingGlobal || !newGroupName.trim()} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50">
                            {isSavingGlobal ? 'Saving...' : 'Save Global Group'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Bottom Row of Left Panel: Available DPs (Horizontal Chips) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1">
              <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl shrink-0">
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">2. Available DPs</h3>
                <div className="flex space-x-2">
                  <button onClick={addSelectedToCanvas} disabled={selectedAvailableDps.length === 0} className="text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg shadow-sm transition-colors disabled:opacity-50">
                    Add Selected
                  </button>
                  <button onClick={addAllToCanvas} className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors">
                    Add All
                  </button>
                </div>
              </div>

              <div className="p-4 flex flex-wrap gap-2 bg-slate-50/30 overflow-y-auto custom-scrollbar" onDragOver={(e) => e.preventDefault()} onDrop={handleDropOnAvailable}>
                {isLoading ? (
                  <div className="w-full text-center p-8"><Icons.Spinner /></div>
                ) : availableDps.length === 0 ? (
                  <div className="w-full border-2 border-dashed border-slate-200 rounded-xl p-6 text-center text-xs font-bold text-slate-400 bg-white">
                    All points added to canvas.
                  </div>
                ) : (
                  availableDps.map(dp => {
                    const isSelected = selectedAvailableDps.includes(dp.id);
                    return (
                      <div
                        key={dp.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, dp, 'available')}
                        onClick={() => toggleDpSelection(dp.id)}
                        className={`px-3 py-2 border rounded-xl shadow-sm cursor-grab active:cursor-grabbing transition-all flex items-center space-x-2 group select-none ${isSelected ? 'border-indigo-500 bg-indigo-50 text-indigo-800 ring-1 ring-indigo-500' : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md text-slate-700'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer pointer-events-none"
                        />
                        <span className="font-bold text-xs whitespace-nowrap">{dp.name}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>

          {/* RIGHT PANEL (Canvas) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full min-h-[300px]" onDragOver={(e) => e.preventDefault()} onDrop={handleDropOnCanvas}>
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0 flex-wrap gap-3 rounded-t-2xl">
              <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-widest flex items-center">
                <Icons.Manifest /> <span className="ml-2">3. Report Structure Canvas (Drop Here)</span>
              </h3>
              <div className="flex items-center space-x-2">
                <button onClick={() => setIsSettingsModalOpen(true)} className="text-[10px] font-bold text-slate-700 hover:text-slate-900 bg-white px-3 py-1.5 rounded-lg border border-slate-300 transition-colors shadow-sm flex items-center">
                  ⚙️ Report Settings
                </button>
                <button onClick={() => setIsThemeModalOpen(true)} className="text-[10px] font-bold text-slate-700 hover:text-slate-900 bg-white px-3 py-1.5 rounded-lg border border-slate-300 transition-colors shadow-sm flex items-center">
                  🎨 Customize Colors
                </button>
                {canvasDps.length > 0 && (
                  <button onClick={removeAllFromCanvas} className="text-[10px] font-bold text-rose-600 hover:text-rose-800 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100 transition-colors">&larr; Clear All</button>
                )}
              </div>
            </div>

            <div className="flex-1 p-5 bg-slate-50/30 overflow-y-auto custom-scrollbar">
              <div className="w-full h-full border-2 border-dashed border-indigo-200 bg-indigo-50/50 rounded-2xl p-4 flex flex-wrap gap-3 items-start content-start min-h-[250px]">
                {canvasDps.length === 0 ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                     <span className="text-4xl mb-3 opacity-50">📥</span>
                     <p className="text-sm font-bold">Drag distribution points here</p>
                     <p className="text-xs mt-1">Build your report matrix layout</p>
                  </div>
                ) : (
                  <>
                    {canvasDps.map((dp, index) => (
                      <div
                        key={dp.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, dp, 'canvas')}
                        className="bg-indigo-600 text-white pl-3 pr-3 py-2 rounded-xl text-sm font-bold shadow-md cursor-grab active:cursor-grabbing flex items-center space-x-2 animate-in zoom-in shrink-0"
                      >
                        <span className="bg-indigo-800 w-6 h-6 flex items-center justify-center rounded-lg text-xs">{index + 1}</span>
                        <span className="whitespace-nowrap">{dp.name}</span>
                        <button onClick={(e) => { e.stopPropagation(); setCanvasDps(canvasDps.filter(d => d.id !== dp.id)); }} className="ml-1 p-1 text-indigo-300 hover:text-white hover:bg-indigo-500 rounded transition-colors"><Icons.Close /></button>
                      </div>
                    ))}

                    <div className="bg-rose-600 text-white px-4 py-2 rounded-xl text-xs font-black shadow-md uppercase tracking-widest flex items-center border-2 border-rose-400 ml-2 shrink-0">
                      <span className="mr-2 text-lg">∑</span> Accumulated Total
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: Full Width Live Matrix Preview */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[650px] overflow-hidden relative">
           <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
             <div className="flex items-center">
               <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mr-3">4. Live Matrix Preview</h3>
               {isProcessingData && <span className="text-[10px] font-bold text-emerald-600 flex items-center animate-pulse"><Icons.Spinner /> Computing Real-time Data...</span>}
             </div>
             <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold px-2 py-1 rounded shadow-sm hidden sm:block">Real-time DB Connection</span>
           </div>

           <div className="flex-1 overflow-auto custom-scrollbar w-full relative">
              {canvasDps.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 p-10 text-center">
                  <span className="text-6xl mb-4 opacity-50">📊</span>
                  <p className="text-sm font-bold text-slate-500">Canvas is empty. Add blocks above to generate matrix.</p>
                </div>
              ) : (
                <table className="w-max min-w-full text-left border-collapse border-spacing-0">
                  <thead className="sticky top-0 z-30 shadow-sm">
                    {/* Top Header Row (DP Names) */}
                    <tr>
                      <th colSpan={4} className="p-3 border-r border-b border-slate-300 font-bold text-xs text-center uppercase tracking-widest sticky left-0 z-40 shadow-[2px_0_5px_rgba(0,0,0,0.05)]" style={{ backgroundColor: sectionTheme.master, color: '#1e293b' }}>
                        PRODUCT MASTER DATA
                      </th>

                      {canvasDps.map((dp, idx) => (
                        <th key={dp.id} colSpan={11} className="p-3 border-r border-b border-slate-300 font-black text-xs text-center uppercase tracking-wider" style={{ backgroundColor: sectionTheme.dps[idx % sectionTheme.dps.length], color: '#0f172a' }}>
                          {dp.name}
                        </th>
                      ))}

                      <th colSpan={11} className="p-3 border-b border-slate-300 font-black text-xs text-center uppercase tracking-widest" style={{ backgroundColor: sectionTheme.accumulated, color: '#0f172a' }}>
                        ACCUMULATED TOTAL
                      </th>
                    </tr>

                    {/* Sub Header Row (Columns repeated) */}
                    <tr>
                      <th className="p-2 border-r border-b border-slate-300 font-bold text-[10px] uppercase w-12 text-center sticky left-0 z-40 shadow-[2px_0_5px_rgba(0,0,0,0.05)]" style={{ backgroundColor: sectionTheme.master, color: '#1e293b' }}>SL</th>
                      <th className="p-2 border-r border-b border-slate-300 font-bold text-[10px] uppercase w-48 sticky left-12 z-40 shadow-[2px_0_5px_rgba(0,0,0,0.05)]" style={{ backgroundColor: sectionTheme.master, color: '#1e293b' }}>Name of Items</th>
                      <th className="p-2 border-r border-b border-slate-300 font-bold text-[10px] uppercase w-28 sticky left-[240px] z-40 shadow-[2px_0_5px_rgba(0,0,0,0.05)] text-center" style={{ backgroundColor: sectionTheme.master, color: '#1e293b' }}>Product Code</th>
                      <th className="p-2 border-r border-b border-slate-300 font-bold text-[10px] uppercase w-20 text-center sticky left-[352px] z-40 shadow-[2px_0_5px_rgba(0,0,0,0.05)]" style={{ backgroundColor: sectionTheme.master, color: '#1e293b' }}>Unit</th>

                      {/* Repeat 11 Columns for each DP */}
                      {canvasDps.map(dp => (
                        <React.Fragment key={`cols-${dp.id}`}>
                          {REPORT_COLUMNS.map(col => {
                            const theme = headerTheme[col.key] || DEFAULT_HEADER_COLORS[col.key];
                            return (
                              <th key={`col-${dp.id}-${col.key}`} className="p-2 border-r border-b border-slate-300/50 text-[9px] font-bold text-center w-28 leading-tight shadow-inner" style={{ backgroundColor: theme.bg, color: theme.text }}>
                                {col.name}
                              </th>
                            );
                          })}
                        </React.Fragment>
                      ))}

                      {/* Repeat 11 Columns for Accumulated */}
                      {REPORT_COLUMNS.map(col => {
                         const theme = headerTheme[col.key] || DEFAULT_HEADER_COLORS[col.key];
                         return (
                           <th key={`acc-${col.key}`} className="p-2 border-r border-b border-slate-300/50 text-[9px] font-bold text-center w-28 leading-tight shadow-inner" style={{ backgroundColor: theme.bg, color: theme.text }}>
                             {col.name}
                           </th>
                         );
                      })}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200/50 bg-white">
                    {products.length === 0 ? (
                      <tr><td colSpan={4 + (canvasDps.length + 1) * 11} className="p-8 text-center text-sm font-bold text-slate-400">Loading Products...</td></tr>
                    ) : (
                      products.map((product, idx) => {
                        const accTotals: { [key: string]: number } = {};
                        REPORT_COLUMNS.forEach(col => { accTotals[col.key] = 0; });

                        return (
                          <tr key={product.id} className="hover:opacity-90 transition-opacity">
                            {/* Fixed Left Columns */}
                            <td className="p-2 border-r border-slate-300/50 text-[10px] font-bold text-center sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.02)]" style={{ backgroundColor: sectionTheme.master, color: '#1e293b' }}>{idx + 1}</td>
                            <td className="p-2 border-r border-slate-300/50 sticky left-12 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.02)]" style={{ backgroundColor: sectionTheme.master, color: '#1e293b' }}>
                              <p className="text-xs font-bold truncate" title={product.name}>{product.name}</p>
                            </td>
                            <td className="p-2 border-r border-slate-300/50 sticky left-[240px] z-20 shadow-[2px_0_5px_rgba(0,0,0,0.02)] text-center" style={{ backgroundColor: sectionTheme.master, color: '#1e293b' }}>
                              <span className="text-[10px] font-bold font-mono bg-white px-2 py-0.5 rounded border border-slate-200 shadow-sm">{product.code}</span>
                            </td>
                            <td className="p-2 border-r border-slate-400/50 text-[9px] font-bold text-center uppercase sticky left-[352px] z-20 shadow-[2px_0_5px_rgba(0,0,0,0.02)]" style={{ backgroundColor: sectionTheme.master, color: '#1e293b' }}>{product.unit_type}</td>

                            {/* Data Cells for each DP */}
                            {canvasDps.map((dp, dIdx) => {
                              const dpData = matrixData[dp.id]?.[product.id] || {};
                              const bgColor = sectionTheme.dps[dIdx % sectionTheme.dps.length];

                              return (
                                <React.Fragment key={`data-${dp.id}-${product.id}`}>
                                  {REPORT_COLUMNS.map(col => {
                                    const rawVal = dpData[col.key] || 0;
                                    accTotals[col.key] += rawVal;

                                    const displayVal = getDisplayValue(rawVal, col.key, product.id);
                                    const textColor = typeof displayVal === 'number' && displayVal < 0 ? '#ef4444' : '#1e293b';

                                    return (
                                      <td key={`cell-${dp.id}-${product.id}-${col.key}`} className="p-2 border-r border-slate-300/50 text-right text-xs font-semibold" style={{ backgroundColor: bgColor, color: textColor }}>
                                        {displayVal === '' ? <span className="opacity-30">-</span> : displayVal.toLocaleString()}
                                      </td>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}

                            {/* Data Cells for Accumulated */}
                            {REPORT_COLUMNS.map(col => {
                              const rawAccVal = accTotals[col.key] || 0;
                              const displayVal = getDisplayValue(rawAccVal, col.key, product.id);
                              const textColor = typeof displayVal === 'number' && displayVal < 0 ? '#dc2626' : '#0f172a';

                              return (
                                <td key={`acc-data-${product.id}-${col.key}`} className="p-2 border-r border-slate-300/50 text-right text-xs font-bold" style={{ backgroundColor: sectionTheme.accumulated, color: textColor }}>
                                  {displayVal === '' ? <span className="opacity-30">-</span> : displayVal.toLocaleString()}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
           </div>
        </div>

      </div>

      {/* ⚙️ Report Settings Modal (z-[100] so floating profile icon never overlaps close button) */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl flex flex-col h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">⚙️ Report Data Settings (Global)</h3>
                <p className="text-xs text-slate-500 mt-0.5">Saved in database — applies to all users across all devices</p>
              </div>
              <button onClick={() => setIsSettingsModalOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm"><Icons.Close /></button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col">

              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 shrink-0 mb-6">
                 <label className="flex items-center space-x-3 cursor-pointer">
                   <input type="checkbox" checked={reportSettings.hideZeroes} onChange={(e) => setReportSettings({ ...reportSettings, hideZeroes: e.target.checked })} className="w-5 h-5 accent-indigo-600 rounded" />
                   <div>
                     <p className="font-bold text-indigo-900 text-sm">Global Hide &apos;0&apos; Values (Leave Blank)</p>
                     <p className="text-xs text-indigo-600/80 mt-0.5">If a field contains 0, it will be kept blank (-) instead of showing the digit. Works only for middle 9 columns (excludes Opening/Closing).</p>
                   </div>
                 </label>
              </div>

              <div className="flex-1 flex flex-col">
                 <div className="flex justify-between items-end mb-3 shrink-0">
                   <div>
                     <h4 className="text-sm font-bold text-slate-900">Product-Specific Column Visibility</h4>
                     <p className="text-xs text-slate-500 mt-0.5">Untick the columns you want to force blank/empty for specific products (e.g., LPG).</p>
                   </div>
                 </div>

                 <div className="border border-slate-200 rounded-xl w-full overflow-x-auto custom-scrollbar bg-slate-50 flex-1 relative">
                   <table className="w-max min-w-full text-left text-sm border-collapse">
                     <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                       <tr>
                         <th className="p-3 text-xs font-bold text-slate-700 sticky left-0 bg-slate-100 border-r border-slate-200 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.05)] min-w-[200px] max-w-[250px]">Product Name</th>
                         <th className="p-3 text-center border-r border-slate-200 w-24">
                            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Actions</span>
                         </th>
                         {REPORT_COLUMNS.map(col => (
                           <th key={col.key} className="p-2 text-[9px] font-bold text-slate-600 uppercase text-center border-r border-slate-200 w-20 whitespace-normal leading-tight">
                             {col.name}
                           </th>
                         ))}
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100 bg-white">
                       {products.map(p => (
                         <tr key={p.id} className="hover:bg-slate-50">
                           <td className="p-3 font-bold text-slate-800 text-xs sticky left-0 bg-white group-hover:bg-slate-50 border-r border-slate-200 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)] truncate max-w-[250px]" title={p.name}>{p.name}</td>
                           <td className="p-2 border-r border-slate-200 text-center">
                             <div className="flex flex-col space-y-1 items-center">
                               <button onClick={() => handleToggleProductAll(p.id, true)} className="text-[9px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-bold hover:bg-emerald-100 w-full">All</button>
                               <button onClick={() => handleToggleProductAll(p.id, false)} className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-bold hover:bg-slate-200 w-full">Clear</button>
                             </div>
                           </td>
                           {REPORT_COLUMNS.map(col => {
                             const isChecked = productColSettings[p.id]?.[col.key] ?? true;
                             return (
                               <td key={col.key} className={`p-3 text-center border-r border-slate-100 ${isChecked ? 'bg-white' : 'bg-rose-50/30'}`}>
                                 <input
                                   type="checkbox"
                                   checked={isChecked}
                                   onChange={() => handleToggleProductColumn(p.id, col.key)}
                                   className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                                 />
                               </td>
                             );
                           })}
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0 rounded-b-2xl">
               <button onClick={saveSettingsConfig} disabled={isSavingGlobal} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-8 rounded-xl text-sm transition-all shadow-md disabled:opacity-50">
                 {isSavingGlobal ? 'Saving to DB...' : 'Apply & Save Globally'}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* 🎨 Theme Settings Modal */}
      {isThemeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">🎨 Matrix Theme Configurator (Global)</h3>
                <p className="text-xs text-slate-500 mt-0.5">Customize Excel &amp; PDF full-block background colors for all users</p>
              </div>
              <button onClick={() => setIsThemeModalOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm"><Icons.Close /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar grid grid-cols-1 md:grid-cols-2 gap-8">

              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 pb-2 border-b border-slate-200">11-Column Header Colors</h4>
                <div className="space-y-3">
                  {REPORT_COLUMNS.map(col => {
                    const colTheme = headerTheme[col.key] || DEFAULT_HEADER_COLORS[col.key];
                    return (
                      <div key={col.key} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100 shadow-sm">
                        <span className="text-xs font-bold text-slate-800 w-1/2">{col.name}</span>
                        <div className="flex items-center space-x-3 w-1/2 justify-end">
                          <label className="flex items-center space-x-1 cursor-pointer">
                            <span className="text-[10px] font-bold text-slate-500">BG</span>
                            <input type="color" value={colTheme.bg} onChange={(e) => setHeaderTheme({ ...headerTheme, [col.key]: { ...colTheme, bg: e.target.value } })} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
                          </label>
                          <label className="flex items-center space-x-1 cursor-pointer">
                            <span className="text-[10px] font-bold text-slate-500">Text</span>
                            <input type="color" value={colTheme.text} onChange={(e) => setHeaderTheme({ ...headerTheme, [col.key]: { ...colTheme, text: e.target.value } })} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 pb-2 border-b border-slate-200">Full Block Soft Backgrounds (Web, Excel, PDF)</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100 shadow-sm">
                    <span className="text-xs font-bold text-slate-800">Master Data Block</span>
                    <input type="color" value={sectionTheme.master} onChange={(e) => setSectionTheme({ ...sectionTheme, master: e.target.value })} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                  </div>
                  <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100 shadow-sm">
                    <span className="text-xs font-bold text-slate-800">Accumulated Total Block</span>
                    <input type="color" value={sectionTheme.accumulated} onChange={(e) => setSectionTheme({ ...sectionTheme, accumulated: e.target.value })} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                  </div>

                  <h5 className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider pt-3">Dynamic DP Blocks (Auto-rotates)</h5>
                  {sectionTheme.dps.map((color, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100 shadow-sm">
                      <span className="text-xs font-bold text-slate-800">DP Block Style #{idx + 1}</span>
                      <input type="color" value={color} onChange={(e) => { const newDps = [...sectionTheme.dps]; newDps[idx] = e.target.value; setSectionTheme({ ...sectionTheme, dps: newDps }); }} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
               <button onClick={() => { setHeaderTheme(DEFAULT_HEADER_COLORS); setSectionTheme(DEFAULT_SECTION_COLORS); }} className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-white px-4 py-2.5 rounded-xl border border-slate-300 shadow-sm transition-colors">
                 Reset Defaults
               </button>
               <button onClick={saveThemeConfig} disabled={isSavingGlobal} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-8 rounded-xl text-sm transition-all shadow-md disabled:opacity-50">
                 {isSavingGlobal ? 'Saving to DB...' : 'Save Themes Globally'}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* 2-Step DP Group Delete Modal */}
      {isDeleteGroupModalOpen && groupToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">⚠️</div>

            {deleteGroupStep === 1 ? (
              <>
                <h4 className="font-bold text-xl mb-2 text-slate-900">Delete DP Group?</h4>
                <p className="text-sm text-slate-500 mb-6 leading-relaxed">You are about to delete the global group <strong className="text-indigo-600">&quot;{groupToDelete}&quot;</strong>. It will be removed for all users.</p>
                <button onClick={() => setDeleteGroupStep(2)} className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-xl mb-3 text-sm shadow-md transition-colors">Proceed to Delete</button>
                <button onClick={() => setIsDeleteGroupModalOpen(false)} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition-colors">Cancel</button>
              </>
            ) : (
              <>
                <h4 className="font-bold text-xl mb-2 text-rose-600">Final Confirmation</h4>
                <p className="text-sm text-slate-600 mb-6 bg-rose-50 p-3 rounded-lg border border-rose-100">Click below to permanently delete this group from the database.</p>
                <button onClick={confirmDeleteGroup} disabled={isSavingGlobal} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl mb-3 text-sm shadow-md transition-colors disabled:opacity-50">
                  {isSavingGlobal ? 'Deleting...' : 'Confirm Deletion'}
                </button>
                <button onClick={() => setIsDeleteGroupModalOpen(false)} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition-colors">Cancel</button>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}