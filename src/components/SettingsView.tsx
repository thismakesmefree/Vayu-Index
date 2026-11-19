import React, { useState } from 'react';
import {
  Bell,
  Check,
  KeyRound,
  LocateFixed,
  LogOut,
  Monitor,
  Moon,
  PanelBottom,
  PanelLeft,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Vibrate,
} from 'lucide-react';
import {
  AuthMode,
  DefaultDarkVariant,
  DockOrientation,
  OAuthUser,
  ResolvedTheme,
  ThemeMode,
  UserLocationState,
} from '../types';
import { QuotaStatus } from '../utils/quota';
import { getThemeTokens } from '../utils/theme';
import { PWAInstallButton } from './PWAInstallButton';
import { ScrollRevealCard } from './ScrollRevealCard';
import {
  detectMobileDevice,
  isHapticsEnabled,
  setHapticsEnabled,
  triggerHaptic,
} from '../utils/haptics';
import {
  getNotificationPermissionState,
  NotificationPermissionState,
  requestNotificationPermission,
} from '../utils/notifications';

interface SettingsViewProps {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  defaultDarkVariant: DefaultDarkVariant;
  onChangeThemeMode: (mode: ThemeMode) => void;
  onChangeDefaultDarkVariant: (variant: DefaultDarkVariant) => void;
  dockOrientation: DockOrientation;
  onChangeDockOrientation: (orientation: DockOrientation) => void;
  locationState: UserLocationState;
  onOpenLocationGate: () => void;
  authMode: AuthMode;
  oauthUser: OAuthUser | null;
  customApiKey: string;
  quotaStatus: QuotaStatus;
  onSaveCustomKey: (key: string) => void;
  onClearCustomKey: () => void;
  onOpenOAuth: () => void;
  onSignOut: () => void;
}

const THEME_OPTIONS: {
  id: ThemeMode;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'light', label: 'Light', desc: 'Liquid Glass · Daylight sky backdrop', icon: Sun },
  { id: 'dark', label: 'Dark', desc: 'Liquid Glass · Nocturnal cloudscape', icon: Moon },
  { id: 'oled', label: 'OLED', desc: 'Deep Obsidian Liquid Glass', icon: Sparkles },
  { id: 'auto', label: 'Auto', desc: 'Follows OS + Default Dark', icon: Monitor },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  themeMode,
  resolvedTheme,
  defaultDarkVariant,
  onChangeThemeMode,
  onChangeDefaultDarkVariant,
  dockOrientation,
  onChangeDockOrientation,
  locationState,
  onOpenLocationGate,
  authMode,
  oauthUser,
  customApiKey,
  quotaStatus,
  onSaveCustomKey,
  onClearCustomKey,
  onOpenOAuth,
  onSignOut,
}) => {
  const [keyDraft, setKeyDraft] = useState(customApiKey);
  const [savedNotice, setSavedNotice] = useState(false);
  const [hapticsOn, setHapticsOn] = useState<boolean>(() => isHapticsEnabled());
  const [notifPerm, setNotifPerm] = useState<NotificationPermissionState>(() =>
    getNotificationPermissionState()
  );
  const isMobile = detectMobileDevice();

  const tokens = getThemeTokens(resolvedTheme);

  const handleKeySave = (e: React.FormEvent) => {
    e.preventDefault();
    if (keyDraft.trim().length < 12) return;
    onSaveCustomKey(keyDraft.trim());
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="space-y-6">
      <div className={`border-b pb-4 ${tokens.divider}`}>
        <h1 className={`font-display text-2xl font-bold tracking-tight ${tokens.textPrimary}`}>
          Settings &amp; Session Controls
        </h1>
        <p className={`mt-0.5 text-xs ${tokens.textMuted}`}>
          Configure Light, Dark, OLED &amp; Auto themes, default dark preference, location, API access, and PWA installation
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Theme, Default Dark Variant & Dock Preferences */}
        <div className="lg:col-span-6 space-y-5">
          <ScrollRevealCard immediate>
          <div className={`vayu-glass-panel rounded-2xl border p-5 space-y-4 ${tokens.surface}`}>
            <div>
              <h2 className={`font-display text-base font-semibold ${tokens.textPrimary}`}>
                Liquid Glass Theme Mode (4 Modes)
              </h2>
              <p className={`mt-0.5 text-xs ${tokens.textMuted}`}>
                Cinematic Light ↔ Dark video transitions overlaying refractive Liquid Glass panels
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = themeMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeThemeMode(opt.id)}
                    data-testid={`theme-${opt.id}-btn`}
                    className={`flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                      active
                        ? 'border-[#38BDF8] bg-[#38BDF8]/12'
                        : `${tokens.surfaceSubtle}`
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <Icon className="w-4 h-4 text-[#38BDF8]" />
                      {active && <Check className="w-4 h-4 text-[#38BDF8]" />}
                    </div>
                    <div>
                      <span className={`block text-sm font-semibold ${tokens.textPrimary}`}>
                        {opt.label}
                      </span>
                      <span className={`block text-[11px] ${tokens.textMuted}`}>{opt.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Settings-exclusive toggle for Default Dark Variant (Dark vs OLED) */}
            <div className={`rounded-xl border p-4 space-y-2.5 ${tokens.surfaceSubtle}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className={`text-xs font-semibold ${tokens.textPrimary}`}>
                    Default Dark Appearance (Settings Exclusive)
                  </h3>
                  <p className={`text-[11px] ${tokens.textMuted}`}>
                    Determines whether Auto (system dark) &amp; quick dark toggle use Dark Charcoal or OLED
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeDefaultDarkVariant('dark')}
                  data-testid="default-dark-charcoal-btn"
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    defaultDarkVariant === 'dark'
                      ? 'border-[#38BDF8] bg-[#38BDF8]/15 text-[#38BDF8]'
                      : `${tokens.btnSecondary}`
                  }`}
                >
                  Dark Charcoal (Default)
                </button>
                <button
                  type="button"
                  onClick={() => onChangeDefaultDarkVariant('oled')}
                  data-testid="default-dark-oled-btn"
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    defaultDarkVariant === 'oled'
                      ? 'border-[#38BDF8] bg-[#38BDF8]/15 text-[#38BDF8]'
                      : `${tokens.btnSecondary}`
                  }`}
                >
                  OLED Pitch-Black
                </button>
              </div>
            </div>
          </div>
          </ScrollRevealCard>

          <ScrollRevealCard delay={0.04}>
          <div className={`vayu-glass-panel rounded-2xl border p-5 space-y-4 ${tokens.surface}`}>
            <div>
              <h2 className={`font-display text-base font-semibold ${tokens.textPrimary}`}>
                Floating Pill Toolbar Layout
              </h2>
              <p className={`mt-0.5 text-xs ${tokens.textMuted}`}>
                Morphs smoothly via Framer Motion layout transitions (synced with 6th dock button)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onChangeDockOrientation('vertical')}
                className={`flex items-center gap-2.5 rounded-xl border p-3.5 text-xs font-semibold transition-colors cursor-pointer ${
                  dockOrientation === 'vertical'
                    ? 'border-[#38BDF8] bg-[#38BDF8]/15 text-[#38BDF8]'
                    : `${tokens.btnSecondary}`
                }`}
              >
                <PanelLeft className="w-4 h-4 text-[#38BDF8] shrink-0" />
                <span>Left-Docked Vertical</span>
              </button>

              <button
                type="button"
                onClick={() => onChangeDockOrientation('horizontal')}
                className={`flex items-center gap-2.5 rounded-xl border p-3.5 text-xs font-semibold transition-colors cursor-pointer ${
                  dockOrientation === 'horizontal'
                    ? 'border-[#38BDF8] bg-[#38BDF8]/15 text-[#38BDF8]'
                    : `${tokens.btnSecondary}`
                }`}
              >
                <PanelBottom className="w-4 h-4 text-[#38BDF8] shrink-0" />
                <span>Centered Horizontal</span>
              </button>
            </div>
          </div>
          </ScrollRevealCard>

          <ScrollRevealCard delay={0.08}>
          <div className={`vayu-glass-panel rounded-2xl border p-5 space-y-3 ${tokens.surface}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Smartphone className="w-4 h-4 text-[#38BDF8] shrink-0" />
                <h2 className={`font-display text-base font-semibold ${tokens.textPrimary}`}>
                  Install Progressive Web App
                </h2>
              </div>
              <PWAInstallButton variant="panel" />
            </div>
            <p className={`text-xs ${tokens.textMuted}`}>
              Includes Service Worker precaching, Web App Manifest, and standalone mobile/desktop windowing.
            </p>
          </div>
          </ScrollRevealCard>
        </div>

        {/* Location, Account, OAuth & Quota Management */}
        <div className="lg:col-span-6 space-y-5">
          {/* Location Calibration Card */}
          <ScrollRevealCard immediate delay={0.04}>
          <div className={`vayu-glass-panel rounded-2xl border p-5 space-y-3 ${tokens.surface}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <LocateFixed className="w-4 h-4 text-[#38BDF8] shrink-0" />
                <div>
                  <h2 className={`font-display text-base font-semibold ${tokens.textPrimary}`}>
                    Location Calibration
                  </h2>
                  <p className={`text-xs ${tokens.textMuted}`}>
                    Active: {locationState.label} ({locationState.status === 'granted' ? 'GPS' : 'Manual'})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenLocationGate();
                }}
                className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${tokens.btnSecondary}`}
              >
                Recalibrate Location
              </button>
            </div>
          </div>
          </ScrollRevealCard>

          {/* Mobile Haptics & Notifications Card */}
          <ScrollRevealCard delay={0.06}>
          <div className={`vayu-glass-panel rounded-2xl border p-5 space-y-3.5 ${tokens.surface}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Vibrate className="w-4 h-4 text-[#38BDF8] shrink-0" />
                <div>
                  <h2 className={`font-display text-base font-semibold ${tokens.textPrimary}`}>
                    Mobile Haptics &amp; Background Alerts
                  </h2>
                  <p className={`text-xs ${tokens.textMuted}`}>
                    {isMobile
                      ? 'Mobile touch device detected — tactile feedback active'
                      : 'Triggers automatically on mobile/touch viewports'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hapticsOn}
                data-testid="settings-haptics-toggle"
                onClick={() => {
                  const next = !hapticsOn;
                  setHapticsEnabled(next);
                  setHapticsOn(next);
                  if (next) triggerHaptic('medium');
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  hapticsOn
                    ? 'border-[#38BDF8] bg-[#38BDF8]/15 text-[#38BDF8]'
                    : tokens.btnSecondary
                }`}
              >
                {hapticsOn ? 'Haptics: On' : 'Haptics: Off'}
              </button>
            </div>

            <div className={`flex flex-wrap items-center justify-between gap-3 border-t pt-3 ${tokens.divider}`}>
              <div className="flex items-center gap-2 text-xs">
                <Bell className="w-3.5 h-3.5 text-[#8B5CF6] shrink-0" />
                <span className={tokens.textSecondary}>
                  Route Task Notifications (&gt;100 km):{' '}
                  <strong className={notifPerm === 'granted' ? 'text-emerald-400' : tokens.textPrimary}>
                    {notifPerm === 'granted'
                      ? 'Allowed'
                      : notifPerm === 'denied'
                        ? 'Blocked in Browser'
                        : notifPerm === 'unsupported'
                          ? 'Unsupported'
                          : 'Not Requested'}
                  </strong>
                </span>
              </div>
              {notifPerm !== 'granted' && notifPerm !== 'unsupported' && (
                <button
                  type="button"
                  data-testid="settings-enable-notifications-btn"
                  onClick={async () => {
                    triggerHaptic('medium');
                    const res = await requestNotificationPermission();
                    setNotifPerm(res);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${tokens.btnSecondary}`}
                >
                  Allow Alerts
                </button>
              )}
            </div>
          </div>
          </ScrollRevealCard>

          <ScrollRevealCard delay={0.08}>
          <div className={`vayu-glass-panel rounded-2xl border p-5 space-y-4 ${tokens.surface}`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className={`font-display text-base font-semibold ${tokens.textPrimary}`}>
                Authentication &amp; Access Mode
              </h2>
              <span className={`text-xs font-medium ${tokens.accentText}`}>
                {authMode === 'oauth'
                  ? 'OAuth Active'
                  : authMode === 'guest-key'
                    ? 'Guest · Custom Key'
                    : 'Guest · Free Tier'}
              </span>
            </div>

            {authMode === 'oauth' && oauthUser ? (
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {oauthUser.picture ? (
                      <img
                        src={oauthUser.picture}
                        alt={oauthUser.name}
                        referrerPolicy="no-referrer"
                        className="h-10 w-10 rounded-full object-cover border border-[#38BDF8]/30"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#38BDF8]/20 text-sm font-bold text-[#38BDF8]">
                        {oauthUser.avatarInitials}
                      </div>
                    )}
                    <div>
                      <p className={`text-sm font-semibold ${tokens.textPrimary}`}>{oauthUser.name}</p>
                      <p className={`text-xs ${tokens.textMuted}`}>{oauthUser.email}</p>
                    </div>
                  </div>
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                </div>
                <p className="text-xs text-emerald-500 font-medium">
                  Linked Gemini session attached. Low-Smog Route Planner unlocked.
                </p>
                <button
                  type="button"
                  onClick={onSignOut}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${tokens.btnSecondary}`}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out to Guest Mode</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className={`rounded-xl border p-4 flex items-center justify-between gap-4 ${tokens.surfaceSubtle}`}>
                  <div>
                    <p className={`text-sm font-medium ${tokens.textPrimary}`}>Unlock Low-Smog Route Planner</p>
                    <p className={`text-xs ${tokens.textMuted}`}>
                      Sign in with OAuth for unrestricted AI coaching &amp; green corridor routing
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenOAuth}
                    className="rounded-lg bg-gradient-to-r from-[#38BDF8] to-[#8B5CF6] px-4 py-2 text-xs font-semibold text-[#060609] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Sign in with OAuth
                  </button>
                </div>

                {authMode === 'guest-free' && (
                  <div className={`rounded-xl border p-4 space-y-2 ${tokens.surfaceSubtle}`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className={tokens.textSecondary}>Free Tier Daily Quota</span>
                      <span className={`font-mono-tabular font-semibold ${tokens.accentText}`}>
                        {quotaStatus.remaining} / {quotaStatus.limit} left today
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-500/20">
                      <div
                        className="h-full rounded-full bg-[#38BDF8] transition-all"
                        style={{
                          width: `${(quotaStatus.remaining / quotaStatus.limit) * 100}%`,
                        }}
                      />
                    </div>
                    <p className={`text-[11px] ${tokens.textMuted}`}>
                      Resets automatically at 00:00 local time ({quotaStatus.dateKey}).
                    </p>
                  </div>
                )}

                <form onSubmit={handleKeySave} className={`space-y-3 border-t pt-4 ${tokens.divider}`}>
                  <label htmlFor="settings-gemini-key" className={`block text-xs font-medium ${tokens.textSecondary}`}>
                    Personal Gemini API Key (Guest Unrestricted Mode)
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <KeyRound className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${tokens.textMuted}`} />
                      <input
                        id="settings-gemini-key"
                        type="password"
                        value={keyDraft}
                        onChange={(e) => setKeyDraft(e.target.value)}
                        placeholder="AIzaSy..."
                        className={`h-10 w-full rounded-lg border pl-9 pr-3 text-xs focus:border-[#38BDF8] focus:outline-none ${tokens.input}`}
                      />
                    </div>
                    <button
                      type="submit"
                      className={`rounded-lg border px-4 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${tokens.btnSecondary}`}
                    >
                      {savedNotice ? 'Saved' : 'Save Key'}
                    </button>
                    {customApiKey && (
                      <button
                        type="button"
                        onClick={() => {
                          setKeyDraft('');
                          onClearCustomKey();
                        }}
                        aria-label="Remove saved Gemini API key"
                        className="rounded-lg border border-red-400/25 bg-red-500/10 hover:bg-red-500/20 px-3 text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )}
          </div>
          </ScrollRevealCard>
        </div>
      </div>
    </div>
  );
};
