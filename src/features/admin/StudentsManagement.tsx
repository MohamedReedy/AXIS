import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Search,
  KeyRound,
  Mail,
  User,
  Hash,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  ShieldAlert,
  ArrowUpDown,
  BookOpen,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AdminLayout } from '@/layouts/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { StudentProfileUser } from '@/types';

export const StudentsManagement: React.FC = () => {
  const [students, setStudents] = useState<StudentProfileUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentProfileUser | null>(null);

  // Add Student Form State
  const [addFullName, setAddFullName] = useState<string>('');
  const [addEmail, setAddEmail] = useState<string>('');
  const [addPassword, setAddPassword] = useState<string>('');
  const [addStudentId, setAddStudentId] = useState<string>('');
  const [showAddPassword, setShowAddPassword] = useState<boolean>(false);
  const [addLoading, setAddLoading] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Reset Password Form State
  const [resetPassword, setResetPassword] = useState<string>('');
  const [showResetPassword, setShowResetPassword] = useState<boolean>(false);
  const [resetLoading, setResetLoading] = useState<boolean>(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch all student profiles
      const { data: profilesData, error: profilesErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'student')
        .order('created_at', { ascending: false });

      if (profilesErr) throw profilesErr;

      // 2. Fetch attempt counts for each student
      const { data: attemptsData } = await supabase
        .from('exam_attempts')
        .select('student_id, student_email, status');

      const attemptCountMap: Record<string, number> = {};
      attemptsData?.forEach((att) => {
        if (att.status === 'submitted') {
          if (att.student_id) {
            attemptCountMap[att.student_id] = (attemptCountMap[att.student_id] || 0) + 1;
          }
          if (att.student_email) {
            const emailKey = att.student_email.toLowerCase();
            attemptCountMap[emailKey] = (attemptCountMap[emailKey] || 0) + 1;
          }
        }
      });

      const formattedStudents: StudentProfileUser[] = (profilesData || []).map((p) => ({
        ...p,
        attempt_count: attemptCountMap[p.id] || attemptCountMap[p.email.toLowerCase()] || 0,
      }));

      setStudents(formattedStudents);
    } catch (err: any) {
      console.error('Failed to load students:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // Filter students based on search
  const filteredStudents = students.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.full_name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.student_id?.toLowerCase().includes(q)
    );
  });

  // Generate random safe password
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let res = '';
    for (let i = 0; i < 10; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setAddPassword(res);
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAddSuccess(null);

    if (!addFullName.trim()) {
      setAddError('Full name is required');
      return;
    }
    if (!addEmail.trim()) {
      setAddError('Valid email is required');
      return;
    }
    if (addPassword.length < 6) {
      setAddError('Password must be at least 6 characters');
      return;
    }

    setAddLoading(true);

    try {
      const { data, error } = await supabase.rpc('admin_create_student', {
        p_full_name: addFullName.trim(),
        p_email: addEmail.trim(),
        p_password: addPassword,
        p_student_id: addStudentId.trim() || null,
      });

      if (error) {
        throw error;
      }

      setAddSuccess(`Student ${addFullName} created successfully! Initial password: ${addPassword}`);
      setAddFullName('');
      setAddEmail('');
      setAddPassword('');
      setAddStudentId('');
      await fetchStudents();

      setTimeout(() => {
        setIsAddModalOpen(false);
        setAddSuccess(null);
      }, 2500);
    } catch (err: any) {
      setAddError(err?.message || 'Failed to create student account');
    } finally {
      setAddLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    setResetError(null);
    setResetSuccess(null);

    if (resetPassword.length < 6) {
      setResetError('Password must be at least 6 characters');
      return;
    }

    setResetLoading(true);
    try {
      const { error } = await supabase.rpc('admin_reset_student_password', {
        p_user_id: selectedStudent.id,
        p_new_password: resetPassword,
      });

      if (error) throw error;

      setResetSuccess(`Password for ${selectedStudent.full_name} has been reset successfully!`);
      setResetPassword('');
      setTimeout(() => {
        setIsResetModalOpen(false);
        setResetSuccess(null);
        setSelectedStudent(null);
      }, 2000);
    } catch (err: any) {
      setResetError(err?.message || 'Failed to reset student password');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <AdminLayout
      title="Students Management"
      subtitle="Provision student accounts, manage credentials, and view system enrollments"
    >
      <div className="space-y-6">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
              <Users className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Student Directory</h2>
              <p className="text-xs text-slate-500">
                {students.length} registered student{students.length === 1 ? '' : 's'} on AXIS platform
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStudents}
              className="rounded-xl border-slate-200 text-slate-600 hover:text-slate-900 cursor-pointer"
              title="Refresh List"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            <Button
              onClick={() => {
                setAddError(null);
                setAddSuccess(null);
                setIsAddModalOpen(true);
              }}
              className="rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white font-bold text-xs shadow-md shadow-blue-700/20 cursor-pointer"
            >
              <UserPlus className="w-4 h-4 mr-1.5" />
              Add New Student
            </Button>
          </div>
        </div>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Total Students
            </span>
            <div className="flex items-baseline space-x-2 mt-2">
              <span className="text-3xl font-black text-slate-900">{students.length}</span>
              <span className="text-xs text-blue-600 font-bold">Active Roster</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Exams Completed
            </span>
            <div className="flex items-baseline space-x-2 mt-2">
              <span className="text-3xl font-black text-emerald-600">
                {students.reduce((acc, s) => acc + (s.attempt_count || 0), 0)}
              </span>
              <span className="text-xs text-slate-400 font-medium">Submissions</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Authentication Method
            </span>
            <div className="flex items-baseline space-x-2 mt-2">
              <span className="text-sm font-bold text-slate-800">Email & Initial Password</span>
            </div>
            <span className="text-[11px] text-slate-400 block mt-1">
              Students can self-change password upon login
            </span>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by student name, email, or student ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Students Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-500">Loading student directory...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No Students Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                {searchQuery
                  ? `No students matching "${searchQuery}". Try a different keyword.`
                  : 'No student accounts have been created yet. Click "+ Add New Student" to provision the first student.'}
              </p>
              {!searchQuery && (
                <Button
                  size="sm"
                  onClick={() => setIsAddModalOpen(true)}
                  className="mt-4 rounded-xl bg-blue-700 text-white font-bold text-xs"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  Add First Student
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-5">Student</th>
                    <th className="py-3.5 px-4">Student ID / Code</th>
                    <th className="py-3.5 px-4">Email Address</th>
                    <th className="py-3.5 px-4 text-center">Submitted Exams</th>
                    <th className="py-3.5 px-4">Registered Date</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredStudents.map((student) => {
                    const initials = student.full_name
                      ? student.full_name
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()
                      : 'ST';

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-5">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                              {initials}
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 block">
                                {student.full_name}
                              </span>
                              <span className="text-[11px] text-slate-400 font-normal">
                                Student Account
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {student.student_id ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[11px] font-semibold border border-slate-200">
                              {student.student_id}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">None</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="text-slate-700 font-medium">{student.email}</span>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
                            {student.attempt_count || 0}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                          {formatDate(student.created_at)}
                        </td>

                        <td className="py-3.5 px-5 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedStudent(student);
                              setResetPassword('');
                              setResetError(null);
                              setResetSuccess(null);
                              setIsResetModalOpen(true);
                            }}
                            className="rounded-xl border-slate-200 text-slate-700 hover:text-blue-700 hover:border-blue-300 text-xs font-semibold cursor-pointer"
                            title="Reset Password"
                          >
                            <KeyRound className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                            Reset Password
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add New Student Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Student to Platform"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateStudent} className="space-y-4">
          <p className="text-xs text-slate-500">
            Create a student account with initial login credentials. The student can log in using their email and initial password, and can update their password from their personal dashboard.
          </p>

          {addError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{addError}</span>
            </div>
          )}

          {addSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0 text-emerald-600" />
              <span>{addSuccess}</span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Student Full Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Ahmed Mohamed"
                  value={addFullName}
                  onChange={(e) => setAddFullName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="student@example.com"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  Initial Password <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={generateRandomPassword}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Generate Password</span>
                </button>
              </div>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showAddPassword ? 'text' : 'password'}
                  required
                  placeholder="Minimum 6 characters"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowAddPassword(!showAddPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showAddPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Student ID / Code <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="e.g. STU-2026-042"
                  value={addStudentId}
                  onChange={(e) => setAddStudentId(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddModalOpen(false)}
              className="rounded-xl border-slate-200 text-slate-600"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={addLoading}
              className="rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold"
            >
              {addLoading ? 'Creating Student...' : 'Create Student Account'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset Student Password Modal */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title={`Reset Password for ${selectedStudent?.full_name || 'Student'}`}
        maxWidth="md"
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <p className="text-xs text-slate-500">
            Enter a new password for <strong className="text-slate-800">{selectedStudent?.email}</strong>. The student will use this new password on their next login.
          </p>

          {resetError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{resetError}</span>
            </div>
          )}

          {resetSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0 text-emerald-600" />
              <span>{resetSuccess}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              New Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showResetPassword ? 'text' : 'password'}
                required
                placeholder="Minimum 6 characters"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowResetPassword(!showResetPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsResetModalOpen(false)}
              className="rounded-xl border-slate-200 text-slate-600"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={resetLoading}
              className="rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold"
            >
              {resetLoading ? 'Resetting...' : 'Save New Password'}
            </Button>
          </div>
        </form>
      </Modal>
    </AdminLayout>
  );
};
