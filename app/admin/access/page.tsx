"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from '../../components/Icons';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function PageAccessControl() {
  const [roles, setRoles] = useState<any[]>([]);
  const [pages, setPages] = useState<any[]>([]);
  const [activeRole, setActiveRole] = useState<any>(null);
  const [grantedPaths, setGrantedPaths] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    // Fetch Roles
    const { data: roleData } = await supabase.from('system_roles').select('*').order('created_at', { ascending: true });
    if (roleData) {
      setRoles(roleData);
      if(roleData.length > 0) handleRoleSelect(roleData[0]);
    }

    // Fetch System Pages
    const { data: pageData } = await supabase.from('system_pages').select('*').order('module_group', { ascending: true });
    if (pageData) setPages(pageData);
    
    setIsLoading(false);
  };

  const handleRoleSelect = async (role: any) => {
    setActiveRole(role);
    // Fetch permissions for this role
    const { data } = await supabase.from('page_access').select('page_path').eq('role_id', role.id);
    if (data) {
      setGrantedPaths(data.map(d => d.page_path));
    } else {
      setGrantedPaths([]);
    }
  };

  const toggleAccess = async (pagePath: string) => {
    if (!activeRole) return;
    
    // Super Admin forced access UI prevention
    if (activeRole.role_name === 'Super Admin') {
      alert("System Default: Super Admin always has full access. You cannot revoke permissions here.");
      return;
    }

    const hasAccess = grantedPaths.includes(pagePath);
    
    if (hasAccess) {
      // Revoke Access
      await supabase.from('page_access').delete().match({ role_id: activeRole.id, page_path: pagePath });
      setGrantedPaths(grantedPaths.filter(p => p !== pagePath));
    } else {
      // Grant Access
      await supabase.from('page_access').insert([{ role_id: activeRole.id, page_path: pagePath }]);
      setGrantedPaths([...grantedPaths, pagePath]);
    }
  };

  // Group pages by module_group for nice UI
  const groupedPages = pages.reduce((acc, page) => {
    acc[page.module_group] = acc[page.module_group] || [];
    acc[page.module_group].push(page);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center justify-between px-6 md:px-8 shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">Dynamic Access Control</h2>
          <p className="text-sm text-slate-500">Manage page routing permissions for each system role</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col lg:flex-row gap-8">
        
        {/* Left Column: Role Selector */}
        <div className="w-full lg:w-1/3 space-y-4 shrink-0">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">Select Role</h3>
            {isLoading ? (
              <div className="py-8 text-center"><Icons.Spinner /></div>
            ) : (
              <div className="space-y-2">
                {roles.map(role => (
                  <button 
                    key={role.id}
                    onClick={() => handleRoleSelect(role)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex justify-between items-center ${
                      activeRole?.id === role.id 
                        ? 'bg-indigo-50 border-indigo-200 shadow-sm' 
                        : 'bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <p className={`text-sm font-bold ${activeRole?.id === role.id ? 'text-indigo-700' : 'text-slate-700'}`}>{role.role_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {role.id.split('-')[0]}</p>
                    </div>
                    {activeRole?.id === role.id && <div className="w-2 h-2 rounded-full bg-indigo-500"></div>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Page Toggles */}
        <div className="flex-1">
          {activeRole ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Permissions for: <span className="text-indigo-600">{activeRole.role_name}</span></h3>
                  <p className="text-xs text-slate-500 mt-1">Toggle switches to grant or revoke page access.</p>
                </div>
                {activeRole.role_name === 'Super Admin' && (
                  <span className="bg-purple-100 text-purple-700 text-xs font-bold px-3 py-1.5 rounded-full border border-purple-200 flex items-center">
                    <span className="mr-1">🔒</span> Full Access Locked
                  </span>
                )}
              </div>
              
              <div className="p-6 overflow-y-auto flex-1 space-y-8">
                {Object.keys(groupedPages).map(group => (
                  <div key={group}>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">{group}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupedPages[group].map(page => {
                        const hasAccess = grantedPaths.includes(page.page_path) || activeRole.role_name === 'Super Admin';
                        return (
                          <div key={page.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${hasAccess ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100 bg-slate-50/50'}`}>
                            <div>
                              <p className={`text-sm font-bold ${hasAccess ? 'text-slate-800' : 'text-slate-500'}`}>{page.page_name}</p>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{page.page_path}</p>
                            </div>
                            
                            {/* Toggle Switch UI */}
                            <button 
                              onClick={() => toggleAccess(page.page_path)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${hasAccess ? 'bg-emerald-500' : 'bg-slate-300'} ${activeRole.role_name === 'Super Admin' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${hasAccess ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>

                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 border-dashed h-full flex flex-col items-center justify-center text-slate-400 p-8">
              <Icons.Dashboard />
              <p className="mt-4 text-sm font-medium">Select a role from the left panel to manage permissions.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}