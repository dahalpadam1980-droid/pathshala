import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import {
  schools, academicYears, classes as classTable, sections,
  gradingScales, gradeBands, accountHeads, feeHeads,
} from '../../db/schema/index.js';
import { currentBsYear, bsToAd, adToBs } from '../../lib/bsdate.js';

/**
 * Onboard a school with sensible DEFAULT configuration (all editable afterwards):
 * current academic year (computed in real BS via nepali-date-converter), classes by
 * configured levels, section A, NEB-style default grading scale, government-style
 * account heads (incl. grants), common fee heads.
 *
 * Idempotent: each block only runs when the school has no rows for it yet.
 */
export async function onboardSchool(schoolId: string): Promise<Record<string, number>> {
  const db = await getDb();
  const created: Record<string, number> = {};

  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
  if (!school) throw new Error('School not found');

  // --- Academic year: Baisakh 1 .. Chaitra end of the current BS year ---
  const existingYear = await db
    .select({ id: academicYears.id })
    .from(academicYears)
    .where(eq(academicYears.schoolId, schoolId))
    .limit(1);
  if (!existingYear.length) {
    const bsYear = currentBsYear();
    const startAd = bsToAd(`${bsYear}-01-01`);
    const endAd = new Date(bsToAd(`${bsYear + 1}-01-01`).getTime() - 86400000);
    await db.insert(academicYears).values({
      schoolId,
      name: `${bsYear}/${String(bsYear + 1).slice(2)}`,
      startBs: `${bsYear}-01-01`,
      endBs: adToBs(endAd),
      startAd: startAd.toISOString().slice(0, 10),
      endAd: endAd.toISOString().slice(0, 10),
      isCurrent: true,
    });
    created.academicYear = 1;
  }

  // --- Classes by level ---
  const levels = (school.levels as string[]) ?? ['ecd', 'basic', 'secondary'];
  const classList: { name: string; level: string; order: number }[] = [];
  let order = 0;
  if (levels.includes('ecd')) for (const n of ['Nursery', 'LKG', 'UKG']) classList.push({ name: n, level: 'ecd', order: order++ });
  if (levels.includes('basic')) for (let i = 1; i <= 8; i++) classList.push({ name: String(i), level: 'basic', order: order++ });
  if (levels.includes('secondary')) for (let i = 9; i <= 12; i++) classList.push({ name: String(i), level: 'secondary', order: order++ });

  const existingClasses = await db
    .select({ id: classTable.id, name: classTable.name })
    .from(classTable)
    .where(eq(classTable.schoolId, schoolId));
  const existingNames = new Set(existingClasses.map((c) => c.name));
  for (const c of classList) {
    if (existingNames.has(c.name)) continue;
    const [cls] = await db
      .insert(classTable)
      .values({ schoolId, name: c.name, level: c.level, orderIndex: c.order })
      .returning();
    await db.insert(sections).values({ schoolId, classId: cls.id, name: 'A', room: null });
    created.classes = (created.classes ?? 0) + 1;
  }

  // --- Default grading scale (NEB-style letter grading) — editable by the school ---
  const existingScales = await db
    .select({ id: gradingScales.id })
    .from(gradingScales)
    .where(eq(gradingScales.schoolId, schoolId))
    .limit(1);
  if (!existingScales.length) {
    const [scale] = await db
      .insert(gradingScales)
      .values({
        schoolId,
        name: 'Default School Grading',
        code: 'default',
        description: 'Default letter grading scale. Edit grade bands to match the latest NEB/government rules.',
        isDefault: true,
      })
      .returning();
    const bands = [
      { min: 90, max: 100, letter: 'A+', gpa: 4.0, remark: 'Outstanding' },
      { min: 80, max: 89.99, letter: 'A', gpa: 3.6, remark: 'Excellent' },
      { min: 70, max: 79.99, letter: 'B+', gpa: 3.2, remark: 'Very Good' },
      { min: 60, max: 69.99, letter: 'B', gpa: 2.8, remark: 'Good' },
      { min: 50, max: 59.99, letter: 'C+', gpa: 2.4, remark: 'Satisfactory' },
      { min: 40, max: 49.99, letter: 'C', gpa: 2.0, remark: 'Acceptable' },
      { min: 35, max: 39.99, letter: 'D', gpa: 1.6, remark: 'Below Expectation' },
      { min: 0, max: 34.99, letter: 'NG', gpa: 0, remark: 'Not Graded', isNg: true },
    ];
    await db.insert(gradeBands).values(
      bands.map((b, i) => ({
        scaleId: scale.id,
        minPercent: String(b.min),
        maxPercent: String(b.max),
        letter: b.letter,
        gradePoint: String(b.gpa),
        remark: b.remark,
        isNg: b.isNg ?? false,
        sortOrder: i,
      })),
    );
    created.gradingScale = 1;
  }

  // --- Chart of accounts (covers government & local grant reporting) ---
  const existingHeads = await db
    .select({ id: accountHeads.id })
    .from(accountHeads)
    .where(eq(accountHeads.schoolId, schoolId))
    .limit(1);
  if (!existingHeads.length) {
    const heads: [string, string, string, string, string][] = [
      ['IN-01', 'Government Grant', 'सरकारी अनुदान', 'income', 'government_grant'],
      ['IN-02', 'Local Government Grant', 'स्थानीय सरकार अनुदान', 'income', 'local_grant'],
      ['IN-03', 'Student Fees', 'विद्यार्थी शुल्क', 'income', 'fee_income'],
      ['IN-04', 'Donations', 'दान', 'income', 'donation'],
      ['IN-05', 'Other Income', 'अन्य आय', 'income', 'other_income'],
      ['EX-01', 'Salaries & Allowances', 'तलब तथा भत्ता', 'expense', 'salary'],
      ['EX-02', 'Administrative Expenses', 'प्रशासनिक खर्च', 'expense', 'administrative'],
      ['EX-03', 'Teaching-Learning Materials', 'शिक्षण सामग्री', 'expense', 'teaching_material'],
      ['EX-04', 'Infrastructure & Maintenance', 'पूर्वाधार मर्मतसम्भार', 'expense', 'infrastructure'],
      ['EX-05', 'Utilities (Water/Electricity/Internet)', 'उपयोगिता बिल', 'expense', 'utility'],
      ['EX-06', 'Other Expenses', 'अन्य खर्च', 'expense', 'other_expense'],
    ];
    await db.insert(accountHeads).values(
      heads.map(([code, nameEn, nameNe, type, group]) => ({
        schoolId,
        code,
        nameEn,
        nameNe,
        type,
        group,
        isDefault: true,
      })),
    );
    created.accountHeads = heads.length;
  }

  // --- Common fee heads ---
  const existingFees = await db
    .select({ id: feeHeads.id })
    .from(feeHeads)
    .where(eq(feeHeads.schoolId, schoolId))
    .limit(1);
  if (!existingFees.length) {
    const fees: [string, string, string, string][] = [
      ['F01', 'Admission Fee', 'भर्ना शुल्क', 'one_time'],
      ['F02', 'Monthly Tuition Fee', 'मासिक शिक्षण शुल्क', 'monthly'],
      ['F03', 'Examination Fee', 'परीक्षा शुल्क', 'event'],
      ['F04', 'Computer Fee', 'कम्प्युटर शुल्क', 'monthly'],
      ['F05', 'Laboratory Fee', 'प्रयोगशाला शुल्क', 'monthly'],
      ['F06', 'Library Fee', 'पुस्तकालय शुल्क', 'annual'],
      ['F07', 'Transportation Fee', 'यातायात शुल्क', 'monthly'],
      ['F08', 'Hostel Fee', 'छात्रावास शुल्क', 'monthly'],
      ['F09', 'Sports Fee', 'खेलकुद शुल्क', 'annual'],
      ['F10', 'Other Fee', 'अन्य शुल्क', 'one_time'],
    ];
    await db.insert(feeHeads).values(
      fees.map(([code, nameEn, nameNe, frequency], i) => ({
        schoolId,
        code,
        nameEn,
        nameNe,
        frequency,
        orderIndex: i,
      })),
    );
    created.feeHeads = fees.length;
  }

  return created;
}
