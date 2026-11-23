import { useEffect, useRef } from 'react';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { notifyIfGmpQuotaError } from './gmpErrors';
import { RouteMetricsOverride } from '../../services/geoDistance';

interface WalkingRouteOverlayProps {
  artistId: string;
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral;
  fitViewportToken: number;
  onRouteComputed: (artistId: string, metrics: RouteMetricsOverride) => void;
  onRouteStatusChange?: (status: { loading: boolean; error: string | null }) => void;
}

/**
 * Renders an interactive walking route polyline between the active client anchor
 * and the selected nail master salon using the modern Maps JS SDK Routes library
 * (`routesLib.Route.computeRoutes`, never legacy DirectionsService).
 */
export function WalkingRouteOverlay({
  artistId,
  origin,
  destination,
  fitViewportToken,
  onRouteComputed,
  onRouteStatusChange,
}: WalkingRouteOverlayProps) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const routeCacheRef = useRef<Record<string, google.maps.routes.Route>>({});
  const onRouteComputedRef = useRef(onRouteComputed);
  const onStatusRef = useRef(onRouteStatusChange);
  const lastFittedTokenRef = useRef(0);

  onRouteComputedRef.current = onRouteComputed;
  onStatusRef.current = onRouteStatusChange;

  const originLat = origin.lat;
  const originLng = origin.lng;
  const destLat = destination.lat;
  const destLng = destination.lng;

  useEffect(() => {
    if (!map || !routesLib) return;

    let cancelled = false;
    const originLiteral: google.maps.LatLngLiteral = { lat: originLat, lng: originLng };
    const destLiteral: google.maps.LatLngLiteral = { lat: destLat, lng: destLng };

    const clearPolylines = () => {
      polylinesRef.current.forEach(polyline => polyline.setMap(null));
      polylinesRef.current = [];
    };

    const renderRoute = (route: google.maps.routes.Route, shouldFit: boolean) => {
      clearPolylines();
      const distanceMeters = route.distanceMeters ?? 0;
      const durationMillis = route.durationMillis ?? 0;
      const walkMinutes = Math.max(1, Math.round(durationMillis / 60000));
      const strokeColor = walkMinutes <= 5 ? '#10b981' : '#06b6d4';

      const newPolylines = route.createPolylines();
      newPolylines.forEach(polyline => {
        polyline.setOptions({
          strokeColor,
          strokeWeight: 5,
          strokeOpacity: 0.92,
        });
        polyline.setMap(map);
      });
      polylinesRef.current = newPolylines;

      if (shouldFit && route.viewport) {
        map.fitBounds(route.viewport, { top: 48, right: 48, bottom: 48, left: 48 });
      }

      onRouteComputedRef.current(artistId, {
        distanceMeters,
        durationMillis,
        source: 'routes_api',
      });
    };

    const cacheKey = `${originLat.toFixed(5)},${originLng.toFixed(5)}->${destLat.toFixed(
      5
    )},${destLng.toFixed(5)}`;
    const shouldFit = fitViewportToken > lastFittedTokenRef.current;
    if (shouldFit) {
      lastFittedTokenRef.current = fitViewportToken;
    }

    const cached = routeCacheRef.current[cacheKey];
    if (cached) {
      renderRoute(cached, shouldFit);
      onStatusRef.current?.({ loading: false, error: null });
      return clearPolylines;
    }

    onStatusRef.current?.({ loading: true, error: null });

    const request: google.maps.routes.ComputeRoutesRequest = {
      origin: originLiteral,
      destination: destLiteral,
      travelMode: routesLib.TravelMode.WALKING,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'legs'],
    };

    routesLib.Route.computeRoutes(request)
      .then(({ routes }) => {
        if (cancelled) return;
        onStatusRef.current?.({ loading: false, error: null });
        if (!routes || routes.length === 0) {
          return;
        }
        const primaryRoute = routes[0];
        routeCacheRef.current[cacheKey] = primaryRoute;
        renderRoute(primaryRoute, shouldFit);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        notifyIfGmpQuotaError(err);
        onStatusRef.current?.({
          loading: false,
          error: err instanceof Error ? err.message : 'Unable to compute walking route.',
        });
      });

    return () => {
      cancelled = true;
      clearPolylines();
    };
  }, [map, routesLib, artistId, originLat, originLng, destLat, destLng, fitViewportToken]);

  return null;
}
