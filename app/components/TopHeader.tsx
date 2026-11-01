"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  const router = useRouter();
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const sessionStr = localStorage.getItem('user_session');
      if (sessionStr) {
        setUser(JSON.parse(sessionStr));
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Session parse error", error);
    }
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user_session');
    router.push('/login');
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name.charAt(0).toUpperCase();
  };

  const getGradient = (char: string) => {
     const charCode = char.charCodeAt(0) || 65;
     const gradients = [
        "from-indigo-500 via-purple-500 to-pink-500",
        "from-cyan-400 via-blue-500 to-indigo-600",
        "from-emerald-400 via-teal-500 to-cyan-500",
        "from-rose-400 via-red-500 to-orange-500",
        "from-amber-400 via-orange-500 to-rose-500",
        "from-fuchsia-500 via-purple-600 to-indigo-600",
        "from-blue-500 via-indigo-500 to-purple-500"
     ];
     return gradients[charCode % gradients.length];
  };

  if (!user) return null;

  const initial = getInitials(user?.full_name);
  const gradientClass = getGradient(initial);

  return (
    <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-end px-6 sticky top-0 z-40 shadow-sm w-full">
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes profileGradient {
           0% { background-position: 0% 50%; }
           50% { background-position: 100% 50%; }
           100% { background-position: 0% 50%; }
        }
        .animate-profile-bg {
           background-size: 200% 200%;
           animation: profileGradient 4s ease infinite;
        }
      `}} />

      <div className="relative" ref={dropdownRef}>
        
        {/* Profile Avatar Button */}
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradientClass} animate-profile-bg flex items-center justify-center text-white font-bold shadow-sm hover:scale-105 hover:shadow-md transition-all ring-2 ring-white/50`}
          title="Account Settings"
        >
          {initial}
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-2 z-[9999]">
            
            {/* User Info Header */}
            <div className="p-4 border-b border-slate-100 bg-slate-50 relative overflow-hidden">
              <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${gradientClass}`}></div>
              <div className="relative z-10">
                  <p className="text-sm font-black text-slate-800 truncate">{user?.full_name || 'Loading...'}</p>
                  <p className="text-[10px] font-bold text-slate-500 truncate mt-0.5">{user?.email || ''}</p>
                  <span className="inline-block mt-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase tracking-widest rounded">
                     {user?.user_roles?.role_name || 'User'}
                  </span>
              </div>
            </div>
            
            {/* Menu Options */}
            <div className="p-2 space-y-1">
              <Link 
                href="/profile" 
                onClick={() => setIsOpen(false)}
                className="flex items-center w-full px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-colors group"
              >
                <span className="mr-3 text-lg opacity-70 group-hover:scale-110 transition-transform">👤</span> My Profile
              </Link>
              
              <button 
                onClick={handleLogout}
                className="flex items-center w-full px-3 py-2.5 text-sm font-bold text-rose-500 hover:bg-rose-50 rounded-xl transition-colors group"
              >
                <span className="mr-3 text-lg opacity-70 group-hover:scale-110 transition-transform">🚪</span> Secure Logout
              </button>
            </div>

          </div>
        )}
      </div>
    </header>
  );
}
