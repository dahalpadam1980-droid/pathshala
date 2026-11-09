import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import Layout from './components/Layout';
import { useAuth, ROLE_HOME } from './lib/auth';
import { useI18n } from './lib/i18n';
import { Spinner, Button } from './lib/ui';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DashboardRole from './pages/DashboardRole';
import StudentsPage from './pages/StudentsPage';
import StaffPage from './pages/StaffPage';
import UsersPage from './pages/UsersPage';
import { ClassesPage, SubjectsPage, EventsPage } from './pages/AcademicsPages';
import RoutinePage from './pages/RoutinePage';
import AttendancePage from './pages/AttendancePage';
import ExamsPage from './pages/ExamsPage';
import ExamDetailPage from './pages/ExamDetailPage';
import GradingPage from './pages/GradingPage';
import FinancePage from './pages/FinancePage';
import FinanceReportsPage from './pages/FinanceReportsPage';
import PayrollPage from './pages/PayrollPage';
import LibraryPage from './pages/LibraryPage';
import InventoryPage from './pages/InventoryPage';
import LmsPage from './pages/LmsPage';
import CertificatesPage from './pages/CertificatesPage';
import GovernancePage from './pages/GovernancePage';
import TransportPage from './pages/TransportPage';
import HostelPage from './pages/HostelPage';
import WebsitePage from './pages/WebsitePage';
import NoticesPage from './pages/NoticesPage';
import ReportsPage from './pages/ReportsPage';
import AiPage from './pages/AiPage';
import SettingsPage from './pages/SettingsPage';
import SchoolsPage from './pages/SchoolsPage';
import AuditPage from './pages/AuditPage';
import NotFound from './pages/NotFound';

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 text-teal-600 dark:bg-navy-950">
      <Spinner size={34} />
    </div>
  );
}

function Forbidden() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <p className="text-5xl font-black text-navy-200 dark:text-navy-700">403</p>
        <h2 className="mt-3 text-lg font-bold text-navy-800 dark:text-white">{t('forbidden')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('notFoundSub')}</p>
        <Button className="mt-4" onClick={() => navigate(ROLE_HOME[user?.role ?? ''] ?? '/')}>
          {t('goHome')}
        </Button>
      </div>
    </div>
  );
}

function Guard({ roles, children }: { roles?: string[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Forbidden />;
  return <>{children}</>;
}

const M = ['super_admin', 'school_admin', 'office'];
const A = ['super_admin', 'school_admin', 'office', 'accountant'];
const T = ['super_admin', 'school_admin', 'office', 'teacher'];
const F = ['super_admin', 'school_admin', 'accountant'];

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={ROLE_HOME[user.role] ?? '/'} replace /> : <Login />} />

      <Route
        element={
          <Guard>
            <Layout />
          </Guard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="/students" element={<Guard roles={T}><StudentsPage /></Guard>} />
        <Route path="/staff" element={<Guard roles={A}><StaffPage /></Guard>} />
        <Route path="/users" element={<Guard roles={M}><UsersPage /></Guard>} />

        <Route path="/academics/classes" element={<Guard roles={T}><ClassesPage /></Guard>} />
        <Route path="/academics/subjects" element={<Guard roles={T}><SubjectsPage /></Guard>} />
        <Route path="/academics/routine" element={<Guard roles={T}><RoutinePage /></Guard>} />
        <Route path="/academics/events" element={<Guard roles={T}><EventsPage /></Guard>} />
        <Route path="/attendance" element={<Guard roles={T}><AttendancePage /></Guard>} />
        <Route path="/exams" element={<Guard><ExamsPage /></Guard>} />
        <Route path="/exams/:id" element={<Guard><ExamDetailPage /></Guard>} />
        <Route path="/grading" element={<Guard roles={T}><GradingPage /></Guard>} />

        <Route path="/finance" element={<Guard roles={F}><FinancePage /></Guard>} />
        <Route path="/finance/reports" element={<Guard roles={F}><FinanceReportsPage /></Guard>} />
        <Route path="/payroll" element={<Guard roles={F}><PayrollPage /></Guard>} />

        <Route path="/library" element={<Guard roles={T}><LibraryPage /></Guard>} />
        <Route path="/inventory" element={<Guard roles={M}><InventoryPage /></Guard>} />
        <Route path="/lms" element={<Guard roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><LmsPage /></Guard>} />
        <Route path="/certificates" element={<Guard roles={M}><CertificatesPage /></Guard>} />
        <Route path="/governance" element={<Guard roles={M}><GovernancePage /></Guard>} />
        <Route path="/transport" element={<Guard roles={M}><TransportPage /></Guard>} />
        <Route path="/hostel" element={<Guard roles={M}><HostelPage /></Guard>} />
        <Route path="/website" element={<Guard roles={M}><WebsitePage /></Guard>} />
        <Route path="/notices" element={<Guard><NoticesPage /></Guard>} />

        <Route path="/reports" element={<Guard roles={A}><ReportsPage /></Guard>} />
        <Route path="/ai" element={<Guard roles={A.concat(['teacher'])}><AiPage /></Guard>} />
        <Route path="/settings" element={<Guard roles={M}><SettingsPage /></Guard>} />
        <Route path="/schools" element={<Guard roles={['super_admin']}><SchoolsPage /></Guard>} />
        <Route path="/audit" element={<Guard roles={['super_admin']}><AuditPage /></Guard>} />

        {/* role-specific dashboards (ROLE_HOME targets) */}
        <Route path="/dashboard/student" element={<Guard roles={['student']}><DashboardRole /></Guard>} />
        <Route path="/dashboard/parent" element={<Guard roles={['parent']}><DashboardRole /></Guard>} />

        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
