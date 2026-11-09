import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  BS_MONTHS_EN,
  BS_MONTHS_NE,
  adToBs,
  bsDaysInMonth,
  bsToAdStr,
  bsWeekday,
  isValidBs,
  useI18n,
} from '../lib/i18n';
import { inputCls } from '../lib/ui';

/**
 * Bikram Sambat (BS) date picker — a drop-in replacement for `<input type="date">`.
 *
 * The value contract is identical to the native control: an AD `YYYY-MM-DD`
 * string (or `''` when empty), and `onChange` receives an event whose
 * `target.value` is that AD string. Only the *display* and the calendar are BS,
 * so every form state, API payload and server contract stays unchanged.
 */
export interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** AD `YYYY-MM-DD` (same contract as `<input type="date">`). `''` = no date. */
  value: string;
  /** Fires with `event.target.value` = AD `YYYY-MM-DD`, or `''` when cleared. */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_NE = ['आइत', 'सोम', 'मंगल', 'बुध', 'बिही', 'शुक्र', 'शनि'];

const pad = (n: number) => String(n).padStart(2, '0');
const DEVANAGARI_DIGITS = '०१२३४५६७८९';

/** Accept both ASCII and Devanagari digits so typed input works in either script. */
function toAsciiDigits(s: string): string {
  return s.replace(/[०-९]/g, (c) => String(DEVANAGARI_DIGITS.indexOf(c)));
}

/** Parse typed text ('2083-07-21', any digit script) into a valid BS date, or null. */
function parseBsText(s: string): string | null {
  const t = toAsciiDigits(s.trim());
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (!m) return null;
  const bs = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  return isValidBs(bs) ? bs : null;
}

function parseAdLocal(ad: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ad);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function DateInput({
  value,
  onChange,
  className,
  disabled,
  min,
  max,
  onBlur,
  ...rest
}: DateInputProps) {
  const { lang, t, digits } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const todayParts = adToBs(new Date()).split('-').map(Number); // [y, m1-based, d]
  const valueBs = value ? adToBs(value) : '';

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => (value ? adToBs(value) : ''));
  const [showErr, setShowErr] = useState(false);
  const [view, setView] = useState(() => {
    const p = valueBs ? valueBs.split('-').map(Number) : todayParts;
    return { y: p[0], m: p[1] - 1 };
  });
  const [focusDay, setFocusDay] = useState(() => {
    const p = valueBs ? valueBs.split('-').map(Number) : todayParts;
    return p[2];
  });
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const daysInMonth = useMemo(() => bsDaysInMonth(view.y, view.m), [view.y, view.m]);
  // AD equivalent of every day in the visible month (for range checks).
  const monthAds = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) =>
        bsToAdStr(`${view.y}-${pad(view.m + 1)}-${pad(i + 1)}`),
      ),
    [view.y, view.m, daysInMonth],
  );

  // Keep the visible text in sync when the parent's value changes.
  useEffect(() => {
    setDraft(value ? adToBs(value) : '');
    setShowErr(false);
  }, [value]);

  // Clamp the focused day after a month change (months have 29–32 days).
  useEffect(() => {
    setFocusDay((d) => (d > daysInMonth ? daysInMonth : d));
  }, [daysInMonth]);

  const emit = (ad: string) => {
    onChange({ target: { value: ad, name: rest.name } } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  const inRange = (ad: string) => {
    const lo = min != null && min !== '' ? String(min) : null;
    const hi = max != null && max !== '' ? String(max) : null;
    if (lo && ad < lo) return false;
    if (hi && ad > hi) return false;
    return true;
  };

  /* ------------------------------------------------------- calendar open */

  const openCalendar = () => {
    if (disabled) return;
    const p = valueBs ? valueBs.split('-').map(Number) : todayParts;
    setView({ y: p[0], m: p[1] - 1 });
    setFocusDay(p[2]);
    setShowErr(false);
    setOpen(true);
  };

  /* ------------------------------------------------------------ position */

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const W = 288;
      const H = popupRef.current?.offsetHeight ?? 340;
      const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - W - 8));
      let top = r.bottom + 6;
      if (top + H > window.innerHeight - 8) {
        const above = r.top - H - 6;
        top = above >= 8 ? above : Math.max(8, window.innerHeight - H - 8);
      }
      setPos({ top, left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, view.y, view.m]);

  /* -------------------------------------------------- outside click / esc */

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popupRef.current?.contains(t)) return;
      if (inputRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // Move DOM focus to the active day whenever it changes (keyboard navigation).
  useEffect(() => {
    if (!open) return;
    const el = popupRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`);
    el?.focus();
  }, [open, focusDay, view.y, view.m]);

  /* ------------------------------------------------------- value changes */

  const closeWith = (ad: string, bs: string) => {
    emit(ad);
    setDraft(bs);
    setShowErr(false);
    setOpen(false);
    inputRef.current?.focus();
  };

  const selectDay = (d: number) => {
    const bs = `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
    const ad = bsToAdStr(bs);
    if (!ad || !inRange(ad)) return;
    closeWith(ad, bs);
  };

  const selectToday = () => {
    const bs = `${todayParts[0]}-${pad(todayParts[1])}-${pad(todayParts[2])}`;
    const ad = bsToAdStr(bs);
    if (!ad || !inRange(ad)) return;
    closeWith(ad, bs);
  };

  const clearValue = () => {
    emit('');
    setDraft('');
    setShowErr(false);
    inputRef.current?.focus();
  };

  const shiftMonth = (delta: number) => {
    setView((v) => {
      let y = v.y;
      let m = v.m + delta;
      if (m < 0) {
        m = 11;
        y -= 1;
      } else if (m > 11) {
        m = 0;
        y += 1;
      }
      return { y, m };
    });
  };

  /** Move the focused day by whole days (crosses month/year boundaries). */
  const moveFocus = (deltaDays: number) => {
    const ad = bsToAdStr(`${view.y}-${pad(view.m + 1)}-${pad(focusDay)}`);
    const d = ad ? parseAdLocal(ad) : null;
    if (!d) return;
    d.setDate(d.getDate() + deltaDays);
    const nb = adToBs(d).split('-').map(Number);
    setView({ y: nb[0], m: nb[1] - 1 });
    setFocusDay(nb[2]);
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); moveFocus(-1); break;
      case 'ArrowRight': e.preventDefault(); moveFocus(1); break;
      case 'ArrowUp': e.preventDefault(); moveFocus(-7); break;
      case 'ArrowDown': e.preventDefault(); moveFocus(7); break;
      case 'Home': e.preventDefault(); setFocusDay(1); break;
      case 'End': e.preventDefault(); setFocusDay(daysInMonth); break;
      case 'PageUp': e.preventDefault(); shiftMonth(-1); break;
      case 'PageDown': e.preventDefault(); shiftMonth(1); break;
      default: break;
    }
  };

  /* ---------------------------------------------------------- typed text */

  const commitDraft = () => {
    const text = draft.trim();
    if (text === '') {
      if (value) emit('');
      setDraft('');
      setShowErr(false);
      return;
    }
    const bs = parseBsText(text);
    if (bs) {
      const ad = bsToAdStr(bs);
      if (ad && inRange(ad)) {
        emit(ad);
        setDraft(bs);
        setShowErr(false);
        return;
      }
    }
    // Keep the typed text visible and flag it — the stored value stays untouched.
    setShowErr(true);
  };

  /* --------------------------------------------------------------- render */

  const firstWeekday = bsWeekday(view.y, view.m, 1);
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const weekdayLabels = lang === 'ne' ? WEEKDAYS_NE : WEEKDAYS_EN;
  const monthLabel = `${lang === 'ne' ? BS_MONTHS_NE[view.m] : BS_MONTHS_EN[view.m]} ${digits(view.y)}`;
  const wrapperCls = className && className.includes('w-auto') ? 'relative inline-block' : 'relative';
  const todayInRange = (() => {
    const ad = bsToAdStr(
      `${todayParts[0]}-${pad(todayParts[1])}-${pad(todayParts[2])}`,
    );
    return Boolean(ad) && inRange(ad);
  })();

  return (
    <div className={wrapperCls}>
      <input
        {...rest}
        ref={inputRef}
        type="text"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={draft}
        placeholder={rest.placeholder ?? 'YYYY-MM-DD (BS)'}
        title={rest.title ?? 'Bikram Sambat (BS) date — e.g. 2083-07-21'}
        aria-haspopup="dialog"
        aria-invalid={showErr || undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          if (showErr) setShowErr(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitDraft();
          }
        }}
        onBlur={(e) => {
          commitDraft();
          onBlur?.(e);
        }}
        className={`${inputCls} pr-9 ${showErr ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30' : ''} ${
          value ? 'pl-9' : ''
        } ${className ?? ''}`}
      />

      {value && !disabled && (
        <button
          type="button"
          onClick={clearValue}
          tabIndex={-1}
          aria-label={t('clear')}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}

      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openCalendar())}
        aria-label={t('chooseDate')}
        aria-expanded={open}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-teal-600 disabled:opacity-40 dark:text-slate-500 dark:hover:text-teal-400"
      >
        <CalendarDays size={16} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popupRef}
            role="dialog"
            aria-label={`${t('chooseDate')} (Bikram Sambat)`}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[60] w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-navy-600 dark:bg-navy-800"
          >
            <div className="mb-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label={t('prevMonth')}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-navy-700"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex-1 text-center text-sm font-semibold text-navy-800 dark:text-white">{monthLabel}</div>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label={t('nextMonth')}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-navy-700"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">
              {weekdayLabels.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1" onKeyDown={onGridKeyDown}>
              {cells.map((d, i) => {
                if (d === null) return <span key={`b${i}`} />;
                const ad = monthAds[d - 1] ?? '';
                const selected = valueBs === `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
                const isToday =
                  view.y === todayParts[0] && view.m === todayParts[1] - 1 && d === todayParts[2];
                return (
                  <button
                    key={d}
                    type="button"
                    data-day={d}
                    tabIndex={d === focusDay ? 0 : -1}
                    disabled={!ad || !inRange(ad)}
                    onClick={() => selectDay(d)}
                    className={[
                      'h-8 rounded-md text-xs transition',
                      selected
                        ? 'bg-teal-600 font-semibold text-white shadow'
                        : isToday
                          ? 'font-semibold text-teal-700 ring-1 ring-teal-400 dark:text-teal-300'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-navy-700',
                    ].join(' ')}
                  >
                    {digits(d)}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-navy-700">
              <button
                type="button"
                onClick={selectToday}
                disabled={!todayInRange}
                className="rounded-md px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-40 dark:text-teal-300 dark:hover:bg-teal-900/30"
              >
                {t('today')}
              </button>
              {value && (
                <button
                  type="button"
                  onClick={clearValue}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-navy-700"
                >
                  {t('clear')}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
