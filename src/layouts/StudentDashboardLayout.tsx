import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  KeyRound,
  LogOut,
  User,
  GraduationCap,
  ShieldCheck,
  Award,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { ChangePasswordModal } from '@/features/student/ChangePasswordModal';

export const StudentDashboardLayout: React.FC<{
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}> = ({ children, title, subtitle }) => {
  const { user, profile, signOut } = useAuth();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Student';
  const displayId = profile?.student_id || user?.user_metadata?.student_id;

  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'ST';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col selection:bg-blue-100">
      {/* Top Navigation Bar */}
      <header className="h-[72px] bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-8 flex items-center justify-between shadow-xs">
        {/* Brand Header */}
        <div className="flex items-center space-x-3">
          <Link to="/student/dashboard" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shadow-md border border-slate-100 group-hover:scale-105 transition-transform flex-shrink-0">
              <img
                src="/axis-logo.png"
                alt="AXIS"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-lg text-slate-900 tracking-tight leading-tight">
                AXIS
              </span>
              <span className="text-[10px] text-blue-700 font-bold uppercase tracking-wider">
                Student Assessment Portal
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center space-x-2 pl-4 border-l border-slate-200 ml-4">
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-semibold">
              <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
              <span>Learner Workspace</span>
            </span>
          </div>
        </div>

        {/* User Identity & Actions */}
        <div className="flex items-center space-x-3">
          {/* Student Profile Info */}
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-bold text-slate-900 leading-tight">
              {displayName}
            </span>
            <div className="flex items-center justify-end space-x-1.5 mt-0.5">
              {displayId && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  {displayId}
                </span>
              )}
              <span className="text-[11px] text-slate-500 font-medium">
                {user?.email}
              </span>
            </div>
          </div>

          <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
            {initials}
          </div>

          {/* Change Password Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPasswordModalOpen(true)}
            className="rounded-xl border-slate-200 text-slate-700 hover:text-blue-700 hover:border-blue-300 text-xs font-semibold cursor-pointer shadow-xs"
            title="Change Password"
          >
            <KeyRound className="w-3.5 h-3.5 sm:mr-1.5 text-slate-500" />
            <span className="hidden sm:inline">Change Password</span>
          </Button>

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-7 max-w-[1320px] w-full mx-auto">
        {title && (
          <div className="mb-6">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs sm:text-sm text-slate-500 mt-1">{subtitle}</p>
            )}
          </div>
        )}
        {children}
      </main>

      {/* Footer */}
      <footer className="py-5 border-t border-slate-200 text-center text-xs text-slate-400">
        <p>AXIS Assessment Engine • High-Integrity Examination Core</p>
      </footer>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </div>
  );
};
