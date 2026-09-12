import React from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { AdminHub } from '@/features/exams/AdminHub';
import { ExamDashboard } from '@/features/dashboard/ExamDashboard';
import { GradeSheet } from '@/features/grades/GradeSheet';
import { StudentExamFlow } from '@/features/attempts/StudentExamFlow';

// Protected Route Wrapper for Admin screens
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
      </div>
    );
  }

  // If user is not signed in, redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/admin',
    element: (
      <AdminRoute>
        <AdminHub />
      </AdminRoute>
    ),
  },
  {
    path: '/admin/exam/:examId',
    element: (
      <AdminRoute>
        <ExamDashboard />
      </AdminRoute>
    ),
  },
  {
    path: '/admin/exam/:examId/grades',
    element: (
      <AdminRoute>
        <GradeSheet />
      </AdminRoute>
    ),
  },
  {
    path: '/exam/:examId',
    element: <StudentExamFlow />,
  },
  {
    path: '/',
    element: <Navigate to="/admin" replace />,
  },
  {
    path: '*',
    element: <Navigate to="/admin" replace />,
  },
]);
