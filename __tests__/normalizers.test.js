import {
    activityTypeLabel,
    buildCategoryNames,
    buildSilentZonePayload,
    buildZoneStatusPayload,
    readZoneStatusResult,
    toEngineZones,
    extractList,
    extractPagination,
    normalizeActivityLog,
    normalizeActivityLogs,
    normalizeSilentZone,
    normalizeSilentZones,
    toBooleanFlag,
} from '../src/utils/api/normalizers';

const paginated = rows => ({
    current_page: 1,
    last_page: 2,
    per_page: 25,
    total: 30,
    data: rows,
});

describe('extractList / extractPagination', () => {
    test('reads rows from a Laravel paginator', () => {
        expect(extractList(paginated([{id: 1}]))).toEqual([{id: 1}]);
    });

    test('accepts a plain array', () => {
        expect(extractList([{id: 1}])).toEqual([{id: 1}]);
        expect(extractPagination([{id: 1}])).toBeNull();
    });

    test('returns [] for null / unexpected shapes', () => {
        expect(extractList(null)).toEqual([]);
        expect(extractList(undefined)).toEqual([]);
        expect(extractList({foo: 'bar'})).toEqual([]);
        expect(extractList('oops')).toEqual([]);
    });

    test('reports whether more pages exist', () => {
        expect(extractPagination(paginated([]))).toEqual({
            currentPage: 1,
            lastPage: 2,
            perPage: 25,
            total: 30,
            hasMore: true,
        });
        expect(
            extractPagination({...paginated([]), current_page: 2}).hasMore,
        ).toBe(false);
    });
});

describe('toBooleanFlag', () => {
    test.each([
        [true, true],
        [1, true],
        ['1', true],
        ['true', true],
        ['active', true],
        ['Active ', true],
        [false, false],
        [0, false],
        ['0', false],
        ['inactive', false],
        [null, false],
        [undefined, false],
    ])('%p -> %p', (input, expected) => {
        expect(toBooleanFlag(input)).toBe(expected);
    });
});

describe('Silent Zones', () => {
    test('maps radius_m, is_active and numeric strings', () => {
        expect(
            normalizeSilentZone({
                id: 7,
                name: 'Office',
                address: '1 Main St',
                latitude: '12.5',
                longitude: '77.25',
                radius_m: 200,
                is_active: 1,
                category: {name: 'Work'},
            }),
        ).toEqual({
            id: 7,
            name: 'Office',
            street: '1 Main St',
            latitude: 12.5,
            longitude: 77.25,
            radius: 200,
            enabled: true,
            silentMode: true,
            categoryId: null,
            autoResponseTemplateId: null,
            autoResponseEnabled: false,
            category: 'Work',
        });
    });

    test('falls back to radius and status', () => {
        const zone = normalizeSilentZone({
            id: 3,
            radius: '150',
            status: 'inactive',
        });
        expect(zone.radius).toBe(150);
        expect(zone.enabled).toBe(false);
        expect(zone.name).toBe('Unnamed Zone');
    });

    test('is_active wins over status', () => {
        expect(
            normalizeSilentZone({id: 1, is_active: false, status: 'active'})
                .enabled,
        ).toBe(false);
    });

    test('does not invent coordinates or category', () => {
        const zone = normalizeSilentZone({id: 1});
        expect(zone.latitude).toBeNull();
        expect(zone.longitude).toBeNull();
        expect(zone.radius).toBeNull();
        expect(zone.category).toBe('');
    });

    // Row shape captured from the dev backend (GET /silent-zones, 2026-09-30).
    test('maps a real backend zone (radius_m, numeric status, category_id)', () => {
        const [zone] = normalizeSilentZones({
            current_page: 1,
            last_page: 1,
            data: [
                {
                    id: 3,
                    name: 'Library',
                    category_id: 1,
                    address: 'Main road',
                    latitude: '12.9716000',
                    longitude: '77.5946000',
                    radius_m: 200,
                    status: 0,
                },
            ],
        });
        expect(zone).toEqual({
            id: 3,
            name: 'Library',
            street: 'Main road',
            latitude: 12.9716,
            longitude: 77.5946,
            radius: 200,
            enabled: false,
            silentMode: true,
            categoryId: 1,
            autoResponseTemplateId: null,
            autoResponseEnabled: false,
            category: '',
        });
    });

    test('category labels come from geofence categories', () => {
        expect(
            buildCategoryNames([
                {id: 8, name: 'custom', display_name: 'Custom'},
                {id: 9, name: 'office'},
            ]),
        ).toEqual({8: 'Custom', 9: 'office'});
    });

    test('status payload always sends enabled as 1/0', () => {
        expect(buildZoneStatusPayload(true)).toEqual({enabled: 1});
        expect(buildZoneStatusPayload(false)).toEqual({enabled: 0});
    });

    test('reads the status endpoint result', () => {
        expect(
            readZoneStatusResult({zone_id: 3, enabled: false, status: 0}),
        ).toBe(false);
        expect(readZoneStatusResult({zone_id: 3, status: 1})).toBe(true);
        expect(readZoneStatusResult(null)).toBeNull();
    });

    test('reads a paginated list and drops id-less rows', () => {
        const zones = normalizeSilentZones(
            paginated([{id: 1, name: 'A'}, {name: 'no id'}, {zone_id: 9}]),
        );
        expect(zones.map(z => z.id)).toEqual([1, 9]);
    });

    test('create payload sends radius_m, defaults to 150 and omits empty category', () => {
        expect(
            buildSilentZonePayload({
                name: 'Home',
                address: 'x',
                latitude: 1,
                longitude: 2,
                radius: 'abc',
                categoryId: null,
            }),
        ).toEqual({
            name: 'Home',
            address: 'x',
            latitude: 1,
            longitude: 2,
            radius_m: 150,
        });
        expect(
            buildSilentZonePayload({radius: '300', categoryId: 4}),
        ).toMatchObject({radius_m: 300, category_id: 4});
    });
});

describe('Activity logs', () => {
    test('normalizes legacy camelCase rows', () => {
        expect(
            normalizeActivityLog({
                id: 1,
                senderName: 'Alice',
                content: 'hi',
                type: 'call',
                timestamp: '10/01/2025, 11:24:49 AM',
            }),
        ).toEqual({
            id: 1,
            name: 'Alice',
            content: 'hi',
            type: 'call',
            rawType: 'call',
            clientEventId: null,
            timestamp: '10/01/2025, 11:24:49 AM',
        });
    });

    test('normalizes snake_case rows', () => {
        expect(
            normalizeActivityLog({
                id: 2,
                sender_name: 'Bob',
                message: 'yo',
                log_type: 'whatsapp_message',
                created_at: '2026-09-01T10:00:00Z',
            }),
        ).toEqual({
            id: 2,
            name: 'Bob',
            content: 'yo',
            type: 'message',
            rawType: 'whatsapp_message',
            clientEventId: null,
            timestamp: '2026-09-01T10:00:00Z',
        });
    });

    // Row shape captured from the dev backend (GET /logs, 2026-09-30).
    test('maps a real backend row (null content, incoming_sms)', () => {
        const [log] = normalizeActivityLogs({
            current_page: 1,
            last_page: 1,
            data: [
                {
                    id: 3,
                    user_id: 2,
                    sender_name: 'Alex',
                    sender_number: null,
                    content: null,
                    type: 'incoming_sms',
                    timestamp: '2026-08-17 12:00:00',
                    created_at: '2026-09-04 08:21:45',
                },
            ],
        });
        expect(log).toEqual({
            id: 3,
            name: 'Alex',
            content: '',
            type: 'message',
            rawType: 'incoming_sms',
            clientEventId: null,
            timestamp: '2026-08-17 12:00:00',
        });
        expect(activityTypeLabel(log.rawType)).toBe('SMS');
    });

    test.each([
        ['whatsapp_call', 'WHATSAPP CALL'],
        ['whatsapp_message', 'WHATSAPP MESSAGE'],
        ['missed_call', 'CALL'],
        ['incoming_sms', 'SMS'],
        ['', 'MESSAGE'],
    ])('label for %p is %p', (raw, label) => {
        expect(activityTypeLabel(raw)).toBe(label);
    });

    test('drops empty rows instead of inventing them', () => {
        expect(normalizeActivityLog({})).toBeNull();
        expect(normalizeActivityLog(null)).toBeNull();
        expect(normalizeActivityLogs(paginated([{}, null, {id: 5}]))).toEqual([
            {
                id: 5,
                name: 'Unknown',
                content: '',
                type: 'message',
                rawType: '',
                clientEventId: null,
                timestamp: null,
            },
        ]);
    });

    test('empty / missing result gives an empty list', () => {
        expect(normalizeActivityLogs(null)).toEqual([]);
        expect(normalizeActivityLogs(paginated([]))).toEqual([]);
    });
});

describe('zones -> native engine', () => {
    const zone = overrides => ({
        ...normalizeSilentZone({
            id: 3,
            name: 'Library',
            latitude: '12.9716000',
            longitude: '77.5946000',
            radius_m: 200,
            status: 1,
            silent_mode: 1,
        }),
        ...overrides,
    });

    test('keeps only what geofencing needs', () => {
        expect(toEngineZones([zone()])).toEqual([
            {
                id: '3',
                name: 'Library',
                latitude: 12.9716,
                longitude: 77.5946,
                radius: 200,
                enabled: true,
            },
        ]);
    });

    test('a zone set not to silence is sent disabled', () => {
        const [z] = toEngineZones([
            {...normalizeSilentZone({id: 4, latitude: 1, longitude: 2, radius_m: 150, status: 1, silent_mode: 0})},
        ]);
        expect(z.enabled).toBe(false);
    });

    test('disabled zones stay listed (so their geofence is removed) but disabled', () => {
        expect(toEngineZones([zone({enabled: false})])[0].enabled).toBe(false);
    });

    test('zones without coordinates or radius are dropped', () => {
        expect(toEngineZones([zone({latitude: null}), zone({radius: null}), null])).toEqual([]);
        expect(toEngineZones(undefined)).toEqual([]);
    });
});
