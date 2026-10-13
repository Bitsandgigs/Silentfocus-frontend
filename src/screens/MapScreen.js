import React, {useState, useEffect, useMemo, useCallback} from 'react';
import {
    View,
    StyleSheet,
    Platform,
    useColorScheme,
    TouchableOpacity,
    ScrollView,
    Text,
    TextInput,
    Switch,
    Alert,
    ActivityIndicator,
} from 'react-native';
import MapView, {Circle, Marker} from 'react-native-maps';
import {GooglePlacesAutocomplete} from 'react-native-google-places-autocomplete';
import {controlColors} from '../utils/theme/controlColors';
import SafeAreaContainerView from '../componentes/SafeAreaContainerView/SafeAreaContainerView';
import ContainerView from '../componentes/ContainerView/ContainerView';
// Lib
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from 'react-native-responsive-screen';

import {Colors, Constants} from '../utils/theme';
import {useNavigation, useIsFocused, useRoute} from '@react-navigation/native';
import BackIcon from '../assets/svgs/Back';
import {showAlert, showApiErrorAlert} from '../function/Alert';

// API
import EndPoints from '../utils/api/endpoints';
import APICall from '../utils/api/api';
import {
    buildCategoryNames,
    buildSilentZonePayload,
    buildZoneStatusPayload,
    extractList,
    readZoneStatusResult,
} from '../utils/api/normalizers';
import {fetchAllSilentZones} from '../utils/automationSync';
import {getCurrentLocation, pushZonesToEngine} from '../utils/silentFocusEngine';
import {MAPS_API_KEY} from '../utils/buildConfig';
import {getAppConfig} from '../utils/appConfig';
import {resolveLearnedPlace} from '../utils/learning';
import {
    ensureLocationAutomationPermissions,
    getLocationPermissionState,
    requestForegroundLocation,
} from '../utils/locationPermissions';
import {
    assessLocationFix,
    effectiveRadius,
    RADIUS_PRECISION_NOTE,
    radiusChoices,
    radiusLabel,
    validateZoneForm,
} from '../utils/zoneForm';

// #8: without a Maps key the map and place search can't work; say so
// instead of showing a blank map. With a key, tiles that never load (e.g.
// an invalid or restricted key) get a notice after this long.
// The native map reads its key from the manifest, so only the build key
// counts for it; place search prefers the admin key from GET /app-config.
const MAPS_CONFIGURED = !!MAPS_API_KEY;
const placesApiKey = () => getAppConfig().googleMapsApiKey || MAPS_API_KEY;
const MAP_LOAD_TIMEOUT_MS = 10000;

const EMPTY_FORM = {
    id: null,
    name: '',
    address: '',
    latitude: null,
    longitude: null,
    radius: 150,
    categoryId: null,
    // Set when the form was opened from a Smart Location Learning suggestion.
    learnedPlaceId: null,
};

const toRegion = (latitude, longitude) => ({
    latitude,
    longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
});

// Silent Zones: list, add, edit, enable/disable, delete. Every change the
// backend accepts is pushed to the native engine, which (re)registers the
// geofences - nothing here decides when the phone is silenced.
const MapScreen = () => {
    const navigation = useNavigation();
    const isFocused = useIsFocused();
    const route = useRoute();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const textColor = isDark ? 'white' : '#1C1C1C';
    // Readable in dark mode (Client Issue #8); light mode unchanged.
    const palette = controlColors(isDark);
    const chipColors = selected => ({
        chip: {backgroundColor: selected ? palette.zoneSelected : palette.pill},
        text: {color: selected ? palette.zoneSelectedText : palette.pillText},
    });

    const [zones, setZones] = useState([]);
    const [listState, setListState] = useState('loading'); // loading | ready | error
    const [categories, setCategories] = useState([]);
    const [permission, setPermission] = useState(null);

    const [form, setForm] = useState(null); // null = not adding/editing
    const [region, setRegion] = useState(null);
    const [fixInfo, setFixInfo] = useState(null);
    const [isLocating, setIsLocating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapTimedOut, setMapTimedOut] = useState(false);
    const formOpen = form !== null;

    // #8: a map that never finishes loading gets an explanation, not a blank box.
    useEffect(() => {
        setMapLoaded(false);
        setMapTimedOut(false);
        if (!formOpen || !MAPS_CONFIGURED) return undefined;
        const t = setTimeout(() => setMapTimedOut(true), MAP_LOAD_TIMEOUT_MS);
        return () => clearTimeout(t);
    }, [formOpen]);

    const categoryNames = useMemo(
        () => buildCategoryNames(categories),
        [categories],
    );

    // Check only; permission requests start from explicit taps.
    const refreshPermission = useCallback(() => {
        getLocationPermissionState()
            .then(setPermission)
            .catch(() => {});
    }, []);

    const loadZones = useCallback(async () => {
        const result = await fetchAllSilentZones();
        if (!result.ok) {
            setListState(prev => (prev === 'ready' ? 'ready' : 'error'));
            showApiErrorAlert(Constants.commonConstant.appName, result.response);
            return;
        }
        setZones(result.zones);
        setListState('ready');
        // Keep native geofences in step with what the user sees.
        pushZonesToEngine(result.zones).catch(() => {});
    }, []);

    useEffect(() => {
        APICall('get', null, EndPoints.getGeofenceCategories).then(response => {
            if (
                response?.statusCode === Constants.apiStatusCode.success &&
                response?.data?.status === '1'
            ) {
                setCategories(extractList(response.data.result));
            }
        });
    }, []);

    useEffect(() => {
        if (isFocused) {
            refreshPermission();
            loadZones();
        }
    }, [isFocused, loadZones, refreshPermission]);

    // Opened from a Smart Location Learning suggestion: pre-fill the normal
    // Add Zone form. Nothing is saved until the user presses Save.
    const learnedPrefill = route?.params?.learnedPlace;
    useEffect(() => {
        if (!learnedPrefill) return;
        const {id, latitude, longitude, radius} = learnedPrefill;
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            setFixInfo(null);
            setForm({
                ...EMPTY_FORM,
                latitude,
                longitude,
                radius: Number.isFinite(radius) ? radius : EMPTY_FORM.radius,
                address: 'Suggested from your Silent Focus use',
                learnedPlaceId: id || null,
            });
            setRegion(toRegion(latitude, longitude));
        }
        navigation.setParams({learnedPlace: undefined});
    }, [learnedPrefill, navigation]);

    // ---- Form

    const openNewZone = () => {
        setFixInfo(null);
        setForm({...EMPTY_FORM});
    };

    const openEditZone = zone => {
        setFixInfo(null);
        setForm({
            id: zone.id,
            name: zone.name,
            address: zone.street,
            latitude: zone.latitude,
            longitude: zone.longitude,
            radius: zone.radius || 150,
            // Kept exactly as saved (e.g. legacy 300 / 500 m, or < 100 m).
            originalRadius: zone.radius,
            categoryId: zone.categoryId,
        });
        if (Number.isFinite(zone.latitude) && Number.isFinite(zone.longitude)) {
            setRegion(toRegion(zone.latitude, zone.longitude));
        }
    };

    const closeForm = () => {
        setForm(null);
        setFixInfo(null);
    };

    const updateForm = patch => setForm(prev => ({...prev, ...patch}));

    const setPoint = (latitude, longitude, address) => {
        updateForm({
            latitude,
            longitude,
            ...(address !== undefined ? {address} : {}),
        });
        setRegion(toRegion(latitude, longitude));
    };

    const handlePlaceSelect = (data, details) => {
        const loc = details?.geometry?.location;
        if (!loc) {
            showAlert(
                Constants.commonConstant.appName,
                'Location details not found for that place.',
            );
            return;
        }
        setFixInfo(null);
        setPoint(
            loc.lat,
            loc.lng,
            details?.formatted_address || data?.description || '',
        );
        if (!form?.name && details?.name) {
            updateForm({name: details.name});
        }
    };

    // Fills the form only; the user still has to press Save.
    const onUseCurrentLocation = async () => {
        const state = await requestForegroundLocation();
        setPermission(state);
        if (!state.mapReady) {
            return;
        }
        setIsLocating(true);
        try {
            const fix = await getCurrentLocation();
            const assessment = assessLocationFix(fix.accuracy);
            setFixInfo(assessment);
            if (assessment.usable) {
                setPoint(fix.latitude, fix.longitude, 'Current location');
            }
        } catch (e) {
            setFixInfo({
                usable: false,
                level: 'error',
                message:
                    'Could not get your location. Check that location is turned on and try again.',
            });
        } finally {
            setIsLocating(false);
        }
    };

    const saveZone = async () => {
        const error = validateZoneForm(form);
        if (error) {
            showAlert(Constants.commonConstant.appName, error);
            return;
        }
        const payload = buildSilentZonePayload({
            name: form.name.trim(),
            address: form.address || '',
            latitude: form.latitude,
            longitude: form.longitude,
            radius: form.radius,
            categoryId: form.categoryId,
        });
        const isEdit = form.id !== null && form.id !== undefined;
        const url = isEdit
            ? EndPoints.updateSilentZone.replace('{zone_id}', form.id)
            : EndPoints.createSilentZone;

        setIsSaving(true);
        const response = await APICall(isEdit ? 'put' : 'post', payload, url);
        setIsSaving(false);
        if (
            response?.statusCode === Constants.apiStatusCode.success &&
            response?.data?.status === '1'
        ) {
            if (!isEdit && form.learnedPlaceId) {
                // The suggested place now has a real zone: stop learning it.
                resolveLearnedPlace(form.learnedPlaceId).catch(() => {});
            }
            closeForm();
            loadZones(); // also refreshes the native geofences
        } else {
            showApiErrorAlert(Constants.commonConstant.appName, response);
        }
    };

    // ---- List actions

    const toggleZone = async item => {
        const url = EndPoints.toggleSilentZoneStatus.replace(
            '{zone_id}',
            item.id,
        );
        setZones(prev =>
            prev.map(z => (z.id === item.id ? {...z, enabled: !z.enabled} : z)),
        );
        const response = await APICall(
            'post',
            buildZoneStatusPayload(!item.enabled),
            url,
        );
        const ok =
            response?.statusCode === Constants.apiStatusCode.success &&
            response?.data?.status !== '0';
        if (!ok) {
            setZones(prev =>
                prev.map(z =>
                    z.id === item.id ? {...z, enabled: item.enabled} : z,
                ),
            );
            showApiErrorAlert(Constants.commonConstant.appName, response);
            return;
        }
        const serverEnabled = readZoneStatusResult(response?.data?.result);
        const enabled = serverEnabled === null ? !item.enabled : serverEnabled;
        const next = zones.map(z => (z.id === item.id ? {...z, enabled} : z));
        setZones(next);
        // Disabling removes the geofence right away.
        pushZonesToEngine(next).catch(() => {});
    };

    const deleteZone = async id => {
        const url = EndPoints.deleteSilentZone.replace('{zone_id}', id);
        const response = await APICall('delete', null, url);
        if (
            response?.statusCode === Constants.apiStatusCode.success &&
            response?.data?.status !== '0'
        ) {
            const next = zones.filter(z => z.id !== id);
            setZones(next);
            pushZonesToEngine(next).catch(() => {});
        } else {
            showApiErrorAlert(
                Constants.commonConstant.appName,
                response,
                'Unable to delete this zone right now.',
            );
        }
    };

    const onPressDelete = zone => {
        Alert.alert(
            'Delete Silent Zone',
            `Delete "${zone.name}"? Your phone will no longer be silenced there.`,
            [
                {text: 'Cancel', style: 'cancel'},
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => deleteZone(zone.id),
                },
            ],
        );
    };

    const fixPermissions = async () => {
        const state = await ensureLocationAutomationPermissions();
        setPermission(state);
        loadZones();
    };

    // ---- Render

    const renderPermissionBanner = () => {
        if (Platform.OS !== 'android' || !permission || permission.automationReady) {
            return null;
        }
        let message =
            'Silent Zones need location allowed "all the time" to work when the app is closed.';
        if (permission.foreground === 'approximate') {
            message = 'Silent Zones need precise location.';
        } else if (permission.foreground !== 'granted') {
            message = 'Silent Zones need access to your location.';
        }
        return (
            <TouchableOpacity style={styles.banner} onPress={fixPermissions}>
                <Text style={styles.bannerText}>
                    {message} Tap to allow. Zones won't silence your phone
                    until then.
                </Text>
            </TouchableOpacity>
        );
    };

    const renderForm = () => (
        <View style={styles.form}>
            <Text style={[styles.sectionTitle, {color: textColor}]}>
                {form.id ? 'Edit Silent Zone' : 'New Silent Zone'}
            </Text>

            {placesApiKey() ? (
            <GooglePlacesAutocomplete
                placeholder="Search places"
                fetchDetails={true}
                onPress={(data, details = null) =>
                    handlePlaceSelect(data, details)
                }
                query={{
                    key: placesApiKey(),
                    language: 'en',
                }}
                predefinedPlaces={[]}
                textInputProps={isDark ? {placeholderTextColor: palette.placeholder} : {}}
                keyboardShouldPersistTaps="handled"
                styles={{
                    container: {flex: 0, marginBottom: 10},
                    textInput: {
                        borderRadius: 10,
                        padding: 16,
                        backgroundColor: palette.inputBg,
                        ...(isDark ? {color: palette.inputText} : {}),
                        fontSize: 15,
                    },
                    listView: {zIndex: 9999},
                }}
                listViewDisplayed="auto"
            />
            ) : null}

            <TouchableOpacity
                style={styles.secondaryButton}
                disabled={isLocating}
                onPress={onUseCurrentLocation}>
                {isLocating ? (
                    <ActivityIndicator color="#D6721E" />
                ) : (
                    <Text style={[styles.secondaryButtonText, {color: palette.link}]}>
                        Use My Current Location
                    </Text>
                )}
            </TouchableOpacity>
            {!!fixInfo?.message && (
                <Text
                    style={[styles.hint, fixInfo.usable ? null : styles.hintError]}>
                    {fixInfo.message}
                </Text>
            )}

            {MAPS_CONFIGURED ? (
            <View>
            <MapView
                onMapLoaded={() => setMapLoaded(true)}
                style={styles.map}
                region={region || undefined}
                showsUserLocation={!!permission?.mapReady}
                onPress={e => {
                    const {latitude, longitude} = e.nativeEvent.coordinate;
                    setFixInfo(null);
                    setPoint(latitude, longitude, 'Pinned location');
                }}>
                {Number.isFinite(form.latitude) && (
                    <Marker
                        coordinate={{
                            latitude: form.latitude,
                            longitude: form.longitude,
                        }}
                    />
                )}
                {Number.isFinite(form.latitude) && (
                    <Circle
                        center={{
                            latitude: form.latitude,
                            longitude: form.longitude,
                        }}
                        radius={effectiveRadius(form.radius)}
                        strokeColor="#D6721E"
                        fillColor="rgba(214,114,30,0.15)"
                    />
                )}
            </MapView>
            {mapTimedOut && !mapLoaded && (
                <View style={styles.mapNotice} accessibilityRole="text">
                    <Text style={styles.mapNoticeText}>
                        The map couldn't load (Google Maps isn't available in this build). You can
                        still use your current location; place search may not work.
                    </Text>
                </View>
            )}
            </View>
            ) : (
                <View style={[styles.mapUnavailable, {backgroundColor: palette.inputBg}]} accessibilityRole="text">
                    <Text style={[styles.mapUnavailableTitle, {color: textColor}]}>Map not available</Text>
                    <Text style={[styles.hint, {color: palette.secondaryText}]}>
                        Google Maps isn't set up in this build, so the map and place search are
                        hidden. Use "Use My Current Location" to set the zone centre; existing zones
                        keep working.
                    </Text>
                </View>
            )}
            <Text style={[styles.hint, {color: palette.secondaryText}]}>
                {Number.isFinite(form.latitude)
                    ? form.address || 'Location selected'
                    : MAPS_CONFIGURED
                    ? 'Search, tap the map, or use your current location.'
                    : placesApiKey()
                    ? 'Search for a place or use your current location.'
                    : 'Use your current location to set the zone centre.'}
            </Text>

            <TextInput
                placeholder="Zone name (e.g. Office)"
                placeholderTextColor={isDark ? palette.placeholder : '#999'}
                value={form.name}
                onChangeText={name => updateForm({name})}
                style={[styles.input, {color: isDark ? palette.inputText : textColor, backgroundColor: palette.inputBg}]}
            />

            <Text style={[styles.label, {color: textColor}]}>Radius</Text>
            <View style={styles.chipRow}>
                {radiusChoices(form.originalRadius).map(r => {
                    const selected = Number(form.radius) === r;
                    return (
                        <TouchableOpacity
                            key={r}
                            onPress={() => updateForm({radius: r})}
                            accessibilityRole="button"
                            accessibilityState={{selected}}
                            style={[styles.chip, chipColors(selected).chip]}>
                            <Text
                                style={[styles.chipText, chipColors(selected).text]}>
                                {radiusLabel(r)}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            <Text style={[styles.hint, {color: palette.secondaryText}]}>
                {RADIUS_PRECISION_NOTE}
            </Text>

            {categories.length > 0 && (
                <>
                    <Text style={[styles.label, {color: textColor}]}>
                        Category
                    </Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.categoryRow}>
                        {categories.map(cat => {
                            const selected = form.categoryId === cat.id;
                            return (
                                <TouchableOpacity
                                    key={cat.id}
                                    onPress={() =>
                                        updateForm({
                                            categoryId: selected ? null : cat.id,
                                        })
                                    }
                                    accessibilityRole="button"
                                    accessibilityState={{selected}}
                                    style={[styles.chip, chipColors(selected).chip]}>
                                    <Text
                                        style={[styles.chipText, chipColors(selected).text]}>
                                        {cat.display_name || cat.name}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </>
            )}

            <View style={styles.formButtons}>
                <TouchableOpacity
                    style={[styles.secondaryButton, styles.flexButton]}
                    onPress={closeForm}>
                    <Text style={[styles.secondaryButtonText, {color: palette.cancelText}]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.saveButton, styles.flexButton]}
                    disabled={isSaving}
                    onPress={saveZone}>
                    <Text style={styles.saveButtonText}>
                        {isSaving ? 'Saving...' : 'Save Zone'}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderZone = zone => (
        <View
            key={String(zone.id)}
            style={[
                styles.locationCard,
                {backgroundColor: isDark ? '#1C1C1C' : '#5555551F'},
            ]}>
            <TouchableOpacity
                style={styles.flex}
                onPress={() => openEditZone(zone)}
                accessibilityHint="Edit this zone">
                <Text style={[styles.locationName, {color: textColor}]}>
                    {zone.name}
                </Text>
                {!!zone.street && (
                    <Text style={[styles.locationAddress, {color: textColor}]}>
                        {zone.street}
                    </Text>
                )}
                <Text style={[styles.zoneMeta, {color: palette.secondaryText}]}>
                    {zone.radius ? `${radiusLabel(zone.radius)} radius` : ''}
                    {zone.silentMode === false ? ' · does not silence' : ''}
                    {'  ·  Tap to edit'}
                </Text>
                {!!(zone.category || categoryNames[zone.categoryId]) && (
                    <View style={styles.tagContainer}>
                        <Text style={styles.tagText}>
                            {zone.category || categoryNames[zone.categoryId]}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>
            <Switch
                value={!!zone.enabled}
                onValueChange={() => toggleZone(zone)}
            />
            <TouchableOpacity
                style={styles.removeButton}
                accessibilityLabel={`Delete ${zone.name}`}
                onPress={() => onPressDelete(zone)}>
                <Text style={styles.removeButtonText}>×</Text>
            </TouchableOpacity>
        </View>
    );

    const renderList = () => {
        if (listState === 'loading') {
            return <ActivityIndicator style={styles.listState} color="#D6721E" />;
        }
        if (listState === 'error') {
            return (
                <TouchableOpacity style={styles.listState} onPress={loadZones}>
                    <Text style={[styles.emptyText, {color: textColor}]}>
                        Could not load your zones. Tap to retry.
                    </Text>
                </TouchableOpacity>
            );
        }
        if (zones.length === 0) {
            return (
                <Text
                    style={[styles.emptyText, styles.listState, {color: textColor}]}>
                    No Silent Zones yet. Add places like your office or a
                    library, and your phone will be silenced when you arrive.
                </Text>
            );
        }
        return zones.map(renderZone);
    };

    return (
        <ContainerView>
            <SafeAreaContainerView
                style={{flex: 1, backgroundColor: isDark ? '#111111' : '#ffffff'}}>
                <ScrollView
                    contentContainerStyle={[
                        styles.container,
                        {backgroundColor: isDark ? '#111111' : '#fff'},
                    ]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}>
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            style={styles.backButton}>
                            <BackIcon width={26} height={26} color={palette.icon} />
                        </TouchableOpacity>
                        <Text style={[styles.title, {color: textColor}]}>
                            Silent Zones
                        </Text>
                    </View>

                    {renderPermissionBanner()}

                    {form ? (
                        renderForm()
                    ) : (
                        <TouchableOpacity
                            style={styles.saveButton}
                            onPress={openNewZone}>
                            <Text style={styles.saveButtonText}>
                                + Add Silent Zone
                            </Text>
                        </TouchableOpacity>
                    )}

                    <Text style={[styles.sectionTitle, {color: textColor}]}>
                        Added Places
                    </Text>
                    {renderList()}
                </ScrollView>
            </SafeAreaContainerView>
        </ContainerView>
    );
};

const styles = StyleSheet.create({
    mapNotice: {
        position: 'absolute',
        left: 8,
        right: 8,
        bottom: 8,
        padding: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.75)',
    },
    mapNoticeText: {color: '#FFFFFF', fontSize: 13},
    mapUnavailable: {
        padding: 16,
        borderRadius: 12,
        marginVertical: 10,
    },
    mapUnavailableTitle: {fontSize: 16, fontWeight: '600', marginBottom: 4},
    container: {
        paddingTop: hp('1%'),
        paddingHorizontal: wp('4%'),
        paddingBottom: hp('6%'),
    },
    flex: {flex: 1},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    backButton: {
        height: 42,
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        marginLeft: 6,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginTop: 18,
        marginBottom: 10,
    },
    banner: {
        backgroundColor: '#FDECEA',
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
    },
    bannerText: {
        color: '#B3261E',
        fontSize: 13,
    },
    form: {
        marginBottom: 8,
    },
    map: {
        height: 260,
        width: '100%',
        borderRadius: 10,
        marginTop: 10,
    },
    hint: {
        fontSize: 13,
        color: '#888',
        marginTop: 6,
        marginBottom: 8,
    },
    hintError: {
        color: '#B3261E',
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 6,
    },
    input: {
        borderRadius: 10,
        padding: 12,
        backgroundColor: Colors.textInputBg,
        fontSize: 15,
        marginBottom: 12,
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 12,
    },
    categoryRow: {
        marginBottom: 12,
    },
    chip: {
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 20,
        backgroundColor: '#5555551F',
        marginRight: 8,
        marginBottom: 8,
    },
    chipText: {
        fontSize: 13,
        color: Colors.black,
        fontWeight: '500',
    },
    formButtons: {
        flexDirection: 'row',
        marginTop: 4,
    },
    flexButton: {
        flex: 1,
        marginHorizontal: 4,
    },
    saveButton: {
        backgroundColor: '#ff6600',
        padding: 15,
        borderRadius: 10,
        justifyContent: 'center',
    },
    saveButtonText: {
        color: '#111111', // 6.4:1 on #ff6600 (white was 2.9:1)
        fontSize: 16,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    secondaryButton: {
        borderWidth: 1,
        borderColor: '#D6721E',
        padding: 13,
        borderRadius: 10,
        justifyContent: 'center',
    },
    secondaryButtonText: {
        color: '#D6721E',
        fontSize: 15,
        textAlign: 'center',
        fontWeight: '600',
    },
    listState: {
        marginVertical: 20,
    },
    emptyText: {
        textAlign: 'center',
        fontSize: 14,
        opacity: 0.7,
    },
    locationCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        borderRadius: 12,
        marginBottom: 18,
    },
    locationName: {
        fontSize: 16,
        fontWeight: '500',
    },
    locationAddress: {
        fontSize: 14,
        marginVertical: 4,
    },
    zoneMeta: {
        fontSize: 12,
        color: '#888',
    },
    tagContainer: {
        alignSelf: 'flex-start',
        backgroundColor: '#A8550A', // white text 5.3:1 (#d46c0d was 3.5:1)
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: 20,
        marginTop: 6,
    },
    tagText: {
        fontSize: 12,
        color: '#fff',
        fontWeight: '600',
    },
    removeButton: {
        position: 'absolute',
        top: -12,
        right: 5,
        backgroundColor: '#333',
        borderRadius: 15,
        width: 25,
        height: 25,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    removeButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default MapScreen;
