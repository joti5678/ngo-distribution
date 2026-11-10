'use client';

import React, { useState, useEffect } from 'react';
import { UploadCloud, FileSpreadsheet, Download, Save, Trash2, ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const defaultPdfColumns = [
  "Camp 01 DP", "Camp 02 DP", "Camp 04 DP", "Camp 04 Ext DP",
  "Camp 07 DP", "Camp 17 DP", "Camp 21 DP", "Camp 26 DP", "KTP RC DP"
];

export default function LpgTargetSetup() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  
  const [systemDps, setSystemDps] = useState<any[]>([]); 
  const [savedMappings, setSavedMappings] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [backlogs, setBacklogs] = useState<any>({});

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [dpRes, mapRes] = await Promise.all([
          supabase.from('distribution_points').select('id, name, code'),
          supabase.from('dp_name_mapping').select('pdf_dp_name, mapped_dp_id')
        ]);
        
        if (dpRes.data) setSystemDps(dpRes.data);
        if (mapRes.data) setSavedMappings(mapRes.data);
      } catch (error) {
        console.error("Error fetching initial data:", error);
      }
    };
    fetchInitialData();
  }, []);

  const extractDataFromLines = (lines: string[]) => {
    let tempCols = defaultPdfColumns.map((name, i) => {
      const existingMap = savedMappings.find(m => m.pdf_dp_name === name);
      return {
        id: `col_${i}`,
        pdfName: name,
        mappedDp: existingMap ? existingMap.mapped_dp_id : '' 
      };
    });
    
    let tempRows: any[] = [];
    let tempBacklogs: any = {};

    lines.forEach((line, index) => {
      const dateMatch = line.match(/^(\d{2}\s+[A-Za-z]{3}\s+\d{4})\s+(.*)/);
      if (dateMatch) {
        const date = dateMatch[1];
        const valuesArray = dateMatch[2].split(/\s+/).map(v => parseInt(v.replace(/,/g, '')) || 0);
        
        const rowData: any = { date };
        tempCols.forEach((col, idx) => { rowData[col.id] = valuesArray[idx] || 0; });
        rowData.pdfTotal = valuesArray[valuesArray.length - 1] || 0;
        tempRows.push(rowData);
      }

      if (line.startsWith('#of HHs')) {
        const valuesArray = line.replace('#of HHs', '').trim().split(/\s+/).map(v => parseInt(v.replace(/,/g, '')) || 0);
        tempCols.forEach((col, idx) => { tempBacklogs[col.id] = valuesArray[idx] || 0; });
        
        const nextLine = lines[index + 1];
        if (nextLine && /^\d{1,3}(,\d{3})*$/.test(nextLine.trim())) {
           tempBacklogs.pdfTotal = parseInt(nextLine.trim().replace(/,/g, '')) || 0;
        } else {
           tempBacklogs.pdfTotal = valuesArray[valuesArray.length - 1] || 0;
        }
      }
    });

    tempRows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    setColumns(tempCols);
    setRows(tempRows);
    setBacklogs(tempBacklogs);
  };

  const processFile = async (selectedFile: File) => {
    setLoading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('/api/parse-lpg-pdf', { method: 'POST', body: formData });
      const data = await response.json();
      if (data.success) {
        extractDataFromLines(data.lines);
      } else {
        setNotification({ type: 'error', message: `Error: ${data.error}` });
      }
    } catch (error) {
      setNotification({ type: 'error', message: "A network error occurred during upload." });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) processFile(e.target.files[0]);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  };

  const updateMapping = (colId: string, value: string) => {
    setColumns(columns.map(c => c.id === colId ? { ...c, mappedDp: value } : c));
  };
  const updateRowValue = (date: string, colId: string, value: string) => {
    setRows(rows.map(r => r.date === date ? { ...r, [colId]: parseInt(value) || 0 } : r));
  };
  const updateBacklogValue = (colId: string, value: string) => {
    setBacklogs({ ...backlogs, [colId]: parseInt(value) || 0 });
  };
  const removeColumn = (colId: string) => {
    if(confirm("Are you sure you want to remove this DP?")) setColumns(columns.filter(c => c.id !== colId));
  };

  // ডেট কনভার্ট করার জন্য নতুন হেল্পার ফাংশন (টাইমজোন ইস্যু ফিক্স)
  const formatExactDate = (dateStr: string) => {
    const months: any = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const parts = dateStr.trim().split(' ');
    if (parts.length === 3) {
      return `${parts[2]}-${months[parts[1]]}-${parts[0].padStart(2, '0')}`;
    }
    // ফলব্যাক
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const handleSaveToDatabase = async () => {
    const unmapped = columns.filter(c => !c.mappedDp);
    if (unmapped.length > 0) {
      setNotification({ type: 'error', message: `Please map all distribution points. (${unmapped.length} left)` });
      return;
    }

    setIsSaving(true);
    setNotification(null);

    try {
      const targetMonth = rows.length > 0 ? rows[0].date.split(' ').slice(1).join(' ') : '';
      if (!targetMonth) throw new Error("Could not determine target month from data.");

      const targetInserts: any[] = [];
      rows.forEach(row => {
        // টাইমজোন ইস্যু ছাড়া সলিড ডেট জেনারেট করা
        const exactDate = formatExactDate(row.date);
        
        columns.forEach(col => {
          const qty = row[col.id] || 0;
          targetInserts.push({
            target_date: exactDate, // ফিক্সড ডেট
            target_month: targetMonth,
            dp_id: col.mappedDp,
            pdf_dp_name: col.pdfName,
            target_quantity: qty,
            final_target: qty
          });
        });
      });

      const backlogInserts = columns.map(col => ({
        target_month: targetMonth,
        dp_id: col.mappedDp,
        pdf_dp_name: col.pdfName,
        backlog_quantity: backlogs[col.id] || 0
      }));

      const mappingInserts = columns.map(col => ({
        pdf_dp_name: col.pdfName,
        mapped_dp_id: col.mappedDp
      }));

      await supabase.from('lpg_refill_targets').delete().eq('target_month', targetMonth);
      await supabase.from('lpg_monthly_backlogs').delete().eq('target_month', targetMonth);

      const { error: tError } = await supabase.from('lpg_refill_targets').insert(targetInserts);
      if (tError) throw tError;

      const { error: bError } = await supabase.from('lpg_monthly_backlogs').insert(backlogInserts);
      if (bError) throw bError;

      await supabase.from('dp_name_mapping').upsert(mappingInserts, { onConflict: 'pdf_dp_name' });

      setNotification({ type: 'success', message: 'Target data successfully saved to database!' });
      
      setTimeout(() => {
        setNotification(null);
        setColumns([]); 
      }, 3000);

    } catch (error: any) {
      console.error("Database Save Error:", error);
      setNotification({ type: 'error', message: error.message || 'Failed to save data.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 pt-24 pr-20 max-w-[1400px] mx-auto bg-gray-50 min-h-screen relative">
      
      {notification && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-lg shadow-2xl max-w-sm w-full text-center transform transition-all scale-100">
            <div className={`mx-auto flex items-center justify-center h-16 w-16 rounded-full mb-4 ${notification.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
              {notification.type === 'success' ? <CheckCircle size={32} /> : <XCircle size={32} />}
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {notification.type === 'success' ? 'Success!' : 'Oops!'}
            </h3>
            <p className="text-sm text-gray-600 mb-6">{notification.message}</p>
            <button 
              onClick={() => setNotification(null)}
              className="w-full bg-gray-900 text-white py-2.5 rounded-lg hover:bg-gray-800 transition font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 bg-white rounded-full shadow hover:bg-gray-100 border text-gray-600 transition">
             <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-gray-800">LPG Refill Target Setup</h1>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 transition text-sm">
            <Download size={18} /> Demo Template
          </button>
          <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 transition text-sm">
            <FileSpreadsheet size={18} /> Bulk Upload
          </button>
        </div>
      </div>

      {columns.length === 0 ? (
        <div 
          className={`bg-white p-8 md:p-12 rounded-lg shadow-sm flex flex-col items-center justify-center border-dashed border-2 transition-colors ${dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'}`}
          onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
        >
          <UploadCloud size={56} className={`${dragActive ? 'text-indigo-500' : 'text-gray-400'} mb-4`} />
          <h3 className="text-xl font-medium text-gray-700 mb-2">Drag & Drop Target PDF here</h3>
          <p className="text-sm text-gray-500 mb-6">or click below to browse</p>
          <label className={`cursor-pointer px-6 py-2.5 rounded shadow transition flex items-center gap-2 ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'} text-white`}>
            {loading ? "Processing..." : "Browse PDF"}
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} disabled={loading} />
          </label>
        </div>
      ) : (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Map & Confirm Target Data</h2>
            <div className="flex gap-2">
               <button onClick={() => setColumns([])} className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300" disabled={isSaving}>Re-Upload</button>
               <button 
                 onClick={handleSaveToDatabase} 
                 disabled={isSaving}
                 className={`flex items-center gap-2 text-white px-5 py-2 rounded shadow transition ${isSaving ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
               >
                 <Save size={18} /> {isSaving ? 'Saving...' : 'Confirm & Save'}
               </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500 border">
              <thead className="text-xs text-gray-700 uppercase bg-gray-100 border-b">
                <tr>
                  <th className="px-4 py-3 border-r min-w-[120px] bg-white sticky left-0 z-10">Target Date</th>
                  {columns.map(col => (
                    <th key={col.id} className="px-2 py-3 border-r min-w-[160px]">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-indigo-600 truncate">{col.pdfName}</span>
                        <button onClick={() => removeColumn(col.id)} className="text-red-500 hover:bg-red-100 p-1 rounded" disabled={isSaving}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <select value={col.mappedDp} onChange={(e) => updateMapping(col.id, e.target.value)} className="w-full p-1.5 border rounded text-xs focus:ring-indigo-500 bg-white" disabled={isSaving}>
                        <option value="">-- Select System DP --</option>
                        {systemDps.map(dp => (
                          <option key={dp.id} value={dp.id}>[{dp.code}] {dp.name}</option>
                        ))}
                      </select>
                    </th>
                  ))}
                  <th className="px-4 py-3 border-r min-w-[120px] bg-indigo-50 text-indigo-800 text-center">Extracted<br/>Total</th>
                  <th className="px-4 py-3 border-r min-w-[100px] bg-blue-50 text-blue-800 text-center">PDF<br/>Total</th>
                  <th className="px-4 py-3 min-w-[120px] bg-gray-100 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const extractedTotal = columns.reduce((sum, col) => sum + (row[col.id] || 0), 0);
                  const isMatched = extractedTotal === row.pdfTotal;
                  
                  return (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 border-r font-medium text-gray-900 bg-white sticky left-0 z-10">{row.date}</td>
                      {columns.map(col => (
                        <td key={col.id} className="px-2 py-2 border-r">
                          <input type="number" value={row[col.id]} onChange={(e) => updateRowValue(row.date, col.id, e.target.value)} disabled={isSaving} className="w-full p-1 border rounded focus:ring-1 focus:ring-indigo-500 text-center" />
                        </td>
                      ))}
                      <td className="px-4 py-2 border-r font-bold text-center bg-indigo-50/50 text-indigo-900">{extractedTotal}</td>
                      <td className="px-4 py-2 border-r font-bold text-center bg-blue-50/50 text-blue-900">{row.pdfTotal}</td>
                      <td className={`px-4 py-2 font-bold text-center ${isMatched ? 'text-green-600' : 'text-red-600 bg-red-50'}`}>
                        {isMatched ? 'Matched' : 'Mismatched'}
                      </td>
                    </tr>
                  )
                })}
                
                <tr className="bg-yellow-50 border-t-2 border-yellow-200">
                  <td className="px-4 py-3 border-r font-bold text-yellow-800 sticky left-0 bg-yellow-50 z-10">
                    MONTHLY BACKLOG
                  </td>
                  {columns.map(col => (
                    <td key={col.id} className="px-2 py-3 border-r">
                      <input type="number" value={backlogs[col.id] || 0} onChange={(e) => updateBacklogValue(col.id, e.target.value)} disabled={isSaving} className="w-full p-1 border rounded focus:ring-1 focus:ring-yellow-500 text-center font-semibold text-yellow-900 bg-white" />
                    </td>
                  ))}
                  {(() => {
                     const backlogExtractedTotal = columns.reduce((sum, col) => sum + (backlogs[col.id] || 0), 0);
                     const backlogMatched = backlogExtractedTotal === (backlogs.pdfTotal || 0);
                     return (
                       <>
                         <td className="px-4 py-3 border-r font-bold text-center bg-indigo-100 text-indigo-900">{backlogExtractedTotal}</td>
                         <td className="px-4 py-3 border-r font-bold text-center bg-blue-100 text-blue-900">{backlogs.pdfTotal || 0}</td>
                         <td className={`px-4 py-3 font-bold text-center ${backlogMatched ? 'text-green-600' : 'text-red-600 bg-red-100'}`}>
                           {backlogMatched ? 'Matched' : 'Mismatched'}
                         </td>
                       </>
                     )
                  })()}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}