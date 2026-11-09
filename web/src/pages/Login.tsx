import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { School, Languages, Sun, Moon, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth, ROLE_HOME } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Button, Input, Field, useToast, applyTheme, initialTheme } from '../lib/ui';

const DEMO = [
  { u: 'admin', r: 'school_admin' },
  { u: 'accountant', r: 'accountant' },
  { u: 'office1', r: 'office' },
  { u: 'teacher1', r: 'teacher' },
  { u: 'student1', r: 'student' },
  { u: 'parent1', r: 'parent' },
  { u: 'superadmin', r: 'super_admin' },
];

export default function Login() {
  const { login, user } = useAuth();
  const { t, lang, setLang, digits } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState(initialTheme());

  useEffect(() => {
    if (user) navigate(ROLE_HOME[user.role] ?? '/', { replace: true });
  }, [user, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError(t('required'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const profile = await login(username.trim(), password);
      toast.push(`${t('welcomeBack')}, ${lang === 'ne' ? profile.nameNe || profile.nameEn : profile.nameEn}`, 'success');
      navigate(ROLE_HOME[profile.role] ?? '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-navy-950">
      {/* brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-navy-900 p-10 text-white lg:flex">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-navy-500/30 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-500">
            <School size={22} />
          </span>
          <div>
            <p className="text-lg font-bold">{t('appName')}</p>
            <p className="text-sm text-navy-300">{t('tagline')}</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-snug">
            {lang === 'ne' ? 'पाठशाला व्यवस्थापन, एकै ठाउँमा।' : 'Run your whole school from one place.'}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-navy-300">
            {lang === 'ne'
              ? 'विद्यार्थी, शिक्षक, उपस्थिति, परीक्षा, लेखा, तथा वेतन — नेपाली भाषा र वि.सं. तिथिसहित।'
              : 'Students, staff, attendance, exams, fees, accounts and payroll — with Nepali language and Bikram Sambat dates built in.'}
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            {[
              { k: 'students', v: 'DB' },
              { k: 'exams', v: 'NEB' },
              { k: 'finance', v: 'NPR' },
            ].map((x) => (
              <div key={x.k} className="rounded-xl border border-navy-700 bg-navy-800/60 px-3 py-2.5">
                <p className="text-sm font-bold text-teal-300">{x.v}</p>
                <p className="text-[11px] text-navy-300">{t(x.k)}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-navy-400">© {new Date().getFullYear()} {t('appName')} · {lang === 'ne' ? 'नेपाल' : 'Nepal'}</p>
      </div>

      {/* form panel */}
      <div className="flex flex-1 flex-col items-center justify-center p-5">
        <div className="w-full max-w-md">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-navy-900 text-white">
                <School size={18} />
              </span>
              <span className="font-bold text-navy-800 dark:text-white">{t('appName')}</span>
            </div>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setLang(lang === 'en' ? 'ne' : 'en')}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-200"
              >
                <Languages size={14} /> {lang === 'en' ? 'English' : 'नेपाली'}
              </button>
              <button
                onClick={toggleTheme}
                className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300"
                title={theme === 'dark' ? t('lightMode') : t('darkMode')}
              >
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <h2 className="text-xl font-bold text-navy-800 dark:text-white">{t('welcomeBack')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('loginSubtitle')}</p>

            <form onSubmit={submit} className="mt-5 space-y-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">
                  {error}
                </div>
              )}

              <Field label={t('username')} required>
                <Input
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                />
              </Field>

              <Field label={t('password')} required>
                <div className="relative">
                  <Input
                    type={show ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label="toggle password"
                  >
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>

              <Button type="submit" loading={loading} className="w-full" size="lg">
                {loading ? t('loggingIn') : t('signIn')} {!loading && <ArrowRight size={16} />}
              </Button>
            </form>
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 dark:border-navy-600 dark:bg-navy-900/60">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {lang === 'ne' ? 'डेमो खाताहरू' : 'Demo accounts'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DEMO.map((d) => (
                <button
                  key={d.u}
                  onClick={() => {
                    setUsername(d.u);
                    setPassword('Demo@12345');
                  }}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-teal-400 hover:text-teal-700 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300"
                  title={`${d.u} / Demo@12345`}
                >
                  {digits(d.u)} <span className="text-slate-400">·</span> {t(d.r)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {lang === 'ne' ? 'क्लिक गरेर भर्न गर्नुहोस्, पासवर्ड Demo@12345' : 'Click to fill · password Demo@12345'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
