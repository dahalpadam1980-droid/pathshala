import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { PageHeader, Panel, Toolbar } from '../components/page';
import { Button, Badge, Table, useToast, Spinner } from '../lib/ui';

interface ChatMsg {
  role: 'user' | 'assistant';
  answer: string;
  source?: string;
  data?: any;
}

export default function AiPage() {
  const { t, digits } = useI18n();
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [dataPanel, setDataPanel] = useState<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<string[]>('/ai/suggestions')
      .then((r) => setSuggestions(Array.isArray(r) ? r : []))
      .catch(() => setSuggestions([]));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setQuestion('');
    setMessages((m) => [...m, { role: 'user', answer: q }]);
    setBusy(true);
    try {
      const r = await api.post<{ answer: string; source: string; data?: any; context?: any }>('/ai/ask', { question: q });
      setMessages((m) => [...m, { role: 'assistant', answer: r.answer, source: r.source, data: r.data }]);
      setDataPanel(r.data ?? null);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Assistant failed', 'error');
      setMessages((m) => [
        ...m,
        { role: 'assistant', answer: 'Sorry, I could not answer that just now. Please try again.', source: 'error' },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const sourceBadge = (s?: string) => {
    if (!s) return null;
    const tone = s === 'database' ? 'green' : s === 'ai' ? 'teal' : s === 'error' ? 'red' : 'navy';
    return <Badge tone={tone as 'green' | 'teal' | 'red' | 'navy'}>{s}</Badge>;
  };

  return (
    <>
      <PageHeader
        title="AI assistant"
        subtitle="Ask questions about your school — answers are grounded in the live database (students, fees, attendance, library)"
        actions={
          <Button variant="secondary" size="sm" onClick={() => { setMessages([]); setDataPanel(null); }}>
            <RefreshCw size={14} /> {t('refresh')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Panel>
          <div className="flex h-[calc(100vh-320px)] min-h-[420px] flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="py-8 text-center">
                  <Sparkles size={28} className="mx-auto mb-2 text-teal-500" />
                  <p className="text-sm text-slate-500">
                    Ask anything about your school's data, e.g. “How many students are in class 8?”
                  </p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      m.role === 'user'
                        ? 'bg-navy-700 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-800 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-100'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.answer}</p>
                    {m.role === 'assistant' && (
                      <div className="mt-2 flex items-center gap-2 text-xs opacity-70">
                        {sourceBadge(m.source)}
                        <span>grounded in school data</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Spinner size={16} /> Thinking…
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-slate-100 p-3 dark:border-navy-800">
              {!!suggestions.length && messages.length === 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="rounded-full border border-teal-300 px-2.5 py-1 text-xs text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-300"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(question);
                }}
              >
                <input
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-500 dark:border-navy-700 dark:bg-navy-900 dark:text-white"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask about students, fees, attendance, library…"
                  disabled={busy}
                />
                <Button type="submit" variant="teal" disabled={busy || !question.trim()}>
                  <Send size={15} />
                </Button>
              </form>
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">
              Answer data
            </div>
            <div className="max-h-[400px] overflow-y-auto p-3">
              {!dataPanel ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Ask a question — the numbers behind the answer appear here.
                </p>
              ) : Array.isArray(dataPanel) ? (
                <Table
                  columns={[
                    { key: 'k', header: 'Item', render: (r: any) => String(r.label ?? r.name ?? r.title ?? JSON.stringify(r).slice(0, 40)) },
                    { key: 'v', header: 'Value', render: (r: any) => digits(String(r.value ?? r.total ?? r.count ?? '—')) },
                  ]}
                  rows={dataPanel}
                  empty="No tabular data."
                />
              ) : typeof dataPanel === 'object' ? (
                <dl className="space-y-2 text-sm">
                  {Object.entries(dataPanel).map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-1.5 dark:border-navy-800">
                      <dt className="text-xs uppercase tracking-wide text-slate-400">{k.replace(/([A-Z])/g, ' $1')}</dt>
                      <dd className="text-right font-medium">
                        {typeof v === 'object' ? JSON.stringify(v) : digits(String(v ?? '—'))}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm">{String(dataPanel)}</p>
              )}
            </div>
          </Panel>

          <Panel>
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">Try asking</div>
            <ul className="space-y-1.5 p-3 text-sm">
              {(suggestions.length
                ? suggestions
                : [
                    'How many students are enrolled?',
                    'Show today’s attendance summary',
                    'What are the outstanding fees?',
                    'How many books are currently issued?',
                  ]
              ).map((s) => (
                <li key={s}>
                  <button
                    onClick={() => ask(s)}
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-600 hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-teal-900/20"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
