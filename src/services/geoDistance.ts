import { Artist, ClientAnchorPoint } from '../types';

export const WALK_IDEAL_MINUTES = 5;
export const WALK_COMFORT_MINUTES = 12;

export type WalkabilityTier = 'ideal_walk' | 'easy_walk' | 'short_ride';

export interface RouteMetricsOverride {
  distanceMeters: number;
  durationMillis: number;
  source: 'routes_api' | 'haversine';
}

export interface RankedArtistProximity {
  artist: Artist;
  distanceKm: number;
  walkMinutes: number;
  driveMinutes: number;
  label: string;
  tier: WalkabilityTier;
  isIdealWalk: boolean;
  metricSource: 'routes_api' | 'haversine';
  matchedAnchor: ClientAnchorPoint;
  bestSavedAnchor: {
    anchor: ClientAnchorPoint;
    distanceKm: number;
    walkMinutes: number;
    isIdealWalk: boolean;
  };
}

export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Number(distance.toFixed(2));
}

export function formatTravelEstimate(distanceKm: number): {
  walkMinutes: number;
  driveMinutes: number;
  label: string;
} {
  // City walk speed ~4.8 km/h (~12.5 min/km), clamp minimum 1 min when virtually next door
  const walkMinutes = Math.max(1, Math.round(distanceKm * 12.5));
  const driveMinutes = Math.max(3, Math.round(distanceKm * 3.5));

  let label = `${distanceKm} km`;
  if (distanceKm < 1.5) {
    label = `${distanceKm} km · ${walkMinutes} min walk`;
  } else {
    label = `${distanceKm} km · ${driveMinutes} min drive`;
  }

  return {
    walkMinutes,
    driveMinutes,
    label,
  };
}

export function classifyWalkability(walkMinutes: number): WalkabilityTier {
  if (walkMinutes <= WALK_IDEAL_MINUTES) return 'ideal_walk';
  if (walkMinutes <= WALK_COMFORT_MINUTES) return 'easy_walk';
  return 'short_ride';
}

export function rankArtistsByAnchors(params: {
  artists: Artist[];
  anchorPoints: ClientAnchorPoint[];
  activeAnchor: ClientAnchorPoint;
  rankingMode: 'active' | 'best_any';
  routeMetricsByArtistId?: Record<string, RouteMetricsOverride>;
}): RankedArtistProximity[] {
  const { artists, anchorPoints, activeAnchor, rankingMode, routeMetricsByArtistId } = params;
  const allAnchors = anchorPoints.length > 0 ? anchorPoints : [activeAnchor];

  const ranked = artists.map(artist => {
    const artCoords = artist.coordinates ?? { lat: 41.395, lng: 2.162 };

    // Distance/walk from active anchor (or Routes API measurement if available)
    const activeDistKm = calculateDistanceKm(
      activeAnchor.coordinates.lat,
      activeAnchor.coordinates.lng,
      artCoords.lat,
      artCoords.lng
    );
    const activeHaversine = formatTravelEstimate(activeDistKm);
    const liveMetric = routeMetricsByArtistId?.[artist.id];

    const activeResolvedDistKm = liveMetric
      ? Number((liveMetric.distanceMeters / 1000).toFixed(2))
      : activeDistKm;
    const activeResolvedWalkMin = liveMetric
      ? Math.max(1, Math.round(liveMetric.durationMillis / 60000))
      : activeHaversine.walkMinutes;

    // Best match across ALL client saved addresses (up to 10)
    let bestAnchor = activeAnchor;
    let bestDistKm = activeResolvedDistKm;
    let bestWalkMin = activeResolvedWalkMin;

    for (const candidate of allAnchors) {
      const distKm =
        candidate.id === activeAnchor.id && liveMetric
          ? activeResolvedDistKm
          : calculateDistanceKm(
              candidate.coordinates.lat,
              candidate.coordinates.lng,
              artCoords.lat,
              artCoords.lng
            );
      const walkMin =
        candidate.id === activeAnchor.id && liveMetric
          ? activeResolvedWalkMin
          : formatTravelEstimate(distKm).walkMinutes;

      if (walkMin < bestWalkMin || (walkMin === bestWalkMin && distKm < bestDistKm)) {
        bestAnchor = candidate;
        bestDistKm = distKm;
        bestWalkMin = walkMin;
      }
    }

    const useBestAny = rankingMode === 'best_any';
    const distanceKm = useBestAny ? bestDistKm : activeResolvedDistKm;
    const walkMinutes = useBestAny ? bestWalkMin : activeResolvedWalkMin;
    const est = formatTravelEstimate(distanceKm);
    const tier = classifyWalkability(walkMinutes);

    return {
      artist,
      distanceKm,
      walkMinutes,
      driveMinutes: est.driveMinutes,
      label: est.label,
      tier,
      isIdealWalk: tier === 'ideal_walk',
      metricSource: !useBestAny && liveMetric ? liveMetric.source : 'haversine',
      matchedAnchor: useBestAny ? bestAnchor : activeAnchor,
      bestSavedAnchor: {
        anchor: bestAnchor,
        distanceKm: bestDistKm,
        walkMinutes: bestWalkMin,
        isIdealWalk: classifyWalkability(bestWalkMin) === 'ideal_walk',
      },
    };
  });

  return ranked.sort((a, b) => {
    if (a.walkMinutes !== b.walkMinutes) return a.walkMinutes - b.walkMinutes;
    return a.distanceKm - b.distanceKm;
  });
}

