"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from './../../components/Icons';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// YYYY-MM-DD কে DD/MM/YYYY ফরম্যাটে দেখানোর হেল্পার
const formatDisplayDate = (dateString: string) => {
  if (!dateString) return '';
  const datePart = String(dateString).split('T')[0];
  const [year, month, day] = datePart.split('-');
  return year && month && day ? `${day}/${month}/${year}` : datePart;
};

// বর্তমানে বাংলাদেশের সঠিক তারিখ ও সময় (GMT+6) বের করার হেল্পার
const getGmt6NowParts = () => {
  const nowGmt6 = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const yyyy = nowGmt6.getUTCFullYear();
  const mm = String(nowGmt6.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(nowGmt6.getUTCDate()).padStart(2, '0');
  const hh24 = nowGmt6.getUTCHours();
  const hh = String(hh24).padStart(2, '0');
  const min = String(nowGmt6.getUTCMinutes()).padStart(2, '0');
  const sec = String(nowGmt6.getUTCSeconds()).padStart(2, '0');
  const ampm = hh24 >= 12 ? 'PM' : 'AM';
  const hh12 = String(hh24 % 12 || 12).padStart(2, '0');

  return {
    dateStr: `${yyyy}-${mm}-${dd}`,
    time24: `${hh}:${min}:${sec}`,
    displayDateTime: `${dd}/${mm}/${yyyy}, ${hh12}:${min} ${ampm}`
  };
};

// সিলেক্ট করা তারিখের সাথে বর্তমান GMT+6 সময় যুক্ত করা (ডেট কখনো UTC শিফট হয়ে পাল্টাবে না)
const getSortableGmt6DateString = (selectedDateStr: string) => {
  if (!selectedDateStr) return '';
  const cleanDate = String(selectedDateStr).split('T')[0];
  const { time24 } = getGmt6NowParts();
  return `${cleanDate}T${time24}.000Z`;
};

// পুরোনো রেকর্ডের ISO স্ট্রিং থেকে GMT+6 বা পঠনযোগ্য সময় দেখানোর ফলব্যাক
const formatRealUtcToGmt6 = (isoString?: string | null) => {
  if (!isoString) return '';
  const dt = new Date(isoString);
  if (isNaN(dt.getTime())) return String(isoString);
  const gmt6 = new Date(dt.getTime() + 6 * 60 * 60 * 1000);
  const yyyy = gmt6.getUTCFullYear();
  const mm = String(gmt6.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(gmt6.getUTCDate()).padStart(2, '0');
  const hh24 = gmt6.getUTCHours();
  const min = String(gmt6.getUTCMinutes()).padStart(2, '0');
  const ampm = hh24 >= 12 ? 'PM' : 'AM';
  const hh12 = String(hh24 % 12 || 12).padStart(2, '0');
  return `${dd}/${mm}/${yyyy}, ${hh12}:${min} ${ampm}`;
};

// পুরোনো created_at (যেখানে আগে থেকেই লোকাল সময় + .000Z রাখা ছিল) দেখানোর হেল্পার
const formatStoredWallTime = (isoString?: string | null) => {
  if (!isoString) return '';
  const dt = new Date(isoString);
  if (isNaN(dt.getTime())) return String(isoString);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const hh24 = dt.getUTCHours();
  const min = String(dt.getUTCMinutes()).padStart(2, '0');
  const ampm = hh24 >= 12 ? 'PM' : 'AM';
  const hh12 = String(hh24 % 12 || 12).padStart(2, '0');
  return `${dd}/${mm}/${yyyy}, ${hh12}:${min} ${ampm}`;
};

const getDisplayUserName = (name?: string | null, email?: string | null) => {
  if (name && String(name).trim()) return String(name).trim();
  if (email && String(email).includes('@')) return String(email).split('@')[0];
  return email || 'Unknown User';
};

// সিকোয়েন্স (sort_order) অনুযায়ী ম্যানিফেস্ট সর্ট করার হেল্পার
const sortManifestsBySequence = (list: any[]) => {
  return [...list].sort((a, b) => {
    const seqA = Number(a.sort_order) || 0;
    const seqB = Number(b.sort_order) || 0;
    if (seqA !== seqB) {
      if (seqA === 0) return 1;
      if (seqB === 0) return -1;
      return seqA - seqB;
    }
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
};

// সিকোয়েন্স (sort_order) অনুযায়ী ম্যানিফেস্টের প্রোডাক্ট সর্ট করার হেল্পার
const sortManifestItemsBySequence = (list: any[]) => {
  return [...list].sort((a, b) => {
    const seqA = Number(a.sort_order) || 0;
    const seqB = Number(b.sort_order) || 0;
    if (seqA !== seqB) {
      if (seqA === 0) return 1;
      if (seqB === 0) return -1;
      return seqA - seqB;
    }
    const prodSeqA = Number(a.products?.sort_order) || 0;
    const prodSeqB = Number(b.products?.sort_order) || 0;
    if (prodSeqA !== prodSeqB) {
      if (prodSeqA === 0) return 1;
      if (prodSeqB === 0) return -1;
      return prodSeqA - prodSeqB;
    }
    return String(a.products?.name || '').localeCompare(String(b.products?.name || ''));
  });
};

interface QtyHhInput {
  qty: number | '';
  hh: number | '';
}

interface InputMap {
  [key: string]: QtyHhInput;
}

interface NumberMap {
  [key: string]: number;
}

interface PendingSubmissionGroup {
  dpId: string;
  dp: any;
  payloads: {
    manifest: any;
    items: {
      item: any;
      qty: number;
      hh: number;
    }[];
  }[];
}

const MANIFEST_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', numBg: 'bg-blue-200/50', active: 'bg-blue-500' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', numBg: 'bg-emerald-200/50', active: 'bg-emerald-500' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', numBg: 'bg-amber-200/50', active: 'bg-amber-500' },
  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', numBg: 'bg-purple-200/50', active: 'bg-purple-500' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900', numBg: 'bg-rose-200/50', active: 'bg-rose-500' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-900', numBg: 'bg-cyan-200/50', active: 'bg-cyan-500' }
];

export default function DailyDistributionReportPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [distributionPoints, setDistributionPoints] = useState<any[]>([]);
  const [activeManifests, setActiveManifests] = useState<any[]>([]);
  const [dpFilter, setDpFilter] = useState('');

  const [allManifestItems, setAllManifestItems] = useState<any[]>([]);
  const [whStockMap, setWhStockMap] = useState<NumberMap>({});
  const [inputs, setInputs] = useState<InputMap>({});
  const [distDate, setDistDate] = useState('');
  const [remarks, setRemarks] = useState('');

  // History states
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [filterDpId, setFilterDpId] = useState('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;
  const [dbLimit, setDbLimit] = useState(25);
  const [totalDbCount, setTotalDbCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Review & Duplicate Warning Modals
  const [pendingSubmitGroups, setPendingSubmitGroups] = useState<PendingSubmissionGroup[]>([]);
  const [duplicateExistingReports, setDuplicateExistingReports] = useState<any[]>([]);
  const [duplicateWarningModalOpen, setDuplicateWarningModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [isAdditionalReportConfirmed, setIsAdditionalReportConfirmed] = useState(false);

  // Edit Modal States (Date is now editable!)
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [distToEdit, setDistToEdit] = useState<any>(null);
  const [editDate, setEditDate] = useState('');
  const [editValues, setEditValues] = useState<InputMap>({});
  const [editMaxStocks, setEditMaxStocks] = useState<NumberMap>({});
  const [editRemarks, setEditRemarks] = useState('');

  // Delete / Revert Modal States
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [txnToRevert, setTxnToRevert] = useState<any>(null);

  // Details Modal States
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsData, setDetailsData] = useState<any>(null);

  useEffect(() => {
    // বাংলাদেশের GMT+6 অনুযায়ী আজকের তারিখ ডিফল্ট হিসেবে সেট করা
    const { dateStr } = getGmt6NowParts();
    setDistDate(dateStr);
    initData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterDpId, filterStartDate, filterEndDate, tableSearch]);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4500);
    if (type === 'error') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const initData = async () => {
    setIsLoading(true);
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

      const resolvedName =
        profile?.full_name ||
        profile?.name ||
        sessionUser?.full_name ||
        sessionUser?.name ||
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        (user?.email ? user.email.split('@')[0] : 'Unknown User');
      setCurrentUserName(String(resolvedName).trim());

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
      if (allowedDps.length > 0) setDpFilter(allowedDps[0].id);
      else setDpFilter('');

      const idsToFetch = allowedDps.length > 0 ? allowedDps.map(dp => dp.id) : ['NONE-NO-ACCESS'];
      await loadManifestsAndData(idsToFetch, 25);
    } catch (err) {
      console.error('Error fetching DP assignment:', err);
    }
    setIsLoading(false);
  };

  const loadManifestsAndData = async (allowedDpIds: string[], limit: number) => {
    if (allowedDpIds.length === 0 || allowedDpIds.includes('NONE-NO-ACCESS')) {
      setActiveManifests([]);
      setAllManifestItems([]);
      setInputs({});
      setHistoryItems([]);
      return;
    }

    const { data: mData } = await supabase
      .from('manifests')
      .select('*, dp:distribution_points(*)')
      .eq('status', 'Active')
      .in('distribution_point_id', allowedDpIds)
      .order('created_at', { ascending: false });

    const { dateStr: todayGmt6Str } = getGmt6NowParts();

    const validManifests = (mData || []).filter(m => {
      if (!m.valid_to) return true;
      const validToStr = String(m.valid_to).split('T')[0];
      return validToStr >= todayGmt6Str;
    });

    // ম্যানিফেস্ট সিকোয়েন্স (sort_order) অনুযায়ী সাজানো হচ্ছে
    const orderedManifests = sortManifestsBySequence(validManifests);
    setActiveManifests(orderedManifests);
    const manifestIds = orderedManifests.map(m => m.id);

    if (manifestIds.length > 0) {
      const { data: mItems } = await supabase
        .from('manifest_items')
        .select('*, products (id, name, code, unit_type, product_type, is_open_stock, sort_order)')
        .in('manifest_id', manifestIds);

      // প্রোডাক্ট সিকোয়েন্স (manifest_items.sort_order) অনুযায়ী সাজানো হচ্ছে
      const orderedItems = sortManifestItemsBySequence(mItems || []);
      setAllManifestItems(orderedItems);

      const initInputs: InputMap = {};
      orderedItems.forEach((item: any) => {
        initInputs[`${item.manifest_id}_${item.product_id}`] = { qty: '', hh: '' };
      });

      setInputs(prev => ({ ...initInputs, ...prev }));

      const { data: invData } = await supabase.from('inventory').select('warehouse_id, product_id, quantity');
      const stockMap: NumberMap = {};
      invData?.forEach(inv => {
        stockMap[`${inv.warehouse_id}_${inv.product_id}`] = Number(inv.quantity) || 0;
      });
      setWhStockMap(stockMap);
    } else {
      setAllManifestItems([]);
    }

    const { count } = await supabase
      .from('distributions')
      .select('*', { count: 'exact', head: true })
      .in('distribution_point_id', allowedDpIds);
    setTotalDbCount(count || 0);

    const { data: hData } = await supabase
      .from('distributions')
      .select(`
        *,
        distribution_points!inner (id, name, code, nfi_warehouse_id, lpg_warehouse_id),
        distribution_items (id, quantity, total_hh, product_id, manifest_id, products (name, code, unit_type, product_type, is_open_stock), manifests (title, manifest_code, sort_order))
      `)
      .in('distribution_point_id', allowedDpIds)
      .order('distribution_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    setHistoryItems(hData || []);
  };

  const handleLoadMoreHistory = async () => {
    setIsLoadingMore(true);
    const newLimit = dbLimit + 25;
    setDbLimit(newLimit);
    const idsToFetch = distributionPoints.length > 0 ? distributionPoints.map(dp => dp.id) : ['NONE-NO-ACCESS'];
    await loadManifestsAndData(idsToFetch, newLimit);
    setIsLoadingMore(false);
  };

  const handleQtyChange = (manifestId: string, productId: string, val: string, maxStock: number, isOpenStock: boolean) => {
    const key = `${manifestId}_${productId}`;
    const prevHH = inputs[key]?.hh;
    const prevQty = inputs[key]?.qty;

    if (val === '') {
      setInputs(prev => ({ ...prev, [key]: { qty: '', hh: '' } }));
      return;
    }

    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0) return;

    if (!isOpenStock && num > maxStock) {
      showMessage(`Quantity exceeds available stock (${maxStock})!`, 'error');
      return;
    }

    let newHH = prevHH;
    if (prevHH === '' || prevHH === prevQty) newHH = num;

    setInputs(prev => ({ ...prev, [key]: { qty: num, hh: newHH } }));
  };

  const handleHHChange = (manifestId: string, productId: string, val: string) => {
    const key = `${manifestId}_${productId}`;
    if (val === '') {
      setInputs(prev => ({ ...prev, [key]: { ...prev[key], hh: '' } }));
      return;
    }
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0) return;
    setInputs(prev => ({ ...prev, [key]: { ...prev[key], hh: num } }));
  };

  // ধাপ ১: সাবমিট ক্লিক করলে আগে ভ্যালিডেশন ও একই তারিখের ডুপ্লিকেট চেক -> তারপর পপআপ
  const handleInitiateSubmit = async () => {
    if (!distDate) {
      showMessage('Please select a distribution date.', 'error');
      return;
    }

    const dpGroupsObj: { [dpId: string]: PendingSubmissionGroup } = {};

    filteredManifests.forEach(manifest => {
      const items = sortManifestItemsBySequence(allManifestItems.filter(i => i.manifest_id === manifest.id));
      const validItems = items
        .map(item => {
          const q = Number(inputs[`${manifest.id}_${item.product_id}`]?.qty);
          const hh = Number(inputs[`${manifest.id}_${item.product_id}`]?.hh) || 0;
          return { item, qty: q, hh };
        })
        .filter(entry => !isNaN(entry.qty) && entry.qty > 0);

      if (validItems.length > 0) {
        if (!dpGroupsObj[manifest.distribution_point_id]) {
          dpGroupsObj[manifest.distribution_point_id] = {
            dpId: manifest.distribution_point_id,
            dp: manifest.dp,
            payloads: []
          };
        }
        dpGroupsObj[manifest.distribution_point_id].payloads.push({
          manifest,
          items: validItems
        });
      }
    });

    const groupsList = Object.values(dpGroupsObj);
    if (groupsList.length === 0) {
      showMessage('Please enter at least one quantity.', 'error');
      return;
    }

    // স্টক লিমিট চেক
    const tempStockMap: NumberMap = { ...whStockMap };
    for (const grp of groupsList) {
      for (const payload of grp.payloads) {
        for (const entry of payload.items) {
          const item = entry.item;
          const distQty = entry.qty;
          if (distQty > 0 && !item.products?.is_open_stock) {
            const s1 = `${payload.manifest.dp?.nfi_warehouse_id}_${item.product_id}`;
            const s2 = `${payload.manifest.dp?.lpg_warehouse_id}_${item.product_id}`;
            let rem = distQty;
            if ((tempStockMap[s1] || 0) >= rem) {
              tempStockMap[s1] -= rem;
              rem = 0;
            } else if ((tempStockMap[s1] || 0) > 0) {
              rem -= tempStockMap[s1];
              tempStockMap[s1] = 0;
            }
            if (rem > 0 && (tempStockMap[s2] || 0) >= rem) {
              tempStockMap[s2] -= rem;
              rem = 0;
            }
            if (rem > 0) {
              showMessage(`Sum for ${item.products?.name} exceeds available stock!`, 'error');
              return;
            }
          }
        }
      }
    }

    setPendingSubmitGroups(groupsList);
    setIsAdditionalReportConfirmed(false);

    // ডাটাবেজে সরাসরি চেক করা: ওই DP ও সিলেক্ট করা তারিখে আগেই কোনো রিপোর্ট সাবমিট হয়েছে কি না
    setIsCheckingDuplicate(true);
    try {
      const targetDpIds = groupsList.map(g => g.dpId);
      const { data: existingDists, error: dupErr } = await supabase
        .from('distributions')
        .select(`
          *,
          distribution_points (id, name, code),
          distribution_items (id, quantity, total_hh, products (name, code, unit_type), manifests (title))
        `)
        .in('distribution_point_id', targetDpIds)
        .eq('distribution_date', distDate)
        .order('created_at', { ascending: false });

      if (dupErr) throw dupErr;

      if (existingDists && existingDists.length > 0) {
        setDuplicateExistingReports(existingDists);
        setDuplicateWarningModalOpen(true);
      } else {
        setDuplicateExistingReports([]);
        setReviewModalOpen(true);
      }
    } catch (err: any) {
      console.error('Error checking existing same-day report:', err);
      // চেক ফেইল হলেও রিভিউ পপআপ ওপেন হতে দেবে
      setReviewModalOpen(true);
    } finally {
      setIsCheckingDuplicate(false);
    }
  };

  // ডুপ্লিকেট ওয়ার্নিং কনফার্ম করে রিভিউ পপআপে যাওয়া
  const handleProceedAfterDuplicateWarning = () => {
    setDuplicateWarningModalOpen(false);
    setIsAdditionalReportConfirmed(true);
    setReviewModalOpen(true);
  };

  // ধাপ ২: রিভিউ পপআপে কনফার্ম ক্লিক করার পর আসল সাবমিশন
  const handleConfirmSubmitAll = async () => {
    if (pendingSubmitGroups.length === 0) return;

    setIsSubmitting(true);
    try {
      const exactDateTimeStr = getSortableGmt6DateString(distDate);
      const { displayDateTime: gmt6DisplayNow } = getGmt6NowParts();
      const submitterName = currentUserName || getDisplayUserName(null, currentUser?.email);

      for (const grp of pendingSubmitGroups) {
        const { data: distHeader, error: distErr } = await supabase
          .from('distributions')
          .insert([
            {
              distribution_point_id: grp.dpId,
              distribution_date: distDate,
              created_at: exactDateTimeStr,
              remarks: remarks || null,
              created_by: currentUser?.id || null,
              created_by_email: currentUser?.email || null,
              created_by_name: submitterName,
              submitted_at_gmt6: gmt6DisplayNow,
              edit_count: 0
            }
          ])
          .select()
          .single();

        if (distErr) throw distErr;

        const distRefCode = `DIST-${distHeader.id.split('-')[0].toUpperCase()}`;

        for (const payload of grp.payloads) {
          const connectedWhIds = [payload.manifest.dp?.nfi_warehouse_id, payload.manifest.dp?.lpg_warehouse_id].filter(Boolean);
          for (const entry of payload.items) {
            const item = entry.item;
            const distQty = entry.qty;
            const distHH = entry.hh;

            await supabase
              .from('manifest_items')
              .update({ distributed_qty: (Number(item.distributed_qty) || 0) + distQty })
              .eq('id', item.id);

            await supabase.from('distribution_items').insert([
              {
                distribution_id: distHeader.id,
                product_id: item.product_id,
                manifest_id: payload.manifest.id,
                quantity: distQty,
                total_hh: distHH
              }
            ]);

            if (!item.products?.is_open_stock) {
              const { data: invFind } = await supabase
                .from('inventory')
                .select('id, warehouse_id, quantity')
                .in('warehouse_id', connectedWhIds)
                .eq('product_id', item.product_id)
                .order('quantity', { ascending: false })
                .limit(1);

              const targetWh = invFind && invFind.length > 0 ? invFind[0] : null;
              if (!targetWh) throw new Error(`Stock missing for ${item.products?.name}`);

              await supabase
                .from('inventory')
                .update({ quantity: Math.max(0, targetWh.quantity - distQty), last_updated: new Date().toISOString() })
                .eq('id', targetWh.id);

              await supabase.from('inventory_transactions').insert([
                {
                  warehouse_id: targetWh.warehouse_id,
                  product_id: item.product_id,
                  transaction_type: 'OUT',
                  quantity: distQty,
                  reference_no: distRefCode,
                  remarks: `Distributed at ${payload.manifest.dp?.name}`,
                  created_by: currentUser?.id,
                  created_by_email: currentUser?.email,
                  created_at: exactDateTimeStr
                }
              ]);
            }
          }
        }
      }

      setReviewModalOpen(false);
      setPendingSubmitGroups([]);
      setDuplicateExistingReports([]);
      setIsAdditionalReportConfirmed(false);
      setRemarks('');
      setInputs({});
      showMessage('Distribution submitted successfully!', 'success');

      const idsToFetch = distributionPoints.length > 0 ? distributionPoints.map(dp => dp.id) : ['NONE-NO-ACCESS'];
      await loadManifestsAndData(idsToFetch, dbLimit);
    } catch (err: any) {
      showMessage(`Submission failed: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // এডিট মোডাল ওপেন করা (তারিখসহ)
  const openEditModal = async (distTxn: any) => {
    setDistToEdit(distTxn);
    setEditDate(String(distTxn.distribution_date || '').split('T')[0]);
    setEditRemarks(distTxn.remarks || '');

    const vals: InputMap = {};
    const productTotals: NumberMap = {};
    for (const item of distTxn.distribution_items) {
      vals[item.id] = { qty: item.quantity, hh: item.total_hh };
      productTotals[item.product_id] = (productTotals[item.product_id] || 0) + Number(item.quantity);
    }

    const maxStocks: NumberMap = {};
    const connectedWhIds = [
      distTxn.distribution_points.nfi_warehouse_id,
      distTxn.distribution_points.lpg_warehouse_id
    ].filter(Boolean);
    const uniqueProductIds = Object.keys(productTotals);

    if (uniqueProductIds.length > 0 && connectedWhIds.length > 0) {
      const { data: invData } = await supabase
        .from('inventory')
        .select('product_id, quantity')
        .in('warehouse_id', connectedWhIds)
        .in('product_id', uniqueProductIds);
      for (const pid of uniqueProductIds) {
        const currentStock = (invData || [])
          .filter((i: any) => i.product_id === pid)
          .reduce((sum: number, i: any) => sum + Number(i.quantity), 0);
        maxStocks[pid] = currentStock + productTotals[pid];
      }
    } else {
      for (const pid of uniqueProductIds) maxStocks[pid] = productTotals[pid];
    }

    setEditValues(vals);
    setEditMaxStocks(maxStocks);
    setEditModalOpen(true);
  };

  // এডিট সেভ করা (তারিখ + পরিমাণ + GMT+6 এডিট সময় + এডিট কাউন্ট আপডেট)
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!distToEdit || !editDate) return;

    setIsSubmitting(true);
    try {
      const connectedWhIds = [
        distToEdit.distribution_points.nfi_warehouse_id,
        distToEdit.distribution_points.lpg_warehouse_id
      ].filter(Boolean);
      const distRefCode = `DIST-${distToEdit.id.split('-')[0].toUpperCase()}`;

      const originalDateStr = String(distToEdit.distribution_date || '').split('T')[0];
      const dateChanged = editDate !== originalDateStr;
      const updatedSortableDateTime = getSortableGmt6DateString(editDate);
      const { displayDateTime: gmt6EditNow } = getGmt6NowParts();
      const editorName = currentUserName || getDisplayUserName(null, currentUser?.email);

      for (const item of distToEdit.distribution_items) {
        const newQty = Number(editValues[item.id]?.qty || 0);
        const newHh = Number(editValues[item.id]?.hh || 0);
        const diffQty = newQty - Number(item.quantity);

        if (diffQty !== 0) {
          const { data: mItem } = await supabase
            .from('manifest_items')
            .select('id, distributed_qty')
            .eq('manifest_id', item.manifest_id)
            .eq('product_id', item.product_id)
            .single();
          if (mItem) {
            await supabase
              .from('manifest_items')
              .update({ distributed_qty: Math.max(0, (Number(mItem.distributed_qty) || 0) + diffQty) })
              .eq('id', mItem.id);
          }

          if (!item.products?.is_open_stock) {
            const { data: invFind } = await supabase
              .from('inventory')
              .select('id, warehouse_id, quantity')
              .in('warehouse_id', connectedWhIds)
              .eq('product_id', item.product_id)
              .order('quantity', { ascending: false })
              .limit(1);
            if (!invFind || invFind.length === 0) throw new Error('Warehouse stock missing.');
            const targetWh = invFind[0];
            await supabase
              .from('inventory')
              .update({ quantity: Math.max(0, targetWh.quantity - diffQty), last_updated: new Date().toISOString() })
              .eq('id', targetWh.id);

            const { data: txnRows } = await supabase
              .from('inventory_transactions')
              .select('id')
              .eq('reference_no', distRefCode)
              .eq('product_id', item.product_id)
              .limit(1);
            if (txnRows && txnRows.length > 0) {
              await supabase
                .from('inventory_transactions')
                .update({ quantity: newQty })
                .eq('id', txnRows[0].id);
            }
          }
        }

        await supabase
          .from('distribution_items')
          .update({ quantity: newQty, total_hh: newHh })
          .eq('id', item.id);
      }

      // তারিখ পরিবর্তন হলে inventory_transactions-এর সব লেজার এন্ট্রির তারিখও আপডেট করা
      if (dateChanged) {
        await supabase
          .from('inventory_transactions')
          .update({ created_at: updatedSortableDateTime })
          .eq('reference_no', distRefCode);
      }

      const nextEditCount = (Number(distToEdit.edit_count) || 0) + 1;

      const distUpdatePayload: any = {
        distribution_date: editDate,
        remarks: editRemarks || null,
        updated_by: currentUser?.id || null,
        updated_by_email: currentUser?.email || null,
        updated_by_name: editorName,
        updated_at: new Date().toISOString(),
        last_edited_at_gmt6: gmt6EditNow,
        edit_count: nextEditCount
      };
      if (dateChanged) {
        distUpdatePayload.created_at = updatedSortableDateTime;
      }

      const { error: updErr } = await supabase
        .from('distributions')
        .update(distUpdatePayload)
        .eq('id', distToEdit.id);

      if (updErr) throw updErr;

      showMessage('Transaction updated successfully!', 'success');
      setEditModalOpen(false);
      const idsToFetch = distributionPoints.length > 0 ? distributionPoints.map(dp => dp.id) : ['NONE-NO-ACCESS'];
      await loadManifestsAndData(idsToFetch, dbLimit);
    } catch (err: any) {
      showMessage(`Edit failed: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevertTransaction = async () => {
    if (!txnToRevert) return;
    setIsSubmitting(true);
    try {
      const connectedWhIds = [
        txnToRevert.distribution_points.nfi_warehouse_id,
        txnToRevert.distribution_points.lpg_warehouse_id
      ].filter(Boolean);
      const distRefCode = `DIST-${txnToRevert.id.split('-')[0].toUpperCase()}`;

      for (const item of txnToRevert.distribution_items) {
        const { data: mItem } = await supabase
          .from('manifest_items')
          .select('id, distributed_qty')
          .eq('manifest_id', item.manifest_id)
          .eq('product_id', item.product_id)
          .single();
        if (mItem) {
          await supabase
            .from('manifest_items')
            .update({ distributed_qty: Math.max(0, (Number(mItem.distributed_qty) || 0) - Number(item.quantity)) })
            .eq('id', mItem.id);
        }

        if (!item.products?.is_open_stock) {
          const { data: invFind } = await supabase
            .from('inventory')
            .select('id, quantity')
            .in('warehouse_id', connectedWhIds)
            .eq('product_id', item.product_id)
            .order('quantity', { ascending: false })
            .limit(1);
          if (invFind && invFind.length > 0) {
            await supabase
              .from('inventory')
              .update({ quantity: Number(invFind[0].quantity) + Number(item.quantity) })
              .eq('id', invFind[0].id);
          }
        }
      }
      await supabase.from('inventory_transactions').delete().eq('reference_no', distRefCode);
      await supabase.from('distributions').delete().eq('id', txnToRevert.id);

      showMessage('Transaction deleted & stock restored.', 'success');
      setRevertModalOpen(false);
      setTxnToRevert(null);
      const idsToFetch = distributionPoints.length > 0 ? distributionPoints.map(dp => dp.id) : ['NONE-NO-ACCESS'];
      await loadManifestsAndData(idsToFetch, dbLimit);
    } catch (err: any) {
      showMessage(`Delete failed: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredManifests = activeManifests.filter(m => (dpFilter ? m.distribution_point_id === dpFilter : true));

  // বর্তমানে সিলেক্ট করা DP এবং তারিখের জন্য আগেই কোনো রিপোর্ট আছে কি না (তাৎক্ষণিক ব্যানার দেখানোর জন্য)
  const existingTodayBannerReports = historyItems.filter(
    h =>
      dpFilter &&
      distDate &&
      String(h.distribution_points?.id) === String(dpFilter) &&
      String(h.distribution_date).split('T')[0] === distDate
  );

  const filteredHistory = historyItems.filter(dist => {
    const matchDp = filterDpId === 'ALL' ? true : dist.distribution_points.id === filterDpId;
    let matchDate = true;
    if (filterStartDate && filterEndDate) matchDate = dist.distribution_date >= filterStartDate && dist.distribution_date <= filterEndDate;
    else if (filterStartDate) matchDate = dist.distribution_date >= filterStartDate;
    else if (filterEndDate) matchDate = dist.distribution_date <= filterEndDate;
    const q = tableSearch.toLowerCase();
    const matchSearch = q
      ? dist.distribution_items.some(
          (item: any) =>
            item.products.name.toLowerCase().includes(q) ||
            item.products.code.toLowerCase().includes(q) ||
            (item.manifests?.title || '').toLowerCase().includes(q) ||
            dist.id.toLowerCase().includes(q)
        ) ||
        getDisplayUserName(dist.created_by_name, dist.created_by_email).toLowerCase().includes(q)
      : true;
    return matchDp && matchDate && matchSearch;
  });

  const totalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE);
  const paginatedHistory = filteredHistory.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleExportExcel = () => {
    const exportData: any[] = [];
    filteredHistory.forEach(dist => {
      const distRefCode = `DIST-${dist.id.split('-')[0].toUpperCase()}`;
      const dateStr = formatDisplayDate(dist.distribution_date);
      const submittedTime = dist.submitted_at_gmt6 || formatStoredWallTime(dist.created_at);
      const editCount = Number(dist.edit_count) || 0;
      const lastEditedTime = dist.last_edited_at_gmt6 || (dist.updated_at ? formatRealUtcToGmt6(dist.updated_at) : '');

      dist.distribution_items.forEach((item: any) => {
        exportData.push({
          Date: dateStr,
          'System TXN ID': distRefCode,
          'Distribution Point': dist.distribution_points.name,
          'Manifest Name': item.manifests?.title || 'Unknown',
          'Product Name': item.products.name,
          'Product Code': item.products.code,
          'Distributed Quantity': item.quantity,
          'Total HH': item.total_hh || 0,
          Unit: item.products.unit_type,
          'Open Stock': item.products.is_open_stock ? 'Yes' : 'No',
          'Submitted By': getDisplayUserName(dist.created_by_name, dist.created_by_email),
          'Submitted Time (GMT+6)': submittedTime,
          'Edit Count': editCount,
          'Last Edited By': editCount > 0 ? getDisplayUserName(dist.updated_by_name, dist.updated_by_email) : '-',
          'Last Edited Time (GMT+6)': editCount > 0 ? lastEditedTime : '-'
        });
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Distribution_History');
    XLSX.writeFile(workbook, `Distribution_History_${getGmt6NowParts().dateStr}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    let dateRangeText = 'All Time';
    if (filterStartDate && filterEndDate) dateRangeText = `${formatDisplayDate(filterStartDate)} to ${formatDisplayDate(filterEndDate)}`;
    else if (filterStartDate) dateRangeText = `From ${formatDisplayDate(filterStartDate)}`;
    else if (filterEndDate) dateRangeText = `Until ${formatDisplayDate(filterEndDate)}`;

    const dpNameText = filterDpId === 'ALL' ? 'All Assigned Camps' : distributionPoints.find(d => d.id === filterDpId)?.name || '';

    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(`Distribution History - ${dpNameText}`, 14, 15);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Period: ${dateRangeText} | Generated (GMT+6): ${getGmt6NowParts().displayDateTime}`, 14, 21);

    const tableColumn = ['Date', 'TXN ID', 'Distribution Point', 'Manifest Name', 'Product Name', 'Dist. Qty', 'Total HH', 'Unit'];
    const tableRows: any[] = [];

    filteredHistory.forEach(dist => {
      const distRefCode = `DIST-${dist.id.split('-')[0].toUpperCase()}`;
      const dateStr = formatDisplayDate(dist.distribution_date);
      dist.distribution_items.forEach((item: any) => {
        tableRows.push([
          dateStr,
          distRefCode,
          dist.distribution_points.name,
          item.manifests?.title || 'Unknown',
          item.products.name + (item.products.is_open_stock ? ' (Open)' : ''),
          item.quantity,
          item.total_hh || 0,
          item.products.unit_type
        ]);
      });
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 26,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [15, 23, 42], overflow: 'linebreak' },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', lineWidth: 0.2 },
      columnStyles: {
        5: { halign: 'center', fontStyle: 'bold', textColor: [5, 150, 105] },
        6: { halign: 'center', fontStyle: 'bold', textColor: [79, 70, 229] }
      }
    });

    doc.save(`Distribution_History_${getGmt6NowParts().dateStr}.pdf`);
  };

  const preventScroll = (e: React.WheelEvent<HTMLInputElement>) => {
    (e.target as HTMLInputElement).blur();
  };

  // রিভিউ পপআপের টোটাল হিসাব
  const reviewTotalItems = pendingSubmitGroups.reduce(
    (sum, g) => sum + g.payloads.reduce((s2, p) => s2 + p.items.length, 0),
    0
  );
  const reviewTotalQty = pendingSubmitGroups.reduce(
    (sum, g) => sum + g.payloads.reduce((s2, p) => s2 + p.items.reduce((s3, i) => s3 + i.qty, 0), 0),
    0
  );
  const reviewTotalHH = pendingSubmitGroups.reduce(
    (sum, g) => sum + g.payloads.reduce((s2, p) => s2 + p.items.reduce((s3, i) => s3 + i.hh, 0), 0),
    0
  );

  return (
    <div className="flex flex-col min-h-screen flex-1 bg-slate-50 w-full animate-in fade-in duration-500 relative">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `
        }}
      />

      <header className="flex min-h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 pr-20 shrink-0 shadow-sm z-20 sticky top-0 justify-between flex-wrap gap-3 py-3">
        <div className="flex items-center">
          <button onClick={() => window.history.back()} className="mr-3 p-2 rounded-full hover:bg-slate-100 text-slate-900 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900">Daily Distribution Report</h2>
            <p className="text-[10px] md:text-xs text-slate-600 hidden sm:block">Submit end-of-day quantities against active manifests</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          <span className="text-xs font-bold text-slate-500 uppercase shrink-0">Filter DP:</span>
          <select
            value={dpFilter}
            onChange={e => setDpFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 shadow-sm truncate max-w-xs"
          >
            {distributionPoints.length === 0 ? (
              <option value="" disabled>No Assigned DPs</option>
            ) : (
              <option value="" disabled>-- Select Distribution Point --</option>
            )}
            {distributionPoints.map(dp => (
              <option key={dp.id} value={dp.id}>
                [{dp.code}] {dp.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex-1 p-4 md:p-6 space-y-6">
        {msg.text && (
          <div
            className={`p-4 rounded-xl shadow-lg border text-sm font-bold animate-in slide-in-from-top-2 flex justify-between items-center fixed top-24 left-1/2 -translate-x-1/2 z-[120] w-[90%] max-w-md ${
              msg.type === 'error'
                ? 'bg-rose-50 text-slate-900 border-rose-200'
                : 'bg-emerald-50 text-slate-900 border-emerald-200'
            }`}
          >
            <span>
              {msg.type === 'error' ? '⚠️' : '✅'} {msg.text}
            </span>
            <button onClick={() => setMsg({ text: '', type: '' })} className="hover:bg-slate-200 rounded p-1 text-slate-900">
              <Icons.Close />
            </button>
          </div>
        )}

        {/* MAIN INPUT SECTION */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col w-full overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 rounded-t-2xl">
            <div>
              <h3 className="font-bold text-slate-900 text-sm uppercase">Active Manifests for Selected DP</h3>
              <p className="text-[10px] text-slate-600 mt-0.5 font-bold">Showing {filteredManifests.length} active manifest(s)</p>
            </div>
            <div className="flex items-center space-x-2 shrink-0 bg-white border border-slate-300 rounded-xl px-3 py-1.5 shadow-sm focus-within:border-indigo-500">
              <span className="text-xs font-bold text-slate-500 uppercase">Date:</span>
              <input
                type="date"
                value={distDate}
                onChange={e => setDistDate(e.target.value)}
                required
                className="bg-transparent text-xs font-bold text-slate-900 outline-none w-full"
              />
            </div>
          </div>

          {/* তাৎক্ষণিক ডুপ্লিকেট রিপোর্ট সতর্কতা ব্যানার (যদি এই DP ও তারিখে রিপোর্ট আগে থেকেই থাকে) */}
          {existingTodayBannerReports.length > 0 && (
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                <span className="text-base">⚠️</span>
                <span>
                  Notice: <strong>{existingTodayBannerReports.length}</strong> report(s) already submitted for{' '}
                  <strong>{formatDisplayDate(distDate)}</strong> at this DP. (Recommended: 1 report per day — urgent additional entries are allowed after confirmation.)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetailsData(existingTodayBannerReports[0]);
                  setDetailsModalOpen(true);
                }}
                className="px-3 py-1 bg-white border border-amber-300 text-amber-800 rounded-lg text-[11px] font-bold hover:bg-amber-100 transition-colors shrink-0 w-max"
              >
                View Submitted Report
              </button>
            </div>
          )}

          <div className="p-3 md:p-4 space-y-6 bg-slate-50/30 overflow-x-hidden min-h-[300px]">
            {isLoading ? (
              <div className="flex justify-center items-center h-40">
                <Icons.Spinner />
              </div>
            ) : filteredManifests.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-slate-900 p-10 border-2 border-dashed border-slate-200 rounded-xl m-4 bg-white">
                <span className="text-4xl mb-3 opacity-50">📋</span>
                <p className="text-sm font-bold text-slate-500">
                  {!dpFilter ? 'Select a DP from the top menu' : 'No Active Manifests Found for this DP'}
                </p>
              </div>
            ) : (
              filteredManifests.map((manifest, idx) => {
                const theme = MANIFEST_COLORS[idx % MANIFEST_COLORS.length];
                const items = sortManifestItemsBySequence(allManifestItems.filter(i => i.manifest_id === manifest.id));

                return (
                  <div key={manifest.id} className={`bg-white border ${theme.border} rounded-xl shadow-sm overflow-hidden flex flex-col`}>
                    <div className={`${theme.bg} p-3 md:p-4 border-b ${theme.border} flex justify-between items-start rounded-t-xl shrink-0`}>
                      <div className="flex items-start flex-1 min-w-0 pr-2">
                        <div title="Active Manifest" className="relative flex h-3 w-3 mr-2.5 mt-1.5 shrink-0 cursor-help">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className={`font-bold ${theme.text} text-sm md:text-base break-words whitespace-normal leading-tight flex flex-col md:flex-row md:items-center`}>
                            <span className={`text-[10px] font-black ${theme.numBg} px-2 py-0.5 rounded-full md:mr-2 shrink-0 w-max mb-1 md:mb-0`}>
                              #{idx + 1}
                            </span>
                            <span>{manifest.title}</span>
                          </h4>
                        </div>
                      </div>
                    </div>

                    {items.length === 0 ? (
                      <div className="p-4 text-center text-xs font-bold text-slate-400">No items found for this manifest.</div>
                    ) : (
                      <div className="w-full flex flex-col divide-y divide-slate-100">
                        <div className="hidden md:grid grid-cols-12 gap-2 bg-slate-50 px-4 py-3 border-b border-slate-100 items-center">
                          <div className="col-span-4 text-[10px] font-bold text-slate-500 uppercase">Product Details</div>
                          <div className="col-span-2 text-[10px] font-bold text-slate-500 uppercase text-center">Progress</div>
                          <div className="col-span-2 text-[10px] font-bold text-slate-500 uppercase text-center">WH Stock</div>
                          <div className="col-span-2 text-[10px] font-bold text-slate-900 uppercase text-center">Distributed Qty</div>
                          <div className="col-span-2 text-[10px] font-bold text-slate-900 uppercase text-center">Total HH</div>
                        </div>

                        {items.map(item => {
                          const isOpenStock = item.products?.is_open_stock;
                          const stockKey1 = `${manifest.dp?.nfi_warehouse_id}_${item.product_id}`;
                          const stockKey2 = `${manifest.dp?.lpg_warehouse_id}_${item.product_id}`;
                          const availStock = isOpenStock
                            ? 999999
                            : (whStockMap[stockKey1] || 0) + (whStockMap[stockKey2] || 0);

                          const inputKey = `${manifest.id}_${item.product_id}`;
                          const qVal = inputs[inputKey]?.qty ?? '';
                          const hhVal = inputs[inputKey]?.hh ?? '';
                          const isTargetless = item.target_qty === 0;
                          const remText = isTargetless ? '∞' : Math.max(0, item.target_qty - (item.distributed_qty || 0));

                          return (
                            <div
                              key={item.id}
                              className="flex flex-col md:grid md:grid-cols-12 gap-3 md:gap-2 px-4 py-4 hover:bg-slate-50 transition-colors items-center border-b border-slate-50 last:border-0"
                            >
                              <div className="w-full md:col-span-4 flex flex-col">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-bold text-slate-900 text-sm break-words whitespace-normal leading-tight">
                                    {item.products?.name}
                                  </p>
                                  {isOpenStock && (
                                    <span className="px-1.5 py-0.5 text-[8px] bg-amber-100 text-amber-800 border border-amber-200 rounded font-black uppercase shrink-0">
                                      Open
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-500 font-medium font-mono">{item.products?.code}</span>
                              </div>
                              <div className="w-full md:col-span-4 flex flex-row justify-between md:grid md:grid-cols-2 bg-slate-50 md:bg-transparent p-2 md:p-0 rounded-lg border border-slate-100 md:border-0">
                                <div className="flex flex-col md:items-center justify-center">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase md:hidden mb-0.5">Progress</span>
                                  <div className="text-xs font-bold text-slate-800">
                                    {item.distributed_qty || 0} / {isTargetless ? '∞' : item.target_qty}
                                  </div>
                                  <div className="text-[10px] text-indigo-600 font-bold mt-0.5">Rem: {remText}</div>
                                </div>
                                <div className="flex flex-col md:items-center justify-center items-end">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase md:hidden mb-0.5">WH Stock</span>
                                  {isOpenStock ? (
                                    <span className="text-base font-black text-amber-600">∞</span>
                                  ) : (
                                    <span className={`text-base font-black ${availStock > 0 ? 'text-indigo-600' : 'text-rose-500'}`}>
                                      {availStock.toLocaleString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="w-full md:col-span-4 grid grid-cols-2 gap-3 items-center">
                                <div className="flex flex-col">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase md:hidden mb-1">Dist. Qty</label>
                                  <input
                                    type="number"
                                    min="0"
                                    max={isOpenStock ? undefined : availStock}
                                    disabled={!isOpenStock && availStock <= 0}
                                    value={qVal}
                                    onChange={e => handleQtyChange(manifest.id, item.product_id, e.target.value, availStock, isOpenStock)}
                                    onWheel={preventScroll}
                                    placeholder={isOpenStock ? 'Qty...' : availStock > 0 ? '0' : 'No Stock'}
                                    className="w-full text-center md:text-right px-3 py-2.5 bg-white border-2 border-slate-300 rounded-xl text-sm font-black text-indigo-700 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 disabled:bg-slate-100 disabled:border-slate-200 transition-colors shadow-sm"
                                  />
                                </div>
                                <div className="flex flex-col">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase md:hidden mb-1">Total HH</label>
                                  <input
                                    type="number"
                                    min="0"
                                    disabled={!isOpenStock && availStock <= 0}
                                    value={hhVal}
                                    onChange={e => handleHHChange(manifest.id, item.product_id, e.target.value)}
                                    onWheel={preventScroll}
                                    placeholder="0"
                                    className="w-full text-center md:text-right px-3 py-2.5 bg-white border-2 border-slate-300 rounded-xl text-sm font-black text-slate-900 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 disabled:bg-slate-100 disabled:border-slate-200 transition-colors shadow-sm"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center gap-3 shrink-0 rounded-b-2xl">
            <input
              type="text"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Daily Summary Note (Optional)..."
              className="w-full sm:flex-1 px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 shadow-sm"
            />
            <button
              onClick={handleInitiateSubmit}
              disabled={isSubmitting || isCheckingDuplicate || filteredManifests.length === 0}
              className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md disabled:opacity-50 flex items-center justify-center transition"
            >
              {isCheckingDuplicate ? (
                <>
                  <Icons.Spinner /> <span className="ml-2">Checking...</span>
                </>
              ) : (
                'Review & Submit Report'
              )}
            </button>
          </div>
        </div>

        {/* BOTTOM SECTION - DISTRIBUTION HISTORY */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden w-full mb-10">
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex flex-col md:flex-row justify-between gap-4 rounded-t-2xl flex-wrap">
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide shrink-0 pt-2">Distribution History</h3>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-center w-full md:w-auto">
              <select
                value={filterDpId}
                onChange={e => setFilterDpId(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"
              >
                <option value="ALL">All DPs</option>
                {distributionPoints.map(dp => (
                  <option key={dp.id} value={dp.id}>
                    {dp.name}
                  </option>
                ))}
              </select>
              <div className="flex items-center space-x-1 w-full sm:w-auto">
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={e => setFilterStartDate(e.target.value)}
                  className="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"
                  title="From Date"
                />
                <span className="text-xs font-bold text-slate-400">-</span>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={e => setFilterEndDate(e.target.value)}
                  className="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"
                  title="To Date"
                />
              </div>
              <input
                type="text"
                placeholder="Search Code, Name, User..."
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                className="w-full sm:w-auto flex-1 md:w-44 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"
              />

              <div className="flex items-center space-x-2 shrink-0 w-full sm:w-auto justify-end">
                <button
                  onClick={handleExportExcel}
                  className="px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg hover:bg-emerald-100 transition-colors flex items-center"
                >
                  <Icons.Download /> <span className="ml-1">Excel</span>
                </button>
                <button
                  onClick={handleExportPDF}
                  className="px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg hover:bg-rose-100 transition-colors flex items-center"
                >
                  <Icons.Download /> <span className="ml-1">PDF</span>
                </button>
              </div>
            </div>
          </div>

          <div className="w-full bg-white">
            {isLoading && historyItems.length === 0 ? (
              <div className="p-8 text-center">
                <Icons.Spinner />
              </div>
            ) : paginatedHistory.length === 0 ? (
              <div className="p-8 text-center text-sm font-medium text-slate-500">No records found.</div>
            ) : (
              <div className="flex flex-col">
                <div className="hidden lg:grid grid-cols-12 gap-4 px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <div className="col-span-2 text-[11px] font-bold text-slate-500 uppercase">Date &amp; TXN</div>
                  <div className="col-span-3 text-[11px] font-bold text-slate-500 uppercase">Distribution Point &amp; Entry Info</div>
                  <div className="col-span-6 text-[11px] font-bold text-slate-500 uppercase">Distributed Items</div>
                  <div className="col-span-1 text-[11px] font-bold text-slate-500 uppercase text-center">Actions</div>
                </div>

                {paginatedHistory.map(dist => {
                  const submittedByName = getDisplayUserName(dist.created_by_name, dist.created_by_email);
                  const submittedTimeText = dist.submitted_at_gmt6 || formatStoredWallTime(dist.created_at);
                  const editCount = Number(dist.edit_count) || 0;
                  const wasEdited = editCount > 0 || Boolean(dist.last_edited_at_gmt6 || dist.updated_by_name || dist.updated_by_email);
                  const editedByName = getDisplayUserName(dist.updated_by_name, dist.updated_by_email);
                  const lastEditedTimeText = dist.last_edited_at_gmt6 || (dist.updated_at ? formatRealUtcToGmt6(dist.updated_at) : '');

                  return (
                    <div key={dist.id} className="flex flex-col lg:grid lg:grid-cols-12 gap-4 px-4 py-4 border-b border-slate-100 hover:bg-slate-50">
                      <div className="lg:col-span-2 flex flex-col justify-start">
                        <p className="font-bold text-slate-900 text-sm">{formatDisplayDate(dist.distribution_date)}</p>
                        <p className="text-[10px] text-indigo-600 font-bold font-mono mt-1">
                          DIST-{dist.id.split('-')[0].toUpperCase()}
                        </p>
                      </div>

                      {/* DP Name + ছোট টেক্সটে ইউজার নাম, সাবমিট সময় ও এডিট হিস্ট্রি */}
                      <div className="lg:col-span-3 flex flex-col justify-start">
                        <p className="font-bold text-slate-900 text-sm leading-snug">{dist.distribution_points.name}</p>
                        <div className="mt-1.5 space-y-0.5 text-[10px] leading-tight text-slate-500">
                          <p>
                            By: <span className="font-bold text-slate-700">{submittedByName}</span>
                          </p>
                          {submittedTimeText && (
                            <p className="text-slate-500">
                              Submitted: <span className="font-semibold text-slate-600">{submittedTimeText}</span>
                            </p>
                          )}
                          {wasEdited && (
                            <p className="text-amber-700 font-semibold pt-0.5">
                              Edited {editCount > 0 ? `${editCount} ${editCount === 1 ? 'time' : 'times'}` : ''}
                              {editedByName ? ` • By ${editedByName}` : ''}
                              {lastEditedTimeText ? ` • ${lastEditedTimeText}` : ''}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="lg:col-span-6 flex flex-col space-y-3">
                        {dist.distribution_items.map((item: any) => (
                          <div key={item.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
                            <div className="bg-slate-50 px-3 py-2 border-b border-slate-100">
                              <p className="text-xs font-bold text-slate-900 leading-relaxed">{item.manifests?.title}</p>
                            </div>
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center px-3 py-2.5 gap-2 sm:gap-4">
                              <p className="text-sm font-semibold text-slate-800 flex-1 leading-tight">
                                {item.products.name}
                                {item.products.is_open_stock && (
                                  <span className="ml-2 px-1.5 py-0.5 text-[8px] bg-amber-100 text-amber-800 border border-amber-200 rounded font-black uppercase">
                                    Open Stock
                                  </span>
                                )}
                              </p>
                              <div className="flex items-center space-x-4 bg-slate-50 sm:bg-transparent p-2 sm:p-0 rounded-lg">
                                <p className="text-sm font-black text-indigo-600 text-right w-16">
                                  {item.quantity} <span className="text-[9px] font-bold text-slate-500 uppercase">{item.products.unit_type}</span>
                                </p>
                                <p className="text-sm font-black text-emerald-600 text-right w-16">
                                  {item.total_hh} <span className="text-[9px] font-bold text-slate-500 uppercase">HH</span>
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="lg:col-span-1 flex flex-row lg:flex-col items-center justify-center gap-2 mt-4 lg:mt-0">
                        <button
                          onClick={() => {
                            setDetailsData(dist);
                            setDetailsModalOpen(true);
                          }}
                          className="flex-1 lg:w-full py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-bold rounded-lg hover:bg-indigo-100"
                        >
                          Details
                        </button>
                        <button
                          onClick={() => openEditModal(dist)}
                          className="flex-1 lg:w-full py-2 bg-amber-50 text-amber-700 border border-amber-100 text-xs font-bold rounded-lg hover:bg-amber-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setTxnToRevert(dist);
                            setRevertModalOpen(true);
                          }}
                          className="flex-1 lg:w-full py-2 bg-rose-50 text-rose-700 border border-rose-100 text-xs font-bold rounded-lg hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 p-4 bg-white border-t border-slate-200 rounded-b-2xl">
            {historyItems.length < totalDbCount && (
              <div className="w-full flex justify-center pb-2">
                <button
                  onClick={handleLoadMoreHistory}
                  disabled={isLoadingMore}
                  className="px-6 py-2 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-full border border-indigo-200 hover:bg-indigo-100 transition shadow-sm"
                >
                  {isLoadingMore ? 'Loading...' : `Load More Data (Loaded: ${historyItems.length} of ${totalDbCount})`}
                </button>
              </div>
            )}

            {filteredHistory.length > 0 && (
              <div className="flex justify-between items-center w-full">
                <span className="text-xs font-bold text-slate-500">
                  Page {currentPage} of {totalPages} (Showing {paginatedHistory.length} items)
                </span>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- 1. DUPLICATE SAME-DAY WARNING POPUP --- */}
      {duplicateWarningModalOpen && duplicateExistingReports.length > 0 && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 max-h-[90vh] overflow-hidden">
            <div className="p-5 border-b border-amber-200 bg-amber-50 flex justify-between items-start shrink-0">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl shrink-0">
                  ⚠️
                </div>
                <div>
                  <h3 className="font-black text-amber-950 text-base md:text-lg leading-tight">
                    Report Already Submitted for {formatDisplayDate(distDate)}!
                  </h3>
                  <p className="text-xs text-amber-800 font-semibold mt-1">
                    Recommended: 1 distribution report per DP per day. Below is the existing report(s) for this date.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDuplicateWarningModalOpen(false)}
                className="p-1.5 bg-white border border-amber-200 text-amber-600 rounded-lg hover:bg-amber-100"
              >
                <Icons.Close />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
              {duplicateExistingReports.map((rep, idx) => {
                const subName = getDisplayUserName(rep.created_by_name, rep.created_by_email);
                const subTime = rep.submitted_at_gmt6 || formatStoredWallTime(rep.created_at);
                const editCnt = Number(rep.edit_count) || 0;

                return (
                  <div key={rep.id} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                    <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-black text-indigo-700 font-mono mr-2">
                          #{idx + 1} DIST-{rep.id.split('-')[0].toUpperCase()}
                        </span>
                        <span className="font-bold text-slate-900">{rep.distribution_points?.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 font-semibold">
                        By <strong className="text-slate-900">{subName}</strong> • {subTime}
                        {editCnt > 0 && <span className="ml-1.5 text-amber-700">(Edited {editCnt}x)</span>}
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100 bg-white">
                      {(rep.distribution_items || []).map((item: any) => (
                        <div key={item.id} className="px-4 py-2 flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate">{item.products?.name}</p>
                            <p className="text-[10px] text-slate-500 truncate">{item.manifests?.title}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 font-bold">
                            <span className="text-indigo-700">
                              {item.quantity} {item.products?.unit_type}
                            </span>
                            <span className="text-emerald-700">{item.total_hh} HH</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {rep.remarks && (
                      <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-600">
                        <strong>Remarks:</strong> {rep.remarks}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-950 font-medium leading-relaxed">
                If you only need to change quantities on the existing report, please click <strong>Cancel</strong> and use the <strong>Edit</strong> button in Distribution History.
                <br />
                Do you urgently want to submit an <strong>additional new report</strong> for <strong>{formatDisplayDate(distDate)}</strong>?
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setDuplicateWarningModalOpen(false)}
                className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-100 text-xs md:text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProceedAfterDuplicateWarning}
                className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs md:text-sm shadow-md transition-colors"
              >
                Yes, Add Additional Report →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- 2. SUBMIT REVIEW & CONFIRM POPUP --- */}
      {reviewModalOpen && pendingSubmitGroups.length > 0 && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 max-h-[90vh] overflow-hidden">
            <div className="p-5 border-b border-indigo-100 bg-indigo-50/70 flex justify-between items-center shrink-0">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-black text-slate-900 text-lg">Review Distribution Report</h3>
                  {isAdditionalReportConfirmed && (
                    <span className="text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full uppercase">
                      Additional Report
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 font-semibold mt-0.5">
                  Please verify all entered quantities and HH counts carefully before confirming.
                </p>
              </div>
              <button
                onClick={() => setReviewModalOpen(false)}
                className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-100"
              >
                <Icons.Close />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-5 custom-scrollbar">
              {/* Top Meta Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Report Date</p>
                  <p className="font-black text-slate-900 text-sm mt-0.5">{formatDisplayDate(distDate)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Submitted By</p>
                  <p className="font-bold text-slate-800 mt-0.5 truncate">{currentUserName || currentUser?.email}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Total Qty ({reviewTotalItems} Items)</p>
                  <p className="font-black text-indigo-700 text-sm mt-0.5">{reviewTotalQty.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Total HH</p>
                  <p className="font-black text-emerald-700 text-sm mt-0.5">{reviewTotalHH.toLocaleString()}</p>
                </div>
              </div>

              {/* Grouped Inputs by DP & Manifest */}
              {pendingSubmitGroups.map(grp => (
                <div key={grp.dpId} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-indigo-800 uppercase tracking-wide">
                      📍 {grp.dp?.name} {grp.dp?.code ? `(${grp.dp.code})` : ''}
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-100 border-b border-slate-200">
                        <tr>
                          <th className="p-3 text-[10px] font-black text-slate-600 uppercase">Manifest</th>
                          <th className="p-3 text-[10px] font-black text-slate-600 uppercase">Product</th>
                          <th className="p-3 text-[10px] font-black text-slate-600 uppercase text-right">Dist. Qty</th>
                          <th className="p-3 text-[10px] font-black text-slate-600 uppercase text-right">Total HH</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {grp.payloads.map(payload =>
                          payload.items.map(entry => (
                            <tr key={`${payload.manifest.id}_${entry.item.product_id}`} className="hover:bg-slate-50">
                              <td className="p-3 text-xs font-bold text-slate-700">{payload.manifest.title}</td>
                              <td className="p-3 text-xs font-bold text-slate-900">
                                {entry.item.products?.name}
                                <span className="block text-[10px] font-mono font-normal text-slate-400">
                                  {entry.item.products?.code}
                                </span>
                              </td>
                              <td className="p-3 text-sm font-black text-indigo-700 text-right whitespace-nowrap">
                                {entry.qty.toLocaleString()}{' '}
                                <span className="text-[10px] font-bold text-slate-500 uppercase">
                                  {entry.item.products?.unit_type}
                                </span>
                              </td>
                              <td className="p-3 text-sm font-black text-emerald-700 text-right whitespace-nowrap">
                                {entry.hh.toLocaleString()}{' '}
                                <span className="text-[10px] font-bold text-slate-500 uppercase">HH</span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {remarks.trim() && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Daily Summary Note / Remarks</p>
                  <p className="text-xs font-bold text-slate-800">{remarks}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                disabled={isSubmitting}
                className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-100 text-xs md:text-sm transition-colors disabled:opacity-50"
              >
                ← Back &amp; Edit Inputs
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmitAll}
                disabled={isSubmitting}
                className="px-7 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs md:text-sm shadow-md flex items-center justify-center transition-colors disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Icons.Spinner /> <span className="ml-2">Submitting...</span>
                  </>
                ) : (
                  '✓ Confirm & Submit Report'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- DETAILS MODAL --- */}
      {detailsModalOpen && detailsData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Transaction Details</h3>
                <p className="text-xs text-indigo-600 font-bold font-mono mt-0.5 break-words whitespace-normal">
                  DIST-{detailsData.id.split('-')[0].toUpperCase()}
                </p>
              </div>
              <button
                onClick={() => setDetailsModalOpen(false)}
                className="bg-rose-500 text-white p-1.5 rounded-lg hover:bg-rose-600 transition-colors shadow-sm"
              >
                <Icons.Close />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-5 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 p-4 rounded-xl">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Distribution Point</p>
                  <p className="font-bold text-slate-900 text-sm break-words whitespace-normal">
                    {detailsData.distribution_points.name}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Distribution Date</p>
                  <p className="font-bold text-slate-900 text-sm">{formatDisplayDate(detailsData.distribution_date)}</p>
                </div>
                <div className="pt-2 border-t border-slate-200">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Submitted By &amp; Time (GMT+6)</p>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">
                    {getDisplayUserName(detailsData.created_by_name, detailsData.created_by_email)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {detailsData.submitted_at_gmt6 || formatStoredWallTime(detailsData.created_at)}
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-200 sm:text-right">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Edit Status</p>
                  {(Number(detailsData.edit_count) || 0) > 0 || detailsData.last_edited_at_gmt6 ? (
                    <>
                      <p className="text-xs font-bold text-amber-700 mt-0.5">
                        Edited {Number(detailsData.edit_count) || 1} time(s) by{' '}
                        {getDisplayUserName(detailsData.updated_by_name, detailsData.updated_by_email)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {detailsData.last_edited_at_gmt6 || formatRealUtcToGmt6(detailsData.updated_at)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs font-semibold text-emerald-700 mt-0.5">Original Entry (Not Edited)</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Distributed Items</p>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Manifest</th>
                        <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Product</th>
                        <th className="p-3 text-[10px] font-bold text-slate-500 uppercase text-right">Distributed Qty</th>
                        <th className="p-3 text-[10px] font-bold text-slate-500 uppercase text-right">Total HH</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailsData.distribution_items.map((item: any) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="p-3 text-xs font-bold text-slate-900 break-words whitespace-normal">
                            {item.manifests?.title}
                          </td>
                          <td className="p-3 text-xs font-semibold text-slate-800 break-words whitespace-normal">
                            {item.products.name}
                            {item.products.is_open_stock && (
                              <span className="ml-2 px-1 py-0.5 text-[8px] bg-amber-100 text-amber-800 border border-amber-200 rounded font-black uppercase">
                                Open
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-sm font-black text-indigo-600 text-right whitespace-nowrap">
                            {item.quantity} <span className="text-[9px] font-bold text-slate-500 uppercase">{item.products.unit_type}</span>
                          </td>
                          <td className="p-3 text-sm font-black text-emerald-600 text-right whitespace-nowrap">
                            {item.total_hh} <span className="text-[9px] font-bold text-slate-500 uppercase">HH</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {detailsData.remarks && (
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Remarks</p>
                  <p className="text-xs font-medium text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-200 break-words whitespace-normal">
                    {detailsData.remarks}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- UNIFIED EDIT MODAL (Date is Now Editable!) --- */}
      {editModalOpen && distToEdit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 mt-16 md:mt-0">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 max-h-[85vh] md:max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Edit Full Transaction</h3>
                <p className="text-xs text-indigo-600 font-bold font-mono mt-0.5 break-words whitespace-normal">
                  DIST-{distToEdit.id.split('-')[0].toUpperCase()} • {distToEdit.distribution_points.name}
                </p>
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                className="bg-rose-500 text-white p-1.5 rounded-lg hover:bg-rose-600 transition-colors shadow-sm"
              >
                <Icons.Close />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 overflow-y-auto flex-1 space-y-5 custom-scrollbar">
              {/* Editable Distribution Date */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">
                  Distribution Date (Editable)
                </label>
                <input
                  type="date"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-white border-2 border-indigo-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Edit Quantities &amp; Total HH</label>
                <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {distToEdit.distribution_items.map((item: any) => {
                    const isOpenStock = item.products?.is_open_stock;
                    return (
                      <div
                        key={item.id}
                        className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-200 last:border-0 last:pb-0"
                      >
                        <div className="flex-1">
                          <p className="font-bold text-slate-900 text-sm break-words whitespace-normal flex items-center gap-2">
                            {item.products.name}
                            {isOpenStock && (
                              <span className="px-1.5 py-0.5 text-[8px] bg-amber-100 text-amber-800 border border-amber-200 rounded font-black uppercase">
                                Open Stock
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-slate-600 font-medium mt-0.5 break-words whitespace-normal">
                            Manifest: <span className="font-bold">{item.manifests?.title}</span>
                          </p>
                          {!isOpenStock && (
                            <p className="text-[10px] font-bold text-emerald-600 mt-1">
                              Shared Max Qty: {editMaxStocks[item.product_id] || 0}
                            </p>
                          )}
                        </div>
                        <div className="flex space-x-3 items-center sm:items-start shrink-0">
                          <div className="flex-1 sm:flex-none">
                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1 sm:text-right">Dist. Qty</label>
                            <div className="flex items-center space-x-1">
                              <input
                                type="number"
                                min="0"
                                max={isOpenStock ? undefined : editMaxStocks[item.product_id] || 0}
                                value={editValues[item.id]?.qty ?? ''}
                                onChange={e =>
                                  setEditValues(prev => ({
                                    ...prev,
                                    [item.id]: { ...prev[item.id], qty: e.target.value === '' ? '' : Number(e.target.value) }
                                  }))
                                }
                                onWheel={preventScroll}
                                className="w-full sm:w-20 px-3 py-2 border-2 border-slate-300 rounded-lg text-center sm:text-right font-black text-slate-900 outline-none focus:border-indigo-500"
                                required
                              />
                              <span className="text-[9px] font-bold text-slate-500 uppercase">{item.products.unit_type}</span>
                            </div>
                          </div>
                          <div className="flex-1 sm:flex-none">
                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1 sm:text-right">Total HH</label>
                            <div className="flex items-center space-x-1">
                              <input
                                type="number"
                                min="0"
                                value={editValues[item.id]?.hh ?? ''}
                                onChange={e =>
                                  setEditValues(prev => ({
                                    ...prev,
                                    [item.id]: { ...prev[item.id], hh: e.target.value === '' ? '' : Number(e.target.value) }
                                  }))
                                }
                                onWheel={preventScroll}
                                className="w-full sm:w-20 px-3 py-2 border-2 border-slate-300 rounded-lg text-center sm:text-right font-black text-slate-900 outline-none focus:border-indigo-500"
                                required
                              />
                              <span className="text-[9px] font-bold text-slate-500 uppercase">HH</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Remarks</label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={e => setEditRemarks(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500"
                  placeholder="Remarks..."
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm mt-2 shadow-md transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save All Changes & Adjust Balance'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- ENHANCED DELETE / REVERT MODAL (With Full Record Details for Over-Confirmation) --- */}
      {revertModalOpen && txnToRevert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 max-h-[90vh]">
            <div className="p-5 bg-rose-50 border-b border-rose-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center text-xl">
                  ⚠️
                </div>
                <div>
                  <h4 className="font-black text-base text-rose-950">Confirm Delete Transaction</h4>
                  <p className="text-[11px] font-mono font-bold text-rose-700">
                    DIST-{txnToRevert.id.split('-')[0].toUpperCase()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRevertModalOpen(false)}
                className="p-1.5 bg-white border border-rose-200 text-rose-500 rounded-lg hover:bg-rose-100"
              >
                <Icons.Close />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar">
              {/* Record Metadata for Over-Confirmation */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 font-bold">DP Name:</span>
                  <span className="text-slate-900 font-black text-right">{txnToRevert.distribution_points?.name}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 font-bold">Report Date:</span>
                  <span className="text-slate-900 font-black">{formatDisplayDate(txnToRevert.distribution_date)}</span>
                </div>
                <div className="flex justify-between gap-2 pt-1.5 border-t border-slate-200">
                  <span className="text-slate-500 font-bold">Submitted By:</span>
                  <span className="text-slate-800 font-bold text-right">
                    {getDisplayUserName(txnToRevert.created_by_name, txnToRevert.created_by_email)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 font-bold">Entry Time (GMT+6):</span>
                  <span className="text-slate-700 font-semibold text-right">
                    {txnToRevert.submitted_at_gmt6 || formatStoredWallTime(txnToRevert.created_at)}
                  </span>
                </div>
                {((Number(txnToRevert.edit_count) || 0) > 0 || txnToRevert.last_edited_at_gmt6) && (
                  <div className="flex justify-between gap-2 pt-1.5 border-t border-slate-200 text-amber-800">
                    <span className="font-bold">Last Edited ({Number(txnToRevert.edit_count) || 1}x):</span>
                    <span className="font-semibold text-right">
                      {getDisplayUserName(txnToRevert.updated_by_name, txnToRevert.updated_by_email)} •{' '}
                      {txnToRevert.last_edited_at_gmt6 || formatRealUtcToGmt6(txnToRevert.updated_at)}
                    </span>
                  </div>
                )}
              </div>

              {/* Items to be Restored */}
              <div className="border border-rose-200 rounded-xl overflow-hidden">
                <div className="bg-rose-50/70 px-3 py-2 text-[10px] font-black text-rose-800 uppercase border-b border-rose-100">
                  Items to be Deleted &amp; Restored ({txnToRevert.distribution_items?.length || 0})
                </div>
                <div className="divide-y divide-slate-100 max-h-36 overflow-y-auto bg-white custom-scrollbar">
                  {(txnToRevert.distribution_items || []).map((item: any) => (
                    <div key={item.id} className="px-3 py-2 flex justify-between items-center text-xs gap-2">
                      <span className="font-bold text-slate-800 truncate">{item.products?.name}</span>
                      <span className="font-black text-rose-700 whitespace-nowrap">
                        {item.quantity} {item.products?.unit_type} / {item.total_hh} HH
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-slate-600 text-center leading-relaxed">
                This action will permanently delete this record and restore the deducted stock back to the warehouse.
              </p>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col gap-2 shrink-0">
              <button
                onClick={handleRevertTransaction}
                disabled={isSubmitting}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-sm shadow-md transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Deleting & Restoring Stock...' : 'Yes, Permanently Delete Transaction'}
              </button>
              <button
                onClick={() => setRevertModalOpen(false)}
                disabled={isSubmitting}
                className="w-full bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}