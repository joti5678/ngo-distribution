"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icons } from './Icons';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const SYSTEM_CONFIG = {
  appName: "NGO Connect",
  logoInitials: "NC",
};

const MENU_ITEMS = [
  { id: '/', label: 'Dashboard', icon: <Icons.Dashboard />, allowedRoles: ['Super Admin', 'Admin', 'Partner', 'Dashboard Viewer', 'Report Viewer'] },
  { id: '/users', label: 'User Management', icon: <Icons.Users />, allowedRoles: ['Super Admin', 'Admin'] },
  { id: '/catalog', label: 'Product Catalog', icon: <Icons.Catalog />, allowedRoles: ['Super Admin', 'Admin', 'Warehouse Officer', 'Distribution Manager'] },
  { id: '/manifests', label: 'Manifests', icon: <Icons.Manifest />, allowedRoles: ['Super Admin', 'Admin', 'Distribution Manager', 'Distribution Officer'] }
];

export default function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (val: boolean) => void }) {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<string>('Super Admin'); 
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    // await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const authorizedMenus = MENU_ITEMS.filter(menu => menu.allowedRoles.includes(userRole));

  return (
    <>
      {/* Mobile Overlay Background */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Panel */}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 flex flex-col h-screen transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} border-r border-slate-800 shrink-0 shadow-2xl md:shadow-none`}>
        
        {/* App Branding */}
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">
              {SYSTEM_CONFIG.logoInitials}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">{SYSTEM_CONFIG.appName}</h2>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">{userRole}</p>
            </div>
          </div>
          {/* Mobile Close Button */}
          <button onClick={() => setIsOpen(false)} className="md:hidden text-slate-400 hover:text-white">
            <Icons.Close />
          </button>
        </div>

        <div className="px-6 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Main Menu</div>
        
        {/* Navigation Links */}
        <nav className="flex-1 px-4 space-y-1 mt-2 overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-2 text-sm text-slate-500">Loading...</div>
          ) : (
            authorizedMenus.map((menu) => {
              const isActive = pathname === menu.id; 
              return (
                <Link 
                  key={menu.id} 
                  href={menu.id}
                  onClick={() => setIsOpen(false)} // Close sidebar on mobile after click
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
                    isActive 
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' 
                      : 'hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {menu.icon} 
                  <span className="text-sm font-medium">{menu.label}</span>
                </Link>
              );
            })
          )}
        </nav>
        
        {/* Footer / Logout */}
        <div className="p-4 mt-auto border-t border-slate-800">
          <button 
            onClick={handleLogout} 
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <Icons.Logout /> <span className="text-sm font-medium">Secure Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}