// Product feature gates. A gated feature keeps its code and the user's saved
// preference; only its control and effect are hidden.
//
// LOCATION_MODE_PUBLIC_PLACES: automatic silencing at public places
// (libraries / places of worship found through Google Places). Hidden after
// the client's feedback (false activation in an office next to a place of
// worship) until it is redesigned. Must match the native gate
// Features.PUBLIC_PLACES_LOCATION_MODE, which is what actually stops it.
// Custom Silent Zones, Maps and place search are not affected.
export const FEATURES = Object.freeze({
    LOCATION_MODE_PUBLIC_PLACES: false,
});
