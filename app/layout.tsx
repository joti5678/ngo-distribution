"use client";

import React, { useState } from "react";
import "./globals.css";
import Sidebar from "./components/Sidebar"; // Adjusted path based on your image
import AiChatbox from "./components/AiChatbox"; // Adjusted path based on your image
import { Icons } from "./components/Icons";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <html lang="en">
      <body className="h-screen w-full flex bg-slate-50 text-slate-900 font-sans antialiased overflow-hidden">
        
        {/* Responsive Sidebar */}
        <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
        
        {/* Main Content Wrapper */}
        <main className="flex-1 flex flex-col h-screen overflow-hidden relative w-full">
          
          {/* Mobile Header (Visible only on small screens) */}
          <div className="md:hidden flex items-center justify-between bg-slate-900 text-white p-4 shrink-0">
            <div className="flex items-center space-x-2">
               <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-lg flex items-center justify-center font-bold text-sm">NC</div>
               <span className="font-bold">NGO Connect</span>
            </div>
            <button onClick={() => setIsSidebarOpen(true)} className="p-1 focus:outline-none">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>

          {/* Dynamic Page Content */}
          <div className="flex-1 overflow-auto w-full">
            {children}
          </div>
          
          {/* Global AI Chatbox */}
          <AiChatbox />
          
        </main>
      </body>
    </html>
  );
}