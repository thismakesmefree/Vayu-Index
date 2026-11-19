import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Tier 1 Google Maps Platform Demo Key Quota Defense (installed before React renders)
if (typeof window !== 'undefined') {
  const notifyQuotaExceeded = () => {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  };

  (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
    notifyQuotaExceeded();
  };

  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const joined = args.map((a) => String(a ?? '')).join(' ');
    if (
      joined.includes('OverQuotaMapError') ||
      joined.includes('QuotaExceededError') ||
      joined.includes('RESOURCE_EXHAUSTED')
    ) {
      notifyQuotaExceeded();
    }
    origConsoleError.apply(console, args);
  };
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration skipped if blocked in restricted context
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
