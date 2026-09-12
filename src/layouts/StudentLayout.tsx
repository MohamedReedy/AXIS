import React from 'react';

export const StudentLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col select-none">
      {/* Student Top Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-3">
          <img
            src="/axis-logo.jpeg"
            alt="AXIS"
            className="w-8 h-8 rounded-lg object-cover border border-slate-200 shadow-xs"
          />
          <div className="leading-tight">
            <span className="font-black text-slate-900 text-sm tracking-tight block">AXIS</span>
            <span className="text-[10px] text-slate-400 font-medium block">AI Excellence Innovation Sprint</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="badge-pill badge-axis text-[11px]">
            ◆ Secure Lockdown Active
          </span>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
};
