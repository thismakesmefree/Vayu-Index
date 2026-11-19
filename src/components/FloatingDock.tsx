import React from 'react';
import { motion } from 'motion/react';
import {
  BarChart3,
  LayoutDashboard,
  Map as MapIcon,
  RectangleHorizontal,
  RectangleVertical,
  Settings,
} from 'lucide-react';
import { AppRoute, DockOrientation, ResolvedTheme } from '../types';
import { triggerHaptic } from '../utils/haptics';

interface FloatingDockProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  orientation: DockOrientation;
  onToggleOrientation: () => void;
  resolvedTheme: ResolvedTheme;
  isHidden?: boolean;
}

const GeminiLogoIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={`w-5 h-5 transition-transform duration-200 ${active ? 'scale-110' : ''}`}
    aria-hidden="true"
  >
    <path
      d="M12 2.25C12.35 7.45 16.55 11.65 21.75 12C16.55 12.35 12.35 16.55 12 21.75C11.65 16.55 7.45 12.35 2.25 12C7.45 11.65 11.65 7.45 12 2.25Z"
      fill={active ? 'url(#geminiDockGrad)' : 'currentColor'}
    />
    <defs>
      <linearGradient id="geminiDockGrad" x1="2.25" y1="2.25" x2="21.75" y2="21.75" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="100%" stopColor="#8B5CF6" />
      </linearGradient>
    </defs>
  </svg>
);

const NAV_ITEMS: { id: Exclude<AppRoute, 'landing'>; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'ai', label: 'AI Coach' },
  { id: 'map', label: 'Map View' },
  { id: 'stats', label: 'Statistics' },
  { id: 'settings', label: 'Settings' },
];

export const FloatingDock: React.FC<FloatingDockProps> = ({
  activeRoute,
  onNavigate,
  orientation,
  onToggleOrientation,
  resolvedTheme,
  isHidden = false,
}) => {
  const isVertical = orientation === 'vertical';
  const isLight = resolvedTheme === 'light';

  const surfaceClass =
    resolvedTheme === 'light'
      ? 'bg-white/84 border-white/90 shadow-[0_20px_48px_-12px_rgba(15,23,42,0.26)]'
      : resolvedTheme === 'oled'
        ? 'bg-[#03050c]/92 border-white/24 shadow-[0_22px_52px_-12px_rgba(0,0,0,0.92)]'
        : 'bg-[#091129]/84 border-white/28 shadow-[0_22px_52px_-12px_rgba(2,6,23,0.78)]';

  const renderIcon = (id: Exclude<AppRoute, 'landing'>, active: boolean) => {
    switch (id) {
      case 'dashboard':
        return <LayoutDashboard className="w-5 h-5" />;
      case 'ai':
        return <GeminiLogoIcon active={active} />;
      case 'map':
        return <MapIcon className="w-5 h-5" />;
      case 'stats':
        return <BarChart3 className="w-5 h-5" />;
      case 'settings':
        return <Settings className="w-5 h-5" />;
    }
  };

  return (
    <div
      className={`fixed z-40 pointer-events-none flex ${
        isVertical
          ? 'inset-y-0 left-3 sm:left-5 items-center'
          : 'inset-x-0 bottom-4 sm:bottom-5 justify-center'
      }`}
    >
      <motion.nav
        layout
        data-testid="floating-dock"
        data-dock-hidden={isHidden ? 'true' : 'false'}
        aria-label="Primary Navigation Dock"
        aria-hidden={isHidden}
        initial={false}
        animate={{
          opacity: isHidden ? 0 : 1,
          y: !isVertical && isHidden ? 96 : 0,
          x: isVertical && isHidden ? -88 : 0,
          scale: isHidden ? 0.9 : 1,
        }}
        transition={{
          type: 'spring',
          stiffness: 320,
          damping: 26,
          mass: 0.78,
        }}
        className={`vayu-glass-elevated vayu-gpu flex items-center gap-1 sm:gap-1.5 rounded-full border p-1.5 ${surfaceClass} ${
          isVertical ? 'flex-col' : 'flex-row'
        } ${isHidden ? 'pointer-events-none' : 'pointer-events-auto'}`}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeRoute === item.id;
          return (
            <motion.button
              layout
              key={item.id}
              type="button"
              tabIndex={isHidden ? -1 : 0}
              onClick={() => {
                triggerHaptic('light');
                onNavigate(item.id);
              }}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              title={item.label}
              className={`group relative flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                isActive
                  ? isLight
                    ? 'text-sky-700'
                    : 'text-white'
                  : isLight
                    ? 'text-slate-600 hover:text-slate-950 hover:bg-slate-900/[0.08]'
                    : 'text-[#CBD5E1] hover:text-[#F8FAFC] hover:bg-white/[0.10]'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="dock-active-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className={`absolute inset-0 rounded-full border ${
                    isLight
                      ? 'border-sky-500/45 bg-sky-500/18 shadow-[0_0_16px_-4px_rgba(14,165,233,0.35)]'
                      : 'border-[#38BDF8]/45 bg-[#38BDF8]/18 shadow-[0_0_20px_-4px_rgba(56,189,248,0.45)]'
                  }`}
                />
              )}
              <span className="relative z-10 flex items-center justify-center">
                {renderIcon(item.id, isActive)}
              </span>
              {isActive && (
                <span
                  aria-hidden="true"
                  className={`absolute z-10 h-1 w-1 rounded-full bg-[#38BDF8] ${
                    isVertical ? 'right-1' : 'bottom-1'
                  }`}
                />
              )}
            </motion.button>
          );
        })}

        <motion.div
          layout
          className={
            isVertical
              ? `my-0.5 h-px w-6 ${isLight ? 'bg-slate-900/15' : 'bg-white/15'}`
              : `mx-0.5 h-6 w-px ${isLight ? 'bg-slate-900/15' : 'bg-white/15'}`
          }
          aria-hidden="true"
        />

        {/* 6th Button: Turn Bar Horizontal / Vertical */}
        <motion.button
          layout
          type="button"
          tabIndex={isHidden ? -1 : 0}
          onClick={() => {
            triggerHaptic('medium');
            onToggleOrientation();
          }}
          aria-label={isVertical ? 'Turn Bar Horizontal' : 'Turn Bar Vertical'}
          title={isVertical ? 'Turn Bar Horizontal' : 'Turn Bar Vertical'}
          data-testid="dock-orientation-toggle"
          className={`relative flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
            isLight
              ? 'text-slate-600 hover:text-sky-700 hover:bg-slate-900/[0.08]'
              : 'text-[#CBD5E1] hover:text-[#38BDF8] hover:bg-white/[0.10]'
          }`}
        >
          {isVertical ? (
            <RectangleHorizontal className="w-5 h-5" />
          ) : (
            <RectangleVertical className="w-5 h-5" />
          )}
        </motion.button>
      </motion.nav>
    </div>
  );
};
