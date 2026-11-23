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

const GLOBAL_SETTINGS_ID = 'manifest_progress_report';

type TabLayout = 'STANDARD' | 'PRODUCT_TARGETS' | 'CRI';

type ReportSection = {
  id: string;
  title: string;
  type: string;
  columns: string[];
};

type ReportTab = {
  id: string;
  tab_id?: string;
  title: string;
  layout: TabLayout;
  sections: ReportSection[];
  items: string[];
  manifestTypes: string[];
  baseTargetProduct?: string;
};

interface ReportDataDict {
  [tabId: string]: any[];
}

interface BoolDict {
  [key: string]: boolean;
}

export default function ManifestProgressReportPage() {
  const [distributionPoints, setDistributionPoints] = useState<any[]>([]);
  const [manifestTypesList, setManifestTypesList] = useState<string[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedDps, setSelectedDps] = useState<string[]>([]);

  // Report Configuration (Global via Supabase)
  const [reportTabs, setReportTabs] = useState<ReportTab[]>([]);
  const [activeTabId, setActiveTabId] = useState('');
  const [reportData, setReportData] = useState<ReportDataDict>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingGlobal, setIsSavingGlobal] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Modals
  const [isAddTabOpen, setIsAddTabOpen] = useState(false);
  const [newTabTitle, setNewTabTitle] = useState('');
  const [newTabLayout, setNewTabLayout] = useState<TabLayout>('STANDARD');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTabSettings, setActiveTabSettings] = useState<ReportTab | null>(null);
  const [modalProdSearch, setModalProdSearch] = useState('');

  const showNotice = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4500);
  };

  // Persist all Manifest Progress settings globally in Supabase
  const persistGlobalSettings = async (
    nextTabs: ReportTab[],
    nextSelectedDps: string[],
    userEmailOverride?: string | null
  ) => {
    setIsSavingGlobal(true);
    try {
      const { error } = await supabase
        .from('report_builder_settings')
        .upsert(
          {
            id: GLOBAL_SETTINGS_ID,
            report_settings: {
              tabs: nextTabs,
              selected_dp_ids: nextSelectedDps
            },
            updated_by: userEmailOverride !== undefined ? userEmailOverride : currentUserEmail,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'id' }
        );

      if (error) throw error;
      return true;
    } catch (err: any) {
      console.error('Error saving global manifest progress settings:', err);
      showNotice(`Failed to save globally: ${err.message || 'Check report_builder_settings table'}`, 'error');
      return false;
    } finally {
      setIsSavingGlobal(false);
    }
  };

  useEffect(() => {
    const today = new Date();
    const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
    const currentDay = localToday.toISOString().split('T')[0];
    const firstDay = `${currentDay.substring(0, 7)}-01`;

    setFromDate(firstDay);
    setToDate(currentDay);

    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [authRes, dpRes, typeRes, prodRes, globalCfgRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('distribution_points').select('id, name, code').order('name'),
        supabase.from('manifest_types').select('name').order('sort_order'),
        supabase.from('products').select('id, name, code, unit_type').order('name'),
        supabase
          .from('report_builder_settings')
          .select('report_settings')
          .eq('id', GLOBAL_SETTINGS_ID)
          .maybeSingle()
      ]);

      const userEmail = authRes.data?.user?.email || null;
      if (userEmail) setCurrentUserEmail(userEmail);

      const allDps = dpRes.data || [];
      setDistributionPoints(allDps);

      if (typeRes.data) setManifestTypesList(typeRes.data.map((t: any) => t.name));
      if (prodRes.data) setAllProducts(prodRes.data);

      const validDpDict: BoolDict = {};
      allDps.forEach((dp: any) => {
        validDpDict[String(dp.id)] = true;
      });

      const savedCfg = globalCfgRes.data?.report_settings || {};

      // Restore globally saved Distribution Points (or default to all DPs)
      let initialSelectedDps = allDps.map((dp: any) => dp.id);
      if (Array.isArray(savedCfg.selected_dp_ids)) {
        initialSelectedDps = savedCfg.selected_dp_ids.filter((id: any) => validDpDict[String(id)]);
      }
      setSelectedDps(initialSelectedDps);

      // Restore globally saved Tabs (excluding any removed STOCK_SUMMARY layout)
      let loadedTabs: ReportTab[] = [];
      let migratedFromLegacy = false;

      if (Array.isArray(savedCfg.tabs) && savedCfg.tabs.length > 0) {
        loadedTabs = savedCfg.tabs
          .filter((t: any) => t && t.layout !== 'STOCK_SUMMARY')
          .map((t: any) => ({
            id: String(t.id || t.tab_id),
            tab_id: String(t.tab_id || t.id),
            title: String(t.title || 'Untitled Tab'),
            layout: (t.layout === 'CRI' || t.layout === 'PRODUCT_TARGETS' ? t.layout : 'STANDARD') as TabLayout,
            manifestTypes: Array.isArray(t.manifestTypes) ? t.manifestTypes : [],
            sections: Array.isArray(t.sections) ? t.sections : [],
            items: Array.isArray(t.items) ? t.items : [],
            baseTargetProduct: t.baseTargetProduct || ''
          }));
      } else {
        // One-time auto-migration from legacy report_configurations table
        const { data: legacyData } = await supabase
          .from('report_configurations')
          .select('*')
          .order('created_at');

        if (legacyData && legacyData.length > 0) {
          loadedTabs = legacyData
            .filter((cfg: any) => cfg.layout !== 'STOCK_SUMMARY')
            .map((cfg: any) => ({
              id: String(cfg.tab_id),
              tab_id: String(cfg.tab_id),
              title: String(cfg.title || 'Untitled Tab'),
              layout: (cfg.layout === 'CRI' || cfg.layout === 'PRODUCT_TARGETS' ? cfg.layout : 'STANDARD') as TabLayout,
              manifestTypes: cfg.manifest_types || [],
              sections: cfg.sections || [],
              items: cfg.items || [],
              baseTargetProduct: cfg.base_target_product || ''
            }));
          if (loadedTabs.length > 0) migratedFromLegacy = true;
        }
      }

      if (loadedTabs.length === 0) {
        loadedTabs = [
          {
            id: 'tab-default',
            tab_id: 'tab-default',
            title: 'LPG Regular',
            layout: 'STANDARD',
            manifestTypes: [],
            sections: [],
            items: [],
            baseTargetProduct: ''
          }
        ];
      }

      setReportTabs(loadedTabs);
      setActiveTabId(loadedTabs[0].id);

      // Push migrated legacy tabs into global table automatically
      if (migratedFromLegacy && !globalCfgRes.error) {
        const ok = await persistGlobalSettings(loadedTabs, initialSelectedDps, userEmail);
        if (ok) showNotice('Existing tab settings synced globally for all users!', 'success');
      }
    } catch (err) {
      console.error('Error fetching initial data:', err);
      showNotice('Failed to load initial settings.', 'error');
    }
    setIsLoading(false);
  };

  const handleDpToggle = (dpId: string) => {
    setSelectedDps(prev => (prev.includes(dpId) ? prev.filter(id => id !== dpId) : [...prev, dpId]));
  };

  const handleSaveGlobalDps = async () => {
    const ok = await persistGlobalSettings(reportTabs, selectedDps);
    if (ok) {
      showNotice(`Distribution Points (${selectedDps.length}) saved globally for all users!`, 'success');
    }
  };

  const handleAddTab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTabTitle.trim()) return;

    const newTabId = `tab-${Date.now()}`;
    const newTab: ReportTab = {
      id: newTabId,
      tab_id: newTabId,
      title: newTabTitle.trim(),
      layout: newTabLayout,
      manifestTypes: [],
      sections: [],
      items: [],
      baseTargetProduct: ''
    };

    const nextTabs = [...reportTabs, newTab];
    const ok = await persistGlobalSettings(nextTabs, selectedDps);

    if (ok) {
      setReportTabs(nextTabs);
      setActiveTabId(newTab.id);
      setIsAddTabOpen(false);
      setNewTabTitle('');
      setNewTabLayout('STANDARD');
      setReportData({});
      showNotice(`Tab "${newTab.title}" created globally!`, 'success');
    }
  };

  const handleToggleManifestTypeSetting = (mType: string) => {
    if (!activeTabSettings) return;

    let newTypes = [...activeTabSettings.manifestTypes];
    let newSections = [...activeTabSettings.sections];

    if (newTypes.includes(mType)) {
      newTypes = newTypes.filter(t => t !== mType);
      newSections = newSections.filter(s => s.type !== mType);
    } else {
      newTypes.push(mType);
      if (activeTabSettings.layout === 'STANDARD') {
        newSections.push({
          id: `sec-${mType.replace(/\s+/g, '-').toLowerCase()}`,
          title: mType,
          type: mType,
          columns: ['Target', 'Achieved', 'Achievement %']
        });
      }
    }
    setActiveTabSettings({ ...activeTabSettings, manifestTypes: newTypes, sections: newSections });
  };

  const handleToggleProductTargetItem = (prodName: string) => {
    if (!activeTabSettings) return;

    let newItems = [...activeTabSettings.items];
    let newSections = [...activeTabSettings.sections];

    if (newItems.includes(prodName)) {
      newItems = newItems.filter(i => i !== prodName);
      newSections = newSections.filter(s => s.title !== prodName);
    } else {
      newItems.push(prodName);
      newSections.push({
        id: `sec-prod-${prodName.replace(/\s+/g, '-').toLowerCase()}`,
        title: prodName,
        type: 'Product',
        columns: ['Target', 'Achieved', 'Achievement %']
      });
    }
    setActiveTabSettings({ ...activeTabSettings, items: newItems, sections: newSections });
  };

  const saveSettings = async () => {
    if (!activeTabSettings) return;

    const updatedTab: ReportTab = {
      ...activeTabSettings,
      title: activeTabSettings.title.trim() || activeTabSettings.title
    };
    const nextTabs = reportTabs.map(t => (t.id === updatedTab.id ? updatedTab : t));
    const ok = await persistGlobalSettings(nextTabs, selectedDps);

    if (ok) {
      setReportTabs(nextTabs);
      setIsSettingsOpen(false);
      setModalProdSearch('');
      setReportData({});
      showNotice(`Tab "${updatedTab.title}" configuration saved globally!`, 'success');
    }
  };

  const handleDeleteTab = async (tabId: string) => {
    if (!confirm('Are you sure you want to permanently delete this tab for all users?')) return;

    const updatedTabs = reportTabs.filter(t => t.id !== tabId);
    const ok = await persistGlobalSettings(updatedTabs, selectedDps);

    if (ok) {
      setReportTabs(updatedTabs);
      setIsSettingsOpen(false);
      setModalProdSearch('');
      if (updatedTabs.length > 0) setActiveTabId(updatedTabs[0].id);
      else setActiveTabId('');
      setReportData({});
      showNotice('Tab deleted globally.', 'success');
    }
  };

  // =========================================================================
  // REPORT CALCULATION LOGIC (STANDARD, PRODUCT_TARGETS, CRI)
  // =========================================================================
  const handleGenerateReport = async () => {
    if (selectedDps.length === 0) {
      showNotice('Please select at least one Distribution Point.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const { data: distData } = await supabase
        .from('distributions')
        .select('id, distribution_point_id, distribution_date, distribution_items(quantity, total_hh, products(name), manifests(id, title, manifest_type))')
        .gte('distribution_date', fromDate)
        .lte('distribution_date', toDate)
        .in('distribution_point_id', selectedDps);

      const { data: pastDistData } = await supabase
        .from('distributions')
        .select('id, distribution_point_id, distribution_items(quantity, products(name), manifests(manifest_type))')
        .lt('distribution_date', fromDate)
        .in('distribution_point_id', selectedDps);

      const { data: mnfData } = await supabase
        .from('manifests')
        .select('id, title, manifest_type, distribution_point_id, manifest_items(target_qty, products(name))')
        .in('distribution_point_id', selectedDps);

      let refillTargets: any[] = [];
      try {
        const { data: rTgt } = await supabase
          .from('lpg_refill_targets')
          .select('dp_id, target_date, final_target')
          .gte('target_date', fromDate)
          .lte('target_date', toDate)
          .in('dp_id', selectedDps);
        if (rTgt) refillTargets = rTgt;
      } catch (e) {}

      const generatedData: ReportDataDict = {};
      const tabDps = distributionPoints.filter(dp => selectedDps.includes(dp.id));

      reportTabs.forEach(tab => {
        const tabData = tabDps.map((dp, index) => {
          const rowData: any = {
            sl: index + 1,
            dp_name: dp.name,
            dp_code: dp.code
          };

          const dpDist = (distData || []).filter(d => d.distribution_point_id === dp.id);
          const dpPastDist = (pastDistData || []).filter(d => d.distribution_point_id === dp.id);
          const dpMnf = (mnfData || []).filter(
            m =>
              m.distribution_point_id === dp.id &&
              (tab.manifestTypes.length === 0 || tab.manifestTypes.includes(m.manifest_type))
          );

          if (tab.layout === 'STANDARD') {
            tab.sections.forEach((sec: any) => {
              let secTarget = 0;
              let secAchieved = 0;

              const secDistItems = dpDist
                .flatMap(d => d.distribution_items)
                .filter((di: any) => di.manifests && di.manifests.manifest_type === sec.type);
              secAchieved = secDistItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

              if (sec.type?.toLowerCase().includes('refill')) {
                secTarget = refillTargets
                  .filter(r => r.dp_id === dp.id)
                  .reduce((sum, r) => sum + (Number(r.final_target) || 0), 0);
              } else {
                const secMnfs = dpMnf.filter(m => m.manifest_type === sec.type);
                const grossTarget = secMnfs
                  .flatMap(m => m.manifest_items)
                  .reduce((sum, item) => sum + (Number(item.target_qty) || 0), 0);

                const pastDistItems = dpPastDist
                  .flatMap(d => d.distribution_items)
                  .filter((di: any) => di.manifests && di.manifests.manifest_type === sec.type);
                const pastAchieved = pastDistItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

                secTarget = Math.max(0, grossTarget - pastAchieved);
              }

              sec.columns.forEach((col: string) => {
                if (col.toLowerCase() === 'target') rowData[`${sec.id}_${col}`] = secTarget || 0;
                else if (col.toLowerCase() === 'achieved') rowData[`${sec.id}_${col}`] = secAchieved || 0;
                else if (col.toLowerCase().includes('%') || col.toLowerCase().includes('achievement')) {
                  rowData[`${sec.id}_${col}`] =
                    secTarget > 0
                      ? ((secAchieved / secTarget) * 100).toFixed(2) + '%'
                      : secAchieved > 0
                      ? '100%'
                      : '0%';
                }
              });
            });

            const stdDistItems = dpDist
              .flatMap(d => d.distribution_items)
              .filter(
                (di: any) =>
                  di.manifests &&
                  (tab.manifestTypes.length === 0 || tab.manifestTypes.includes(di.manifests.manifest_type))
              );
            const uniqueManifests = Array.from(new Set(stdDistItems.map((di: any) => di.manifests?.title))).filter(Boolean);
            rowData['Manifest Name'] = uniqueManifests.join(', ');
          } else if (tab.layout === 'CRI') {
            const criDistItems = dpDist
              .flatMap(d => d.distribution_items)
              .filter(
                (di: any) =>
                  di.manifests &&
                  (tab.manifestTypes.length === 0 || tab.manifestTypes.includes(di.manifests.manifest_type))
              );
            const criPastDistItems = dpPastDist
              .flatMap(d => d.distribution_items)
              .filter(
                (di: any) =>
                  di.manifests &&
                  (tab.manifestTypes.length === 0 || tab.manifestTypes.includes(di.manifests.manifest_type))
              );

            let hhTarget = 0;
            let hhCovered = 0;

            if (tab.baseTargetProduct) {
              const baseGrossTarget = dpMnf
                .flatMap(m => m.manifest_items)
                .filter((mi: any) => mi.products?.name === tab.baseTargetProduct)
                .reduce((sum, item) => sum + (Number(item.target_qty) || 0), 0);
              const basePastAchieved = criPastDistItems
                .filter((di: any) => di.products?.name === tab.baseTargetProduct)
                .reduce((sum, di) => sum + (Number(di.quantity) || 0), 0);

              hhTarget = Math.max(0, baseGrossTarget - basePastAchieved);
              hhCovered = criDistItems
                .filter((di: any) => di.products?.name === tab.baseTargetProduct)
                .reduce((sum, di) => sum + (Number(di.quantity) || 0), 0);
            } else {
              hhTarget = dpMnf
                .flatMap(m => m.manifest_items)
                .reduce((max, item) => Math.max(max, Number(item.target_qty) || 0), 0);
              hhCovered = criDistItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
            }

            rowData['HH Target'] = hhTarget || 0;
            rowData['HH Covered'] = hhCovered || 0;
            rowData['HH Achievement %'] =
              hhTarget > 0 ? ((hhCovered / hhTarget) * 100).toFixed(2) + '%' : hhCovered > 0 ? '100%' : '0%';

            tab.items.forEach(item => {
              rowData[item] = criDistItems
                .filter((di: any) => di.products?.name === item)
                .reduce((sum, di) => sum + (Number(di.quantity) || 0), 0);
            });

            const uniqueManifests = Array.from(new Set(criDistItems.map((di: any) => di.manifests?.title))).filter(Boolean);
            rowData['Manifest Name'] = uniqueManifests.join(', ');
          } else if (tab.layout === 'PRODUCT_TARGETS') {
            const distItems = dpDist
              .flatMap(d => d.distribution_items)
              .filter(
                (di: any) =>
                  di.manifests &&
                  (tab.manifestTypes.length === 0 || tab.manifestTypes.includes(di.manifests.manifest_type))
              );
            const pastDistItems = dpPastDist
              .flatMap(d => d.distribution_items)
              .filter(
                (di: any) =>
                  di.manifests &&
                  (tab.manifestTypes.length === 0 || tab.manifestTypes.includes(di.manifests.manifest_type))
              );

            tab.sections.forEach((sec: any) => {
              const prodName = sec.title;

              const grossTarget = dpMnf
                .flatMap(m => m.manifest_items)
                .filter((mi: any) => mi.products?.name === prodName)
                .reduce((sum, item) => sum + (Number(item.target_qty) || 0), 0);
              const pastAchieved = pastDistItems
                .filter((di: any) => di.products?.name === prodName)
                .reduce((sum, di) => sum + (Number(di.quantity) || 0), 0);

              const prodTarget = Math.max(0, grossTarget - pastAchieved);
              const prodAchieved = distItems
                .filter((di: any) => di.products?.name === prodName)
                .reduce((sum, di) => sum + (Number(di.quantity) || 0), 0);

              sec.columns.forEach((col: string) => {
                if (col.toLowerCase() === 'target') rowData[`${sec.id}_${col}`] = prodTarget || 0;
                else if (col.toLowerCase() === 'achieved') rowData[`${sec.id}_${col}`] = prodAchieved || 0;
                else if (col.toLowerCase().includes('%') || col.toLowerCase().includes('achievement')) {
                  rowData[`${sec.id}_${col}`] =
                    prodTarget > 0
                      ? ((prodAchieved / prodTarget) * 100).toFixed(2) + '%'
                      : prodAchieved > 0
                      ? '100%'
                      : '0%';
                }
              });
            });

            const uniqueManifests = Array.from(new Set(distItems.map((di: any) => di.manifests?.title))).filter(Boolean);
            rowData['Manifest Name'] = uniqueManifests.join(', ');
          }
          return rowData;
        });

        generatedData[tab.id] = tabData;
      });

      setReportData(generatedData);
    } catch (err) {
      console.error('Error generating report:', err);
      showNotice('Error generating report.', 'error');
    }
    setIsLoading(false);
  };

  // =========================================================================
  // EXCEL & PDF EXPORTS
  // =========================================================================
  const handleExportExcel = () => {
    if (Object.keys(reportData).length === 0) return;
    const wb = XLSX.utils.book_new();

    const borderStyle = {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } }
    };

    reportTabs.forEach(tab => {
      const tabData = reportData[tab.id];
      if (!tabData || tabData.length === 0) return;

      const aoa: any[][] = [];

      if (tab.layout === 'STANDARD' || tab.layout === 'PRODUCT_TARGETS') {
        const header1 = ['SL', 'Distribution Point'];
        const header2 = ['', ''];
        tab.sections.forEach(sec => {
          header1.push(sec.title);
          for (let i = 1; i < sec.columns.length; i++) header1.push('');
          sec.columns.forEach(col => header2.push(col));
        });
        header1.push('Manifest Name');
        header2.push('');

        aoa.push([`${tab.title} Distribution Report (${fromDate} to ${toDate})`]);
        aoa.push([]);
        aoa.push(header1);
        aoa.push(header2);

        tabData.forEach(row => {
          const rowData = [row.sl, row.dp_name];
          tab.sections.forEach(sec => {
            sec.columns.forEach(col => rowData.push(row[`${sec.id}_${col}`] || 0));
          });
          rowData.push(row['Manifest Name'] || '');
          aoa.push(rowData);
        });
      } else {
        const header = ['SL', 'Distribution Point', 'HH Target', 'HH Covered', 'HH Achievement %', ...tab.items, 'Manifest Name'];
        aoa.push([`${tab.title} Distribution Report (${fromDate} to ${toDate})`]);
        aoa.push([]);
        aoa.push(header);

        tabData.forEach(row => {
          const rowData = [row.sl, row.dp_name, row['HH Target'], row['HH Covered'], row['HH Achievement %']];
          tab.items.forEach(item => rowData.push(row[item] || 0));
          rowData.push(row['Manifest Name'] || '');
          aoa.push(rowData);
        });
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa) as any;

      const headerRows = tab.layout === 'STANDARD' || tab.layout === 'PRODUCT_TARGETS' ? [2, 3] : [2];
      const dataStartRow = tab.layout === 'STANDARD' || tab.layout === 'PRODUCT_TARGETS' ? 4 : 3;

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

          if (headerRows.includes(rowNum)) {
            cell.s.font = { bold: true, color: { rgb: '000000' } };
            cell.s.fill = { fgColor: { rgb: 'E2E8F0' } };
          } else if (rowNum >= dataStartRow) {
            cell.s.font = { color: { rgb: '000000' } };
          }
        }
      }

      if ((tab.layout === 'STANDARD' || tab.layout === 'PRODUCT_TARGETS') && tab.sections.length > 0) {
        if (!ws['!merges']) ws['!merges'] = [];
        ws['!merges'].push({ s: { r: 2, c: 0 }, e: { r: 3, c: 0 } });
        ws['!merges'].push({ s: { r: 2, c: 1 }, e: { r: 3, c: 1 } });

        let currentC = 2;
        tab.sections.forEach(sec => {
          ws['!merges'].push({ s: { r: 2, c: currentC }, e: { r: 2, c: currentC + sec.columns.length - 1 } });
          currentC += sec.columns.length;
        });
        ws['!merges'].push({ s: { r: 2, c: currentC }, e: { r: 3, c: currentC } });
      }

      const refStartRow = 2;
      const colWidths = aoa[refStartRow].map((_, colIndex) => {
        let maxLength = colIndex === 0 ? 5 : 10;
        for (let r = refStartRow; r < aoa.length; r++) {
          const val = aoa[r][colIndex] ? aoa[r][colIndex].toString() : '';
          if (val.length > maxLength) maxLength = val.length;
        }
        return { wch: Math.min(maxLength + 2, 40) };
      });
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, tab.title.substring(0, 31));
    });

    XLSX.writeFile(wb, `Manifest_Progress_Report_${fromDate}.xlsx`);
  };

  const handleExportPDF = () => {
    if (Object.keys(reportData).length === 0) return;
    const doc = new jsPDF('landscape');

    reportTabs.forEach((tab, index) => {
      const tabData = reportData[tab.id];
      if (!tabData || tabData.length === 0) return;

      if (index > 0) doc.addPage();

      doc.setFontSize(14);
      doc.text(`${tab.title} Report`, 14, 15);
      doc.setFontSize(9);
      doc.text(`Period: ${fromDate} to ${toDate} | Generated on: ${new Date().toLocaleString()}`, 14, 21);

      if (tab.layout === 'STANDARD' || tab.layout === 'PRODUCT_TARGETS') {
        const head1: any[] = [{ content: 'SL', rowSpan: 2 }, { content: 'Distribution Point', rowSpan: 2 }];
        const head2: any[] = [];

        tab.sections.forEach(sec => {
          head1.push({ content: sec.title, colSpan: sec.columns.length, styles: { halign: 'center' } });
          sec.columns.forEach(col => head2.push(col));
        });
        head1.push({ content: 'Manifest Name', rowSpan: 2, styles: { halign: 'center' } });

        const body = tabData.map(row => {
          const r = [row.sl, row.dp_name];
          tab.sections.forEach(sec => sec.columns.forEach(col => r.push(row[`${sec.id}_${col}`] || '0')));
          r.push(row['Manifest Name'] || '');
          return r;
        });

        autoTable(doc, {
          head: [head1, head2],
          body: body,
          startY: 26,
          styles: { fontSize: 7, cellPadding: 2, textColor: [0, 0, 0], lineColor: [200, 200, 200], lineWidth: 0.1 },
          headStyles: { fillColor: [79, 70, 229] },
          theme: 'grid'
        });
      } else if (tab.layout === 'CRI') {
        const head = [['SL', 'Distribution Point', 'HH Target', 'HH Covered', 'HH %', ...tab.items, 'Manifest Name']];
        const body = tabData.map(row => {
          const r = [row.sl, row.dp_name, row['HH Target'], row['HH Covered'], row['HH Achievement %']];
          tab.items.forEach(item => r.push(row[item] || '0'));
          r.push(row['Manifest Name'] || '');
          return r;
        });

        autoTable(doc, {
          head: head,
          body: body,
          startY: 26,
          styles: { fontSize: 7, cellPadding: 2, textColor: [0, 0, 0], lineColor: [200, 200, 200], lineWidth: 0.1 },
          headStyles: { fillColor: [79, 70, 229] },
          theme: 'grid'
        });
      }
    });

    doc.save(`Manifest_Progress_Report_${fromDate}.pdf`);
  };

  const activeTab = reportTabs.find(t => t.id === activeTabId);
  const filteredModalProducts = allProducts.filter(p => {
    const q = modalProdSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.code || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full w-full animate-in fade-in duration-500 relative bg-slate-50 text-black">

      {/* Toast Notification */}
      {msg.text && (
        <div
          className={`fixed top-24 left-1/2 -translate-x-1/2 z-[120] w-[92%] max-w-md px-4 py-3 rounded-xl shadow-lg border text-xs md:text-sm font-bold flex items-center justify-between animate-in slide-in-from-top-2 ${
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

      {/* Tab Settings Modal */}
      {isSettingsOpen && activeTabSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-black">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 max-h-[90vh]">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-lg text-black">Tab Configuration (Global)</h3>
                <p className="text-xs text-indigo-600 font-bold mt-0.5">
                  Editing: {activeTabSettings.title} • Saved to database for all users
                </p>
              </div>
              <button
                onClick={() => {
                  setIsSettingsOpen(false);
                  setModalProdSearch('');
                }}
                className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-100"
              >
                <Icons.Close />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-2">Tab Title</label>
                <input
                  type="text"
                  value={activeTabSettings.title}
                  onChange={e => setActiveTabSettings({ ...activeTabSettings, title: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg text-sm font-bold text-black focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-black text-slate-700 uppercase">
                    Assign Manifest Types (Auto generates sections for standard layout)
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 p-3 border-2 border-slate-200 rounded-xl bg-slate-50">
                  {manifestTypesList.length === 0 ? <span className="text-xs text-slate-500">No Types found.</span> : null}
                  {manifestTypesList.map(mType => (
                    <label
                      key={mType}
                      className={`flex items-center space-x-1.5 px-2 py-1.5 rounded border cursor-pointer text-xs font-bold transition-colors ${
                        activeTabSettings.manifestTypes.includes(mType)
                          ? 'bg-indigo-100 border-indigo-300 text-indigo-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={activeTabSettings.manifestTypes.includes(mType)}
                        onChange={() => handleToggleManifestTypeSetting(mType)}
                        className="w-3 h-3 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                      <span>{mType}</span>
                    </label>
                  ))}
                </div>
              </div>

              {activeTabSettings.layout === 'STANDARD' ? (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-xs font-black text-slate-700 uppercase">Sections &amp; Columns</label>
                  </div>
                  {activeTabSettings.sections.length === 0 && (
                    <p className="text-xs text-rose-500 font-bold">Select Manifest Types above to generate sections.</p>
                  )}
                  <div className="space-y-3">
                    {activeTabSettings.sections.map(sec => (
                      <div key={sec.id} className="p-3 border-2 border-slate-200 rounded-xl bg-slate-50 flex gap-3 items-center">
                        <span className="font-black text-indigo-700 w-1/3 truncate">{sec.title}</span>
                        <div className="flex gap-2 items-center flex-wrap flex-1">
                          <span className="text-[10px] font-bold text-slate-500">Cols:</span>
                          {sec.columns.map((col, cIdx) => (
                            <span
                              key={cIdx}
                              className="text-[9px] bg-white border border-slate-300 px-1.5 py-0.5 rounded font-black text-slate-700 flex items-center gap-1"
                            >
                              {col}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : activeTabSettings.layout === 'PRODUCT_TARGETS' ? (
                <div>
                  <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                    <label className="block text-xs font-black text-slate-700 uppercase">
                      Include Items / Products (Generates Target Sections)
                    </label>
                    <div className="space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          const newSections = allProducts.map(prod => ({
                            id: `sec-prod-${prod.name.replace(/\s+/g, '-').toLowerCase()}`,
                            title: prod.name,
                            type: 'Product',
                            columns: ['Target', 'Achieved', 'Achievement %']
                          }));
                          setActiveTabSettings({
                            ...activeTabSettings,
                            items: allProducts.map(p => p.name),
                            sections: newSections
                          });
                        }}
                        className="text-[10px] font-bold text-indigo-600 hover:underline"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTabSettings({ ...activeTabSettings, items: [], sections: [] })}
                        className="text-[10px] font-bold text-rose-600 hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="Search products by name or code..."
                    value={modalProdSearch}
                    onChange={e => setModalProdSearch(e.target.value)}
                    className="w-full px-3 py-1.5 mb-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                  />
                  <div className="p-4 border-2 border-slate-200 rounded-xl bg-slate-50">
                    <div className="flex flex-wrap gap-2">
                      {filteredModalProducts.length === 0 ? (
                        <span className="text-xs text-slate-500">No Products found.</span>
                      ) : null}
                      {filteredModalProducts.map(prod => (
                        <label
                          key={prod.id}
                          className={`flex items-center space-x-1.5 px-2 py-1 rounded border cursor-pointer text-xs font-bold transition-colors ${
                            activeTabSettings.items.includes(prod.name)
                              ? 'bg-indigo-100 border-indigo-300 text-indigo-900'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={activeTabSettings.items.includes(prod.name)}
                            onChange={() => handleToggleProductTargetItem(prod.name)}
                            className="w-3 h-3 text-indigo-600 rounded focus:ring-indigo-500"
                          />
                          <span>{prod.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase mb-2">
                      Base Target Product (For HH Target Calculation)
                    </label>
                    <select
                      value={activeTabSettings.baseTargetProduct || ''}
                      onChange={e => setActiveTabSettings({ ...activeTabSettings, baseTargetProduct: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-bold text-black focus:border-indigo-500 outline-none cursor-pointer"
                    >
                      <option value="">-- Select a base product --</option>
                      {allProducts.map(prod => (
                        <option key={prod.id} value={prod.name}>
                          {prod.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                      <label className="block text-xs font-black text-slate-700 uppercase">
                        Include Items / Products (Columns)
                      </label>
                      <div className="space-x-2">
                        <button
                          type="button"
                          onClick={() => setActiveTabSettings({ ...activeTabSettings, items: allProducts.map(p => p.name) })}
                          className="text-[10px] font-bold text-indigo-600 hover:underline"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTabSettings({ ...activeTabSettings, items: [] })}
                          className="text-[10px] font-bold text-rose-600 hover:underline"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Search products by name or code..."
                      value={modalProdSearch}
                      onChange={e => setModalProdSearch(e.target.value)}
                      className="w-full px-3 py-1.5 mb-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                    />
                    <div className="p-4 border-2 border-slate-200 rounded-xl bg-slate-50">
                      <div className="flex flex-wrap gap-2">
                        {filteredModalProducts.length === 0 ? (
                          <span className="text-xs text-slate-500">No Products found.</span>
                        ) : null}
                        {filteredModalProducts.map(prod => (
                          <label
                            key={prod.id}
                            className={`flex items-center space-x-1.5 px-2 py-1 rounded border cursor-pointer text-xs font-bold transition-colors ${
                              activeTabSettings.items.includes(prod.name)
                                ? 'bg-indigo-100 border-indigo-300 text-indigo-900'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={activeTabSettings.items.includes(prod.name)}
                              onChange={() => {
                                const newItems = activeTabSettings.items.includes(prod.name)
                                  ? activeTabSettings.items.filter(i => i !== prod.name)
                                  : [...activeTabSettings.items, prod.name];
                                setActiveTabSettings({ ...activeTabSettings, items: newItems });
                              }}
                              className="w-3 h-3 text-indigo-600 rounded focus:ring-indigo-500"
                            />
                            <span>{prod.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-200 bg-slate-50 flex justify-between rounded-b-2xl">
              <button
                type="button"
                onClick={() => handleDeleteTab(activeTabSettings.id)}
                disabled={isSavingGlobal}
                className="px-4 py-2 bg-rose-100 text-rose-700 font-bold rounded-lg hover:bg-rose-200 text-sm disabled:opacity-50"
              >
                Delete Tab
              </button>
              <div className="space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsOpen(false);
                    setModalProdSearch('');
                  }}
                  className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={isSavingGlobal}
                  className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 text-sm shadow-md disabled:opacity-50"
                >
                  {isSavingGlobal ? 'Saving...' : 'Save Global Config'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Tab Modal (Warehouse Stock option removed) */}
      {isAddTabOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-black">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center animate-in zoom-in-95">
            <h4 className="font-bold text-lg mb-4 text-slate-900">Add New Report Tab</h4>
            <form onSubmit={handleAddTab} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-black text-slate-600 mb-1">Tab Title</label>
                <input
                  type="text"
                  value={newTabTitle}
                  onChange={e => setNewTabTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-bold text-black focus:border-indigo-500 outline-none"
                  placeholder="e.g. Wash Distribution"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-600 mb-1">Layout Format</label>
                <select
                  value={newTabLayout}
                  onChange={e => setNewTabLayout(e.target.value as TabLayout)}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-bold text-black focus:border-indigo-500 outline-none cursor-pointer"
                >
                  <option value="STANDARD">Standard (Target per Manifest Type)</option>
                  <option value="PRODUCT_TARGETS">Product Targets (Target per item)</option>
                  <option value="CRI">CRI Format (HH Coverage &amp; Single Items)</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddTabOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingGlobal}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md transition-colors disabled:opacity-50"
                >
                  {isSavingGlobal ? 'Creating...' : 'Create Tab'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header (pr-16 md:pr-20 avoids floating profile overlap) */}
      <header className="flex min-h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 pr-16 md:pr-20 shrink-0 z-20 shadow-sm justify-between flex-wrap gap-3 py-3 sticky top-0">
        <div className="flex items-center">
          <button
            onClick={() => window.history.back()}
            className="mr-3 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h2 className="text-lg md:text-2xl font-bold text-slate-900">Manifest Progress Report</h2>
            <p className="text-[10px] md:text-sm text-slate-500 hidden md:block">
              Interactive distribution progress and reconciliation (Global Settings)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            disabled={Object.keys(reportData).length === 0}
            className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg hover:bg-emerald-100 transition-colors flex items-center shadow-sm disabled:opacity-50"
          >
            <Icons.Download /> <span className="ml-1">Export Excel</span>
          </button>
          <button
            onClick={handleExportPDF}
            disabled={Object.keys(reportData).length === 0}
            className="px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg hover:bg-rose-100 transition-colors flex items-center shadow-sm disabled:opacity-50"
          >
            <Icons.Download /> <span className="ml-1">Export PDF</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col space-y-4 md:space-y-6 relative text-black">

        {/* Filter Section */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">

          {/* Date Range */}
          <div className="flex flex-wrap gap-4 items-end border-b border-slate-100 pb-4">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-black outline-none focus:border-indigo-500 shadow-sm cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-black outline-none focus:border-indigo-500 shadow-sm cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handleSaveGlobalDps}
                disabled={isSavingGlobal || isLoading}
                className="px-4 py-2 bg-slate-900 text-white text-xs md:text-sm font-bold rounded-lg hover:bg-slate-800 transition-colors shadow-sm h-10 disabled:opacity-50"
                title="Save selected Distribution Points globally for all users"
              >
                {isSavingGlobal ? 'Saving...' : '💾 Save Global Settings'}
              </button>
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={isLoading}
                className="px-6 py-2 bg-indigo-600 text-white text-xs md:text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-md h-10 disabled:opacity-50"
              >
                {isLoading ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
          </div>

          {/* Multiple DP Selection (Global) */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase">
                  Distribution Points ({selectedDps.length} / {distributionPoints.length})
                </label>
                <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full uppercase">
                  Global
                </span>
              </div>
              <div className="space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedDps(distributionPoints.map(d => d.id))}
                  className="text-[10px] font-bold text-indigo-600 hover:underline"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDps([])}
                  className="text-[10px] font-bold text-rose-600 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto custom-scrollbar p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              {distributionPoints.length === 0 ? (
                <span className="text-xs text-slate-400 p-1 font-bold">Loading DPs...</span>
              ) : null}
              {distributionPoints.map(dp => (
                <label
                  key={dp.id}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border cursor-pointer text-xs font-bold transition-colors ${
                    selectedDps.includes(dp.id)
                      ? 'bg-indigo-100 border-indigo-300 text-indigo-900'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedDps.includes(dp.id)}
                    onChange={() => handleDpToggle(dp.id)}
                    className="w-3 h-3 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                  <span>{dp.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Dynamic Tabs & Report Display */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full min-h-[500px]">

          {/* Tabs Header with Edit Icons */}
          <div className="flex bg-slate-100 border-b border-slate-200 px-2 pt-2 gap-1 overflow-x-auto custom-scrollbar shrink-0">
            {reportTabs.map(tab => (
              <div
                key={tab.id}
                className={`flex items-center rounded-t-xl transition-colors border-t border-x ${
                  activeTabId === tab.id
                    ? 'bg-white border-slate-200 border-b-white z-10'
                    : 'bg-slate-200/50 border-transparent hover:bg-slate-200'
                }`}
                style={activeTabId === tab.id ? { marginBottom: '-1px' } : {}}
              >
                <button
                  onClick={() => setActiveTabId(tab.id)}
                  className={`px-4 py-2.5 text-sm font-black whitespace-nowrap ${
                    activeTabId === tab.id ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.title}
                </button>
                {activeTabId === tab.id && (
                  <button
                    onClick={() => {
                      setActiveTabSettings(tab);
                      setModalProdSearch('');
                      setIsSettingsOpen(true);
                    }}
                    className="pr-3 text-indigo-400 hover:text-indigo-700 transition-colors"
                    title="Edit Tab"
                  >
                    <span className="text-sm">⚙️</span>
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setIsAddTabOpen(true)}
              className="px-3 py-2.5 text-slate-400 hover:text-indigo-600 flex items-center gap-1 text-xs font-bold transition-colors whitespace-nowrap"
            >
              <Icons.Plus /> Add Tab
            </button>
          </div>

          {/* Report Table */}
          <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-white relative">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                <Icons.Spinner />
              </div>
            ) : Object.keys(reportData).length === 0 || !activeTab ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <span className="text-5xl mb-4">📊</span>
                <p className="font-bold text-black">Select parameters and Generate Report</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-max">
                <thead className="sticky top-0 z-10 bg-white">
                  {activeTab.layout === 'STANDARD' || activeTab.layout === 'PRODUCT_TARGETS' ? (
                    <>
                      <tr>
                        <th
                          rowSpan={2}
                          className="p-3 bg-slate-100 border border-slate-300 text-xs font-black text-slate-700 text-center w-12 shadow-sm"
                        >
                          SL
                        </th>
                        <th
                          rowSpan={2}
                          className="p-3 bg-slate-100 border border-slate-300 text-xs font-black text-slate-700 shadow-sm w-48"
                        >
                          Distribution Point
                        </th>
                        {activeTab.sections.map(sec => (
                          <th
                            key={`super-${sec.id}`}
                            colSpan={sec.columns.length}
                            className="p-2 bg-indigo-50 border border-indigo-200 text-xs font-black text-indigo-900 text-center shadow-sm uppercase tracking-wide"
                          >
                            {sec.title}
                          </th>
                        ))}
                        <th
                          rowSpan={2}
                          className="p-3 bg-slate-100 border border-slate-300 text-[10px] font-black text-slate-700 shadow-sm uppercase"
                        >
                          Manifest Name
                        </th>
                      </tr>
                      <tr>
                        {activeTab.sections.map(sec =>
                          sec.columns.map((col, idx) => (
                            <th
                              key={`col-${sec.id}-${idx}`}
                              className="p-2 bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-800 text-center shadow-sm uppercase"
                            >
                              {col}
                            </th>
                          ))
                        )}
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <th className="p-3 bg-slate-100 border border-slate-300 text-[10px] font-black text-slate-700 text-center w-12 shadow-sm uppercase">
                        SL
                      </th>
                      <th className="p-3 bg-slate-100 border border-slate-300 text-[10px] font-black text-slate-700 shadow-sm w-48 uppercase">
                        Distribution Point
                      </th>
                      <th className="p-3 bg-indigo-50 border border-indigo-200 text-[10px] font-black text-indigo-900 text-center shadow-sm uppercase">
                        HH Target
                      </th>
                      <th className="p-3 bg-indigo-50 border border-indigo-200 text-[10px] font-black text-indigo-900 text-center shadow-sm uppercase">
                        HH Covered
                      </th>
                      <th className="p-3 bg-indigo-50 border border-indigo-200 text-[10px] font-black text-indigo-900 text-center shadow-sm uppercase">
                        HH Achievement %
                      </th>
                      {activeTab.items.map((item, idx) => (
                        <th
                          key={`col-${idx}`}
                          className="p-2 bg-emerald-50 border border-emerald-200 text-[10px] font-black text-emerald-900 text-center shadow-sm uppercase max-w-[120px]"
                        >
                          {item}
                        </th>
                      ))}
                      <th className="p-3 bg-slate-100 border border-slate-300 text-[10px] font-black text-slate-700 shadow-sm uppercase">
                        Manifest Name
                      </th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {(reportData[activeTabId] || []).map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-3 border border-slate-200 text-sm font-bold text-slate-700 text-center bg-slate-50/50">
                        {row.sl}
                      </td>
                      <td className="p-3 border border-slate-200">
                        <p className="font-bold text-slate-900 text-sm">{row.dp_name}</p>
                        <p className="text-[10px] text-slate-700 font-mono font-bold mt-0.5">{row.dp_code}</p>
                      </td>

                      {activeTab.layout === 'STANDARD' || activeTab.layout === 'PRODUCT_TARGETS' ? (
                        <>
                          {activeTab.sections.map(sec =>
                            sec.columns.map((col, cIdx) => {
                              const cellVal = row[`${sec.id}_${col}`] || '-';
                              const isPercentage =
                                col.toLowerCase().includes('%') || col.toLowerCase().includes('achievement %');

                              const renderCell = () => {
                                if (isPercentage && cellVal !== '-') {
                                  const pct = parseFloat(cellVal);
                                  const barColor =
                                    pct >= 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-amber-500' : 'bg-rose-500';
                                  return (
                                    <div className="flex flex-col items-center justify-center gap-1 w-full px-2">
                                      <span className="font-black text-xs text-black">{cellVal}</span>
                                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                        <div
                                          className={`h-1.5 rounded-full ${barColor}`}
                                          style={{ width: `${Math.min(pct, 100)}%` }}
                                        />
                                      </div>
                                    </div>
                                  );
                                }
                                return (
                                  <span
                                    className={`font-bold text-sm ${
                                      typeof cellVal === 'number' ? 'text-indigo-700' : 'text-black'
                                    }`}
                                  >
                                    {cellVal}
                                  </span>
                                );
                              };

                              return (
                                <td key={`data-${sec.id}-${cIdx}`} className="p-2 border border-slate-200 text-center align-middle">
                                  {renderCell()}
                                </td>
                              );
                            })
                          )}
                          <td className="p-2 border border-slate-200 align-middle">
                            <div className="text-[10px] font-bold text-black bg-slate-100 p-1.5 rounded border border-slate-200 break-words max-w-[200px] leading-tight">
                              {row['Manifest Name'] || '-'}
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-2 border border-slate-200 text-center align-middle font-bold text-sm text-indigo-700">
                            {row['HH Target']}
                          </td>
                          <td className="p-2 border border-slate-200 text-center align-middle font-bold text-sm text-black">
                            {row['HH Covered']}
                          </td>
                          <td className="p-2 border border-slate-200 text-center align-middle">
                            {row['HH Achievement %'] !== '-' && (
                              <div className="flex flex-col items-center justify-center gap-1 w-full px-2">
                                <span className="font-black text-xs text-black">{row['HH Achievement %']}</span>
                                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-1.5 rounded-full ${
                                      parseFloat(row['HH Achievement %']) >= 100
                                        ? 'bg-emerald-500'
                                        : 'bg-amber-500'
                                    }`}
                                    style={{ width: `${Math.min(parseFloat(row['HH Achievement %']), 100)}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </td>
                          {activeTab.items.map((item, iIdx) => (
                            <td
                              key={`data-item-${iIdx}`}
                              className="p-2 border border-slate-200 text-center align-middle font-bold text-sm text-emerald-700"
                            >
                              {row[item] || '0'}
                            </td>
                          ))}
                          <td className="p-2 border border-slate-200 align-middle">
                            <div className="text-[10px] font-bold text-black bg-slate-100 p-1.5 rounded border border-slate-200 break-words max-w-[200px] leading-tight">
                              {row['Manifest Name'] || '-'}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}