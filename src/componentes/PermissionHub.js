import React, {useCallback, useEffect, useState} from 'react';
import {ACTION_BUTTON_BG, linkColor} from '../utils/theme/controlColors';
import {AppState, StyleSheet, Text, ToastAndroid, TouchableOpacity, View, useColorScheme} from 'react-native';
import {useIsFocused, useNavigation} from '@react-navigation/native';
import {PERMISSIONS, RESULTS, request} from 'react-native-permissions';
import screens from '../utils/theme/screens';
import {BATTERY_FALLBACK_MESSAGE, buildPermissionRows, getPermissionHub, openAppSettings, openBatterySettings, openLocationSettings} from '../utils/permissionHub';
import {openDndAccessSettings, openExactAlarmSettings} from '../utils/silentFocusEngine';
import {openNotificationAccessSettings} from '../utils/comms';
import {
    ensureLocationAutomationPermissions,
    requestCalendarPermission,
} from '../utils/locationPermissions';

const ORANGE = '#D6721E';

/** Settings section: what Silent Focus can access, why, and a fix button. */
const PermissionHub = () => {
    const navigation = useNavigation();
    const isFocused = useIsFocused();
    const isDark = useColorScheme() === 'dark';
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(false);
    const [open, setOpen] = useState(false);

    const refresh = useCallback(() => {
        getPermissionHub()
            .then(hub => {
                setRows(buildPermissionRows(hub));
                setError(false);
            })
            .catch(() => setError(true));
    }, []);

    useEffect(() => {
        if (isFocused) refresh();
        const sub = AppState.addEventListener('change', s => s === 'active' && refresh());
        return () => sub.remove();
    }, [isFocused, refresh]);

    const runtime = async permission => {
        const result = await request(permission);
        if (result === RESULTS.BLOCKED) openAppSettings();
        refresh();
    };

    const fix = async key => {
        switch (key) {
            case 'dnd':
                return openDndAccessSettings();
            case 'exactAlarms':
                return openExactAlarmSettings();
            case 'notificationAccess':
                return openNotificationAccessSettings();
            case 'location':
            case 'backgroundLocation':
                await ensureLocationAutomationPermissions();
                return refresh();
            case 'locationServices':
                return openLocationSettings();
            case 'calendar':
                await requestCalendarPermission();
                return refresh();
            case 'callScreening':
                return navigation.navigate(screens.EmergencyContactsScreen);
            case 'contacts':
                return runtime(PERMISSIONS.ANDROID.READ_CONTACTS);
            case 'phoneState':
                return runtime(PERMISSIONS.ANDROID.READ_PHONE_STATE);
            case 'battery':
                if ((await openBatterySettings()) === 'UNAVAILABLE') {
                    ToastAndroid.show(BATTERY_FALLBACK_MESSAGE, ToastAndroid.LONG);
                }
                return undefined;
            default:
                return undefined;
        }
    };

    const card = isDark ? 'rgba(85, 85, 85, 0.12)' : '#2E3A3E14';
    const text = isDark ? '#FFFFFF' : '#1A1A1A';
    const muted = isDark ? '#AAA' : '#555';

    if (error) {
        return (
            <TouchableOpacity onPress={refresh} style={[styles.card, {backgroundColor: card}]} accessibilityRole="button">
                <Text style={[styles.why, {color: muted}]}>Permission status could not be read. Tap to retry.</Text>
            </TouchableOpacity>
        );
    }
    if (!rows) return null;

    // Collapsed by default (the list is long); the header still says how
    // many are missing so a hidden "Fix" is never silent.
    const missing = rows.filter(r => !r.ok).length;
    const summary = missing === 0 ? 'All allowed' : `${missing} need${missing === 1 ? 's' : ''} attention`;

    return (
        <View style={[styles.card, {backgroundColor: card}]}>
            <TouchableOpacity
                onPress={() => setOpen(o => !o)}
                style={styles.row}
                accessibilityRole="button"
                accessibilityState={{expanded: open}}
                accessibilityLabel={`Permissions: ${summary}`}>
                <View style={styles.flex}>
                    <Text style={[styles.title, {color: text}]}>{open ? 'Hide permissions' : 'Show permissions'}</Text>
                    <Text style={[styles.why, missing ? styles.summaryMissing : styles.summaryOk]}>{summary}</Text>
                </View>
                <Text style={[styles.chevron, {color: linkColor(isDark)}]}>{open ? '▴' : '▾'}</Text>
            </TouchableOpacity>
            {open && rows.map(r => (
                <View key={r.key} style={[styles.row, styles.divider]}>
                    <View style={styles.flex}>
                        <Text style={[styles.title, {color: text}]}>{r.title}</Text>
                        <Text style={[styles.why, {color: muted}]}>{r.why}</Text>
                    </View>
                    {r.ok ? (
                        <Text style={styles.ok} accessibilityLabel={`${r.title}: allowed`}>
                            Allowed
                        </Text>
                    ) : (
                        <TouchableOpacity
                            onPress={() => fix(r.key)}
                            style={[styles.fix, r.required && styles.fixRequired]}
                            accessibilityRole="button"
                            accessibilityLabel={r.actionLabel ? `${r.actionLabel} ${r.title}` : `Allow ${r.title}`}>
                            <Text style={[styles.fixText, {color: r.required ? '#fff' : linkColor(isDark)}]}>
                                {r.actionLabel || (r.required ? 'Fix' : 'Allow')}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            ))}
        </View>
    );
};

export default PermissionHub;

const styles = StyleSheet.create({
    flex: {flex: 1},
    card: {borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 16},
    row: {flexDirection: 'row', alignItems: 'center', paddingVertical: 10},
    divider: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#999'},
    title: {fontSize: 14, fontWeight: '600'},
    why: {fontSize: 12, lineHeight: 17, marginTop: 2},
    ok: {color: '#2E7D32', fontWeight: '600', fontSize: 13, marginLeft: 12},
    fix: {
        marginLeft: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: ORANGE,
        paddingVertical: 6,
        paddingHorizontal: 12,
        minHeight: 36,
        justifyContent: 'center',
    },
    fixRequired: {backgroundColor: ACTION_BUTTON_BG, borderColor: ACTION_BUTTON_BG},
    fixText: {fontWeight: '600', fontSize: 13},
    summaryOk: {color: '#2E7D32', fontWeight: '600'},
    summaryMissing: {color: ORANGE, fontWeight: '600'},
    chevron: {fontSize: 18, marginLeft: 12},
});
