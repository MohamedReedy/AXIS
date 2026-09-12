# Implementation Plan: Restyle Platform to Prototype Layout & AXIS Logo Brand

Transform the Locked Exam Platform from the current dark theme into the professional enterprise layout demonstrated in `AMIT_Mastery_Sprint2_Assessment_Prototype.html`, adopting the **AXIS (AI Excellence Innovation Sprint)** logo color palette: vibrant **Electric Cyan** (`#00D2FF`), **Royal Cobalt Blue** (`#0052D4` / `#2563EB`), and **Deep Tech Slate/Navy** (`#0B1120` / `#0F172A`).

---

## User Review Required

> [!IMPORTANT]
> - **Brand Transformation**: The app will be rebranded to **AXIS: AI Excellence Innovation Sprint** using the logo image provided (`/axis-logo.jpeg`).
> - **Layout Architecture**: The Admin portal will transition to the prototype's classic two-column layout (260px fixed dark tech sidebar on the left + sticky 72px topbar + clean white/slate canvas content).
> - **Student Attempt Screen**: Matches Section 6 ("Student Attempt") of the prototype with a split card layout (Question card on the left with radio items, and Attempt State / Server Authority metrics card on the right).

---

## Proposed Changes

Grouped by component layer:

### 1. Design Tokens & Styling Foundation

#### [MODIFY] [tailwind.config.js](file:///Users/mohamedreedy/Locked%20Exam/tailwind.config.js)
- Extend color tokens to match the AXIS logo palette:
  - `axis-cyan`: `#00D2FF`
  - `axis-blue`: `#0052D4`
  - `axis-navy`: `#0B1120`
  - `axis-slate`: `#0F172A`
  - `axis-soft`: `#E0F2FE`
- Add gradient helpers and soft background utilities.

#### [MODIFY] [src/index.css](file:///Users/mohamedreedy/Locked%20Exam/src/index.css)
- Switch CSS variables to clean, high-contrast light mode canvas (`#F8FAFC`), white panels (`#FFFFFF`), border lines (`#E2E8F0`), and dark ink typography (`#0F172A`).
- Add utility classes from the prototype: `.hero`, `.eyebrow`, `.metric`, `.b-ok`, `.b-warn`, `.b-bad`, `.b-info`, `.table-wrap`, `.list-item`, `.kv`, `.callout`.

---

### 2. Layouts

#### [MODIFY] [src/layouts/AdminLayout.tsx](file:///Users/mohamedreedy/Locked%20Exam/src/layouts/AdminLayout.tsx)
- Re-architect into the prototype's two-column grid (`260px 1fr`):
  - **Sticky Left Sidebar** in deep navy (`#0B1120`):
    - AXIS Brand Logo & Title (`/axis-logo.jpeg`) with subtitle "AI Excellence Innovation Sprint".
    - Categorized navigation links:
      - Overview / Examinations Hub (`/admin`)
      - Live Exam Monitoring / Realtime Dashboard
      - Question-by-Question Grade Sheets
      - Anti-Cheat & Security Audit
    - Sidebar footer with "Active Proctoring Engine" badge and product version.
  - **Sticky Topbar** (72px, white with bottom border):
    - Page title `h1` and subtitle breadcrumb.
    - Role selector dropdown ("Academic Admin", "Instructor", "Content Reviewer", "System Admin").
    - User avatar initials badge + Admin Profile modal trigger + Sign Out button.

#### [MODIFY] [src/layouts/StudentLayout.tsx](file:///Users/mohamedreedy/Locked%20Exam/src/layouts/StudentLayout.tsx)
- Clean, focused white/slate background with AXIS header and security shield badge.

---

### 3. Admin Examinations Hub & Dashboard

#### [MODIFY] [src/features/exams/AdminHub.tsx](file:///Users/mohamedreedy/Locked%20Exam/src/features/exams/AdminHub.tsx)
- Add the **Hero Banner**:
  - Eyebrow: `AXIS PROCTORING ENGINE`
  - Title: `Question Bank & Examination Core`
  - Description: Enterprise exam governance, scheduled testing windows, and realtime cheating prevention.
  - Goal badge: `◆ Author → Review → Approved Bank → Blueprint → Equivalent Forms → Reliable Attempt`
- **KPI Metrics Cards Grid** (`4 columns`):
  - Total Exams, Published, Draft, Archived.
- Restyled search bar, filter tabs, and exam cards.

#### [MODIFY] [src/features/exams/ExamCard.tsx](file:///Users/mohamedreedy/Locked%20Exam/src/features/exams/ExamCard.tsx)
- Restyle exam card into a clean white panel with subtle border, soft shadow, AXIS cyan/blue gradient accents, pill status badges, schedule info, and quick action buttons (`Dashboard`, `Questions`, `Grades`, `Edit`).

#### [MODIFY] [src/features/dashboard/ExamDashboard.tsx](file:///Users/mohamedreedy/Locked%20Exam/src/features/dashboard/ExamDashboard.tsx)
- Restyle the Realtime Exam Dashboard with:
  - Hero banner with AXIS gradient tint and schedule summary.
  - 6 KPI metric cards in clean white cards with colored badges.
  - Submissions table wrapped in `.table-wrap` with clean headers and status pills.
  - Live proctoring feed in a crisp white card with colored event indicators.
  - Restyled modals for student audit, questions list, and schedule editing.

#### [MODIFY] [src/features/grades/GradeSheet.tsx](file:///Users/mohamedreedy/Locked%20Exam/src/features/grades/GradeSheet.tsx)
- Restyle the grade sheet matrix table to match the prototype's `.table-wrap` table styling with AXIS cyan/blue accents and CSV/Excel download buttons.

---

### 4. Student Examination Experience

#### [MODIFY] [src/features/attempts/StudentExamFlow.tsx](file:///Users/mohamedreedy/Locked%20Exam/src/features/attempts/StudentExamFlow.tsx)
- **Lobby & Rules Screen**: Styled in clean AXIS white cards with cyan/blue gradient accents and anti-cheat instructions.
- **Active Exam Screen**: Adopts the exact split layout from Section 6 of the prototype:
  - Header: AXIS logo, Exam Title, Candidate Name, and Server-authoritative timer badge (`34:59` • server time).
  - Left Card: Question indicator (`Question 3 of 15`), question text, option items (`.list-item` with custom radio buttons), and navigation button row (`Previous`, `Save & Next`, `Submit Exam`).
  - Right Card: "Attempt State" card displaying:
    - Attempt: 1 of 1
    - Form: A (version locked)
    - Timer Authority: Server (badge)
    - Anti-Cheat Status: 0 strikes (badge)
- **Lockdown Warning Overlay (`LockdownOverlay.tsx`)**:
  - Restyled with AXIS emergency red-alert styling, 10-second warning countdown, strike dots, and return button.

---

## Verification Plan

### Automated Tests & Type Checking
- Run `npm run build` (`tsc && vite build`) to ensure 0 TypeScript compilation errors and clean asset bundling.

### Manual Verification
- Verify Sidebar navigation transitions smoothly on `/admin` without page reloads (True SPA).
- Verify AXIS logo displays cleanly in the sidebar and student header.
- Verify color contrast and typography match the prototype aesthetic and AXIS cyan/cobalt scheme.
- Test student exam flow: lobby &rarr; fullscreen lock &rarr; active split layout &rarr; submission receipt.
- Test responsive mobile drawer / stack behavior.
