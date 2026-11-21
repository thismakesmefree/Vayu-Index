import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {
  MAPS_AUTH_FAILURE_EVENT,
  MAPS_QUOTA_EXCEEDED_EVENT,
  isMapsQuotaConsoleError,
} from './utils/mapsErrors';

if (typeof window !== 'undefined') {
  const notifyMapsIssue = (eventName: string) => {
    window.dispatchEvent(new CustomEvent(eventName));
  };

  (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
    notifyMapsIssue(MAPS_AUTH_FAILURE_EVENT);
  };

  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const joined = args.map((a) => String(a ?? '')).join(' ');
    if (isMapsQuotaConsoleError(joined)) {
      notifyMapsIssue(MAPS_QUOTA_EXCEEDED_EVENT);
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
