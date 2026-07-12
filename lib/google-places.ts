'use client'

/**
 * Google Places (New) address-autocomplete helpers, built on the latest Maps
 * JS API surface: `importLibrary('places')` +
 * `AutocompleteSuggestion.fetchAutocompleteSuggestions()` +
 * `PlacePrediction.toPlace().fetchFields()`.
 *
 * The legacy `google.maps.places.Autocomplete` widget is deprecated and not
 * available to new API keys, so it is intentionally not used here.
 *
 * Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (a browser key with the
 * "Places API (New)" + "Maps JavaScript API" enabled). When the key is not
 * configured every helper no-ops so address forms fall back to manual entry.
 */
import type { Address } from '@/lib/address'

/** Groups a typing session for Google billing. One token per autocomplete
 *  session; cleared automatically after a place is resolved. */
export interface PlacesSession {
  token?: google.maps.places.AutocompleteSessionToken
}

const MAPS_CALLBACK = '__peptsciMapsReady'

let placesLibraryPromise: Promise<google.maps.PlacesLibrary | null> | null = null

export function isPlacesAutocompleteConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
}

function injectMapsScript(apiKey: string): Promise<void> {
  const w = window as unknown as Record<string, unknown> & {
    google?: typeof google
  }
  if (w.google?.maps?.importLibrary) return Promise.resolve()
  return new Promise((resolve, reject) => {
    w[MAPS_CALLBACK] = () => resolve()
    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      loading: 'async',
      callback: MAPS_CALLBACK,
    })
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.async = true
    script.onerror = () => reject(new Error('Google Maps JS API failed to load'))
    document.head.appendChild(script)
  })
}

/** Load (once) the Places library. Resolves null when unconfigured/failed. */
export function loadPlacesLibrary(): Promise<google.maps.PlacesLibrary | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!apiKey || typeof window === 'undefined') return Promise.resolve(null)
  if (!placesLibraryPromise) {
    placesLibraryPromise = injectMapsScript(apiKey)
      .then(() => google.maps.importLibrary('places') as Promise<google.maps.PlacesLibrary>)
      .catch((err) => {
        console.error('[google-places] failed to load Maps JS API', err)
        placesLibraryPromise = null
        return null
      })
  }
  return placesLibraryPromise
}

/** Fetch US address predictions for the given input, reusing/creating the
 *  session token stored on `session`. */
export async function fetchAddressSuggestions(
  input: string,
  session: PlacesSession
): Promise<google.maps.places.AutocompleteSuggestion[]> {
  const places = await loadPlacesLibrary()
  if (!places || !input.trim()) return []
  session.token ??= new places.AutocompleteSessionToken()
  const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    sessionToken: session.token,
    includedRegionCodes: ['us'],
  })
  return suggestions.filter((s) => s.placePrediction)
}

function componentsToAddress(
  components: google.maps.places.AddressComponent[]
): Partial<Address> {
  const get = (type: string) => components.find((c) => c.types.includes(type))
  const streetNumber = get('street_number')?.longText ?? ''
  const route = get('route')?.longText ?? ''
  const subpremise = get('subpremise')?.longText ?? ''
  const city =
    get('locality')?.longText ??
    get('sublocality_level_1')?.longText ??
    get('postal_town')?.longText ??
    ''
  const state = get('administrative_area_level_1')?.shortText ?? ''
  let zip = get('postal_code')?.longText ?? ''
  const zipSuffix = get('postal_code_suffix')?.longText
  if (zip && zipSuffix) zip = `${zip}-${zipSuffix}`
  return {
    address1: [streetNumber, route].filter(Boolean).join(' '),
    address2: subpremise,
    city,
    state,
    zip,
    country: 'US',
  }
}

/** Resolve a selected prediction into our Address shape. Ends the billing
 *  session (fetchFields consumes the token). */
export async function resolveSuggestionToAddress(
  suggestion: google.maps.places.AutocompleteSuggestion,
  session: PlacesSession
): Promise<Partial<Address> | null> {
  const prediction = suggestion.placePrediction
  if (!prediction) return null
  const place = prediction.toPlace()
  await place.fetchFields({ fields: ['addressComponents'] })
  session.token = undefined
  if (!place.addressComponents) return null
  return componentsToAddress(place.addressComponents)
}
