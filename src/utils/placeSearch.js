// "Search places" on the Silent Zone form. New Google Cloud projects can't
// enable the legacy Places API, so the autocomplete uses Places API (New)
// (places.googleapis.com). Details ask only for the fields the form needs,
// which keeps each lookup on the cheaper billing tier.

export const PLACES_NEW_REQUEST_URL = Object.freeze({
    useOnPlatform: 'all',
    url: 'https://places.googleapis.com',
    // The autocomplete POSTs a JSON body; React Native's Android networking
    // refuses a body without a content type (the request never leaves).
    headers: Object.freeze({'Content-Type': 'application/json'}),
});

export const PLACE_DETAILS_FIELDS = 'id,displayName,formattedAddress,location';

/**
 * {latitude, longitude, address, name} from a selected suggestion, for both
 * Places API (New) details and legacy ones; null without coordinates.
 */
export const placeFromDetails = (data, details) => {
    const latitude = details?.location?.latitude ?? details?.geometry?.location?.lat;
    const longitude = details?.location?.longitude ?? details?.geometry?.location?.lng;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }
    return {
        latitude,
        longitude,
        address: details?.formattedAddress || details?.formatted_address || data?.description || '',
        name: details?.displayName?.text || details?.name || null,
    };
};
