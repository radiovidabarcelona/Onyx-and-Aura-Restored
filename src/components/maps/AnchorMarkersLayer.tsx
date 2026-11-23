import React, { useState } from 'react';
import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  InfoWindow,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import { Briefcase, Coffee, Dumbbell, Home, MapPin, Music, Sparkles, Trash2 } from 'lucide-react';
import { AnchorCategory, ClientAnchorPoint } from '../../types';

interface AnchorPinProps {
  anchor: ClientAnchorPoint;
  isActive: boolean;
  canDelete: boolean;
  isRu: boolean;
  onSelect: (anchorId: string) => void;
  onRemove: (anchorId: string) => void;
}

export function getAnchorCategoryIcon(category?: AnchorCategory, icon?: string) {
  const key = category || icon?.toLowerCase();
  if (key === 'home') return Home;
  if (key === 'work' || key === 'briefcase') return Briefcase;
  if (key === 'club' || key === 'music') return Music;
  if (key === 'cafe' || key === 'coffee') return Coffee;
  if (key === 'gym' || key === 'dumbbell') return Dumbbell;
  if (key === 'studio' || key === 'sparkles') return Sparkles;
  return MapPin;
}

const SingleAnchorMarker: React.FC<AnchorPinProps> = ({
  anchor,
  isActive,
  canDelete,
  isRu,
  onSelect,
  onRemove,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infoOpen, setInfoOpen] = useState(false);
  const IconComp = getAnchorCategoryIcon(anchor.category, anchor.icon);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={anchor.coordinates}
        zIndex={isActive ? 950 : 500}
        anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM_CENTER}
        title={`${anchor.name} · ${anchor.address}`}
        onClick={() => {
          onSelect(anchor.id);
          setInfoOpen(prev => !prev);
        }}
      >
        <div className="flex flex-col items-center cursor-pointer group">
          <div
            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold shadow-lg mb-1 whitespace-nowrap border transition-transform group-hover:scale-105 ${
              isActive
                ? 'bg-emerald-400 text-slate-950 border-emerald-200'
                : 'bg-[#0b0f1c]/90 text-cyan-200 border-cyan-400/40'
            }`}
          >
            {isActive ? `${anchor.name} · ${isRu ? 'ВЫ ЗДЕСЬ' : 'ACTIVE'}` : anchor.name}
          </div>
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center shadow-xl transition-all ${
              isActive
                ? 'bg-gradient-to-tr from-emerald-400 to-cyan-400 text-slate-950 ring-4 ring-emerald-300/60 scale-110'
                : 'bg-slate-900/95 text-cyan-300 ring-2 ring-cyan-400/50 hover:ring-cyan-300'
            }`}
          >
            <IconComp className="w-4 h-4" />
          </div>
          <div
            className={`w-2 h-2 rotate-45 -mt-1 ${
              isActive ? 'bg-cyan-400' : 'bg-slate-900/95 border-r border-b border-cyan-400/50'
            }`}
          />
        </div>
      </AdvancedMarker>

      {infoOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => setInfoOpen(false)}>
          <div className="p-1.5 min-w-[190px] max-w-[240px] text-slate-900 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-xs flex items-center gap-1">
                <IconComp className="w-3.5 h-3.5 text-emerald-700" />
                {anchor.name}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                {anchor.label}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-snug">{anchor.address}</p>
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200">
              {!isActive ? (
                <button
                  type="button"
                  onClick={() => {
                    onSelect(anchor.id);
                    setInfoOpen(false);
                  }}
                  className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                >
                  {isRu ? 'Искать рядом' : 'Search nearby'}
                </button>
              ) : (
                <span className="text-[10px] font-mono text-emerald-700 font-semibold">
                  {isRu ? 'Активная точка' : 'Active anchor'}
                </span>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setInfoOpen(false);
                    onRemove(anchor.id);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-800 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{isRu ? 'Удалить' : 'Remove'}</span>
                </button>
              )}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface AnchorMarkersLayerProps {
  anchors: ClientAnchorPoint[];
  activeAnchorId: string;
  isRu: boolean;
  onSelectAnchor: (anchorId: string) => void;
  onRemoveAnchor: (anchorId: string) => void;
}

export const AnchorMarkersLayer: React.FC<AnchorMarkersLayerProps> = ({
  anchors,
  activeAnchorId,
  isRu,
  onSelectAnchor,
  onRemoveAnchor,
}) => {
  return (
    <>
      {anchors.map(anchor => (
        <SingleAnchorMarker
          key={anchor.id}
          anchor={anchor}
          isActive={anchor.id === activeAnchorId}
          canDelete={anchors.length > 1}
          isRu={isRu}
          onSelect={onSelectAnchor}
          onRemove={onRemoveAnchor}
        />
      ))}
    </>
  );
};
