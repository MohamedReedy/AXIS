import React, { useState } from 'react';
import { Shield, Mail, User, KeyRound, Check, AlertCircle, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthContext';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';

interface AdminProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminProfileModal: React.FC<AdminProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, profile, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name || user?.user_metadata?.full_name || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  
  const [nameSuccess, setNameSuccess] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setIsUpdatingName(true);

    try {
      // 1. Update user metadata in Auth
      const { error: authErr } = await supabase.auth.updateUser({
        data: { full_name: fullName.trim() },
      });
      if (authErr) throw authErr;

      // 2. Update profile row
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (profileErr) throw profileErr;

      await refreshProfile();
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile name');
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error: passErr } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (passErr) throw passErr;

      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update password');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Administrator Profile" maxWidth="lg">
      <div className="space-y-6">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Profile Card Header */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center space-x-4">
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-axis-cyan to-axis-blue flex items-center justify-center text-white shadow-md shadow-axis-blue/20 flex-shrink-0 p-3">
            <Shield className="w-6 h-6" />
          </div>
          <div className="space-y-1 truncate">
            <div className="flex items-center space-x-2">
              <h4 className="font-bold text-base text-slate-900 truncate">
                {profile?.full_name || user?.email || 'Administrator'}
              </h4>
              <span className="badge-pill badge-ok">Admin</span>
            </div>
            <p className="text-xs text-slate-500 font-mono truncate">{user?.email}</p>
            <div className="text-[11px] text-slate-400 flex items-center space-x-1 pt-0.5">
              <Calendar className="w-3 h-3" />
              <span>Created: {formatDate(user?.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Section 1: Update Name */}
        <form onSubmit={handleUpdateName} className="p-4 bg-white border border-slate-200 rounded-2xl space-y-4">
          <h5 className="font-bold text-xs uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
            <User className="w-3.5 h-3.5 text-axis-blue" />
            <span>Personal Information</span>
          </h5>

          <Input
            label="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Sarah Connor"
            required
          />

          <div className="flex items-center justify-between pt-1">
            {nameSuccess ? (
              <span className="text-xs text-emerald-600 flex items-center space-x-1 font-semibold">
                <Check className="w-3.5 h-3.5" />
                <span>Name updated successfully</span>
              </span>
            ) : <span />}

            <Button type="submit" size="sm" isLoading={isUpdatingName}>
              Save Name
            </Button>
          </div>
        </form>

        {/* Section 2: Change Password */}
        <form onSubmit={handleUpdatePassword} className="p-4 bg-white border border-slate-200 rounded-2xl space-y-4">
          <h5 className="font-bold text-xs uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
            <KeyRound className="w-3.5 h-3.5 text-amber-500" />
            <span>Change Password</span>
          </h5>

          <Input
            label="New Password"
            type="password"
            placeholder="At least 6 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />

          <Input
            label="Confirm New Password"
            type="password"
            placeholder="Repeat new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          <div className="flex items-center justify-between pt-1">
            {passwordSuccess ? (
              <span className="text-xs text-emerald-600 flex items-center space-x-1 font-semibold">
                <Check className="w-3.5 h-3.5" />
                <span>Password changed successfully</span>
              </span>
            ) : <span />}

            <Button type="submit" size="sm" variant="secondary" isLoading={isUpdatingPassword}>
              Update Password
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
