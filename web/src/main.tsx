import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles.css';
import App from './App';
import { I18nProvider } from './lib/i18n';
import { ToastProvider, ErrorBoundary, applyTheme, initialTheme } from './lib/ui';
import { AuthProvider } from './lib/auth';

applyTheme(initialTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
);
