import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isGmpQuotaError, notifyIfGmpQuotaError } from '../components/maps/gmpErrors';
import { validateAnchorPointRecord } from '../domain/schemas';
import { MemoryStorageAdapter } from '../infrastructure/storage/indexedDbAdapter';
import { SalonRepository } from '../infrastructure/storage/salonRepository';
import {
  classifyWalkability,
  rankArtistsByAnchors,
  WALK_COMFORT_MINUTES,
  WALK_IDEAL_MINUTES,
} from '../services/geoDistance';
import { Artist, ClientAnchorPoint, MAX_CLIENT_ANCHORS } from '../types';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

const SAMPLE_ARTISTS: Artist[] = [
  {
    id: 'artist-far',
    name: 'Elena Far',
    handle: 'elena_far',
    avatar: '/assets/images/avatar_master_artist_1790123890131.jpg',
    bio: 'Luxury nail care',
    specialty: 'Sculptural Chrome',
    location: 'Barcelona',
    rating: 4.9,
    reviewCount: 30,
    portfolioCount: 18,
    basePrice: 90,
    salonName: 'Far Salon',
    salonAddress: 'Diagonal 500, Barcelona',
    coordinates: { lat: 41.404, lng: 2.175 },
  },
  {
    id: 'artist-home-walk',
    name: 'Sofia Walkable',
    handle: 'sofia_walk',
    avatar: '/assets/images/avatar_master_artist_1790123890131.jpg',
    bio: 'Express manicure',
    specialty: 'Bio-Gel',
    location: 'Eixample, Barcelona',
    rating: 5.0,
    reviewCount: 44,
    portfolioCount: 25,
    basePrice: 80,
    salonName: 'Atelier Near Home',
    salonAddress: 'Rambla de Catalunya 88, Eixample',
    coordinates: { lat: 41.3949, lng: 2.1623 },
  },
  {
    id: 'artist-club-walk',
    name: 'Mila Nightlife',
    handle: 'mila_club',
    avatar: '/assets/images/avatar_master_artist_1790123890131.jpg',
    bio: 'Neon nails',
    specialty: 'Y2K Glow',
    location: 'Poblenou, Barcelona',
    rating: 4.8,
    reviewCount: 19,
    portfolioCount: 14,
    basePrice: 75,
    salonName: 'Studio Near Club',
    salonAddress: 'Carrer de Pamplona 88, Poblenou',
    coordinates: { lat: 41.3978, lng: 2.1912 },
  },
];

const HOME_ANCHOR: ClientAnchorPoint = {
  id: 'home',
  name: 'Дом',
  label: 'Дом',
  icon: 'Home',
  category: 'home',
  address: 'Rambla de Catalunya 85, Eixample',
  coordinates: { lat: 41.3945, lng: 2.1618 },
};

const CLUB_ANCHOR: ClientAnchorPoint = {
  id: 'club-1',
  name: 'Razzmatazz Club',
  label: 'Клуб',
  icon: 'Music',
  category: 'club',
  address: 'Carrer dels Almogàvers 122, Poblenou',
  coordinates: { lat: 41.3977, lng: 2.1911 },
};

describe('Google Maps Proximity, 10-Anchor CRUD & Compliance Suite (Stage 5.3)', () => {
  describe('Walkability classification & multi-anchor ranking (3-5 min stroll target)', () => {
    it('classifies walkability tiers accurately around WALK_IDEAL_MINUTES (5) and WALK_COMFORT_MINUTES (12)', () => {
      expect(WALK_IDEAL_MINUTES).toBe(5);
      expect(WALK_COMFORT_MINUTES).toBe(12);
      expect(classifyWalkability(1)).toBe('ideal_walk');
      expect(classifyWalkability(5)).toBe('ideal_walk');
      expect(classifyWalkability(6)).toBe('easy_walk');
      expect(classifyWalkability(12)).toBe('easy_walk');
      expect(classifyWalkability(15)).toBe('short_ride');
    });

    it('ranks the closest master within 3-5 min walk first in active mode and prefers live Routes API metrics when provided', () => {
      const ranked = rankArtistsByAnchors({
        artists: SAMPLE_ARTISTS,
        anchorPoints: [HOME_ANCHOR, CLUB_ANCHOR],
        activeAnchor: HOME_ANCHOR,
        rankingMode: 'active',
        routeMetricsByArtistId: {
          'artist-home-walk': {
            distanceMeters: 240,
            durationMillis: 180_000, // 3 minutes
            source: 'routes_api',
          },
        },
      });

      expect(ranked[0].artist.id).toBe('artist-home-walk');
      expect(ranked[0].walkMinutes).toBe(3);
      expect(ranked[0].isIdealWalk).toBe(true);
      expect(ranked[0].metricSource).toBe('routes_api');
      expect(ranked[0].matchedAnchor.id).toBe('home');
      // Cross-anchor hint spots that Mila is 1 min walk from Club
      const mila = ranked.find(r => r.artist.id === 'artist-club-walk');
      expect(mila).toBeDefined();
      expect(mila!.bestSavedAnchor.anchor.id).toBe('club-1');
      expect(mila!.bestSavedAnchor.isIdealWalk).toBe(true);
    });

    it('surfaces masters within a 3-5 min walk from ANY of the client saved places in best_any mode', () => {
      const rankedAny = rankArtistsByAnchors({
        artists: SAMPLE_ARTISTS,
        anchorPoints: [HOME_ANCHOR, CLUB_ANCHOR],
        activeAnchor: HOME_ANCHOR,
        rankingMode: 'best_any',
      });

      const topTwoIds = rankedAny.slice(0, 2).map(r => r.artist.id);
      expect(topTwoIds).toContain('artist-home-walk');
      expect(topTwoIds).toContain('artist-club-walk');
      expect(rankedAny[2].artist.id).toBe('artist-far');

      const mila = rankedAny.find(r => r.artist.id === 'artist-club-walk');
      expect(mila!.matchedAnchor.id).toBe('club-1');
      expect(mila!.isIdealWalk).toBe(true);
    });
  });

  describe('SalonRepository up-to-10 client anchors CRUD, bounds validation & transactional outbox', () => {
    it('supports saving up to 10 addresses (Home, Work, Clubs, Cafes), blocks an 11th, preserves at least 1, and records outbox', async () => {
      const store = new Map<string, unknown>();
      const repo = new SalonRepository(new MemoryStorageAdapter(store), { language: 'en' });
      const initial = await repo.ensureSeededAndLoad();
      const seedCount = initial.anchorPoints.length;
      expect(seedCount).toBeGreaterThanOrEqual(1);
      expect(MAX_CLIENT_ANCHORS).toBe(10);

      // Fill up to exactly 10 anchors
      const categories = ['club', 'cafe', 'gym', 'studio', 'custom', 'cafe', 'club', 'work'] as const;
      let fullAnchors = initial.anchorPoints;
      for (let i = 0; fullAnchors.length < MAX_CLIENT_ANCHORS; i++) {
        const res = await repo.addAnchorPointWithOutbox({
          name: `Spot ${i + 1}`,
          label: 'Frequent Place',
          icon: 'Coffee',
          category: categories[i % categories.length],
          address: `Carrer Test ${i + 1}, Barcelona`,
          coordinates: {
            lat: Number((41.39 + i * 0.001).toFixed(5)),
            lng: Number((2.16 + i * 0.001).toFixed(5)),
          },
          placeId: `ChIJ_test_${i}`,
        });
        fullAnchors = res.anchorPoints;
        expect(res.added.origin).toBe('user');
        expect(res.outbox.some(m => m.action === 'ANCHOR_POINT_ADDED')).toBe(true);
      }

      expect(fullAnchors).toHaveLength(10);

      // Adding an 11th must reject cleanly
      await expect(
        repo.addAnchorPointWithOutbox({
          name: '11th Place',
          label: 'Overflow',
          icon: 'MapPin',
          category: 'custom',
          address: 'Overflow Street 11',
          coordinates: { lat: 41.4, lng: 2.17 },
        })
      ).rejects.toThrow(/10/);

      // Remove down to 1 anchor, verify last-1 protection
      for (let i = fullAnchors.length - 1; i >= 1; i--) {
        const removed = await repo.removeAnchorPointWithOutbox(fullAnchors[i].id);
        expect(removed.outbox.some(m => m.action === 'ANCHOR_POINT_REMOVED')).toBe(true);
      }

      const reloaded = await repo.ensureSeededAndLoad();
      expect(reloaded.anchorPoints).toHaveLength(1);

      await expect(repo.removeAnchorPointWithOutbox(reloaded.anchorPoints[0].id)).rejects.toThrow(
        /At least one address/i
      );
    });

    it('rejects out-of-range geographic coordinates in anchor schema validation', () => {
      const badLat = validateAnchorPointRecord({
        id: 'bad-1',
        name: 'Mars',
        label: 'Custom',
        icon: 'MapPin',
        address: 'Invalid Lat',
        coordinates: { lat: 95, lng: 2.16 },
      });
      expect(badLat.ok).toBe(false);

      const badLng = validateAnchorPointRecord({
        id: 'bad-2',
        name: 'Out of Bounds',
        label: 'Custom',
        icon: 'MapPin',
        address: 'Invalid Lng',
        coordinates: { lat: 41.39, lng: -185 },
      });
      expect(badLng.ok).toBe(false);

      const valid = validateAnchorPointRecord({
        id: 'ok-1',
        name: 'Cafe',
        label: 'Cafe',
        icon: 'Coffee',
        category: 'cafe',
        address: 'Rambla 10',
        coordinates: { lat: 41.39, lng: 2.16 },
        placeId: 'ChIJ_ok',
      });
      expect(valid.ok).toBe(true);
    });
  });

  describe('Case A Demo Quota Defense & Google Maps SDK architectural guards', () => {
    it('detects explicit quota/429 errors without false-positives on empty results', () => {
      expect(isGmpQuotaError({ status: 429 })).toBe(true);
      expect(isGmpQuotaError({ code: 'OVER_QUERY_LIMIT' })).toBe(true);
      expect(isGmpQuotaError({ status: 'RESOURCE_EXHAUSTED' })).toBe(true);
      expect(isGmpQuotaError(new Error('OverQuotaMapError: quota exceeded'))).toBe(true);
      expect(isGmpQuotaError('HTTP 429 QuotaExceededError')).toBe(true);

      expect(isGmpQuotaError(null)).toBe(false);
      expect(isGmpQuotaError('')).toBe(false);
      expect(isGmpQuotaError({ status: 'ZERO_RESULTS' })).toBe(false);
      expect(isGmpQuotaError(new Error('No routes found between origin and destination'))).toBe(
        false
      );
      expect(notifyIfGmpQuotaError({ status: 'ZERO_RESULTS' })).toBe(false);
    });

    it('uses zero deprecated Maps APIs, includes required AI Studio attribution ID, and wires Case A quota banner', () => {
      const mapFiles = [
        path.join(PROJECT_ROOT, 'src', 'components', 'ClientLocationMap.tsx'),
        path.join(PROJECT_ROOT, 'src', 'components', 'maps', 'AnchorMarkersLayer.tsx'),
        path.join(PROJECT_ROOT, 'src', 'components', 'maps', 'MasterMarkersLayer.tsx'),
        path.join(PROJECT_ROOT, 'src', 'components', 'maps', 'PlaceAddressSearch.tsx'),
        path.join(PROJECT_ROOT, 'src', 'components', 'maps', 'WalkingRouteOverlay.tsx'),
        path.join(PROJECT_ROOT, 'src', 'components', 'maps', 'useAutocompleteSuggestions.ts'),
      ];

      const forbiddenPatterns = [
        /google\.maps\.Marker\b/,
        /\bDirectionsService\b/,
        /\bDirectionsRenderer\b/,
        /\bDistanceMatrixService\b/,
        /\bPlacesService\b/,
        /\bAutocompleteService\b/,
        /gmpx-store-locator/,
        /getDetails\s*\(/,
      ];

      for (const file of mapFiles) {
        const src = fs.readFileSync(file, 'utf8');
        for (const pattern of forbiddenPatterns) {
          expect(src).not.toMatch(pattern);
        }
      }

      const clientMapSrc = fs.readFileSync(mapFiles[0], 'utf8');
      expect(clientMapSrc).toContain("internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}");
      expect(clientMapSrc).toContain('DEMO_MAP_ID');

      const mainSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'main.tsx'), 'utf8');
      const appSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'App.tsx'), 'utf8');
      expect(mainSrc).toContain('gmp-quota-exceeded');
      expect(mainSrc).toContain('gm_authFailure');
      expect(appSrc).toContain('gmp-quota-exceeded');
      expect(appSrc).toContain('utm_campaign=gmp_mcp_codeassist_v1_aistudio');
    });
  });
});
