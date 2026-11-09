/**
 * Configurable grading engine — NO hardcoded thresholds.
 * All grade bands come from the database (grading_scales / grade_bands),
 * so government/NEB regulation changes are configuration updates, not code changes.
 */

export interface GradeBand {
  id?: string;
  minPercent: number;
  maxPercent: number;
  letter: string;
  gradePoint: number;
  isNg?: boolean;
  remark?: string;
}

export interface SubjectMarkInput {
  theoryObtained?: number | null;
  practicalObtained?: number | null;
  internalObtained?: number | null;
  theoryFull: number;
  practicalFull: number;
  internalFull: number;
  theoryPass: number;
  practicalPass: number;
  internalPass?: number;
  isAbsent?: boolean;
}

export interface SubjectGradeResult {
  total: number;
  maxTotal: number;
  percent: number;
  gradeLetter: string | null;
  gradePoint: number | null;
  isPassed: boolean;
  isAbsent: boolean;
  remark: string | null;
  ng: boolean;
}

export function findBand(bands: GradeBand[], percent: number): GradeBand | null {
  const sorted = [...bands].sort((a, b) => a.minPercent - b.minPercent);
  for (const band of sorted) {
    if (percent >= band.minPercent && percent <= band.maxPercent) return band;
  }
  // Fallback: above the highest band max (perfect score edge) or below lowest
  if (sorted.length && percent > sorted[sorted.length - 1].maxPercent) return sorted[sorted.length - 1];
  if (sorted.length && percent < sorted[0].minPercent) return sorted[0];
  return null;
}

/** Compute grade for one subject. */
export function gradeSubject(bands: GradeBand[], input: SubjectMarkInput): SubjectGradeResult {
  const theoryFull = input.theoryFull ?? 0;
  const practicalFull = input.practicalFull ?? 0;
  const internalFull = input.internalFull ?? 0;
  const maxTotal = theoryFull + practicalFull + internalFull;

  if (input.isAbsent) {
    return {
      total: 0, maxTotal, percent: 0,
      gradeLetter: 'NG', gradePoint: 0,
      isPassed: false, isAbsent: true,
      remark: 'Absent', ng: true,
    };
  }

  const theory = clamp(input.theoryObtained ?? 0, theoryFull);
  const practical = practicalFull > 0 ? clamp(input.practicalObtained ?? 0, practicalFull) : 0;
  const internal = internalFull > 0 ? clamp(input.internalObtained ?? 0, internalFull) : 0;
  const total = round2(theory + practical + internal);
  const percent = maxTotal > 0 ? round2((total / maxTotal) * 100) : 0;

  // Pass rules: must clear theory, practical (if any) and internal (if any) minimums
  const theoryOk = theory >= (input.theoryPass ?? 0);
  const practicalOk = practicalFull === 0 || practical >= (input.practicalPass ?? 0);
  const internalOk = internalFull === 0 || internal >= (input.internalPass ?? 0);
  const passed = theoryOk && practicalOk && internalOk;

  const band = findBand(bands, percent);
  const ng = !passed && (band?.isNg ?? false);

  let remark = band?.remark ?? null;
  if (!passed && !remark) {
    if (!theoryOk) remark = 'Theory below pass mark';
    else if (!practicalOk) remark = 'Practical below pass mark';
    else if (!internalOk) remark = 'Internal assessment below pass mark';
  }

  return {
    total, maxTotal, percent,
    gradeLetter: band?.letter ?? null,
    gradePoint: band?.gradePoint ?? 0,
    isPassed: passed, isAbsent: false,
    remark, ng,
  };
}

export interface SubjectGpaInput {
  gradePoint: number | null;
  creditHours: number;
}

/**
 * Aggregate GPA across subjects.
 * formula 'weighted' → credit-hour weighted average (NEB style); 'average' → simple mean.
 * Subjects with null grade point are excluded.
 */
export function computeGpa(subjects: SubjectGpaInput[], formula: 'weighted' | 'average' = 'weighted'): number {
  const valid = subjects.filter((s) => s.gradePoint !== null && s.gradePoint !== undefined);
  if (!valid.length) return 0;
  if (formula === 'average') {
    return round2(valid.reduce((sum, s) => sum + (s.gradePoint as number), 0) / valid.length);
  }
  const totalCredits = valid.reduce((sum, s) => sum + (s.creditHours || 1), 0);
  if (totalCredits === 0) return 0;
  return round2(valid.reduce((sum, s) => sum + (s.gradePoint as number) * (s.creditHours || 1), 0) / totalCredits);
}

/** Overall result status for a report card. */
export function overallResult(grades: SubjectGradeResult[]): {
  passed: boolean;
  failedSubjects: number;
  totalSubjects: number;
} {
  const failed = grades.filter((g) => !g.isPassed && !g.isAbsent).length;
  const absent = grades.filter((g) => g.isAbsent).length;
  return {
    passed: failed === 0 && absent === 0,
    failedSubjects: failed + absent,
    totalSubjects: grades.length,
  };
}

function clamp(v: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(Math.max(v, 0), max);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
