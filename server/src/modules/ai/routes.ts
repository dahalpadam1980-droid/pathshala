import { Router } from 'express';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import {
  students, classes, employees, notices, bookIssues, books,
  studentFees, studentAttendance,
} from '../../db/schema/index.js';
import { authenticate, requireSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { config } from '../../config.js';
import { currentAcademicYear } from '../academics/helpers.js';
import { adToBs } from '../../lib/bsdate.js';

const router = Router();
router.use(authenticate, requireSchool);

/**
 * Rule-based assistant grounded in the school's own data.
 * If AI_API_KEY + AI_API_MODEL are configured, the grounded context is passed
 * to the external model for a natural-language answer; otherwise a structured
 * answer computed from the database is returned.
 */
async function gatherContext(schoolId: string) {
  const year = await currentAcademicYear(schoolId);
  const [s] = await db
    .select({ value: count() })
    .from(students)
    .where(and(eq(students.schoolId, schoolId), eq(students.status, 'active')));
  const [t] = await db
    .select({ value: count() })
    .from(employees)
    .where(and(eq(employees.schoolId, schoolId), eq(employees.isTeacher, true), eq(employees.status, 'active')));
  const [e] = await db
    .select({ value: count() })
    .from(employees)
    .where(and(eq(employees.schoolId, schoolId), eq(employees.status, 'active')));
  const [c] = await db.select({ value: count() }).from(classes).where(eq(classes.schoolId, schoolId));
  const [n] = await db
    .select({ value: count() })
    .from(notices)
    .where(and(eq(notices.schoolId, schoolId), eq(notices.status, 'published')));
  const [b] = await db.select({ value: count() }).from(books).where(eq(books.schoolId, schoolId));
  const [outBooks] = await db
    .select({ value: count() })
    .from(bookIssues)
    .where(and(eq(bookIssues.schoolId, schoolId), sql`${bookIssues.returnedAt} is null`));

  let billed = 0;
  let paid = 0;
  if (year) {
    const [agg] = await db
      .select({
        billed: sql<string>`coalesce(sum(${studentFees.amount} + ${studentFees.fine} - ${studentFees.discount}), 0)`,
        paid: sql<string>`coalesce(sum(${studentFees.paidAmount}), 0)`,
      })
      .from(studentFees)
      .where(and(eq(studentFees.schoolId, schoolId), eq(studentFees.academicYearId, year.id)));
    billed = Number(agg?.billed ?? 0);
    paid = Number(agg?.paid ?? 0);
  }

  const today = new Date().toISOString().slice(0, 10);
  const [att] = await db
    .select({
      total: count(),
      present: sql<number>`count(*) filter (where ${studentAttendance.status} = 'present')`,
    })
    .from(studentAttendance)
    .where(and(eq(studentAttendance.schoolId, schoolId), eq(studentAttendance.date, today)));

  const recentNotices = await db
    .select({ titleEn: notices.titleEn, publishedAt: notices.publishedAt })
    .from(notices)
    .where(and(eq(notices.schoolId, schoolId), eq(notices.status, 'published')))
    .orderBy(desc(notices.publishedAt))
    .limit(5);

  return {
    todayBs: adToBs(new Date()),
    academicYear: year?.name ?? null,
    students: s?.value ?? 0,
    teachers: t?.value ?? 0,
    employees: e?.value ?? 0,
    classes: c?.value ?? 0,
    publishedNotices: n?.value ?? 0,
    libraryBooks: b?.value ?? 0,
    booksIssued: outBooks?.value ?? 0,
    fees: { collected: paid, billed, outstanding: billed - paid },
    attendanceToday: att ? { total: att.total, present: Number(att.present) } : { total: 0, present: 0 },
    recentNotices: recentNotices.map((x) => ({
      title: x.titleEn,
      date: x.publishedAt ? adToBs(new Date(x.publishedAt)) : null,
    })),
  };
}

type Ctx = Awaited<ReturnType<typeof gatherContext>>;

function ruleAnswer(question: string, ctx: Ctx): { answer: string; data: unknown } {
  const q = question.toLowerCase();
  const is = (...keys: string[]) => keys.some((k) => q.includes(k));

  if (is('attendance', 'उपस्थिति', 'हाजिर')) {
    const pct = ctx.attendanceToday.total
      ? Math.round((ctx.attendanceToday.present / ctx.attendanceToday.total) * 100)
      : 0;
    return {
      answer: `Today's attendance: ${ctx.attendanceToday.present} of ${ctx.attendanceToday.total} present (${pct}%).`,
      data: ctx.attendanceToday,
    };
  }
  if (is('fee', 'फि', 'payment', 'collection', 'देनदारी', 'शुल्क', 'revenue', 'income', 'due')) {
    return {
      answer:
        `Fees this year (${ctx.academicYear ?? 'n/a'}): NPR ${ctx.fees.collected.toLocaleString()} collected ` +
        `against NPR ${ctx.fees.billed.toLocaleString()} billed. Outstanding: NPR ${ctx.fees.outstanding.toLocaleString()}.`,
      data: ctx.fees,
    };
  }
  if (is('notice', 'सूचना', 'announcement', 'घोषणा')) {
    const list = ctx.recentNotices.map((n) => `- ${n.title} (${n.date ?? '-'})`).join('\n');
    return { answer: `${ctx.publishedNotices} published notices. Latest:\n${list || 'None yet.'}`, data: ctx.recentNotices };
  }
  if (is('library', 'पुस्तकालय', 'book', 'पुस्तक')) {
    return {
      answer: `Library: ${ctx.libraryBooks} titles in catalogue, ${ctx.booksIssued} currently issued.`,
      data: { books: ctx.libraryBooks, issued: ctx.booksIssued },
    };
  }
  if (is('teacher', 'शिक्षक', 'staff', 'employee', 'कर्मचारी')) {
    return {
      answer: `Teaching staff: ${ctx.teachers}. Total employees (incl. non-teaching): ${ctx.employees}.`,
      data: { teachers: ctx.teachers, employees: ctx.employees },
    };
  }
  if (is('date', 'today', 'आज', 'मिति')) {
    return {
      answer: `Today is BS ${ctx.todayBs} (Nepali calendar). Academic year: ${ctx.academicYear ?? 'not set'}.`,
      data: { bs: ctx.todayBs, year: ctx.academicYear },
    };
  }
  if (is('class', 'कक्षा', 'section')) {
    return { answer: `There are ${ctx.classes} classes configured for this school.`, data: { classes: ctx.classes } };
  }
  if (is('student', 'विद्यार्थी', 'छात्र')) {
    return {
      answer: `There are ${ctx.students} active students across ${ctx.classes} classes in academic year ${ctx.academicYear ?? 'n/a'}.`,
      data: { students: ctx.students, classes: ctx.classes },
    };
  }

  return {
    answer:
      `School snapshot for BS ${ctx.todayBs}: ${ctx.students} students, ${ctx.teachers} teachers, ${ctx.classes} classes, ` +
      `${ctx.publishedNotices} published notices, fees collected NPR ${ctx.fees.collected.toLocaleString()} of ` +
      `NPR ${ctx.fees.billed.toLocaleString()}. Ask about students, staff, attendance, fees, notices or library.`,
    data: ctx,
  };
}

async function externalAnswer(question: string, ctx: Ctx): Promise<string | null> {
  if (!config.ai.key || !config.ai.model) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ai.key}` },
      body: JSON.stringify({
        model: config.ai.model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are Pathshala ERP, an assistant for Nepali school administrators. Answer only from the provided school data. ' +
              'Be concise. Currency is NPR. Dates use the BS calendar as given.',
          },
          { role: 'system', content: `School data (JSON): ${JSON.stringify(ctx)}` },
          { role: 'user', content: question },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

const askSchema = z.object({ question: z.string().min(2).max(500) });

router.post('/ask', validateBody(askSchema), async (req, res) => {
  const schoolId = req.auth!.schoolId!;
  const question = (req.body as z.infer<typeof askSchema>).question;
  const ctx = await gatherContext(schoolId);
  const grounded = ruleAnswer(question, ctx);
  const external = await externalAnswer(question, ctx);
  res.json({
    ok: true,
    data: {
      answer: external ?? grounded.answer,
      source: external ? 'ai' : 'rules',
      data: grounded.data,
      context: { todayBs: ctx.todayBs, academicYear: ctx.academicYear },
    },
  });
});

router.get('/suggestions', (_req, res) => {
  res.json({
    ok: true,
    data: [
      'How many active students do we have?',
      "What is today's attendance?",
      'How much fee is collected this year?',
      'Show recent notices',
      'How many books are in the library?',
    ],
  });
});

export default router;
