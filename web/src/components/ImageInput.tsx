import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';

/**
 * Photo/image upload input — uploads immediately via POST /uploads and stores the
 * returned `/uploads/<filename>` URL as its value (same string contract as the
 * `photoUrl` / `logoUrl` columns). Works standalone or as a CrudPage `type: 'image'` field.
 */
export function ImageInput({
  value,
  onChange,
  disabled,
  accept = 'image/png,image/jpeg,image/webp,image/gif',
  id,
}: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  accept?: string;
  id?: string;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file?: File | null) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.upload<{ url: string }>('/uploads', file);
      if (res?.url) onChange(res.url);
      else setError(t('uploadFailed'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-3">
      {value ? (
        <img
          src={value}
          alt=""
          className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-navy-600"
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 dark:border-navy-600">
          <ImagePlus size={20} />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled || busy}
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-navy-700"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
            {busy ? t('uploading') : value ? t('replaceImage') : t('uploadImage')}
          </button>
          {value && (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => onChange('')}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-400"
            >
              <X size={13} /> {t('remove')}
            </button>
          )}
        </div>
        {error && <span className="text-xs text-red-600">{error}</span>}
        <span className="text-xs text-slate-400">{t('photoHint')}</span>
      </div>
    </div>
  );
}
