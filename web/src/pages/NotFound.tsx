import { useNavigate } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { useAuth, ROLE_HOME } from '../lib/auth';
import { Button } from '../lib/ui';

export default function NotFound() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <p className="text-6xl font-black text-navy-200 dark:text-navy-700">404</p>
        <h2 className="mt-3 text-lg font-bold text-navy-800 dark:text-white">{t('notFound')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('notFoundSub')}</p>
        <Button className="mt-4" onClick={() => navigate(user ? ROLE_HOME[user.role] ?? '/' : '/login')}>
          {t('goHome')}
        </Button>
      </div>
    </div>
  );
}
