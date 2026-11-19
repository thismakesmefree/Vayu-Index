import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Leaf, RotateCcw, Send, Shield, Sparkles, Wind } from 'lucide-react';
import { AuthMode, ChatMessage, ResolvedTheme } from '../types';
import { CityTelemetry } from '../utils/airQuality';
import { QuotaStatus } from '../utils/quota';
import { getThemeTokens } from '../utils/theme';
import { triggerHaptic } from '../utils/haptics';
import { ScrollRevealCard } from './ScrollRevealCard';

interface AIChatViewProps {
  resolvedTheme: ResolvedTheme;
  city: CityTelemetry;
  authMode: AuthMode;
  customApiKey: string;
  quotaStatus: QuotaStatus;
  onConsumeQuota: () => boolean;
  onOpenOAuth: () => void;
  onGoToSettings: () => void;
  initialPrompt?: string | null;
  onClearInitialPrompt?: () => void;
}

const MAIN_STARTER_PROMPT =
  'Suggest low-emission daily routines, indoor air quality hacks, and sustainable alternatives tailored to my location and lifestyle, while clearly explaining the direct impact of my choices.';

const QUICK_SPLIT_CHIPS = [
  {
    id: 'routines',
    label: 'Routines',
    icon: Wind,
    prompt:
      'Design a low-emission winter daily routine for my city, including safe outdoor timing, transit shifts, and quantified PM2.5 inhalation & CO2e savings.',
  },
  {
    id: 'iaq',
    label: 'IAQ Hacks',
    icon: Shield,
    prompt:
      'Give me 4 practical indoor air quality hacks for sealing winter smog, DIY Corsi-Rosenthal/HEPA placement, and cooking ventilation with quantified indoor PM2.5 reduction.',
  },
  {
    id: 'sustainable',
    label: 'Sustainable Alternatives',
    icon: Leaf,
    prompt:
      'Recommend sustainable heating, commuting, and lifestyle alternatives during winter thermal inversions, quantifying the exact grams of CO2e and NOx avoided.',
  },
];

export const AIChatView: React.FC<AIChatViewProps> = ({
  resolvedTheme,
  city,
  authMode,
  customApiKey,
  quotaStatus,
  onConsumeQuota,
  onOpenOAuth,
  onGoToSettings,
  initialPrompt,
  onClearInitialPrompt,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [promptsDismissed, setPromptsDismissed] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<'gemini-3.8-flash' | 'gemini-3.5-flash-lite'>(
    'gemini-3.8-flash'
  );
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const consumedInitialPromptRef = useRef<string | null>(null);

  const tokens = getThemeTokens(resolvedTheme);
  const isFreeTier = authMode === 'guest-free';
  const showStarterPrompts = !promptsDismissed && inputValue.length === 0;

  useEffect(() => {
    if (initialPrompt && initialPrompt !== consumedInitialPromptRef.current) {
      consumedInitialPromptRef.current = initialPrompt;
      setInputValue(initialPrompt);
      setPromptsDismissed(true);
      onClearInitialPrompt?.();
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [initialPrompt, onClearInitialPrompt]);

  const sendPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || isSending) return;

    triggerHaptic('light');
    setPromptsDismissed(true);
    setQuotaError(null);

    if (isFreeTier && quotaStatus.isExhausted) {
      setQuotaError(
        'Daily Free Tier limit (10/10 prompts) reached. Enter your personal Gemini API key or sign in with OAuth to continue.'
      );
      return;
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInputValue('');
    setIsSending(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
          location: `${city.name}, ${city.region}`,
          aqi: city.compositeAqi,
          pm25: city.pollutants[0]?.value ?? 0,
          temperatureC: city.temperatureC,
          windKmh: city.windKmh,
          userApiKey: authMode === 'guest-key' ? customApiKey : undefined,
          authMode,
          model: selectedModel,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.text) {
        throw new Error(data.error || 'Failed to reach Vayu AI model.');
      }

      if (isFreeTier) {
        onConsumeQuota();
      }

      const aiMsg: ChatMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        text: data.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: unknown) {
      const errText = err instanceof Error ? err.message : 'Unable to complete AI request.';
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        text: errText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (!promptsDismissed && val.length > 0) {
      setPromptsDismissed(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt(inputValue);
    }
  };

  const handleResetSession = () => {
    setMessages([]);
    setInputValue('');
    setPromptsDismissed(false);
    setQuotaError(null);
    inputRef.current?.focus();
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-5">
      {/* Top context & quota bar */}
      <div className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 ${tokens.divider}`}>
        <div>
          <h1 className={`font-display text-2xl font-bold tracking-tight flex items-center gap-2.5 ${tokens.textPrimary}`}>
            <Sparkles className="w-5 h-5 text-[#38BDF8]" />
            <span>Vayu Winter Smog AI</span>
          </h1>
          <p className={`mt-0.5 text-xs ${tokens.textMuted}`}>
            Context: {city.name} · AQI {city.compositeAqi} · PM2.5 {city.pollutants[0].value} µg/m³ · {selectedModel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className={`inline-flex items-center rounded-lg border p-0.5 text-[11px] font-medium ${tokens.surfaceSubtle}`}
            role="group"
            aria-label="Select Gemini model"
          >
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setSelectedModel('gemini-3.8-flash');
              }}
              data-testid="model-38-flash-btn"
              className={`rounded-md px-2.5 py-1 transition-colors cursor-pointer ${
                selectedModel === 'gemini-3.8-flash'
                  ? 'bg-[#38BDF8] text-[#060609] font-semibold'
                  : tokens.textMuted
              }`}
            >
              3.8 Flash
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setSelectedModel('gemini-3.5-flash-lite');
              }}
              data-testid="model-35-lite-btn"
              className={`rounded-md px-2.5 py-1 transition-colors cursor-pointer ${
                selectedModel === 'gemini-3.5-flash-lite'
                  ? 'bg-[#38BDF8] text-[#060609] font-semibold'
                  : tokens.textMuted
              }`}
            >
              3.5 Flash Lite
            </button>
          </div>
          {isFreeTier ? (
            <span
              data-testid="ai-quota-badge"
              className={`rounded-full border px-3 py-1 font-mono-tabular text-xs font-semibold ${
                quotaStatus.isExhausted
                  ? 'border-red-400/40 bg-red-500/15 text-red-400'
                  : 'border-[#38BDF8]/35 bg-[#38BDF8]/10 text-[#38BDF8]'
              }`}
            >
              {quotaStatus.remaining} / {quotaStatus.limit} free prompts left
            </span>
          ) : (
            <span
              data-testid="ai-quota-badge"
              className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-500"
            >
              {authMode === 'oauth' ? 'OAuth Session · Unrestricted' : 'Custom Key · Unrestricted'}
            </span>
          )}

          <button
            type="button"
            onClick={handleResetSession}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${tokens.btnSecondary}`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Session</span>
          </button>
        </div>
      </div>

      {/* Message stream */}
      <ScrollRevealCard immediate className="flex-1 flex flex-col">
      <div
        className={`vayu-glass-panel flex-1 rounded-2xl border p-5 overflow-y-auto space-y-4 min-h-[280px] max-h-[52vh] ${tokens.surface}`}
      >
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#38BDF8]/30 bg-[#38BDF8]/10 text-[#38BDF8]">
              <Sparkles className="w-6 h-6" />
            </div>
            <h2 className={`mt-4 font-display text-lg font-semibold ${tokens.textPrimary}`}>
              Quantified Smog Resilience Coaching
            </h2>
            <p className={`mt-1.5 max-w-md text-sm ${tokens.textSecondary}`}>
              Ask about daily winter routines, indoor filtration strategies, or commute swaps—each
              recommendation quantifies inhaled PM2.5 and CO₂e emission impact.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap border ${
                  msg.role === 'user'
                    ? `bg-[#38BDF8]/18 border-[#38BDF8]/35 ${tokens.textPrimary}`
                    : msg.isError
                      ? 'bg-red-500/15 border-red-400/35 text-red-400'
                      : `${tokens.surfaceSubtle} ${tokens.textPrimary}`
                }`}
              >
                {msg.text}
                <div className={`mt-1.5 text-[10px] font-mono-tabular ${tokens.textMuted}`}>
                  {msg.timestamp}
                </div>
              </div>
            </div>
          ))
        )}

        {isSending && (
          <div className="flex justify-start">
            <div className={`rounded-2xl border px-4 py-3 text-xs ${tokens.surfaceSubtle} ${tokens.textSecondary}`}>
              Analyzing {city.name} telemetry &amp; generating quantified guidance...
            </div>
          </div>
        )}
      </div>
      </ScrollRevealCard>

      {quotaError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/35 bg-amber-500/15 px-4 py-3 text-xs text-amber-400"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{quotaError}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onGoToSettings}
              className={`rounded-lg border px-3 py-1.5 font-medium cursor-pointer ${tokens.btnSecondary}`}
            >
              Add API Key
            </button>
            <button
              type="button"
              onClick={onOpenOAuth}
              className="rounded-lg bg-[#38BDF8] px-3 py-1.5 font-semibold text-[#060609] hover:bg-[#7BD0FF] cursor-pointer"
            >
              OAuth Sign-In
            </button>
          </div>
        </div>
      )}

      {/* Chat Composer Container with Embedded Dismissible Starter Prompts */}
      <ScrollRevealCard delay={0.04}>
      <div className={`vayu-glass-elevated rounded-2xl border p-4 ${tokens.surfaceElevated}`}>
        <AnimatePresence initial={false}>
          {showStarterPrompts && (
            <motion.div
              key="embedded-starter-prompts"
              data-testid="starter-prompts-container"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0, y: 6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className={`mb-3 space-y-2.5 border-b pb-3 ${tokens.divider}`}>
                <button
                  type="button"
                  onClick={() => sendPrompt(MAIN_STARTER_PROMPT)}
                  data-testid="main-starter-prompt-btn"
                  className={`w-full rounded-xl border hover:border-[#38BDF8]/45 hover:bg-[#38BDF8]/10 px-3.5 py-2.5 text-left text-xs leading-relaxed transition-colors cursor-pointer ${tokens.surfaceSubtle} ${tokens.textPrimary}`}
                >
                  {MAIN_STARTER_PROMPT}
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  {QUICK_SPLIT_CHIPS.map((chip) => {
                    const Icon = chip.icon;
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => sendPrompt(chip.prompt)}
                        data-testid={`starter-chip-${chip.id}`}
                        className={`inline-flex items-center gap-1.5 rounded-full border hover:border-[#38BDF8] hover:bg-[#38BDF8]/15 px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${tokens.btnSecondary}`}
                      >
                        <Icon className="w-3.5 h-3.5 text-[#38BDF8]" />
                        <span>{chip.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-3">
          <label htmlFor="ai-chat-input" className="sr-only">
            Ask Vayu AI about winter smog navigation
          </label>
          <textarea
            id="ai-chat-input"
            ref={inputRef}
            rows={2}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={`Ask about ${city.name} smog routines, indoor air hacks, or emission impact...`}
            className={`flex-1 resize-none rounded-xl border px-3.5 py-2.5 text-sm focus:border-[#38BDF8] focus:outline-none ${tokens.input}`}
          />
          <button
            type="button"
            disabled={isSending || !inputValue.trim()}
            onClick={() => sendPrompt(inputValue)}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#8B5CF6] text-[#060609] shadow-[0_0_20px_-4px_rgba(56,189,248,0.4)] hover:brightness-110 transition-all disabled:opacity-40 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
      </ScrollRevealCard>
    </div>
  );
};
