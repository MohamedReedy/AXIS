# Locked Exam Platform (SPA)

A True Single-Page Application (SPA) built with **React + Vite + TypeScript + Tailwind CSS**, powered entirely by **Supabase** (PostgreSQL, Supabase Auth, Row-Level Security, Realtime, and PostgreSQL RPC functions).

---

## Features

1. **True Single-Page Application**:
   - Zero full-page reloads. All views, routes, modals, exam flows, and proctoring transitions occur seamlessly inside the React client with React Router.
2. **Comprehensive Anti-Cheat Lockdown (`useLockdown`)**:
   - Mandatory full-screen enforcement with violation overlays and grace countdown.
   - Tab switching, window blur, and application switching detection.
   - Clipboard blocking (Right-click context menu, Copy, Cut, Paste).
   - Keyboard shortcut blocking (`Ctrl+C`, `Ctrl+V`, `F12`, `Ctrl+Shift+I`, etc.).
   - Multi-strike auto-disqualification when threshold is exceeded.
3. **Server-Authoritative Scheduling & Timers**:
   - **Exam Window**: Cannot be accessed before scheduled start time (live lobby countdown) or after end time.
   - **Per-Student Duration**: Server computes `deadline_at` upon attempt start and rejects tampering.
4. **Dedicated Real-Time Exam Dashboards**:
   - Live activity feed powered by Supabase Realtime subscriptions.
   - Metrics: Total Takers, Completed, Disqualified, Average Score, Pass Rate.
5. **Question-by-Question Grade Sheet**:
   - Interactive spreadsheet matrix showing each candidate's exact answer to every question, points awarded, and total score.
   - One-click **Export CSV** (via PapaParse) and **Export Excel** (via XLSX / SheetJS).
   - Candidate Inspector modal with answer breakdown and timestamped violation audit trail.
6. **Progressive Web App (PWA)**:
   - Use directly via a web link in any browser.
   - Click "Install App" in Chrome/Edge to run as a standalone window.

---

## Setup & Supabase Migration

### 1. Run the Database Schema in Supabase
Open your Supabase Project Dashboard (`https://supabase.com/dashboard/project/wrvpylbiyinkrfakudjr`):
1. Go to the **SQL Editor**.
2. Copy all SQL statements from:
   `supabase/full_schema.sql`
3. Click **Run**.
   - This creates all tables (`profiles`, `exams`, `questions`, `question_choices`, `exam_attempts`, `answers`, `violations`), RLS policies, and RPC functions (`start_exam`, `record_violation`, `submit_exam`, `get_exam_grade_sheet`).

### 2. Environment Variables
Your `.env` is already configured with your project URL and key:
```env
VITE_SUPABASE_URL=https://wrvpylbiyinkrfakudjr.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Launch the Application
Run:
```bash
npm run dev
```
Open your browser at: `http://localhost:3000`

---

## SPA Routes

- `/login` - Unified Administrator sign-in & sign-up.
- `/admin` - Admin Hub: list all exams, create new exams with questions, copy links.
- `/admin/exam/:examId` - Dedicated real-time monitoring dashboard for a specific exam.
- `/admin/exam/:examId/grades` - Interactive Question Grade Sheet and CSV/Excel export.
- `/exam/:examId` - Student Examination Flow (Lobby &rarr; Fullscreen &rarr; Active Exam &rarr; Completion Receipt).
