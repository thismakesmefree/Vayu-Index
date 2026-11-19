import React, { useEffect, useRef, useState } from 'react';
import { ResolvedTheme } from '../types';
import {
  getThemeTransitionDirection,
  THEME_MEDIA_ASSETS,
  ThemeTransitionDirection,
} from '../utils/theme';

interface AtmosphericBackgroundProps {
  resolvedTheme: ResolvedTheme;
  ambientGlow: string;
}

export const AtmosphericBackground: React.FC<AtmosphericBackgroundProps> = ({
  resolvedTheme,
  ambientGlow,
}) => {
  const prevThemeRef = useRef<ResolvedTheme>(resolvedTheme);
  const [displayedTheme, setDisplayedTheme] = useState<ResolvedTheme>(resolvedTheme);
  const [activeTransition, setActiveTransition] = useState<ThemeTransitionDirection>(null);
  const [videoVisible, setVideoVisible] = useState<boolean>(false);

  const d2lVideoRef = useRef<HTMLVideoElement | null>(null);
  const l2dVideoRef = useRef<HTMLVideoElement | null>(null);
  const safetyTimerRef = useRef<number | null>(null);

  const finishTransition = (targetTheme: ResolvedTheme) => {
    if (safetyTimerRef.current !== null) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    setDisplayedTheme(targetTheme);
    setVideoVisible(false);
    window.setTimeout(() => {
      setActiveTransition(null);
    }, 260);
  };

  useEffect(() => {
    const prev = prevThemeRef.current;
    if (prev === resolvedTheme) return;
    prevThemeRef.current = resolvedTheme;

    const dir = getThemeTransitionDirection(prev, resolvedTheme);
    if (!dir) {
      setDisplayedTheme(resolvedTheme);
      return;
    }

    if (safetyTimerRef.current !== null) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }

    setActiveTransition(dir);
    setVideoVisible(true);

    const videoEl = dir === 'dark-to-light' ? d2lVideoRef.current : l2dVideoRef.current;
    if (videoEl) {
      try {
        videoEl.pause();
        videoEl.currentTime = 0;
        videoEl.playbackRate = 1.15;
        const playPromise = videoEl.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            // If autoplay is blocked in a restricted environment, smoothly settle onto the target image
            safetyTimerRef.current = window.setTimeout(() => {
              finishTransition(resolvedTheme);
            }, 650);
          });
        }
      } catch {
        finishTransition(resolvedTheme);
      }
    }

    // Update static image underneath midway through the video so ending frame dissolves seamlessly
    const midTimer = window.setTimeout(() => {
      setDisplayedTheme(resolvedTheme);
    }, 1100);

    // Hard safety cap (video duration is 2.92s -> ~2.55s at 1.15x)
    safetyTimerRef.current = window.setTimeout(() => {
      finishTransition(resolvedTheme);
    }, 3200);

    return () => {
      window.clearTimeout(midTimer);
    };
  }, [resolvedTheme]);

  const isDisplayedLight = displayedTheme === 'light';
  const isDisplayedOled = displayedTheme === 'oled';

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden vayu-gpu"
      aria-hidden="true"
      data-testid="atmospheric-background"
      data-bg-theme={displayedTheme}
      data-transition-video={activeTransition ?? 'idle'}
    >
      {/* Static High-Resolution Dark Backdrop (dark.png) */}
      <img
        src={THEME_MEDIA_ASSETS.darkImage}
        alt=""
        decoding="async"
        fetchPriority="high"
        className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-500 vayu-gpu ${
          !isDisplayedLight ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Static High-Resolution Light Backdrop (light.png) */}
      <img
        src={THEME_MEDIA_ASSETS.lightImage}
        alt=""
        decoding="async"
        fetchPriority="high"
        className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-500 vayu-gpu ${
          isDisplayedLight ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Preloaded Upscaled Dark-to-Light Transition Video */}
      <video
        ref={d2lVideoRef}
        data-testid="theme-video-dark-to-light"
        muted
        playsInline
        preload="auto"
        onEnded={() => {
          if (activeTransition === 'dark-to-light') {
            finishTransition(resolvedTheme);
          }
        }}
        className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-250 vayu-gpu ${
          activeTransition === 'dark-to-light' && videoVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <source src={THEME_MEDIA_ASSETS.darkToLightVideo} type="video/mp4" />
        <source src={THEME_MEDIA_ASSETS.darkToLightFallbackVideo} type="video/mp4" />
      </video>

      {/* Preloaded Upscaled Light-to-Dark Transition Video */}
      <video
        ref={l2dVideoRef}
        data-testid="theme-video-light-to-dark"
        muted
        playsInline
        preload="auto"
        onEnded={() => {
          if (activeTransition === 'light-to-dark') {
            finishTransition(resolvedTheme);
          }
        }}
        className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-250 vayu-gpu ${
          activeTransition === 'light-to-dark' && videoVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <source src={THEME_MEDIA_ASSETS.lightToDarkVideo} type="video/mp4" />
        <source src={THEME_MEDIA_ASSETS.lightToDarkFallbackVideo} type="video/mp4" />
      </video>

      {/* Subtle Ambient AQI Radial Dispersion Bleed (softly blends with cloud backdrop) */}
      <div
        className="absolute -top-36 left-1/4 h-[520px] w-[520px] rounded-full blur-[130px] transition-all duration-700 vayu-gpu"
        style={{
          background: `radial-gradient(circle, ${ambientGlow} 0%, transparent 70%)`,
          opacity: isDisplayedOled ? 0.16 : isDisplayedLight ? 0.18 : 0.28,
        }}
      />

      {/* Contrast & OLED Deepening Veil — keeps dark.png & light.png rich beneath high-legibility Liquid Glass */}
      <div
        className={`absolute inset-0 transition-colors duration-500 ${
          isDisplayedOled
            ? 'bg-neutral-950/84'
            : isDisplayedLight
              ? 'bg-white/26'
              : 'bg-[#040714]/40'
        }`}
      />

      {/* Tactile SVG Fractal-Noise Micro-Grain */}
      <svg
        className={`absolute inset-0 h-full w-full ${
          isDisplayedLight ? 'opacity-[0.025]' : 'opacity-[0.04]'
        } mix-blend-overlay`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="vayu-fractal-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.78"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#vayu-fractal-noise)" />
      </svg>
    </div>
  );
};
