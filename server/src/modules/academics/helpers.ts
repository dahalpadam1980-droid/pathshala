import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { academicYears } from '../../db/schema/index.js';

/** Current academic year for a school (falls back to the most recent). */
export async function currentAcademicYear(schoolId: string) {
  const [current] = await db
    .select()
    .from(academicYears)
    .where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.isCurrent, true)))
    .limit(1);
  if (current) return current;
  const [latest] = await db
    .select()
    .from(academicYears)
    .where(eq(academicYears.schoolId, schoolId))
    .orderBy(desc(academicYears.startAd))
    .limit(1);
  return latest ?? null;
}
