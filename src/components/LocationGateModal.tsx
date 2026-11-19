import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Loader2, LocateFixed, MapPin, Navigation, Search, ShieldAlert } from 'lucide-react';
import { LocationSearchResult, ResolvedTheme, UserLocationState } from '../types';
import { triggerHaptic } from '../utils/haptics';
import {
  getNotificationPermissionState,
  NotificationPermissionState,
  requestNotificationPermission,
} from '../utils/notifications';
import { getThemeTokens } from '../utils/theme';
import {
  parseCoordinateInput,
  reverseGeocodeCoords,
  searchGlobalLocations,
} from '../utils/location';

interface LocationGateModalProps {
  isOpen: boolean;
  resolvedTheme: ResolvedTheme;
  canDismiss: boolean;
  onClose: () => void;
  onConfirmLocation: (nextState: UserLocationState) => void;
}

export const LocationGateModal: React.FC<LocationGateModalProps> = ({
  isOpen,
  resolvedTheme,
  canDismiss,
  onClose,
  onConfirmLocation,
}) => {
  const [step, setStep] = useState<'prompt' | 'manual'>('prompt');
  const [isDetecting, setIsDetecting] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<LocationSearchResult | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [enableNotifications, setEnableNotifications] = useState<boolean>(true);
  const [notifPerm, setNotifPerm] = useState<NotificationPermissionState>(() =>
    getNotificationPermissionState()
  );

  const tokens = getThemeTokens(resolvedTheme);

  useEffect(() => {
    if (!isOpen) return;
    setStep('prompt');
    setManualError(null);
    setGeoMessage(null);
    setNotifPerm(getNotificationPermissionState());
  }, [isOpen]);

  useEffect(() => {
    if (step !== 'manual') return;
    const trimmed = manualInput.trim();
    if (trimmed.length < 2 || parseCoordinateInput(trimmed)) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    if (selectedResult && selectedResult.displayLabel === trimmed) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchGlobalLocations(trimmed);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [manualInput, step, selectedResult]);

  const maybeRequestNotifications = async () => {
    if (!enableNotifications) return;
    const state = getNotificationPermissionState();
    if (state === 'default') {
      const next = await requestNotificationPermission();
      setNotifPerm(next);
    }
  };

  const handleRequestGeolocation = async () => {
    triggerHaptic('medium');
    await maybeRequestNotifications();

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoMessage('Geolocation is unavailable in this browser. Please search and select your location manually.');
      setStep('manual');
      return;
    }

    setIsDetecting(true);
    setGeoMessage(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const resolved = await reverseGeocodeCoords(latitude, longitude);
        setIsDetecting(false);
        triggerHaptic('success');
        onConfirmLocation({
          status: 'granted',
          label: resolved.label,
          region: resolved.region,
          country: resolved.country,
          coords: { lat: latitude, lon: longitude },
          source: 'gps',
        });
      },
      () => {
        setIsDetecting(false);
        triggerHaptic('warning');
        setGeoMessage(
          'Location permission was declined or unavailable. Enter your city, town, or coordinates manually to load live telemetry.'
        );
        setStep('manual');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  };

  const handleDeclineLocation = () => {
    triggerHaptic('light');
    setGeoMessage('Location access declined. Search and select your real city or enter coordinates manually to continue.');
    setStep('manual');
  };

  const confirmSearchResult = async (item: LocationSearchResult) => {
    triggerHaptic('success');
    await maybeRequestNotifications();
    const region = [item.admin1, item.country].filter(Boolean).join(', ') || 'Global Telemetry';
    onConfirmLocation({
      status: 'manual',
      label: item.name,
      region,
      country: item.country,
      timezone: item.timezone,
      coords: { lat: item.lat, lon: item.lon },
      source: 'search',
    });
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualInput.trim();
    if (trimmed.length < 2) {
      triggerHaptic('warning');
      setManualError('Enter your city, town, postal region, or latitude, longitude coordinates.');
      return;
    }

    await maybeRequestNotifications();

    const parsedCoords = parseCoordinateInput(trimmed);
    if (parsedCoords) {
      setManualError(null);
      setIsSearching(true);
      const rev = await reverseGeocodeCoords(parsedCoords.lat, parsedCoords.lon);
      setIsSearching(false);
      triggerHaptic('success');
      onConfirmLocation({
        status: 'manual',
        label: rev.label,
        region: rev.region,
        country: rev.country,
        coords: parsedCoords,
        source: 'coords',
      });
      return;
    }

    if (selectedResult && selectedResult.displayLabel === trimmed) {
      await confirmSearchResult(selectedResult);
      return;
    }

    setManualError(null);
    setIsSearching(true);
    try {
      const results = searchResults.length > 0 ? searchResults : await searchGlobalLocations(trimmed);
      if (results.length === 0) {
        triggerHaptic('warning');
        setManualError('No matching location found. Try a nearby city name or enter lat, lon (e.g. 35.68, 139.76).');
        setIsSearching(false);
        return;
      }
      setIsSearching(false);
      await confirmSearchResult(results[0]);
    } catch {
      setIsSearching(false);
      triggerHaptic('warning');
      setManualError('Location lookup failed. Check your connection or enter lat, lon coordinates.');
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
          aria-labelledby="location-gate-title"
          data-testid="location-gate-modal"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            className={`vayu-glass-elevated w-full max-w-md rounded-2xl border p-6 ${tokens.surfaceElevated}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#38BDF8]/30 bg-[#38BDF8]/15 text-[#38BDF8]">
                  <LocateFixed className="w-5 h-5" />
                </div>
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wider ${tokens.accentText}`}>
                    Location &amp; Route Alerts
                  </p>
                  <h2 id="location-gate-title" className={`font-display text-lg font-bold ${tokens.textPrimary}`}>
                    {step === 'prompt' ? 'Allow Location & Notifications?' : 'Select Your Location'}
                  </h2>
                </div>
              </div>
              {canDismiss && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onClose();
                  }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium ${tokens.btnSecondary} border cursor-pointer`}
                >
                  Close
                </button>
              )}
            </div>

            {step === 'prompt' ? (
              <div className="mt-5 space-y-4">
                <p className={`text-sm leading-relaxed ${tokens.textSecondary}`}>
                  Vayu Index never assumes your location. Share device coordinates for live AQI,
                  meteorology, and maps—and enable notifications so &gt;100 km Gemini background
                  route tasks alert you when ready.
                </p>

                <div className={`rounded-xl border p-3.5 text-xs space-y-2.5 ${tokens.surfaceSubtle} ${tokens.textSecondary}`}>
                  <div className="flex items-start gap-2">
                    <Navigation className="w-4 h-4 text-[#38BDF8] shrink-0 mt-0.5" />
                    <span>
                      If you decline GPS access, you can search and choose your city or coordinates manually.
                    </span>
                  </div>

                  {notifPerm !== 'unsupported' && (
                    <label
                      htmlFor="gate-notif-checkbox"
                      className={`flex items-start gap-2.5 border-t pt-2.5 cursor-pointer ${tokens.divider}`}
                    >
                      <input
                        id="gate-notif-checkbox"
                        type="checkbox"
                        data-testid="location-notif-toggle"
                        checked={enableNotifications}
                        onChange={(e) => {
                          triggerHaptic('light');
                          setEnableNotifications(e.target.checked);
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-slate-500 accent-[#38BDF8]"
                      />
                      <span className="flex-1">
                        <span className={`font-semibold flex items-center gap-1.5 ${tokens.textPrimary}`}>
                          <Bell className="w-3.5 h-3.5 text-[#38BDF8]" />
                          Route &amp; Storm Notifications
                          {notifPerm === 'granted' && (
                            <span className="text-[10px] text-emerald-400 font-semibold">(Active)</span>
                          )}
                        </span>
                        <span className={`block mt-0.5 text-[11px] ${tokens.textMuted}`}>
                          Notifies you when background Gemini long-range (&gt;100 km) route plans finish.
                        </span>
                      </span>
                    </label>
                  )}
                </div>

                <div className="flex flex-col gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={isDetecting}
                    onClick={handleRequestGeolocation}
                    data-testid="location-allow-btn"
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#38BDF8] to-[#8B5CF6] text-sm font-semibold text-[#060609] shadow-[0_0_24px_-4px_rgba(56,189,248,0.4)] hover:brightness-110 transition-all disabled:opacity-60 cursor-pointer"
                  >
                    {isDetecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
                    <span>
                      {isDetecting
                        ? 'Resolving Coordinates...'
                        : enableNotifications && notifPerm === 'default'
                          ? 'Allow Location & Notifications'
                          : 'Allow Location Access'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isDetecting}
                    onClick={handleDeclineLocation}
                    data-testid="location-decline-btn"
                    className={`flex h-10 w-full items-center justify-center rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${tokens.btnSecondary}`}
                  >
                    Don&apos;t Allow — Enter Location Manually
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleManualSubmit} className="mt-5 space-y-4" data-testid="location-manual-form">
                {geoMessage && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{geoMessage}</span>
                  </div>
                )}

                <div>
                  <label htmlFor="manual-location-input" className={`block text-xs font-semibold mb-1.5 ${tokens.textSecondary}`}>
                    Search City, Town, or Coordinates (Required)
                  </label>
                  <div className="relative">
                    <Search className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${tokens.textMuted}`} />
                    <input
                      id="manual-location-input"
                      data-testid="manual-location-input"
                      type="text"
                      value={manualInput}
                      onChange={(e) => {
                        setManualInput(e.target.value);
                        setSelectedResult(null);
                        if (manualError) setManualError(null);
                      }}
                      placeholder="Search any city worldwide or enter lat, lon..."
                      autoFocus
                      className={`h-11 w-full rounded-lg border pl-9 pr-9 text-sm focus:border-[#38BDF8] focus:outline-none ${tokens.input}`}
                    />
                    {isSearching && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[#38BDF8]" />
                    )}
                  </div>

                  {searchResults.length > 0 && (
                    <ul
                      data-testid="location-search-results"
                      className={`mt-2 max-h-48 overflow-y-auto rounded-xl border divide-y ${tokens.surfaceSubtle} ${tokens.divider}`}
                    >
                      {searchResults.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => confirmSearchResult(item)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs hover:bg-[#38BDF8]/10 transition-colors cursor-pointer"
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <MapPin className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                              <span className={`truncate font-medium ${tokens.textPrimary}`}>
                                {item.displayLabel}
                              </span>
                            </span>
                            <span className={`font-mono-tabular text-[10px] shrink-0 ${tokens.textMuted}`}>
                              {item.lat.toFixed(2)}°, {item.lon.toFixed(2)}°
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {manualError && (
                    <p className="mt-1.5 text-xs text-red-400" role="alert">
                      {manualError}
                    </p>
                  )}
                </div>

                {notifPerm === 'default' && (
                  <label
                    htmlFor="manual-notif-checkbox"
                    className={`flex items-center gap-2.5 rounded-xl border p-3 text-xs cursor-pointer ${tokens.surfaceSubtle} ${tokens.textSecondary}`}
                  >
                    <input
                      id="manual-notif-checkbox"
                      type="checkbox"
                      checked={enableNotifications}
                      onChange={(e) => {
                        triggerHaptic('light');
                        setEnableNotifications(e.target.checked);
                      }}
                      className="h-4 w-4 rounded border-slate-500 accent-[#38BDF8]"
                    />
                    <Bell className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                    <span>Also allow notifications for &gt;100 km background route completions</span>
                  </label>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setStep('prompt');
                    }}
                    className={`h-11 rounded-lg border px-4 text-xs font-medium transition-colors cursor-pointer ${tokens.btnSecondary}`}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSearching}
                    data-testid="manual-location-submit"
                    className="flex h-11 flex-1 items-center justify-center rounded-lg bg-gradient-to-r from-[#38BDF8] to-[#8B5CF6] text-sm font-semibold text-[#060609] hover:brightness-110 transition-all disabled:opacity-60 cursor-pointer"
                  >
                    {isSearching ? 'Resolving Location...' : 'Confirm Location & Load Telemetry'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
