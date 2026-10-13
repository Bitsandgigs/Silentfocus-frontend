// Pure rules for the Silent Zone form.

// #3: Android geofences under ~100 m are unreliable (the engine registers
// at least 100 m - GeofenceRegistrar.MIN_RADIUS_METERS), so 10 m / 50 m are
// not offered. Larger saved radii (e.g. legacy 300 / 500 m zones) are kept
// exactly as saved and shown as an extra choice.
export const RADIUS_PRESETS = [100, 150, 200];
export const MIN_RADIUS = 100;
export const MAX_RADIUS = 5000;
/** Smallest radius Android monitors reliably (mirrors GeofenceRegistrar.MIN_RADIUS_METERS). */
export const MONITORED_MIN_RADIUS = 100;

// Round 3 (#5B): 10 m / 50 m re-checked - still not offered. Android's
// geofencing (what works with the app closed, without a foreground service
// or continuous GPS) is reliable from about 100 m; phone location itself is
// often 10-50 m off indoors. The map only places the centre.
export const RADIUS_PRECISION_NOTE =
    "Phones can't reliably detect areas smaller than 100 m, so 10 m and 50 m aren't offered. " +
    'Inside buildings, 150-200 m often switches on sooner, but it is not guaranteed. ' +
    "The map only sets the zone's centre; your phone's location service does the detection.";

/** Chips to show: the presets plus the zone's own saved radius if it isn't one of them. */
export const radiusChoices = current => {
    const r = Number(current);
    const extra = Number.isFinite(r) && r > 0 && !RADIUS_PRESETS.includes(r) ? [r] : [];
    return [...RADIUS_PRESETS, ...extra].sort((a, b) => a - b);
};

/** What the phone actually monitors for a saved radius. */
export const effectiveRadius = radius => {
    const r = Number(radius);
    return Number.isFinite(r) && r > 0 ? Math.max(r, MONITORED_MIN_RADIUS) : MONITORED_MIN_RADIUS;
};

/** "50 m (monitored as 100 m)" for radii below the minimum; "150 m" otherwise; '' if none. */
export const radiusLabel = radius => {
    const r = Number(radius);
    if (!Number.isFinite(r) || r <= 0) return '';
    return r < MONITORED_MIN_RADIUS ? `${r} m (monitored as ${MONITORED_MIN_RADIUS} m)` : `${r} m`;
};

// Fix accuracy (metres, 68% radius) -> whether to use it for a zone centre.
export const GOOD_ACCURACY = 50;
export const MAX_USABLE_ACCURACY = 200;

export const assessLocationFix = accuracy => {
    const a = Number(accuracy);
    if (!Number.isFinite(a) || a <= 0) {
        return {usable: true, level: 'unknown', message: null};
    }
    const rounded = Math.round(a);
    if (a <= GOOD_ACCURACY) {
        return {usable: true, level: 'good', message: `Accuracy ±${rounded} m`};
    }
    if (a <= MAX_USABLE_ACCURACY) {
        return {
            usable: true,
            level: 'fair',
            message: `Accuracy ±${rounded} m - the zone centre may be a little off. Adjust it on the map if needed.`,
        };
    }
    return {
        usable: false,
        level: 'poor',
        message: `Location is only accurate to ±${rounded} m, too rough for a Silent Zone. Move near a window or outdoors and try again, or search for the place.`,
    };
};

// Returns an error message, or null when the zone can be saved. A zone's
// own saved radius (`originalRadius`, e.g. a legacy 50 m) may be kept as is.
export const validateZoneForm = ({name, latitude, longitude, radius, originalRadius}) => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return 'Choose a location: search, tap the map, or use your current location.';
    }
    if (!name || !String(name).trim()) {
        return 'Please enter a name for this zone.';
    }
    const r = Number(radius);
    const unchanged = Number.isFinite(r) && r > 0 && r === Number(originalRadius);
    if (!unchanged && (!Number.isFinite(r) || r < MIN_RADIUS || r > MAX_RADIUS)) {
        return `Radius must be between ${MIN_RADIUS} and ${MAX_RADIUS} metres.`;
    }
    return null;
};
