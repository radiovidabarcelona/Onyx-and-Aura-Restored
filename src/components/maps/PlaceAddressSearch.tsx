import React, { useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import { SelectedPlaceResult, useAutocompleteSuggestions } from './useAutocompleteSuggestions';

interface PlaceAddressSearchProps {
  inputId: string;
  value: string;
  onValueChange: (next: string) => void;
  onPlaceSelected: (place: SelectedPlaceResult) => void;
  locationBiasCenter?: google.maps.LatLngLiteral;
  placeholder: string;
  isDark: boolean;
  isRu: boolean;
}

/**
 * Address autocomplete field backed by Places API (New) AutocompleteSuggestion.
 * Must render inside an <APIProvider> context.
 */
export const PlaceAddressSearch: React.FC<PlaceAddressSearchProps> = ({
  inputId,
  value,
  onValueChange,
  onPlaceSelected,
  locationBiasCenter,
  placeholder,
  isDark,
  isRu,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { suggestions, isLoading, error, selectSuggestion } = useAutocompleteSuggestions(
    value,
    locationBiasCenter
  );

  const handlePick = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    const details = await selectSuggestion(suggestion);
    setDropdownOpen(false);
    if (details) {
      onValueChange(details.address);
      onPlaceSelected(details);
    }
  };

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-3 pointer-events-none" />
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={e => {
            onValueChange(e.target.value);
            setDropdownOpen(true);
          }}
          onFocus={() => setDropdownOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full pl-9 pr-8 py-2 rounded-lg text-xs border ${
            isDark
              ? 'bg-black/50 border-white/20 text-white placeholder:text-gray-500'
              : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
          }`}
        />
        {isLoading && (
          <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin absolute right-2.5" />
        )}
      </div>

      {error && (
        <p className="text-[11px] text-amber-400 mt-1 font-mono">
          {error}
        </p>
      )}

      {dropdownOpen && suggestions.length > 0 && (
        <ul
          className={`absolute left-0 right-0 mt-1 rounded-xl border shadow-2xl max-h-56 overflow-y-auto z-50 ${
            isDark
              ? 'bg-[#0b101d] border-cyan-500/40 text-white'
              : 'bg-white border-slate-300 text-slate-900'
          }`}
        >
          {suggestions.map((suggestion, idx) => {
            const pred = suggestion.placePrediction;
            if (!pred) return null;
            const mainText = pred.mainText?.text || pred.text?.text || '';
            const secondaryText = pred.secondaryText?.text || '';
            return (
              <li key={pred.placeId || idx} className="border-b last:border-b-0 border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    void handlePick(suggestion);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-start gap-2 cursor-pointer transition-colors ${
                    isDark ? 'hover:bg-cyan-500/15' : 'hover:bg-sky-50'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{mainText}</div>
                    {secondaryText && (
                      <div className={`text-[11px] truncate ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                        {secondaryText}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
          <li className="px-3 py-1 text-[10px] font-mono text-gray-400 text-right">
            {isRu ? 'Google Places' : 'Powered by Google'}
          </li>
        </ul>
      )}
    </div>
  );
};
