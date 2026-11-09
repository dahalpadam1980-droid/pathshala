import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Users, GraduationCap, UserSquare2, ShieldCheck, CalendarDays,
  ClipboardCheck, Award, Wallet, BookOpen, Package, MonitorPlay, FileBadge2,
  Landmark, Bus, BedDouble, Globe, Megaphone, BarChart3, Bot, Settings, School,
  ListChecks, CalendarRange, Layers, IdCard, Receipt, Banknote, Library,
} from 'lucide-react';

export type Role =
  | 'super_admin' | 'school_admin' | 'accountant' | 'office' | 'teacher' | 'student' | 'parent';

export const ALL_ROLES: Role[] = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher', 'student', 'parent'];
/** Roles that run the school day-to-day. */
export const MANAGE: Role[] = ['super_admin', 'school_admin', 'office'];
/** Roles that see money. */
export const FINANCE: Role[] = ['super_admin', 'school_admin', 'accountant'];
/** Roles that teach. */
export const TEACH: Role[] = ['super_admin', 'school_admin', 'teacher'];
/** Full school administration. */
export const ADMIN: Role[] = ['super_admin', 'school_admin'];

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  roles: Role[];
  end?: boolean;
}

export interface NavGroup {
  key: string;
  labelKey: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    key: 'overview',
    labelKey: 'navOverview',
    items: [{ to: '/', labelKey: 'dashboard', icon: LayoutDashboard, roles: ALL_ROLES, end: true }],
  },
  {
    key: 'people',
    labelKey: 'navPeople',
    items: [
      { to: '/students', labelKey: 'students', icon: GraduationCap, roles: ['super_admin', 'school_admin', 'office', 'accountant', 'teacher'] },
      { to: '/staff', labelKey: 'staff', icon: UserSquare2, roles: ['super_admin', 'school_admin', 'office', 'accountant'] },
      { to: '/users', labelKey: 'users', icon: Users, roles: ['super_admin', 'school_admin', 'office'] },
    ],
  },
  {
    key: 'academics',
    labelKey: 'academics',
    items: [
      { to: '/academics/classes', labelKey: 'classes', icon: Layers, roles: ['super_admin', 'school_admin', 'office', 'teacher'] },
      { to: '/academics/subjects', labelKey: 'subjects', icon: ListChecks, roles: ['super_admin', 'school_admin', 'office', 'teacher'] },
      { to: '/academics/routine', labelKey: 'routines', icon: CalendarRange, roles: ['super_admin', 'school_admin', 'office', 'teacher'] },
      { to: '/academics/events', labelKey: 'events', icon: CalendarDays, roles: ['super_admin', 'school_admin', 'office', 'teacher'] },
      { to: '/attendance', labelKey: 'attendance', icon: ClipboardCheck, roles: ['super_admin', 'school_admin', 'office', 'teacher'] },
      { to: '/exams', labelKey: 'exams', icon: Award, roles: ['super_admin', 'school_admin', 'office', 'teacher', 'accountant', 'student', 'parent'] },
      { to: '/grading', labelKey: 'gradingScales', icon: IdCard, roles: ['super_admin', 'school_admin', 'office', 'teacher'] },
    ],
  },
  {
    key: 'finance',
    labelKey: 'navFinance',
    items: [
      { to: '/finance', labelKey: 'finance', icon: Wallet, roles: FINANCE },
      { to: '/payroll', labelKey: 'payroll', icon: Banknote, roles: FINANCE },
      { to: '/finance/reports', labelKey: 'reports', icon: Receipt, roles: FINANCE },
    ],
  },
  {
    key: 'operations',
    labelKey: 'navOperations',
    items: [
      { to: '/library', labelKey: 'library', icon: Library, roles: ['super_admin', 'school_admin', 'office', 'teacher'] },
      { to: '/inventory', labelKey: 'inventory', icon: Package, roles: ['super_admin', 'school_admin', 'office'] },
      { to: '/lms', labelKey: 'lms', icon: MonitorPlay, roles: ['super_admin', 'school_admin', 'teacher', 'student', 'parent'] },
      { to: '/certificates', labelKey: 'certificates', icon: FileBadge2, roles: ['super_admin', 'school_admin', 'office'] },
      { to: '/governance', labelKey: 'governance', icon: Landmark, roles: ['super_admin', 'school_admin', 'office'] },
      { to: '/transport', labelKey: 'transport', icon: Bus, roles: ['super_admin', 'school_admin', 'office'] },
      { to: '/hostel', labelKey: 'hostel', icon: BedDouble, roles: ['super_admin', 'school_admin', 'office'] },
      { to: '/notices', labelKey: 'notices', icon: Megaphone, roles: ALL_ROLES },
      { to: '/website', labelKey: 'website', icon: Globe, roles: ['super_admin', 'school_admin', 'office'] },
    ],
  },
  {
    key: 'insights',
    labelKey: 'navInsights',
    items: [
      { to: '/reports', labelKey: 'reports', icon: BarChart3, roles: ['super_admin', 'school_admin', 'accountant', 'office'] },
      { to: '/ai', labelKey: 'aiAssistant', icon: Bot, roles: ['super_admin', 'school_admin', 'accountant', 'office', 'teacher'] },
    ],
  },
  {
    key: 'platform',
    labelKey: 'navPlatform',
    items: [
      { to: '/settings', labelKey: 'settings', icon: Settings, roles: ['super_admin', 'school_admin', 'office'] },
      { to: '/schools', labelKey: 'schools', icon: School, roles: ['super_admin'] },
      { to: '/audit', labelKey: 'auditLogs', icon: ShieldCheck, roles: ['super_admin'] },
    ],
  },
];

/** Navigation items visible to a role. */
export function navFor(role: string): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => (i.roles as string[]).includes(role)) })).filter(
    (g) => g.items.length > 0,
  );
}

/** First nav item a role can open — used for "go home" after login. */
export function firstAllowed(role: string): string {
  for (const g of NAV) for (const i of g.items) if ((i.roles as string[]).includes(role)) return i.to;
  return '/';
}
