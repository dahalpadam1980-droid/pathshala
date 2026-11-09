import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { getDb, closeDb } from './client.js';
import {
  schools, users, academicYears, classes, sections, subjects, classSubjects,
  employees, students, studentAttendance, notices,
} from './schema/index.js';
import { hashPassword } from '../lib/password.js';
import { onboardSchool } from '../modules/schools/onboarding.js';
import { todayBs } from '../lib/bsdate.js';

/**
 * ============================================================================
 * SEED — development / demo data.  Everything created here is clearly marked
 * as demo (usernames, "seeded demo" notes).  Safe to re-run: every insert is
 * guarded by an existence check, so running it twice creates nothing new.
 *
 *   npm run db:seed
 *
 * Demo logins (all passwords below):
 *   platform  superadmin      Super@12345   (super_admin, no school)
 *   school    admin           Demo@12345   (school_admin)
 *   school    accountant      Demo@12345   (accountant)
 *   school    office1         Demo@12345   (office)
 *   school    teacher1        Demo@12345   (teacher + employee record)
 *   school    student1        Demo@12345   (student)
 *   school    parent1         Demo@12345   (parent)
 * ============================================================================
 */

const SUPER_PASSWORD = 'Super@12345';
const DEMO_PASSWORD = 'Demo@12345';

type Db = Awaited<ReturnType<typeof getDb>>;

async function ensureUser(
  db: Db,
  opts: {
    username: string;
    role: string;
    nameEn: string;
    nameNe?: string;
    schoolId?: string | null;
    password: string;
    email?: string;
    locale?: string;
  },
) {
  const [existing] = await db.select().from(users).where(eq(users.username, opts.username)).limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(users)
    .values({
      username: opts.username,
      role: opts.role,
      nameEn: opts.nameEn,
      nameNe: opts.nameNe ?? null,
      schoolId: opts.schoolId ?? null,
      passwordHash: hashPassword(opts.password),
      email: opts.email ?? null,
      locale: opts.locale ?? 'en',
      status: 'active',
    })
    .returning();
  console.log(`  + user ${opts.username} (${opts.role})`);
  return row;
}

async function main() {
  const db = await getDb();
  console.log('[seed] starting…');

  // ---------------------------------------------------------------- super admin
  const superAdmin = await ensureUser(db, {
    username: 'superadmin',
    role: 'super_admin',
    nameEn: 'Platform Super Admin',
    nameNe: 'प्लेटफर्म प्रशासक',
    password: SUPER_PASSWORD,
    email: 'superadmin@pathshala.local',
  });

  // ---------------------------------------------------------------- demo school
  const SCHOOL_CODE = 'demo-school';
  let [school] = await db.select().from(schools).where(eq(schools.code, SCHOOL_CODE)).limit(1);
  if (!school) {
    [school] = await db
      .insert(schools)
      .values({
        code: SCHOOL_CODE,
        nameEn: 'Pathshala Demo Secondary School',
        nameNe: 'पाठशाला डेमो माध्यमिक विद्यालय',
        type: 'community',
        levels: ['ecd', 'basic', 'secondary'],
        address: 'Ward 5, Lakeside',
        municipality: 'Pokhara Metropolitan City',
        ward: 5,
        district: 'Kaski',
        province: 'Gandaki',
        registrationNo: 'DEMOSCH-2080',
        emisCode: 'DEM-01-001',
        phone: '061-000000',
        email: 'info@demo-school.local',
        principalName: 'Shree Hari Adhikari',
        mottoEn: 'Knowledge, Discipline, Service',
        mottoNe: 'ज्ञान, अनुशासन, सेवा',
        status: 'active',
        createdBy: superAdmin.id,
      })
      .returning();
    console.log(`  + school ${school.code}`);
  }

  const schoolId = school.id;

  // ------------------------------------------------- onboarding defaults (classes,
  // section A, grading scale, chart of accounts incl. grants, fee heads, year)
  const onboarded = await onboardSchool(schoolId);
  if (Object.keys(onboarded).length) console.log('  + onboarding defaults:', onboarded);

  // ---------------------------------------------------------------- school users
  await ensureUser(db, { username: 'admin', role: 'school_admin', nameEn: 'School Admin', nameNe: 'विद्यालय प्रशासक', schoolId, password: DEMO_PASSWORD });
  await ensureUser(db, { username: 'accountant', role: 'accountant', nameEn: 'Accounts Incharge', nameNe: 'लेखा प्रभारी', schoolId, password: DEMO_PASSWORD });
  await ensureUser(db, { username: 'office1', role: 'office', nameEn: 'Office Assistant', nameNe: 'कार्यालय सहायक', schoolId, password: DEMO_PASSWORD });
  const teacherUser = await ensureUser(db, { username: 'teacher1', role: 'teacher', nameEn: 'Sunita Gurung', nameNe: 'सुनिता गुरुङ', schoolId, password: DEMO_PASSWORD });
  const teacher2User = await ensureUser(db, { username: 'teacher2', role: 'teacher', nameEn: 'Ramesh Thapa', nameNe: 'रमेश थापा', schoolId, password: DEMO_PASSWORD });
  const studentUser = await ensureUser(db, { username: 'student1', role: 'student', nameEn: 'Aarav Sharma', nameNe: 'आरव शर्मा', schoolId, password: DEMO_PASSWORD });
  await ensureUser(db, { username: 'parent1', role: 'parent', nameEn: 'Bikash Sharma', nameNe: 'विकास शर्मा', schoolId, password: DEMO_PASSWORD });

  // ---------------------------------------------------------------- staff (demo)
  async function ensureEmployee(opts: { empCode: string; nameEn: string; nameNe: string; isTeacher: boolean; userId?: string | null; designation: string }) {
    const [existing] = await db.select().from(employees).where(and(eq(employees.schoolId, schoolId), eq(employees.empCode, opts.empCode))).limit(1);
    if (existing) return existing;
    const [row] = await db.insert(employees).values({
      schoolId,
      empCode: opts.empCode,
      nameEn: `${opts.nameEn} (seeded demo)`,
      nameNe: opts.nameNe,
      gender: 'female',
      isTeacher: opts.isTeacher,
      designation: opts.designation,
      appointmentDate: new Date().toISOString().slice(0, 10),
      appointmentType: 'permanent',
      status: 'active',
      userId: opts.userId ?? null,
      notes: 'seeded demo record',
    }).returning();
    console.log(`  + employee ${opts.empCode}`);
    return row;
  }

  await ensureEmployee({ empCode: 'T-001', nameEn: 'Sunita Gurung', nameNe: 'सुनिता गुरुङ', isTeacher: true, userId: teacherUser.id, designation: 'Assistant Teacher' });
  await ensureEmployee({ empCode: 'T-002', nameEn: 'Ramesh Thapa', nameNe: 'रमेश थापा', isTeacher: true, userId: teacher2User.id, designation: 'Assistant Teacher' });
  await ensureEmployee({ empCode: 'O-001', nameEn: 'Kabita Rai', nameNe: 'कबिता राई', isTeacher: false, designation: 'Office Assistant' });

  // ---------------------------------------------------------------- academic year
  const [year] = await db.select().from(academicYears).where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.isCurrent, true))).limit(1);
  if (!year) throw new Error('No academic year after onboarding');

  // ---------------------------------------------------------------- class + section
  const [cls] = await db.select().from(classes).where(and(eq(classes.schoolId, schoolId), eq(classes.name, '1'))).limit(1);
  if (!cls) throw new Error('Class "1" missing after onboarding');
  const [section] = await db.select().from(sections).where(and(eq(sections.schoolId, schoolId), eq(sections.classId, cls.id))).limit(1);
  if (!section) throw new Error('Section missing after onboarding');

  // ---------------------------------------------------------------- subjects (demo)
  const subjectDefs: [string, string, string][] = [
    ['ENG', 'English', 'अंग्रेजी'],
    ['NEP', 'Nepali', 'नेपाली'],
    ['MAT', 'Mathematics', 'गणित'],
    ['SCI', 'Science', 'विज्ञान'],
    ['SOC', 'Social Studies', 'सामाजिक अध्ययन'],
  ];
  for (const [code, nameEn, nameNe] of subjectDefs) {
    const [existing] = await db.select({ id: subjects.id }).from(subjects).where(and(eq(subjects.schoolId, schoolId), eq(subjects.code, code))).limit(1);
    if (existing) continue;
    const [sub] = await db.insert(subjects).values({ schoolId, code, nameEn, nameNe, type: 'compulsory' }).returning();
    await db.insert(classSubjects).values({ schoolId, classId: cls.id, subjectId: sub.id, isCompulsory: true });
  }
  console.log(`  + ${subjectDefs.length} subjects for class ${cls.name}`);

  // ---------------------------------------------------------------- students (demo)
  const studentDefs: { admissionNo: string; nameEn: string; nameNe: string; rollNo: number; gender: string; userId?: string | null; fatherName: string }[] = [
    { admissionNo: 'ADM-2083-001', nameEn: 'Aarav Sharma', nameNe: 'आरव शर्मा', rollNo: 1, gender: 'male', userId: studentUser.id, fatherName: 'Bikash Sharma' },
    { admissionNo: 'ADM-2083-002', nameEn: 'Anjali Karki', nameNe: 'अंजलि कार्की', rollNo: 2, gender: 'female', fatherName: 'Dinesh Karki' },
    { admissionNo: 'ADM-2083-003', nameEn: 'Prakash Limbu', nameNe: 'प्रकाश लिम्बू', rollNo: 3, gender: 'male', fatherName: 'Hari Limbu' },
    { admissionNo: 'ADM-2083-004', nameEn: 'Sara Tamang', nameNe: 'सारा तामाङ', rollNo: 4, gender: 'female', fatherName: 'Nima Tamang' },
  ];
  const studentRows: { id: string }[] = [];
  for (const s of studentDefs) {
    const [existing] = await db.select({ id: students.id }).from(students).where(and(eq(students.schoolId, schoolId), eq(students.admissionNo, s.admissionNo))).limit(1);
    if (existing) {
      studentRows.push(existing);
      continue;
    }
    const [row] = await db.insert(students).values({
      schoolId,
      admissionNo: s.admissionNo,
      nameEn: `${s.nameEn} (seeded demo)`,
      nameNe: s.nameNe,
      gender: s.gender,
      classId: cls.id,
      sectionId: section.id,
      rollNo: s.rollNo,
      admissionDate: new Date().toISOString().slice(0, 10),
      academicYearId: year.id,
      userId: s.userId ?? null,
      fatherName: s.fatherName,
      municipality: 'Pokhara Metropolitan City',
      ward: 5,
      district: 'Kaski',
      province: 'Gandaki',
      status: 'active',
      notes: 'seeded demo record',
    }).returning();
    studentRows.push(row);
    console.log(`  + student ${s.admissionNo}`);
  }

  // ---------------------------------------------------------------- today's attendance (demo)
  const today = new Date().toISOString().slice(0, 10);
  const statuses = ['present', 'present', 'late', 'present'];
  for (let i = 0; i < studentRows.length; i++) {
    const [existing] = await db
      .select({ id: studentAttendance.id })
      .from(studentAttendance)
      .where(and(eq(studentAttendance.schoolId, schoolId), eq(studentAttendance.studentId, studentRows[i].id), eq(studentAttendance.date, today)))
      .limit(1);
    if (existing) continue;
    await db.insert(studentAttendance).values({
      schoolId,
      sectionId: section.id,
      studentId: studentRows[i].id,
      date: today,
      status: statuses[i] ?? 'present',
      markedBy: teacherUser.id,
      remarks: 'seeded demo attendance',
    });
  }
  console.log(`  + attendance for ${studentRows.length} students on ${today} (BS ${todayBs()})`);

  // ---------------------------------------------------------------- welcome notice (demo)
  const [existingNotice] = await db.select({ id: notices.id }).from(notices).where(eq(notices.schoolId, schoolId)).limit(1);
  if (!existingNotice) {
    await db.insert(notices).values({
      schoolId,
      titleEn: 'Welcome to Pathshala ERP (demo data)',
      titleNe: 'पाठशाला ERP मा स्वागत छ (डेमो तथ्याङ्क)',
      bodyEn: 'This school was created by the seed script. All records marked "seeded demo" are sample data you can edit or delete.',
      bodyNe: 'यो विद्यालय सिड स्क्रिप्टबाट बनाइएको हो। "seeded demo" भनिएका सबै नमुना तथ्याङ्क हुन् जुन तपाईंले सम्पादन वा मेटाउन सक्नुहुन्छ।',
      audience: { all: true, roles: [], classIds: [] },
      priority: 'normal',
      pinned: true,
      status: 'published',
      publishedAt: new Date(),
      authorId: superAdmin.id,
    });
    console.log('  + welcome notice');
  }

  console.log('[seed] done.');
  console.log('[seed] demo school login: username `admin`, password ' + DEMO_PASSWORD);
  console.log('[seed] platform login:    username `superadmin`, password ' + SUPER_PASSWORD);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error('[seed] failed:', err);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
