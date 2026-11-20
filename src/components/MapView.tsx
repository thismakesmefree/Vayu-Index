/// <reference types="google.maps" />
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  Bell,
  Bike,
  Car,
  CheckCircle2,
  CloudRain,
  Compass,
  Crosshair,
  Footprints,
  GitBranch,
  Globe2,
  Info,
  Layers,
  Loader2,
  Lock,
  MapPin,
  Navigation,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Thermometer,
  TrainFront,
  Wind,
} from 'lucide-react';
import {
  AuthMode,
  BackgroundRouteTask,
  GeminiOptimizedRoutePayload,
  JourneyExplanationPayload,
  JourneyExplanationPoint,
  LocationSearchResult,
  MapLayerNode,
  ResolvedTheme,
} from '../types';
import {
  CityTelemetry,
  getAqiBand,
  haversineKm,
  TransitMode,
} from '../utils/airQuality';
import { triggerHaptic } from '../utils/haptics';
import { getNotificationPermissionState, requestNotificationPermission } from '../utils/notifications';
import {
  isBackgroundTaskRequired,
  isBetaGoogleTravelMode,
  LatLngPoint,
  SYNC_ROUTE_MAX_KM,
} from '../utils/routeOptimizer';
import { INDIA_MAP_BOUNDS, INDIA_MAP_CENTER } from '../utils/indiaGrid';
import { searchGlobalLocations } from '../utils/location';
import { getThemeTokens } from '../utils/theme';
import { ScrollRevealCard } from './ScrollRevealCard';

interface MapViewProps {
  resolvedTheme: ResolvedTheme;
  city: CityTelemetry;
  authMode: AuthMode;
  customApiKey: string;
  onOpenOAuth: () => void;
  backgroundTasks: BackgroundRouteTask[];
  activeTaskResult: BackgroundRouteTask | null;
  onClearActiveTaskResult: () => void;
  onEnqueueBackgroundTask: (params: {
    origin: LatLngPoint;
    destination: LatLngPoint;
    originLabel: string;
    destinationLabel: string;
    transitMode: TransitMode;
  }) => Promise<BackgroundRouteTask | null>;
  onMapInteractionActivity?: () => void;
}

const TRANSIT_MODES: {
  id: TransitMode;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'drive', label: 'Drive', sublabel: 'Highways', icon: Car },
  { id: 'transit', label: 'Transit', sublabel: 'Rail / Metro / Bus', icon: TrainFront },
  { id: 'two_wheeler', label: '2-Wheeler', sublabel: 'Scooter / Moto', icon: Navigation },
  { id: 'cycle', label: 'Cycle', sublabel: 'Bike Lanes', icon: Bike },
  { id: 'walk', label: 'Walk', sublabel: 'Pedestrian', icon: Footprints },
];

type AqTileType =
  | 'US_AQI'
  | 'PM25_INDIGO_PERSIAN'
  | 'UAQI_RED_GREEN'
  | 'UAQI_INDIGO_PERSIAN';

function detectHardwareWebGL2(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
      if (/swiftshader|llvmpipe|software/i.test(renderer)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Manages Google Maps ImageMapType (AQ Heatmap Tiles), Pan-India & local AQI circles, Road/Rail Polylines, and Camera Focus */
const MapOverlayController: React.FC<{
  showPollutionLayer: boolean;
  showIndiaOverlay: boolean;
  aqTileType: AqTileType;
  localNodes: MapLayerNode[];
  indiaNodes: MapLayerNode[];
  routePayload: GeminiOptimizedRoutePayload | null;
  spanKm: number;
  cameraCommand: { type: 'india' | 'route' | 'point'; point?: LatLngPoint; nonce: number } | null;
}> = ({
  showPollutionLayer,
  showIndiaOverlay,
  aqTileType,
  localNodes,
  indiaNodes,
  routePayload,
  spanKm,
  cameraCommand,
}) => {
  const map = useMap();
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const circlesRef = useRef<google.maps.Circle[]>([]);

  // Overlay Google Air Quality Heatmap Tiles via server proxy (covers all of India & world)
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    map.overlayMapTypes.clear();
    if (!showPollutionLayer) return;

    const aqOverlay = new google.maps.ImageMapType({
      getTileUrl: (coord, zoom) => {
        if (zoom < 0 || zoom > 16) return null;
        const numTiles = 1 << zoom;
        if (coord.y < 0 || coord.y >= numTiles) return null;
        const x = ((coord.x % numTiles) + numTiles) % numTiles;
        return `/api/maps/aq-tile/${aqTileType}/${zoom}/${x}/${coord.y}`;
      },
      tileSize: new google.maps.Size(256, 256),
      maxZoom: 16,
      minZoom: 0,
      name: 'Air Quality',
      opacity: 0.56,
    });

    map.overlayMapTypes.insertAt(0, aqOverlay);

    return () => {
      map.overlayMapTypes.clear();
    };
  }, [map, showPollutionLayer, aqTileType]);

  // Render Pan-India 53-station multi-ring AQI heatmap circles + Local Corridor plumes
  useEffect(() => {
    circlesRef.current.forEach((c) => c.setMap(null));
    circlesRef.current = [];

    if (!map || !showPollutionLayer || typeof google === 'undefined' || !google.maps) return;

    const nextCircles: google.maps.Circle[] = [];

    // 1. Pan-India wide overlapping AQI dispersion blanket (covers whole India seamlessly)
    if (showIndiaOverlay && indiaNodes.length > 0) {
      indiaNodes.forEach((node) => {
        const band = getAqiBand(node.aqi);
        // Outer atmospheric dispersion halo (~145 km radius)
        nextCircles.push(
          new google.maps.Circle({
            map,
            center: { lat: node.lat, lng: node.lon },
            radius: 145000,
            strokeColor: band.color,
            strokeOpacity: 0.22,
            strokeWeight: 1,
            fillColor: band.color,
            fillOpacity: 0.11,
            clickable: false,
            zIndex: 1,
          })
        );
        // Inner urban concentration core (~62 km radius)
        nextCircles.push(
          new google.maps.Circle({
            map,
            center: { lat: node.lat, lng: node.lon },
            radius: 62000,
            strokeColor: band.color,
            strokeOpacity: 0.42,
            strokeWeight: 1.2,
            fillColor: band.color,
            fillOpacity: 0.18,
            clickable: false,
            zIndex: 2,
          })
        );
      });
    }

    // 2. High-resolution local corridor AQI circles around active trip
    const localRadiusMeters = Math.max(1800, Math.min(26000, Math.round(spanKm * 1000 * 0.42)));
    localNodes.forEach((node) => {
      const band = getAqiBand(node.aqi);
      nextCircles.push(
        new google.maps.Circle({
          map,
          center: { lat: node.lat, lng: node.lon },
          radius: localRadiusMeters,
          strokeColor: band.color,
          strokeOpacity: 0.45,
          strokeWeight: 1.2,
          fillColor: band.color,
          fillOpacity: 0.16,
          clickable: false,
          zIndex: 4,
        })
      );
    });

    circlesRef.current = nextCircles;
    return () => {
      nextCircles.forEach((c) => c.setMap(null));
    };
  }, [map, showPollutionLayer, showIndiaOverlay, indiaNodes, localNodes, spanKm]);

  // Render real Google Maps road / highway / train-track polylines (never a straight line!)
  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!map || typeof google === 'undefined' || !google.maps) return;
    if (!routePayload || routePayload.candidates.length === 0) return;

    const created: google.maps.Polyline[] = [];
    const bounds = new google.maps.LatLngBounds();

    // Draw baseline / alternate road corridors dashed underneath
    routePayload.candidates
      .filter((c) => !c.isOptimal)
      .forEach((candidate) => {
        const path = candidate.path.map((pt) => {
          bounds.extend({ lat: pt.lat, lng: pt.lon });
          return { lat: pt.lat, lng: pt.lon };
        });
        const line = new google.maps.Polyline({
          map,
          path,
          geodesic: false,
          strokeColor: candidate.id === routePayload.baselineRouteId ? '#EF4444' : '#94A3B8',
          strokeOpacity: 0.72,
          strokeWeight: 3.5,
          zIndex: 10,
          icons: [
            {
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
              offset: '0',
              repeat: '14px',
            },
          ],
        });
        created.push(line);
      });

    // Draw optimal real highway / railway route on top
    const optimal = routePayload.candidates.find((c) => c.isOptimal);
    if (optimal) {
      const optPath = optimal.path.map((pt) => {
        bounds.extend({ lat: pt.lat, lng: pt.lon });
        return { lat: pt.lat, lng: pt.lon };
      });
      // Soft glowing outer casing for crisp readability over AQI heatmap
      created.push(
        new google.maps.Polyline({
          map,
          path: optPath,
          geodesic: false,
          strokeColor: '#022C22',
          strokeOpacity: 0.65,
          strokeWeight: 9,
          zIndex: 18,
        })
      );
      created.push(
        new google.maps.Polyline({
          map,
          path: optPath,
          geodesic: false,
          strokeColor: '#10B981',
          strokeOpacity: 0.96,
          strokeWeight: 5.5,
          zIndex: 20,
        })
      );

      // Highlight individual TRANSIT rail / metro / bus track legs in distinct line colors
      if (Array.isArray(optimal.steps)) {
        optimal.steps.forEach((st) => {
          if (st.transitInfo && st.path.length >= 2) {
            const lineColor = st.transitInfo.color || '#8B5CF6';
            created.push(
              new google.maps.Polyline({
                map,
                path: st.path.map((pt) => ({ lat: pt.lat, lng: pt.lon })),
                geodesic: false,
                strokeColor: lineColor,
                strokeOpacity: 0.98,
                strokeWeight: 6,
                zIndex: 25,
              })
            );
          }
        });
      }
    }

    if (!bounds.isEmpty() && (!cameraCommand || cameraCommand.type === 'route')) {
      map.fitBounds(bounds, { top: 48, right: 48, bottom: 56, left: 48 });
    }

    polylinesRef.current = created;
    return () => {
      created.forEach((p) => p.setMap(null));
    };
  }, [map, routePayload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle explicit camera zoom commands (Whole India / Focus Route / Pan to Journey Point)
  useEffect(() => {
    if (!map || !cameraCommand || typeof google === 'undefined' || !google.maps) return;
    if (cameraCommand.type === 'india') {
      map.fitBounds(INDIA_MAP_BOUNDS, { top: 20, right: 20, bottom: 28, left: 20 });
    } else if (cameraCommand.type === 'point' && cameraCommand.point) {
      map.panTo({ lat: cameraCommand.point.lat, lng: cameraCommand.point.lon });
      const currentZoom = map.getZoom() ?? 10;
      if (currentZoom < 12) map.setZoom(13);
    } else if (cameraCommand.type === 'route' && routePayload) {
      const bounds = new google.maps.LatLngBounds();
      routePayload.candidates.forEach((c) =>
        c.path.forEach((pt) => bounds.extend({ lat: pt.lat, lng: pt.lon }))
      );
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { top: 48, right: 48, bottom: 56, left: 48 });
      }
    }
  }, [map, cameraCommand, routePayload]);

  return null;
};

export const MapView: React.FC<MapViewProps> = ({
  resolvedTheme,
  city,
  authMode,
  customApiKey,
  onOpenOAuth,
  backgroundTasks,
  activeTaskResult,
  onClearActiveTaskResult,
  onEnqueueBackgroundTask,
  onMapInteractionActivity,
}) => {
  const tokens = getThemeTokens(resolvedTheme);
  const isOAuthUnlocked = authMode === 'oauth';
  const useVectorRendering = useMemo(() => detectHardwareWebGL2(), []);

  const [mapsApiKey, setMapsApiKey] = useState<string>('');
  const [mapsConfigLoaded, setMapsConfigLoaded] = useState(false);
  const [mapsConfigError, setMapsConfigError] = useState<string | null>(null);
  const [mapsApiLoadError, setMapsApiLoadError] = useState(false);

  const defaultDest = useMemo<LatLngPoint>(() => {
    const sector = city.sectors[2] ?? city.sectors[1];
    if (sector && (sector.lat !== city.coords.lat || sector.lon !== city.coords.lon)) {
      return { lat: sector.lat, lon: sector.lon };
    }
    return {
      lat: Number((city.coords.lat + 0.065).toFixed(4)),
      lon: Number((city.coords.lon + 0.075).toFixed(4)),
    };
  }, [city.coords.lat, city.coords.lon, city.sectors]);

  const [origin, setOrigin] = useState<LatLngPoint>({ lat: city.coords.lat, lon: city.coords.lon });
  const [originLabel, setOriginLabel] = useState<string>(city.name);
  const [destination, setDestination] = useState<LatLngPoint>(defaultDest);
  const [destinationLabel, setDestinationLabel] = useState<string>(
    city.sectors[2]?.name ?? `${city.name} Corridor`
  );

  useEffect(() => {
    setOrigin({ lat: city.coords.lat, lon: city.coords.lon });
    setOriginLabel(city.name);
    setDestination(defaultDest);
    setDestinationLabel(city.sectors[2]?.name ?? `${city.name} Corridor`);
    setRouteResult(null);
    setJourneyExplanation(null);
    setSelectedJourneyPoint(null);
  }, [city.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [clickMode, setClickMode] = useState<'inspect' | 'origin' | 'destination'>('destination');
  const [showPollutionLayer, setShowPollutionLayer] = useState<boolean>(true);
  const [showMeteoLayer, setShowMeteoLayer] = useState<boolean>(true);
  const [showIndiaOverlay, setShowIndiaOverlay] = useState<boolean>(true);
  const [aqTileType, setAqTileType] = useState<AqTileType>('US_AQI');

  const [localNodes, setLocalNodes] = useState<MapLayerNode[]>([]);
  const [indiaNodes, setIndiaNodes] = useState<MapLayerNode[]>([]);
  const [layerLoading, setLayerLoading] = useState<boolean>(false);
  const [indiaLoading, setIndiaLoading] = useState<boolean>(false);
  const [inspectedNode, setInspectedNode] = useState<MapLayerNode | null>(null);

  const [transitMode, setTransitMode] = useState<TransitMode>('drive');
  const [isFetchingDirections, setIsFetchingDirections] = useState<boolean>(false);
  const [isComputingRoute, setIsComputingRoute] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<GeminiOptimizedRoutePayload | null>(null);
  const [isGeminiOptimized, setIsGeminiOptimized] = useState<boolean>(false);

  // AI "Explain Journey" point-by-point state
  const [journeyExplanation, setJourneyExplanation] = useState<JourneyExplanationPayload | null>(null);
  const [isExplainingJourney, setIsExplainingJourney] = useState<boolean>(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [selectedJourneyPoint, setSelectedJourneyPoint] = useState<JourneyExplanationPoint | null>(null);

  // Camera control command state
  const [cameraCommand, setCameraCommand] = useState<{
    type: 'india' | 'route' | 'point';
    point?: LatLngPoint;
    nonce: number;
  } | null>(null);

  // Location search pickers for Origin & Destination
  const [originSearch, setOriginSearch] = useState('');
  const [originResults, setOriginResults] = useState<LocationSearchResult[]>([]);
  const [destSearch, setDestSearch] = useState('');
  const [destResults, setDestResults] = useState<LocationSearchResult[]>([]);

  // Guard so initial map camera setup doesn't immediately hide mobile dock
  const mapMountedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    fetch('/api/maps/config', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Maps configuration endpoint returned HTTP ${response.status}.`);
        }

        const data = (await response.json()) as { configured?: boolean; apiKey?: unknown };
        if (typeof data.configured !== 'boolean') {
          throw new Error('Maps configuration endpoint returned an invalid response.');
        }
        const apiKey = data.apiKey;
        if (data.configured && (typeof apiKey !== 'string' || !apiKey.trim())) {
          throw new Error('Maps configuration reports a key but did not return one.');
        }

        setMapsApiKey(data.configured && typeof apiKey === 'string' ? apiKey.trim() : '');
      })
      .catch((error: unknown) => {
        setMapsConfigError(error instanceof Error ? error.message : 'Maps configuration request failed.');
      })
      .finally(() => setMapsConfigLoaded(true));
  }, []);

  const handleMapsApiLoadError = useCallback(() => {
    setMapsApiLoadError(true);
  }, []);

  // Load 53-station Whole-India AQI & Meteorology Grid once on mount
  useEffect(() => {
    let active = true;
    setIndiaLoading(true);
    fetch('/api/maps/india-grid')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { nodes?: MapLayerNode[] } | null) => {
        if (active && data && Array.isArray(data.nodes)) {
          setIndiaNodes(data.nodes);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIndiaLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Load completed >100km background route result if triggered from notification / toast
  useEffect(() => {
    if (activeTaskResult && activeTaskResult.status === 'completed' && activeTaskResult.result) {
      setOrigin(activeTaskResult.origin);
      setOriginLabel(activeTaskResult.originLabel);
      setDestination(activeTaskResult.destination);
      setDestinationLabel(activeTaskResult.destinationLabel);
      setTransitMode(activeTaskResult.transitMode);
      setRouteResult(activeTaskResult.result);
      setIsGeminiOptimized(true);
      setJourneyExplanation(null);
      setSelectedJourneyPoint(null);
      onClearActiveTaskResult();
    }
  }, [activeTaskResult, onClearActiveTaskResult]);

  const directDistanceKm = useMemo(
    () => Number(haversineKm(origin.lat, origin.lon, destination.lat, destination.lon).toFixed(1)),
    [origin.lat, origin.lon, destination.lat, destination.lon]
  );

  const needsBackgroundTask = isBackgroundTaskRequired(directDistanceKm);
  const isBetaMode = isBetaGoogleTravelMode(transitMode);
  const layerSpanKm = useMemo(
    () => Math.max(14, Math.min(160, Math.round(directDistanceKm * 0.65))),
    [directDistanceKm]
  );

  const mapCenter = useMemo(
    () => ({
      lat: (origin.lat + destination.lat) / 2,
      lng: (origin.lon + destination.lon) / 2,
    }),
    [origin.lat, origin.lon, destination.lat, destination.lon]
  );

  // Automatically fetch direct Google Maps road/rail directions whenever Origin, Destination, or Mode changes
  useEffect(() => {
    let cancelled = false;
    setIsFetchingDirections(true);
    setRouteError(null);
    setIsGeminiOptimized(false);
    setJourneyExplanation(null);
    setSelectedJourneyPoint(null);

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/maps/directions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin,
            destination,
            originLabel,
            destinationLabel,
            transitMode,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { result?: GeminiOptimizedRoutePayload };
        if (!cancelled && data.result) {
          setRouteResult(data.result);
        }
      } catch {
        // non-fatal; user can retry via Optimize button
      } finally {
        if (!cancelled) setIsFetchingDirections(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [origin.lat, origin.lon, destination.lat, destination.lon, transitMode, originLabel, destinationLabel]);

  // Fetch local corridor Pollution + Meteorology layer grid around midpoint
  const fetchSpatialLayerGrid = useCallback(async () => {
    setLayerLoading(true);
    try {
      const res = await fetch(
        `/api/maps/layer-grid?lat=${mapCenter.lat.toFixed(4)}&lon=${mapCenter.lng.toFixed(4)}&spanKm=${layerSpanKm}`
      );
      if (res.status === 429) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      if (!res.ok) return;
      const data = (await res.json()) as { nodes?: MapLayerNode[] };
      if (Array.isArray(data.nodes)) {
        setLocalNodes(data.nodes);
        const centerNode = data.nodes.find((n) => n.id === 'c') ?? data.nodes[0] ?? null;
        setInspectedNode((prev) => prev ?? centerNode);
      }
    } catch {
      // keep existing grid if temporarily offline
    } finally {
      setLayerLoading(false);
    }
  }, [mapCenter.lat, mapCenter.lng, layerSpanKm]);

  useEffect(() => {
    void fetchSpatialLayerGrid();
  }, [fetchSpatialLayerGrid]);

  // Debounced Origin Search
  useEffect(() => {
    const q = originSearch.trim();
    if (q.length < 2) {
      setOriginResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await searchGlobalLocations(q);
        setOriginResults(res.slice(0, 5));
      } catch {
        setOriginResults([]);
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [originSearch]);

  // Debounced Destination Search
  useEffect(() => {
    const q = destSearch.trim();
    if (q.length < 2) {
      setDestResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await searchGlobalLocations(q);
        setDestResults(res.slice(0, 5));
      } catch {
        setDestResults([]);
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [destSearch]);

  const handleMapClick = (ev: { detail?: { latLng?: { lat: number; lng: number } | null } }) => {
    const latLng = ev.detail?.latLng;
    if (!latLng) return;

    const pt: LatLngPoint = {
      lat: Number(latLng.lat.toFixed(5)),
      lon: Number(latLng.lng.toFixed(5)),
    };

    if (clickMode === 'origin') {
      triggerHaptic('medium');
      setOrigin(pt);
      setOriginLabel(`Pin (${pt.lat.toFixed(2)}°, ${pt.lon.toFixed(2)}°)`);
      setRouteError(null);
    } else if (clickMode === 'destination') {
      triggerHaptic('medium');
      setDestination(pt);
      setDestinationLabel(`Pin (${pt.lat.toFixed(2)}°, ${pt.lon.toFixed(2)}°)`);
      setRouteError(null);
    }
  };

  const handleOptimizeSyncRoute = async () => {
    if (!isOAuthUnlocked) {
      triggerHaptic('warning');
      onOpenOAuth();
      return;
    }

    triggerHaptic('medium');
    setRouteError(null);
    setIsComputingRoute(true);
    try {
      const res = await fetch('/api/maps/optimize-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin,
          destination,
          originLabel,
          destinationLabel,
          transitMode,
          userApiKey: customApiKey || undefined,
        }),
      });
      if (res.status === 429) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      const data = await res.json();
      if (!res.ok || !data.result) {
        throw new Error(data.error || 'Unable to compute low-pollution route.');
      }
      triggerHaptic('success');
      setRouteResult(data.result);
      setIsGeminiOptimized(true);
      setJourneyExplanation(null);
      setCameraCommand({ type: 'route', nonce: Date.now() });
    } catch (err: unknown) {
      triggerHaptic('warning');
      setRouteError(err instanceof Error ? err.message : 'Route optimization failed.');
    } finally {
      setIsComputingRoute(false);
    }
  };

  const handleExplainJourney = async () => {
    if (!routeResult) return;
    const optimal = routeResult.candidates.find((c) => c.isOptimal);
    const baseline =
      routeResult.candidates.find((c) => c.id === routeResult.baselineRouteId) ?? optimal;
    const points = routeResult.journeyPoints ?? [];
    if (!optimal || points.length === 0) return;

    triggerHaptic('medium');
    setExplainError(null);
    setIsExplainingJourney(true);
    try {
      const res = await fetch('/api/maps/explain-journey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originLabel,
          destinationLabel,
          transitMode,
          optimalLabel: optimal.label,
          baselineLabel: baseline?.label ?? optimal.label,
          optimalAvgAqi: optimal.avgAqi,
          baselineAvgAqi: baseline?.avgAqi ?? optimal.avgAqi,
          optimalDurationMin: optimal.durationMin,
          baselineDurationMin: baseline?.durationMin ?? optimal.durationMin,
          distanceKm: optimal.distanceKm,
          journeyPoints: points,
          userApiKey: customApiKey || undefined,
        }),
      });
      const data = (await res.json()) as {
        explanation?: JourneyExplanationPayload;
        error?: string;
      };
      if (!res.ok || !data.explanation) {
        throw new Error(data.error || 'Unable to generate AI journey explanation.');
      }
      triggerHaptic('success');
      setJourneyExplanation(data.explanation);
    } catch (err: unknown) {
      triggerHaptic('warning');
      setExplainError(err instanceof Error ? err.message : 'Explanation request failed.');
    } finally {
      setIsExplainingJourney(false);
    }
  };

  const handleLaunchBackgroundTask = async () => {
    if (!isOAuthUnlocked) {
      triggerHaptic('warning');
      onOpenOAuth();
      return;
    }

    triggerHaptic('medium');
    setRouteError(null);

    if (getNotificationPermissionState() === 'default') {
      await requestNotificationPermission();
    }

    const created = await onEnqueueBackgroundTask({
      origin,
      destination,
      originLabel,
      destinationLabel,
      transitMode,
    });
    if (created) {
      triggerHaptic('success');
    } else {
      triggerHaptic('warning');
      setRouteError('Unable to queue background Gemini task. Ensure you are signed in.');
    }
  };

  const optimalCandidate = routeResult?.candidates.find((c) => c.isOptimal) ?? null;
  const baselineCandidate =
    routeResult?.candidates.find((c) => c.id === routeResult.baselineRouteId) ?? null;

  const activeInspected = inspectedNode ?? localNodes[0] ?? indiaNodes[0] ?? null;
  const inspectedBand = activeInspected ? getAqiBand(activeInspected.aqi) : getAqiBand(city.compositeAqi);

  // Merge local + Pan-India markers without overlapping duplicates
  const visibleMarkers = useMemo(() => {
    const combined: MapLayerNode[] = [...localNodes];
    if (showIndiaOverlay) {
      for (const node of indiaNodes) {
        const tooClose = localNodes.some(
          (ln) => haversineKm(ln.lat, ln.lon, node.lat, node.lon) < 12
        );
        if (!tooClose) combined.push(node);
      }
    }
    return combined;
  }, [localNodes, indiaNodes, showIndiaOverlay]);

  const activeJourneyPoints = journeyExplanation?.points ?? routeResult?.journeyPoints ?? [];
  const modifiedPointsCount = activeJourneyPoints.filter((p) => p.isModified).length;

  const fireMapActivity = () => {
    if (Date.now() - mapMountedAtRef.current < 1200) return;
    onMapInteractionActivity?.();
  };

  return (
    <div className="space-y-6">
      <ScrollRevealCard immediate>
        <div className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 ${tokens.divider}`}>
          <div>
            <h1 className={`font-display text-2xl font-bold tracking-tight ${tokens.textPrimary}`}>
              Interactive Pollution &amp; Meteorology Map
            </h1>
            <p className={`mt-0.5 text-xs ${tokens.textMuted}`}>
              Direct Google Maps road &amp; rail routing · Pan-India AQI network ({indiaNodes.length || 53} stations) · Trip{' '}
              <span className="font-mono-tabular font-semibold">
                {optimalCandidate ? `${optimalCandidate.distanceKm} km` : `${directDistanceKm} km`}
              </span>
            </p>
          </div>

          <span className="inline-flex items-center gap-2 text-xs">
            {isOAuthUnlocked ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-500 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                Gemini Map Routing Unlocked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-500 font-semibold">
                <Lock className="w-3.5 h-3.5" />
                Direct Maps Active · OAuth Unlocks Gemini Optimizer
              </span>
            )}
          </span>
        </div>
      </ScrollRevealCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 8-Column Interactive Google Map Canvas */}
        <div className="lg:col-span-8 space-y-4">
          <ScrollRevealCard immediate>
            <div className={`vayu-glass-panel rounded-2xl border p-3.5 sm:p-4 space-y-3 ${tokens.surface}`}>
              {/* Interactive Layer, Whole-India View & Pin Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="layer-pollution-toggle"
                    onClick={() => {
                      triggerHaptic('light');
                      setShowPollutionLayer((prev) => !prev);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      showPollutionLayer
                        ? tokens.isLight
                          ? 'border-emerald-600/45 bg-emerald-500/18 text-emerald-800'
                          : 'border-emerald-400/50 bg-emerald-500/18 text-emerald-400'
                        : tokens.btnSecondary
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>AQI Heatmap</span>
                  </button>

                  <button
                    type="button"
                    data-testid="layer-india-toggle"
                    onClick={() => {
                      triggerHaptic('light');
                      setShowIndiaOverlay((prev) => !prev);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      showIndiaOverlay
                        ? tokens.isLight
                          ? 'border-purple-600/45 bg-purple-500/16 text-purple-800'
                          : 'border-purple-400/50 bg-purple-500/18 text-purple-300'
                        : tokens.btnSecondary
                    }`}
                  >
                    <Globe2 className="w-3.5 h-3.5" />
                    <span>All-India ({indiaNodes.length || 53})</span>
                  </button>

                  <button
                    type="button"
                    data-testid="layer-meteo-toggle"
                    onClick={() => {
                      triggerHaptic('light');
                      setShowMeteoLayer((prev) => !prev);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      showMeteoLayer
                        ? tokens.isLight
                          ? 'border-sky-600/45 bg-sky-500/18 text-sky-800'
                          : 'border-[#38BDF8]/50 bg-[#38BDF8]/18 text-[#38BDF8]'
                        : tokens.btnSecondary
                    }`}
                  >
                    <Wind className="w-3.5 h-3.5" />
                    <span>Weather</span>
                  </button>

                  {showPollutionLayer && (
                    <select
                      aria-label="Pollution heatmap layer metric"
                      value={aqTileType}
                      onChange={(e) => {
                        triggerHaptic('light');
                        setAqTileType(e.target.value as AqTileType);
                      }}
                      className={`h-8 rounded-lg border px-2 text-[11px] font-medium focus:border-[#38BDF8] focus:outline-none ${tokens.selectBg}`}
                    >
                      <option value="US_AQI">US AQI Tiles</option>
                      <option value="PM25_INDIGO_PERSIAN">PM2.5 Plume</option>
                      <option value="UAQI_RED_GREEN">Universal AQI (R-G)</option>
                      <option value="UAQI_INDIGO_PERSIAN">Universal AQI (Indigo)</option>
                    </select>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="zoom-whole-india-btn"
                    onClick={() => {
                      triggerHaptic('medium');
                      setShowPollutionLayer(true);
                      setShowIndiaOverlay(true);
                      setCameraCommand({ type: 'india', nonce: Date.now() });
                    }}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer ${tokens.btnSecondary}`}
                    title="Zoom out to inspect AQI tiles & heatmap circles across all of India"
                  >
                    <Globe2 className="w-3 h-3 text-emerald-400" />
                    <span>Whole India</span>
                  </button>

                  <button
                    type="button"
                    data-testid="zoom-route-btn"
                    onClick={() => {
                      triggerHaptic('light');
                      setCameraCommand({ type: 'route', nonce: Date.now() });
                    }}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer ${tokens.btnSecondary}`}
                    title="Refocus map on active route"
                  >
                    <Route className="w-3 h-3 text-[#38BDF8]" />
                    <span>Route</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setClickMode('origin');
                    }}
                    data-testid="map-mode-origin"
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold cursor-pointer ${
                      clickMode === 'origin'
                        ? tokens.isLight
                          ? 'border-sky-600 bg-sky-500/18 text-sky-900'
                          : 'border-[#38BDF8] bg-[#38BDF8]/18 text-[#38BDF8]'
                        : tokens.btnSecondary
                    }`}
                  >
                    <Crosshair className="w-3 h-3" />
                    <span>Pin A</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setClickMode('destination');
                    }}
                    data-testid="map-mode-destination"
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold cursor-pointer ${
                      clickMode === 'destination'
                        ? tokens.isLight
                          ? 'border-purple-600 bg-purple-500/18 text-purple-900'
                          : 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-[#D0BCFF]'
                        : tokens.btnSecondary
                    }`}
                  >
                    <MapPin className="w-3 h-3" />
                    <span>Pin B</span>
                  </button>
                </div>
              </div>

              {/* Interactive Google Map Container with explicit CSS height */}
              <div
                data-testid="google-map-container"
                onTouchMove={fireMapActivity}
                onWheel={fireMapActivity}
                className={`vayu-gpu relative h-[420px] sm:h-[520px] w-full overflow-hidden rounded-xl border ${tokens.divider} ${tokens.mapBg}`}
              >
                {!mapsConfigLoaded ? (
                  <div className="flex h-full w-full items-center justify-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin text-[#38BDF8]" />
                    <span>Initializing Google Maps telemetry canvas...</span>
                  </div>
                ) : mapsConfigError ? (
                  <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center space-y-2">
                    <AlertTriangle className="w-7 h-7 text-amber-400" />
                    <p className={`text-sm font-semibold ${tokens.textPrimary}`}>
                      Unable to Load Google Maps Configuration
                    </p>
                    <p className={`max-w-md text-xs ${tokens.textMuted}`}>
                      {mapsConfigError} Check <code className="font-mono-tabular">/api/health</code> for
                      server configuration status and confirm the Vercel API function is deployed.
                    </p>
                  </div>
                ) : !mapsApiKey ? (
                  <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center space-y-2">
                    <AlertTriangle className="w-7 h-7 text-amber-400" />
                    <p className={`text-sm font-semibold ${tokens.textPrimary}`}>
                      Google Maps Browser Key Not Configured
                    </p>
                    <p className={`max-w-md text-xs ${tokens.textMuted}`}>
                      Set <code className="font-mono-tabular">GOOGLE_MAPS_BROWSER_API_KEY</code> in the active
                      Vercel environment and redeploy. Confirm <code className="font-mono-tabular">hasMapsBrowserKey</code>{' '}
                      is true at <code className="font-mono-tabular">/api/health</code>. Set{' '}
                      <code className="font-mono-tabular">GOOGLE_MAPS_SERVER_API_KEY</code> for route and air-quality services.
                    </p>
                  </div>
                ) : (
                  <APIProvider apiKey={mapsApiKey} onError={handleMapsApiLoadError}>
                    <GoogleMap
                      mapId="DEMO_MAP_ID"
                      defaultCenter={mapCenter}
                      defaultZoom={directDistanceKm > 100 ? 7 : 11}
                      renderingType={useVectorRendering ? 'VECTOR' : undefined}
                      gestureHandling="greedy"
                      disableDefaultUI={false}
                      streetViewControl={false}
                      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                      onClick={handleMapClick}
                      onDrag={fireMapActivity}
                      onZoomChanged={fireMapActivity}
                      className="h-full w-full"
                    >
                      <MapOverlayController
                        showPollutionLayer={showPollutionLayer}
                        showIndiaOverlay={showIndiaOverlay}
                        aqTileType={aqTileType}
                        localNodes={localNodes}
                        indiaNodes={indiaNodes}
                        routePayload={routeResult}
                        spanKm={layerSpanKm}
                        cameraCommand={cameraCommand}
                      />

                      {/* Origin Draggable Pin */}
                      <AdvancedMarker
                        position={{ lat: origin.lat, lng: origin.lon }}
                        draggable
                        title={`Origin: ${originLabel}`}
                        onDragEnd={(e) => {
                          if (!e.latLng) return;
                          triggerHaptic('medium');
                          const lat = Number(e.latLng.lat().toFixed(5));
                          const lon = Number(e.latLng.lng().toFixed(5));
                          setOrigin({ lat, lon });
                          setOriginLabel(`Pin (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`);
                        }}
                      >
                        <div className="flex items-center gap-1 rounded-full border-2 border-white bg-[#0EA5E9] px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
                          <Navigation className="w-3 h-3" />
                          <span>A</span>
                        </div>
                      </AdvancedMarker>

                      {/* Destination Draggable Pin */}
                      <AdvancedMarker
                        position={{ lat: destination.lat, lng: destination.lon }}
                        draggable
                        title={`Destination: ${destinationLabel}`}
                        onDragEnd={(e) => {
                          if (!e.latLng) return;
                          triggerHaptic('medium');
                          const lat = Number(e.latLng.lat().toFixed(5));
                          const lon = Number(e.latLng.lng().toFixed(5));
                          setDestination({ lat, lon });
                          setDestinationLabel(`Pin (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`);
                        }}
                      >
                        <div className="flex items-center gap-1 rounded-full border-2 border-white bg-[#8B5CF6] px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
                          <MapPin className="w-3 h-3" />
                          <span>B</span>
                        </div>
                      </AdvancedMarker>

                      {/* Highlighted Journey Point Marker (when inspecting Explain Journey) */}
                      {selectedJourneyPoint && (
                        <AdvancedMarker
                          position={{ lat: selectedJourneyPoint.lat, lng: selectedJourneyPoint.lon }}
                          title={`Point #${selectedJourneyPoint.pointIndex}: ${selectedJourneyPoint.title}`}
                        >
                          <div className="flex items-center gap-1.5 rounded-full border-2 border-white bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-slate-950 shadow-xl ring-4 ring-amber-400/40">
                            <GitBranch className="w-3 h-3" />
                            <span>Pt #{selectedJourneyPoint.pointIndex}</span>
                          </div>
                        </AdvancedMarker>
                      )}

                      {/* Pan-India + Local Spatial Pollution & Meteorology Grid Nodes */}
                      {(showPollutionLayer || showMeteoLayer) &&
                        visibleMarkers.map((node) => {
                          const band = getAqiBand(node.aqi);
                          const isSelected = inspectedNode?.id === node.id;
                          return (
                            <AdvancedMarker
                              key={node.id}
                              position={{ lat: node.lat, lng: node.lon }}
                              onClick={() => {
                                triggerHaptic('light');
                                setInspectedNode(node);
                              }}
                            >
                              <div
                                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono-tabular font-bold shadow-md backdrop-blur-md transition-transform ${
                                  isSelected ? 'scale-110 ring-2 ring-[#38BDF8]' : ''
                                } ${
                                  tokens.isLight
                                    ? 'bg-white/88 border-slate-900/20 text-slate-900'
                                    : 'bg-neutral-950/82 border-white/22 text-slate-100'
                                }`}
                              >
                                {showPollutionLayer && (
                                  <span className="inline-flex items-center gap-1">
                                    <span
                                      className="h-2 w-2 rounded-full"
                                      style={{ backgroundColor: band.color }}
                                    />
                                    <span>{node.aqi}</span>
                                  </span>
                                )}
                                {showMeteoLayer && !node.isIndiaWide && (
                                  <span className="inline-flex items-center gap-0.5 text-[#38BDF8]">
                                    <span
                                      className="inline-block text-[11px] leading-none"
                                      style={{ transform: `rotate(${node.windDirDeg}deg)` }}
                                      aria-hidden="true"
                                    >
                                      ↑
                                    </span>
                                    <span>{node.temperatureC}°</span>
                                    {node.precipMm > 0 && <CloudRain className="w-2.5 h-2.5 text-sky-400" />}
                                  </span>
                                )}
                              </div>
                            </AdvancedMarker>
                          );
                        })}
                    </GoogleMap>
                  </APIProvider>
                )}
                {mapsApiLoadError && (
                  <div
                    role="alert"
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-slate-950/90 p-6 text-center"
                  >
                    <AlertTriangle className="w-7 h-7 text-amber-400" />
                    <p className="text-sm font-semibold text-white">Google Maps JavaScript API Failed to Load</p>
                    <p className="max-w-md text-xs text-slate-300">
                      Check the browser console for Google’s error code. Verify Maps JavaScript API is enabled,
                      billing is active, and the key’s website referrer and API restrictions allow this app.
                    </p>
                  </div>
                )}

                {/* Floating Route & Layer Legend HUD — kept clear of bottom Google attribution & logo */}
                <div
                  className={`pointer-events-none absolute bottom-9 left-3 flex flex-wrap items-center gap-3 rounded-xl border backdrop-blur-md px-3 py-1.5 text-[11px] ${tokens.surfaceElevated} ${tokens.textPrimary}`}
                >
                  {isFetchingDirections ? (
                    <span className="inline-flex items-center gap-1.5 text-[#38BDF8] font-semibold">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Snapping to Google highways &amp; rail...
                    </span>
                  ) : (
                    <span className="font-mono-tabular font-semibold">
                      {optimalCandidate
                        ? `${optimalCandidate.distanceKm} km · ${optimalCandidate.durationMin}m`
                        : `${directDistanceKm} km`}{' '}
                      ({routeResult?.googleTravelMode || 'DRIVE'})
                    </span>
                  )}
                  {routeResult && optimalCandidate && (
                    <>
                      <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                        <span className="h-1 w-4 rounded bg-emerald-500 inline-block" />
                        Optimal ({optimalCandidate.avgAqi} AQI)
                      </span>
                      {baselineCandidate && baselineCandidate.id !== optimalCandidate.id && (
                        <span className="flex items-center gap-1.5 text-red-400">
                          <span className="h-0.5 w-4 border-t border-dashed border-[#EF4444] inline-block" />
                          Arterial ({baselineCandidate.avgAqi} AQI)
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </ScrollRevealCard>

          {/* AI "Explain Journey" Point-by-Point Panel */}
          {journeyExplanation && (
            <ScrollRevealCard>
              <div
                data-testid="journey-explanation-panel"
                className={`vayu-glass-panel rounded-2xl border p-5 space-y-4 ${tokens.surface}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className={`font-display text-base sm:text-lg font-bold flex items-center gap-2 ${tokens.textPrimary}`}>
                      <GitBranch className="w-4 h-4 text-[#38BDF8]" />
                      <span>AI Journey Explanation — Point by Point</span>
                    </h2>
                    <p className={`mt-1 text-xs leading-relaxed ${tokens.textSecondary}`}>
                      {journeyExplanation.overallRationale}
                    </p>
                  </div>
                  <span className="rounded-lg border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 shrink-0">
                    {modifiedPointsCount > 0
                      ? `${modifiedPointsCount} Modified Point${modifiedPointsCount > 1 ? 's' : ''}`
                      : 'Direct Clean Alignment'}
                  </span>
                </div>

                <div className={`rounded-xl border border-[#38BDF8]/30 bg-[#38BDF8]/10 px-3.5 py-2.5 text-xs ${tokens.textPrimary}`}>
                  <span className="font-semibold text-[#38BDF8]">Path Modification Summary: </span>
                  {journeyExplanation.modificationSummary}
                </div>

                <ol className="space-y-2.5" data-testid="journey-points-list">
                  {journeyExplanation.points.map((pt) => {
                    const ptBand = getAqiBand(pt.aqi);
                    const isFocused = selectedJourneyPoint?.pointIndex === pt.pointIndex;
                    return (
                      <li key={pt.pointIndex}>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setSelectedJourneyPoint(pt);
                            setCameraCommand({
                              type: 'point',
                              point: { lat: pt.lat, lon: pt.lon },
                              nonce: Date.now(),
                            });
                          }}
                          className={`w-full rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                            isFocused
                              ? 'border-[#38BDF8] bg-[#38BDF8]/15 ring-1 ring-[#38BDF8]/50'
                              : pt.isModified
                                ? 'border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/15'
                                : `${tokens.surfaceSubtle} hover:border-[#38BDF8]/40`
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold font-mono-tabular ${
                                  pt.isModified
                                    ? 'bg-amber-400 text-slate-950'
                                    : 'bg-[#38BDF8]/20 text-[#38BDF8]'
                                }`}
                              >
                                {pt.pointIndex}
                              </span>
                              <span className={`text-xs sm:text-sm font-semibold truncate ${tokens.textPrimary}`}>
                                {pt.title}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-tabular">
                              <span className={tokens.textMuted}>{pt.kmFromStart} km</span>
                              <span className="font-bold" style={{ color: ptBand.color }}>
                                AQI {pt.aqi}
                              </span>
                              {pt.baselineAqi !== undefined && pt.baselineAqi !== pt.aqi && (
                                <span className={`text-[10px] ${tokens.textMuted}`}>
                                  (vs {pt.baselineAqi})
                                </span>
                              )}
                              {pt.isModified && (
                                <span className="rounded bg-amber-400/20 border border-amber-400/45 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                                  MODIFIED · {pt.modificationBadge || 'Diverted'}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className={`mt-1.5 pl-8 text-xs leading-relaxed ${tokens.textSecondary}`}>
                            {pt.explanation}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </ScrollRevealCard>
          )}

          {/* Selected Grid Node Atmospheric & Meteorology Readout */}
          {activeInspected && (
            <ScrollRevealCard delay={0.04}>
              <div className={`vayu-glass-panel rounded-2xl border p-4 ${tokens.surface}`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Compass className="w-5 h-5 text-[#38BDF8]" />
                    <div>
                      <h2 className={`font-display text-sm sm:text-base font-semibold ${tokens.textPrimary}`}>
                        {activeInspected.name
                          ? `${activeInspected.name}${activeInspected.state ? `, ${activeInspected.state}` : ''}`
                          : `Spatial Sector (${activeInspected.lat.toFixed(3)}°, ${activeInspected.lon.toFixed(3)}°)`}
                      </h2>
                      <p className={`text-xs ${tokens.textMuted}`}>
                        {activeInspected.weatherLabel} · Cloud {activeInspected.cloudCoverPercent}% · Precip{' '}
                        {activeInspected.precipMm} mm
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-5 text-xs tabular-nums">
                    <div>
                      <span className={`block ${tokens.textMuted}`}>US AQI</span>
                      <span className="font-mono-tabular text-sm font-bold" style={{ color: inspectedBand.color }}>
                        {activeInspected.aqi} · {inspectedBand.label}
                      </span>
                    </div>
                    <div>
                      <span className={`block ${tokens.textMuted}`}>PM2.5</span>
                      <span className={`font-mono-tabular text-sm font-semibold ${tokens.textPrimary}`}>
                        {activeInspected.pm25} µg/m³
                      </span>
                    </div>
                    <div>
                      <span className={`block ${tokens.textMuted}`}>Temp</span>
                      <span className={`font-mono-tabular text-sm font-semibold inline-flex items-center gap-1 ${tokens.textPrimary}`}>
                        <Thermometer className="w-3.5 h-3.5 text-orange-400" />
                        {activeInspected.temperatureC}°C
                      </span>
                    </div>
                    <div>
                      <span className={`block ${tokens.textMuted}`}>Wind Vector</span>
                      <span className={`font-mono-tabular text-sm font-semibold inline-flex items-center gap-1 ${tokens.textPrimary}`}>
                        <Wind className="w-3.5 h-3.5 text-[#38BDF8]" />
                        {activeInspected.windKmh} km/h {activeInspected.windDir}
                      </span>
                    </div>
                    {(layerLoading || indiaLoading) && (
                      <Loader2 className="w-4 h-4 animate-spin text-[#38BDF8]" />
                    )}
                  </div>
                </div>
              </div>
            </ScrollRevealCard>
          )}
        </div>

        {/* 4-Column Direct Google Maps Journey Planner & Gemini Optimizer */}
        <div className="lg:col-span-4 space-y-4">
          <ScrollRevealCard immediate delay={0.05}>
            <div className={`vayu-glass-panel rounded-2xl border p-5 space-y-4 ${tokens.surface}`}>
              <div>
                <h2 className={`font-display text-lg font-semibold flex items-center gap-2 ${tokens.textPrimary}`}>
                  <Navigation className="w-4 h-4 text-emerald-500" />
                  <span>Google Maps Journey Planner</span>
                </h2>
                <p className={`mt-0.5 text-xs ${tokens.textMuted}`}>
                  Live highways, rail tracks, metro &amp; pedestrian networks with clean-air scoring.
                </p>
              </div>

              {/* Origin Search */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-medium ${tokens.textMuted}`}>Origin (Pin A)</span>
                  <span className="font-mono-tabular text-[11px] text-[#38BDF8] truncate max-w-[160px]">
                    {originLabel}
                  </span>
                </div>
                <div className="relative">
                  <Search className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${tokens.textMuted}`} />
                  <input
                    type="text"
                    value={originSearch}
                    onChange={(e) => setOriginSearch(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const list = originResults.length > 0 ? originResults : await searchGlobalLocations(originSearch.trim());
                      const first = list[0];
                      if (first) {
                        triggerHaptic('medium');
                        setOrigin({ lat: first.lat, lon: first.lon });
                        setOriginLabel(first.name);
                        setOriginSearch('');
                        setOriginResults([]);
                      }
                    }}
                    placeholder="Search origin city or address..."
                    data-testid="map-origin-search"
                    className={`h-9 w-full rounded-lg border pl-8 pr-3 text-xs focus:border-[#38BDF8] focus:outline-none ${tokens.input}`}
                  />
                </div>
                {originResults.length > 0 && (
                  <ul
                    data-testid="map-origin-results"
                    className={`max-h-36 overflow-y-auto rounded-lg border divide-y text-xs ${tokens.surfaceSubtle} ${tokens.divider}`}
                  >
                    {originResults.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('medium');
                            setOrigin({ lat: item.lat, lon: item.lon });
                            setOriginLabel(item.name);
                            setOriginSearch('');
                            setOriginResults([]);
                          }}
                          className="w-full px-2.5 py-2 text-left hover:bg-[#38BDF8]/10 cursor-pointer truncate"
                        >
                          {item.displayLabel}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Destination Search */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-medium ${tokens.textMuted}`}>Destination (Pin B)</span>
                  <span className={`font-mono-tabular text-[11px] font-medium truncate max-w-[160px] ${tokens.isLight ? 'text-purple-700' : 'text-[#D0BCFF]'}`}>
                    {destinationLabel}
                  </span>
                </div>
                <div className="relative">
                  <Search className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${tokens.textMuted}`} />
                  <input
                    type="text"
                    value={destSearch}
                    onChange={(e) => setDestSearch(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const list = destResults.length > 0 ? destResults : await searchGlobalLocations(destSearch.trim());
                      const first = list[0];
                      if (first) {
                        triggerHaptic('medium');
                        setDestination({ lat: first.lat, lon: first.lon });
                        setDestinationLabel(first.name);
                        setDestSearch('');
                        setDestResults([]);
                      }
                    }}
                    placeholder="Search any destination worldwide..."
                    data-testid="map-destination-search"
                    className={`h-9 w-full rounded-lg border pl-8 pr-3 text-xs focus:border-[#38BDF8] focus:outline-none ${tokens.input}`}
                  />
                </div>
                {destResults.length > 0 && (
                  <ul
                    data-testid="map-destination-results"
                    className={`max-h-36 overflow-y-auto rounded-lg border divide-y text-xs ${tokens.surfaceSubtle} ${tokens.divider}`}
                  >
                    {destResults.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('medium');
                            setDestination({ lat: item.lat, lon: item.lon });
                            setDestinationLabel(item.name);
                            setDestSearch('');
                            setDestResults([]);
                          }}
                          className="w-full px-2.5 py-2 text-left hover:bg-[#8B5CF6]/15 cursor-pointer truncate"
                        >
                          {item.displayLabel}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* All 5 Official Google Maps Travel Modes */}
              <div>
                <span className={`block text-xs font-medium mb-1.5 ${tokens.textMuted}`}>
                  Google Maps Transit Method
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
                  {TRANSIT_MODES.map((m) => {
                    const Icon = m.icon;
                    const active = transitMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        data-testid={`transit-mode-${m.id}`}
                        onClick={() => {
                          triggerHaptic('light');
                          setTransitMode(m.id);
                        }}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors cursor-pointer ${
                          active
                            ? tokens.isLight
                              ? 'border-sky-600 bg-sky-500/18 text-sky-900'
                              : 'border-[#38BDF8] bg-[#38BDF8]/18 text-[#38BDF8]'
                            : tokens.btnSecondary
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${tokens.isLight ? 'text-sky-700' : 'text-[#38BDF8]'}`} />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold leading-tight">{m.label}</span>
                          <span className={`block text-[10px] leading-tight truncate ${tokens.textMuted}`}>
                            {m.sublabel}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Mandatory Google Maps Beta Notice for WALK / BICYCLE / TWO_WHEELER */}
                {isBetaMode && (
                  <div
                    data-testid="beta-transit-notice"
                    className={`mt-2 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] ${
                      tokens.isLight
                        ? 'border-amber-600/40 bg-amber-500/15 text-amber-900'
                        : 'border-amber-400/35 bg-amber-500/10 text-amber-300'
                    }`}
                  >
                    <Info className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${tokens.isLight ? 'text-amber-700' : 'text-amber-400'}`} />
                    <span>
                      Walking, bicycling, and two-wheeler routes are in beta — check for dedicated sidewalks, bike paths, or local lane restrictions.
                    </span>
                  </div>
                )}
              </div>

              {/* Distance & Routing Status */}
              <div
                data-testid="route-distance-indicator"
                className={`rounded-xl border p-3 text-xs flex items-center justify-between gap-2 ${
                  needsBackgroundTask
                    ? tokens.isLight
                      ? 'border-amber-600/40 bg-amber-500/15 text-amber-900'
                      : 'border-amber-500/35 bg-amber-500/10 text-amber-400'
                    : tokens.isLight
                      ? 'border-sky-600/35 bg-sky-500/14 text-sky-900'
                      : 'border-[#38BDF8]/30 bg-[#38BDF8]/10 text-[#38BDF8]'
                }`}
              >
                <span className="font-semibold">
                  {optimalCandidate ? optimalCandidate.distanceKm : directDistanceKm} km{' '}
                  {needsBackgroundTask ? `(>${SYNC_ROUTE_MAX_KM} km)` : `(<=${SYNC_ROUTE_MAX_KM} km)`}
                </span>
                <span className="text-[11px] opacity-90">
                  {routeResult?.routingSource === 'google_routes'
                    ? 'Google Roads/Rail'
                    : routeResult?.routingSource === 'osrm_roads'
                      ? 'Road Network'
                      : needsBackgroundTask
                        ? 'Background Task'
                        : 'Instant Sync'}
                </span>
              </div>

              {/* Direct Route Metrics + Explain Journey Action (Available to ALL users once route is loaded) */}
              {routeResult && optimalCandidate && (
                <div
                  data-testid="optimized-route-result"
                  className={`rounded-xl border p-4 space-y-3 ${
                    tokens.isLight
                      ? 'border-emerald-600/35 bg-emerald-500/12'
                      : 'border-emerald-500/35 bg-emerald-500/10'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-xs font-semibold ${tokens.isLight ? 'text-emerald-800' : 'text-emerald-400'}`}>
                      {isGeminiOptimized ? 'Gemini Exposure Saved' : 'Cleanest Path Active'}
                    </span>
                    <span className={`font-display text-xl font-bold tabular-nums ${tokens.isLight ? 'text-emerald-800' : 'text-emerald-400'}`}>
                      {routeResult.exposureReductionPercent > 0
                        ? `-${routeResult.exposureReductionPercent}%`
                        : `${optimalCandidate.avgAqi} AQI`}
                    </span>
                  </div>

                  <p className={`text-[11px] font-medium ${tokens.textPrimary}`}>
                    {optimalCandidate.label}
                  </p>

                  <div className={`grid grid-cols-2 gap-2.5 border-t pt-2.5 text-xs tabular-nums ${tokens.divider}`}>
                    <div>
                      <span className={`block text-[11px] ${tokens.textMuted}`}>Chosen Corridor</span>
                      <span className={`font-mono-tabular font-semibold ${tokens.textPrimary}`}>
                        {optimalCandidate.avgAqi} AQI · {optimalCandidate.durationMin}m
                      </span>
                      <span className={`block text-[10px] font-medium ${tokens.isLight ? 'text-emerald-800' : 'text-emerald-400'}`}>
                        {optimalCandidate.inhaledUg} µg PM2.5 · {optimalCandidate.distanceKm} km
                      </span>
                    </div>
                    {baselineCandidate && (
                      <div>
                        <span className={`block text-[11px] ${tokens.textMuted}`}>Baseline Arterial</span>
                        <span className={`font-mono-tabular font-semibold ${tokens.isLight ? 'text-red-700' : 'text-red-400'}`}>
                          {baselineCandidate.avgAqi} AQI · {baselineCandidate.durationMin}m
                        </span>
                        <span className={`block text-[10px] ${tokens.textMuted}`}>
                          {baselineCandidate.inhaledUg} µg PM2.5 · {optimalCandidate.co2SavedGrams}g CO₂e
                        </span>
                      </div>
                    )}
                  </div>

                  {/* AI Explain Journey Button */}
                  <button
                    type="button"
                    data-testid="explain-journey-btn"
                    disabled={isExplainingJourney}
                    onClick={handleExplainJourney}
                    className={`flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-60 cursor-pointer ${
                      tokens.isLight
                        ? 'border-sky-600/50 bg-sky-500/20 text-sky-900 hover:bg-sky-500/30'
                        : 'border-[#38BDF8]/50 bg-[#38BDF8]/18 text-[#38BDF8] hover:bg-[#38BDF8]/28'
                    }`}
                  >
                    {isExplainingJourney ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <GitBranch className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isExplainingJourney
                        ? 'Analyzing Journey Points...'
                        : journeyExplanation
                          ? 'Refresh AI Journey Explanation'
                          : 'Explain Journey (Point-by-Point AI)'}
                    </span>
                  </button>

                  {explainError && (
                    <p className="text-[11px] text-red-400" role="alert">
                      {explainError}
                    </p>
                  )}

                  {isGeminiOptimized && (
                    <div className={`border-t pt-2.5 space-y-1.5 text-xs ${tokens.divider}`}>
                      <p className={`font-semibold flex items-center gap-1.5 ${tokens.textPrimary}`}>
                        <Sparkles className="w-3.5 h-3.5 text-[#38BDF8]" />
                        <span>Gemini Map Synthesis</span>
                      </p>
                      <p className={`leading-relaxed ${tokens.textSecondary}`}>
                        {routeResult.geminiAdvisory}
                      </p>
                      <ol className={`space-y-1 pl-4 list-decimal text-[11px] ${tokens.textMuted}`}>
                        {routeResult.recommendedWaypoints.map((wp, idx) => (
                          <li key={idx}>{wp}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {/* OAuth Gate for Full Gemini Synthesis & >100 km Background Tasks */}
              {!isOAuthUnlocked ? (
                <div
                  data-testid="route-planner-lock-banner"
                  className={`rounded-xl border border-amber-500/35 p-4 text-center space-y-3 ${tokens.surfaceSubtle}`}
                >
                  <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <h3 className={`font-display text-sm font-semibold ${tokens.textPrimary}`}>
                      Sign in for Gemini Deep Optimization
                    </h3>
                    <p className={`text-xs leading-relaxed ${tokens.textSecondary}`}>
                      Direct Google Maps routes &amp; Explain Journey work immediately. Sign in with OAuth to run Gemini low-smog optimization or &gt;100 km background tasks.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onOpenOAuth();
                    }}
                    data-testid="map-unlock-oauth-btn"
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#38BDF8] to-[#8B5CF6] text-xs font-semibold text-[#060609] shadow-[0_0_24px_-4px_rgba(56,189,248,0.45)] hover:brightness-110 transition-all cursor-pointer"
                  >
                    <span>Sign in with OAuth to Unlock</span>
                  </button>
                </div>
              ) : (
                <div data-testid="route-planner-unlocked" className="space-y-3">
                  {needsBackgroundTask ? (
                    <button
                      type="button"
                      onClick={handleLaunchBackgroundTask}
                      data-testid="launch-background-task-btn"
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-400 to-[#8B5CF6] text-xs font-semibold text-[#060609] hover:brightness-110 transition-all cursor-pointer"
                    >
                      <Bell className="w-4 h-4" />
                      <span>Run Background Gemini Task (&gt;100 km)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isComputingRoute}
                      onClick={handleOptimizeSyncRoute}
                      data-testid="optimize-sync-route-btn"
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#38BDF8] to-[#10B981] text-xs font-semibold text-[#060609] hover:brightness-110 transition-all disabled:opacity-60 cursor-pointer"
                    >
                      {isComputingRoute ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      <span>
                        {isComputingRoute
                          ? 'Gemini Analyzing Map Layers...'
                          : 'Optimize Least-Polluted Fast Route'}
                      </span>
                    </button>
                  )}

                  {routeError && (
                    <p className="text-xs text-red-400" role="alert">
                      {routeError}
                    </p>
                  )}

                  {/* Background >100km Task Queue */}
                  {backgroundTasks.length > 0 && (
                    <div className={`rounded-xl border p-3.5 space-y-2.5 ${tokens.surfaceSubtle}`}>
                      <p className={`text-xs font-semibold flex items-center gap-1.5 ${tokens.textPrimary}`}>
                        <Bell className="w-3.5 h-3.5 text-[#38BDF8]" />
                        <span>Background Gemini Tasks (&gt;100 km)</span>
                      </p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {backgroundTasks.slice(0, 4).map((task) => (
                          <div
                            key={task.id}
                            className={`rounded-lg border p-2.5 text-[11px] space-y-1.5 ${tokens.divider} ${tokens.surface}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className={`font-semibold truncate ${tokens.textPrimary}`}>
                                {task.originLabel} → {task.destinationLabel}
                              </span>
                              <span className="font-mono-tabular shrink-0 text-[#38BDF8]">
                                {task.distanceKm} km
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className={tokens.textMuted}>{task.stage}</span>
                              {task.status === 'completed' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              ) : task.status === 'failed' ? (
                                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                              ) : (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#38BDF8] shrink-0" />
                              )}
                            </div>
                            {task.status === 'completed' && task.result && (
                              <button
                                type="button"
                                onClick={() => {
                                  triggerHaptic('medium');
                                  setOrigin(task.origin);
                                  setOriginLabel(task.originLabel);
                                  setDestination(task.destination);
                                  setDestinationLabel(task.destinationLabel);
                                  setTransitMode(task.transitMode);
                                  setRouteResult(task.result ?? null);
                                  setIsGeminiOptimized(true);
                                }}
                                className="w-full rounded-md bg-emerald-500/15 border border-emerald-500/35 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/25 cursor-pointer"
                              >
                                Plot Completed Route on Map
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollRevealCard>
        </div>
      </div>
    </div>
  );
};
