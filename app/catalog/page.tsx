"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function CatalogPage() {
  const [activeTab, setActiveTab] = useState<'products' | 'categories'>('products');
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form States
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newProdName, setNewProdName] = useState('');
  const [newProdCode, setNewProdCode] = useState('');
  const [newProdCat, setNewProdCat] = useState('');
  const [newProdUnit, setNewProdUnit] = useState('Piece');
  const [newProdPieces, setNewProdPieces] = useState(1);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const { data: catData } = await supabase.from('categories').select('*').order('created_at', { ascending: false });
    if (catData) setCategories(catData);

    const { data: prodData } = await supabase
      .from('products')
      .select(`*, categories(name)`)
      .order('created_at', { ascending: false });
    if (prodData) setProducts(prodData);
    
    setIsLoading(false);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!newCategoryName.trim()) return;
    
    const { data, error } = await supabase.from('categories').insert([{ name: newCategoryName }]).select();
      
    if (!error && data) {
      setCategories([data[0], ...categories]);
      setNewCategoryName('');
    } else {
      setErrorMsg("Failed to add category. It might already exist.");
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!newProdName || !newProdCode || !newProdCat) {
      setErrorMsg("Please fill all required fields including category.");
      return;
    }

    const { data, error } = await supabase
      .from('products')
      .insert([{ 
        name: newProdName, 
        code: newProdCode, 
        category_id: newProdCat,
        unit_type: newProdUnit,
        pieces_per_pack: newProdPieces
      }])
      .select(`*, categories(name)`);

    if (!error && data) {
      setProducts([data[0], ...products]);
      setNewProdName('');
      setNewProdCode('');
      setNewProdPieces(1);
    } else {
      setErrorMsg("Failed to add product. Make sure the Code is unique.");
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if(!confirm("Are you sure you want to delete this product?")) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if(!error) {
      setProducts(products.filter(p => p.id !== id));
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in duration-500">
      <header className="flex h-20 bg-white border-b border-slate-200 items-center justify-between px-4 md:px-8 shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">Product Catalog</h2>
          <p className="text-xs md:text-sm text-slate-500">Manage inventory items and categories</p>
        </div>
        <div className="flex space-x-2">
           <button onClick={() => alert('Excel Template Download will be integrated via API shortly.')} className="hidden md:flex items-center px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-200 transition-colors border border-slate-200">
            <Icons.Download /> Template
          </button>
          <button onClick={() => alert('Bulk Upload feature will be integrated via API shortly.')} className="flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">
            <Icons.Upload /> Bulk Upload
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-50 text-rose-600 text-sm font-medium rounded-xl border border-rose-200">
            {errorMsg}
          </div>
        )}

        <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl w-full max-w-sm mb-6">
          <button onClick={() => setActiveTab('products')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'products' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Products List</button>
          <button onClick={() => setActiveTab('categories')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'categories' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Categories</button>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12"><Icons.Spinner /></div>
        ) : activeTab === 'categories' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm md:col-span-1 h-fit">
              <h3 className="text-lg font-bold text-slate-800 mb-4">New Category</h3>
              <form onSubmit={handleAddCategory} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Category Name</label>
                  <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-indigo-500" placeholder="e.g. Winter Clothes" />
                </div>
                <button type="submit" className="w-full bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">Save Category</button>
              </form>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm md:col-span-2 overflow-hidden">
               <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Category Name</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right">Added On</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {categories.length === 0 ? (
                      <tr><td colSpan={2} className="p-8 text-center text-slate-500 text-sm">No categories found.</td></tr>
                    ) : (
                      categories.map((cat) => (
                        <tr key={cat.id} className="hover:bg-slate-50">
                          <td className="p-4 font-medium text-slate-900">{cat.name}</td>
                          <td className="p-4 text-slate-500 text-sm text-right">{new Date(cat.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
               </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm xl:col-span-1 h-fit">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Add Product</h3>
              <form onSubmit={handleAddProduct} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Product Name</label>
                  <input type="text" value={newProdName} onChange={(e) => setNewProdName(e.target.value)} required className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-indigo-500" placeholder="e.g. Relief Blanket" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">SKU / Code</label>
                  <input type="text" value={newProdCode} onChange={(e) => setNewProdCode(e.target.value)} required className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-indigo-500" placeholder="e.g. BLK-001" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Category</label>
                  <select value={newProdCat} onChange={(e) => setNewProdCat(e.target.value)} required className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-indigo-500">
                    <option value="">Select Category...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Unit Type</label>
                    <select value={newProdUnit} onChange={(e) => setNewProdUnit(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-indigo-500">
                      <option value="Piece">Piece</option>
                      <option value="Box">Box</option>
                      <option value="Packet">Packet</option>
                      <option value="Bag">Bag</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Qty per unit</label>
                    <input type="number" min="1" value={newProdPieces} onChange={(e) => setNewProdPieces(parseInt(e.target.value))} required className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-indigo-500" />
                  </div>
                </div>
                <button type="submit" className="w-full bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors mt-2">Add to Catalog</button>
              </form>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm xl:col-span-3 overflow-hidden">
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Product Details</th>
                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Category</th>
                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Packaging Rule</th>
                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {products.length === 0 ? (
                        <tr><td colSpan={4} className="p-8 text-center text-slate-500 text-sm">No products added yet.</td></tr>
                      ) : (
                        products.map((prod) => (
                          <tr key={prod.id} className="hover:bg-slate-50 group">
                            <td className="p-4">
                              <p className="font-bold text-slate-900">{prod.name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">Code: {prod.code}</p>
                            </td>
                            <td className="p-4">
                              <span className="inline-flex px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded-md font-medium">
                                {prod.categories?.name || 'Uncategorized'}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="text-sm text-slate-800">
                                1 <span className="font-semibold">{prod.unit_type}</span> = {prod.pieces_per_pack} Pieces
                              </div>
                            </td>
                            <td className="p-4 text-right">
                               <button onClick={() => handleDeleteProduct(prod.id)} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
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
        )}
      </div>
    </div>
  );
}