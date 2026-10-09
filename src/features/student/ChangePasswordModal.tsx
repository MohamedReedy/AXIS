import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, CheckCircle, AlertCircle, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify your new password.');
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) throw updateErr;

      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change Your Password" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-slate-500">
          Update your account password. Choose a strong password that you will remember for future logins.
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span>Password updated successfully!</span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              New Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Minimum 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-200">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="rounded-xl border-slate-200 text-slate-600"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isLoading || success}
            className="rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold"
          >
            {isLoading ? 'Updating...' : 'Update Password'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
