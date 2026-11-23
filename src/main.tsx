import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/syne/600.css';
import '@fontsource/syne/700.css';
import '@fontsource/syne/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary';
import './index.css';

if (typeof window !== 'undefined') {
  const gmpWindow = window as Window & { gm_authFailure?: () => void };
  gmpWindow.gm_authFailure = () => {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  };

  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    origConsoleError.apply(console, args);
    const msg = args.map(a => String(a)).join(' ');
    if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  };
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      if (import.meta.env.DEV) {
        registration.unregister().catch(() => {});
      } else {
        registration.update().catch(() => {});
      }
    }
  }).catch(() => {
    // Ignore SW check errors
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary level="root">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

