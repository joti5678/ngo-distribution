"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import ProfileButton from "./components/ProfileButton";
import { Plus_Jakarta_Sans } from 'next/font/google';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const jakarta = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

// Fallback branding
const DEFAULT_BRANDING = {
    appName: "DP Management",
    logoText: "DP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [branding, setBranding] = useState({ appName: "Loading...", logoText: ".." });
  const pathname = usePathname();
  const isPublicPage = pathname === '/login' || pathname === '/';

  useEffect(() => {
    if (!isPublicPage) {
        fetchBranding();
    }
  }, [isPublicPage]);

  const fetchBranding = async () => {
    try {
        const { data } = await supabase.from('app_settings').select('settings').eq('id', 'login_page_design').single();
        if (data?.settings && data.settings.logoText) {
            setBranding({
                appName: data.settings.logoText,
                logoText: data.settings.logoText.substring(0, 2).toUpperCase()
            });
        } else {
            setBranding(DEFAULT_BRANDING);
        }
    } catch (error) {
        console.error("Error fetching branding for mobile header", error);
        setBranding(DEFAULT_BRANDING);
    }
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${jakarta.className} h-screen w-full flex bg-slate-50 text-slate-900 antialiased overflow-hidden`} suppressHydrationWarning>
          
          {!isPublicPage && (
            <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
          )}
          
          <main className="flex-1 flex flex-col h-screen overflow-hidden relative w-full">
            
            {!isPublicPage && (
              <>
                <div className="md:hidden flex items-center justify-between bg-slate-900 text-white p-4 shrink-0 shadow-md relative z-50">
                  <button onClick={() => setIsSidebarOpen(true)} className="p-1 focus:outline-none hover:text-indigo-400 transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                  </button>
                  <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-lg flex items-center justify-center font-bold text-sm shadow-inner">
                          {branding.logoText}
                      </div>
                      <span className="font-bold tracking-wide">{branding.appName}</span>
                  </div>
                  <div className="w-8"></div>
                </div>

                {/* Profile Icon is back here (Floating at top right) */}
                <div className="fixed top-4 right-4 md:top-6 md:right-6 z-[60] pointer-events-auto">
                    <ProfileButton />
                </div>
              </>
            )}

            <div className="flex-1 overflow-auto w-full relative custom-scrollbar">
              {children}
            </div>
          </main>
      </body>
    </html>
  );
}