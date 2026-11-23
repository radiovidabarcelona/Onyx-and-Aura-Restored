import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  ColorScheme,
  Map as GoogleMapView,
  MapMouseEvent,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  Building2,
  Calendar,
  Check,
  Clock,
  Compass,
  Crosshair,
  Edit3,
  Footprints,
  LocateFixed,
  MapPin,
  MessageSquare,
  Navigation,
  Plus,
  Route,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { createId } from '../domain/ids';
import { formatAppMessage } from '../i18n/messages';
import { SupportedLanguage, TranslationStrings } from '../i18n/translations';
import {
  rankArtistsByAnchors,
  RouteMetricsOverride,
  WALK_IDEAL_MINUTES,
} from '../services/geoDistance';
import {
  AnchorCategory,
  Artist,
  ClientAnchorPoint,
  MAX_CLIENT_ANCHORS,
  ThemeMode,
} from '../types';
import { AnchorMarkersLayer, getAnchorCategoryIcon } from './maps/AnchorMarkersLayer';
import { MasterMarkersLayer } from './maps/MasterMarkersLayer';
import { PlaceAddressSearch } from './maps/PlaceAddressSearch';
import { SelectedPlaceResult } from './maps/useAutocompleteSuggestions';
import { WalkingRouteOverlay } from './maps/WalkingRouteOverlay';

interface ClientLocationMapProps {
  artists: Artist[];
  anchorPoints: ClientAnchorPoint[];
  onUpdateAnchorPoint: (point: ClientAnchorPoint) => void;
  onAddAnchorPoint?: (
    point: Omit<ClientAnchorPoint, 'id' | 'origin'> & { id?: string }
  ) => Promise<ClientAnchorPoint | void> | void;
  onRemoveAnchorPoint?: (anchorId: string) => Promise<void> | void;
  onSelectArtistToBook: (artist: Artist) => void;
  onOpenChatWithArtist: (artist: Artist) => void;
  userRole: 'client' | 'master';
  onUpdateMasterSalon?: (
    artistId: string,
    salonName: string,
    salonAddress: string,
    lat: number,
    lng: number
  ) => void;
  theme: ThemeMode;
  language?: SupportedLanguage;
  t: TranslationStrings;
}

interface CategoryPreset {
  category: AnchorCategory;
  nameEn: string;
  nameRu: string;
  labelEn: string;
  labelRu: string;
  icon: string;
}

const ANCHOR_CATEGORY_PRESETS: CategoryPreset[] = [
  { category: 'home', nameEn: 'Home', nameRu: 'Дом', labelEn: 'Home', labelRu: 'Дом', icon: 'Home' },
  { category: 'work', nameEn: 'Work', nameRu: 'Работа', labelEn: 'Work', labelRu: 'Работа', icon: 'Briefcase' },
  { category: 'club', nameEn: 'Club', nameRu: 'Клуб', labelEn: 'Nightlife / Club', labelRu: 'Клуб', icon: 'Music' },
  { category: 'cafe', nameEn: 'Cafe', nameRu: 'Кафе', labelEn: 'Cafe / Lounge', labelRu: 'Кафе', icon: 'Coffee' },
  { category: 'gym', nameEn: 'Gym', nameRu: 'Спортзал', labelEn: 'Gym / Pilates', labelRu: 'Спортзал', icon: 'Dumbbell' },
  { category: 'studio', nameEn: 'Studio', nameRu: 'Студия', labelEn: 'Coworking / Studio', labelRu: 'Студия', icon: 'Sparkles' },
  { category: 'custom', nameEn: 'Spot', nameRu: 'Место', labelEn: 'Custom Pin', labelRu: 'Другое', icon: 'MapPin' },
];

const BARCELONA_FALLBACK_CENTER: google.maps.LatLngLiteral = { lat: 41.3948, lng: 2.162 };

function resolveEnvMapsApiKey(): string {
  const raw: unknown = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return typeof raw === 'string' ? raw.trim() : '';
}

function resolveAnchorIconName(category: AnchorCategory): string {
  return ANCHOR_CATEGORY_PRESETS.find(c => c.category === category)?.icon || 'MapPin';
}

const MapCameraFollower: React.FC<{
  targetCenter: google.maps.LatLngLiteral;
  panTrigger: number;
}> = ({ targetCenter, panTrigger }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || panTrigger === 0) return;
    map.panTo(targetCenter);
  }, [map, targetCenter, panTrigger]);

  return null;
};

const ApiLoadingNotice: React.FC<{ isRu: boolean }> = ({ isRu }) => {
  const status = useApiLoadingStatus();

  if (status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED) {
    return (
      <div className="px-3 py-2 rounded-xl border border-amber-500/40 bg-amber-950/70 text-amber-100 text-xs font-mono">
        {isRu
          ? 'Google Maps JS API недоступен (ошибка авторизации или сети). Показан расчёт пешей доступности.'
          : 'Google Maps JS API failed to initialize. Showing Haversine walk proximity list.'}
      </div>
    );
  }

  return null;
};

export const ClientLocationMap: React.FC<ClientLocationMapProps> = ({
  artists,
  anchorPoints,
  onUpdateAnchorPoint,
  onAddAnchorPoint,
  onRemoveAnchorPoint,
  onSelectArtistToBook,
  onOpenChatWithArtist,
  userRole,
  onUpdateMasterSalon,
  theme,
  language = 'ru',
}) => {
  const isRu = language === 'ru';
  const isDark = theme === 'dark';
  const mapsApiKey = resolveEnvMapsApiKey();
  const hasLiveMapsKey = mapsApiKey.length > 0;

  const [selectedAnchorId, setSelectedAnchorId] = useState<string>(anchorPoints[0]?.id || 'home');
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [rankingMode, setRankingMode] = useState<'active' | 'best_any'>('active');
  const [mapClickMode, setMapClickMode] = useState<'update_active' | 'add_new'>('update_active');

  // Anchor add/edit drawers
  const [isAddingAnchor, setIsAddingAnchor] = useState(false);
  const [newCategory, setNewCategory] = useState<AnchorCategory>('cafe');
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCoords, setNewCoords] = useState<google.maps.LatLngLiteral | null>(null);
  const [newPlaceId, setNewPlaceId] = useState<string | undefined>(undefined);
  const [anchorActionFeedback, setAnchorActionFeedback] = useState<string | null>(null);

  const [isEditingAnchor, setIsEditingAnchor] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCategory, setEditCategory] = useState<AnchorCategory>('custom');
  const [editCoords, setEditCoords] = useState<google.maps.LatLngLiteral | null>(null);
  const [editPlaceId, setEditPlaceId] = useState<string | undefined>(undefined);

  // Master salon editor state
  const [isEditingSalon, setIsEditingSalon] = useState(false);
  const [salonMasterId, setSalonMasterId] = useState<string>(artists[0]?.id || 'artist-1');
  const [salonNameInput, setSalonNameInput] = useState<string>(
    artists[0]?.salonName || 'Atelier Vasiliev Couture'
  );
  const [salonAddressInput, setSalonAddressInput] = useState<string>(
    artists[0]?.salonAddress || 'Carrer de Provença 261, Eixample'
  );
  const [salonCoords, setSalonCoords] = useState<google.maps.LatLngLiteral | null>(null);

  // Live Google Routes metrics cache keyed by `${anchorId}:${artistId}`
  const [routeMetricsCache, setRouteMetricsCache] = useState<
    Record<string, Record<string, RouteMetricsOverride>>
  >({});
  const [routeStatus, setRouteStatus] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });
  const [fitViewportToken, setFitViewportToken] = useState(0);
  const [panTrigger, setPanTrigger] = useState(0);
  const [isLocating, setIsLocating] = useState(false);

  const fallbackAnchor: ClientAnchorPoint = useMemo(
    () =>
      anchorPoints[0] ?? {
        id: 'home',
        name: isRu ? 'Дом' : 'Home',
        label: isRu ? 'Дом' : 'Home',
        icon: 'Home',
        category: 'home',
        address: 'Rambla de Catalunya 85, Eixample',
        coordinates: BARCELONA_FALLBACK_CENTER,
      },
    [anchorPoints, isRu]
  );

  const currentAnchor = useMemo(
    () => anchorPoints.find(p => p.id === selectedAnchorId) || fallbackAnchor,
    [anchorPoints, selectedAnchorId, fallbackAnchor]
  );

  // Ensure selectedAnchorId stays valid if anchors are removed
  useEffect(() => {
    if (anchorPoints.length > 0 && !anchorPoints.some(p => p.id === selectedAnchorId)) {
      setSelectedAnchorId(anchorPoints[0].id);
    }
  }, [anchorPoints, selectedAnchorId]);

  const activeAnchorMetrics = routeMetricsCache[currentAnchor.id];

  const rankedArtists = useMemo(
    () =>
      rankArtistsByAnchors({
        artists,
        anchorPoints,
        activeAnchor: currentAnchor,
        rankingMode,
        routeMetricsByArtistId: activeAnchorMetrics,
      }),
    [artists, anchorPoints, currentAnchor, rankingMode, activeAnchorMetrics]
  );

  const activeArtistEntry = useMemo(
    () =>
      rankedArtists.find(item => item.artist.id === selectedArtistId) || rankedArtists[0] || null,
    [rankedArtists, selectedArtistId]
  );

  const idealWalkMatches = useMemo(
    () => rankedArtists.filter(item => item.isIdealWalk),
    [rankedArtists]
  );

  // Count how many masters are <= 5 min walk from each anchor pill
  const idealWalkCountByAnchorId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const anchor of anchorPoints) {
      const rankedForAnchor = rankArtistsByAnchors({
        artists,
        anchorPoints: [anchor],
        activeAnchor: anchor,
        rankingMode: 'active',
        routeMetricsByArtistId: routeMetricsCache[anchor.id],
      });
      counts[anchor.id] = rankedForAnchor.filter(r => r.isIdealWalk).length;
    }
    return counts;
  }, [anchorPoints, artists, routeMetricsCache]);

  const handleSelectAnchor = useCallback((anchorId: string) => {
    setSelectedAnchorId(anchorId);
    setRankingMode('active');
    setPanTrigger(prev => prev + 1);
  }, []);

  const handleRouteComputed = useCallback(
    (artistId: string, metrics: RouteMetricsOverride) => {
      const anchorKey = currentAnchor.id;
      setRouteMetricsCache(prev => ({
        ...prev,
        [anchorKey]: {
          ...(prev[anchorKey] || {}),
          [artistId]: metrics,
        },
      }));
    },
    [currentAnchor.id]
  );

  const handleSelectArtist = useCallback((artistId: string, focusRoute = false) => {
    setSelectedArtistId(artistId);
    if (focusRoute) {
      setFitViewportToken(prev => prev + 1);
    }
  }, []);

  const createAnchorAtCoords = useCallback(
    async (params: {
      category: AnchorCategory;
      name: string;
      address: string;
      lat: number;
      lng: number;
      placeId?: string;
    }) => {
      if (anchorPoints.length >= MAX_CLIENT_ANCHORS) {
        setAnchorActionFeedback(formatAppMessage('app.anchor_limit_reached', {}, language));
        return;
      }

      const preset =
        ANCHOR_CATEGORY_PRESETS.find(c => c.category === params.category) ??
        ANCHOR_CATEGORY_PRESETS[6];
      const finalName =
        params.name.trim() || (isRu ? preset.nameRu : preset.nameEn);
      const payload: Omit<ClientAnchorPoint, 'id' | 'origin'> = {
        name: finalName,
        label: isRu ? preset.labelRu : preset.labelEn,
        icon: resolveAnchorIconName(params.category),
        category: params.category,
        address: params.address.trim() || `${params.lat.toFixed(4)}, ${params.lng.toFixed(4)}`,
        coordinates: {
          lat: Number(params.lat.toFixed(6)),
          lng: Number(params.lng.toFixed(6)),
        },
        ...(params.placeId ? { placeId: params.placeId } : {}),
      };

      if (onAddAnchorPoint) {
        const added = await onAddAnchorPoint(payload);
        if (added && 'id' in added) {
          setSelectedAnchorId(added.id);
        }
      } else {
        onUpdateAnchorPoint({ ...payload, id: createId('anchor') });
      }

      setPanTrigger(prev => prev + 1);
      setMapClickMode('update_active');
      setIsAddingAnchor(false);
      setNewName('');
      setNewAddress('');
      setNewCoords(null);
      setNewPlaceId(undefined);
      setAnchorActionFeedback(null);
    },
    [anchorPoints.length, isRu, language, onAddAnchorPoint, onUpdateAnchorPoint]
  );

  const handleMapClick = useCallback(
    (ev: MapMouseEvent) => {
      const latLng = ev.detail?.latLng;
      if (!latLng) return;

      if (mapClickMode === 'add_new' && anchorPoints.length < MAX_CLIENT_ANCHORS) {
        void createAnchorAtCoords({
          category: newCategory,
          name: newName,
          address:
            newAddress.trim() ||
            `${isRu ? 'Точка на карте' : 'Map Pin'} (${latLng.lat.toFixed(4)}, ${latLng.lng.toFixed(4)})`,
          lat: latLng.lat,
          lng: latLng.lng,
        });
        return;
      }

      const updated: ClientAnchorPoint = {
        ...currentAnchor,
        address: `${isRu ? 'Точка на карте' : 'Selected Pin'} (${latLng.lat.toFixed(
          4
        )}, ${latLng.lng.toFixed(4)})`,
        coordinates: {
          lat: Number(latLng.lat.toFixed(6)),
          lng: Number(latLng.lng.toFixed(6)),
        },
      };
      onUpdateAnchorPoint(updated);
      setFitViewportToken(prev => prev + 1);
    },
    [
      anchorPoints.length,
      createAnchorAtCoords,
      currentAnchor,
      isRu,
      mapClickMode,
      newAddress,
      newCategory,
      newName,
      onUpdateAnchorPoint,
    ]
  );

  const handleUseCurrentGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setAnchorActionFeedback(
        isRu ? 'Геолокация не поддерживается в этом браузере.' : 'Geolocation is not supported.'
      );
      return;
    }
    setIsLocating(true);
    setAnchorActionFeedback(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setIsLocating(false);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));

        if (isAddingAnchor && anchorPoints.length < MAX_CLIENT_ANCHORS) {
          void createAnchorAtCoords({
            category: newCategory,
            name: newName || (isRu ? 'Сейчас здесь' : 'Current Spot'),
            address: `GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
            lat,
            lng,
          });
        } else {
          onUpdateAnchorPoint({
            ...currentAnchor,
            address: `GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
            coordinates: { lat, lng },
          });
          setPanTrigger(prev => prev + 1);
        }
      },
      err => {
        setIsLocating(false);
        setAnchorActionFeedback(err.message || (isRu ? 'Не удалось получить GPS-координаты.' : 'Unable to obtain GPS location.'));
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSaveNewAnchorForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCoords && !newAddress.trim()) {
      setAnchorActionFeedback(
        isRu
          ? 'Выберите адрес из подсказок Google Places или нажмите «Клик по карте».'
          : 'Pick an address from Google Places autocomplete or click directly on the map.'
      );
      return;
    }
    const targetCoords = newCoords ?? currentAnchor.coordinates;
    void createAnchorAtCoords({
      category: newCategory,
      name: newName,
      address: newAddress,
      lat: targetCoords.lat,
      lng: targetCoords.lng,
      placeId: newPlaceId,
    });
  };

  const handleSaveAnchorEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAddress.trim()) return;
    const preset =
      ANCHOR_CATEGORY_PRESETS.find(c => c.category === editCategory) ??
      ANCHOR_CATEGORY_PRESETS[6];

    const updated: ClientAnchorPoint = {
      ...currentAnchor,
      name: editName.trim() || currentAnchor.name,
      category: editCategory,
      icon: resolveAnchorIconName(editCategory),
      label: isRu ? preset.labelRu : preset.labelEn,
      address: editAddress.trim(),
      coordinates: editCoords ?? currentAnchor.coordinates,
      ...(editPlaceId ? { placeId: editPlaceId } : {}),
    };
    onUpdateAnchorPoint(updated);
    setIsEditingAnchor(false);
    setPanTrigger(prev => prev + 1);
  };

  const handleRemoveAnchor = (anchorId: string) => {
    if (anchorPoints.length <= 1) {
      setAnchorActionFeedback(formatAppMessage('app.anchor_min_required', {}, language));
      return;
    }
    if (onRemoveAnchorPoint) {
      void onRemoveAnchorPoint(anchorId);
    }
    setAnchorActionFeedback(null);
  };

  const handleSaveMasterSalon = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateMasterSalon) {
      const art = artists.find(a => a.id === salonMasterId);
      const lat = salonCoords?.lat ?? art?.coordinates?.lat ?? 41.395;
      const lng = salonCoords?.lng ?? art?.coordinates?.lng ?? 2.162;
      onUpdateMasterSalon(salonMasterId, salonNameInput, salonAddressInput, lat, lng);
    }
    setIsEditingSalon(false);
  };

  const handlePlacePickForNew = (place: SelectedPlaceResult) => {
    setNewAddress(place.address);
    if (!newName.trim()) {
      setNewName(place.name);
    }
    setNewCoords({ lat: place.lat, lng: place.lng });
    setNewPlaceId(place.placeId);
    setAnchorActionFeedback(null);
  };

  const handlePlacePickForEdit = (place: SelectedPlaceResult) => {
    setEditAddress(place.address);
    setEditCoords({ lat: place.lat, lng: place.lng });
    setEditPlaceId(place.placeId);
  };

  const renderMapAndControls = () => {
    const mapCenter = currentAnchor.coordinates;
    const activeDest = activeArtistEntry?.artist.coordinates;
    const isAddLimitReached = anchorPoints.length >= MAX_CLIENT_ANCHORS;

    return (
      <>
        {/* Quick Walkability Spotlight Banner (3-5 min walk goal) */}
        {idealWalkMatches.length > 0 ? (
          <div
            className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isDark
                ? 'bg-emerald-950/35 border-emerald-400/40 text-emerald-100'
                : 'bg-emerald-50 border-emerald-300 text-emerald-950'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-400/20 text-emerald-400 shrink-0">
                <Footprints className="w-5 h-5" />
              </div>
              <div className="space-y-0.5 text-xs">
                <div className="font-display font-bold text-sm flex items-center gap-2">
                  <span>
                    {isRu
                      ? `Прогулка ${idealWalkMatches[0].walkMinutes} мин пешком без транспорта`
                      : `${idealWalkMatches[0].walkMinutes}-Min Scenic Walk Nearby`}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-slate-950 font-mono text-[10px] font-bold">
                    3–5 {isRu ? 'МИН' : 'MIN'}
                  </span>
                </div>
                <p className="opacity-85">
                  {isRu
                    ? `Рекомендуем: ${idealWalkMatches[0].artist.salonName || idealWalkMatches[0].artist.name} (${idealWalkMatches[0].distanceKm} км от точки «${idealWalkMatches[0].matchedAnchor.name}»).`
                    : `Recommended: ${idealWalkMatches[0].artist.salonName || idealWalkMatches[0].artist.name} (${idealWalkMatches[0].distanceKm} km from "${idealWalkMatches[0].matchedAnchor.name}").`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSelectArtist(idealWalkMatches[0].artist.id, true)}
              className="px-3.5 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-xs flex items-center gap-1.5 self-start sm:self-center cursor-pointer shrink-0 transition-colors"
            >
              <Route className="w-3.5 h-3.5" />
              <span>{isRu ? 'Показать маршрут' : 'Show Walk Route'}</span>
            </button>
          </div>
        ) : (
          <div
            className={`rounded-2xl border p-3.5 text-xs flex items-center justify-between gap-3 ${
              isDark
                ? 'bg-slate-900/60 border-cyan-500/25 text-cyan-100'
                : 'bg-sky-50 border-sky-200 text-sky-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>
                {isRu
                  ? `Ближайший мастер от «${currentAnchor.name}» — ${rankedArtists[0]?.walkMinutes ?? '—'} мин пешком. Попробуйте переключить режим «Ко всем местам» или добавьте адрес кафе/клуба рядом.`
                  : `Closest salon from "${currentAnchor.name}" is ~${rankedArtists[0]?.walkMinutes ?? '—'} min walk. Switch to "All Saved Places" or add another spot.`}
              </span>
            </div>
          </div>
        )}

        {/* Anchor Points Ribbon (Up to 10 Places: Home, Work, Clubs, Cafes...) */}
        <div className="gaudi-mosaic-card p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-[11px] font-mono text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <Crosshair className="w-3.5 h-3.5" />
                <span>
                  {isRu ? 'Мои локации (дом, работа, клубы, кафе):' : 'My Frequent Places:'}
                </span>
                <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 font-bold">
                  {anchorPoints.length} / {MAX_CLIENT_ANCHORS}
                </span>
              </div>
              <p className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>
                {isRu
                  ? `Активная точка: ${currentAnchor.address}`
                  : `Active reference: ${currentAnchor.address}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleUseCurrentGps}
                disabled={isLocating}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 border cursor-pointer ${
                  isDark
                    ? 'bg-white/5 hover:bg-white/10 text-cyan-200 border-cyan-400/30'
                    : 'bg-sky-50 hover:bg-sky-100 text-sky-900 border-sky-300'
                }`}
              >
                <LocateFixed className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                <span>{isRu ? 'Моё GPS' : 'Use GPS'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditName(currentAnchor.name);
                  setEditAddress(currentAnchor.address);
                  setEditCategory(currentAnchor.category ?? 'custom');
                  setEditCoords(currentAnchor.coordinates);
                  setEditPlaceId(currentAnchor.placeId);
                  setIsAddingAnchor(false);
                  setIsEditingAnchor(v => !v);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 border cursor-pointer ${
                  isDark
                    ? 'bg-white/5 hover:bg-white/10 text-gray-200 border-white/15'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                <span>{isRu ? 'Изменить' : 'Edit'}</span>
              </button>

              <button
                type="button"
                disabled={isAddLimitReached}
                onClick={() => {
                  setIsEditingAnchor(false);
                  setIsAddingAnchor(v => !v);
                  setAnchorActionFeedback(null);
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isAddLimitReached
                    ? 'bg-gray-700/50 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950 hover:brightness-110 shadow-md'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>
                  {isAddLimitReached
                    ? isRu
                      ? `Лимит ${MAX_CLIENT_ANCHORS}/${MAX_CLIENT_ANCHORS}`
                      : `Max ${MAX_CLIENT_ANCHORS}/${MAX_CLIENT_ANCHORS}`
                    : isRu
                    ? 'Добавить адрес'
                    : 'Add Place'}
                </span>
              </button>
            </div>
          </div>

          {/* Saved Anchors Strip */}
          <div className="flex flex-wrap items-center gap-2">
            {anchorPoints.map(point => {
              const isActive = point.id === currentAnchor.id;
              const IconComp = getAnchorCategoryIcon(point.category, point.icon);
              const idealCount = idealWalkCountByAnchorId[point.id] ?? 0;

              return (
                <div
                  key={point.id}
                  className={`inline-flex items-center rounded-xl border transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-500 via-blue-600 to-emerald-500 text-white border-cyan-300 shadow-lg shadow-cyan-500/20'
                      : isDark
                      ? 'bg-white/5 hover:bg-white/10 text-gray-200 border-white/15'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectAnchor(point.id)}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold cursor-pointer"
                  >
                    <IconComp className="w-3.5 h-3.5 shrink-0" />
                    <span className="max-w-[140px] truncate">{point.name}</span>
                    {idealCount > 0 && (
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                          isActive
                            ? 'bg-white/25 text-white'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                        title={
                          isRu
                            ? `Мастеров в ${WALK_IDEAL_MINUTES} мин пешком`
                            : `Masters within ${WALK_IDEAL_MINUTES} min walk`
                        }
                      >
                        {idealCount} · ≤5м
                      </span>
                    )}
                  </button>

                  {anchorPoints.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAnchor(point.id)}
                      aria-label={isRu ? `Удалить ${point.name}` : `Remove ${point.name}`}
                      className={`pr-2.5 pl-1 py-2 text-xs cursor-pointer transition-colors ${
                        isActive ? 'text-white/80 hover:text-white' : 'text-gray-400 hover:text-rose-400'
                      }`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {anchorActionFeedback && (
            <p className="text-xs font-mono text-amber-300 bg-amber-950/50 border border-amber-500/30 rounded-lg px-3 py-2">
              {anchorActionFeedback}
            </p>
          )}
        </div>

        {/* Add New Place Form (up to 10 spots) */}
        {isAddingAnchor && (
          <form
            onSubmit={handleSaveNewAnchorForm}
            className="gaudi-mosaic-card p-5 border-2 border-emerald-400/50 space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h4 className="font-display text-sm font-bold flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>
                  {isRu
                    ? `Новый адрес (${anchorPoints.length + 1} из ${MAX_CLIENT_ANCHORS})`
                    : `Add Frequent Place (${anchorPoints.length + 1} of ${MAX_CLIENT_ANCHORS})`}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => {
                  setIsAddingAnchor(false);
                  setMapClickMode('update_active');
                }}
                className="text-xs text-gray-400 hover:text-white cursor-pointer flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>{isRu ? 'Закрыть' : 'Cancel'}</span>
              </button>
            </div>

            {/* Category Quick Chips */}
            <div className="flex flex-wrap gap-1.5">
              {ANCHOR_CATEGORY_PRESETS.map(preset => {
                const IconComp = getAnchorCategoryIcon(preset.category, preset.icon);
                const active = newCategory === preset.category;
                return (
                  <button
                    key={preset.category}
                    type="button"
                    onClick={() => setNewCategory(preset.category)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 border cursor-pointer ${
                      active
                        ? 'bg-emerald-400 text-slate-950 border-emerald-300 font-bold'
                        : isDark
                        ? 'bg-white/5 text-gray-300 border-white/15 hover:bg-white/10'
                        : 'bg-slate-100 text-slate-800 border-slate-300'
                    }`}
                  >
                    <IconComp className="w-3 h-3" />
                    <span>{isRu ? preset.nameRu : preset.nameEn}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
              <div className="md:col-span-4">
                <label htmlFor="new-anchor-name" className="block opacity-80 mb-1">
                  {isRu ? 'Название места' : 'Place Name'}
                </label>
                <input
                  id="new-anchor-name"
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={
                    isRu ? 'Напр.: Любимое кафе, Клуб Razzmatazz' : 'e.g. Morning Cafe, Favorite Club'
                  }
                  className={`w-full px-3 py-2 rounded-lg border ${
                    isDark
                      ? 'bg-black/50 border-white/20 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="md:col-span-8">
                <label htmlFor="new-anchor-search" className="block opacity-80 mb-1">
                  {isRu
                    ? 'Поиск адреса через Google Places'
                    : 'Search Address (Google Places Autocomplete)'}
                </label>
                {hasLiveMapsKey ? (
                  <PlaceAddressSearch
                    inputId="new-anchor-search"
                    value={newAddress}
                    onValueChange={val => {
                      setNewAddress(val);
                      setNewCoords(null);
                      setNewPlaceId(undefined);
                    }}
                    onPlaceSelected={handlePlacePickForNew}
                    locationBiasCenter={currentAnchor.coordinates}
                    placeholder={
                      isRu
                        ? 'Введите улицу, кафе, клуб или район Барселоны…'
                        : 'Search street, cafe, club, or neighborhood…'
                    }
                    isDark={isDark}
                    isRu={isRu}
                  />
                ) : (
                  <input
                    id="new-anchor-search"
                    type="text"
                    value={newAddress}
                    onChange={e => setNewAddress(e.target.value)}
                    placeholder="Passeig de Gràcia 45, Barcelona"
                    className={`w-full px-3 py-2 rounded-lg border ${
                      isDark
                        ? 'bg-black/50 border-white/20 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  setMapClickMode(prev => (prev === 'add_new' ? 'update_active' : 'add_new'))
                }
                className={`px-3 py-1.5 rounded-lg text-xs border cursor-pointer flex items-center gap-1.5 ${
                  mapClickMode === 'add_new'
                    ? 'bg-cyan-500 text-slate-950 border-cyan-300 font-bold'
                    : isDark
                    ? 'bg-white/5 text-cyan-200 border-cyan-400/30 hover:bg-white/10'
                    : 'bg-sky-50 text-sky-900 border-sky-300'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>
                  {mapClickMode === 'add_new'
                    ? isRu
                      ? 'Режим активен: кликните по карте для добавления'
                      : 'Click on the Google Map to drop new pin'
                    : isRu
                    ? 'Указать кликом на карте'
                    : 'Drop pin on map instead'}
                </span>
              </button>

              <button
                type="submit"
                className="btn-vangogh-gold text-xs py-2 px-4 flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isRu ? 'Сохранить адрес' : 'Save Place'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Edit Current Anchor Modal Form */}
        {isEditingAnchor && (
          <form
            onSubmit={handleSaveAnchorEdit}
            className="gaudi-mosaic-card p-5 border-2 border-cyan-400/50 space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h4 className="font-display text-sm font-bold flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-300" />
                <span>
                  {isRu
                    ? `Редактировать локацию: ${currentAnchor.name}`
                    : `Configure Spot: ${currentAnchor.name}`}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setIsEditingAnchor(false)}
                className="text-xs text-gray-400 hover:text-white cursor-pointer"
              >
                {isRu ? 'Отмена' : 'Cancel'}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {ANCHOR_CATEGORY_PRESETS.map(preset => {
                const IconComp = getAnchorCategoryIcon(preset.category, preset.icon);
                const active = editCategory === preset.category;
                return (
                  <button
                    key={preset.category}
                    type="button"
                    onClick={() => setEditCategory(preset.category)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 border cursor-pointer ${
                      active
                        ? 'bg-cyan-400 text-slate-950 border-cyan-200 font-bold'
                        : isDark
                        ? 'bg-white/5 text-gray-300 border-white/15'
                        : 'bg-slate-100 text-slate-800 border-slate-300'
                    }`}
                  >
                    <IconComp className="w-3 h-3" />
                    <span>{isRu ? preset.nameRu : preset.nameEn}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label htmlFor="anchor-spot-name" className="block opacity-80 mb-1">
                  {isRu ? 'Название' : 'Spot Name'}
                </label>
                <input
                  id="anchor-spot-name"
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border ${
                    isDark
                      ? 'bg-black/50 border-white/20 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label htmlFor="anchor-street-address" className="block opacity-80 mb-1">
                  {isRu ? 'Адрес (Google Places)' : 'Street Address'}
                </label>
                {hasLiveMapsKey ? (
                  <PlaceAddressSearch
                    inputId="anchor-street-address"
                    value={editAddress}
                    onValueChange={val => setEditAddress(val)}
                    onPlaceSelected={handlePlacePickForEdit}
                    locationBiasCenter={currentAnchor.coordinates}
                    placeholder="Passeig de Gràcia 45, Eixample"
                    isDark={isDark}
                    isRu={isRu}
                  />
                ) : (
                  <input
                    id="anchor-street-address"
                    type="text"
                    value={editAddress}
                    onChange={e => setEditAddress(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      isDark
                        ? 'bg-black/50 border-white/20 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="submit"
                className="btn-vangogh-gold text-xs py-1.5 px-4 flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isRu ? 'Сохранить' : 'Save & Reposition'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Edit Master Salon Address Modal Form */}
        {isEditingSalon && (
          <form
            onSubmit={handleSaveMasterSalon}
            className="gaudi-mosaic-card p-5 border-2 border-amber-400/50 space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h4 className="font-display text-sm font-bold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-300" />
                <span>
                  {isRu
                    ? 'Адрес салона мастера'
                    : 'Master Salon Profile & Address Registry'}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setIsEditingSalon(false)}
                className="text-xs text-gray-400 hover:text-white cursor-pointer"
              >
                {isRu ? 'Отмена' : 'Cancel'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label htmlFor="salon-master-select" className="block opacity-80 mb-1">
                  {isRu ? 'Мастер' : 'Master Account'}
                </label>
                <select
                  id="salon-master-select"
                  value={salonMasterId}
                  onChange={e => {
                    setSalonMasterId(e.target.value);
                    const art = artists.find(a => a.id === e.target.value);
                    if (art) {
                      setSalonNameInput(art.salonName || '');
                      setSalonAddressInput(art.salonAddress || '');
                      setSalonCoords(art.coordinates ?? null);
                    }
                  }}
                  className={`w-full px-3 py-2 rounded-lg border ${
                    isDark
                      ? 'bg-black/50 border-white/20 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  {artists.map(art => (
                    <option key={art.id} value={art.id}>
                      {art.name} (@{art.handle})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="salon-name-input" className="block opacity-80 mb-1">
                  {isRu ? 'Название студии' : 'Salon Name'}
                </label>
                <input
                  id="salon-name-input"
                  type="text"
                  value={salonNameInput}
                  onChange={e => setSalonNameInput(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border ${
                    isDark
                      ? 'bg-black/50 border-white/20 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label htmlFor="salon-address-input" className="block opacity-80 mb-1">
                  {isRu ? 'Адрес студии (Google Places)' : 'Salon Street Address'}
                </label>
                {hasLiveMapsKey ? (
                  <PlaceAddressSearch
                    inputId="salon-address-input"
                    value={salonAddressInput}
                    onValueChange={setSalonAddressInput}
                    onPlaceSelected={place => {
                      setSalonAddressInput(place.address);
                      setSalonCoords({ lat: place.lat, lng: place.lng });
                    }}
                    locationBiasCenter={currentAnchor.coordinates}
                    placeholder="Carrer de Provença 261, Eixample"
                    isDark={isDark}
                    isRu={isRu}
                  />
                ) : (
                  <input
                    id="salon-address-input"
                    type="text"
                    value={salonAddressInput}
                    onChange={e => setSalonAddressInput(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      isDark
                        ? 'bg-black/50 border-white/20 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="submit"
                className="btn-vangogh-gold text-xs py-1.5 px-4 flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isRu ? 'Обновить адрес на карте' : 'Publish Salon Address'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Main Google Map + Walkability Recommendations Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Interactive Google Map (7 Cols) */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span
                className={`font-mono font-semibold flex items-center gap-1.5 ${
                  isDark ? 'text-cyan-400' : 'text-sky-800'
                }`}
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>
                  {mapClickMode === 'add_new'
                    ? isRu
                      ? 'Кликните на карту, чтобы добавить новый адрес'
                      : 'Click anywhere on map to add new anchor'
                    : isRu
                    ? `Google Карта · Клик перемещает точку «${currentAnchor.name}»`
                    : `Google Map · Click to reposition "${currentAnchor.name}"`}
                </span>
              </span>
              {routeStatus.loading && (
                <span className="text-[11px] font-mono text-emerald-400">
                  {isRu ? 'Строим пеший маршрут…' : 'Calculating walking route…'}
                </span>
              )}
              {routeStatus.error && (
                <span className="text-[11px] font-mono text-amber-400">{routeStatus.error}</span>
              )}
            </div>

            {hasLiveMapsKey && <ApiLoadingNotice isRu={isRu} />}

            <div
              className={`relative w-full h-[460px] sm:h-[540px] rounded-2xl overflow-hidden border-2 shadow-2xl ${
                isDark
                  ? 'border-cyan-400/40 shadow-cyan-950/30 bg-[#0b101c]'
                  : 'border-amber-500/40 shadow-amber-900/10 bg-slate-100'
              }`}
            >
              {hasLiveMapsKey ? (
                <GoogleMapView
                  mapId="DEMO_MAP_ID"
                  defaultCenter={mapCenter}
                  defaultZoom={15}
                  gestureHandling="greedy"
                  colorScheme={isDark ? ColorScheme.DARK : ColorScheme.LIGHT}
                  streetViewControl={false}
                  mapTypeControl={false}
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  onClick={handleMapClick}
                  style={{ width: '100%', height: '100%' }}
                >
                  <MapCameraFollower targetCenter={mapCenter} panTrigger={panTrigger} />

                  <AnchorMarkersLayer
                    anchors={anchorPoints}
                    activeAnchorId={currentAnchor.id}
                    isRu={isRu}
                    onSelectAnchor={handleSelectAnchor}
                    onRemoveAnchor={handleRemoveAnchor}
                  />

                  <MasterMarkersLayer
                    rankedArtists={rankedArtists}
                    selectedArtistId={selectedArtistId}
                    isRu={isRu}
                    onSelectArtist={handleSelectArtist}
                    onBookArtist={onSelectArtistToBook}
                    onChatArtist={onOpenChatWithArtist}
                  />

                  {activeArtistEntry && activeDest && (
                    <WalkingRouteOverlay
                      artistId={activeArtistEntry.artist.id}
                      origin={currentAnchor.coordinates}
                      destination={activeDest}
                      fitViewportToken={fitViewportToken}
                      onRouteComputed={handleRouteComputed}
                      onRouteStatusChange={setRouteStatus}
                    />
                  )}
                </GoogleMapView>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <Compass className="w-10 h-10 text-cyan-400" />
                  <h3 className="font-display text-base font-bold">
                    {isRu
                      ? 'Google Карта ожидает ключ VITE_GOOGLE_MAPS_API_KEY'
                      : 'Google Map awaiting VITE_GOOGLE_MAPS_API_KEY'}
                  </h3>
                  <p className="text-xs opacity-75 max-w-md leading-relaxed">
                    {isRu
                      ? 'Все 10 сохранённых адресов и расчёт шаговой доступности 3–5 минут продолжают работать по точным координатам.'
                      : 'Up to 10 saved addresses and 3-5 minute walk proximity ranking remain active using stored coordinates.'}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono opacity-75">
              <span>
                {isRu
                  ? 'Зелёный маркер — 3–5 мин пешком · Кликните по маркеру мастера для деталей и записи.'
                  : 'Emerald pin = 3-5 min walk · Click any salon marker for route & instant booking.'}
              </span>
              <span>
                {activeArtistEntry?.metricSource === 'routes_api'
                  ? isRu
                    ? 'Маршрут: Google Routes API (пешком)'
                    : 'Route: Google Routes API (Walking)'
                  : isRu
                  ? 'Оценка по координатам'
                  : 'Coordinate walk estimate'}
              </span>
            </div>
          </div>

          {/* Proximity Sorted List of Salons (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-mono uppercase text-amber-400 font-bold">
                {rankingMode === 'best_any'
                  ? isRu
                    ? `Рядом с любым из ${anchorPoints.length} мест`
                    : `Near Any of Your ${anchorPoints.length} Places`
                  : isRu
                  ? `Рядом с «${currentAnchor.name}» (${rankedArtists.length})`
                  : `Closest to "${currentAnchor.name}" (${rankedArtists.length})`}
              </span>

              <div className="inline-flex rounded-lg border border-white/15 p-0.5 bg-black/25 text-[11px]">
                <button
                  type="button"
                  onClick={() => setRankingMode('active')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                    rankingMode === 'active'
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  {isRu ? 'От выбранной' : 'Active Spot'}
                </button>
                <button
                  type="button"
                  onClick={() => setRankingMode('best_any')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                    rankingMode === 'best_any'
                      ? 'bg-emerald-400 text-slate-950 font-bold'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  {isRu ? 'Ко всем 10 местам' : 'All My Places'}
                </button>
              </div>
            </div>

            <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
              {rankedArtists.map((item, index) => {
                const { artist, distanceKm, walkMinutes, isIdealWalk, matchedAnchor, bestSavedAnchor, metricSource } =
                  item;
                const isSelected = artist.id === (activeArtistEntry?.artist.id ?? rankedArtists[0]?.artist.id);
                const isClosest = index === 0;

                return (
                  <div
                    key={artist.id}
                    className={`gaudi-mosaic-card p-4 transition-all duration-300 ${
                      isSelected
                        ? isDark
                          ? 'border-2 border-amber-400 shadow-xl shadow-amber-500/10'
                          : 'border-2 border-amber-600 shadow-lg shadow-amber-900/15 bg-amber-50/80'
                        : isIdealWalk
                        ? isDark
                          ? 'border-emerald-400/50'
                          : 'border-emerald-500/60'
                        : isClosest
                        ? isDark
                          ? 'border-cyan-400/50'
                          : 'border-sky-500/60'
                        : isDark
                        ? 'hover:border-white/30'
                        : 'hover:border-amber-400'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectArtist(artist.id, true)}
                      className="w-full text-left flex items-start justify-between gap-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={artist.avatar}
                          alt={artist.name}
                          className="w-12 h-12 rounded-xl object-cover ring-2 ring-cyan-400/40 shadow-md shrink-0"
                          referrerPolicy="no-referrer"
                          onError={e => {
                            e.currentTarget.src =
                              '/assets/images/avatar_master_artist_1790123890131.jpg';
                          }}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h4 className="font-display text-sm font-bold truncate">
                              {artist.name}
                            </h4>
                            {isIdealWalk && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-400 text-slate-950 text-[9px] font-bold font-mono">
                                {isRu ? '3–5 МИН ПЕШКОМ' : '3–5M WALK'}
                              </span>
                            )}
                            {!isIdealWalk && isClosest && (
                              <span className="px-1.5 py-0.5 rounded bg-cyan-500 text-slate-950 text-[9px] font-bold font-mono">
                                {isRu ? 'БЛИЖАЙШИЙ' : 'CLOSEST'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-amber-400 truncate">
                            {artist.salonName || 'Private Nail Atelier'}
                          </p>
                          <p className="text-[11px] opacity-75 flex items-center gap-1 mt-0.5 truncate">
                            <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                            <span className="truncate">
                              {artist.salonAddress || artist.location}
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Proximity & Walk Time */}
                      <div className="text-right shrink-0">
                        <div
                          className={`font-mono text-xs font-bold ${
                            isIdealWalk ? 'text-emerald-400' : 'text-cyan-300'
                          }`}
                        >
                          {walkMinutes} {isRu ? 'мин' : 'min'}
                        </div>
                        <div className="text-[10px] opacity-75 font-mono">{distanceKm} km</div>
                        <div className="text-[9px] opacity-60 font-mono">
                          {metricSource === 'routes_api'
                            ? 'Routes API'
                            : `${isRu ? 'от' : 'from'} ${matchedAnchor.name}`}
                        </div>
                      </div>
                    </button>

                    {/* Cross-anchor tip when a different saved spot is closer */}
                    {rankingMode === 'active' &&
                      bestSavedAnchor.anchor.id !== currentAnchor.id &&
                      bestSavedAnchor.isIdealWalk && (
                        <div className="mt-2 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-[11px] text-emerald-300 flex items-center justify-between gap-2">
                          <span>
                            {isRu
                              ? `Всего ${bestSavedAnchor.walkMinutes} мин пешком от «${bestSavedAnchor.anchor.name}»`
                              : `Only ${bestSavedAnchor.walkMinutes} min walk from "${bestSavedAnchor.anchor.name}"`}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSelectAnchor(bestSavedAnchor.anchor.id)}
                            className="underline font-semibold cursor-pointer"
                          >
                            {isRu ? 'Переключить' : 'Switch'}
                          </button>
                        </div>
                      )}

                    {/* Working Hours, Rating & Quick Actions */}
                    <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="flex items-center gap-1 text-amber-300 font-semibold">
                          <Star className="w-3 h-3 fill-current" />
                          <span>{artist.rating}</span>
                        </span>
                        <span className="flex items-center gap-1 opacity-75 font-mono">
                          <Clock className="w-3 h-3 text-cyan-400" />
                          <span>{artist.workingHours || '10:00 - 20:00'}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSelectArtist(artist.id, true)}
                          className={`p-1.5 rounded-lg transition-colors border cursor-pointer ${
                            isDark
                              ? 'bg-white/10 hover:bg-white/20 text-cyan-300 border-transparent'
                              : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-200'
                          }`}
                          title={isRu ? 'Пеший маршрут' : 'Walking route'}
                        >
                          <Route className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onOpenChatWithArtist(artist)}
                          className={`p-1.5 rounded-lg transition-colors border cursor-pointer ${
                            isDark
                              ? 'bg-white/10 hover:bg-white/20 text-gray-200 border-transparent'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 shadow-sm'
                          }`}
                          title={isRu ? 'Чат с мастером' : 'Chat & Consult'}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectArtistToBook(artist)}
                          className="btn-vangogh-gold text-xs py-1 px-3 flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          <Calendar className="w-3 h-3" />
                          <span>{isRu ? 'Запись' : 'Book'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <section className="py-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-cyan-500/20">
        <div>
          <div className="text-xs font-mono text-cyan-400 flex items-center gap-2 mb-1.5">
            <span className="p-1 rounded-md bg-cyan-400/20 text-cyan-300">
              <Compass className="w-3.5 h-3.5" />
            </span>
            <span>
              {isRu
                ? 'GOOGLE MAPS · ШАГОВАЯ ДОСТУПНОСТЬ И ЛИЧНЫЕ ТОЧКИ'
                : 'GOOGLE MAPS · WALKABLE ATELIERS & PERSONAL SPOTS'}
            </span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            {isRu
              ? 'Мастера в 3–5 минутах пешком от ваших мест'
              : 'Nail Masters Within an Easy 3–5 Min Walk'}
          </h2>
          <p className="text-xs opacity-75 mt-1 max-w-2xl leading-relaxed">
            {isRu
              ? 'Отметьте до 10 привычных адресов — дом, работу, клубы, кафе или спортзал. Настоящая карта Google покажет ближайшие студии и проложит приятный пеший маршрут.'
              : 'Save up to 10 everyday addresses—Home, Work, Clubs, Cafes, or Studio. Google Maps finds the closest nail salons and builds your walking route.'}
          </p>
        </div>

        {userRole === 'master' && (
          <button
            type="button"
            onClick={() => setIsEditingSalon(v => !v)}
            className="btn-vangogh-gold text-xs py-2 px-4 flex items-center gap-2 self-start md:self-end cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>{isRu ? 'Адрес моего салона' : 'Update My Salon Address'}</span>
          </button>
        )}
      </div>

      {hasLiveMapsKey ? (
        <APIProvider
          apiKey={mapsApiKey}
          libraries={['places', 'marker', 'routes']}
          language={isRu ? 'ru' : 'en'}
          region="ES"
        >
          {renderMapAndControls()}
        </APIProvider>
      ) : (
        renderMapAndControls()
      )}
    </section>
  );
};
