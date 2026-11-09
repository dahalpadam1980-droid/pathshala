import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Sun, Moon, Languages, LogOut, ChevronDown, ChevronRight, School as SchoolIcon } from 'lucide-react';
import { useAuth, ROLE_HOME } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { navFor } from './nav';
import { Button, applyTheme, initialTheme } from '../lib/ui';

export default function Layout() {
  const { user, logout, can } = useAuth();
  const { t, lang, setLang, digits } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme());
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);

  const groups = user ? navFor(user.role) : [];

  // auto-expand the group containing the active route
  useEffect(() => {
    const active = groups.find((g) => g.items.some((i) => (i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to))));
    if (active) setOpenGroups((o) => (o[active.key] ? o : { ...o, [active.key]: true }));
    setSidebarOpen(false);
    setMenuOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const displayName = lang === 'ne' ? user?.nameNe || user?.nameEn : user?.nameEn || user?.nameNe || '';
  const pageTitle = (() => {
    for (const g of groups) {
      const item = g.items.find((i) => (i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to)));
      if (item) return t(item.labelKey);
    }
    return t('appName');
  })();

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-navy-950">
      {/* ---------------------------------------------------------- sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col border-r border-navy-800 bg-navy-900 text-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 border-b border-navy-800 px-4 py-3.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-500 text-white">
            <SchoolIcon size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">{t('appName')}</p>
            <p className="truncate text-[11px] text-navy-300">{user?.schoolName || t('tagline')}</p>
          </div>
          <button className="ml-auto text-navy-300 hover:text-white lg:hidden" onClick={() => setSidebarOpen(false)} aria-label={t('close')}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3 text-sm">
          {groups.map((g) => {
            const open = openGroups[g.key] !== false;
            return (
              <div key={g.key} className="mb-3">
                <button
                  className="mb-1 flex w-full items-center justify-between px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-navy-400"
                  onClick={() => setOpenGroups((o) => ({ ...o, [g.key]: !open }))}
                >
                  {t(g.labelKey)}
                  {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                {open && (
                  <ul className="space-y-0.5">
                    {g.items.map((item) => (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.end}
                          className={({ isActive }) =>
                            `flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors ${
                              isActive
                                ? 'bg-teal-600 font-semibold text-white'
                                : 'text-navy-200 hover:bg-navy-800 hover:text-white'
                            }`
                          }
                        >
                          <item.icon size={16} className="shrink-0" />
                          <span className="truncate">{t(item.labelKey)}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-navy-800 px-4 py-3 text-[11px] text-navy-400">
          {user?.schoolCode ? <p>School code: <span className="font-mono text-navy-200">{digits(user.schoolCode)}</span></p> : <p>{t('tagline')}</p>}
          <p>v1.0.0</p>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* ------------------------------------------------------------ main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur dark:border-navy-700 dark:bg-navy-900/90">
          <button className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="menu">
            <Menu size={20} />
          </button>
          <h1 className="truncate text-sm font-semibold text-navy-800 dark:text-white sm:text-base">{pageTitle}</h1>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setLang(lang === 'en' ? 'ne' : 'en')}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-navy-600 dark:text-slate-200 dark:hover:bg-navy-800"
              title="English / नेपाली"
            >
              <Languages size={14} /> {lang === 'en' ? 'EN' : 'नेपाली'}
            </button>
            <button
              onClick={toggleTheme}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-800"
              title={theme === 'dark' ? t('lightMode') : t('darkMode')}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 py-1 pl-1 pr-2 hover:bg-slate-50 dark:border-navy-600 dark:hover:bg-navy-800"
              >
                <span className="grid h-7 w-7 place-items-center rounded-md bg-navy-700 text-xs font-bold text-white">
                  {(displayName || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-[140px] truncate text-xs font-medium text-slate-700 dark:text-slate-200 sm:block">
                  {displayName}
                </span>
                <ChevronDown size={14} className="text-slate-400" />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-navy-700 dark:bg-navy-900">
                    <div className="border-b border-slate-100 px-4 py-3 dark:border-navy-800">
                      <p className="truncate text-sm font-semibold text-navy-800 dark:text-white">{displayName}</p>
                      <p className="text-xs text-slate-500">{user?.role} · {user?.username}</p>
                    </div>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        navigate(ROLE_HOME[user?.role ?? ''] ?? '/');
                      }}
                      className="block w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-navy-800"
                    >
                      {t('dashboard')}
                    </button>
                    <button
                      onClick={onLogout}
                      className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 dark:border-navy-800 dark:text-red-400 dark:hover:bg-red-900/30"
                    >
                      <LogOut size={15} /> {t('logout')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-5 lg:p-6 print:p-0">
          <Outlet />
        </main>

        <footer className="px-6 py-3 text-center text-[11px] text-slate-400 print:hidden">
          {t('appName')} · {t('tagline')}
        </footer>
      </div>
    </div>
  );
}

/** Small helper used by pages that need a "back" style action button. */
export function PageAction({ children }: { children: React.ReactNode }) {
  return <Button variant="secondary" size="sm">{children}</Button>;
}
