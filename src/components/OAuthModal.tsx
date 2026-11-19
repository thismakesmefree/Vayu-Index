import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Check, Copy, KeyRound, ShieldCheck, Sparkles, X } from 'lucide-react';
import { OAuthUser, ResolvedTheme } from '../types';
import { getThemeTokens } from '../utils/theme';

interface OAuthModalProps {
  isOpen: boolean;
  resolvedTheme: ResolvedTheme;
  onClose: () => void;
  onSuccess: (user: OAuthUser) => void;
}

interface AuthStatusResponse {
  configured: boolean;
  redirectUri: string;
  authenticated: boolean;
  user: OAuthUser | null;
}

export const OAuthModal: React.FC<OAuthModalProps> = ({
  isOpen,
  resolvedTheme,
  onClose,
  onSuccess,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusInfo, setStatusInfo] = useState<AuthStatusResponse | null>(null);
  const [copiedUri, setCopiedUri] = useState(false);

  const tokens = getThemeTokens(resolvedTheme);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((data: AuthStatusResponse) => {
        setStatusInfo(data);
        if (data.authenticated && data.user) {
          onSuccess(data.user);
        }
      })
      .catch(() => {
        // ignore preflight fetch error
      });
  }, [isOpen, onSuccess]);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const origin = event.origin;
      if (
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost') &&
        origin !== window.location.origin
      ) {
        return;
      }

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsLoading(true);
        try {
          const res = await fetch('/api/auth/status');
          const data = (await res.json()) as AuthStatusResponse;
          if (data.authenticated && data.user) {
            onSuccess(data.user);
          } else {
            setError('OAuth completed, but the session cookie could not be verified.');
          }
        } catch {
          setError('Unable to verify OAuth session after sign-in.');
        } finally {
          setIsLoading(false);
        }
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setIsLoading(false);
        setError(event.data?.error || 'Google OAuth authorization was cancelled or failed.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSuccess]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/url');
      const data = (await res.json()) as {
        url?: string;
        error?: string;
        missingCredentials?: boolean;
        redirectUri?: string;
      };

      if (!res.ok || !data.url) {
        if (data.redirectUri) {
          setStatusInfo((prev) => ({
            configured: false,
            redirectUri: data.redirectUri!,
            authenticated: prev?.authenticated ?? false,
            user: prev?.user ?? null,
          }));
        }
        throw new Error(data.error || 'OAuth authorization URL could not be created.');
      }

      const popup = window.open(data.url, 'vayu_oauth_popup', 'width=600,height=700');
      if (!popup) {
        throw new Error('Popup was blocked by your browser. Allow popups for this site and try again.');
      }

      const pollTimer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(pollTimer);
          setIsLoading(false);
        }
      }, 500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to start Google OAuth flow.');
      setIsLoading(false);
    }
  };

  const handleCopyRedirectUri = async () => {
    if (!statusInfo?.redirectUri) return;
    try {
      await navigator.clipboard.writeText(statusInfo.redirectUri);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="oauth-modal-title"
          data-testid="oauth-modal"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className={`vayu-glass-elevated w-full max-w-md rounded-2xl border p-6 shadow-2xl ${tokens.surfaceElevated}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wider ${tokens.accentText}`}>
                  Google OAuth 2.0
                </p>
                <h2 id="oauth-modal-title" className={`mt-1 font-display text-xl font-semibold ${tokens.textPrimary}`}>
                  Sign in with your Google Account
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close OAuth modal"
                className={`rounded-lg p-1.5 transition-colors cursor-pointer ${tokens.textMuted}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className={`mt-4 space-y-2.5 rounded-xl border p-3.5 text-xs ${tokens.surfaceSubtle} ${tokens.textSecondary}`}>
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-4 h-4 text-[#38BDF8] shrink-0" />
                <span>Attaches your verified session with linked Gemini AI access</span>
              </div>
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Unlocks Low-Smog Route Planner in Map View with inhaled dose metrics</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-[#8B5CF6] shrink-0" />
                <span>Removes the 10-prompt/day Guest Free Tier limit</span>
              </div>
            </div>

            {statusInfo && !statusInfo.configured && (
              <div
                data-testid="oauth-setup-notice"
                className="mt-4 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-xs space-y-2"
              >
                <div className="flex items-start gap-2 text-amber-500 font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>OAuth Credentials Required</span>
                </div>
                <p className={tokens.textSecondary}>
                  Add <code className="font-mono-tabular">GOOGLE_CLIENT_ID</code> and{' '}
                  <code className="font-mono-tabular">GOOGLE_CLIENT_SECRET</code> in AI Studio Secrets,
                  and register this authorized redirect URI in Google Cloud Console:
                </p>
                <div className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 font-mono-tabular text-[11px] ${tokens.surfaceSubtle} ${tokens.textPrimary}`}>
                  <span className="truncate">{statusInfo.redirectUri}</span>
                  <button
                    type="button"
                    onClick={handleCopyRedirectUri}
                    aria-label="Copy redirect URI"
                    className="shrink-0 text-[#38BDF8] hover:brightness-110 cursor-pointer"
                  >
                    {copiedUri ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p className="mt-3 text-xs text-red-400" role="alert">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                disabled={isLoading}
                onClick={handleGoogleSignIn}
                data-testid="oauth-google-popup-btn"
                className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-slate-300/60 bg-white text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 transition-all disabled:opacity-60 cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                <span>{isLoading ? 'Waiting for Google Sign-In...' : 'Continue with Google'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`h-10 w-full rounded-lg border text-xs font-medium transition-colors cursor-pointer ${tokens.btnSecondary}`}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
