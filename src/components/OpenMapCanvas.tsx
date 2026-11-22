import { useEffect, useRef, useState } from 'react';
import {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';
import type { ErrorEvent as MapLibreErrorEvent, MapMouseEvent } from 'maplibre-gl';
import type { FeatureCollection, LineString, Point } from 'geojson';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GeminiOptimizedRoutePayload, MapLayerNode } from '../types';
import type { LatLngPoint } from '../utils/routeOptimizer';
import { getAqiBand } from '../utils/airQuality';

const DEFAULT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
setWorkerUrl(workerUrl);

interface CameraCommand {
  type: 'india' | 'route' | 'point';
  point?: LatLngPoint;
  nonce: number;
}

interface OpenMapCanvasProps {
  center: { lat: number; lng: number };
  centerKey: string;
  zoom: number;
  origin: LatLngPoint;
  originLabel: string;
  destination: LatLngPoint;
  destinationLabel: string;
  selectedJourneyPoint: { lat: number; lon: number; pointIndex: number; title: string } | null;
  markers: MapLayerNode[];
  showPollutionLayer: boolean;
  showMeteoLayer: boolean;
  routePayload: GeminiOptimizedRoutePayload | null;
  cameraCommand: CameraCommand | null;
  clickMode: 'inspect' | 'origin' | 'destination';
  onMapClick: (point: LatLngPoint) => void;
  onOriginDrag: (point: LatLngPoint) => void;
  onDestinationDrag: (point: LatLngPoint) => void;
  onMarkerClick: (node: MapLayerNode) => void;
  onActivity: () => void;
}

type PointProperties = { aqi: number };
type RouteProperties = { id: string; isOptimal: boolean; isBaseline: boolean };

function isValidPoint(point: LatLngPoint): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon);
}

function fitBounds(map: MapLibreMap, points: LatLngPoint[]): void {
  const validPoints = points.filter(isValidPoint);
  if (validPoints.length < 2) return;

  const bounds = validPoints.reduce(
    (result, point) => result.extend([point.lon, point.lat]),
    new LngLatBounds(
      [validPoints[0].lon, validPoints[0].lat],
      [validPoints[0].lon, validPoints[0].lat]
    )
  );
  map.fitBounds(bounds, { padding: { top: 48, right: 48, bottom: 56, left: 48 }, maxZoom: 14 });
}

function pointFeatureCollection(nodes: MapLayerNode[]): FeatureCollection<Point, PointProperties> {
  return {
    type: 'FeatureCollection',
    features: nodes.map((node) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [node.lon, node.lat] },
      properties: { aqi: node.aqi },
    })),
  };
}

function routeFeatureCollection(
  payload: GeminiOptimizedRoutePayload | null
): FeatureCollection<LineString, RouteProperties> {
  if (!payload) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: payload.candidates
      .filter((candidate) => candidate.path.length >= 2)
      .map((candidate) => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: candidate.path.map((point) => [point.lon, point.lat]),
        },
        properties: {
          id: candidate.id,
          isOptimal: candidate.isOptimal,
          isBaseline: candidate.id === payload.baselineRouteId,
        },
      })),
  };
}

function createRoutePin(label: string, marker: 'A' | 'B' | string, color: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'vayu-map-pin';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.style.backgroundColor = color;
  button.textContent = marker;
  return button;
}

function createStationMarker(node: MapLayerNode, showPollution: boolean, showWeather: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  const band = getAqiBand(node.aqi);
  button.type = 'button';
  button.className = 'vayu-map-station';
  button.setAttribute(
    'aria-label',
    `${node.name || 'Spatial sector'}: US AQI ${node.aqi}${showWeather ? `, ${node.temperatureC}°C` : ''}`
  );
  button.title = button.getAttribute('aria-label') || '';

  if (showPollution) {
    const dot = document.createElement('span');
    dot.className = 'vayu-map-station-dot';
    dot.style.backgroundColor = band.color;
    button.append(dot, document.createTextNode(String(node.aqi)));
  }
  if (showWeather && !node.isIndiaWide) {
    const temperature = document.createElement('span');
    temperature.className = 'vayu-map-station-temperature';
    temperature.textContent = `${node.temperatureC}°`;
    button.append(temperature);
  }
  return button;
}

export function OpenMapCanvas({
  center,
  centerKey,
  zoom,
  origin,
  originLabel,
  destination,
  destinationLabel,
  selectedJourneyPoint,
  markers,
  showPollutionLayer,
  showMeteoLayer,
  routePayload,
  cameraCommand,
  clickMode,
  onMapClick,
  onOriginDrag,
  onDestinationDrag,
  onMarkerClick,
  onActivity,
}: OpenMapCanvasProps) {
  const [mapReady, setMapReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Marker[]>([]);
  const latestPropsRef = useRef<OpenMapCanvasProps | null>(null);
  const mapErrorRef = useRef<((message: string) => void) | null>(null);

  latestPropsRef.current = {
    center,
    centerKey,
    zoom,
    origin,
    originLabel,
    destination,
    destinationLabel,
    selectedJourneyPoint,
    markers,
    showPollutionLayer,
    showMeteoLayer,
    routePayload,
    cameraCommand,
    clickMode,
    onMapClick,
    onOriginDrag,
    onDestinationDrag,
    onMarkerClick,
    onActivity,
  };

  useEffect(() => {
    if (!containerRef.current) return;
    let styleLoaded = false;
    setMapReady(false);
    const map = new MapLibreMap({
      container: containerRef.current,
      style: import.meta.env.VITE_MAP_STYLE_URL || DEFAULT_MAP_STYLE,
      center: [center.lng, center.lat],
      zoom,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: true }), 'top-right');

    const onLoad = () => {
      styleLoaded = true;
      setMapReady(true);
      mapErrorRef.current?.('');
      map.addSource('vayu-stations', {
        type: 'geojson',
        data: pointFeatureCollection([]),
      });
      map.addLayer({
        id: 'vayu-station-circles',
        type: 'circle',
        source: 'vayu-stations',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 6, 14, 9],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'aqi'],
            0, '#10B981',
            50, '#10B981',
            100, '#F59E0B',
            150, '#F97316',
            200, '#EF4444',
            300, '#8B5CF6',
            500, '#7C2D12',
          ],
          'circle-opacity': 0.9,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.addSource('vayu-routes', {
        type: 'geojson',
        data: routeFeatureCollection(null),
      });
      map.addLayer({
        id: 'vayu-route-alternatives',
        type: 'line',
        source: 'vayu-routes',
        filter: ['==', ['get', 'isOptimal'], false],
        paint: {
          'line-color': ['case', ['get', 'isBaseline'], '#EF4444', '#94A3B8'],
          'line-width': 3,
          'line-opacity': 0.8,
          'line-dasharray': [2, 2],
        },
      });
      map.addLayer({
        id: 'vayu-route-optimal-casing',
        type: 'line',
        source: 'vayu-routes',
        filter: ['==', ['get', 'isOptimal'], true],
        paint: { 'line-color': '#022C22', 'line-width': 9, 'line-opacity': 0.65 },
      });
      map.addLayer({
        id: 'vayu-route-optimal',
        type: 'line',
        source: 'vayu-routes',
        filter: ['==', ['get', 'isOptimal'], true],
        paint: { 'line-color': '#10B981', 'line-width': 5, 'line-opacity': 0.96 },
      });

      const current = latestPropsRef.current;
      if (current) {
        (map.getSource('vayu-stations') as GeoJSONSource).setData(
          pointFeatureCollection(current.showPollutionLayer ? current.markers : [])
        );
        (map.getSource('vayu-routes') as GeoJSONSource).setData(routeFeatureCollection(current.routePayload));
        if (current.routePayload && (!current.cameraCommand || current.cameraCommand.type === 'route')) {
          fitBounds(map, current.routePayload.candidates.flatMap((candidate) => candidate.path));
        }
      }
    };

    const onMapClick = (event: MapMouseEvent) => {
      const current = latestPropsRef.current;
      if (current?.clickMode === 'inspect') return;
      current?.onMapClick({
        lat: Number(event.lngLat.lat.toFixed(5)),
        lon: Number(event.lngLat.lng.toFixed(5)),
      });
    };
    const onMapError = (event: MapLibreErrorEvent) => {
      if (!styleLoaded) mapErrorRef.current?.(event.error.message || 'The open map style could not be loaded.');
    };
    const onMoveEnd = () => latestPropsRef.current?.onActivity();
    map.on('load', onLoad);
    map.on('click', onMapClick);
    map.on('error', onMapError);
    map.on('dragend', onMoveEnd);
    map.on('zoomend', onMoveEnd);

    return () => {
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource('vayu-stations');
    if (source instanceof GeoJSONSource) {
      source.setData(pointFeatureCollection(showPollutionLayer ? markers : []));
    }
    const layer = map.getLayer('vayu-station-circles');
    if (layer) map.setLayoutProperty('vayu-station-circles', 'visibility', showPollutionLayer ? 'visible' : 'none');
  }, [markers, showPollutionLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map?.getSource('vayu-routes');
    if (source instanceof GeoJSONSource) source.setData(routeFeatureCollection(routePayload));
    if (routePayload && (!cameraCommand || cameraCommand.type === 'route')) {
      fitBounds(map, routePayload.candidates.flatMap((candidate) => candidate.path));
    }
  }, [routePayload]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cameraCommand) return;
    if (cameraCommand.type === 'india') {
      map.fitBounds(
        [
          [68, 6],
          [98, 37],
        ],
        { padding: { top: 20, right: 20, bottom: 28, left: 20 } }
      );
    } else if (cameraCommand.type === 'point' && cameraCommand.point) {
      map.flyTo({ center: [cameraCommand.point.lon, cameraCommand.point.lat], zoom: Math.max(map.getZoom(), 13) });
    } else if (cameraCommand.type === 'route' && routePayload) {
      fitBounds(map, routePayload.candidates.flatMap((candidate) => candidate.path));
    }
  }, [cameraCommand?.nonce, routePayload]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [center.lng, center.lat], zoom });
  }, [centerKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;
    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = [];

    const originMarker = new Marker({
      element: createRoutePin(`Origin: ${originLabel}`, 'A', '#0EA5E9'),
      draggable: true,
      anchor: 'bottom',
    })
      .setLngLat([origin.lon, origin.lat])
      .addTo(map);
    originMarker.on('dragend', () => {
      const point = originMarker.getLngLat();
      latestPropsRef.current?.onOriginDrag({ lat: Number(point.lat.toFixed(5)), lon: Number(point.lng.toFixed(5)) });
    });
    markerRefs.current.push(originMarker);

    const destinationMarker = new Marker({
      element: createRoutePin(`Destination: ${destinationLabel}`, 'B', '#8B5CF6'),
      draggable: true,
      anchor: 'bottom',
    })
      .setLngLat([destination.lon, destination.lat])
      .addTo(map);
    destinationMarker.on('dragend', () => {
      const point = destinationMarker.getLngLat();
      latestPropsRef.current?.onDestinationDrag({
        lat: Number(point.lat.toFixed(5)),
        lon: Number(point.lng.toFixed(5)),
      });
    });
    markerRefs.current.push(destinationMarker);

    if (selectedJourneyPoint) {
      const element = createRoutePin(
        `Point #${selectedJourneyPoint.pointIndex}: ${selectedJourneyPoint.title}`,
        `#${selectedJourneyPoint.pointIndex}`,
        '#F59E0B'
      );
      markerRefs.current.push(
        new Marker({ element, anchor: 'bottom' })
          .setLngLat([selectedJourneyPoint.lon, selectedJourneyPoint.lat])
          .addTo(map)
      );
    }

    if (showPollutionLayer || showMeteoLayer) {
      markers.forEach((node) => {
        const element = createStationMarker(node, showPollutionLayer, showMeteoLayer);
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          latestPropsRef.current?.onMarkerClick(node);
        });
        markerRefs.current.push(new Marker({ element, anchor: 'bottom' }).setLngLat([node.lon, node.lat]).addTo(map));
      });
    }
  }, [
    origin,
    originLabel,
    destination,
    destinationLabel,
    selectedJourneyPoint,
    markers,
    showPollutionLayer,
    showMeteoLayer,
    mapReady,
  ]);

  const [mapError, setMapError] = useState('');
  mapErrorRef.current = setMapError;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-label="Interactive OpenStreetMap" />
      {mapError && (
        <div role="alert" className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/90 p-6 text-center text-sm text-white">
          {mapError} Check your connection or configure a working <code className="mx-1">VITE_MAP_STYLE_URL</code>.
        </div>
      )}
    </div>
  );
}
