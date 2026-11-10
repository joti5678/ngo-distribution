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
  layout: 'STANDARD' | 'CRI' | 'PRODUCT_TARGETS' | 'STOCK_SUMMARY'; 
  sections: ReportSection[];
  items: string[]; // Used for products
  manifestTypes: string[]; 
  baseTargetProduct?: string; 
  warehouses?: string[]; // Specific warehouses for Stock Summary tab
};

export default function ManifestProgressReportPage() {
  const [distributionPoints, setDistributionPoints] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [manifestTypesList, setManifestTypesList] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  
  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedDps, setSelectedDps] = useState<string[]>([]);

  // Report Configuration
  const [reportTabs, setReportTabs] = useState<ReportTab[]>([]);
  const [activeTabId, setActiveTabId] = useState('');
  const [reportData, setReportData] = useState<Record<string, any[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Modals
  const [isAddTabOpen, setIsAddTabOpen] = useState(false);
  const [newTabTitle, setNewTabTitle] = useState('');
  const [newTabLayout, setNewTabLayout] = useState<'STANDARD' | 'CRI' | 'PRODUCT_TARGETS' | 'STOCK_SUMMARY'>('STANDARD');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTabSettings, setActiveTabSettings] = useState<ReportTab | null>(null);

  useEffect(() => {
    fetchInitialData();
    
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    const currentDay = today.toISOString().split('T')[0];
    
    const firstDayDate = new Date(today.getFullYear(), today.getMonth(), 1);
    firstDayDate.setMinutes(firstDayDate.getMinutes() - firstDayDate.getTimezoneOffset());
    const firstDay = firstDayDate.toISOString().split('T')[0];
    
    setFromDate(firstDay);
    setToDate(currentDay);
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [dpRes, whRes, typeRes, prodRes, configRes] = await Promise.all([
         supabase.from('distribution_points').select('id, name, code').order('name'),
         supabase.from('warehouses').select('id, name').order('name'),
         supabase.from('manifest_types').select('name').order('sort_order'),
         supabase.from('products').select('id, name, code, unit_type').order('name'),
         supabase.from('report_configurations').select('*').order('created_at')
      ]);

      if (dpRes.data) {
        setDistributionPoints(dpRes.data);
        setSelectedDps(dpRes.data.map(dp => dp.id));
      }
      if (whRes.data) {
        setWarehouses(whRes.data);
      }
      if (typeRes.data) setManifestTypesList(typeRes.data.map(t => t.name));
      if (prodRes.data) setAllProducts(prodRes.data);
      
      if (configRes.data && configRes.data.length > 0) {
          const loadedTabs: ReportTab[] = configRes.data.map(cfg => ({
              id: cfg.tab_id,
              tab_id: cfg.tab_id,
              title: cfg.title,
              layout: cfg.layout as 'STANDARD' | 'CRI' | 'PRODUCT_TARGETS' | 'STOCK_SUMMARY',
              manifestTypes: cfg.manifest_types || [],
              sections: cfg.sections || [],
              items: cfg.items || [],
              baseTargetProduct: cfg.base_target_product || '',
              warehouses: cfg.warehouses || (whRes.data ? whRes.data.map(w=>w.id) : [])
          }));
          setReportTabs(loadedTabs);
          if (loadedTabs.length > 0) setActiveTabId(loadedTabs[0].id);
      } else {
          const defaultTab: ReportTab = {
              id: 'tab-default',
              tab_id: 'tab-default',
              title: 'LPG Regular',
              layout: 'STANDARD',
              manifestTypes: [],
              sections: [],
              items: [],
              warehouses: []
          };
          setReportTabs([defaultTab]);
          setActiveTabId('tab-default');
      }
    } catch (err) {
      console.error("Error fetching initial data:", err);
    }
    setIsLoading(false);
  };

  const handleDpToggle = (dpId: string) => {
    setSelectedDps(prev => prev.includes(dpId) ? prev.filter(id => id !== dpId) : [...prev, dpId]);
  };

  const handleAddTab = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTabTitle.trim()) return;
      setIsLoading(true);
      
      const newTabId = `tab-${Date.now()}`;
      const newTab: ReportTab = {
          id: newTabId,
          tab_id: newTabId,
          title: newTabTitle,
          layout: newTabLayout,
          manifestTypes: [],
          sections: [],
          items: newTabLayout === 'STOCK_SUMMARY' ? allProducts.map(p=>p.name) : [], 
          baseTargetProduct: '',
          warehouses: newTabLayout === 'STOCK_SUMMARY' ? warehouses.map(w=>w.id) : []
      };

      const { error } = await supabase.from('report_configurations').insert([{
          tab_id: newTab.id,
          title: newTab.title,
          layout: newTab.layout,
          manifest_types: newTab.manifestTypes,
          sections: newTab.sections,
          items: newTab.items,
          base_target_product: newTab.baseTargetProduct,
          warehouses: newTab.warehouses
      }]);

      if (!error) {
          setReportTabs([...reportTabs, newTab]);
          setActiveTabId(newTab.id);
          setIsAddTabOpen(false);
          setNewTabTitle('');
          setNewTabLayout('STANDARD');
          setReportData({});
      } else {
          alert("Error creating tab in database.");
      }
      setIsLoading(false);
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
      setActiveTabSettings({...activeTabSettings, manifestTypes: newTypes, sections: newSections});
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
      setActiveTabSettings({...activeTabSettings, items: newItems, sections: newSections});
  };

  const handleToggleTabWarehouse = (whId: string) => {
      if (!activeTabSettings) return;
      let newWhs = [...(activeTabSettings.warehouses || [])];
      if (newWhs.includes(whId)) {
          newWhs = newWhs.filter(id => id !== whId);
      } else {
          newWhs.push(whId);
      }
      setActiveTabSettings({...activeTabSettings, warehouses: newWhs});
  };

  const saveSettings = async () => {
      if (!activeTabSettings) return;
      setIsLoading(true);
      
      const { error } = await supabase.from('report_configurations').update({
          title: activeTabSettings.title,
          manifest_types: activeTabSettings.manifestTypes,
          sections: activeTabSettings.sections,
          items: activeTabSettings.items,
          base_target_product: activeTabSettings.baseTargetProduct,
          warehouses: activeTabSettings.warehouses
      }).eq('tab_id', activeTabSettings.id);

      if (!error) {
          setReportTabs(prev => prev.map(t => t.id === activeTabSettings.id ? activeTabSettings : t));
          setIsSettingsOpen(false);
          setReportData({}); 
      } else {
          alert("Error saving configuration to database.");
      }
      setIsLoading(false);
  };

  const handleDeleteTab = async (tabId: string) => {
      if(!confirm("Are you sure you want to permanently delete this tab?")) return;
      setIsLoading(true);
      const { error } = await supabase.from('report_configurations').delete().eq('tab_id', tabId);
      
      if (!error) {
          const updatedTabs = reportTabs.filter(t => t.id !== tabId);
          setReportTabs(updatedTabs);
          setIsSettingsOpen(false);
          if(updatedTabs.length > 0) setActiveTabId(updatedTabs[0].id);
          else setActiveTabId('');
          setReportData({});
      } else {
          alert("Error deleting tab.");
      }
      setIsLoading(false);
  };

  const handleGenerateReport = async () => {
    setIsLoading(true);
    try {
      const hasStockTab = reportTabs.some(t => t.layout === 'STOCK_SUMMARY');

      // 1. Fetch Dists
      const { data: distData } = await supabase.from('distributions')
        .select('id, distribution_point_id, distribution_date, distribution_items(quantity, total_hh, products(name), manifests(id, title, manifest_type))')
        .gte('distribution_date', fromDate)
        .lte('distribution_date', toDate)
        .in('distribution_point_id', selectedDps);

      const { data: pastDistData } = await supabase.from('distributions')
        .select('id, distribution_point_id, distribution_items(quantity, products(name), manifests(manifest_type))')
        .lt('distribution_date', fromDate)
        .in('distribution_point_id', selectedDps);

      const { data: mnfData } = await supabase.from('manifests')
        .select('id, title, manifest_type, distribution_point_id, manifest_items(target_qty, products(name))')
        .in('distribution_point_id', selectedDps);

      let refillTargets: any[] = [];
      try {
          const { data: rTgt } = await supabase.from('lpg_refill_targets')
              .select('dp_id, target_date, final_target')
              .gte('target_date', fromDate)
              .lte('target_date', toDate)
              .in('dp_id', selectedDps);
          if (rTgt) refillTargets = rTgt;
      } catch (e) {}

      // 2. Fetch inventory for STOCK_SUMMARY tab based on 'toDate'
      let transactionData: any[] = [];
      if (hasStockTab) {
         const allSelectedWhs = Array.from(new Set(
             reportTabs.filter(t => t.layout === 'STOCK_SUMMARY').flatMap(t => t.warehouses || [])
         ));

         if (allSelectedWhs.length > 0) {
             try {
                // Ensure we capture the entire target day by appending the time
                const maxDateStr = `${toDate}T23:59:59.999Z`;
                const { data, error } = await supabase.from('inventory_transactions')
                  .select('product_id, warehouse_id, transaction_type, quantity')
                  .lte('transaction_date', maxDateStr)
                  .in('warehouse_id', allSelectedWhs);
                  
                if (error) {
                    console.error("Supabase Error fetching inventory:", error);
                } else if (data) {
                    transactionData = data;
                }
             } catch(e) {
                 console.error("Exception fetching inventory transactions:", e);
             }
         }
      }

      const generatedData: Record<string, any[]> = {};

      reportTabs.forEach(tab => {
          
          if (tab.layout === 'STOCK_SUMMARY') {
              const activeWhs = warehouses.filter(w => (tab.warehouses || []).includes(w.id));
              const activeProds = allProducts.filter(p => tab.items.includes(p.name));

              const tabData = activeProds.map((prod, index) => {
                  const rowData: any = {
                      sl: index + 1,
                      product_name: prod.name,
                      product_code: prod.code || '-',
                      unit: prod.unit_type || 'Pc'
                  };
                  let totalQty = 0;
                  
                  activeWhs.forEach(wh => {
                      if (transactionData.length > 0) {
                          // Real calculation from DB matching EXACTLY page_5.tsx logic
                          const prodWhTxns = transactionData.filter(tx => tx.product_id === prod.id && tx.warehouse_id === wh.id);
                          const qtyIn = prodWhTxns.filter(tx => tx.transaction_type?.toUpperCase() === 'IN').reduce((sum, tx) => sum + Number(tx.quantity), 0);
                          const qtyOut = prodWhTxns.filter(tx => tx.transaction_type?.toUpperCase() === 'OUT').reduce((sum, tx) => sum + Number(tx.quantity), 0);
                          
                          rowData[wh.name] = Math.max(0, qtyIn - qtyOut); 
                      } else {
                          rowData[wh.name] = 0;
                      }
                      totalQty += rowData[wh.name];
                  });
                  rowData['Total'] = totalQty;
                  return rowData;
              });
              generatedData[tab.id] = tabData;

          } else {
              // STANDARD, PRODUCT_TARGETS, CRI Logic
              const tabDps = distributionPoints.filter(dp => selectedDps.includes(dp.id));
              const tabData = tabDps.map((dp, index) => {
                const rowData: any = {
                  sl: index + 1,
                  dp_name: dp.name,
                  dp_code: dp.code,
                };
                
                const dpDist = (distData || []).filter(d => d.distribution_point_id === dp.id);
                const dpPastDist = (pastDistData || []).filter(d => d.distribution_point_id === dp.id);
                const dpMnf = (mnfData || []).filter(m => m.distribution_point_id === dp.id && (tab.manifestTypes.length === 0 || tab.manifestTypes.includes(m.manifest_type)));
    
                if (tab.layout === 'STANDARD') {
                  tab.sections.forEach((sec: any) => {
                    let secTarget = 0;
                    let secAchieved = 0;
    
                    const secDistItems = dpDist.flatMap(d => d.distribution_items).filter((di: any) => di.manifests && (di.manifests.manifest_type === sec.type));
                    secAchieved = secDistItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    
                    if (sec.type?.toLowerCase().includes('refill')) {
                        secTarget = refillTargets.filter(r => r.dp_id === dp.id).reduce((sum, r) => sum + (Number(r.final_target) || 0), 0);
                    } else {
                        const secMnfs = dpMnf.filter(m => m.manifest_type === sec.type);
                        const grossTarget = secMnfs.flatMap(m => m.manifest_items).reduce((sum, item) => sum + (Number(item.target_qty) || 0), 0);
                        
                        const pastDistItems = dpPastDist.flatMap(d => d.distribution_items).filter((di: any) => di.manifests && (di.manifests.manifest_type === sec.type));
                        const pastAchieved = pastDistItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
                        
                        secTarget = Math.max(0, grossTarget - pastAchieved);
                    }
    
                    sec.columns.forEach((col: string) => {
                       if (col.toLowerCase() === 'target') rowData[`${sec.id}_${col}`] = secTarget || 0;
                       else if (col.toLowerCase() === 'achieved') rowData[`${sec.id}_${col}`] = secAchieved || 0;
                       else if (col.toLowerCase().includes('%') || col.toLowerCase().includes('achievement')) {
                           rowData[`${sec.id}_${col}`] = secTarget > 0 ? ((secAchieved / secTarget) * 100).toFixed(2) + '%' : (secAchieved > 0 ? '100%' : '0%');
                       } 
                    });
                  });
                  
                  const stdDistItems = dpDist.flatMap(d => d.distribution_items).filter((di: any) => di.manifests && (tab.manifestTypes.length === 0 || tab.manifestTypes.includes(di.manifests.manifest_type)));
                  const uniqueManifests = Array.from(new Set(stdDistItems.map((di:any) => di.manifests?.title))).filter(Boolean);
                  rowData['Manifest Name'] = uniqueManifests.join(', ');
    
                } else if (tab.layout === 'CRI') {
                    const criDistItems = dpDist.flatMap(d => d.distribution_items).filter((di: any) => di.manifests && (tab.manifestTypes.length === 0 || tab.manifestTypes.includes(di.manifests.manifest_type)));
                    const criPastDistItems = dpPastDist.flatMap(d => d.distribution_items).filter((di: any) => di.manifests && (tab.manifestTypes.length === 0 || tab.manifestTypes.includes(di.manifests.manifest_type)));
                    
                    let hhTarget = 0;
                    let hhCovered = 0;
    
                    if (tab.baseTargetProduct) {
                         const baseGrossTarget = dpMnf.flatMap(m => m.manifest_items).filter(mi => mi.products?.name === tab.baseTargetProduct).reduce((sum, item) => sum + (Number(item.target_qty) || 0), 0);
                         const basePastAchieved = criPastDistItems.filter((di:any) => di.products?.name === tab.baseTargetProduct).reduce((sum, di) => sum + (Number(di.quantity) || 0), 0);
                         
                         hhTarget = Math.max(0, baseGrossTarget - basePastAchieved);
                         hhCovered = criDistItems.filter((di:any) => di.products?.name === tab.baseTargetProduct).reduce((sum, di) => sum + (Number(di.quantity) || 0), 0); 
                    } else {
                         hhTarget = dpMnf.flatMap(m => m.manifest_items).reduce((max, item) => Math.max(max, Number(item.target_qty) || 0), 0); 
                         hhCovered = criDistItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0); 
                    }
    
                    rowData['HH Target'] = hhTarget || 0;
                    rowData['HH Covered'] = hhCovered || 0;
                    rowData['HH Achievement %'] = hhTarget > 0 ? ((hhCovered / hhTarget) * 100).toFixed(2) + '%' : (hhCovered > 0 ? '100%' : '0%');
                    
                    tab.items.forEach(item => {
                        rowData[item] = criDistItems.filter((di:any) => di.products?.name === item).reduce((sum, di) => sum + (Number(di.quantity) || 0), 0);
                    });
                    
                    const uniqueManifests = Array.from(new Set(criDistItems.map((di:any) => di.manifests?.title))).filter(Boolean);
                    rowData['Manifest Name'] = uniqueManifests.join(', ');
                    
                } else if (tab.layout === 'PRODUCT_TARGETS') {
                    const distItems = dpDist.flatMap(d => d.distribution_items).filter((di: any) => di.manifests && (tab.manifestTypes.length === 0 || tab.manifestTypes.includes(di.manifests.manifest_type)));
                    const pastDistItems = dpPastDist.flatMap(d => d.distribution_items).filter((di: any) => di.manifests && (tab.manifestTypes.length === 0 || tab.manifestTypes.includes(di.manifests.manifest_type)));
                    
                    tab.sections.forEach((sec: any) => {
                        const prodName = sec.title; 
                        
                        const grossTarget = dpMnf.flatMap(m => m.manifest_items).filter(mi => mi.products?.name === prodName).reduce((sum, item) => sum + (Number(item.target_qty) || 0), 0);
                        const pastAchieved = pastDistItems.filter((di:any) => di.products?.name === prodName).reduce((sum, di) => sum + (Number(di.quantity) || 0), 0);
                        
                        const prodTarget = Math.max(0, grossTarget - pastAchieved);
                        const prodAchieved = distItems.filter((di:any) => di.products?.name === prodName).reduce((sum, di) => sum + (Number(di.quantity) || 0), 0);
    
                        sec.columns.forEach((col: string) => {
                           if (col.toLowerCase() === 'target') rowData[`${sec.id}_${col}`] = prodTarget || 0;
                           else if (col.toLowerCase() === 'achieved') rowData[`${sec.id}_${col}`] = prodAchieved || 0;
                           else if (col.toLowerCase().includes('%') || col.toLowerCase().includes('achievement')) {
                               rowData[`${sec.id}_${col}`] = prodTarget > 0 ? ((prodAchieved / prodTarget) * 100).toFixed(2) + '%' : (prodAchieved > 0 ? '100%' : '0%');
                           } 
                        });
                    });
                    
                    const uniqueManifests = Array.from(new Set(distItems.map((di:any) => di.manifests?.title))).filter(Boolean);
                    rowData['Manifest Name'] = uniqueManifests.join(', ');
                }
                return rowData;
              });
              generatedData[tab.id] = tabData;
          }
      });
      
      setReportData(generatedData);
    } catch (err) {
      console.error("Error generating report:", err);
    }
    setIsLoading(false);
  };

  const handleExportExcel = () => {
      if (Object.keys(reportData).length === 0) return;
      const wb = XLSX.utils.book_new();

      const borderStyle = {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } }
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
                  for(let i=1; i<sec.columns.length; i++) header1.push(''); 
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
          } else if (tab.layout === 'STOCK_SUMMARY') {
              const activeWhs = warehouses.filter(w => (tab.warehouses || []).includes(w.id));
              const header1 = ['SL', 'Goods Name', 'Unit'];
              const header2 = ['', '', ''];
              
              activeWhs.forEach(wh => {
                  header1.push('CUBOID & Physical Qty'); 
                  header2.push(wh.name);
              });
              header1.push(''); 
              header2.push('Total');

              aoa.push([`${tab.title} Stock Report (As of ${toDate})`]);
              aoa.push([]); 
              aoa.push(header1);
              aoa.push(header2);

              tabData.forEach(row => {
                  const rowData = [row.sl, row.product_name, row.unit];
                  activeWhs.forEach(wh => rowData.push(row[wh.name] || 0));
                  rowData.push(row.Total || 0);
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

          const headerRows = (tab.layout === 'STANDARD' || tab.layout === 'PRODUCT_TARGETS' || tab.layout === 'STOCK_SUMMARY') ? [2, 3] : [2];
          const dataStartRow = (tab.layout === 'STANDARD' || tab.layout === 'PRODUCT_TARGETS' || tab.layout === 'STOCK_SUMMARY') ? 4 : 3;

          for (let key in ws) {
              if (key[0] === '!') continue;
              const cell = ws[key];
              const rowNum = parseInt(key.replace(/[^\d]/g, ''), 10) - 1; 

              cell.s = { alignment: { vertical: "center", horizontal: "center", wrapText: true } };

              if (rowNum === 0) {
                  cell.s.font = { bold: true, sz: 14, color: { rgb: "000000" } };
                  cell.s.alignment = { horizontal: "left", vertical: "center" };
              } else if (rowNum > 0) {
                  cell.s.border = borderStyle;

                  if (headerRows.includes(rowNum)) {
                      cell.s.font = { bold: true, color: { rgb: "000000" } };
                      cell.s.fill = { fgColor: { rgb: "E2E8F0" } }; 
                  } else if (rowNum >= dataStartRow) {
                      cell.s.font = { color: { rgb: "000000" } };
                  }
              }
          }

          if ((tab.layout === 'STANDARD' || tab.layout === 'PRODUCT_TARGETS') && tab.sections.length > 0) {
              if(!ws['!merges']) ws['!merges'] = [];
              ws['!merges'].push({ s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }); 
              ws['!merges'].push({ s: { r: 2, c: 1 }, e: { r: 3, c: 1 } }); 
              
              let currentC = 2;
              tab.sections.forEach(sec => {
                  ws['!merges'].push({ s: { r: 2, c: currentC }, e: { r: 2, c: currentC + sec.columns.length - 1 } });
                  currentC += sec.columns.length;
              });
              ws['!merges'].push({ s: { r: 2, c: currentC }, e: { r: 3, c: currentC } });
          } else if (tab.layout === 'STOCK_SUMMARY') {
              const activeWhs = warehouses.filter(w => (tab.warehouses || []).includes(w.id));
              if(!ws['!merges']) ws['!merges'] = [];
              ws['!merges'].push({ s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }); 
              ws['!merges'].push({ s: { r: 2, c: 1 }, e: { r: 3, c: 1 } }); 
              ws['!merges'].push({ s: { r: 2, c: 2 }, e: { r: 3, c: 2 } }); 
              
              if (activeWhs.length > 0) {
                  ws['!merges'].push({ s: { r: 2, c: 3 }, e: { r: 2, c: 3 + activeWhs.length - 1 } });
              }
              ws['!merges'].push({ s: { r: 2, c: 3 + activeWhs.length }, e: { r: 3, c: 3 + activeWhs.length } });
          }

          const refStartRow = (tab.layout === 'STANDARD' || tab.layout === 'PRODUCT_TARGETS' || tab.layout === 'STOCK_SUMMARY') ? 2 : 2;
          const colWidths = aoa[refStartRow].map((_, colIndex) => {
              let maxLength = colIndex === 0 ? 5 : 10;
              for(let r = refStartRow; r < aoa.length; r++) {
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

              autoTable(doc, { head: [head1, head2], body: body, startY: 26, styles: { fontSize: 7, cellPadding: 2, textColor: [0,0,0], lineColor: [200, 200, 200], lineWidth: 0.1 }, headStyles: { fillColor: [79, 70, 229] }, theme: 'grid' });
          } else if (tab.layout === 'STOCK_SUMMARY') {
              const activeWhs = warehouses.filter(w => (tab.warehouses || []).includes(w.id));
              const head1: any[] = [{ content: 'SL', rowSpan: 2 }, { content: 'Goods Name', rowSpan: 2 }, { content: 'Unit', rowSpan: 2 }];
              if (activeWhs.length > 0) {
                  head1.push({ content: 'CUBOID & Physical Qty', colSpan: activeWhs.length, styles: { halign: 'center' } });
              }
              head1.push({ content: 'Total', rowSpan: 2, styles: { halign: 'center', fillColor: [226, 232, 240] } });
              const head2: any[] = [];
              activeWhs.forEach(wh => head2.push(wh.name));
        
              const body = tabData.map(row => {
                  const r = [row.sl, row.product_name, row.unit];
                  activeWhs.forEach(wh => r.push(row[wh.name]));
                  r.push(row.Total);
                  return r;
              });
              autoTable(doc, { head: [head1, head2], body: body, startY: 26, styles: { fontSize: 7, cellPadding: 2, textColor: [0,0,0], lineColor: [200, 200, 200], lineWidth: 0.1 }, headStyles: { fillColor: [79, 70, 229] }, theme: 'grid' });
          } else if (tab.layout === 'CRI') {
              const head = [['SL', 'Distribution Point', 'HH Target', 'HH Covered', 'HH %', ...tab.items, 'Manifest Name']];
              const body = tabData.map(row => {
                  const r = [row.sl, row.dp_name, row['HH Target'], row['HH Covered'], row['HH Achievement %']];
                  tab.items.forEach(item => r.push(row[item] || '0'));
                  r.push(row['Manifest Name'] || '');
                  return r;
              });

              autoTable(doc, { head: head, body: body, startY: 26, styles: { fontSize: 7, cellPadding: 2, textColor: [0,0,0], lineColor: [200, 200, 200], lineWidth: 0.1 }, headStyles: { fillColor: [79, 70, 229] }, theme: 'grid' });
          }
      });
      
      doc.save(`Manifest_Progress_Report_${fromDate}.pdf`);
  };

  return (
    <div className="flex flex-col h-full w-full animate-in fade-in duration-500 relative bg-slate-50 text-black">
      
      {/* Settings Modal */}
      {isSettingsOpen && activeTabSettings && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-black">
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 max-h-[90vh]">
               <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0 rounded-t-2xl">
                  <div>
                    <h3 className="font-bold text-lg text-black">Tab Configuration</h3>
                    <p className="text-xs text-indigo-600 font-bold mt-0.5">Editing: {activeTabSettings.title}</p>
                  </div>
                  <button onClick={() => setIsSettingsOpen(false)} className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-100"><Icons.Close /></button>
               </div>
               
               <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase mb-2">Tab Title</label>
                    <input type="text" value={activeTabSettings.title} onChange={e => setActiveTabSettings({...activeTabSettings, title: e.target.value})} className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg text-sm font-bold text-black focus:border-indigo-500 outline-none" />
                  </div>

                  {activeTabSettings.layout !== 'STOCK_SUMMARY' && (
                      <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-xs font-black text-slate-700 uppercase">Assign Manifest Types (Auto generates sections for standard layout)</label>
                        </div>
                        <div className="flex flex-wrap gap-2 p-3 border-2 border-slate-200 rounded-xl bg-slate-50">
                            {manifestTypesList.length === 0 ? <span className="text-xs text-slate-500">No Types found.</span> : null}
                            {manifestTypesList.map(mType => (
                                <label key={mType} className={`flex items-center space-x-1.5 px-2 py-1.5 rounded border cursor-pointer text-xs font-bold transition-colors ${activeTabSettings.manifestTypes.includes(mType) ? 'bg-indigo-100 border-indigo-300 text-indigo-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
                                    <input type="checkbox" checked={activeTabSettings.manifestTypes.includes(mType)} onChange={() => handleToggleManifestTypeSetting(mType)} className="w-3 h-3 text-indigo-600 rounded focus:ring-indigo-500" />
                                    <span>{mType}</span>
                                </label>
                            ))}
                        </div>
                      </div>
                  )}

                  {activeTabSettings.layout === 'STANDARD' ? (
                      <div>
                          <div className="flex justify-between items-center mb-3">
                              <label className="block text-xs font-black text-slate-700 uppercase">Sections & Columns</label>
                          </div>
                          {activeTabSettings.sections.length === 0 && <p className="text-xs text-rose-500 font-bold">Select Manifest Types above to generate sections.</p>}
                          <div className="space-y-3">
                              {activeTabSettings.sections.map((sec, sIdx) => (
                                  <div key={sec.id} className="p-3 border-2 border-slate-200 rounded-xl bg-slate-50 flex gap-3 items-center">
                                      <span className="font-black text-indigo-700 w-1/3 truncate">{sec.title}</span>
                                      <div className="flex gap-2 items-center flex-wrap flex-1">
                                            <span className="text-[10px] font-bold text-slate-500">Cols:</span>
                                            {sec.columns.map((col, cIdx) => (
                                                <span key={cIdx} className="text-[9px] bg-white border border-slate-300 px-1.5 py-0.5 rounded font-black text-slate-700 flex items-center gap-1">
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
                          <div className="flex justify-between items-center mb-2">
                              <label className="block text-xs font-black text-slate-700 uppercase">Include Items / Products (Generates Target Sections)</label>
                              <div className="space-x-2">
                                  <button onClick={() => {
                                      const newSections = allProducts.map(prod => ({
                                          id: `sec-prod-${prod.name.replace(/\s+/g, '-').toLowerCase()}`,
                                          title: prod.name,
                                          type: 'Product',
                                          columns: ['Target', 'Achieved', 'Achievement %'] 
                                      }));
                                      setActiveTabSettings({...activeTabSettings, items: allProducts.map(p=>p.name), sections: newSections});
                                  }} className="text-[9px] font-bold text-indigo-600 hover:underline">Select All</button>
                                  <button onClick={() => setActiveTabSettings({...activeTabSettings, items: [], sections: []})} className="text-[9px] font-bold text-rose-600 hover:underline">Clear All</button>
                              </div>
                          </div>
                          <div className="p-4 border-2 border-slate-200 rounded-xl bg-slate-50">
                              <div className="flex flex-wrap gap-2">
                                  {allProducts.length === 0 ? <span className="text-xs text-slate-500">No Products found.</span> : null}
                                  {allProducts.map(prod => (
                                      <label key={prod.id} className={`flex items-center space-x-1.5 px-2 py-1 rounded border cursor-pointer text-xs font-bold transition-colors ${activeTabSettings.items.includes(prod.name) ? 'bg-indigo-100 border-indigo-300 text-indigo-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
                                          <input type="checkbox" checked={activeTabSettings.items.includes(prod.name)} onChange={() => handleToggleProductTargetItem(prod.name)} className="w-3 h-3 text-indigo-600 rounded focus:ring-indigo-500" />
                                          <span>{prod.name}</span>
                                      </label>
                                  ))}
                              </div>
                          </div>
                      </div>
                  ) : activeTabSettings.layout === 'STOCK_SUMMARY' ? (
                      <div className="space-y-6">
                          <div>
                              <div className="flex justify-between items-center mb-2">
                                  <label className="block text-xs font-black text-slate-700 uppercase">Select Warehouses (Columns)</label>
                                  <div className="space-x-2">
                                      <button onClick={() => setActiveTabSettings({...activeTabSettings, warehouses: warehouses.map(w=>w.id)})} className="text-[9px] font-bold text-indigo-600 hover:underline">Select All</button>
                                      <button onClick={() => setActiveTabSettings({...activeTabSettings, warehouses: []})} className="text-[9px] font-bold text-rose-600 hover:underline">Clear All</button>
                                  </div>
                              </div>
                              <div className="p-4 border-2 border-slate-200 rounded-xl bg-slate-50">
                                  <div className="flex flex-wrap gap-2">
                                      {warehouses.length === 0 ? <span className="text-xs text-slate-500">No Warehouses found.</span> : null}
                                      {warehouses.map(wh => (
                                          <label key={wh.id} className={`flex items-center space-x-1.5 px-2 py-1 rounded border cursor-pointer text-xs font-bold transition-colors ${(activeTabSettings.warehouses || []).includes(wh.id) ? 'bg-emerald-100 border-emerald-300 text-emerald-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
                                              <input type="checkbox" checked={(activeTabSettings.warehouses || []).includes(wh.id)} onChange={() => handleToggleTabWarehouse(wh.id)} className="w-3 h-3 text-emerald-600 rounded focus:ring-emerald-500" />
                                              <span>{wh.name}</span>
                                          </label>
                                      ))}
                                  </div>
                              </div>
                          </div>

                          <div>
                              <div className="flex justify-between items-center mb-2">
                                  <label className="block text-xs font-black text-slate-700 uppercase">Include Goods / Products (Rows)</label>
                                  <div className="space-x-2">
                                      <button onClick={() => setActiveTabSettings({...activeTabSettings, items: allProducts.map(p=>p.name)})} className="text-[9px] font-bold text-indigo-600 hover:underline">Select All</button>
                                      <button onClick={() => setActiveTabSettings({...activeTabSettings, items: []})} className="text-[9px] font-bold text-rose-600 hover:underline">Clear All</button>
                                  </div>
                              </div>
                              <div className="p-4 border-2 border-slate-200 rounded-xl bg-slate-50">
                                  <div className="flex flex-wrap gap-2">
                                      {allProducts.length === 0 ? <span className="text-xs text-slate-500">No Products found.</span> : null}
                                      {allProducts.map(prod => (
                                          <label key={prod.id} className={`flex items-center space-x-1.5 px-2 py-1 rounded border cursor-pointer text-xs font-bold transition-colors ${activeTabSettings.items.includes(prod.name) ? 'bg-indigo-100 border-indigo-300 text-indigo-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
                                              <input type="checkbox" checked={activeTabSettings.items.includes(prod.name)} onChange={() => {
                                                  const newItems = activeTabSettings.items.includes(prod.name) 
                                                      ? activeTabSettings.items.filter(i => i !== prod.name)
                                                      : [...activeTabSettings.items, prod.name];
                                                  setActiveTabSettings({...activeTabSettings, items: newItems});
                                              }} className="w-3 h-3 text-indigo-600 rounded focus:ring-indigo-500" />
                                              <span>{prod.name}</span>
                                          </label>
                                      ))}
                                  </div>
                              </div>
                          </div>
                      </div>
                  ) : (
                      <div className="space-y-4">
                          <div>
                              <label className="block text-xs font-black text-slate-700 uppercase mb-2">Base Target Product (For HH Target Calculation)</label>
                              <select value={activeTabSettings.baseTargetProduct || ''} onChange={e => setActiveTabSettings({...activeTabSettings, baseTargetProduct: e.target.value})} className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-bold text-black focus:border-indigo-500 outline-none cursor-pointer">
                                  <option value="">-- Select a base product --</option>
                                  {allProducts.map(prod => <option key={prod.id} value={prod.name}>{prod.name}</option>)}
                              </select>
                          </div>
                          
                          <div>
                              <div className="flex justify-between items-center mb-2">
                                  <label className="block text-xs font-black text-slate-700 uppercase">Include Items / Products (Columns)</label>
                                  <div className="space-x-2">
                                      <button onClick={() => setActiveTabSettings({...activeTabSettings, items: allProducts.map(p=>p.name)})} className="text-[9px] font-bold text-indigo-600 hover:underline">Select All</button>
                                      <button onClick={() => setActiveTabSettings({...activeTabSettings, items: []})} className="text-[9px] font-bold text-rose-600 hover:underline">Clear All</button>
                                  </div>
                              </div>
                              <div className="p-4 border-2 border-slate-200 rounded-xl bg-slate-50">
                                  <div className="flex flex-wrap gap-2">
                                      {allProducts.length === 0 ? <span className="text-xs text-slate-500">No Products found.</span> : null}
                                      {allProducts.map(prod => (
                                          <label key={prod.id} className={`flex items-center space-x-1.5 px-2 py-1 rounded border cursor-pointer text-xs font-bold transition-colors ${activeTabSettings.items.includes(prod.name) ? 'bg-indigo-100 border-indigo-300 text-indigo-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
                                              <input type="checkbox" checked={activeTabSettings.items.includes(prod.name)} onChange={() => {
                                                  const newItems = activeTabSettings.items.includes(prod.name) 
                                                      ? activeTabSettings.items.filter(i => i !== prod.name)
                                                      : [...activeTabSettings.items, prod.name];
                                                  setActiveTabSettings({...activeTabSettings, items: newItems});
                                              }} className="w-3 h-3 text-indigo-600 rounded focus:ring-indigo-500" />
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
                   <button onClick={() => handleDeleteTab(activeTabSettings.id)} className="px-4 py-2 bg-rose-100 text-rose-700 font-bold rounded-lg hover:bg-rose-200 text-sm">Delete Tab</button>
                   <div className="space-x-3">
                       <button onClick={() => setIsSettingsOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300 text-sm">Cancel</button>
                       <button onClick={saveSettings} disabled={isLoading} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 text-sm shadow-md disabled:opacity-50">
                           {isLoading ? 'Saving...' : 'Save Config'}
                       </button>
                   </div>
               </div>
            </div>
         </div>
      )}

      {/* Add Tab Modal */}
      {isAddTabOpen && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-black">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center animate-in zoom-in-95">
                <h4 className="font-bold text-lg mb-4 text-slate-900">Add New Report Tab</h4>
                <form onSubmit={handleAddTab} className="space-y-4 text-left">
                    <div>
                        <label className="block text-xs font-black text-slate-600 mb-1">Tab Title</label>
                        <input type="text" value={newTabTitle} onChange={e=>setNewTabTitle(e.target.value)} required className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-bold text-black focus:border-indigo-500 outline-none" placeholder="e.g. Wash Distribution" />
                    </div>
                    <div>
                        <label className="block text-xs font-black text-slate-600 mb-1">Layout Format</label>
                        <select value={newTabLayout} onChange={(e:any)=>setNewTabLayout(e.target.value)} className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-bold text-black focus:border-indigo-500 outline-none cursor-pointer">
                            <option value="STANDARD">Standard (Target per Manifest Type)</option>
                            <option value="PRODUCT_TARGETS">Product Targets (Target per item)</option>
                            <option value="CRI">CRI Format (HH Coverage & Single Items)</option>
                            <option value="STOCK_SUMMARY">Warehouse Stock (Physical Qty as of To Date)</option>
                        </select>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button type="button" onClick={() => setIsAddTabOpen(false)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors">Cancel</button>
                        <button type="submit" disabled={isLoading} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md transition-colors disabled:opacity-50">Create Tab</button>
                    </div>
                </form>
            </div>
         </div>
      )}

      {/* Header */}
      <header className="flex min-h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 z-20 shadow-sm justify-between flex-wrap gap-3 py-3">
        <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-3 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
                <h2 className="text-lg md:text-2xl font-bold text-slate-900">Manifest Progress Report</h2>
                <p className="text-[10px] md:text-sm text-slate-500 hidden md:block">Interactive distribution progress and reconciliation</p>
            </div>
        </div>
        
        <div className="flex items-center gap-2">
            <button onClick={handleExportExcel} disabled={Object.keys(reportData).length === 0} className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg hover:bg-emerald-100 transition-colors flex items-center shadow-sm disabled:opacity-50">
                <Icons.Download /> <span className="ml-1">Export Excel</span>
            </button>
            <button onClick={handleExportPDF} disabled={Object.keys(reportData).length === 0} className="px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg hover:bg-rose-100 transition-colors flex items-center shadow-sm disabled:opacity-50">
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
                    <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-black outline-none focus:border-indigo-500 shadow-sm cursor-pointer" />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">To Date (Also applies as target date for stock)</label>
                    <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-black outline-none focus:border-indigo-500 shadow-sm cursor-pointer" />
                </div>
                <button onClick={handleGenerateReport} disabled={isLoading} className="px-6 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-md h-10 ml-auto">
                    {isLoading ? 'Generating...' : 'Generate Report'}
                </button>
            </div>

            {/* Multiple DP Selection (Global) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase">Distribution Points</label>
                        <div className="space-x-2">
                            <button onClick={() => setSelectedDps(distributionPoints.map(d=>d.id))} className="text-[9px] font-bold text-indigo-600 hover:underline">Select All</button>
                            <button onClick={() => setSelectedDps([])} className="text-[9px] font-bold text-rose-600 hover:underline">Clear</button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto custom-scrollbar p-2 bg-slate-50 border border-slate-200 rounded-lg">
                        {distributionPoints.length === 0 ? <span className="text-xs text-slate-400 p-1 font-bold">Loading DPs...</span> : null}
                        {distributionPoints.map(dp => (
                            <label key={dp.id} className={`flex items-center space-x-1.5 px-2 py-1 rounded border cursor-pointer text-xs font-bold transition-colors ${selectedDps.includes(dp.id) ? 'bg-indigo-100 border-indigo-300 text-indigo-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
                                <input type="checkbox" checked={selectedDps.includes(dp.id)} onChange={() => handleDpToggle(dp.id)} className="w-3 h-3 text-indigo-600 rounded focus:ring-indigo-500" />
                                <span>{dp.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        {/* Dynamic Tabs & Report Display */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full min-h-[500px]">
            
            {/* Tabs Header with Edit Icons */}
            <div className="flex bg-slate-100 border-b border-slate-200 px-2 pt-2 gap-1 overflow-x-auto custom-scrollbar shrink-0">
                {reportTabs.map(tab => (
                    <div key={tab.id} className={`flex items-center rounded-t-xl transition-colors border-t border-x ${activeTabId === tab.id ? 'bg-white border-slate-200 border-b-white z-10' : 'bg-slate-200/50 border-transparent hover:bg-slate-200'}`} style={activeTabId === tab.id ? { marginBottom: '-1px' } : {}}>
                        <button 
                            onClick={() => setActiveTabId(tab.id)}
                            className={`px-4 py-2.5 text-sm font-black whitespace-nowrap ${activeTabId === tab.id ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {tab.title}
                        </button>
                        {activeTabId === tab.id && (
                            <button onClick={() => { setActiveTabSettings(tab); setIsSettingsOpen(true); }} className="pr-3 text-indigo-400 hover:text-indigo-700 transition-colors" title="Edit Tab">
                                <span className="text-sm">⚙️</span>
                            </button>
                        )}
                    </div>
                ))}
                <button onClick={() => setIsAddTabOpen(true)} className="px-3 py-2.5 text-slate-400 hover:text-indigo-600 flex items-center gap-1 text-xs font-bold transition-colors">
                   <Icons.Plus /> Add Tab
                </button>
            </div>

            {/* Report Table */}
            <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-white relative">
                {isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                        <Icons.Spinner />
                    </div>
                ) : Object.keys(reportData).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <span className="text-5xl mb-4">📊</span>
                        <p className="font-bold text-black">Select parameters and Generate Report</p>
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse min-w-max">
                        <thead className="sticky top-0 z-10 bg-white">
                            {reportTabs.find(t => t.id === activeTabId)?.layout === 'STANDARD' || reportTabs.find(t => t.id === activeTabId)?.layout === 'PRODUCT_TARGETS' ? (
                                <>
                                    {/* STANDARD / PRODUCT_TARGETS Header */}
                                    <tr>
                                        <th rowSpan={2} className="p-3 bg-slate-100 border border-slate-300 text-xs font-black text-slate-700 text-center w-12 shadow-sm">SL</th>
                                        <th rowSpan={2} className="p-3 bg-slate-100 border border-slate-300 text-xs font-black text-slate-700 shadow-sm w-48">Distribution Point</th>
                                        {reportTabs.find(t => t.id === activeTabId)?.sections.map((sec: any) => (
                                            <th key={`super-${sec.id}`} colSpan={sec.columns.length} className="p-2 bg-indigo-50 border border-indigo-200 text-xs font-black text-indigo-900 text-center shadow-sm uppercase tracking-wide">
                                                {sec.title}
                                            </th>
                                        ))}
                                        <th rowSpan={2} className="p-3 bg-slate-100 border border-slate-300 text-[10px] font-black text-slate-700 shadow-sm uppercase">Manifest Name</th>
                                    </tr>
                                    <tr>
                                        {reportTabs.find(t => t.id === activeTabId)?.sections.map((sec: any) => (
                                            sec.columns.map((col: string, idx: number) => (
                                                <th key={`col-${sec.id}-${idx}`} className="p-2 bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-800 text-center shadow-sm uppercase">
                                                    {col}
                                                </th>
                                            ))
                                        ))}
                                    </tr>
                                </>
                            ) : reportTabs.find(t => t.id === activeTabId)?.layout === 'STOCK_SUMMARY' ? (
                                <>
                                    {/* STOCK_SUMMARY Header */}
                                    <tr>
                                        <th rowSpan={2} className="p-3 bg-slate-100 border border-slate-300 text-[10px] font-black text-slate-700 text-center w-12 shadow-sm uppercase">SL</th>
                                        <th rowSpan={2} className="p-3 bg-slate-100 border border-slate-300 text-[10px] font-black text-slate-700 shadow-sm w-48 uppercase">Goods Name</th>
                                        <th rowSpan={2} className="p-3 bg-slate-100 border border-slate-300 text-[10px] font-black text-slate-700 text-center shadow-sm w-16 uppercase">Unit</th>
                                        
                                        {(reportTabs.find(t => t.id === activeTabId)?.warehouses || []).length > 0 && (
                                            <th colSpan={(reportTabs.find(t => t.id === activeTabId)?.warehouses || []).length} className="p-2 bg-indigo-50 border border-indigo-200 text-xs font-black text-indigo-900 text-center shadow-sm uppercase tracking-wide">
                                                CUBOID & Physical Qty
                                            </th>
                                        )}
                                        <th rowSpan={2} className="p-3 bg-slate-200 border border-slate-300 text-[10px] font-black text-slate-900 text-center shadow-sm uppercase">Total</th>
                                    </tr>
                                    <tr>
                                        {warehouses.filter(w => (reportTabs.find(t => t.id === activeTabId)?.warehouses || []).includes(w.id)).map(wh => (
                                            <th key={wh.id} className="p-2 bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-800 text-center shadow-sm">
                                                {wh.name}
                                            </th>
                                        ))}
                                    </tr>
                                </>
                            ) : (
                                <>
                                    {/* CRI Header */}
                                    <tr>
                                        <th className="p-3 bg-slate-100 border border-slate-300 text-[10px] font-black text-slate-700 text-center w-12 shadow-sm uppercase">SL</th>
                                        <th className="p-3 bg-slate-100 border border-slate-300 text-[10px] font-black text-slate-700 shadow-sm w-48 uppercase">Distribution Point</th>
                                        <th className="p-3 bg-indigo-50 border border-indigo-200 text-[10px] font-black text-indigo-900 text-center shadow-sm uppercase">HH Target</th>
                                        <th className="p-3 bg-indigo-50 border border-indigo-200 text-[10px] font-black text-indigo-900 text-center shadow-sm uppercase">HH Covered</th>
                                        <th className="p-3 bg-indigo-50 border border-indigo-200 text-[10px] font-black text-indigo-900 text-center shadow-sm uppercase">HH Achievement %</th>
                                        {reportTabs.find(t => t.id === activeTabId)?.items.map((item: string, idx: number) => (
                                            <th key={`col-${idx}`} className="p-2 bg-emerald-50 border border-emerald-200 text-[10px] font-black text-emerald-900 text-center shadow-sm uppercase max-w-[120px]">
                                                {item}
                                            </th>
                                        ))}
                                        <th className="p-3 bg-slate-100 border border-slate-300 text-[10px] font-black text-slate-700 shadow-sm uppercase">Manifest Name</th>
                                    </tr>
                                </>
                            )}
                        </thead>
                        <tbody>
                            {(reportData[activeTabId] || []).map((row: any, idx: number) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                    <td className="p-3 border border-slate-200 text-sm font-bold text-slate-700 text-center bg-slate-50/50">{row.sl}</td>
                                    
                                    {reportTabs.find(t => t.id === activeTabId)?.layout === 'STOCK_SUMMARY' ? (
                                        <>
                                            <td className="p-3 border border-slate-200">
                                                <p className="font-bold text-slate-900 text-sm">{row.product_name}</p>
                                                <p className="text-[10px] text-slate-500 font-mono font-bold mt-0.5">{row.product_code}</p>
                                            </td>
                                            <td className="p-3 border border-slate-200 text-xs font-bold text-slate-600 text-center">{row.unit}</td>
                                            {warehouses.filter(w => (reportTabs.find(t => t.id === activeTabId)?.warehouses || []).includes(w.id)).map(wh => {
                                                const qty = row[wh.name];
                                                return (
                                                    <td key={wh.id} className={`p-2 border border-slate-200 text-center align-middle font-bold text-sm ${qty === 0 ? 'text-slate-400' : 'text-indigo-700'}`}>
                                                        {qty}
                                                    </td>
                                                );
                                            })}
                                            <td className="p-3 border border-slate-200 text-sm font-black text-black text-center bg-slate-100/50">{row.Total}</td>
                                        </>
                                    ) : (
                                        <>
                                            {/* Standard / CRI DP Column */}
                                            <td className="p-3 border border-slate-200">
                                                <p className="font-bold text-slate-900 text-sm">{row.dp_name}</p>
                                                <p className="text-[10px] text-slate-700 font-mono font-bold mt-0.5">{row.dp_code}</p>
                                            </td>
                                            
                                            {reportTabs.find(t => t.id === activeTabId)?.layout === 'STANDARD' || reportTabs.find(t => t.id === activeTabId)?.layout === 'PRODUCT_TARGETS' ? (
                                                <>
                                                    {reportTabs.find(t => t.id === activeTabId)?.sections.map((sec: any) => (
                                                        sec.columns.map((col: string, cIdx: number) => {
                                                            const cellVal = row[`${sec.id}_${col}`] || '-';
                                                            const isPercentage = col.toLowerCase().includes('%') || col.toLowerCase().includes('achievement %');
                                                            
                                                            const renderCell = () => {
                                                                if (isPercentage && cellVal !== '-') {
                                                                    const pct = parseFloat(cellVal);
                                                                    const barColor = pct >= 100 ? 'bg-emerald-500' : (pct > 50 ? 'bg-amber-500' : 'bg-rose-500');
                                                                    return (
                                                                        <div className="flex flex-col items-center justify-center gap-1 w-full px-2">
                                                                            <span className="font-black text-xs text-black">{cellVal}</span>
                                                                            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                                                                <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }}></div>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                }
                                                                return <span className={`font-bold text-sm ${typeof cellVal === 'number' ? 'text-indigo-700' : 'text-black'}`}>{cellVal}</span>;
                                                            }
                
                                                            return (
                                                                <td key={`data-${sec.id}-${cIdx}`} className="p-2 border border-slate-200 text-center align-middle">
                                                                    {renderCell()}
                                                                </td>
                                                            );
                                                        })
                                                    ))}
                                                    <td className="p-2 border border-slate-200 align-middle">
                                                        <div className="text-[10px] font-bold text-black bg-slate-100 p-1.5 rounded border border-slate-200 break-words max-w-[200px] leading-tight">
                                                            {row['Manifest Name'] || '-'}
                                                        </div>
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="p-2 border border-slate-200 text-center align-middle font-bold text-sm text-indigo-700">{row['HH Target']}</td>
                                                    <td className="p-2 border border-slate-200 text-center align-middle font-bold text-sm text-black">{row['HH Covered']}</td>
                                                    <td className="p-2 border border-slate-200 text-center align-middle">
                                                        {row['HH Achievement %'] !== '-' && (
                                                            <div className="flex flex-col items-center justify-center gap-1 w-full px-2">
                                                                <span className="font-black text-xs text-black">{row['HH Achievement %']}</span>
                                                                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                                                    <div className={`h-1.5 rounded-full ${parseFloat(row['HH Achievement %']) >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(parseFloat(row['HH Achievement %']), 100)}%` }}></div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </td>
                                                    {reportTabs.find(t => t.id === activeTabId)?.items.map((item: string, iIdx: number) => (
                                                        <td key={`data-item-${iIdx}`} className="p-2 border border-slate-200 text-center align-middle font-bold text-sm text-emerald-700">
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