import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import CrudPage, { type CrudColumn, type FieldDef } from '../components/CrudPage';
import { Tabs } from '../components/page';
import { useI18n, adToBs, bsToAdStr, bsDaysInMonth, bsWeekday, BS_MONTHS_EN, BS_MONTHS_NE } from '../lib/i18n';
import { api } from '../lib/api';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import { Badge } from '../lib/ui';

/* ------------------------------------------------------------------ classes */

export function ClassesPage() {
  const { t, digits } = useI18n();
  const [tab, setTab] = useState('classes');
  const [lk, setLk] = useState<{ classes: Opt[]; teachers: Opt[] }>({ classes: [], teachers: [] });

  useEffect(() => {
    loadAll({ classes: lookups.classes, teachers: lookups.teachers }).then(setLk);
  }, []);

  const classColumns: CrudColumn[] = [
    { key: 'orderIndex', header: '#', render: (r) => digits(r.orderIndex ?? 0) },
    { key: 'name', header: t('name'), render: (r) => <span className="font-medium text-slate-800 dark:text-slate-100">{r.name}</span> },
    { key: 'nameNe', header: t('nameNe'), render: (r) => r.nameNe ?? '—' },
    {
      key: 'level',
      header: 'Level',
      render: (r) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.level === 'secondary' ? 'bg-navy-100 text-navy-800 dark:bg-navy-800 dark:text-navy-200' : r.level === 'ecd' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300'}`}>
          {r.level}
        </span>
      ),
    },
    {
      key: 'optionalCount',
      header: t('optionalSubjects'),
      render: (r) => (r.optionalCount ? <Badge tone="teal">{digits(r.optionalCount)}</Badge> : <span className="text-slate-400">—</span>),
    },
  ];

  const classFields: FieldDef[] = [
    { name: 'name', label: 'nameEn', required: true, placeholder: 'Grade 1 / Nursery' },
    { name: 'nameNe', label: 'nameNe', placeholder: 'कक्षा १' },
    {
      name: 'level', label: 'Level', type: 'select', required: true,
      options: [{ value: 'ecd', label: 'ECD' }, { value: 'basic', label: 'Basic' }, { value: 'secondary', label: 'Secondary' }],
    },
    {
      name: 'optionalCount', label: 'optionalSubjects', type: 'number', min: 0, max: 10,
      help: 'How many optional subjects each student must choose — e.g. 9/10 → 2, 11/12 → 3 (0 = none)',
    },
    { name: 'orderIndex', label: 'Order', type: 'number', min: 0, max: 999, help: 'Sorting position in reports' },
  ];

  const sectionColumns: CrudColumn[] = [
    { key: 'className', header: t('classes'), render: (r) => r.className ?? lk.classes.find((c) => c.value === r.classId)?.label ?? '—' },
    { key: 'name', header: t('sections'), render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'room', header: 'Room', render: (r) => digits(r.room ?? '—') },
    { key: 'capacity', header: 'Capacity', render: (r) => (r.capacity ? digits(r.capacity) : '—') },
    { key: 'classTeacherId', header: 'Class teacher', render: (r) => lk.teachers.find((x) => x.value === r.classTeacherId)?.label ?? '—' },
  ];

  const sectionFields: FieldDef[] = [
    { name: 'classId', label: 'classes', type: 'select', options: 'classes', required: true },
    { name: 'name', label: 'sections', required: true, placeholder: 'A' },
    { name: 'classTeacherId', label: 'Class teacher', type: 'select', options: 'teachers' },
    { name: 'room', label: 'Room' },
    { name: 'capacity', label: 'Capacity', type: 'number', min: 0, max: 200 },
  ];

  return (
    <>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'classes', label: t('classes') },
          { key: 'sections', label: t('sections') },
        ]}
      />
      {tab === 'classes' ? (
        <CrudPage
          endpoint="/academics/classes"
          title={t('classes')}
          subtitle="Grades & classes — stable across academic years"
          columns={classColumns}
          fields={classFields}
          defaultSort="orderIndex"
          defaultOrder="asc"
          createLabel={`${t('add')} ${t('classes')}`}
          searchPlaceholder={`${t('search')} class`}
          lookups={async () => ({})}
        />
      ) : (
        <CrudPage
          endpoint="/academics/sections"
          title={t('sections')}
          subtitle="Sections inside each class"
          columns={sectionColumns}
          fields={sectionFields}
          defaultSort="name"
          defaultOrder="asc"
          createLabel={`${t('add')} ${t('sections')}`}
          lookups={async () => loadAll({ classes: lookups.classes, teachers: lookups.teachers }) as any}
          filters={[{ name: 'classId', label: t('classes'), options: lk.classes }]}
        />
      )}
    </>
  );
}

/* ----------------------------------------------------------------- subjects */

export function SubjectsPage() {
  const { t, digits } = useI18n();
  const [tab, setTab] = useState('subjects');
  const [lk, setLk] = useState<{ classes: Opt[]; subjects: Opt[] }>({ classes: [], subjects: [] });

  useEffect(() => {
    loadAll({ classes: lookups.classes, subjects: lookups.subjects }).then(setLk);
  }, []);

  const subjectColumns: CrudColumn[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code ?? '—'}</span> },
    { key: 'nameEn', header: t('nameEn'), render: (r) => <span className="font-medium">{r.nameEn}</span> },
    { key: 'nameNe', header: t('nameNe'), render: (r) => r.nameNe ?? '—' },
    { key: 'type', header: 'Type', render: (r) => <span className="capitalize">{r.type}</span> },
    { key: 'creditHours', header: 'Credit', render: (r) => digits(r.creditHours ?? '0') },
    { key: 'hasPractical', header: t('internal'), render: (r) => (r.hasPractical ? t('yes') : t('no')) },
  ];

  const subjectFields: FieldDef[] = [
    { name: 'nameEn', label: 'nameEn', required: true, placeholder: 'Mathematics' },
    { name: 'nameNe', label: 'nameNe', placeholder: 'गणित' },
    { name: 'code', label: 'Code', placeholder: 'MATH' },
    {
      name: 'type', label: 'Type', type: 'select', required: true,
      options: [
        { value: 'compulsory', label: 'Compulsory' },
        { value: 'optional', label: 'Optional' },
        { value: 'elective', label: 'Elective' },
      ],
    },
    { name: 'creditHours', label: 'creditHours', type: 'number', step: 0.5, min: 0, max: 10 },
    { name: 'hasPractical', label: 'internal', type: 'checkbox', placeholder: 'Has internal (assessment) component' },
    { name: 'description', label: 'description', type: 'textarea', colSpan: 2 },
  ];

  const csColumns: CrudColumn[] = [
    { key: 'classId', header: t('classes'), render: (r) => lk.classes.find((c) => c.value === r.classId)?.label ?? r.className ?? '—' },
    { key: 'subjectId', header: t('subjects'), render: (r) => lk.subjects.find((s) => s.value === r.subjectId)?.label ?? r.subjectName ?? '—' },
    { key: 'theoryFull', header: t('theory'), render: (r) => `${digits(r.theoryFull)} / ${digits(r.theoryPass)}` },
    { key: 'internalFull', header: t('internal'), render: (r) => `${digits(r.internalFull ?? 0)} / ${digits(r.internalPass ?? 0)}` },
    { key: 'isCompulsory', header: 'Compulsory', render: (r) => (r.isCompulsory ? t('yes') : t('no')) },
    { key: 'theoryCreditHours', header: `${t('theory')} ${t('creditHours')}`, hideOnMobile: true, render: (r) => digits(r.theoryCreditHours ?? '0') },
    { key: 'internalCreditHours', header: `${t('internal')} ${t('creditHours')}`, hideOnMobile: true, render: (r) => digits(r.internalCreditHours ?? '0') },
    { key: 'creditHours', header: t('creditHours'), render: (r) => digits(r.creditHours ?? '0') },
  ];

  const csFields: FieldDef[] = [
    { name: 'classId', label: 'classes', type: 'select', options: 'classes', required: true },
    { name: 'subjectId', label: 'subjects', type: 'select', options: 'subjects', required: true },
    { name: 'isCompulsory', label: 'isCompulsory', type: 'checkbox', placeholder: 'Compulsory subject (not chosen by students)' },
    { name: 'orderIndex', label: 'Order', type: 'number', min: 0, max: 200 },
    { name: 'theoryFull', label: 'Theory full', type: 'number', min: 0, max: 200 },
    { name: 'theoryPass', label: 'Theory pass', type: 'number', min: 0, max: 200 },
    { name: 'internalFull', label: 'Internal full', type: 'number', min: 0, max: 200 },
    { name: 'internalPass', label: 'Internal pass', type: 'number', min: 0, max: 200 },
    { name: 'theoryCreditHours', label: `${t('theory')} ${t('creditHours')}`, type: 'number', step: 0.5, min: 0, max: 10 },
    { name: 'internalCreditHours', label: `${t('internal')} ${t('creditHours')}`, type: 'number', step: 0.5, min: 0, max: 10 },
  ];

  return (
    <>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'subjects', label: t('subjects') },
          { key: 'classSubjects', label: `${t('classes')} · ${t('subjects')}` },
        ]}
      />
      {tab === 'subjects' ? (
        <CrudPage
          endpoint="/academics/subjects"
          title={t('subjects')}
          subtitle="Subjects taught by the school"
          columns={subjectColumns}
          fields={subjectFields}
          defaultSort="nameEn"
          defaultOrder="asc"
          createLabel={`${t('add')} ${t('subjects')}`}
          lookups={async () => ({})}
        />
      ) : (
        <CrudPage
          endpoint="/academics/class-subjects"
          title={`${t('classes')} · ${t('subjects')}`}
          subtitle="Mark configuration used by exams"
          columns={csColumns}
          fields={csFields}
          defaultSort="orderIndex"
          defaultOrder="asc"
          createLabel="Add subject to class"
          lookups={async () => loadAll({ classes: lookups.classes, subjects: lookups.subjects }) as any}
          initialValues={{ isCompulsory: true }}
          filters={[{ name: 'classId', label: t('classes'), options: lk.classes }]}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------- events */

type EventRow = {
  id: string;
  titleEn: string;
  titleNe?: string;
  type: string;
  startDate: string;
  endDate: string;
  description?: string;
};

const EVENT_DOT: Record<string, string> = {
  holiday: 'bg-amber-500',
  event: 'bg-teal-500',
  exam: 'bg-red-500',
  vacation: 'bg-sky-500',
  meeting: 'bg-purple-500',
};

const WD_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WD_NE = ['आ', 'सो', 'मं', 'बु', 'बि', 'शु', 'श'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** Localized label for a stored event type key. */
const evTypeKey = (type: string): string =>
  ({ holiday: 'evHoliday', event: 'evEvent', exam: 'evExam', vacation: 'evVacation', meeting: 'evMeeting' })[type] ?? '';

/** Full BS year view — 12 month grids so the school can plan its Annual Work Plan. */
function BsYearCalendar({ events, onPickDay }: { events: EventRow[]; onPickDay: (adDate: string) => void }) {
  const { t, digits, lang } = useI18n();
  const todayBs = adToBs(new Date());
  const curYear = Number(todayBs.slice(0, 4));
  const [year, setYear] = useState(curYear);

  // Pre-compute each event's BS date range (lexicographic compare works on zero-padded BS dates).
  const ranges = events
    .map((e) => {
      const a = adToBs(e.startDate);
      const b = adToBs(e.endDate);
      if (!a || !b) return null;
      return { e, from: a <= b ? a : b, to: a <= b ? b : a };
    })
    .filter(Boolean) as { e: EventRow; from: string; to: string }[];

  const months = lang === 'ne' ? BS_MONTHS_NE : BS_MONTHS_EN;
  const wd = lang === 'ne' ? WD_NE : WD_EN;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-navy-700 dark:bg-navy-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-800"
            aria-label="Previous year"
          >
            <ChevronLeft size={15} />
          </button>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-700 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-200"
          >
            {Array.from({ length: 9 }, (_, i) => curYear - 4 + i).map((y) => (
              <option key={y} value={y}>
                {digits(y)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-800"
            aria-label="Next year"
          >
            <ChevronRight size={15} />
          </button>
          <span className="ml-1 text-xs text-slate-400">{t('bsCalendar')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          {Object.entries(EVENT_DOT).map(([type, cls]) => (
            <span key={type} className="inline-flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${cls}`} /> {evTypeKey(type) ? t(evTypeKey(type)) : type}
            </span>
          ))}
        </div>
      </div>

      <p className="mb-2 text-center text-xs text-slate-400">
        {t('annualWorkPlan')} — {digits(year)} {t('bsCalendar')} · {lang === 'ne' ? 'दिनमा क्लिक गरी कार्यक्रम थप्नुहोस्' : 'click a day to add an event'}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((mName, m) => {
          const dim = bsDaysInMonth(year, m);
          const lead = bsWeekday(year, m, 1);
          return (
            <div key={mName} className="rounded-lg border border-slate-100 p-2 dark:border-navy-800">
              <p className="mb-1 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                {mName} {digits(year)}
              </p>
              <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-slate-400">
                {wd.map((w, i) => (
                  <span key={`${w}-${i}`}>{w}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: lead }).map((_, i) => (
                  <span key={`pad-${i}`} />
                ))}
                {Array.from({ length: dim }).map((_, i) => {
                  const d = i + 1;
                  const dayBs = `${p2(year)}-${p2(m + 1)}-${p2(d)}`;
                  const hits = ranges.filter((r) => r.from <= dayBs && dayBs <= r.to);
                  const isToday = dayBs === todayBs;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onPickDay(bsToAdStr(dayBs))}
                      title={hits.length ? hits.map((h) => h.e.titleEn).join(', ') : undefined}
                      className={`relative flex h-7 items-center justify-center rounded text-[11px] leading-none transition-colors ${
                        isToday
                          ? 'bg-teal-600 font-semibold text-white'
                          : 'text-slate-600 hover:bg-teal-50 dark:text-slate-300 dark:hover:bg-navy-700'
                      }`}
                    >
                      {digits(d)}
                      {hits.length > 0 && (
                        <span
                          className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                            isToday ? 'bg-white' : EVENT_DOT[hits[0].e.type] ?? 'bg-slate-400'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EventsPage() {
  const { t, digits, fmtAd, lang } = useI18n();
  const [tab, setTab] = useState('list');
  const [events, setEvents] = useState<EventRow[]>([]);
  const [initialValues, setInitialValues] = useState<Record<string, any> | undefined>(undefined);
  const [autoOpenKey, setAutoOpenKey] = useState(0);

  const loadEvents = useCallback(() => {
    api
      .list<EventRow>('/academics/events', { all: 1, pageSize: 500 })
      .then((r) => setEvents(r.data ?? []))
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  /** Calendar day clicked → open the create form for that day (list tab). */
  const pickDay = (adDate: string) => {
    setInitialValues({ startDate: adDate, endDate: adDate });
    setAutoOpenKey((k) => k + 1);
    setTab('list');
  };

  const bsLine = (ad: string) => (ad && lang === 'en' ? digits(adToBs(ad)) : null);

  const columns: CrudColumn[] = [
    {
      key: 'titleEn',
      header: t('name'),
      render: (r) => (
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-100">{r.titleEn}</p>
          {r.titleNe && <p className="text-xs text-slate-500">{r.titleNe}</p>}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (r) => (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
          r.type === 'holiday' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
            : r.type === 'exam' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
            : r.type === 'vacation' ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300'
            : r.type === 'meeting' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
            : 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${EVENT_DOT[r.type] ?? 'bg-slate-400'}`} />
          {evTypeKey(r.type) ? t(evTypeKey(r.type)) : r.type}
        </span>
      ),
    },
    {
      key: 'startDate',
      header: t('from'),
      render: (r) => (
        <div>
          <span>{fmtAd(r.startDate)}</span>
          {bsLine(r.startDate) && <p className="text-xs text-slate-500">{bsLine(r.startDate)}</p>}
        </div>
      ),
    },
    {
      key: 'endDate',
      header: t('to'),
      render: (r) => (
        <div>
          <span>{fmtAd(r.endDate)}</span>
          {bsLine(r.endDate) && <p className="text-xs text-slate-500">{bsLine(r.endDate)}</p>}
        </div>
      ),
    },
    { key: 'isRecurring', header: 'Recurring', render: (r) => (r.isRecurring ? t('yes') : t('no')) },
    { key: 'description', header: t('details'), render: (r) => <span className="block max-w-[280px] truncate">{r.description ?? '—'}</span> },
  ];

  const fields: FieldDef[] = [
    { name: 'titleEn', label: 'nameEn', required: true, colSpan: 2, placeholder: 'Dashain holiday / Exam week' },
    { name: 'titleNe', label: 'nameNe', colSpan: 2 },
    {
      name: 'type', label: 'Type', type: 'select', required: true,
      options: [
        { value: 'holiday', label: t('evHoliday') }, { value: 'event', label: t('evEvent') },
        { value: 'exam', label: t('evExam') }, { value: 'vacation', label: t('evVacation') },
        { value: 'meeting', label: t('evMeeting') },
      ],
    },
    { name: 'isRecurring', label: 'isRecurring', type: 'checkbox', placeholder: 'Repeats every year' },
    { name: 'startDate', label: 'from', type: 'date', required: true },
    { name: 'endDate', label: 'to', type: 'date', required: true },
    { name: 'description', label: 'description', type: 'textarea', colSpan: 2 },
  ];

  return (
    <>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'list', label: t('events') },
          { key: 'bs', label: `${t('bsCalendar')} · ${t('annualWorkPlan')}` },
        ]}
      />
      {tab === 'list' ? (
        <CrudPage
          endpoint="/academics/events"
          title={t('events')}
          subtitle="Holidays, exam windows, meetings and vacations — dates shown in BS & AD"
          columns={columns}
          fields={fields}
          defaultSort="startDate"
          defaultOrder="asc"
          createLabel={`${t('add')} ${t('events')}`}
          lookups={async () => ({})}
          emptyText={`${t('noData')} — ${t('events')}`}
          initialValues={initialValues}
          autoOpenKey={autoOpenKey}
          onSaved={loadEvents}
        />
      ) : (
        <BsYearCalendar events={events} onPickDay={pickDay} />
      )}
    </>
  );
}
