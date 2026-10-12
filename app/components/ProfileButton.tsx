"use client";

import React from 'react';
import Link from 'next/link';

export default function ProfileButton() {
  return (
    <div className="fixed top-3 right-4 md:top-4 md:right-6 z-40">
      <Link 
        href="/profile"
        className="w-10 h-10 rounded-full bg-indigo-100 border-2 border-indigo-600 flex items-center justify-center text-indigo-700 font-bold shadow-sm hover:scale-105 hover:shadow-md transition-all"
        title="My Profile"
      >
        A
      </Link>
    </div>
  );
}