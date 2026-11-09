import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Undo2, Pencil, Trash2, BookOpen } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import CrudPage, { type CrudColumn, type FieldDef } from '../components/CrudPage';
import { PageHeader, Tabs, Panel, Toolbar, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Modal, Field, Input, Select, Checkbox, useToast, StatCard } from '../lib/ui';
import { DateInput } from '../components/DateInput';

const CATEGORIES = [
  'textbook', 'reference', 'novel', 'science', 'mathematics', 'language',
  'social_study', 'religion', 'computing', 'competition', 'other',
];

export default function LibraryPage() {
  const [tab, setTab] = useState('books');
  return (
    <>
      <PageHeader
        title="Library"
        subtitle="Book catalogue with copies tracking, issue/return register and overdue fines"
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'books', label: 'Books' },
          { key: 'issues', label: 'Issue register' },
        ]}
      />
      {tab === 'books' && <BooksTab />}
      {tab === 'issues' && <IssuesTab />}
    </>
  );
}

/* ============================================================== books */

function BooksTab() {
  const { t, digits, npr } = useI18n();

  const columns: CrudColumn[] = [
    { key: 'accessionNo', header: 'Accession', render: (r) => <span className="font-mono text-xs font-semibold">{r.accessionNo}</span> },
    {
      key: 'title',
      header: 'Title',
      render: (r) => (
        <div>
          <p className="font-medium">{r.title}</p>
          <p className="text-xs text-slate-500">{r.author ?? '—'}{r.publisher ? ` · ${r.publisher}` : ''}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (r) => <Badge tone="navy">{(r.category ?? 'other').replace(/_/g, ' ')}</Badge> },
    { key: 'isbn', header: 'ISBN', render: (r) => <span className="text-xs">{r.isbn ?? '—'}</span> },
    { key: 'shelf', header: 'Shelf', render: (r) => r.shelf ?? '—' },
    {
      key: 'quantity',
      header: 'Copies',
      render: (r) => (
        <span className={r.available > 0 ? 'text-emerald-600' : 'text-red-600'}>
          {digits(r.available)}/{digits(r.quantity)}
        </span>
      ),
    },
    { key: 'price', header: 'Price', render: (r) => npr(r.price) },
  ];

  const fields: FieldDef[] = [
    { name: 'accessionNo', label: 'Accession no.', required: true, placeholder: 'ACC-001' },
    { name: 'isbn', label: 'ISBN' },
    { name: 'title', label: 'Title', required: true, colSpan: 2 },
    { name: 'titleNe', label: 'Title (नेपाली)', colSpan: 2 },
    { name: 'author', label: 'Author' },
    { name: 'publisher', label: 'Publisher' },
    { name: 'category', label: 'Category', type: 'select', options: CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, ' ') })) },
    { name: 'edition', label: 'Edition' },
    { name: 'language', label: 'Language', type: 'select', options: [
      { value: 'en', label: 'English' }, { value: 'ne', label: 'नेपाली' }, { value: 'hi', label: 'Hindi' },
    ] },
    { name: 'quantity', label: 'Copies', type: 'number', min: 1, max: 10000, required: true },
    { name: 'price', label: 'Price (NPR)', type: 'number', min: 0, max: 10000000 },
    { name: 'shelf', label: 'Shelf / Rack' },
    { name: 'description', label: 'description', type: 'textarea', colSpan: 2 },
  ];

  return (
    <CrudPage
      endpoint="/library/books"
      title="Books"
      subtitle="Every title with its copies, availability and shelf location"
      columns={columns}
      fields={fields}
      defaultSort="title"
      defaultOrder="asc"
      createLabel="Add book"
      mapIn={(v) => ({ ...v, quantity: Number(v.quantity || 1), price: Number(v.price || 0) })}
    />
  );
}

/* ============================================================ issues */

function IssuesTab() {
  const { t, digits, npr, fmtAd } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('active');

  const [lk, setLk] = useState<{ books: Opt[]; students: Opt[]; employees: Opt[] }>({ books: [], students: [], employees: [] });

  const [issueOpen, setIssueOpen] = useState(false);
  const [issue, setIssue] = useState({ bookId: '', issuedToType: 'student', issuedToId: '', dueDate: '', remarks: '' });
  const [issueBusy, setIssueBusy] = useState(false);

  const [returnRow, setReturnRow] = useState<any>(null);
  const [finePerDay, setFinePerDay] = useState('5');
  const [waiveFine, setWaiveFine] = useState(false);
  const [returnBusy, setReturnBusy] = useState(false);

  useEffect(() => {
    loadAll({ books: lookups.books, students: lookups.students, employees: lookups.employees }).then(setLk);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/library/issues', status ? { status } : undefined);
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const issueBook = async () => {
    if (!issue.bookId || !issue.issuedToId || !issue.dueDate) {
      toast.push('Book, borrower and due date are required', 'error');
      return;
    }
    setIssueBusy(true);
    try {
      await api.post('/library/issues', {
        bookId: issue.bookId,
        issuedToType: issue.issuedToType,
        issuedToId: issue.issuedToId,
        dueDate: issue.dueDate,
        remarks: issue.remarks || null,
      });
      toast.push('Book issued', 'success');
      setIssueOpen(false);
      setIssue({ bookId: '', issuedToType: 'student', issuedToId: '', dueDate: '', remarks: '' });
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Issue failed', 'error');
    } finally {
      setIssueBusy(false);
    }
  };

  const returnBook = async () => {
    if (!returnRow) return;
    setReturnBusy(true);
    try {
      const r = await api.post<{ fine: number; overdueDays: number }>(`/library/issues/${returnRow.id}/return`, {
        finePerDay: Number(finePerDay || 0),
        waiveFine,
      });
      toast.push(
        r.overdueDays > 0 && !waiveFine
          ? `Returned — ${r.overdueDays} days overdue, fine ${npr(r.fine)}`
          : 'Returned',
        'success',
      );
      setReturnRow(null);
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Return failed', 'error');
    } finally {
      setReturnBusy(false);
    }
  };

  const remove = async (r: any) => {
    if (!window.confirm('Delete this issue record?')) return;
    try {
      await api.delete(`/library/issues/${r.id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  const activeCount = rows.filter((r) => !r.returnedAt).length;
  const overdueCount = rows.filter((r) => r.overdue).length;

  return (
    <>
      <Toolbar>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active issues</option>
          <option value="returned">Returned</option>
          <option value="">All</option>
        </Select>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        <Button size="sm" onClick={() => setIssueOpen(true)}><Plus size={14} /> Issue book</Button>
        <span className="ml-auto text-xs text-slate-500">
          {digits(activeCount)} active · <span className="text-red-600">{digits(overdueCount)} overdue</span>
        </span>
      </Toolbar>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>
        ) : (
          <div className="px-3 pb-3">
            <Table
              columns={[
                {
                  key: 'bookTitle',
                  header: 'Book',
                  render: (r) => (
                    <div>
                      <p className="font-medium">{r.bookTitle ?? '—'}</p>
                      <p className="text-xs text-slate-500">{r.accessionNo ?? ''}</p>
                    </div>
                  ),
                },
                {
                  key: 'borrower',
                  header: 'Borrowed by',
                  render: (r) => (
                    <div>
                      <p>{r.borrower ?? '—'}</p>
                      <p className="text-xs text-slate-500">{r.issuedToType}</p>
                    </div>
                  ),
                },
                { key: 'issuedAt', header: 'Issued', render: (r) => <span className="text-xs">{fmtAd(r.issuedAt)}</span> },
                {
                  key: 'dueDate',
                  header: 'Due',
                  render: (r) => (
                    <span className={`text-xs ${r.overdue ? 'font-semibold text-red-600' : ''}`}>
                      {fmtAd(r.dueDate)}{r.overdue ? ' ⚠' : ''}
                    </span>
                  ),
                },
                {
                  key: 'returnedAt',
                  header: 'Returned',
                  render: (r) => (r.returnedAt ? <span className="text-xs text-emerald-600">{fmtAd(r.returnedAt)}</span> : <Badge tone="amber">out</Badge>),
                },
                { key: 'fine', header: 'Fine', render: (r) => (Number(r.fine) ? <span className="text-amber-600">{npr(r.fine)}</span> : '—') },
                {
                  key: '__a',
                  header: t('actions'),
                  className: 'text-right',
                  render: (r) => (
                    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {!r.returnedAt && (
                        <Button variant="teal" size="sm" onClick={() => { setReturnRow(r); setWaiveFine(false); }}>
                          <Undo2 size={13} /> Return
                        </Button>
                      )}
                      <button onClick={() => remove(r)} className="rounded-md p-1.5 text-slate-400 hover:text-red-600" title={t('delete')}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ),
                },
              ]}
              rows={rows}
              empty="No issue records."
            />
          </div>
        )}
      </Panel>

      {/* ------------------------------------------------------- issue book */}
      <Modal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        title="Issue a book"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIssueOpen(false)} disabled={issueBusy}>{t('cancel')}</Button>
            <Button onClick={issueBook} loading={issueBusy}>{issueBusy ? 'Issuing…' : 'Issue'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Book" required>
              <Select value={issue.bookId} onChange={(e) => setIssue({ ...issue, bookId: e.target.value })}>
                <option value="">—</option>
                {lk.books.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Borrower type" required>
            <Select value={issue.issuedToType} onChange={(e) => setIssue({ ...issue, issuedToType: e.target.value, issuedToId: '' })}>
              <option value="student">Student</option>
              <option value="employee">Staff</option>
            </Select>
          </Field>
          <Field label="Due date" required>
            <DateInput value={issue.dueDate} onChange={(e) => setIssue({ ...issue, dueDate: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={issue.issuedToType === 'student' ? 'Student' : 'Staff member'} required>
              <Select value={issue.issuedToId} onChange={(e) => setIssue({ ...issue, issuedToId: e.target.value })}>
                <option value="">—</option>
                {(issue.issuedToType === 'student' ? lk.students : lk.employees).map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Remarks">
              <Input value={issue.remarks} onChange={(e) => setIssue({ ...issue, remarks: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>

      {/* -------------------------------------------------------- return */}
      <Modal
        open={returnRow !== null}
        onClose={() => setReturnRow(null)}
        title={`Return — ${returnRow?.bookTitle ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReturnRow(null)} disabled={returnBusy}>{t('cancel')}</Button>
            <Button onClick={returnBook} loading={returnBusy}>{returnBusy ? 'Returning…' : 'Confirm return'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Borrowed by <b>{returnRow?.borrower}</b>, due <b>{returnRow?.dueDate}</b>.
            {' '}{returnRow?.overdue ? <span className="text-red-600">Currently overdue.</span> : <span className="text-emerald-600">On time.</span>}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fine per day (NPR)">
              <Input type="number" min={0} max={10000} value={finePerDay} onChange={(e) => setFinePerDay(e.target.value)} />
            </Field>
            <div className="flex items-end pb-1">
              <Checkbox label="Waive fine" checked={waiveFine} onChange={(e) => setWaiveFine(e.target.checked)} />
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
