"use client";

import { useEffect } from 'react';

export default function RootPage() {
  useEffect(() => {
    // Next.js router.push can sometimes hang on the root layout with RouteGuard
    // Using window.location.replace guarantees a clean, conflict-free redirect
    const session = localStorage.getItem('user_session');
    if (session) {
      window.location.replace('/dashboard');
    } else {
      window.location.replace('/login');
    }
  }, []);

  return (
    <div className="fixed inset-0 z-[99999] flex h-screen w-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center">
         <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
         <p className="text-xs font-bold text-slate-500 uppercase tracking-widest animate-pulse">Routing to Secure Area...</p>
      </div>
    </div>
  );
}
