import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Layers,
  PlusCircle,
  User,
  LogOut,
  Table as TableIcon,
  Activity,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { AdminProfileModal } from '@/features/auth/AdminProfileModal';

export const AdminLayout: React.FC<{
  children: React.ReactNode;
  onOpenCreate?: () => void;
  title?: string;
  subtitle?: string;
}> = ({ children, onOpenCreate, title, subtitle }) => {
  const { user, profile, signOut } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const navItems = [
    { label: 'Examinations Hub', path: '/admin', icon: Layers },
  ];

  const getInitials = () => {
    const name = profile?.full_name || user?.email || 'Admin';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex">
      {/* Prototype Sticky Sidebar (260px, Dark Navy) */}
      <aside className="w-64 bg-[#0B1120] text-slate-200 p-5 flex flex-col justify-between sticky top-0 h-screen border-r border-slate-800/80 z-30 flex-shrink-0 hidden md:flex">
        <div className="space-y-6">
          {/* Brand Header */}
          <Link to="/admin" className="flex items-center space-x-3 px-1 group">
            <img
              src="/axis-logo.png"
              alt="AXIS"
              className="w-10 h-10 object-contain shadow-md group-hover:scale-105 transition-transform"
            />
            <div className="flex flex-col">
              <span className="font-black text-lg text-white tracking-tight">AXIS</span>
              <span className="text-[11px] text-cyan-400 font-semibold tracking-wider uppercase">
                AI Excellence Sprint
              </span>
            </div>
          </Link>

          {/* Prototype Nav Section Title */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2.5 mb-2">
              Platform Navigation
            </div>
            <nav className="space-y-1">
              <Link
                to="/admin"
                className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  location.pathname === '/admin'
                    ? 'bg-slate-800/90 text-white shadow-sm border-l-4 border-cyan-400 pl-2'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>Examinations Hub</span>
              </Link>
            </nav>
          </div>
        </div>

        {/* Prototype Sidebar Footer */}
        <div className="pt-4 border-t border-slate-800/80 text-xs text-slate-400 space-y-2">
          <div>
            <span className="font-bold text-white block">AXIS Assessment Engine</span>
            <span className="text-[11px] text-slate-400">Server-Authoritative Proctoring</span>
          </div>
          <div className="pt-1">
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>Realtime Connected</span>
            </span>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Prototype Topbar (72px, White) */}
        <header className="h-[72px] bg-white border-b border-slate-200 sticky top-0 z-20 px-4 sm:px-8 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-3">
            <Link to="/admin" className="md:hidden flex items-center space-x-2 mr-2">
              <img src="/axis-logo.png" alt="AXIS" className="w-8 h-8 object-contain" />
            </Link>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-none">
                {title || 'Examinations Hub'}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                {subtitle || 'AXIS AI Excellence Sprint • Governed Assessment Core'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Role Switcher Display (matching prototype) */}
            <div className="hidden lg:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
              <span className="text-slate-400 font-normal">Role:</span>
              <span className="text-blue-700 font-bold">Academic Admin</span>
            </div>

            {onOpenCreate && (
              <button
                onClick={onOpenCreate}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white text-xs font-bold transition-all shadow-md shadow-blue-700/20 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>New Exam</span>
              </button>
            )}

            {/* Profile Avatar Pill */}
            <button
              onClick={() => setIsProfileOpen(true)}
              className="flex items-center space-x-2 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
              title="Admin Profile"
            >
              <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold text-xs flex items-center justify-center">
                {getInitials()}
              </div>
              <span className="hidden sm:inline text-xs font-semibold text-slate-800 max-w-[110px] truncate">
                {profile?.full_name || 'Admin'}
              </span>
            </button>

            <button
              onClick={handleSignOut}
              className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content Container (matching prototype max-width: 1460px) */}
        <main className="flex-1 p-4 sm:p-7 max-w-[1460px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Admin Profile Modal */}
      <AdminProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </div>
  );
};
