import React from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { AdminHub } from '@/features/exams/AdminHub';
import { StudentsManagement } from '@/features/admin/StudentsManagement';
import { ExamDashboard } from '@/features/dashboard/ExamDashboard';
import { GradeSheet } from '@/features/grades/GradeSheet';
import { StudentExamFlow } from '@/features/attempts/StudentExamFlow';
import { StudentDashboard } from '@/features/student/StudentDashboard';
import { StudentExamReview } from '@/features/student/StudentExamReview';

// Protected Route Wrapper for Admin screens
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin, isLoading } = useAuth();
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

  // If authenticated user is NOT admin, route to student dashboard
  if (!isAdmin) {
    return <Navigate to="/student/dashboard" replace />;
  }

  return <>{children}</>;
};

// Protected Route Wrapper for Student screens
const StudentRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

// Intelligent Root Redirector
const RootRedirect: React.FC = () => {
  const { user, isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={isAdmin ? '/admin' : '/student/dashboard'} replace />;
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
    path: '/admin/students',
    element: (
      <AdminRoute>
        <StudentsManagement />
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
    path: '/student/dashboard',
    element: (
      <StudentRoute>
        <StudentDashboard />
      </StudentRoute>
    ),
  },
  {
    path: '/student/exam/:attemptId/review',
    element: (
      <StudentRoute>
        <StudentExamReview />
      </StudentRoute>
    ),
  },
  {
    path: '/exam/:examId',
    element: <StudentExamFlow />,
  },
  {
    path: '/',
    element: <RootRedirect />,
  },
  {
    path: '*',
    element: <RootRedirect />,
  },
]);
