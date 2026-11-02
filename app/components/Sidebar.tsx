"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icons } from './Icons';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (val: boolean) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  
  const [userRole, setUserRole] = useState<string>('Loading...'); 
  const [sidebarMenus, setSidebarMenus] = useState<any[]>([]);
  
  // সম্পূর্ণ ব্ল্যাংক ইনিশিয়াল স্টেট, যাতে প্রথমে কোনো ভুল নাম না দেখায়
  const [branding, setBranding] = useState({ appName: "Loading...", logoText: ".." });
  const [isLoading, setIsLoading] = useState(true);
  
  // Track open folders for Accordion Dropdown
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDynamicSidebar();
  }, []);

  const loadDynamicSidebar = async () => {
    setIsLoading(true);
    try {
      const sessionStr = localStorage.getItem('user_session');
      if (!sessionStr) {
         router.push('/login');
         return;
      }
      
      const sessionUser = JSON.parse(sessionStr);
      setUserRole(sessionUser.user_roles?.role_name || 'User');

      const roleNameUpper = (sessionUser.user_roles?.role_name || '').toUpperCase();
      const isSuperAdmin = roleNameUpper.includes('SUPER ADMIN') || roleNameUpper === 'ADMIN' || roleNameUpper.includes('WEB ADMIN');

      // Fetch Data
      const [brandRes, menusRes, accessRes] = await Promise.all([
          supabase.from('app_settings').select('settings').eq('id', 'login_page_design').single(),
          supabase.from('app_menus').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
          isSuperAdmin ? Promise.resolve({ data: [] }) : supabase.from('role_route_access').select('menu_id').eq('role_id', sessionUser.role_id)
      ]);

      // ডেটাবেস থেকে পাওয়া ডাইনামিক নাম সেট করা
      if (brandRes.data?.settings && brandRes.data.settings.logoText) {
          setBranding({
              appName: brandRes.data.settings.logoText,
              logoText: brandRes.data.settings.logoText.substring(0, 2).toUpperCase()
          });
      } else {
          setBranding({ appName: "Distribution System", logoText: "DS" }); // ডেটাবেস একদম খালি থাকলে ফলব্যাক
      }

      const allMenus = menusRes.data || [];
      const allParents = allMenus.filter(m => m.is_parent);
      const allowedIds = accessRes.data?.map(a => a.menu_id) || [];
      
      const processedMenus: any[] = [];
      const initialOpenFolders = new Set<string>();

      // Build 2-Level Nested Hierarchy
      allParents.forEach(parent => {
          const children = allMenus.filter(m => m.parent_id === parent.id);
          let visibleChildren: any[] = [];
          let isVisible = false;

          if (isSuperAdmin) {
              isVisible = true;
              visibleChildren = children;
          } else {
              const hasWildcard = allowedIds.includes(parent.id);
              if (hasWildcard) {
                  isVisible = true;
                  visibleChildren = children; // Show all children
              } else {
                  // Partial Access Logic
                  visibleChildren = children.filter(c => allowedIds.includes(c.id));
                  if (visibleChildren.length > 0) {
                      isVisible = true; // Show parent folder if at least one child is allowed
                  }
              }
          }

          if (isVisible) {
              processedMenus.push({ ...parent, children: visibleChildren });
              // Auto-expand folder if user is currently inside it
              if (pathname.startsWith(parent.path)) {
                  initialOpenFolders.add(parent.id);
              }
          }
      });

      setSidebarMenus(processedMenus);
      setOpenFolders(initialOpenFolders);
      
    } catch (error) {
      console.error("Error loading dynamic sidebar:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFolder = (folderId: string) => {
      const newOpen = new Set(openFolders);
      if (newOpen.has(folderId)) newOpen.delete(folderId);
      else newOpen.add(folderId);
      setOpenFolders(newOpen);
  };

  const renderIcon = (iconName: string) => {
      switch(iconName) {
          case 'Dashboard': return <Icons.Dashboard />;
          case 'Users': return <Icons.Users />;
          case 'Catalog': return <Icons.Catalog />;
          case 'Manifest': return <Icons.Manifest />;
          case 'Filter': return <Icons.Filter />;
          case 'Plus': return <Icons.Plus />;
          case 'Shield': return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>;
          case 'Database': return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>;
          default: return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>;
      }
  };

  return (
    <>
      {/* Mobile Header Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-50">
          <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-500/20">
                  {branding.logoText}
              </div>
              <h2 className="text-lg font-bold text-white tracking-wide truncate">{branding.appName}</h2>
          </div>
          <button onClick={() => setIsOpen(!isOpen)} className="text-slate-300 hover:text-white p-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
      </div>

      {/* Sidebar Backdrop for Mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 z-50 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Main Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-[60] md:z-50 w-72 bg-slate-900 text-slate-300 flex flex-col h-screen transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} border-r border-slate-800 shrink-0 shadow-2xl md:shadow-none`}>
        
        {/* Dynamic Logo from DB */}
        <div className="p-6 flex items-center justify-between shrink-0 border-b border-slate-800/50 pt-20 md:pt-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">
              {branding.logoText}
            </div>
            <div className="overflow-hidden">
              <h2 className="text-xl font-bold text-white tracking-wide truncate">{branding.appName}</h2>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest truncate">{userRole}</p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-slate-400 hover:text-white shrink-0">
            <Icons.Close />
          </button>
        </div>

        <div className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0 mt-2">Main Navigation</div>
        
        {/* ACCORDION MENU NAVIGATION */}
        <nav className="flex-1 px-4 space-y-2 mt-1 overflow-y-auto custom-scrollbar pb-24">
          {isLoading ? (
            <div className="px-4 py-2 text-sm text-slate-500 text-center animate-pulse">Loading Access...</div>
          ) : sidebarMenus.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-500">
               <span className="text-2xl mb-2 block opacity-50">🔒</span>
               No menus available.
            </div>
          ) : (
            sidebarMenus.map((menu) => {
              const isExpanded = openFolders.has(menu.id);
              const isActiveFolder = pathname.startsWith(menu.path);

              return (
                <div key={menu.id} className="space-y-1">
                   {/* Parent Folder Toggle Button */}
                   <button 
                      onClick={() => toggleFolder(menu.id)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                         isActiveFolder && !isExpanded 
                         ? 'bg-indigo-600 text-white shadow-md' 
                         : 'hover:bg-slate-800 text-slate-300'
                      }`}
                   >
                      <div className="flex items-center space-x-3">
                         {renderIcon(menu.icon_name)} 
                         <span className="text-sm font-bold tracking-wide">{menu.title}</span>
                      </div>
                      {menu.children.length > 0 && (
                         <svg className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      )}
                   </button>

                   {/* Sub-menu Dropdown */}
                   {isExpanded && menu.children.length > 0 && (
                      <div className="pl-11 pr-2 py-1 space-y-1 animate-in slide-in-from-top-2">
                         {menu.children.map((child: any) => {
                             const isChildActive = pathname === child.path || pathname.startsWith(child.path + '/');
                             return (
                                 <Link 
                                   key={child.id} 
                                   href={child.path} 
                                   onClick={() => setIsOpen(false)}
                                   className={`block w-full px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
                                      isChildActive 
                                      ? 'bg-indigo-500/20 text-indigo-400' 
                                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                   }`}
                                 >
                                    {child.title}
                                 </Link>
                             );
                         })}
                      </div>
                   )}
                </div>
              );
            })
          )}
        </nav>
      </aside>
    </>
  );
}