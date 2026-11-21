import React, { useEffect, useState } from 'react';
import { ExternalLink, KeyRound, Sparkles, X } from 'lucide-react';
import { ResolvedTheme } from '../types';
import { getThemeTokens } from '../utils/theme';

interface GeminiApiKeySetupModalProps {
  isOpen: boolean;
  resolvedTheme: ResolvedTheme;
  initialKey: string;
  onClose: () => void;
  onSave: (key: string) => void;
}

export const GeminiApiKeySetupModal: React.FC<GeminiApiKeySetupModalProps> = ({
  isOpen,
  resolvedTheme,
  initialKey,
  onClose,
  onSave,
}) => {
  const [keyDraft, setKeyDraft] = useState(initialKey);
  const [error, setError] = useState<string | null>(null);
  const tokens = getThemeTokens(resolvedTheme);

  useEffect(() => {
    if (isOpen) {
      setKeyDraft(initialKey);
      setError(null);
    }
  }, [isOpen, initialKey]);

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const key = keyDraft.trim();
    if (key.length < 12) {
      setError('Paste a Gemini API key with at least 12 characters.');
      return;
    }
    onSave(key);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="gemini-key-setup-title"
        data-testid="gemini-key-setup-modal"
        className={`vayu-glass-panel w-full max-w-lg rounded-2xl border p-5 shadow-2xl sm:p-6 ${tokens.surface}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#38BDF8]/30 bg-[#38BDF8]/10 text-[#38BDF8]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 id="gemini-key-setup-title" className={`font-display text-lg font-semibold ${tokens.textPrimary}`}>
                Set up your Gemini API key
              </h2>
              <p className={`mt-1 text-xs leading-relaxed ${tokens.textMuted}`}>
                Vayu uses your key for AI requests. It stays in this browser and is not shared with other users.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close API key setup"
            className={`rounded-lg border p-2 cursor-pointer ${tokens.btnSecondary}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ol className={`mt-5 space-y-2.5 text-sm ${tokens.textSecondary}`}>
          <li><span className="mr-2 font-semibold text-[#38BDF8]">1.</span>Open Google AI Studio using the official link below.</li>
          <li><span className="mr-2 font-semibold text-[#38BDF8]">2.</span>Sign in to Google on Google AI Studio; Vayu does not use Google sign-in.</li>
          <li><span className="mr-2 font-semibold text-[#38BDF8]">3.</span>Choose <strong>Create API key</strong> and select or create a Google Cloud project.</li>
          <li><span className="mr-2 font-semibold text-[#38BDF8]">4.</span>Copy your key and paste it here.</li>
        </ol>

        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#38BDF8]/35 bg-[#38BDF8]/10 px-3.5 py-2 text-sm font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/15"
        >
          <span>Go to Google AI Studio API keys</span>
          <ExternalLink className="h-4 w-4" />
        </a>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label htmlFor="gemini-setup-api-key" className={`block text-xs font-medium ${tokens.textSecondary}`}>
            Your Gemini API key
          </label>
          <div className="relative">
            <KeyRound className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${tokens.textMuted}`} />
            <input
              id="gemini-setup-api-key"
              type="password"
              autoComplete="off"
              value={keyDraft}
              onChange={(event) => {
                setKeyDraft(event.target.value);
                setError(null);
              }}
              placeholder="Paste your API key"
              aria-invalid={Boolean(error)}
              className={`h-11 w-full rounded-lg border pl-9 pr-3 text-sm focus:border-[#38BDF8] focus:outline-none ${tokens.input}`}
            />
          </div>
          {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg border px-4 py-2 text-sm font-medium cursor-pointer ${tokens.btnSecondary}`}
            >
              Not now
            </button>
            <button
              type="submit"
              className="rounded-lg bg-gradient-to-r from-[#38BDF8] to-[#8B5CF6] px-4 py-2 text-sm font-semibold text-[#060609] cursor-pointer"
            >
              Save &amp; continue
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
