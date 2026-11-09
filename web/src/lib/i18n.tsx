import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import NepaliDate from 'nepali-date-converter';

export type Lang = 'en' | 'ne';

/** English strings — the fallback for every key. */
const en: Record<string, string> = {
  appName: 'Pathshala ERP',
  tagline: 'School Management System',
  // auth
  login: 'Sign in',
  logout: 'Sign out',
  username: 'Username',
  password: 'Password',
  signIn: 'Sign In',
  loggingIn: 'Signing in…',
  loginFailed: 'Sign in failed',
  welcomeBack: 'Welcome back',
  loginSubtitle: 'Sign in to your school workspace',
  sessionExpired: 'Your session expired. Please sign in again.',
  // common
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  cancel: 'Cancel',
  close: 'Close',
  delete: 'Delete',
  edit: 'Edit',
  add: 'Add',
  create: 'Create',
  update: 'Update',
  search: 'Search',
  filter: 'Filter',
  actions: 'Actions',
  loading: 'Loading…',
  noData: 'No records found',
  total: 'Total',
  all: 'All',
  status: 'Status',
  active: 'Active',
  inactive: 'Inactive',
  yes: 'Yes',
  no: 'No',
  none: 'None',
  print: 'Print',
  export: 'Export',
  exportCsv: 'Export CSV',
  exportExcel: 'Export Excel',
  import: 'Import',
  download: 'Download',
  upload: 'Upload',
  confirmDelete: 'Delete this record? This cannot be undone.',
  required: 'Required',
  optional: 'Optional',
  back: 'Back',
  next: 'Next',
  previous: 'Previous',
  page: 'Page',
  of: 'of',
  showing: 'Showing',
  records: 'records',
  refresh: 'Refresh',
  view: 'View',
  details: 'Details',
  date: 'Date',
  from: 'From',
  to: 'To',
  month: 'Month',
  year: 'Year',
  name: 'Name',
  nameEn: 'Name (English)',
  nameNe: 'Name (Nepali)',
  address: 'Address',
  phone: 'Phone',
  email: 'Email',
  gender: 'Gender',
  male: 'Male',
  female: 'Female',
  other: 'Other',
  remarks: 'Remarks',
  reason: 'Reason',
  amount: 'Amount',
  totalAmount: 'Total amount',
  today: 'Today',
  clear: 'Clear',
  chooseDate: 'Choose date',
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  photo: 'Photo',
  uploadImage: 'Upload image',
  replaceImage: 'Replace image',
  uploading: 'Uploading…',
  uploadFailed: 'Upload failed',
  remove: 'Remove',
  photoHint: 'PNG/JPG up to 8 MB — used on ID cards & certificates',
  optionalSubjects: 'Optional subjects',
  chooseExactly: 'Choose exactly',
  theory: 'Theory',
  internal: 'Internal',
  creditHours: 'Credit hours',
  bsCalendar: 'BS calendar',
  annualWorkPlan: 'Annual work plan',
  evHoliday: 'Holiday',
  evEvent: 'Event',
  evExam: 'Exam',
  evVacation: 'Vacation',
  evMeeting: 'Meeting',
  // navigation
  dashboard: 'Dashboard',
  students: 'Students',
  staff: 'Staff',
  academics: 'Academics',
  attendance: 'Attendance',
  exams: 'Exams',
  finance: 'Finance',
  payroll: 'Payroll',
  library: 'Library',
  inventory: 'Inventory',
  notices: 'Notices',
  lms: 'Learning',
  certificates: 'Certificates',
  governance: 'Governance',
  transport: 'Transport',
  hostel: 'Hostel',
  website: 'Website',
  reports: 'Reports',
  settings: 'Settings',
  users: 'Users',
  schools: 'Schools',
  aiAssistant: 'AI Assistant',
  auditLogs: 'Audit logs',
  navOverview: 'Overview',
  navPeople: 'People',
  navFinance: 'Finance',
  navOperations: 'Operations',
  navInsights: 'Insights',
  navPlatform: 'Platform',
  events: 'Events',
  created: 'Created',
  deleted: 'Deleted',
  editRecord: 'Edit record',
  newRecord: 'New record',
  // sub pages
  classes: 'Classes',
  sections: 'Sections',
  subjects: 'Subjects',
  routines: 'Routines',
  gradingScales: 'Grading scales',
  marksEntry: 'Marks entry',
  results: 'Results',
  payments: 'Payments',
  receipts: 'Receipts',
  feeHeads: 'Fee heads',
  feeStructures: 'Fee structures',
  studentFees: 'Student fees',
  scholarships: 'Scholarships',
  accountHeads: 'Account heads',
  transactions: 'Transactions',
  cashbook: 'Cash book',
  trialBalance: 'Trial balance',
  outstanding: 'Outstanding',
  feeCollection: 'Fee collection',
  academicYears: 'Academic years',
  leaves: 'Leaves',
  serviceRecords: 'Service records',
  trainings: 'Trainings',
  materials: 'Materials',
  assignments: 'Assignments',
  quizzes: 'Quizzes',
  templates: 'Templates',
  issued: 'Issued',
  committees: 'Committees',
  meetings: 'Meetings',
  vehicles: 'Vehicles',
  routes: 'Routes',
  rooms: 'Rooms',
  pages: 'Pages',
  gallery: 'Gallery',
  books: 'Books',
  bookIssues: 'Book issues',
  assets: 'Assets',
  // roles
  super_admin: 'Platform admin',
  school_admin: 'School admin',
  accountant: 'Accountant',
  office: 'Office',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
  // dashboard
  totalStudents: 'Students',
  totalTeachers: 'Teachers',
  totalClasses: 'Classes',
  feesCollected: 'Fees collected',
  feesOutstanding: 'Fees outstanding',
  attendanceToday: 'Attendance today',
  publishedNotices: 'Published notices',
  studentsByClass: 'Students by class',
  academicYear: 'Academic year',
  quickActions: 'Quick actions',
  recentNotices: 'Recent notices',
  noYear: 'No academic year configured yet',
  // attendance
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  leave: 'Leave',
  unmarked: 'Unmarked',
  markAllPresent: 'Mark all present',
  saveAttendance: 'Save attendance',
  attendanceSaved: 'Attendance saved',
  // exams
  enterMarks: 'Enter marks',
  publish: 'Publish',
  published: 'Published',
  draft: 'Draft',
  locked: 'Locked',
  gpa: 'GPA',
  grade: 'Grade',
  rank: 'Rank',
  pass: 'Pass',
  fail: 'Fail',
  obtained: 'Obtained',
  full: 'Full',
  generateResults: 'Generate results',
  // finance
  collectPayment: 'Collect payment',
  receiptNo: 'Receipt no.',
  method: 'Method',
  generateDues: 'Generate dues',
  paid: 'Paid',
  unpaid: 'Unpaid',
  partial: 'Partial',
  waived: 'Waived',
  balance: 'Balance',
  // payroll
  runPayroll: 'Run payroll',
  finalize: 'Finalize',
  pay: 'Pay',
  payslip: 'Payslip',
  // messages
  loadError: 'Could not load data',
  saveError: 'Could not save',
  deleteError: 'Could not delete',
  networkError: 'Server unreachable. Is the API running?',
  notFound: 'Page not found',
  notFoundSub: 'The page you requested does not exist.',
  goHome: 'Go to dashboard',
  forbidden: 'You do not have permission to view this page.',
  aiPlaceholder: 'Ask about students, attendance, fees, notices…',
  aiSend: 'Ask',
  changeLanguage: 'मा नेपाली',
  changeLanguageEn: 'To English',
  darkMode: 'Dark mode',
  lightMode: 'Light mode',
  menu: 'Menu',
  profile: 'Profile',
  role: 'Role',
  school: 'School',
};

/** Nepali (Devanagari) strings. */
const ne: Record<string, string> = {
  appName: 'पाठशाला ERP',
  tagline: 'विद्यालय व्यवस्थापना प्रणाली',
  login: 'लगइन',
  logout: 'लगआउट',
  username: 'प्रयोगकर्ता नाम',
  password: 'पासवर्ड',
  signIn: 'साइन इन',
  loggingIn: 'साइन इन हुँदै…',
  loginFailed: 'लगइन असफल',
  welcomeBack: 'पुनः स्वागत छ',
  loginSubtitle: 'आफ्नो विद्यालय कार्यक्षेत्रमा साइन इन गर्नुहोस्',
  sessionExpired: 'तपाईंको सत्र समाप्त भयो। कृपया पुनः साइन इन गर्नुहोस्।',
  save: 'सेव गर्नुहोस्',
  saving: 'सेव गर्दै…',
  saved: 'सेव भयो',
  cancel: 'रद्द गर्नुहोस्',
  close: 'बन्द गर्नुहोस्',
  delete: 'मेटाउनुहोस्',
  edit: 'सम्पादन',
  add: 'थप्नुहोस्',
  create: 'बनाउनुहोस्',
  update: 'अद्यावधिक',
  search: 'खोज्नुहोस्',
  filter: 'फिल्टर',
  actions: 'कार्यहरू',
  loading: 'लोड हुँदै…',
  noData: 'कुनै तथ्याङ्क भेटिएन',
  total: 'जम्मा',
  all: 'सबै',
  status: 'स्थिति',
  active: 'सक्रिय',
  inactive: 'निष्क्रिय',
  yes: 'हो',
  no: 'होइन',
  none: 'छैन',
  print: 'प्रिन्ट',
  export: 'निर्यात',
  exportCsv: 'CSV निर्यात',
  exportExcel: 'Excel निर्यात',
  import: 'आयात',
  download: 'डाउनलोड',
  upload: 'अपलोड',
  confirmDelete: 'यो तथ्याङ्क मेटाउने हो? यो पछि फिर्ता हुँदैन।',
  required: 'आवश्यक',
  optional: 'वैकल्पिक',
  back: 'पछाडि',
  next: 'अर्को',
  previous: 'अघिल्लो',
  page: 'पृष्ठ',
  of: 'को',
  showing: 'देखाइँदै',
  records: 'तथ्याङ्क',
  refresh: 'ताजा गर्नुहोस्',
  view: 'हेर्नुहोस्',
  details: 'विवरण',
  date: 'मिति',
  from: 'देखि',
  to: 'सम्म',
  month: 'महिना',
  year: 'वर्ष',
  name: 'नाम',
  nameEn: 'नाम (अंग्रेजी)',
  nameNe: 'नाम (नेपाली)',
  address: 'ठेगाना',
  phone: 'फोन',
  email: 'इमेल',
  gender: 'लिङ्ग',
  male: 'पुरुष',
  female: 'महिला',
  other: 'अन्य',
  remarks: 'टिप्पणी',
  reason: 'कारण',
  amount: 'रकम',
  totalAmount: 'कुल रकम',
  today: 'आज',
  clear: 'खाली गर्नुहोस्',
  chooseDate: 'मिति छान्नुहोस्',
  prevMonth: 'अघिल्लो महिना',
  nextMonth: 'अर्को महिना',
  photo: 'फोटो',
  uploadImage: 'फोटो अपलोड गर्नुहोस्',
  replaceImage: 'फोटो परिवर्तन गर्नुहोस्',
  uploading: 'अपलोड हुँदै…',
  uploadFailed: 'अपलोड असफल',
  remove: 'हटाउनुहोस्',
  photoHint: 'पीएनजी/जेपीजी ८ एमबी सम्म — आईडी कार्ड र प्रमाणपत्रमा प्रयोग हुन्छ',
  optionalSubjects: 'ऐच्छिक विषयहरू',
  chooseExactly: 'ठ्याक्कै छान्नुहोस्',
  theory: 'सिद्धान्त',
  internal: 'आन्तरिक',
  creditHours: 'क्रेडिट घण्टा',
  bsCalendar: 'बिक्रम संवत् पात्रो',
  annualWorkPlan: 'वार्षिक कार्य योजना',
  evHoliday: 'शुभ अवकाश',
  evEvent: 'कार्यक्रम',
  evExam: 'परीक्षा',
  evVacation: 'बिदा',
  evMeeting: 'बैठक',
  dashboard: 'ड्यासबोर्ड',
  students: 'विद्यार्थीहरू',
  staff: 'कर्मचारी',
  academics: 'शैक्षिक',
  attendance: 'उपस्थिति',
  exams: 'परीक्षा',
  finance: 'वित्त',
  payroll: 'तलब',
  library: 'पुस्तकालय',
  inventory: 'भण्डार',
  notices: 'सूचनाहरू',
  lms: 'अध्ययन सामग्री',
  certificates: 'प्रमाणपत्रहरू',
  governance: 'शासन',
  transport: 'यातायात',
  hostel: 'छात्रावास',
  website: 'वेबसाइट',
  reports: 'प्रतिवेदन',
  settings: 'सेटिङ',
  users: 'प्रयोगकर्ता',
  schools: 'विद्यालयहरू',
  aiAssistant: 'AI सहायक',
  auditLogs: 'अडिट लग',
  navOverview: 'सारांश',
  navPeople: 'मानिसहरू',
  navFinance: 'वित्त',
  navOperations: 'सञ्चालन',
  navInsights: 'विश्लेषण',
  navPlatform: 'प्लेटफर्म',
  events: 'कार्यक्रम',
  created: 'सिर्जना भयो',
  deleted: 'मेटाइयो',
  editRecord: 'रेकर्ड सम्पादन',
  newRecord: 'नयाँ रेकर्ड',
  classes: 'कक्षाहरू',
  sections: 'विभागहरू',
  subjects: 'विषयहरू',
  routines: 'दैनिक नियम',
  gradingScales: 'ग्रेडिङ स्केल',
  marksEntry: 'नम्बर प्रविष्टि',
  results: 'नतिजा',
  payments: 'भुक्तानी',
  receipts: 'रसिद',
  feeHeads: 'शुल्क शीर्षक',
  feeStructures: 'शुल्क संरचना',
  studentFees: 'विद्यार्थी शुल्क',
  scholarships: 'छात्रवृत्ति',
  accountHeads: 'खाता शीर्षक',
  transactions: 'लेनदेन',
  cashbook: 'नगद बही',
  trialBalance: 'त्रैमासिक सन्तुलन',
  outstanding: 'बाँकी',
  feeCollection: 'शुल्क संकलन',
  academicYears: 'शैक्षिक वर्ष',
  leaves: 'बिदा',
  serviceRecords: 'सेवा अभिलेख',
  trainings: 'तालिम',
  materials: 'सामग्री',
  assignments: 'कार्यसूची',
  quizzes: 'क्विज',
  templates: 'नमुना',
  issued: 'जारी',
  committees: 'समितिहरू',
  meetings: 'बैठकहरू',
  vehicles: 'सवारी साधन',
  routes: 'मार्ग',
  rooms: 'कोठाहरू',
  pages: 'पृष्ठहरू',
  gallery: 'ग्यालरी',
  books: 'पुस्तकहरू',
  bookIssues: 'पुस्तक वितरण',
  assets: 'सम्पत्ति',
  super_admin: 'प्लेटफर्म प्रशासक',
  school_admin: 'विद्यालय प्रशासक',
  accountant: 'लेखापाल',
  office: 'कार्यालय',
  teacher: 'शिक्षक',
  student: 'विद्यार्थी',
  parent: 'अभिभावक',
  totalStudents: 'विद्यार्थी',
  totalTeachers: 'शिक्षक',
  totalClasses: 'कक्षाहरू',
  feesCollected: 'संकलित शुल्क',
  feesOutstanding: 'बाँकी शुल्क',
  attendanceToday: 'आजको उपस्थिति',
  publishedNotices: 'प्रकाशित सूचना',
  studentsByClass: 'कक्षा अनुसार विद्यार्थी',
  academicYear: 'शैक्षिक वर्ष',
  quickActions: 'द्रुत कार्यहरू',
  recentNotices: 'हालका सूचना',
  noYear: 'शैक्षिक वर्ष अझै तय भएको छैन',
  present: 'उपस्थित',
  absent: 'अनुपस्थित',
  late: 'ढिलो',
  leave: 'बिदा',
  unmarked: 'चिनिएको छैन',
  markAllPresent: 'सबै उपस्थित',
  saveAttendance: 'उपस्थिति सेव',
  attendanceSaved: 'उपस्थिति सेव भयो',
  enterMarks: 'नम्बर प्रविष्टि',
  publish: 'प्रकाशित गर्नुहोस्',
  published: 'प्रकाशित',
  draft: 'खस्का',
  locked: 'ताला',
  gpa: 'जीपीए',
  grade: 'ग्रेड',
  rank: 'क्रम',
  pass: 'उत्तीर्ण',
  fail: 'अनुत्तीर्ण',
  obtained: 'प्राप्त',
  full: 'पूर्ण',
  generateResults: 'नतिजा तयार गर्नुहोस्',
  collectPayment: 'भुक्तानी लिनुहोस्',
  receiptNo: 'रसिद नं.',
  method: 'विधि',
  generateDues: 'बिल बनाउनुहोस्',
  paid: 'भुक्तानी भयो',
  unpaid: 'बाँकी',
  partial: 'आंशिक',
  waived: 'माफ',
  balance: 'शेष',
  runPayroll: 'तलब तयार गर्नुहोस्',
  finalize: 'अन्तिम गर्नुहोस्',
  pay: 'तिर्नुहोस्',
  payslip: 'तलब पर्ची',
  loadError: 'तथ्याङ्क लोड गर्न सकिएन',
  saveError: 'सेव गर्न सकिएन',
  deleteError: 'मेटाउन सकिएन',
  networkError: 'सर्भर पहुँचमा छैन। API चलिरहेको छ?',
  notFound: 'पृष्ठ भेटिएन',
  notFoundSub: 'तपाईंले खोजेको पृष्ठ अवस्थित छैन।',
  goHome: 'ड्यासबोर्डमा जानुहोस्',
  forbidden: 'यो पृष्ष हेर्न अनुमति छैन।',
  aiPlaceholder: 'विद्यार्थी, उपस्थिति, शुल्क, सूचनाबारे सोध्नुहोस्…',
  aiSend: 'सोध्नुहोस्',
  changeLanguage: 'To English',
  changeLanguageEn: 'मा नेपाली',
  darkMode: 'डार्क मोड',
  lightMode: 'लाइट मोड',
  menu: 'मेनु',
  profile: 'प्रोफाइल',
  role: 'भूमिका',
  school: 'विद्यालय',
};

const DICT: Record<Lang, Record<string, string>> = { en, ne };

const LANG_KEY = 'pathshala.lang';

const NP_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

export interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  /** Convert ASCII digits to Nepali digits (when UI is in Nepali). */
  digits: (v: string | number) => string;
  /** Format a BS date string 'YYYY-MM-DD' for display. */
  fmtBs: (bs: string | null | undefined) => string;
  /** Format an AD date (ISO string / Date / 'YYYY-MM-DD') as BS (always BS, digit-localized). */
  fmtAd: (ad: string | Date | null | undefined) => string;
  /** Format an AD date as raw Gregorian 'YYYY-MM-DD' — only for explicitly AD-labeled UI. */
  fmtAdRaw: (ad: string | Date | null | undefined) => string;
  /** Today in BS. */
  todayBs: () => string;
  /** Nepali month name for an AD date (e.g. 'Kartik 2083'). */
  monthName: (ad: string | Date) => string;
  /** Format money as NPR. */
  npr: (v: number | string | null | undefined) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export const BS_MONTHS_EN = [
  'Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Aswin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
];
export const BS_MONTHS_NE = [
  'बैशाख', 'जेठ', 'असार', 'श्रावण', 'भदौ', 'असोज',
  'कात्तिक', 'मंसिर', 'पुष', 'माघ', 'फागुन', 'चैत',
];

const pad2 = (n: number) => String(n).padStart(2, '0');

export function adToBs(date: Date | string): string {
  let d: Date;
  if (typeof date === 'string') {
    // Pure 'YYYY-MM-DD' strings are calendar dates — take them literally so the
    // local timezone can't shift them to the previous/next day.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
    d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(date);
  } else {
    d = date;
  }
  if (Number.isNaN(d.getTime())) return '';
  const nep = new NepaliDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
  const { year, month, date: day } = nep.getBS();
  return `${pad2(year)}-${pad2(month + 1)}-${pad2(day)}`;
}

export function bsToAd(bs: string): Date {
  const [y, m, d] = bs.split('-').map(Number);
  return new NepaliDate(y, m - 1, d).toJsDate();
}

/** Convert a BS 'YYYY-MM-DD' string to an AD 'YYYY-MM-DD' string (timezone-safe). */
export function bsToAdStr(bs: string): string {
  try {
    const d = bsToAd(bs);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  } catch {
    return '';
  }
}

/** True when 'bs' is a real BS calendar date (round-trips through the converter). */
export function isValidBs(bs: string): boolean {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(bs).trim());
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // BS months run 1–12 and can have up to 32 days (Asar).
  if (mo < 1 || mo > 12 || d < 1 || d > 32) return false;
  try {
    const back = adToBs(new NepaliDate(y, mo - 1, d).toJsDate());
    return back === `${pad2(y)}-${pad2(mo)}-${pad2(d)}`;
  } catch {
    return false;
  }
}

/** Days in a BS month (month is 0-based). BS months have 29–32 days. */
export function bsDaysInMonth(year: number, month: number): number {
  for (let d = 32; d >= 1; d--) {
    try {
      const bs = new NepaliDate(year, month, d).getBS();
      if (bs.year === year && bs.month === month && bs.date === d) return d;
    } catch {
      /* out of range — keep looking */
    }
  }
  return 30;
}

/** Weekday of a BS date: 0 = Sunday … 6 = Saturday. */
export function bsWeekday(year: number, month: number, day: number): number {
  return new NepaliDate(year, month, day).getBS().day ?? 0;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem(LANG_KEY) as Lang) || 'en');

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nValue>(() => {
    const t = (key: string) => DICT[lang][key] ?? en[key] ?? key;
    const digits = (v: string | number) =>
      lang === 'ne' ? String(v).replace(/[0-9]/g, (c) => NP_DIGITS[Number(c)]) : String(v);
    const pad = (n: number) => String(n).padStart(2, '0');

    const fmtBs = (bs: string | null | undefined) => {
      if (!bs) return '—';
      return digits(bs);
    };

    const fmtAdRaw = (ad: string | Date | null | undefined) => {
      if (!ad) return '—';
      const adStr = typeof ad === 'string' ? ad.slice(0, 10) : ad.toISOString().slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}/.test(adStr) ? digits(adStr) : '—';
    };

    const fmtAd = (ad: string | Date | null | undefined) => {
      if (!ad) return '—';
      try {
        const bs = adToBs(ad);
        return bs ? fmtBs(bs) : '—';
      } catch {
        return '—';
      }
    };

    const todayBs = () => adToBs(new Date());

    const monthName = (ad: string | Date) => {
      try {
        const d = typeof ad === 'string' ? new Date(ad) : ad;
        const nep = new NepaliDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
        const { year, month } = nep.getBS();
        const name = lang === 'ne' ? BS_MONTHS_NE[month] : BS_MONTHS_EN[month];
        return `${name} ${digits(year)}`;
      } catch {
        return '—';
      }
    };

    const npr = (v: number | string | null | undefined) => {
      const n = Number(v ?? 0);
      const s = n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
      return lang === 'ne' ? `रु ${digits(s)}` : `NPR ${s}`;
    };

    return { lang, setLang: setLangState, t, digits, fmtBs, fmtAd, fmtAdRaw, todayBs, monthName, npr };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
