import React, { useState } from 'react';
import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  InfoWindow,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import { Calendar, Footprints, MessageSquare, Navigation, Star } from 'lucide-react';
import { RankedArtistProximity } from '../../services/geoDistance';
import { Artist } from '../../types';

interface SingleMasterMarkerProps {
  item: RankedArtistProximity;
  isSelected: boolean;
  isClosest: boolean;
  zIndex: number;
  isRu: boolean;
  onSelectArtist: (artistId: string, focusRoute?: boolean) => void;
  onBookArtist: (artist: Artist) => void;
  onChatArtist: (artist: Artist) => void;
}

const SingleMasterMarker: React.FC<SingleMasterMarkerProps> = ({
  item,
  isSelected,
  isClosest,
  zIndex,
  isRu,
  onSelectArtist,
  onBookArtist,
  onChatArtist,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infoOpen, setInfoOpen] = useState(false);
  const { artist, walkMinutes, distanceKm, isIdealWalk, matchedAnchor, metricSource } = item;
  const coords = artist.coordinates ?? { lat: 41.395, lng: 2.162 };

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={coords}
        zIndex={zIndex}
        anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM_CENTER}
        title={`${artist.salonName || artist.name} (${walkMinutes} min walk)`}
        onClick={() => {
          onSelectArtist(artist.id, true);
          setInfoOpen(true);
        }}
      >
        <div className="flex flex-col items-center cursor-pointer transition-transform hover:scale-110">
          <div
            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold shadow-lg mb-1 whitespace-nowrap border flex items-center gap-1 ${
              isSelected
                ? 'bg-amber-400 text-slate-950 border-amber-200'
                : isIdealWalk
                ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                : isClosest
                ? 'bg-cyan-400 text-slate-950 border-cyan-200'
                : 'bg-[#090d18]/90 text-white border-white/25'
            }`}
          >
            <Footprints className="w-2.5 h-2.5" />
            <span>
              {walkMinutes} {isRu ? 'мин' : 'm'} · {distanceKm} km
            </span>
          </div>

          <div className="relative">
            <img
              src={artist.avatar}
              alt={artist.name}
              className={`w-10 h-10 rounded-full object-cover shadow-2xl transition-all ${
                isSelected
                  ? 'ring-4 ring-amber-400'
                  : isIdealWalk
                  ? 'ring-3 ring-emerald-400'
                  : isClosest
                  ? 'ring-3 ring-cyan-400'
                  : 'ring-2 ring-white/70'
              }`}
              referrerPolicy="no-referrer"
              onError={e => {
                e.currentTarget.src = '/assets/images/avatar_master_artist_1790123890131.jpg';
              }}
            />
            <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-amber-400 text-slate-950">
              <Star className="w-2.5 h-2.5 fill-current" />
            </div>
          </div>

          <span className="text-[10px] font-semibold text-white bg-black/80 px-1.5 py-0.5 rounded mt-0.5 truncate max-w-[110px]">
            {artist.salonName?.split(' ')[0] || artist.name.split(' ')[0]}
          </span>
        </div>
      </AdvancedMarker>

      {infoOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => setInfoOpen(false)}>
          <div className="p-1.5 min-w-[215px] max-w-[260px] text-slate-900 space-y-2">
            <div className="flex items-center gap-2.5">
              <img
                src={artist.avatar}
                alt={artist.name}
                className="w-10 h-10 rounded-lg object-cover shrink-0"
                onError={e => {
                  e.currentTarget.src = '/assets/images/avatar_master_artist_1790123890131.jpg';
                }}
              />
              <div className="min-w-0">
                <div className="font-bold text-xs truncate">{artist.name}</div>
                <div className="text-[11px] font-medium text-amber-700 truncate">
                  {artist.salonName || 'Private Nail Atelier'}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-500 fill-current" />
                  <span>{artist.rating}</span>
                  <span>·</span>
                  <span>{artist.workingHours || '10:00 - 20:00'}</span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-600 leading-snug">
              {artist.salonAddress || artist.location}
            </div>

            <div
              className={`rounded-md px-2 py-1 text-[11px] font-mono font-semibold flex items-center justify-between ${
                isIdealWalk ? 'bg-emerald-100 text-emerald-900' : 'bg-sky-50 text-sky-900'
              }`}
            >
              <span>
                {walkMinutes} {isRu ? 'мин пешком' : 'min walk'} ({distanceKm} km)
              </span>
              <span className="text-[9px] uppercase">
                {metricSource === 'routes_api' ? 'Routes API' : matchedAnchor.name}
              </span>
            </div>

            <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200">
              <button
                type="button"
                onClick={() => onSelectArtist(artist.id, true)}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold cursor-pointer"
              >
                <Navigation className="w-3 h-3" />
                <span>{isRu ? 'Маршрут' : 'Walk'}</span>
              </button>
              <button
                type="button"
                onClick={() => onChatArtist(artist)}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] cursor-pointer"
                title={isRu ? 'Написать мастеру' : 'Chat'}
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onBookArtist(artist)}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] font-bold cursor-pointer"
              >
                <Calendar className="w-3 h-3" />
                <span>{isRu ? 'Запись' : 'Book'}</span>
              </button>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface MasterMarkersLayerProps {
  rankedArtists: RankedArtistProximity[];
  selectedArtistId: string | null;
  isRu: boolean;
  onSelectArtist: (artistId: string, focusRoute?: boolean) => void;
  onBookArtist: (artist: Artist) => void;
  onChatArtist: (artist: Artist) => void;
}

const Z_INDEX_SELECTED = 1000;
const Z_INDEX_IDEAL_WALK = 800;

export const MasterMarkersLayer: React.FC<MasterMarkersLayerProps> = ({
  rankedArtists,
  selectedArtistId,
  isRu,
  onSelectArtist,
  onBookArtist,
  onChatArtist,
}) => {
  // Sort south-most markers higher base zIndex, with ideal walk and selected on top
  const byLat = [...rankedArtists].sort(
    (a, b) => (b.artist.coordinates?.lat ?? 0) - (a.artist.coordinates?.lat ?? 0)
  );
  const closestId = rankedArtists[0]?.artist.id;

  return (
    <>
      {byLat.map((item, idx) => {
        const isSelected = item.artist.id === (selectedArtistId || closestId);
        const isClosest = item.artist.id === closestId;
        let zIndex = idx + 10;
        if (item.isIdealWalk) zIndex = Z_INDEX_IDEAL_WALK + idx;
        if (isSelected) zIndex = Z_INDEX_SELECTED;

        return (
          <SingleMasterMarker
            key={item.artist.id}
            item={item}
            isSelected={isSelected}
            isClosest={isClosest}
            zIndex={zIndex}
            isRu={isRu}
            onSelectArtist={onSelectArtist}
            onBookArtist={onBookArtist}
            onChatArtist={onChatArtist}
          />
        );
      })}
    </>
  );
};
