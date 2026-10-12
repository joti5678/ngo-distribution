"use client";

import React, { useState } from "react";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import AiChatbox from "./components/AiChatbox";
import ProfileButton from "./components/ProfileButton";

// Import Premium Font (Plus Jakarta Sans)
import { Plus_Jakarta_Sans } from 'next/font/google';

const jakarta = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <html lang="en" suppressHydrationWarning>
      {/* Apply the font dynamically to the body */}
      <body className={`${jakarta.className} h-screen w-full flex bg-slate-50 text-slate-900 antialiased overflow-hidden`} suppressHydrationWarning>
        
        <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
        
        <main className="flex-1 flex flex-col h-screen overflow-hidden relative w-full">
          
          <div className="md:hidden flex items-center justify-between bg-slate-900 text-white p-4 shrink-0 shadow-md relative z-50">
            <button onClick={() => setIsSidebarOpen(true)} className="p-1 focus:outline-none hover:text-indigo-400 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>

            <div className="flex items-center space-x-2">
               <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-lg flex items-center justify-center font-bold text-sm shadow-inner">NC</div>
               <span className="font-bold tracking-wide">NGO Connect</span>
            </div>
            
            <div className="w-8"></div>
          </div>

          <ProfileButton />

          <div className="flex-1 overflow-auto w-full relative custom-scrollbar">
            {children}
          </div>
          
          <AiChatbox />
          
        </main>
      </body>
    </html>
  );
}