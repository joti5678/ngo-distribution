"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const DEFAULT_THEME = {
  logoType: 'text',
  logoText: 'WebIMS',
  logoUrl: '',
  bgType: 'animated',
  bgColor: '#f8fafc',
  bgImageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2069&auto=format&fit=crop',
  bgGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  cardBg: '#ffffff',
  cardRadius: 24, 
  primaryColor: '#4f46e5',
  inputBg: '#f8fafc',
  inputTextColor: '#1e293b',
  inputRadius: 12,
  fontFamily: 'inter',
  loginHeading: 'Welcome Back!',
  loginSub: 'Sign in to manage your inventory and distributions.',
  regHeading: 'Create an Account',
  regSub: 'Register to request access. Admin approval is required.'
};

export default function PageDesigner() {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [activeSection, setActiveSection] = useState<'background' | 'form' | 'brand' | 'text'>('background');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Theme State
  const [theme, setTheme] = useState(DEFAULT_THEME);

  useEffect(() => {
    fetchDesignSettings();
  }, []);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const fetchDesignSettings = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('app_settings').select('settings').eq('id', 'login_page_design').single();
    
    if (data && data.settings) {
        setTheme({ ...DEFAULT_THEME, ...data.settings });
    }
    setIsLoading(false);
  };

  const handleSaveDesign = async () => {
      setIsSaving(true);
      const { error } = await supabase.from('app_settings').upsert({ 
          id: 'login_page_design', 
          settings: theme,
          updated_at: new Date().toISOString()
      });

      if (error) showMessage(error.message, 'error');
      else showMessage('Page design published successfully!');
      
      setIsSaving(false);
  };

  const updateTheme = (key: keyof typeof DEFAULT_THEME, value: any) => {
      setTheme(prev => ({ ...prev, [key]: value }));
  };

  const fontClasses: any = {
      'inter': 'font-sans',
      'serif': 'font-serif',
      'mono': 'font-mono'
  };

  // Generate Background Style for Preview
  const getBackgroundStyle = () => {
      if (theme.bgType === 'solid') return { backgroundColor: theme.bgColor };
      if (theme.bgType === 'image') return { backgroundImage: `url(${theme.bgImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' };
      if (theme.bgType === 'gradient') return { backgroundImage: theme.bgGradient };
      return {}; // Animated handled via CSS classes
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500 overflow-hidden relative">
      
      {/* Animated Background CSS definition for Preview */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes gradientBG {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        .bg-animated {
            background: linear-gradient(-45deg, ${theme.primaryColor}, #e73c7e, #23a6d5, #23d5ab);
            background-size: 400% 400%;
            animation: gradientBG 15s ease infinite;
        }
      `}} />

      {/* Toast */}
      {msg.text && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] p-4 rounded-xl shadow-lg border text-sm font-bold flex items-center animate-in slide-in-from-top-4 ${msg.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          <span className="mr-2 text-lg">{msg.type === 'error' ? '⚠️' : '✅'}</span> {msg.text}
        </div>
      )}

      {/* Header */}
      <header className="flex h-20 bg-white border-b border-slate-200 items-center px-4 md:px-6 shrink-0 shadow-sm z-10 justify-between">
        <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-3 md:mr-4 p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors flex items-center justify-center">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
              <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">UI Page Designer</h1>
              <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5 hidden sm:block">Visual Builder for Public Screens</p>
            </div>
        </div>
        
        <div className="shrink-0">
           <button 
              onClick={handleSaveDesign} 
              disabled={isSaving || isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 md:px-6 rounded-lg md:rounded-xl text-xs md:text-sm shadow-md transition-all flex items-center disabled:opacity-50 whitespace-nowrap"
           >
               {isSaving ? 'Saving...' : '💾 Publish Design'}
           </button>
        </div>
      </header>

      {/* Main Dual-Pane Content */}
      <main className="flex-1 overflow-hidden p-4 md:p-6 flex flex-col xl:flex-row gap-6">
         
         {/* LEFT PANE: Editor Controls */}
         <div className="xl:w-1/3 flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden h-full">
            
            {/* Screen Toggle */}
            <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center space-x-2 shrink-0">
               <button onClick={() => setActiveTab('login')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'login' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                  Login Screen
               </button>
               <button onClick={() => setActiveTab('register')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'register' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                  Registration Form
               </button>
            </div>

            {/* Config Sections */}
            <div className="flex border-b border-slate-200 bg-white shrink-0 overflow-x-auto custom-scrollbar">
               {[
                   { id: 'background', label: '🎨 Background' },
                   { id: 'form', label: '🎛️ Form UI' },
                   { id: 'brand', label: '✨ Branding' },
                   { id: 'text', label: '📝 Texts' }
               ].map(sec => (
                  <button key={sec.id} onClick={() => setActiveSection(sec.id as any)} className={`px-4 py-3 text-[10px] font-black uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors ${activeSection === sec.id ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}>
                     {sec.label}
                  </button>
               ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
               
               {/* ---------------- BACKGROUND SETTINGS ---------------- */}
               {activeSection === 'background' && (
                  <div className="space-y-5 animate-in slide-in-from-right-2">
                     <div>
                       <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Background Type</label>
                       <div className="grid grid-cols-2 gap-2">
                          {['solid', 'gradient', 'image', 'animated'].map(type => (
                             <button key={type} onClick={() => updateTheme('bgType', type)} className={`py-2 px-2 text-xs font-bold rounded-lg border capitalize transition-colors ${theme.bgType === type ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                                {type}
                             </button>
                          ))}
                       </div>
                     </div>

                     {theme.bgType === 'solid' && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Solid Color (Hex)</label>
                          <div className="flex items-center space-x-2">
                             <input type="color" value={theme.bgColor} onChange={e => updateTheme('bgColor', e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0 p-0" />
                             <input type="text" value={theme.bgColor} onChange={e => updateTheme('bgColor', e.target.value)} className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold outline-none uppercase" />
                          </div>
                        </div>
                     )}

                     {theme.bgType === 'gradient' && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">CSS Gradient String</label>
                          <textarea value={theme.bgGradient} onChange={e => updateTheme('bgGradient', e.target.value)} rows={3} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium outline-none focus:border-indigo-500 custom-scrollbar" />
                        </div>
                     )}

                     {theme.bgType === 'image' && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Image URL</label>
                          <input type="text" value={theme.bgImageUrl} onChange={e => updateTheme('bgImageUrl', e.target.value)} placeholder="https://..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium outline-none focus:border-indigo-500" />
                        </div>
                     )}
                  </div>
               )}

               {/* ---------------- FORM UI SETTINGS ---------------- */}
               {activeSection === 'form' && (
                  <div className="space-y-5 animate-in slide-in-from-right-2">
                     <div>
                       <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Card Settings</label>
                       <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                           <div>
                              <label className="flex justify-between text-[10px] font-bold text-slate-600 mb-1"><span>Card Background</span> <span>{theme.cardBg}</span></label>
                              <div className="flex items-center space-x-2">
                                 <input type="color" value={theme.cardBg} onChange={e => updateTheme('cardBg', e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                                 <input type="text" value={theme.cardBg} onChange={e => updateTheme('cardBg', e.target.value)} className="flex-1 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold outline-none uppercase" />
                              </div>
                           </div>
                           <div>
                              <label className="flex justify-between text-[10px] font-bold text-slate-600 mb-1"><span>Card Roundness (Radius)</span> <span>{theme.cardRadius}px</span></label>
                              <input type="range" min="0" max="40" value={theme.cardRadius} onChange={e => updateTheme('cardRadius', parseInt(e.target.value))} className="w-full accent-indigo-600" />
                           </div>
                       </div>
                     </div>

                     <div>
                       <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Input Fields Style</label>
                       <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                           <div className="grid grid-cols-2 gap-3">
                               <div>
                                  <label className="flex justify-between text-[9px] font-bold text-slate-600 mb-1">Input Background</label>
                                  <input type="color" value={theme.inputBg} onChange={e => updateTheme('inputBg', e.target.value)} className="w-full h-8 rounded cursor-pointer border-0 p-0" />
                               </div>
                               <div>
                                  <label className="flex justify-between text-[9px] font-bold text-slate-600 mb-1">Text Color</label>
                                  <input type="color" value={theme.inputTextColor} onChange={e => updateTheme('inputTextColor', e.target.value)} className="w-full h-8 rounded cursor-pointer border-0 p-0" />
                               </div>
                           </div>
                           <div>
                              <label className="flex justify-between text-[10px] font-bold text-slate-600 mb-1"><span>Input Roundness</span> <span>{theme.inputRadius}px</span></label>
                              <input type="range" min="0" max="30" value={theme.inputRadius} onChange={e => updateTheme('inputRadius', parseInt(e.target.value))} className="w-full accent-indigo-600" />
                           </div>
                       </div>
                     </div>
                  </div>
               )}

               {/* ---------------- BRANDING SETTINGS ---------------- */}
               {activeSection === 'brand' && (
                  <div className="space-y-5 animate-in slide-in-from-right-2">
                     <div>
                       <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Primary Brand Color</label>
                       <div className="flex items-center space-x-2">
                          <input type="color" value={theme.primaryColor} onChange={e => updateTheme('primaryColor', e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0 p-0" />
                          <input type="text" value={theme.primaryColor} onChange={e => updateTheme('primaryColor', e.target.value)} className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold outline-none uppercase" />
                       </div>
                     </div>

                     <div>
                       <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Logo Type</label>
                       <div className="flex space-x-2 bg-slate-100 p-1 rounded-lg">
                          <button onClick={() => updateTheme('logoType', 'text')} className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${theme.logoType === 'text' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500'}`}>Text Logo</button>
                          <button onClick={() => updateTheme('logoType', 'image')} className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${theme.logoType === 'image' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500'}`}>Image URL</button>
                       </div>
                     </div>
                     
                     {theme.logoType === 'text' ? (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">App Name / Text Logo</label>
                          <input type="text" value={theme.logoText} onChange={e => updateTheme('logoText', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 transition-colors" />
                        </div>
                     ) : (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 flex justify-between">Image URL</label>
                          <input type="text" value={theme.logoUrl} onChange={e => updateTheme('logoUrl', e.target.value)} placeholder="https://..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 outline-none focus:border-indigo-500 transition-colors" />
                        </div>
                     )}

                     <div>
                       <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Global Font Style</label>
                       <select value={theme.fontFamily} onChange={e => updateTheme('fontFamily', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 transition-colors">
                          <option value="inter">Modern Sans (Inter)</option>
                          <option value="serif">Classic Serif</option>
                          <option value="mono">Technical Mono</option>
                       </select>
                     </div>
                  </div>
               )}

               {/* ---------------- TEXTS SETTINGS ---------------- */}
               {activeSection === 'text' && (
                  <div className="space-y-5 animate-in slide-in-from-right-2">
                     <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl mb-4">
                        <p className="text-[10px] font-bold text-indigo-800">Currently editing texts for: <span className="uppercase font-black bg-white px-2 py-0.5 rounded ml-1">{activeTab}</span></p>
                     </div>

                     {activeTab === 'login' ? (
                        <>
                           <div>
                             <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Login Main Heading</label>
                             <input type="text" value={theme.loginHeading} onChange={e => updateTheme('loginHeading', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500" />
                           </div>
                           <div>
                             <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Login Sub Heading / Tagline</label>
                             <textarea value={theme.loginSub} onChange={e => updateTheme('loginSub', e.target.value)} rows={3} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 resize-none custom-scrollbar" />
                           </div>
                        </>
                     ) : (
                        <>
                           <div>
                             <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Registration Main Heading</label>
                             <input type="text" value={theme.regHeading} onChange={e => updateTheme('regHeading', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500" />
                           </div>
                           <div>
                             <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Registration Sub Heading</label>
                             <textarea value={theme.regSub} onChange={e => updateTheme('regSub', e.target.value)} rows={3} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 resize-none custom-scrollbar" />
                           </div>
                        </>
                     )}
                  </div>
               )}
            </div>
         </div>

         {/* RIGHT PANE: Live Preview */}
         <div className="xl:w-2/3 flex flex-col bg-slate-200 rounded-3xl overflow-hidden h-full shadow-inner border border-slate-300 relative">
            <div className="absolute top-4 left-4 bg-black/60 text-white text-[10px] font-bold px-3 py-1 rounded-full backdrop-blur-sm z-50 flex items-center shadow-lg">
               <span className="w-2 h-2 rounded-full bg-rose-500 mr-2 animate-pulse"></span> Live Preview: {activeTab === 'login' ? 'Login' : 'Registration'}
            </div>

            {/* PREVIEW CONTAINER */}
            <div 
               className={`flex-1 flex flex-col justify-center items-center p-4 md:p-8 transition-all duration-700 ${fontClasses[theme.fontFamily]} ${theme.bgType === 'animated' ? 'bg-animated' : ''}`} 
               style={theme.bgType !== 'animated' ? getBackgroundStyle() : {}}
            >
               <div 
                  className="w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-500 relative z-10"
                  style={{ backgroundColor: theme.cardBg, borderRadius: `${theme.cardRadius}px`, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}
               >
                  <div className="p-8 sm:p-10 flex flex-col items-center text-center">
                     
                     {/* FULL TEXT LOGO RENDER */}
                     {theme.logoType === 'image' && theme.logoUrl ? (
                         <img src={theme.logoUrl} alt="Logo" className="h-14 object-contain mb-6 drop-shadow-sm" />
                     ) : (
                         <div className="px-6 py-3 rounded-2xl flex items-center justify-center text-white font-black text-3xl mb-6 shadow-lg bg-gradient-to-br from-white/20 to-black/20 tracking-tight" style={{ backgroundColor: theme.primaryColor }}>
                            {theme.logoText}
                         </div>
                     )}
                     
                     <h2 className="text-2xl font-black mb-2" style={{ color: theme.inputTextColor }}>
                        {activeTab === 'login' ? theme.loginHeading : theme.regHeading}
                     </h2>
                     <p className="text-sm font-medium opacity-70" style={{ color: theme.inputTextColor }}>
                        {activeTab === 'login' ? theme.loginSub : theme.regSub}
                     </p>
                  </div>

                  <div className="px-8 sm:px-10 pb-10 space-y-4 opacity-90 pointer-events-none">
                     {activeTab === 'register' && (
                         <div>
                            <label className="block text-[10px] font-bold uppercase mb-1.5 opacity-70" style={{ color: theme.inputTextColor }}>Full Name</label>
                            <div className="w-full h-11 border shadow-inner" style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBg, borderRadius: `${theme.inputRadius}px` }}></div>
                         </div>
                     )}
                     <div>
                        <label className="block text-[10px] font-bold uppercase mb-1.5 opacity-70" style={{ color: theme.inputTextColor }}>Email Address</label>
                        <div className="w-full h-11 border shadow-inner" style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBg, borderRadius: `${theme.inputRadius}px` }}></div>
                     </div>
                     <div>
                        <label className="block text-[10px] font-bold uppercase mb-1.5 opacity-70 flex justify-between" style={{ color: theme.inputTextColor }}>
                           Password
                           {activeTab === 'login' && <span className="opacity-70 capitalize font-medium text-[9px]">Forgot?</span>}
                        </label>
                        <div className="w-full h-11 border shadow-inner" style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBg, borderRadius: `${theme.inputRadius}px` }}></div>
                     </div>

                     <div className="pt-4">
                        <button className="w-full h-12 text-white font-bold transition-transform hover:scale-[1.02] shadow-lg flex items-center justify-center" style={{ backgroundColor: theme.primaryColor, borderRadius: `${theme.inputRadius}px` }}>
                           {activeTab === 'login' ? 'Sign In Securely' : 'Submit Registration Request'}
                        </button>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </main>
    </div>
  );
}