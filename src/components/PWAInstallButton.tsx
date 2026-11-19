import React, { useState } from 'react';
import { Download, CheckCircle2, Smartphone, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'panel';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled && variant === 'compact') {
    return null;
  }

  if (isInstalled && variant === 'panel') {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>Installed as standalone PWA</span>
      </div>
    );
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          variant === 'panel'
            ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-900/15 bg-slate-900/[0.05] hover:bg-slate-900/[0.1] text-slate-900 dark:border-white/15 dark:bg-white/[0.06] dark:hover:bg-white/[0.11] dark:text-[#F8FAFC] px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer'
            : 'inline-flex items-center gap-1 sm:gap-1.5 rounded-full border border-slate-900/15 bg-slate-900/[0.05] hover:bg-slate-900/[0.1] text-slate-800 dark:border-white/15 dark:bg-white/[0.05] dark:hover:bg-white/[0.1] dark:text-[#E3E2E7] px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer'
        }
      >
        <Download className="w-3.5 h-3.5 text-[#0284C7] dark:text-[#38BDF8] shrink-0" />
        <span className={variant === 'panel' ? '' : 'hidden sm:inline'}>
          {isIOS ? 'Install on iOS' : 'Install App'}
        </span>
        {variant === 'compact' && <span className="sm:hidden">Install</span>}
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#14151B]/95 p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-5 h-5 text-[#38BDF8]" />
                <h3 id="pwa-install-guide-title" className="text-base font-semibold text-[#F8FAFC]">
                  Install Vayu Index PWA
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {isIOS ? (
              <ol className="mt-4 space-y-2.5 text-sm text-[#BDC8D1] leading-relaxed">
                <li>1. Tap the <strong className="text-white">Share</strong> button in Safari&apos;s toolbar.</li>
                <li>2. Scroll down and select <strong className="text-white">Add to Home Screen</strong>.</li>
                <li>3. Launch Vayu Index directly from your home screen in standalone mode.</li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2.5 text-sm text-[#BDC8D1] leading-relaxed">
                <li>1. Open your browser&apos;s address bar install icon or menu.</li>
                <li>2. Select <strong className="text-white">Install Vayu Index</strong> or <strong className="text-white">Add to Home Screen</strong>.</li>
                <li>3. Offline telemetry caching and instant launch are preconfigured via Service Worker.</li>
              </ol>
            )}
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-lg bg-[#38BDF8] py-2.5 text-sm font-semibold text-[#060609] hover:bg-[#7BD0FF] transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/20 backdrop-blur-md px-3.5 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-200 shadow-lg"
    >
      <span>Offline Mode · Cached Telemetry Active</span>
    </div>
  );
};
