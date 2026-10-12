"use client";

import React, { useState, useEffect } from 'react';
import { Icons } from './Icons';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function AiChatbox() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [userRole, setUserRole] = useState<string>('Super Admin');
  const [messages, setMessages] = useState<{sender: 'ai' | 'user', text: string}[]>([]);

  useEffect(() => {
    // In production, fetch actual user role here
    const initialGreeting = `Hello! I am your AI Assistant. I see you are logged in as a ${userRole}. You can ask me to generate reports, check inventory, or perform bulk actions. How can I assist you today?`;
    setMessages([{ sender: 'ai', text: initialGreeting }]);
  }, [userRole]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!input.trim()) return;
    
    // Add user message to chat
    const currentInput = input;
    setMessages(prev => [...prev, { sender: 'user', text: currentInput }]);
    setInput('');
    
    // Mocking AI Response strictly for Analysis and Reporting
    setTimeout(() => {
      let aiResponse = "Analyzing your request...";
      
      const lowerInput = currentInput.toLowerCase();
      
      // STRICT AI GUARDRAIL: Block Delete/Edit/Update operations
      if (lowerInput.includes("delete") || lowerInput.includes("update") || lowerInput.includes("edit") || lowerInput.includes("remove")) {
        aiResponse = "⚠️ Action Restricted: I am a read-only analytics AI. I cannot delete, modify, or update any system records. I can only generate reports, analyze data, and export to Excel/PDF.";
      } 
      // Handle Reporting / Exporting
      else if (lowerInput.includes("export") || lowerInput.includes("pdf") || lowerInput.includes("excel")) {
        aiResponse = "📊 Generating report format... In the final version, this will trigger an automatic download of your requested data in PDF/Excel format.";
      }
      else {
        aiResponse = "I have received your query. I will pull the relevant data from the database and present the analysis for you.";
      }

      setMessages(prev => [...prev, { sender: 'ai', text: aiResponse }]);
    }, 1000);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-80 sm:w-96 mb-4 overflow-hidden flex flex-col h-[450px] transition-all animate-in slide-in-from-bottom-5">
          
          {/* Chat Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-cyan-600 p-4 flex justify-between items-center text-white shadow-md">
            <div className="flex items-center space-x-2">
              <Icons.Bot />
              <div>
                <h3 className="font-semibold text-sm">Smart AI Agent</h3>
                <p className="text-[10px] text-indigo-100">Context: {userRole}</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white transition-colors">
              <Icons.Close />
            </button>
          </div>
          
          {/* Chat Messages Body */}
          <div className="flex-1 p-4 overflow-y-auto bg-slate-50 space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 text-sm shadow-sm ${
                  msg.sender === 'user' 
                    ? 'bg-indigo-600 text-white rounded-2xl rounded-br-none' 
                    : 'bg-white border border-slate-200 text-slate-700 rounded-2xl rounded-bl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
          
          {/* Input Form */}
          <div className="p-3 bg-white border-t border-slate-100">
            <form onSubmit={handleSend} className="flex space-x-2">
              <input 
                type="text" 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                placeholder="Ask me anything..." 
                className="flex-1 px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all" 
              />
              <button 
                type="submit" 
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      )}
      
      {/* Floating Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className={`${
          isOpen ? 'bg-rose-500 hover:bg-rose-600' : 'bg-gradient-to-r from-indigo-600 to-cyan-600 hover:shadow-lg hover:shadow-indigo-500/40'
        } text-white p-4 rounded-full shadow-lg transition-all duration-300 transform hover:scale-105 flex items-center justify-center`}
      >
        {isOpen ? <Icons.Close /> : <Icons.Bot />}
      </button>
    </div>
  );
}