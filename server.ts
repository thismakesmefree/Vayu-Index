import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import {
  buildCorridorCandidatePaths,
  buildJourneyPointsFromRoute,
  computeUpwindViaWaypoint,
  decodeEncodedPolyline,
  estimateTransitDurationMin,
  mapTransitModeToGoogleTravelMode,
  measurePathDistanceKm,
  samplePathCoordinates,
  selectOptimalLowSmogRoute,
  SYNC_ROUTE_MAX_KM,
} from './src/utils/routeOptimizer.ts';
import type {
  GoogleTravelMode,
  LatLngPoint,
  RouteCandidateInput,
  RouteSampleTelemetry,
} from './src/utils/routeOptimizer.ts';
import type { TransitMode } from './src/utils/airQuality.ts';
import { PAN_INDIA_AQI_STATIONS } from './src/utils/indiaGrid.ts';
import type { JourneyExplanationPoint, RouteStepSegment } from './src/types.ts';
import {
  createSignedOAuthState,
  resolveOAuthBaseUrl,
  verifySignedOAuthState,
} from './src/utils/oauthState.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYSTEM_INSTRUCTION = `You are Vayu Index AI, an atmospheric telemetry and air-quality navigation specialist.
Your mission is to transform acute pollution or severe-weather anxiety into calm, decisive, measurable situational action.

For every user query:
1. Suggest practical, low-emission daily routines, indoor air quality (IAQ) hacks, and sustainable alternatives tailored specifically to the user's calibrated city/location, live AQI, weather conditions, and lifestyle.
2. Clearly quantify the direct health impact (e.g., estimated µg/m³ PM2.5 inhalation reduction, percentage drop in particulate lung deposition) AND emission impact (e.g., grams or kg of CO₂e / NOx avoided per day or trip) for each recommendation.
3. Structure your response clearly with scannable sections, concise bullet points, and realistic numbers. Keep tone clinical, reassuring, and actionable. Never fabricate live sensor claims outside the provided telemetry context.`;

interface ChatHistoryItem {
  role: 'user' | 'model';
  text: string;
}

const GEMINI_FLASH_MODEL = 'gemini-3.8-flash';
const GEMINI_FLASH_LITE_MODEL = 'gemini-3.5-flash-lite';

interface ChatRequestBody {
  message?: string;
  history?: ChatHistoryItem[];
  location?: string;
  aqi?: number;
  pm25?: number;
  temperatureC?: number;
  windKmh?: number;
  userApiKey?: string;
  authMode?: 'guest-free' | 'guest-key' | 'oauth';
  model?: 'gemini-3.8-flash' | 'gemini-3.5-flash-lite';
}

function round1(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? Number(n.toFixed(1)) : fallback;
}

function round0(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const normalized = ((deg % 360) + 360) % 360;
  return dirs[Math.round(normalized / 22.5) % 16];
}

function getWmoWeatherLabel(code: number): string {
  if (code === 0) return 'Clear Sky';
  if (code === 1) return 'Mainly Clear';
  if (code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog / Riming';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code === 56 || code === 57) return 'Freezing Drizzle';
  if (code >= 61 && code <= 65) return code === 65 ? 'Heavy Rain' : 'Rain';
  if (code === 66 || code === 67) return 'Freezing Rain';
  if (code >= 71 && code <= 77) return 'Snowfall';
  if (code >= 80 && code <= 82) return 'Rain Showers';
  if (code === 85 || code === 86) return 'Snow Showers';
  if (code === 95) return 'Thunderstorm';
  if (code === 96 || code === 99) return 'Severe Thunderstorm';
  return 'Variable Conditions';
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim();
}

function formatTimeAgo(dateStr: string): string {
  const ts = Date.parse(dateStr);
  if (!Number.isFinite(ts)) return 'Recent';
  const diffMin = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.round(diffHrs / 24)}d ago`;
}

function computeSeriesStats(series: Array<number | null | undefined>, fallback: number) {
  const nums = series.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) {
    return {
      mean: round1(fallback),
      peak: round1(fallback),
      delta6h: 0,
      sparkline: [round1(fallback), round1(fallback), round1(fallback), round1(fallback), round1(fallback), round1(fallback)],
    };
  }
  const last24 = nums.slice(-24);
  const mean = round1(last24.reduce((a, b) => a + b, 0) / last24.length, fallback);
  const peak = round1(Math.max(...last24), fallback);
  const recent6 = nums.slice(-6);
  const first6 = recent6[0] ?? fallback;
  const last6 = recent6[recent6.length - 1] ?? fallback;
  const delta6h = first6 > 0.1 ? round1(((last6 - first6) / first6) * 100, 0) : 0;
  return {
    mean,
    peak,
    delta6h,
    sparkline: recent6.map((v) => round1(v, fallback)),
  };
}

function parseRssItems(xml: string) {
  const items: Array<{ title: string; link: string; pubDate: string; source: string }> = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  for (const rawItem of itemMatches.slice(0, 6)) {
    const titleRaw = rawItem.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
    const linkRaw = rawItem.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '';
    const pubRaw = rawItem.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '';
    const sourceRaw = rawItem.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? 'Weather Wire';
    const fullTitle = decodeHtmlEntities(titleRaw);
    const cleanedTitle = fullTitle.replace(/\s+-\s+[^-]+$/, '').trim() || fullTitle;
    if (cleanedTitle) {
      items.push({
        title: cleanedTitle,
        link: decodeHtmlEntities(linkRaw),
        pubDate: decodeHtmlEntities(pubRaw),
        source: decodeHtmlEntities(sourceRaw) || 'Global Weather Desk',
      });
    }
  }
  return items;
}

export function createApiApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      hasServerGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.get('/api/location/search', async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) {
      res.json({ results: [] });
      return;
    }

    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Geocoding HTTP ${r.status}`);
      const data = (await r.json()) as {
        results?: Array<{
          id: number;
          name: string;
          admin1?: string;
          country?: string;
          country_code?: string;
          latitude: number;
          longitude: number;
          timezone?: string;
          elevation?: number;
        }>;
      };

      const results = (data.results ?? []).map((item) => {
        const parts = [item.name, item.admin1, item.country].filter(Boolean);
        return {
          id: String(item.id),
          name: item.name,
          admin1: item.admin1,
          country: item.country,
          countryCode: item.country_code,
          lat: item.latitude,
          lon: item.longitude,
          timezone: item.timezone,
          elevation: item.elevation,
          displayLabel: parts.join(', '),
        };
      });

      res.json({ results });
    } catch (err: unknown) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to search locations.',
      });
    }
  });

  app.get('/api/location/reverse', async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({ error: 'Valid lat and lon are required.' });
      return;
    }

    try {
      const photonRes = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`);
      if (photonRes.ok) {
        const photonData = (await photonRes.json()) as {
          features?: Array<{
            properties?: {
              city?: string;
              town?: string;
              village?: string;
              locality?: string;
              district?: string;
              state?: string;
              country?: string;
              name?: string;
            };
          }>;
        };
        const p = photonData.features?.[0]?.properties;
        if (p) {
          const cityPart = p.city || p.town || p.village || p.locality || p.district || p.name;
          const regionPart = [p.state, p.country].filter(Boolean).join(', ');
          if (cityPart) {
            res.json({
              label: regionPart ? `${cityPart}, ${p.state || p.country}` : cityPart,
              region: regionPart || 'GPS Calibrated',
              country: p.country || '',
            });
            return;
          }
        }
      }
    } catch {
      // fall through to nominatim
    }

    try {
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
        { headers: { 'User-Agent': 'VayuIndexPWA/1.0' } }
      );
      if (nomRes.ok) {
        const nom = (await nomRes.json()) as {
          address?: {
            city?: string;
            town?: string;
            village?: string;
            suburb?: string;
            state?: string;
            country?: string;
          };
        };
        const a = nom.address;
        if (a) {
          const cityPart = a.city || a.town || a.village || a.suburb;
          const regionPart = [a.state, a.country].filter(Boolean).join(', ');
          if (cityPart) {
            res.json({
              label: a.state ? `${cityPart}, ${a.state}` : cityPart,
              region: regionPart || 'GPS Calibrated',
              country: a.country || '',
            });
            return;
          }
        }
      }
    } catch {
      // fall through to coords label
    }

    res.json({
      label: `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
      region: 'GPS Coordinates',
      country: '',
    });
  });

  app.get('/api/telemetry', async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({ error: 'Valid lat and lon coordinates are required.' });
      return;
    }

    const labelParam = String(req.query.label ?? '').trim();
    const regionParam = String(req.query.region ?? '').trim();
    const countryParam = String(req.query.country ?? '').trim();

    const offsetPoints = [
      { id: 'center', name: labelParam || 'Central Station', zone: 'Calibrated Center', dLat: 0, dLon: 0, x: 50, y: 50 },
      { id: 'north', name: 'North Sector (+8 km)', zone: 'Upwind Ridge', dLat: 0.072, dLon: 0, x: 50, y: 18 },
      { id: 'northeast', name: 'NE Corridor (+9 km)', zone: 'Outer Belt', dLat: 0.055, dLon: 0.065, x: 76, y: 26 },
      { id: 'southeast', name: 'SE Basin (+9 km)', zone: 'Arterial Edge', dLat: -0.055, dLon: 0.065, x: 76, y: 74 },
      { id: 'south', name: 'South Sector (+8 km)', zone: 'Urban Valley', dLat: -0.072, dLon: 0, x: 50, y: 82 },
      { id: 'northwest', name: 'NW Canopy (+9 km)', zone: 'Buffer Zone', dLat: 0.055, dLon: -0.065, x: 24, y: 28 },
    ];

    const multiLats = offsetPoints.map((p) => (lat + p.dLat).toFixed(4)).join(',');
    const multiLons = offsetPoints.map((p) => (lon + p.dLon).toFixed(4)).join(',');

    try {
      const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,aerosol_optical_depth,dust,uv_index,uv_index_clear_sky,ammonia&hourly=pm2_5,pm10,us_aqi,european_aqi,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,uv_index,dust,aerosol_optical_depth&past_days=6&forecast_days=2&timezone=auto`;
      const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,dew_point_2m,visibility,vapour_pressure_deficit,shortwave_radiation,direct_radiation,diffuse_radiation&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,pressure_msl,surface_pressure,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,boundary_layer_height,shortwave_radiation,soil_temperature_0cm,soil_moisture_0_to_1cm&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,daylight_duration,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max&past_days=6&forecast_days=7&timezone=auto`;
      const gridAqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${multiLats}&longitude=${multiLons}&current=us_aqi,pm2_5`;
      const gridWxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${multiLats}&longitude=${multiLons}&current=wind_speed_10m,relative_humidity_2m`;
      const gdacsUrl = `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC&alertlevel=Green;Orange;Red`;

      const newsQuery = encodeURIComponent(
        `(${countryParam || labelParam || 'global'} weather OR cyclone OR storm OR "air quality")`
      );
      const newsUrl = `https://news.google.com/rss/search?q=${newsQuery}&hl=en-US&gl=US&ceid=US:en`;

      const [aqRes, wxRes, gridAqRes, gridWxRes, gdacsRes, newsRes] = await Promise.allSettled([
        fetch(aqUrl),
        fetch(wxUrl),
        fetch(gridAqUrl),
        fetch(gridWxUrl),
        fetch(gdacsUrl),
        fetch(newsUrl),
      ]);

      if (aqRes.status !== 'fulfilled' || !aqRes.value.ok) {
        throw new Error('Air quality upstream service is temporarily unavailable.');
      }
      if (wxRes.status !== 'fulfilled' || !wxRes.value.ok) {
        throw new Error('Meteorological forecast upstream service is temporarily unavailable.');
      }

      const aq = (await aqRes.value.json()) as any;
      const wx = (await wxRes.value.json()) as any;
      const gridAq =
        gridAqRes.status === 'fulfilled' && gridAqRes.value.ok ? await gridAqRes.value.json() : [];
      const gridWx =
        gridWxRes.status === 'fulfilled' && gridWxRes.value.ok ? await gridWxRes.value.json() : [];
      const gdacs =
        gdacsRes.status === 'fulfilled' && gdacsRes.value.ok ? await gdacsRes.value.json() : null;
      const newsXml =
        newsRes.status === 'fulfilled' && newsRes.value.ok ? await newsRes.value.text() : '';

      const aqCurr = aq.current ?? {};
      const aqHourly = aq.hourly ?? {};
      const wxCurr = wx.current ?? {};
      const wxHourly = wx.hourly ?? {};
      const wxDaily = wx.daily ?? {};

      // Locate current hour index in hourly arrays (past_days=6 means ~144 hours of history before now)
      const hourlyTimes: string[] = Array.isArray(wxHourly.time) ? wxHourly.time : [];
      const currentHourKey = typeof wxCurr.time === 'string' ? wxCurr.time.slice(0, 13) : '';
      let nowIdx = hourlyTimes.findIndex((t) => t.startsWith(currentHourKey));
      if (nowIdx < 0) nowIdx = Math.max(0, Math.min(hourlyTimes.length - 1, 144));

      const aqTimes: string[] = Array.isArray(aqHourly.time) ? aqHourly.time : [];
      const aqNowKey = typeof aqCurr.time === 'string' ? aqCurr.time.slice(0, 13) : currentHourKey;
      let aqNowIdx = aqTimes.findIndex((t) => t.startsWith(aqNowKey));
      if (aqNowIdx < 0) aqNowIdx = Math.min(aqTimes.length - 1, nowIdx);

      const slicePast30 = (arr: any[]) =>
        Array.isArray(arr) ? arr.slice(Math.max(0, aqNowIdx - 24), aqNowIdx + 1) : [];

      const pm25Val = round1(aqCurr.pm2_5, 0);
      const pm10Val = round1(aqCurr.pm10, 0);
      const no2Val = round1(aqCurr.nitrogen_dioxide, 0);
      const o3Val = round1(aqCurr.ozone, 0);
      const so2Val = round1(aqCurr.sulphur_dioxide, 0);
      const coUgVal = round0(aqCurr.carbon_monoxide, 0);
      const coMgVal = round1(coUgVal / 1000, 0);
      const dustVal = round1(aqCurr.dust, 0);
      const aodVal = round1(aqCurr.aerosol_optical_depth, 0);
      const ammoniaVal =
        typeof aqCurr.ammonia === 'number' && Number.isFinite(aqCurr.ammonia)
          ? round1(aqCurr.ammonia, 0)
          : null;

      const pm25Stats = computeSeriesStats(slicePast30(aqHourly.pm2_5), pm25Val);
      const pm10Stats = computeSeriesStats(slicePast30(aqHourly.pm10), pm10Val);
      const no2Stats = computeSeriesStats(slicePast30(aqHourly.nitrogen_dioxide), no2Val);
      const o3Stats = computeSeriesStats(slicePast30(aqHourly.ozone), o3Val);
      const so2Stats = computeSeriesStats(slicePast30(aqHourly.sulphur_dioxide), so2Val);
      const coStats = computeSeriesStats(
        slicePast30(aqHourly.carbon_monoxide).map((v) => (typeof v === 'number' ? v / 1000 : null)),
        coMgVal
      );
      const dustStats = computeSeriesStats(slicePast30(aqHourly.dust), dustVal);
      const aodStats = computeSeriesStats(
        slicePast30(aqHourly.aerosol_optical_depth).map((v) => (typeof v === 'number' ? v * 100 : null)),
        round0(aodVal * 100, 0)
      );

      // Determine dominant pollutant by ratio against WHO 2021 guideline
      const pollutantRatios = [
        { name: 'PM2.5', ratio: pm25Val / 15 },
        { name: 'PM10', ratio: pm10Val / 45 },
        { name: 'NO₂', ratio: no2Val / 25 },
        { name: 'O₃', ratio: o3Val / 100 },
        { name: 'SO₂', ratio: so2Val / 40 },
      ];
      const dominantPollutant = [...pollutantRatios].sort((a, b) => b.ratio - a.ratio)[0]?.name ?? 'PM2.5';

      // Weather current & derived values
      const windKmh = round1(wxCurr.wind_speed_10m, 0);
      const windGustKmh = round1(wxCurr.wind_gusts_10m, windKmh);
      const windDirDeg = round0(wxCurr.wind_direction_10m, 0);
      const windDir = degreesToCardinal(windDirDeg);
      const boundaryLayerM = round0(wxHourly.boundary_layer_height?.[nowIdx], 450);
      const ventilationCoeffM2s = Math.round((windKmh / 3.6) * boundaryLayerM);

      const pressureNow = round1(wxCurr.pressure_msl, 1013.2);
      const pressurePrev3h = round1(wxHourly.pressure_msl?.[Math.max(0, nowIdx - 3)], pressureNow);
      const pressureDiff = pressureNow - pressurePrev3h;
      const pressureTrend: 'Rising' | 'Steady' | 'Falling' =
        pressureDiff >= 0.8 ? 'Rising' : pressureDiff <= -0.8 ? 'Falling' : 'Steady';

      // Today daily slot is index 6 (past_days=6)
      const dailyTimes: string[] = Array.isArray(wxDaily.time) ? wxDaily.time : [];
      const todayDailyIdx = Math.min(dailyTimes.length - 1, 6);
      const sunriseIso = String(wxDaily.sunrise?.[todayDailyIdx] ?? '');
      const sunsetIso = String(wxDaily.sunset?.[todayDailyIdx] ?? '');
      const sunriseTime = sunriseIso.includes('T') ? sunriseIso.split('T')[1].slice(0, 5) : '--:--';
      const sunsetTime = sunsetIso.includes('T') ? sunsetIso.split('T')[1].slice(0, 5) : '--:--';
      const daylightSec = Number(wxDaily.daylight_duration?.[todayDailyIdx] ?? 43200);

      // Hourly 24h forecast (every 3h across next 24h)
      const hourlyForecast: Array<{
        hour: string;
        aqi: number;
        pm25: number;
        tempC: number;
        precipProb: number;
        windKmh: number;
        weatherCode: number;
        windowSafe: boolean;
      }> = [];
      for (let offset = 0; offset < 24; offset += 3) {
        const wIdx = Math.min(hourlyTimes.length - 1, nowIdx + offset);
        const aIdx = Math.min(aqTimes.length - 1, aqNowIdx + offset);
        const tStr = hourlyTimes[wIdx] ?? '';
        const hourLabel = tStr.includes('T') ? tStr.split('T')[1].slice(0, 5) : `+${offset}h`;
        const slotAqi = round0(aqHourly.us_aqi?.[aIdx], round0(aqCurr.us_aqi, 25));
        const slotPm25 = round1(aqHourly.pm2_5?.[aIdx], pm25Val);
        const slotTemp = round1(wxHourly.temperature_2m?.[wIdx], round1(wxCurr.temperature_2m, 0));
        const slotPrecipProb = round0(wxHourly.precipitation_probability?.[wIdx], 0);
        const slotWind = round1(wxHourly.wind_speed_10m?.[wIdx], windKmh);
        const slotWmo = round0(wxHourly.weather_code?.[wIdx], round0(wxCurr.weather_code, 0));
        hourlyForecast.push({
          hour: hourLabel,
          aqi: slotAqi,
          pm25: slotPm25,
          tempC: slotTemp,
          precipProb: slotPrecipProb,
          windKmh: slotWind,
          weatherCode: slotWmo,
          windowSafe: slotAqi <= 100 && slotPrecipProb < 60,
        });
      }

      // 7-Day Daily Forecast (from todayDailyIdx onward)
      const dailyForecast: Array<{
        day: string;
        date: string;
        weatherCode: number;
        weatherLabel: string;
        tempMaxC: number;
        tempMinC: number;
        precipProbMax: number;
        precipSumMm: number;
        windMaxKmh: number;
        uvMax: number;
      }> = [];
      for (let i = todayDailyIdx; i < dailyTimes.length && dailyForecast.length < 7; i += 1) {
        const dateStr = dailyTimes[i] ?? '';
        const dt = new Date(`${dateStr}T12:00:00Z`);
        const dayName =
          i === todayDailyIdx
            ? 'Today'
            : Number.isNaN(dt.getTime())
              ? dateStr
              : dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
        const wmo = round0(wxDaily.weather_code?.[i], 0);
        dailyForecast.push({
          day: dayName,
          date: dateStr,
          weatherCode: wmo,
          weatherLabel: getWmoWeatherLabel(wmo),
          tempMaxC: round1(wxDaily.temperature_2m_max?.[i], 0),
          tempMinC: round1(wxDaily.temperature_2m_min?.[i], 0),
          precipProbMax: round0(wxDaily.precipitation_probability_max?.[i], 0),
          precipSumMm: round1(wxDaily.precipitation_sum?.[i], 0),
          windMaxKmh: round1(wxDaily.wind_speed_10m_max?.[i], 0),
          uvMax: round1(wxDaily.uv_index_max?.[i], 0),
        });
      }

      // 7-Day Historical AQI Trajectory grouped by day from past 6 days + today
      const byDay = new Map<string, { aqis: number[]; pm25s: number[]; no2s: number[] }>();
      for (let i = 0; i <= aqNowIdx && i < aqTimes.length; i += 1) {
        const dKey = aqTimes[i]?.slice(0, 10);
        if (!dKey) continue;
        const entry = byDay.get(dKey) ?? { aqis: [], pm25s: [], no2s: [] };
        if (typeof aqHourly.us_aqi?.[i] === 'number') entry.aqis.push(aqHourly.us_aqi[i]);
        if (typeof aqHourly.pm2_5?.[i] === 'number') entry.pm25s.push(aqHourly.pm2_5[i]);
        if (typeof aqHourly.nitrogen_dioxide?.[i] === 'number') entry.no2s.push(aqHourly.nitrogen_dioxide[i]);
        byDay.set(dKey, entry);
      }
      const weeklyHistory = Array.from(byDay.entries())
        .slice(-7)
        .map(([dKey, vals]) => {
          const dt = new Date(`${dKey}T12:00:00Z`);
          const label = Number.isNaN(dt.getTime())
            ? dKey.slice(5)
            : dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
          const avgAqi = vals.aqis.length
            ? Math.round(vals.aqis.reduce((a, b) => a + b, 0) / vals.aqis.length)
            : round0(aqCurr.us_aqi, 25);
          const peakAqi = vals.aqis.length ? Math.round(Math.max(...vals.aqis)) : avgAqi;
          const pm25 = vals.pm25s.length
            ? round1(vals.pm25s.reduce((a, b) => a + b, 0) / vals.pm25s.length, pm25Val)
            : pm25Val;
          const no2 = vals.no2s.length
            ? round1(vals.no2s.reduce((a, b) => a + b, 0) / vals.no2s.length, no2Val)
            : no2Val;
          return { day: label, avgAqi, peakAqi, pm25, no2 };
        });

      // Live 6-node multi-point sector array around user's exact coordinates
      const aqGridArr = Array.isArray(gridAq) ? gridAq : [gridAq];
      const wxGridArr = Array.isArray(gridWx) ? gridWx : [gridWx];
      const sectors = offsetPoints.map((pt, idx) => {
        const gAq = aqGridArr[idx]?.current ?? {};
        const gWx = wxGridArr[idx]?.current ?? {};
        return {
          id: pt.id,
          name: pt.name,
          zone: pt.zone,
          lat: Number((lat + pt.dLat).toFixed(4)),
          lon: Number((lon + pt.dLon).toFixed(4)),
          aqi: round0(gAq.us_aqi, round0(aqCurr.us_aqi, 25)),
          pm25: round1(gAq.pm2_5, pm25Val),
          x: pt.x,
          y: pt.y,
          windKmh: round1(gWx.wind_speed_10m, windKmh),
          humidityPercent: round0(gWx.relative_humidity_2m, round0(wxCurr.relative_humidity_2m, 50)),
        };
      });

      // Real GDACS Tropical Cyclone tracker sorted by proximity to user's coordinates
      const gdacsFeatures: any[] = Array.isArray(gdacs?.features) ? gdacs.features : [];
      const currentOrRecentCyclones = gdacsFeatures
        .filter((f) => f?.geometry?.coordinates && f?.properties)
        .sort((a, b) => {
          const aCur = a.properties.iscurrent === 'true' ? 0 : 1;
          const bCur = b.properties.iscurrent === 'true' ? 0 : 1;
          if (aCur !== bCur) return aCur - bCur;
          const [aLon, aLat] = a.geometry.coordinates;
          const [bLon, bLat] = b.geometry.coordinates;
          return haversineKm(lat, lon, aLat, aLon) - haversineKm(lat, lon, bLat, bLon);
        })
        .slice(0, 3)
        .map((f) => {
          const p = f.properties;
          const [cLon, cLat] = f.geometry.coordinates;
          const distKm = Math.round(haversineKm(lat, lon, cLat, cLon));
          const maxWind = round0(p.severitydata?.severity, 65);
          const alert = String(p.alertlevel || 'Green');
          const severity: 'warning' | 'watch' | 'advisory' =
            alert === 'Red' || distKm < 800
              ? 'warning'
              : alert === 'Orange' || distKm < 2000
                ? 'watch'
                : 'advisory';
          const isCurrent = p.iscurrent === 'true';
          return {
            id: `gdacs-${p.eventid}-${p.episodeid || 0}`,
            name: String(p.name || p.eventname || 'Tropical Cyclone'),
            basin: String(p.country || 'Oceanic Basin'),
            category: `${isCurrent ? 'Active' : 'Tracked'} · ${p.source || 'GDACS'} (${alert})`,
            severity,
            windKmh: maxWind,
            gustKmh: Math.round(maxWind * 1.25),
            pressureHpa: maxWind >= 110 ? 972 : maxWind >= 80 ? 992 : 1004,
            etaHours: distKm < 2500 ? Math.max(4, Math.round(distKm / 22)) : null,
            distanceKm: distKm,
            trackSummary: String(p.htmldescription || p.severitydata?.severitytext || 'GDACS satellite track monitored'),
            aqiImpact:
              distKm < 1200
                ? 'Regional cyclone pressure gradient may drive gusty dispersion and rapid rain washout at your location.'
                : `Tracked ${distKm.toLocaleString()} km from your calibrated coordinates — no direct local wind impact.`,
            reportUrl: p.url?.report,
          };
        });

      // Add live local synoptic wind/pressure notice if active gusts or low pressure detected at user's coords
      if (windGustKmh >= 42 || pressureNow <= 1004) {
        currentOrRecentCyclones.unshift({
          id: 'local-synoptic-trough',
          name: `Local Synoptic Gradient (${windDir} ${windGustKmh} km/h gusts)`,
          basin: labelParam || 'Local Boundary Layer',
          category: pressureNow <= 1004 ? 'Low-Pressure Trough' : 'Strong Boundary Gusts',
          severity: windGustKmh >= 60 ? 'warning' : 'watch',
          windKmh: round0(windKmh),
          gustKmh: round0(windGustKmh),
          pressureHpa: round0(pressureNow),
          etaHours: 0,
          distanceKm: 0,
          trackSummary: `Active local MSL pressure at ${pressureNow} hPa (${pressureTrend}) with ${windDir} surface flow.`,
          aqiImpact:
            'Elevated wind shear actively scours stagnant surface aerosols and lifts the thermal mixing ceiling.',
          reportUrl: undefined,
        });
      }

      // Live News Feed (Google News RSS + telemetry-derived regional bulletins)
      const rssItems = parseRssItems(newsXml);
      const newsFeed: Array<{
        id: string;
        category: 'Cyclones & Weather' | 'Air Policy' | 'Health Advisory';
        title: string;
        source: string;
        publishedAgo: string;
        summary: string;
        impactDetail: string;
        url?: string;
      }> = [];

      // Always include real live telemetry-derived local advisory first
      const compositeAqi = round0(aqCurr.us_aqi, 25);
      const precipNow = round1(wxCurr.precipitation, 0);
      newsFeed.push({
        id: 'live-local-advisory',
        category: 'Health Advisory',
        title:
          compositeAqi <= 50
            ? `${labelParam || 'Local'} air quality is Optimal (US AQI ${compositeAqi})`
            : `${labelParam || 'Local'} particulate advisory: US AQI ${compositeAqi} (Dominant: ${dominantPollutant})`,
        source: 'Open-Meteo Live Telemetry',
        publishedAgo: 'Live',
        summary: `PM2.5 is ${pm25Val} µg/m³ with ${windKmh} km/h ${windDir} wind and ${boundaryLayerM} m boundary-layer mixing height.`,
        impactDetail:
          precipNow > 0
            ? `Active precipitation (${precipNow} mm) is scavenging airborne particles; visibility at ${round1(Number(wxCurr.visibility ?? 10000) / 1000, 10)} km.`
            : `Ventilation coefficient is ${ventilationCoeffM2s} m²/s (${ventilationCoeffM2s < 1500 ? 'shallow inversion trap' : 'active atmospheric dispersion'}).`,
      });

      rssItems.forEach((item, idx) => {
        const lower = item.title.toLowerCase();
        const cat: 'Cyclones & Weather' | 'Air Policy' | 'Health Advisory' =
          lower.includes('cyclone') || lower.includes('storm') || lower.includes('rain') || lower.includes('wind')
            ? 'Cyclones & Weather'
            : lower.includes('policy') || lower.includes('ban') || lower.includes('emission')
              ? 'Air Policy'
              : 'Health Advisory';
        newsFeed.push({
          id: `rss-${idx}`,
          category: cat,
          title: item.title,
          source: item.source,
          publishedAgo: formatTimeAgo(item.pubDate),
          summary: `Regional weather & environmental report sourced via ${item.source}.`,
          impactDetail: `Relevant to synoptic conditions monitored near ${labelParam || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`}.`,
          url: item.link,
        });
      });

      const responsePayload = {
        id: `loc-${lat.toFixed(3)}-${lon.toFixed(3)}`,
        name: labelParam || `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
        region: regionParam || (wx.timezone ? String(wx.timezone).replace(/_/g, ' ') : 'Calibrated Location'),
        country: countryParam,
        coords: { lat, lon },
        timezone: String(wx.timezone ?? 'UTC'),
        elevationM: round0(wx.elevation, 0),
        compositeAqi,
        europeanAqi: round0(aqCurr.european_aqi, 20),
        dominantPollutant,
        temperatureC: round1(wxCurr.temperature_2m, 0),
        humidityPercent: round0(wxCurr.relative_humidity_2m, 50),
        windKmh,
        windDir,
        inversionCeilingM: boundaryLayerM,
        updatedAtLabel: `Live · ${wxCurr.time ? String(wxCurr.time).replace('T', ' ') : 'Synced'}`,
        pollutants: [
          { id: 'pm25', name: 'PM2.5', value: pm25Val, unit: 'µg/m³', safeLimit: 15, deltaPercent: pm25Stats.delta6h, sparkline: pm25Stats.sparkline },
          { id: 'pm10', name: 'PM10', value: pm10Val, unit: 'µg/m³', safeLimit: 45, deltaPercent: pm10Stats.delta6h, sparkline: pm10Stats.sparkline },
          { id: 'no2', name: 'NO₂', value: no2Val, unit: 'µg/m³', safeLimit: 25, deltaPercent: no2Stats.delta6h, sparkline: no2Stats.sparkline },
          { id: 'o3', name: 'O₃', value: o3Val, unit: 'µg/m³', safeLimit: 100, deltaPercent: o3Stats.delta6h, sparkline: o3Stats.sparkline },
          { id: 'so2', name: 'SO₂', value: so2Val, unit: 'µg/m³', safeLimit: 40, deltaPercent: so2Stats.delta6h, sparkline: so2Stats.sparkline },
          { id: 'co', name: 'CO', value: coMgVal, unit: 'mg/m³', safeLimit: 4, deltaPercent: coStats.delta6h, sparkline: coStats.sparkline },
        ],
        extendedPollutants: [
          { code: 'PM2.5', name: 'Fine Particulate Matter', current: pm25Val, mean24h: pm25Stats.mean, peak24h: pm25Stats.peak, whoLimit: 15, unit: 'µg/m³', delta6h: pm25Stats.delta6h },
          { code: 'PM10', name: 'Coarse Particulate Matter', current: pm10Val, mean24h: pm10Stats.mean, peak24h: pm10Stats.peak, whoLimit: 45, unit: 'µg/m³', delta6h: pm10Stats.delta6h },
          { code: 'NO₂', name: 'Nitrogen Dioxide', current: no2Val, mean24h: no2Stats.mean, peak24h: no2Stats.peak, whoLimit: 25, unit: 'µg/m³', delta6h: no2Stats.delta6h },
          { code: 'SO₂', name: 'Sulfur Dioxide', current: so2Val, mean24h: so2Stats.mean, peak24h: so2Stats.peak, whoLimit: 40, unit: 'µg/m³', delta6h: so2Stats.delta6h },
          { code: 'CO', name: 'Carbon Monoxide', current: coMgVal, mean24h: coStats.mean, peak24h: coStats.peak, whoLimit: 4.0, unit: 'mg/m³', delta6h: coStats.delta6h },
          { code: 'O₃', name: 'Ground-Level Ozone', current: o3Val, mean24h: o3Stats.mean, peak24h: o3Stats.peak, whoLimit: 100, unit: 'µg/m³', delta6h: o3Stats.delta6h },
          { code: 'DUST', name: 'Mineral Dust Aerosol', current: dustVal, mean24h: dustStats.mean, peak24h: dustStats.peak, whoLimit: 50, unit: 'µg/m³', delta6h: dustStats.delta6h },
          { code: 'AOD', name: 'Aerosol Optical Depth (×100)', current: round0(aodVal * 100, 0), mean24h: aodStats.mean, peak24h: aodStats.peak, whoLimit: 25, unit: 'idx', delta6h: aodStats.delta6h },
        ],
        meteorology: {
          temperatureC: round1(wxCurr.temperature_2m, 0),
          apparentTempC: round1(wxCurr.apparent_temperature, round1(wxCurr.temperature_2m, 0)),
          tempMaxC: round1(wxDaily.temperature_2m_max?.[todayDailyIdx], round1(wxCurr.temperature_2m, 0)),
          tempMinC: round1(wxDaily.temperature_2m_min?.[todayDailyIdx], round1(wxCurr.temperature_2m, 0)),
          dewPointC: round1(wxCurr.dew_point_2m, 0),
          humidityPercent: round0(wxCurr.relative_humidity_2m, 50),
          vapourPressureDeficitKpa: round1(wxCurr.vapour_pressure_deficit, 0),
          windKmh,
          windGustKmh,
          windDirDeg,
          windDir,
          pressureMslHpa: pressureNow,
          surfacePressureHpa: round1(wxCurr.surface_pressure, pressureNow),
          pressureTrend,
          precipitationMm: precipNow,
          rainMm: round1(wxCurr.rain, 0),
          snowfallCm: round1(wxCurr.snowfall, 0),
          precipProbPercent: round0(wxHourly.precipitation_probability?.[nowIdx], 0),
          cloudCoverPercent: round0(wxCurr.cloud_cover, 0),
          cloudLowPercent: round0(wxHourly.cloud_cover_low?.[nowIdx], 0),
          cloudMidPercent: round0(wxHourly.cloud_cover_mid?.[nowIdx], 0),
          cloudHighPercent: round0(wxHourly.cloud_cover_high?.[nowIdx], 0),
          visibilityKm: round1(Number(wxCurr.visibility ?? 10000) / 1000, 10),
          uvIndex: round1(aqCurr.uv_index, 0),
          uvClearSky: round1(aqCurr.uv_index_clear_sky, 0),
          solarWm2: round0(wxCurr.shortwave_radiation, 0),
          directRadiationWm2: round0(wxCurr.direct_radiation, 0),
          diffuseRadiationWm2: round0(wxCurr.diffuse_radiation, 0),
          boundaryLayerM,
          ventilationCoeffM2s,
          soilTempC: round1(wxHourly.soil_temperature_0cm?.[nowIdx], round1(wxCurr.temperature_2m, 0)),
          soilMoistureM3: round1(wxHourly.soil_moisture_0_to_1cm?.[nowIdx], 0.2),
          aerosolOpticalDepth: aodVal,
          dustUgM3: dustVal,
          ammoniaUgM3: ammoniaVal,
          sunriseTime,
          sunsetTime,
          daylightHours: round1(daylightSec / 3600, 12),
          weatherCode: round0(wxCurr.weather_code, 0),
          weatherLabel: getWmoWeatherLabel(round0(wxCurr.weather_code, 0)),
          isDay: Boolean(wxCurr.is_day),
        },
        cyclones: currentOrRecentCyclones,
        newsFeed,
        hourlyForecast,
        dailyForecast,
        weeklyHistory,
        sectors,
      };

      res.json(responsePayload);
    } catch (err: unknown) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to retrieve live telemetry.',
      });
    }
  });

  const SESSION_COOKIE_NAME = 'vayu_oauth_session';
  const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.OAUTH_CLIENT_SECRET ||
    crypto.randomBytes(32).toString('hex');

  const getOAuthConfig = (req?: express.Request) => {
    const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.OAUTH_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || process.env.OAUTH_CLIENT_SECRET || '').trim();
    const baseUrl = resolveOAuthBaseUrl(process.env, req?.headers);
    const redirectUri = `${baseUrl}/auth/callback`;
    const isHttps = baseUrl.startsWith('https://');
    return {
      clientId,
      clientSecret,
      baseUrl,
      redirectUri,
      isHttps,
      configured: Boolean(clientId && clientSecret),
    };
  };

  const signSessionCookie = (payload: Record<string, unknown>): string => {
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
  };

  const verifySessionCookie = (cookieHeader: string | undefined): {
    name: string;
    email: string;
    picture?: string;
    avatarInitials: string;
    provider: string;
  } | null => {
    if (!cookieHeader) return null;
    const parts = cookieHeader.split(';').map((c) => c.trim());
    const found = parts.find((p) => p.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (!found) return null;
    const rawVal = found.slice(SESSION_COOKIE_NAME.length + 1);
    const dotIdx = rawVal.indexOf('.');
    if (dotIdx <= 0) return null;
    const encoded = rawVal.slice(0, dotIdx);
    const sig = rawVal.slice(dotIdx + 1);
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    if (sig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    try {
      const data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      if (!data || typeof data.email !== 'string' || !data.email) return null;
      return {
        name: typeof data.name === 'string' && data.name ? data.name : data.email,
        email: data.email,
        picture: typeof data.picture === 'string' ? data.picture : undefined,
        avatarInitials: typeof data.avatarInitials === 'string' ? data.avatarInitials : 'U',
        provider: typeof data.provider === 'string' ? data.provider : 'google',
      };
    } catch {
      return null;
    }
  };

  app.get('/api/auth/status', (req, res) => {
    const { configured, redirectUri } = getOAuthConfig(req);
    const user = verifySessionCookie(req.headers.cookie);
    res.json({
      configured,
      redirectUri,
      authenticated: Boolean(user),
      user,
    });
  });

  app.get('/api/auth/url', (req, res) => {
    const { clientId, configured, redirectUri } = getOAuthConfig(req);
    if (!configured) {
      res.status(503).json({
        error:
          'Google OAuth credentials are not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment variables (Vercel / AI Studio Secrets).',
        missingCredentials: true,
        redirectUri,
      });
      return;
    }

    // Stateless HMAC-signed CSRF state token — safe across Vercel serverless cold starts
    const state = createSignedOAuthState(SESSION_SECRET);

    const providerAuthUrl =
      process.env.OAUTH_PROVIDER_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
      state,
    });

    res.json({ url: `${providerAuthUrl}?${params.toString()}`, redirectUri });
  });

  const handleOAuthCallback = async (req: express.Request, res: express.Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const oauthErr = typeof req.query.error === 'string' ? req.query.error : '';

    if (oauthErr) {
      res.status(400).send(`
        <html><body style="font-family:sans-serif;background:#0b0c10;color:#f8fafc;padding:24px;">
          <p>Sign-in cancelled or denied (${oauthErr}). You may close this window.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(oauthErr)} }, '*');
              window.close();
            }
          </script>
        </body></html>
      `);
      return;
    }

    if (!code || !state || !verifySignedOAuthState(state, SESSION_SECRET)) {
      res.status(400).send('Invalid or expired OAuth state/code.');
      return;
    }

    const { clientId, clientSecret, redirectUri, isHttps } = getOAuthConfig(req);
    if (!clientId || !clientSecret) {
      res.status(503).send('OAuth client credentials are not configured on the server.');
      return;
    }

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const tokenData = (await tokenRes.json()) as { access_token?: string; error_description?: string };
      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || 'Token exchange failed');
      }

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = (await profileRes.json()) as {
        name?: string;
        email?: string;
        picture?: string;
      };
      if (!profileRes.ok || !profile.email) {
        throw new Error('Unable to read verified email from Google profile.');
      }

      const displayName = (profile.name || profile.email).trim();
      const initials =
        displayName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase() ?? '')
          .join('') || profile.email[0].toUpperCase();

      const userPayload = {
        name: displayName,
        email: profile.email,
        picture: profile.picture,
        avatarInitials: initials,
        provider: 'google',
      };

      const cookieValue = signSessionCookie(userPayload);
      res.cookie(SESSION_COOKIE_NAME, cookieValue, {
        httpOnly: true,
        secure: isHttps,
        sameSite: isHttps ? 'none' : 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.send(`
        <html>
          <body style="font-family:sans-serif;background:#0b0c10;color:#f8fafc;padding:24px;">
            <p>Authentication successful. This window will close automatically.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
          </body>
        </html>
      `);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'OAuth verification failed';
      res.status(502).send(`
        <html><body style="font-family:sans-serif;background:#0b0c10;color:#f8fafc;padding:24px;">
          <p>OAuth Error: ${msg}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(msg)} }, '*');
              window.close();
            }
          </script>
        </body></html>
      `);
    }
  };

  app.get(['/auth/callback', '/auth/callback/', '/api/auth/callback', '/api/auth/callback/'], handleOAuthCallback);

  app.post('/api/auth/logout', (req, res) => {
    const { isHttps } = getOAuthConfig(req);
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? 'none' : 'lax',
      path: '/',
    });
    res.json({ ok: true });
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const body = (req.body || {}) as ChatRequestBody;
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      if (!message) {
        res.status(400).json({ error: 'Prompt message cannot be empty.' });
        return;
      }

      const customKey =
        typeof body.userApiKey === 'string' && body.userApiKey.trim().length > 0
          ? body.userApiKey.trim()
          : '';

      const apiKey = customKey || process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        res.status(400).json({
          error:
            'No Gemini API key is configured on the server. Enter your personal Gemini API key in Guest Mode or configure GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const locationLabel = body.location?.trim() || 'User-Calibrated Location';
      const aqiVal = typeof body.aqi === 'number' ? body.aqi : 'N/A';
      const pm25Val = typeof body.pm25 === 'number' ? body.pm25 : 'N/A';
      const tempVal = typeof body.temperatureC === 'number' ? `${body.temperatureC}°C` : 'N/A';
      const windVal = typeof body.windKmh === 'number' ? `${body.windKmh} km/h` : 'N/A';

      const contextPrefix = `[Active Telemetry Context — Location: ${locationLabel}, US AQI: ${aqiVal}, PM2.5: ${pm25Val} µg/m³, Temp: ${tempVal}, Wind: ${windVal}]`;
      const historyContents = Array.isArray(body.history)
        ? body.history
            .filter((item) => item && typeof item.text === 'string' && item.text.trim().length > 0)
            .slice(-8)
            .map((item) => ({
              role: item.role === 'model' ? 'model' : 'user',
              parts: [{ text: item.text }],
            }))
        : [];

      const contents = [
        ...historyContents,
        {
          role: 'user',
          parts: [{ text: `${contextPrefix}\n\n${message}` }],
        },
      ];

      const selectedModel =
        body.model === GEMINI_FLASH_LITE_MODEL ? GEMINI_FLASH_LITE_MODEL : GEMINI_FLASH_MODEL;

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });

      const replyText = response.text?.trim();
      if (!replyText) {
        res.status(502).json({ error: 'Gemini returned an empty response. Please try again.' });
        return;
      }

      res.json({
        text: replyText,
        model: selectedModel,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unexpected error calling Gemini API.';
      const status =
        errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('400')
          ? 400
          : errorMessage.includes('PERMISSION_DENIED') || errorMessage.includes('403')
            ? 403
            : errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('429')
              ? 429
              : 500;
      res.status(status).json({ error: errorMessage });
    }
  });

  const getGoogleMapsApiKey = (): string =>
    (
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.MAPS_API_KEY ||
      ''
    ).trim();

  const TRANSPARENT_1X1_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  );

  app.get('/api/maps/config', (_req, res) => {
    const apiKey = getGoogleMapsApiKey();
    res.json({
      configured: Boolean(apiKey),
      apiKey,
    });
  });

  app.get('/api/maps/aq-tile/:heatmapType/:z/:x/:y', async (req, res) => {
    const heatmapType = String(req.params.heatmapType || 'US_AQI');
    const allowedTypes = new Set([
      'US_AQI',
      'PM25_INDIGO_PERSIAN',
      'UAQI_RED_GREEN',
      'UAQI_INDIGO_PERSIAN',
    ]);
    if (!allowedTypes.has(heatmapType)) {
      res.status(400).json({ error: 'Unsupported AQ heatmap type.' });
      return;
    }

    const z = Number(req.params.z);
    const x = Number(req.params.x);
    const y = Number(req.params.y);
    if (!Number.isInteger(z) || z < 0 || z > 16 || !Number.isInteger(x) || !Number.isInteger(y)) {
      res.status(400).json({ error: 'Invalid tile coordinates.' });
      return;
    }
    const maxCoord = 1 << z;
    if (x < 0 || x >= maxCoord || y < 0 || y >= maxCoord) {
      res.setHeader('Content-Type', 'image/png');
      res.send(TRANSPARENT_1X1_PNG);
      return;
    }

    const mapsKey = getGoogleMapsApiKey();
    if (!mapsKey) {
      res.setHeader('Content-Type', 'image/png');
      res.send(TRANSPARENT_1X1_PNG);
      return;
    }

    try {
      const tileUrl = `https://airquality.googleapis.com/v1/mapTypes/${heatmapType}/heatmapTiles/${z}/${x}/${y}?key=${mapsKey}`;
      const tileRes = await fetch(tileUrl, {
        headers: { 'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio' },
      });

      if (tileRes.status === 429) {
        res.status(429).json({ error: 'RESOURCE_EXHAUSTED: Maps Air Quality quota exceeded.' });
        return;
      }

      if (!tileRes.ok) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=120');
        res.send(TRANSPARENT_1X1_PNG);
        return;
      }

      const buf = Buffer.from(await tileRes.arrayBuffer());
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(buf);
    } catch {
      res.setHeader('Content-Type', 'image/png');
      res.send(TRANSPARENT_1X1_PNG);
    }
  });

  // 5-minute cached Pan-India 53-station AQI + Meteorology grid covering whole India
  let indiaGridCache: { fetchedAt: number; nodes: Array<Record<string, unknown>> } | null = null;
  const INDIA_GRID_TTL_MS = 5 * 60 * 1000;

  app.get('/api/maps/india-grid', async (_req, res) => {
    if (indiaGridCache && Date.now() - indiaGridCache.fetchedAt < INDIA_GRID_TTL_MS) {
      res.json({ nodes: indiaGridCache.nodes, cached: true });
      return;
    }

    try {
      const mid = Math.ceil(PAN_INDIA_AQI_STATIONS.length / 2);
      const chunks = [PAN_INDIA_AQI_STATIONS.slice(0, mid), PAN_INDIA_AQI_STATIONS.slice(mid)];

      const fetchChunk = async (stations: typeof PAN_INDIA_AQI_STATIONS) => {
        const lats = stations.map((s) => s.lat.toFixed(4)).join(',');
        const lons = stations.map((s) => s.lon.toFixed(4)).join(',');
        const [aqRes, wxRes] = await Promise.all([
          fetch(
            `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=us_aqi,pm2_5,nitrogen_dioxide,ozone`
          ),
          fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover,weather_code`
          ),
        ]);
        const aqJson = aqRes.ok ? await aqRes.json() : [];
        const wxJson = wxRes.ok ? await wxRes.json() : [];
        const aqArr = Array.isArray(aqJson) ? aqJson : [aqJson];
        const wxArr = Array.isArray(wxJson) ? wxJson : [wxJson];

        return stations.map((st, idx) => {
          const aqC = aqArr[idx]?.current ?? {};
          const wxC = wxArr[idx]?.current ?? {};
          const windDirDeg = round0(wxC.wind_direction_10m, 0);
          const wmo = round0(wxC.weather_code, 0);
          return {
            id: `india-${st.id}`,
            name: st.name,
            state: st.state,
            region: st.region,
            isIndiaWide: true,
            lat: st.lat,
            lon: st.lon,
            aqi: round0(aqC.us_aqi, 65),
            pm25: round1(aqC.pm2_5, 22),
            no2: round1(aqC.nitrogen_dioxide, 14),
            o3: round1(aqC.ozone, 36),
            temperatureC: round1(wxC.temperature_2m, 28),
            windKmh: round1(wxC.wind_speed_10m, 10),
            windDirDeg,
            windDir: degreesToCardinal(windDirDeg),
            precipMm: round1(wxC.precipitation, 0),
            cloudCoverPercent: round0(wxC.cloud_cover, 20),
            weatherLabel: getWmoWeatherLabel(wmo),
          };
        });
      };

      const [firstHalf, secondHalf] = await Promise.all(chunks.map(fetchChunk));
      const nodes = [...firstHalf, ...secondHalf];
      indiaGridCache = { fetchedAt: Date.now(), nodes };
      res.json({ nodes, cached: false });
    } catch (err: unknown) {
      if (indiaGridCache) {
        res.json({ nodes: indiaGridCache.nodes, cached: true });
        return;
      }
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to load Pan-India AQI grid.',
      });
    }
  });

  app.get('/api/maps/layer-grid', async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const rawSpanKm = Number(req.query.spanKm ?? 22);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({ error: 'Valid lat and lon are required.' });
      return;
    }

    const spanKm = Math.max(4, Math.min(180, Number.isFinite(rawSpanKm) ? rawSpanKm : 22));
    const dLat = spanKm / 111;
    const cosLat = Math.max(0.25, Math.abs(Math.cos((lat * Math.PI) / 180)));
    const dLon = spanKm / (111 * cosLat);

    const offsets = [
      { id: 'nw', dLat: dLat, dLon: -dLon },
      { id: 'n', dLat: dLat, dLon: 0 },
      { id: 'ne', dLat: dLat, dLon: dLon },
      { id: 'w', dLat: 0, dLon: -dLon },
      { id: 'c', dLat: 0, dLon: 0 },
      { id: 'e', dLat: 0, dLon: dLon },
      { id: 'sw', dLat: -dLat, dLon: -dLon },
      { id: 's', dLat: -dLat, dLon: 0 },
      { id: 'se', dLat: -dLat, dLon: dLon },
    ];

    const coords = offsets.map((o) => ({
      id: o.id,
      lat: Number(Math.max(-85, Math.min(85, lat + o.dLat)).toFixed(4)),
      lon: Number((((lon + o.dLon + 540) % 360) - 180).toFixed(4)),
    }));

    const latsParam = coords.map((c) => c.lat).join(',');
    const lonsParam = coords.map((c) => c.lon).join(',');

    try {
      const [aqRes, wxRes] = await Promise.all([
        fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latsParam}&longitude=${lonsParam}&current=us_aqi,pm2_5,nitrogen_dioxide,ozone`
        ),
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latsParam}&longitude=${lonsParam}&current=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover,weather_code`
        ),
      ]);

      const aqJson = aqRes.ok ? await aqRes.json() : [];
      const wxJson = wxRes.ok ? await wxRes.json() : [];
      const aqArr = Array.isArray(aqJson) ? aqJson : [aqJson];
      const wxArr = Array.isArray(wxJson) ? wxJson : [wxJson];

      const nodes = coords.map((pt, idx) => {
        const aqC = aqArr[idx]?.current ?? {};
        const wxC = wxArr[idx]?.current ?? {};
        const windDirDeg = round0(wxC.wind_direction_10m, 0);
        const wmo = round0(wxC.weather_code, 0);
        return {
          id: pt.id,
          lat: pt.lat,
          lon: pt.lon,
          aqi: round0(aqC.us_aqi, 25),
          pm25: round1(aqC.pm2_5, 8),
          no2: round1(aqC.nitrogen_dioxide, 10),
          o3: round1(aqC.ozone, 30),
          temperatureC: round1(wxC.temperature_2m, 18),
          windKmh: round1(wxC.wind_speed_10m, 8),
          windDirDeg,
          windDir: degreesToCardinal(windDirDeg),
          precipMm: round1(wxC.precipitation, 0),
          cloudCoverPercent: round0(wxC.cloud_cover, 15),
          weatherLabel: getWmoWeatherLabel(wmo),
        };
      });

      res.json({ nodes });
    } catch (err: unknown) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to load spatial layer telemetry.',
      });
    }
  });

  const sampleBatchCorridorTelemetry = async (points: LatLngPoint[]): Promise<RouteSampleTelemetry[]> => {
    if (points.length === 0) return [];
    const lats = points.map((p) => p.lat.toFixed(4)).join(',');
    const lons = points.map((p) => p.lon.toFixed(4)).join(',');

    try {
      const [aqRes, wxRes] = await Promise.all([
        fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=us_aqi,pm2_5`
        ),
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation`
        ),
      ]);
      const aqData = aqRes.ok ? await aqRes.json() : [];
      const wxData = wxRes.ok ? await wxRes.json() : [];
      const aqArr = Array.isArray(aqData) ? aqData : [aqData];
      const wxArr = Array.isArray(wxData) ? wxData : [wxData];

      return points.map((pt, idx) => {
        const aqC = aqArr[idx]?.current ?? {};
        const wxC = wxArr[idx]?.current ?? {};
        return {
          lat: pt.lat,
          lon: pt.lon,
          aqi: round0(aqC.us_aqi, 30),
          pm25: round1(aqC.pm2_5, 10),
          temperatureC: round1(wxC.temperature_2m, 18),
          windKmh: round1(wxC.wind_speed_10m, 8),
          windDirDeg: round0(wxC.wind_direction_10m, 0),
          precipMm: round1(wxC.precipitation, 0),
        };
      });
    } catch {
      return points.map((pt) => ({
        lat: pt.lat,
        lon: pt.lon,
        aqi: 30,
        pm25: 10,
        temperatureC: 18,
        windKmh: 8,
        windDirDeg: 0,
        precipMm: 0,
      }));
    }
  };

  interface RawRoadCandidate {
    id: string;
    label: string;
    isDefaultArterial?: boolean;
    isRoadSnapped?: boolean;
    distanceKm: number;
    durationMin: number;
    encodedPolyline?: string;
    path: LatLngPoint[];
    steps?: RouteStepSegment[];
  }

  const GOOGLE_ROUTES_FIELD_MASK = [
    'routes.distanceMeters',
    'routes.duration',
    'routes.polyline.encodedPolyline',
    'routes.routeLabels',
    'routes.description',
    'routes.legs.steps.distanceMeters',
    'routes.legs.steps.staticDuration',
    'routes.legs.steps.polyline.encodedPolyline',
    'routes.legs.steps.startLocation',
    'routes.legs.steps.endLocation',
    'routes.legs.steps.navigationInstruction',
    'routes.legs.steps.travelMode',
    'routes.legs.steps.transitDetails',
  ].join(',');

  const parseGoogleSteps = (legs: any[] | undefined): RouteStepSegment[] => {
    const out: RouteStepSegment[] = [];
    if (!Array.isArray(legs)) return out;
    let idxCounter = 0;
    for (const leg of legs) {
      const steps = Array.isArray(leg?.steps) ? leg.steps : [];
      for (const st of steps) {
        const startLat = st?.startLocation?.latLng?.latitude;
        const startLon = st?.startLocation?.latLng?.longitude;
        const endLat = st?.endLocation?.latLng?.latitude;
        const endLon = st?.endLocation?.latLng?.longitude;
        const encoded = st?.polyline?.encodedPolyline ?? '';
        const decoded = encoded ? decodeEncodedPolyline(encoded) : [];
        const startLoc =
          Number.isFinite(startLat) && Number.isFinite(startLon)
            ? { lat: Number(startLat.toFixed(5)), lon: Number(startLon.toFixed(5)) }
            : decoded[0] ?? { lat: 0, lon: 0 };
        const endLoc =
          Number.isFinite(endLat) && Number.isFinite(endLon)
            ? { lat: Number(endLat.toFixed(5)), lon: Number(endLon.toFixed(5)) }
            : decoded[decoded.length - 1] ?? startLoc;

        const td = st?.transitDetails;
        const transitLine = td?.transitLine;
        const transitInfo = td
          ? {
              lineName: String(transitLine?.name || transitLine?.nameShort || 'Transit Line'),
              shortName: transitLine?.nameShort ? String(transitLine.nameShort) : undefined,
              vehicleType: String(transitLine?.vehicle?.type || transitLine?.vehicle?.name?.text || 'TRANSIT'),
              color: transitLine?.color ? String(transitLine.color) : undefined,
              departureStop: String(td?.stopDetails?.departureStop?.name || 'Boarding Stop'),
              arrivalStop: String(td?.stopDetails?.arrivalStop?.name || 'Alighting Stop'),
              stopCount: typeof td?.stopCount === 'number' ? td.stopCount : undefined,
              headsign: td?.headsign ? String(td.headsign) : undefined,
            }
          : undefined;

        const durSec = Number(String(st?.staticDuration ?? '0s').replace('s', '')) || 0;
        const instruction =
          String(st?.navigationInstruction?.instructions || '').trim() ||
          (transitInfo
            ? `Board ${transitInfo.shortName || transitInfo.lineName} at ${transitInfo.departureStop} → ${transitInfo.arrivalStop}`
            : `Continue via ${String(st?.travelMode || 'road').toLowerCase()}`);

        out.push({
          stepIndex: idxCounter++,
          instruction,
          maneuver: st?.navigationInstruction?.maneuver ? String(st.navigationInstruction.maneuver) : undefined,
          travelMode: String(st?.travelMode || 'DRIVE'),
          distanceMeters: Number(st?.distanceMeters || 0),
          durationSec: durSec,
          startLocation: startLoc,
          endLocation: endLoc,
          path: decoded.length >= 2 ? decoded : [startLoc, endLoc],
          transitInfo,
        });
      }
    }
    return out;
  };

  const callGoogleComputeRoutes = async (args: {
    origin: LatLngPoint;
    destination: LatLngPoint;
    travelMode: GoogleTravelMode;
    mapsKey: string;
    viaWaypoint?: LatLngPoint;
    computeAlternativeRoutes?: boolean;
  }): Promise<any[]> => {
    const { origin, destination, travelMode, mapsKey, viaWaypoint, computeAlternativeRoutes = true } = args;
    const payload: Record<string, unknown> = {
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lon } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lon } } },
      travelMode,
      units: 'METRIC',
      languageCode: 'en-US',
    };

    if (travelMode === 'DRIVE' || travelMode === 'TWO_WHEELER') {
      payload.routingPreference = 'TRAFFIC_AWARE';
    }
    if (travelMode === 'TRANSIT') {
      payload.transitPreferences = {
        routingPreference: 'LESS_WALKING',
        allowedTravelModes: ['RAIL', 'SUBWAY', 'TRAIN', 'BUS'],
      };
      payload.computeAlternativeRoutes = computeAlternativeRoutes;
    } else if (viaWaypoint) {
      payload.intermediates = [
        {
          location: { latLng: { latitude: viaWaypoint.lat, longitude: viaWaypoint.lon } },
          via: true,
        },
      ];
      payload.computeAlternativeRoutes = false;
    } else {
      payload.computeAlternativeRoutes = computeAlternativeRoutes;
    }

    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': mapsKey,
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        'X-Goog-FieldMask': GOOGLE_ROUTES_FIELD_MASK,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return [];
    const data = (await res.json()) as { routes?: any[] };
    return Array.isArray(data.routes) ? data.routes : [];
  };

  const fetchOsrmRoadFallback = async (
    origin: LatLngPoint,
    destination: LatLngPoint,
    transitMode: TransitMode
  ): Promise<RawRoadCandidate[]> => {
    try {
      const profile = transitMode === 'walk' ? 'foot' : transitMode === 'cycle' ? 'bike' : 'driving';
      const url = `https://router.project-osrm.org/route/v1/${profile}/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&geometries=polyline&alternatives=true&steps=true`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = (await res.json()) as {
        routes?: Array<{
          distance?: number;
          duration?: number;
          geometry?: string;
          legs?: Array<{
            summary?: string;
            steps?: Array<{
              name?: string;
              distance?: number;
              duration?: number;
              geometry?: string;
              maneuver?: { type?: string; modifier?: string; location?: [number, number] };
            }>;
          }>;
        }>;
      };
      return (data.routes ?? []).slice(0, 3).map((r, idx) => {
        const decoded = r.geometry ? decodeEncodedPolyline(r.geometry) : [origin, destination];
        const distKm = Number(((r.distance ?? 0) / 1000).toFixed(1)) || measurePathDistanceKm(decoded);
        const durMin =
          r.duration && r.duration > 0
            ? Math.max(2, Math.round(r.duration / 60))
            : estimateTransitDurationMin(distKm, transitMode);
        const summaryName = r.legs?.[0]?.summary || '';
        const steps: RouteStepSegment[] = (r.legs?.[0]?.steps ?? []).map((st, sIdx) => {
          const stPath = st.geometry ? decodeEncodedPolyline(st.geometry) : [];
          const loc = st.maneuver?.location
            ? { lat: Number(st.maneuver.location[1].toFixed(5)), lon: Number(st.maneuver.location[0].toFixed(5)) }
            : stPath[0] ?? origin;
          const endLoc = stPath[stPath.length - 1] ?? loc;
          const roadName = st.name?.trim() || 'arterial road';
          const action = st.maneuver?.type ? `${st.maneuver.type} ${st.maneuver.modifier || ''}`.trim() : 'Continue';
          return {
            stepIndex: sIdx,
            instruction: `${action} onto ${roadName}`.trim(),
            maneuver: st.maneuver?.type,
            travelMode: mapTransitModeToGoogleTravelMode(transitMode),
            distanceMeters: Math.round(st.distance ?? 0),
            durationSec: Math.round(st.duration ?? 0),
            startLocation: loc,
            endLocation: endLoc,
            path: stPath.length >= 2 ? stPath : [loc, endLoc],
          };
        });
        return {
          id: `osrm-${idx + 1}`,
          label: summaryName ? `${idx === 0 ? 'Primary' : 'Alt'} via ${summaryName}` : idx === 0 ? 'Primary Highway Corridor' : `Alternate Highway ${idx}`,
          isDefaultArterial: idx === 0,
          isRoadSnapped: true,
          distanceKm: distKm,
          durationMin: durMin,
          encodedPolyline: r.geometry,
          path: decoded,
          steps,
        };
      });
    } catch {
      return [];
    }
  };

  const fetchRoadAndTransitCandidates = async (params: {
    origin: LatLngPoint;
    destination: LatLngPoint;
    transitMode: TransitMode;
    windDirDeg: number;
  }): Promise<{
    candidates: RawRoadCandidate[];
    googleTravelMode: GoogleTravelMode;
    routingSource: 'google_routes' | 'osrm_roads' | 'corridor_fallback';
  }> => {
    const { origin, destination, transitMode, windDirDeg } = params;
    const mapsKey = getGoogleMapsApiKey();
    const googleTravelMode = mapTransitModeToGoogleTravelMode(transitMode);
    const rawCandidates: RawRoadCandidate[] = [];
    let routingSource: 'google_routes' | 'osrm_roads' | 'corridor_fallback' = 'corridor_fallback';

    const convertGoogleRoute = (r: any, id: string, defaultLabel: string, isDefault: boolean): RawRoadCandidate | null => {
      const encoded = r?.polyline?.encodedPolyline ?? '';
      const decoded = decodeEncodedPolyline(encoded);
      const steps = parseGoogleSteps(r?.legs);
      const stepCombinedPath =
        decoded.length >= 2
          ? decoded
          : steps.flatMap((s) => s.path);
      if (stepCombinedPath.length < 2) return null;
      const distKm =
        Number(((r?.distanceMeters ?? 0) / 1000).toFixed(1)) || measurePathDistanceKm(stepCombinedPath);
      const durSec = Number(String(r?.duration ?? '0s').replace('s', ''));
      const durMin =
        durSec > 0 ? Math.max(2, Math.round(durSec / 60)) : estimateTransitDurationMin(distKm, transitMode);
      const transitSummary = steps
        .filter((s) => s.transitInfo)
        .map((s) => s.transitInfo!.shortName || s.transitInfo!.lineName)
        .slice(0, 2)
        .join(' → ');

      const label = transitSummary
        ? `${isDefault ? 'Transit' : 'Alt Transit'} via ${transitSummary}`
        : r?.description
          ? `${isDefault ? 'Primary' : 'Alt'} via ${r.description}`
          : defaultLabel;

      return {
        id,
        label,
        isDefaultArterial: isDefault,
        isRoadSnapped: true,
        distanceKm: distKm,
        durationMin: durMin,
        encodedPolyline: encoded,
        path: stepCombinedPath,
        steps,
      };
    };

    if (mapsKey) {
      try {
        let primaryRoutes = await callGoogleComputeRoutes({
          origin,
          destination,
          travelMode: googleTravelMode,
          mapsKey,
          computeAlternativeRoutes: true,
        });

        // If TRANSIT returns 0 routes (e.g. intercity area without GTFS schedule), fall back to DRIVE Google highway route
        let effectiveMode: GoogleTravelMode = googleTravelMode;
        if (primaryRoutes.length === 0 && googleTravelMode === 'TRANSIT') {
          primaryRoutes = await callGoogleComputeRoutes({
            origin,
            destination,
            travelMode: 'DRIVE',
            mapsKey,
            computeAlternativeRoutes: true,
          });
          effectiveMode = 'DRIVE';
        }

        primaryRoutes.slice(0, 3).forEach((r, idx) => {
          const isDefault = idx === 0 || (r.routeLabels ?? []).includes('DEFAULT_ROUTE');
          const cand = convertGoogleRoute(
            r,
            `groute-${idx + 1}`,
            isDefault ? 'Primary Google Corridor' : `Alternate Google Route ${idx}`,
            isDefault
          );
          if (cand) rawCandidates.push(cand);
        });

        // If non-TRANSIT returned only 1 route, query a 2nd real road-snapped route via upwind `via: true` waypoint
        if (rawCandidates.length === 1 && effectiveMode !== 'TRANSIT') {
          const viaUpwind = computeUpwindViaWaypoint(origin, destination, windDirDeg, 1);
          const viaRoutes = await callGoogleComputeRoutes({
            origin,
            destination,
            travelMode: effectiveMode,
            mapsKey,
            viaWaypoint: viaUpwind,
            computeAlternativeRoutes: false,
          });
          if (viaRoutes[0]) {
            const altCand = convertGoogleRoute(
              viaRoutes[0],
              'groute-upwind-via',
              'Upwind Clean-Air Highway Bypass',
              false
            );
            if (altCand) rawCandidates.push(altCand);
          }
        }

        if (rawCandidates.length > 0) {
          routingSource = 'google_routes';
        }
      } catch {
        // fall through to OSRM road fallback
      }
    }

    // Fallback to OSRM real road routing so we never draw a straight geodesic line when roads exist
    if (rawCandidates.length === 0) {
      const osrmCandidates = await fetchOsrmRoadFallback(origin, destination, transitMode);
      if (osrmCandidates.length > 0) {
        rawCandidates.push(...osrmCandidates);
        routingSource = 'osrm_roads';
      }
    }

    // Final safety fallback if both Google Routes & OSRM fail (e.g. ocean/offline)
    if (rawCandidates.length === 0) {
      const geometricCorridors = buildCorridorCandidatePaths(origin, destination, windDirDeg);
      const baseKm = Math.max(0.8, haversineKm(origin.lat, origin.lon, destination.lat, destination.lon));
      geometricCorridors.forEach((corridor) => {
        const distKm = Number((baseKm * corridor.detourFactor).toFixed(1));
        rawCandidates.push({
          id: corridor.id,
          label: corridor.label,
          isDefaultArterial: corridor.isDefaultArterial,
          isRoadSnapped: false,
          distanceKm: distKm,
          durationMin: estimateTransitDurationMin(distKm, transitMode),
          path: corridor.path,
        });
      });
    }

    return { candidates: rawCandidates, googleTravelMode, routingSource };
  };

  const buildOptimizedRoutePayload = async (params: {
    origin: LatLngPoint;
    destination: LatLngPoint;
    originLabel: string;
    destinationLabel: string;
    transitMode: TransitMode;
    sampleCount: number;
    userApiKey?: string;
    isLongRangeBackground?: boolean;
    skipGeminiSummary?: boolean;
  }) => {
    const {
      origin,
      destination,
      originLabel,
      destinationLabel,
      transitMode,
      sampleCount,
      userApiKey,
      isLongRangeBackground,
      skipGeminiSummary,
    } = params;

    const centerSample = await sampleBatchCorridorTelemetry([origin]);
    const avgWindDir = centerSample[0]?.windDirDeg ?? 0;

    const { candidates: rawCandidates, googleTravelMode, routingSource } =
      await fetchRoadAndTransitCandidates({
        origin,
        destination,
        transitMode,
        windDirDeg: avgWindDir,
      });

    const sampledInputs: RouteCandidateInput[] = [];
    const allSamplesPoints: LatLngPoint[] = [];
    const perRouteCounts: number[] = [];

    for (const rc of rawCandidates) {
      const pts = samplePathCoordinates(rc.path, sampleCount);
      perRouteCounts.push(pts.length);
      allSamplesPoints.push(...pts);
    }

    const allTelemetry = await sampleBatchCorridorTelemetry(allSamplesPoints);
    let cursor = 0;
    rawCandidates.forEach((rc, idx) => {
      const count = perRouteCounts[idx] ?? 0;
      const slice = allTelemetry.slice(cursor, cursor + count);
      cursor += count;
      sampledInputs.push({
        id: rc.id,
        label: rc.label,
        isDefaultArterial: rc.isDefaultArterial,
        isRoadSnapped: rc.isRoadSnapped,
        distanceKm: rc.distanceKm,
        durationMin: rc.durationMin,
        encodedPolyline: rc.encodedPolyline,
        path: rc.path,
        steps: rc.steps,
        samples: slice,
      });
    });

    const summary = selectOptimalLowSmogRoute(sampledInputs, transitMode);
    const directKm = Number(haversineKm(origin.lat, origin.lon, destination.lat, destination.lon).toFixed(1));
    const journeyPoints = buildJourneyPointsFromRoute(
      summary.optimalRoute,
      summary.baselineRoute,
      originLabel,
      destinationLabel
    );

    let geminiAdvisory = summary.summaryText;
    let recommendedWaypoints: string[] = [
      `Depart ${originLabel} along ${summary.optimalRoute.label}`,
      `Maintain ${summary.optimalRoute.avgAqi} avg US AQI exposure (${summary.optimalRoute.avgPm25} µg/m³ PM2.5)`,
      `Arrive ${destinationLabel} in ~${summary.optimalRoute.durationMin} min (${summary.optimalRoute.distanceKm} km)`,
    ];

    const geminiKey = (userApiKey || '').trim() || process.env.GEMINI_API_KEY || '';
    if (geminiKey && !skipGeminiSummary) {
      try {
        const ai = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const candidateDigest = summary.candidates
          .map(
            (c) =>
              `- ${c.label}${c.isOptimal ? ' [SELECTED OPTIMAL]' : ''}: ${c.distanceKm} km, ${c.durationMin} min, avg AQI ${c.avgAqi}, peak AQI ${c.peakAqi}, avg PM2.5 ${c.avgPm25} µg/m³, inhaled PM2.5 ${c.inhaledUg} µg`
          )
          .join('\n');

        const prompt = `You have live access to the Vayu Index Google Map spatial air-quality and meteorology layers for a ${
          isLongRangeBackground ? 'long-range background (>100 km)' : 'regional (<=100 km)'
        } trip from "${originLabel}" (${origin.lat.toFixed(3)}, ${origin.lon.toFixed(3)}) to "${destinationLabel}" (${destination.lat.toFixed(3)}, ${destination.lon.toFixed(3)}) via ${googleTravelMode} (${transitMode}).
Direct distance: ${directKm} km. Routing source: ${routingSource}.
Surface wind at origin: ${centerSample[0]?.windKmh ?? 10} km/h from ${centerSample[0]?.windDirDeg ?? 0}°, temp ${centerSample[0]?.temperatureC ?? 20}°C, precip ${centerSample[0]?.precipMm ?? 0} mm.

Evaluated real highway/rail route candidates from Google Maps & spatial telemetry:
${candidateDigest}

Return ONLY valid JSON with two keys:
1. "advisory": 2 concise clinical sentences explaining why "${summary.optimalRoute.label}" minimizes pollution exposure while staying time-efficient, referencing the actual AQI/PM2.5 and wind/weather numbers above.
2. "waypoints": an array of 3 short actionable navigation steps naming clean-air timing, filtration/ventilation advice, and expected arrival delta.`;

        const routeModel = isLongRangeBackground ? GEMINI_FLASH_MODEL : GEMINI_FLASH_LITE_MODEL;
        const aiResp = await ai.models.generateContent({
          model: routeModel,
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });

        const rawJson = aiResp.text?.trim() || '';
        const parsed = JSON.parse(rawJson) as { advisory?: string; waypoints?: string[] };
        if (parsed.advisory && typeof parsed.advisory === 'string') {
          geminiAdvisory = parsed.advisory.trim();
        }
        if (Array.isArray(parsed.waypoints) && parsed.waypoints.length > 0) {
          recommendedWaypoints = parsed.waypoints.filter((w) => typeof w === 'string' && w.trim()).slice(0, 4);
        }
      } catch {
        // retain deterministic map-telemetry summary if Gemini call fails
      }
    }

    return {
      distanceKm: summary.optimalRoute.distanceKm || directKm,
      transitMode,
      googleTravelMode,
      routingSource,
      optimalRouteId: summary.optimalRoute.id,
      baselineRouteId: summary.baselineRoute.id,
      aqiReductionPercent: summary.aqiReductionPercent,
      pm25ReductionPercent: summary.pm25ReductionPercent,
      exposureReductionPercent: summary.exposureReductionPercent,
      timeDeltaMin: summary.timeDeltaMin,
      summaryText: summary.summaryText,
      geminiAdvisory,
      recommendedWaypoints,
      journeyPoints,
      candidates: summary.candidates,
      computedAt: new Date().toISOString(),
    };
  };

  /** Direct Google Maps multi-mode road/rail directions for instant map display (all users) */
  app.post('/api/maps/directions', async (req, res) => {
    const body = (req.body || {}) as {
      origin?: LatLngPoint;
      destination?: LatLngPoint;
      originLabel?: string;
      destinationLabel?: string;
      transitMode?: TransitMode;
    };

    const origin = body.origin;
    const destination = body.destination;
    if (
      !origin ||
      !destination ||
      !Number.isFinite(origin.lat) ||
      !Number.isFinite(origin.lon) ||
      !Number.isFinite(destination.lat) ||
      !Number.isFinite(destination.lon)
    ) {
      res.status(400).json({ error: 'Valid origin and destination coordinates are required.' });
      return;
    }

    try {
      const result = await buildOptimizedRoutePayload({
        origin,
        destination,
        originLabel: String(body.originLabel || 'Origin'),
        destinationLabel: String(body.destinationLabel || 'Destination'),
        transitMode: body.transitMode || 'drive',
        sampleCount: 5,
        skipGeminiSummary: true,
      });
      res.json({ result });
    } catch (err: unknown) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to fetch Google Maps directions.',
      });
    }
  });

  /** AI "Explain Journey" — explains why path was chosen and point-by-point where it was modified */
  app.post('/api/maps/explain-journey', async (req, res) => {
    const body = (req.body || {}) as {
      originLabel?: string;
      destinationLabel?: string;
      transitMode?: TransitMode;
      optimalLabel?: string;
      baselineLabel?: string;
      optimalAvgAqi?: number;
      baselineAvgAqi?: number;
      optimalDurationMin?: number;
      baselineDurationMin?: number;
      distanceKm?: number;
      journeyPoints?: JourneyExplanationPoint[];
      userApiKey?: string;
    };

    const points = Array.isArray(body.journeyPoints) ? body.journeyPoints : [];
    if (points.length === 0) {
      res.status(400).json({ error: 'Journey points are required to generate an explanation.' });
      return;
    }

    const originLabel = String(body.originLabel || 'Origin');
    const destinationLabel = String(body.destinationLabel || 'Destination');
    const optimalLabel = String(body.optimalLabel || 'Selected Optimal Corridor');
    const baselineLabel = String(body.baselineLabel || 'Standard Arterial');
    const modifiedPoints = points.filter((p) => p.isModified);

    const fallbackOverall = `Selected ${optimalLabel} (${body.optimalAvgAqi ?? '--'} avg US AQI, ${body.optimalDurationMin ?? '--'} min) over ${baselineLabel} (${body.baselineAvgAqi ?? '--'} avg US AQI, ${body.baselineDurationMin ?? '--'} min) to minimize particulate exposure along real highway/rail alignments while preserving travel efficiency.`;
    const fallbackModSummary =
      modifiedPoints.length > 0
        ? `Path modified at ${modifiedPoints.length} journey checkpoint${modifiedPoints.length > 1 ? 's' : ''}: ${modifiedPoints.map((p) => `#${p.pointIndex} (${p.kmFromStart} km)`).join(', ')}.`
        : `No detour was necessary — ${optimalLabel} already aligns with the cleanest wind-scoured corridor from start to finish.`;

    const geminiKey = (body.userApiKey || '').trim() || process.env.GEMINI_API_KEY || '';
    if (!geminiKey) {
      res.json({
        explanation: {
          overallRationale: fallbackOverall,
          modificationSummary: fallbackModSummary,
          points,
          modelUsed: 'telemetry-heuristic',
        },
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const pointsDigest = points
        .map(
          (p) =>
            `Point #${p.pointIndex} (${p.kmFromStart} km) — "${p.title}" | segment=${p.segmentType} | AQI=${p.aqi} (baseline=${p.baselineAqi ?? p.aqi}) | PM2.5=${p.pm25} µg/m³ | modified=${p.isModified ? `YES (${p.modificationBadge || 'diverted'})` : 'NO'}`
        )
        .join('\n');

      const prompt = `You are Vayu Index's Atmospheric Route Explainer.
Trip: "${originLabel}" → "${destinationLabel}" (${body.distanceKm ?? '--'} km, mode: ${body.transitMode || 'drive'}).
Chosen Route: "${optimalLabel}" (${body.optimalAvgAqi ?? '--'} avg AQI, ${body.optimalDurationMin ?? '--'} min).
Baseline Arterial: "${baselineLabel}" (${body.baselineAvgAqi ?? '--'} avg AQI, ${body.baselineDurationMin ?? '--'} min).

Chronological Journey Points:
${pointsDigest}

Return ONLY valid JSON with:
1. "overallRationale": 2 crisp sentences explaining why this road/rail path was chosen overall (pollution vs time balance).
2. "modificationSummary": 1 crisp sentence explicitly naming at which Journey Point numbers (e.g., Point #2, Point #3) the path was modified or diverted and why.
3. "pointExplanations": array of objects { "pointIndex": number, "explanation": string } — one concise, specific 1-sentence explanation per Journey Point explaining the road/rail segment, local AQI/PM2.5 condition, and (if modified=YES) exactly why the path shifted at that point.`;

      const aiResp = await ai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });

      const parsed = JSON.parse(aiResp.text?.trim() || '{}') as {
        overallRationale?: string;
        modificationSummary?: string;
        pointExplanations?: Array<{ pointIndex: number; explanation: string }>;
      };

      const expByIdx = new Map<number, string>();
      if (Array.isArray(parsed.pointExplanations)) {
        for (const item of parsed.pointExplanations) {
          if (item && typeof item.pointIndex === 'number' && typeof item.explanation === 'string' && item.explanation.trim()) {
            expByIdx.set(item.pointIndex, item.explanation.trim());
          }
        }
      }

      const enrichedPoints = points.map((p) => ({
        ...p,
        explanation: expByIdx.get(p.pointIndex) || p.explanation,
      }));

      res.json({
        explanation: {
          overallRationale:
            typeof parsed.overallRationale === 'string' && parsed.overallRationale.trim()
              ? parsed.overallRationale.trim()
              : fallbackOverall,
          modificationSummary:
            typeof parsed.modificationSummary === 'string' && parsed.modificationSummary.trim()
              ? parsed.modificationSummary.trim()
              : fallbackModSummary,
          points: enrichedPoints,
          modelUsed: GEMINI_FLASH_MODEL,
        },
      });
    } catch {
      res.json({
        explanation: {
          overallRationale: fallbackOverall,
          modificationSummary: fallbackModSummary,
          points,
          modelUsed: 'telemetry-heuristic',
        },
      });
    }
  });

  app.post('/api/maps/optimize-route', async (req, res) => {
    const user = verifySessionCookie(req.headers.cookie);
    if (!user) {
      res.status(401).json({ error: 'Google OAuth sign-in is required to grant Gemini map routing access.' });
      return;
    }

    const body = (req.body || {}) as {
      origin?: LatLngPoint;
      destination?: LatLngPoint;
      originLabel?: string;
      destinationLabel?: string;
      transitMode?: TransitMode;
      userApiKey?: string;
    };

    const origin = body.origin;
    const destination = body.destination;
    if (
      !origin ||
      !destination ||
      !Number.isFinite(origin.lat) ||
      !Number.isFinite(origin.lon) ||
      !Number.isFinite(destination.lat) ||
      !Number.isFinite(destination.lon)
    ) {
      res.status(400).json({ error: 'Valid origin and destination coordinates are required.' });
      return;
    }

    const directKm = Number(haversineKm(origin.lat, origin.lon, destination.lat, destination.lon).toFixed(1));
    if (directKm > SYNC_ROUTE_MAX_KM) {
      res.status(409).json({
        requiresBackgroundTask: true,
        distanceKm: directKm,
        error: `Distance (${directKm} km) exceeds the 100 km synchronous routing cap. Launch a Background Gemini Task instead.`,
      });
      return;
    }

    try {
      const result = await buildOptimizedRoutePayload({
        origin,
        destination,
        originLabel: String(body.originLabel || 'Origin Pin'),
        destinationLabel: String(body.destinationLabel || 'Destination Pin'),
        transitMode: body.transitMode || 'drive',
        sampleCount: 6,
        userApiKey: body.userApiKey,
        isLongRangeBackground: false,
      });
      res.json({ result });
    } catch (err: unknown) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to optimize route.',
      });
    }
  });

  interface StoredBackgroundTask {
    id: string;
    ownerEmail: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: number;
    stage: string;
    originLabel: string;
    destinationLabel: string;
    origin: LatLngPoint;
    destination: LatLngPoint;
    distanceKm: number;
    transitMode: TransitMode;
    createdAt: string;
    completedAt?: string;
    error?: string;
    result?: Awaited<ReturnType<typeof buildOptimizedRoutePayload>>;
  }

  const backgroundRouteTasks = new Map<string, StoredBackgroundTask>();

  const toPublicTask = (t: StoredBackgroundTask) => ({
    id: t.id,
    status: t.status,
    progress: t.progress,
    stage: t.stage,
    originLabel: t.originLabel,
    destinationLabel: t.destinationLabel,
    origin: t.origin,
    destination: t.destination,
    distanceKm: t.distanceKm,
    transitMode: t.transitMode,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
    error: t.error,
    result: t.result,
  });

  const executeBackgroundRouteTask = async (taskId: string, userApiKey?: string) => {
    const task = backgroundRouteTasks.get(taskId);
    if (!task) return;

    try {
      task.status = 'running';
      task.progress = 30;
      task.stage = `Scanning ${task.distanceKm} km multi-corridor routes & meteorology...`;

      await new Promise((r) => setTimeout(r, 600));
      task.progress = 65;
      task.stage = 'Sampling regional AQI plumes & running Gemini long-range synthesis...';

      const payload = await buildOptimizedRoutePayload({
        origin: task.origin,
        destination: task.destination,
        originLabel: task.originLabel,
        destinationLabel: task.destinationLabel,
        transitMode: task.transitMode,
        sampleCount: 9,
        userApiKey,
        isLongRangeBackground: true,
      });

      task.status = 'completed';
      task.progress = 100;
      task.stage = 'Long-range low-pollution corridor ready.';
      task.completedAt = new Date().toISOString();
      task.result = payload;
    } catch (err: unknown) {
      task.status = 'failed';
      task.progress = 100;
      task.stage = 'Background Gemini optimization failed.';
      task.error = err instanceof Error ? err.message : 'Task failed unexpectedly.';
    }
  };

  app.post('/api/routes/background-tasks', (req, res) => {
    const user = verifySessionCookie(req.headers.cookie);
    if (!user) {
      res.status(401).json({ error: 'Google OAuth sign-in is required for background Gemini route tasks.' });
      return;
    }

    const body = (req.body || {}) as {
      origin?: LatLngPoint;
      destination?: LatLngPoint;
      originLabel?: string;
      destinationLabel?: string;
      transitMode?: TransitMode;
      userApiKey?: string;
    };

    const origin = body.origin;
    const destination = body.destination;
    if (
      !origin ||
      !destination ||
      !Number.isFinite(origin.lat) ||
      !Number.isFinite(origin.lon) ||
      !Number.isFinite(destination.lat) ||
      !Number.isFinite(destination.lon)
    ) {
      res.status(400).json({ error: 'Valid origin and destination coordinates are required.' });
      return;
    }

    const distanceKm = Number(haversineKm(origin.lat, origin.lon, destination.lat, destination.lon).toFixed(1));
    if (distanceKm <= SYNC_ROUTE_MAX_KM) {
      res.status(400).json({
        error: `Distance (${distanceKm} km) is within 100 km — use instant synchronous routing.`,
      });
      return;
    }

    const id = `bg-${crypto.randomBytes(5).toString('hex')}`;
    const task: StoredBackgroundTask = {
      id,
      ownerEmail: user.email,
      status: 'pending',
      progress: 10,
      stage: 'Queued background Gemini route task...',
      originLabel: String(body.originLabel || `${origin.lat.toFixed(2)}°, ${origin.lon.toFixed(2)}°`),
      destinationLabel: String(body.destinationLabel || `${destination.lat.toFixed(2)}°, ${destination.lon.toFixed(2)}°`),
      origin,
      destination,
      distanceKm,
      transitMode: body.transitMode || 'ev_shuttle',
      createdAt: new Date().toISOString(),
    };

    backgroundRouteTasks.set(id, task);
    // Keep store bounded to recent 30 tasks
    if (backgroundRouteTasks.size > 30) {
      const oldestKey = backgroundRouteTasks.keys().next().value;
      if (oldestKey) backgroundRouteTasks.delete(oldestKey);
    }

    void executeBackgroundRouteTask(id, body.userApiKey);
    res.status(202).json({ task: toPublicTask(task) });
  });

  app.get('/api/routes/background-tasks', (req, res) => {
    const user = verifySessionCookie(req.headers.cookie);
    if (!user) {
      res.json({ tasks: [] });
      return;
    }
    const list = Array.from(backgroundRouteTasks.values())
      .filter((t) => t.ownerEmail === user.email)
      .reverse()
      .map(toPublicTask);
    res.json({ tasks: list });
  });

  app.get('/api/routes/background-tasks/:id', (req, res) => {
    const user = verifySessionCookie(req.headers.cookie);
    if (!user) {
      res.status(401).json({ error: 'OAuth session required.' });
      return;
    }
    const task = backgroundRouteTasks.get(req.params.id);
    if (!task || task.ownerEmail !== user.email) {
      res.status(404).json({ error: 'Background task not found.' });
      return;
    }
    res.json({ task: toPublicTask(task) });
  });

  return app;
}

async function startServer() {
  const app = createApiApp();
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Vayu Index server listening on http://localhost:${port}`);
  });
}

if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}
