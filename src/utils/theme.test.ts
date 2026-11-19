import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getInitialDockOrientation,
  getThemeTokens,
  getThemeTransitionDirection,
  THEME_MEDIA_ASSETS,
} from './theme';

describe('theme transitions, mobile dock defaults, and Liquid Glass tokens', () => {
  it('computes correct light-to-dark and dark-to-light video transition directions', () => {
    assert.equal(getThemeTransitionDirection('dark', 'light'), 'dark-to-light');
    assert.equal(getThemeTransitionDirection('oled', 'light'), 'dark-to-light');
    assert.equal(getThemeTransitionDirection('light', 'dark'), 'light-to-dark');
    assert.equal(getThemeTransitionDirection('light', 'oled'), 'light-to-dark');
    assert.equal(getThemeTransitionDirection('dark', 'oled'), null);
    assert.equal(getThemeTransitionDirection('oled', 'dark'), null);
    assert.equal(getThemeTransitionDirection('light', 'light'), null);
  });

  it('defaults floating dock to horizontal on mobile viewports and vertical on desktop', () => {
    assert.equal(getInitialDockOrientation(null, 390), 'horizontal');
    assert.equal(getInitialDockOrientation(null, 767), 'horizontal');
    assert.equal(getInitialDockOrientation(null, 768), 'vertical');
    assert.equal(getInitialDockOrientation(null, 1440), 'vertical');
    assert.equal(getInitialDockOrientation('vertical', 390), 'horizontal');
    assert.equal(getInitialDockOrientation('vertical', 1440), 'vertical');
    assert.equal(getInitialDockOrientation('horizontal', 1440), 'horizontal');
  });

  it('references uploaded dark/light backdrops and upscaled transition videos', () => {
    assert.equal(THEME_MEDIA_ASSETS.darkImage, '/assets/aistudio/dark_24ff50f3.png');
    assert.equal(THEME_MEDIA_ASSETS.lightImage, '/assets/aistudio/light_8e2c77fd.png');
    assert.equal(THEME_MEDIA_ASSETS.darkToLightVideo, '/assets/aistudio/dark-to-light_upscaled.mp4');
    assert.equal(THEME_MEDIA_ASSETS.lightToDarkVideo, '/assets/aistudio/light-to-dark_upscaled.mp4');
  });

  it('returns translucent Liquid Glass tokens for all resolved themes', () => {
    const light = getThemeTokens('light');
    const dark = getThemeTokens('dark');
    const oled = getThemeTokens('oled');
    assert.equal(light.isLight, true);
    assert.equal(dark.isLight, false);
    assert.equal(oled.isLight, false);
    assert.ok(light.surface.includes('bg-white/'));
    assert.ok(dark.surface.includes('/'));
    assert.ok(oled.surface.includes('/'));
  });
});
