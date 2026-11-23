import { useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { notifyIfGmpQuotaError } from './gmpErrors';

export interface SelectedPlaceResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
}

export interface UseAutocompleteSuggestionsReturn {
  suggestions: google.maps.places.AutocompleteSuggestion[];
  isLoading: boolean;
  error: string | null;
  selectSuggestion: (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => Promise<SelectedPlaceResult | null>;
  resetSession: () => void;
}

/**
 * Modern Places API (New) Autocomplete using AutocompleteSuggestion + AutocompleteSessionToken
 * + Place.fetchFields (zero legacy AutocompleteService / PlacesService).
 */
export function useAutocompleteSuggestions(
  inputString: string,
  locationBiasCenter?: google.maps.LatLngLiteral
): UseAutocompleteSuggestionsReturn {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetSession = useCallback(() => {
    sessionTokenRef.current = null;
    setSuggestions([]);
  }, []);

  useEffect(() => {
    const trimmed = inputString.trim();
    if (!placesLib || trimmed.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new AutocompleteSessionToken();
      }

      const request: google.maps.places.AutocompleteRequest = {
        input: trimmed,
        sessionToken: sessionTokenRef.current,
        includedRegionCodes: ['es'],
        ...(locationBiasCenter
          ? {
              origin: locationBiasCenter,
              locationBias: {
                center: locationBiasCenter,
                radius: 15000,
              },
            }
          : {}),
      };

      AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
        .then(res => {
          if (cancelled) return;
          setSuggestions(res.suggestions ?? []);
          setIsLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          notifyIfGmpQuotaError(err);
          setIsLoading(false);
          setSuggestions([]);
          setError(err instanceof Error ? err.message : 'Unable to load place suggestions.');
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placesLib, inputString, locationBiasCenter]);

  const selectSuggestion = useCallback(
    async (
      suggestion: google.maps.places.AutocompleteSuggestion
    ): Promise<SelectedPlaceResult | null> => {
      const prediction = suggestion.placePrediction;
      if (!placesLib || !prediction) return null;

      try {
        const place = prediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location', 'id'],
        });
        resetSession();

        const loc = place.location;
        if (!loc) return null;

        return {
          name:
            place.displayName ||
            prediction.mainText?.text ||
            prediction.text?.text ||
            'Saved Place',
          address: place.formattedAddress || prediction.text?.text || 'Barcelona',
          lat: Number(loc.lat().toFixed(6)),
          lng: Number(loc.lng().toFixed(6)),
          placeId: place.id ?? prediction.placeId,
        };
      } catch (err: unknown) {
        notifyIfGmpQuotaError(err);
        setError(err instanceof Error ? err.message : 'Unable to fetch selected place details.');
        return null;
      }
    },
    [placesLib, resetSession]
  );

  return {
    suggestions,
    isLoading,
    error,
    selectSuggestion,
    resetSession,
  };
}
