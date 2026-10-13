// Pure mappers from backend payloads to the shapes screens render. They
// accept both the Laravel paginator shape (result = {data: [...], current_page,
// last_page, ...}) and a plain array, and never invent values: a field the
// backend didn't send stays empty/null.

// Items of a list endpoint's `result`, paginated or not.
export const extractList = result => {
    if (Array.isArray(result)) {
        return result;
    }
    if (Array.isArray(result?.data)) {
        return result.data;
    }
    return [];
};

const toInt = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

// Paging info when the backend sent it; null for an unpaginated list.
export const extractPagination = result => {
    if (!result || Array.isArray(result) || !Array.isArray(result.data)) {
        return null;
    }
    const currentPage = toInt(result.current_page) ?? 1;
    const lastPage = toInt(result.last_page) ?? currentPage;
    return {
        currentPage,
        lastPage,
        perPage: toInt(result.per_page),
        total: toInt(result.total),
        hasMore: currentPage < lastPage,
    };
};

const toNumberOrNull = value => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

// true/1/'1'/'true'/'active'/'enabled' -> true, anything else -> false.
export const toBooleanFlag = value => {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value === 1;
    }
    if (typeof value === 'string') {
        return ['1', 'true', 'active', 'enabled', 'on'].includes(
            value.trim().toLowerCase(),
        );
    }
    return false;
};

// `is_active` wins when present; `status` is the fallback.
const zoneEnabled = item => {
    if (item?.is_active !== undefined && item?.is_active !== null) {
        return toBooleanFlag(item.is_active);
    }
    return toBooleanFlag(item?.status);
};

// `categoryNames` maps category_id -> label; zones only carry the id.
export const normalizeSilentZone = (item, categoryNames = {}) => ({
    id: item?.id ?? item?.zone_id ?? null,
    name: item?.name || 'Unnamed Zone',
    street: item?.address || '',
    latitude: toNumberOrNull(item?.latitude),
    longitude: toNumberOrNull(item?.longitude),
    radius: toNumberOrNull(item?.radius_m ?? item?.radius),
    enabled: zoneEnabled(item),
    // Whether entering the zone silences the phone (backend `silent_mode`,
    // default on when absent).
    silentMode:
        item?.silent_mode === undefined || item?.silent_mode === null
            ? true
            : toBooleanFlag(item.silent_mode),
    categoryId: item?.category_id ?? null,
    // Per-zone automatic reply (backend auto_response_template_id /
    // auto_response_enabled). Mapping only; no UI uses these directly.
    autoResponseTemplateId: item?.auto_response_template_id ?? null,
    autoResponseEnabled: toBooleanFlag(item?.auto_response_enabled),
    category:
        item?.category?.name ||
        item?.category_name ||
        categoryNames[item?.category_id] ||
        '',
});

// Zones without an id can't be toggled or deleted, so they are dropped.
export const normalizeSilentZones = (result, categoryNames = {}) =>
    extractList(result)
        .map(item => normalizeSilentZone(item, categoryNames))
        .filter(zone => zone.id !== null);

// Normalised zones -> what the native geofencing engine stores. A zone
// only automates when it is enabled AND set to silence.
export const toEngineZones = zones =>
    (Array.isArray(zones) ? zones : [])
        .filter(
            z =>
                z &&
                z.id !== null &&
                z.id !== undefined &&
                Number.isFinite(z.latitude) &&
                Number.isFinite(z.longitude) &&
                Number.isFinite(z.radius) &&
                z.radius > 0,
        )
        .map(z => ({
            id: String(z.id),
            name: z.name || null,
            latitude: z.latitude,
            longitude: z.longitude,
            radius: z.radius,
            enabled: !!z.enabled && z.silentMode !== false,
        }));

// Geofence categories -> {id: label} for normalizeSilentZone.
export const buildCategoryNames = categories =>
    extractList(categories).reduce((acc, cat) => {
        if (cat?.id !== undefined && cat?.id !== null) {
            acc[cat.id] = cat.display_name || cat.name || '';
        }
        return acc;
    }, {});

// Body for POST silent-zones/{id}/status. The backend reads `enabled`
// (and treats a missing field as "enable"), so it must always be sent.
export const buildZoneStatusPayload = enabled => ({enabled: enabled ? 1 : 0});

// Result of the status endpoint: {zone_id, enabled, status}. Returns the
// server's view of `enabled`, or null if it didn't say.
export const readZoneStatusResult = result => {
    if (!result || typeof result !== 'object') {
        return null;
    }
    if (result.enabled !== undefined && result.enabled !== null) {
        return toBooleanFlag(result.enabled);
    }
    if (result.status !== undefined && result.status !== null) {
        return toBooleanFlag(result.status);
    }
    return null;
};

// Body for create: the backend field is `radius_m`.
export const buildSilentZonePayload = ({
    name,
    address,
    latitude,
    longitude,
    radius,
    categoryId,
}) => {
    const payload = {
        name,
        address,
        latitude,
        longitude,
        radius_m: Number(radius) || 150,
    };
    if (categoryId !== null && categoryId !== undefined) {
        payload.category_id = categoryId;
    }
    return payload;
};

const firstString = (...values) => {
    const found = values.find(v => typeof v === 'string' && v.trim() !== '');
    return found ?? '';
};

// Normalises one `logs` row. Current backend rows use sender_name / content
// (nullable) / type (e.g. incoming_sms) / timestamp; older rows used
// senderName. Returns null when there's nothing to show.
export const normalizeActivityLog = item => {
    if (!item || typeof item !== 'object') {
        return null;
    }
    const id = item.id ?? item.log_id ?? null;
    const name = firstString(
        item.senderName,
        item.sender_name,
        item.sender,
        item.title,
    );
    const content = firstString(item.content, item.message, item.text, item.body);
    const rawType = firstString(item.type, item.log_type).toLowerCase();
    const timestamp =
        item.timestamp ?? item.created_at ?? item.logged_at ?? item.time ?? null;

    if (id === null && !name && !content) {
        return null;
    }

    return {
        id,
        name: name || 'Unknown',
        content,
        type: rawType.includes('call') ? 'call' : 'message',
        rawType,
        timestamp,
        // Set when the row was uploaded by this app (see serverSync.js).
        clientEventId: firstString(item.client_event_id, item.idempotency_key) || null,
    };
};

// Display label for a log's backend type; never claims WhatsApp unless the
// backend said so.
export const activityTypeLabel = rawType => {
    const t = String(rawType || '').toLowerCase();
    const isCall = t.includes('call');
    if (t.includes('whatsapp')) {
        return isCall ? 'WHATSAPP CALL' : 'WHATSAPP MESSAGE';
    }
    if (t.includes('sms')) {
        return 'SMS';
    }
    return isCall ? 'CALL' : 'MESSAGE';
};

export const normalizeActivityLogs = result =>
    extractList(result).map(normalizeActivityLog).filter(Boolean);
