---
name: Atmospheric Obsidian
colors:
  surface: '#121317'
  surface-dim: '#121317'
  surface-bright: '#38393d'
  surface-container-lowest: '#0d0e12'
  surface-container-low: '#1a1b20'
  surface-container: '#1f1f24'
  surface-container-high: '#292a2e'
  surface-container-highest: '#343439'
  on-surface: '#e3e2e7'
  on-surface-variant: '#bdc8d1'
  inverse-surface: '#e3e2e7'
  inverse-on-surface: '#2f3035'
  outline: '#87929a'
  outline-variant: '#3e484f'
  surface-tint: '#7bd0ff'
  primary: '#8ed5ff'
  on-primary: '#00354a'
  primary-container: '#38bdf8'
  on-primary-container: '#004965'
  inverse-primary: '#00668a'
  secondary: '#d0bcff'
  on-secondary: '#3c0091'
  secondary-container: '#571bc1'
  on-secondary-container: '#c4abff'
  tertiary: '#56e5a9'
  on-tertiary: '#003824'
  tertiary-container: '#30c88f'
  on-tertiary-container: '#004e34'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c4e7ff'
  primary-fixed-dim: '#7bd0ff'
  on-primary-fixed: '#001e2c'
  on-primary-fixed-variant: '#004c69'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#d0bcff'
  on-secondary-fixed: '#23005c'
  on-secondary-fixed-variant: '#5516be'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#121317'
  on-background: '#e3e2e7'
  surface-variant: '#343439'
typography:
  display-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 64px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  telemetry-num:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 26px
    letterSpacing: -0.02em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-xs:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.08em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-md: 1.25rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 2rem
  margin-lg: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system establishes a high-precision, atmospheric telemetry experience designed to transform acute urban smog anxiety into decisive, calm situational awareness. Drawing inspiration from deep-atmosphere environmental monitoring stations and advanced aerospace HUDs, the aesthetic marries deep dark-mode minimalism with ethereal, translucent frosted glassmorphism.

The visual direction centers on layered obsidian and smoky carbon planes suspended in deep space, subtly glowing with spectral hazard gradients and crystalline highlights. The emotional signature is clinical yet protective: reassuring users through precise data density, low-strain night readability, and tactile telemetry widgets. High-frequency micro-interactions, liquid-smooth glass transitions, and restrained luminescent indicators replace chaotic alert paradigms with refined situational control.

## Colors

The palette operates in a calibrated deep-dark spectrum where contrast is maintained without ocular fatigue under low-light winter conditions.

### Base Canvases & Glass Fills
- **Canvas Base:** Obsidian `#060609` (92% to 100% absorption)
- **Glass Panel Surface:** Translucent carbon `rgba(18, 18, 22, 0.72)` paired with `backdrop-filter: blur(24px)`
- **Glass Elevated / Modal:** Deep obsidian frost `rgba(28, 28, 36, 0.85)`
- **Structural Borders:** Whisper white `rgba(255, 255, 255, 0.08)` to highlight edges without visual noise
- **Text & Foreground:** Crisp silver-white `#F8FAFC` (high emphasis), tempered silver `#94A3B8` (medium emphasis), and muted smoke `#64748B` (telemetry units and structural dividers)

### Dynamic Environmental & AI Tints
- **Atmospheric Cyan (Primary):** `#38BDF8` — Represents pristine airflow, active calibration, and live sensors.
- **Spectral Violet (Secondary / AI Engine):** `#8B5CF6` — Fuels predictive forecasting, AI particulate synthesis, and hazard trajectory engines.
- **Sensor Harmonics (AQI Spectrum):**
  - **Optimal (AQI 0–50):** Emerald `#10B981` (ambient glow: `rgba(16, 185, 129, 0.25)`)
  - **Cautionary (AQI 51–100):** Amber `#F59E0B` (ambient glow: `rgba(245, 158, 11, 0.25)`)
  - **Unhealthy (AQI 101–200):** Crimson `#EF4444` (ambient glow: `rgba(239, 68, 68, 0.3)`)
  - **Hazardous (AQI 201–500+):** Deep Violet/Indigo `#8B5CF6` / `#7C3AED` (ambient glow: `rgba(139, 92, 246, 0.4)`)

## Typography

Typography reinforces high-speed scanning and telemetry legibility. Geometric display hierarchy in **Plus Jakarta Sans** provides a contemporary, modern digital posture, while **Inter** delivers neutral, crisp typographic cadence across dense data grids, tables, and particulate breakdowns.

- **Tabular Figures:** All numeric readouts, AQI scores, PM2.5 metrics, and microgram values mandate `font-variant-numeric: tabular-nums` to eliminate jitter across real-time sensor updates.
- **Letter Spacing:** Headlines utilize tight negative tracking to compress punchy metrics. Labels and metadata adopt expanded positive tracking with uppercase transforms for clear component hierarchy.

## Layout & Spacing

The layout is built on a responsive 12-column adaptive fluid grid engineered for progressive web apps (PWAs), ensuring edge-to-edge situational awareness on mobile handsets and sophisticated dashboard instrumentation on widescreen panels.

- **Mobile Viewports (<640px):** Single-column stacked telemetry modules with a fixed bottom safe-area offset (88px) to accommodate the floating glass dock pill. Outer margins sit at `1rem` with `0.75rem` internal gaps.
- **Tablet / Mid-tier (640px–1024px):** 6 to 8 columns with dual-module pairing (e.g., live AQI gauge juxtaposed against particulate telemetry). Outer margins expand to `2rem`.
- **Desktop (1024px+):** 12 columns constrained to a max-width container of `1440px`. Spatial layouts split into:
  - 4-column persistent left telemetry overview & AI diagnostics
  - 8-column high-resolution spatial pollutant dispersion maps and temporal trend timelines.

## Elevation & Depth

Visual hierarchy abandons traditional muddy drop shadows in favor of translucent refraction, precise edge lighting, and colored ambient radiance.

1. **Subsurface Canvas (Level 0):** Pure Obsidian `#060609` texture, accented by radial conic gradient bleeds reflecting the current macro AQI state at 15% opacity.
2. **Glass Base Cards (Level 1):** Solid background of `rgba(18, 18, 22, 0.72)` backed by `backdrop-filter: blur(20px)` and an ultra-fine perimeter stroke: `1px solid rgba(255, 255, 255, 0.08)`. No cast shadow.
3. **Elevated Panels & Flyouts (Level 2):** `rgba(24, 24, 30, 0.82)` with `backdrop-filter: blur(32px)`, an internal top edge specular highlight `inset 0 1px 0 0 rgba(255, 255, 255, 0.12)`, and a diffuse ambient shadow: `0 16px 36px -8px rgba(0, 0, 0, 0.6)`.
4. **Floating HUD Docks & Critical Modals (Level 3):** Frosted capsule layers framed by `1px solid rgba(255, 255, 255, 0.18)` with dynamic AI/Hazard gradient aura glows (`0 0 24px -4px var(--accent-ambient-glow)`).

## Shapes

The interface embraces a balanced organic-technical geometry (Scale `2` - Rounded). Standard interactive panels use an 8px radius (`0.5rem`) for compact micro-telemetry and a 16px radius (`1rem`) for larger metric containers. 

Fully circular and capsule silhouettes (pill-shapes) are strictly reserved for primary floating controllers: navigation docks, status indicator pills, and emergency resilience action triggers. This structural contrast cleanly differentiates floating navigation controls from stationary data canvases.

## Components

### Floating Glassmorphic Dock Pill
- **Structure:** Anchored bottom-center, floating 16px above the home indicator. 
- **Style:** Capsule geometry, `rgba(15, 15, 20, 0.8)` with `backdrop-filter: blur(28px)`, framed by `1px solid rgba(255, 255, 255, 0.12)`.
- **Items:** Equal-width micro-icon slots with luminous indicator dots underneath the active view. Hover/press produces a localized radial glow in `#38BDF8`.

### Buttons & Interactive Triggers
- **Primary Telemetry Action:** Gradient background transitioning from Cyan `#38BDF8` to Violet `#8B5CF6`, text `#060609` (semi-bold), subtle pill-shaped or 8px rounded frame with high-energy edge glow on hover.
- **Glass Action (Secondary):** Surface of `rgba(255, 255, 255, 0.04)` over hover `rgba(255, 255, 255, 0.09)`, framed with `1px solid rgba(255, 255, 255, 0.1)`. Crisp white text.

### Telemetry Cards & Particulate Monitors
- **Layout:** High-density, modular tiles (PM2.5, PM10, NO2, O3, VOC).
- **Styling:** Top-left 10px uppercase tracking label in tempered silver; center features bold tabular values with unit metrics (`µg/m³`) subdued; bottom displays a sparkline showing micro-trends across the past 6 hours.
- **Accent Indicator:** A hairline vertical status ribbon (2px width) on the card's inner-left edge colored according to the specific pollutant's tier.

### Ambient Air Quality Radial Gauge
- **Structure:** Concentric segmented arc rings rendered against obsidian glass.
- **Visuals:** Vector SVG arc stroke featuring a glowing track head. Glow intensity corresponds directly to particulate concentration. Center houses the primary composite AQI index number in `display-hero` scale accompanied by situational status badge (e.g., "HAZARDOUS // LIMIT EXPOSURE").

### Filter Chips & Spatial Toggle Switches
- **Chips:** Height of 28px, 14px radius (capsule), translucent charcoal base. When toggled active, the border shifts to `1px solid #38BDF8` with a subtle interior gradient bloom.
- **Switches:** Recessed obsidian track (`rgba(0, 0, 0, 0.5)`) with a sliding glass thumb button highlighted by specular white reflection.

### Form Inputs & Sensor Search Fields
- **Container:** Height 44px, 8px radius, `rgba(255, 255, 255, 0.03)` fill with `1px solid rgba(255, 255, 255, 0.08)`.
- **Active State:** Focus transitions the border to Cyan `#38BDF8` accompanied by an external aura: `box-shadow: 0 0 12px rgba(56, 189, 248, 0.25)`. Placeholder text in muted smoke `#64748B`.