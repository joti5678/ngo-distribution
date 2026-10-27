"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from './../../components/Icons';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function PartnerSetupPage() {
  const [partners, setPartners] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form States
  const [name, setName] = useState('');
  const [type, setType] = useState('Implementing NGO');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    fetchPartners();
  }, []);

  const fetchPartners = async () => {
    setIsLoading(true);
    const { data } = await supabase.from('partners').select('*').order('created_at', { ascending: false });
    if (data) setPartners(data);
    setIsLoading(false);
  };

  const handleAddPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !type) return;

    const { data, error } = await supabase
      .from('partners')
      .insert([{ name, type, contact_person: contactPerson, email, phone }])
      .select();

    if (!error && data) {
      setPartners([data[0], ...partners]);
      setName(''); setContactPerson(''); setEmail(''); setPhone('');
    } else {
      alert("Failed to add partner. Please try again.");
    }
  };

  const handleDelete = async (id: string) => {
    if(!confirm("Are you sure you want to delete this partner?")) return;
    const { error } = await supabase.from('partners').delete().eq('id', id);
    if (!error) setPartners(partners.filter(p => p.id !== id));
  };

  return (
    <div className="flex flex-col h-full w-full animate-in fade-in duration-500">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">Partner Setup</h2>
          <p className="text-sm text-slate-500">Register and manage NGOs, Donors, and Agencies</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Form Column */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm xl:col-span-1 h-fit">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mr-3"><Icons.Users /></div>
            Register Partner
          </h3>
          <form onSubmit={handleAddPartner} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Organization Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-emerald-500 transition-colors" placeholder="e.g. Save the Children" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Partner Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-emerald-500">
                <option value="Partner">Partner</option>
                <option value="Donor">Donor</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Contact Person</label>
              <input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-emerald-500" placeholder="John Doe" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Phone</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-emerald-500" placeholder="+880..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-emerald-500" placeholder="@org.com" />
              </div>
            </div>
            <button type="submit" className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all mt-2">
              Save Partner
            </button>
          </form>
        </div>

        {/* List Column */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm xl:col-span-2 overflow-hidden flex flex-col">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Organization</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Type</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Contact Details</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={4} className="p-8 text-center"><Icons.Spinner /></td></tr>
                ) : partners.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-sm text-slate-500">No partners registered yet.</td></tr>
                ) : (
                  partners.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 group transition-colors">
                      <td className="p-4">
                        <p className="font-bold text-slate-800">{p.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {p.id.split('-')[0]}</p>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex px-2.5 py-1 bg-slate-100 text-slate-700 text-xs rounded-lg font-bold border border-slate-200">
                          {p.type}
                        </span>
                      </td>
                      <td className="p-4">
                        <p className="text-sm font-semibold text-slate-700">{p.contact_person || 'N/A'}</p>
                        <p className="text-xs text-slate-500">{p.phone || p.email || 'No contact info'}</p>
                      </td>
                      <td className="p-4 text-right">
                        <button onClick={() => handleDelete(p.id)} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
                          <Icons.Trash />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}