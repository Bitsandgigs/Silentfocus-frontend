// Round 3 (#4): choose which of the phone's calendars silence it. Shows
// every calendar Android's Calendar Provider holds (Google, Samsung,
// Outlook / Exchange, local, ...), grouped by account, with loading,
// permission, empty and error states. Names stay on the phone.

import React, {useCallback, useEffect, useState} from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {
    calendarNote,
    describeSelection,
    effectiveSelection,
    getDeviceCalendars,
    groupCalendars,
    isCalendarSelected,
    toggleCalendar,
} from '../utils/deviceCalendars';
import {ACTION_BUTTON_BG, LIGHT_CONTROLS, linkColor} from '../utils/theme/controlColors';

/**
 * [onSave](ids) is called with the chosen ids (at least one).
 * [onRequestPermission]() resolves 'granted' | other.
 */
const CalendarPickerModal = ({visible, onClose, onSave, onRequestPermission}) => {
    const isDark = useColorScheme() === 'dark';
    const text = isDark ? '#eee' : '#1a1a1a';
    const muted = isDark ? '#bdbdbd' : LIGHT_CONTROLS.mutedText;
    const link = linkColor(isDark);
    const boxBg = isDark ? '#222' : '#fff';
    const divider = isDark ? 'rgba(255,255,255,0.12)' : '#ddd';

    const [state, setState] = useState({phase: 'loading'});
    const [selection, setSelection] = useState(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setState({phase: 'loading'});
        try {
            const result = await getDeviceCalendars();
            if (result?.permission !== 'granted') {
                setState({phase: 'permission'});
                return;
            }
            const calendars = Array.isArray(result.calendars) ? result.calendars : [];
            setSelection(Array.isArray(result.selection) ? result.selection.map(String) : null);
            setState({phase: calendars.length ? 'ready' : 'empty', calendars});
        } catch (e) {
            setState({phase: 'error'});
        }
    }, []);

    useEffect(() => {
        if (visible) load();
    }, [visible, load]);

    const allowAccess = async () => {
        const permission = await onRequestPermission?.();
        if (permission === 'granted') load();
    };

    const calendars = state.calendars || [];
    const chosen = effectiveSelection(selection, calendars);

    const save = async () => {
        if (!chosen.length || saving) return;
        setSaving(true);
        try {
            await onSave?.(chosen);
        } finally {
            setSaving(false);
        }
    };

    const renderBody = () => {
        switch (state.phase) {
            case 'loading':
                return (
                    <View style={styles.center}>
                        <ActivityIndicator color={link} />
                        <Text style={[styles.note, {color: muted}]}>Looking for calendars on this phone…</Text>
                    </View>
                );
            case 'permission':
                return (
                    <View style={styles.center}>
                        <Text style={[styles.note, {color: text}]}>
                            Silent Focus needs calendar access to see the calendars on this phone. Only event times
                            are used; titles and details are never read or uploaded.
                        </Text>
                        <TouchableOpacity onPress={allowAccess} style={styles.primaryBtn} accessibilityRole="button">
                            <Text style={styles.primaryText}>Allow calendar access</Text>
                        </TouchableOpacity>
                    </View>
                );
            case 'error':
                return (
                    <View style={styles.center}>
                        <Text style={[styles.note, {color: text}]}>The phone's calendars could not be read.</Text>
                        <TouchableOpacity onPress={load} accessibilityRole="button">
                            <Text style={[styles.link, {color: link}]}>Try again</Text>
                        </TouchableOpacity>
                    </View>
                );
            case 'empty':
                return (
                    <View style={styles.center}>
                        <Text style={[styles.note, {color: text}]}>
                            No calendars were found on this phone. Add your Google, Samsung or Outlook account in the
                            phone's Settings (Accounts) or calendar app, turn on calendar sync, then try again.
                        </Text>
                        <TouchableOpacity onPress={load} accessibilityRole="button">
                            <Text style={[styles.link, {color: link}]}>Refresh</Text>
                        </TouchableOpacity>
                    </View>
                );
            default:
                return (
                    <ScrollView
                        style={styles.list}
                        testID="calendar-picker-list"
                        nestedScrollEnabled
                        bounces
                        overScrollMode="always"
                        showsVerticalScrollIndicator
                        persistentScrollbar
                        keyboardShouldPersistTaps="handled"
                        scrollEventThrottle={16}
                        contentContainerStyle={styles.listContent}>
                        {groupCalendars(calendars).map(group => (
                            <View key={group.key} style={styles.group}>
                                <Text style={[styles.groupTitle, {color: muted}]}>{group.title}</Text>
                                {group.subtitle ? (
                                    <Text style={[styles.groupSub, {color: muted}]} numberOfLines={1}>
                                        {group.subtitle}
                                    </Text>
                                ) : null}
                                {group.data.map(c => {
                                    const checked = isCalendarSelected(selection, c);
                                    const note = calendarNote(c);
                                    return (
                                        <Pressable
                                            key={c.id}
                                            onPress={() => setSelection(toggleCalendar(selection, calendars, c.id))}
                                            accessibilityRole="checkbox"
                                            accessibilityState={{checked}}
                                            accessibilityLabel={`${c.name}${note ? `. ${note}` : ''}`}
                                            style={[styles.row, {borderBottomColor: divider}]}>
                                            <View
                                                style={[
                                                    styles.box,
                                                    {borderColor: checked ? ACTION_BUTTON_BG : muted},
                                                    checked && {backgroundColor: ACTION_BUTTON_BG},
                                                ]}>
                                                {checked ? <Text style={styles.tick}>✓</Text> : null}
                                            </View>
                                            <View style={[styles.dot, {backgroundColor: c.color || muted}]} />
                                            <View style={styles.flex}>
                                                <Text style={[styles.name, {color: text}]} numberOfLines={1}>
                                                    {c.name}
                                                </Text>
                                                {note ? (
                                                    <Text style={[styles.calNote, {color: muted}]} numberOfLines={2}>
                                                        {note}
                                                    </Text>
                                                ) : null}
                                            </View>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        ))}
                    </ScrollView>
                );
        }
    };

    return (
        <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
            <View style={styles.backdrop}>
                {/* Tap outside closes. A sibling (not a wrapping Pressable) so it never competes
                    with the list for the scroll gesture. */}
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
                <View style={[styles.box2, {backgroundColor: boxBg}]}>
                    <Text style={[styles.title, {color: text}]}>Choose calendars</Text>
                    <Text style={[styles.intro, {color: muted}]}>
                        Events in the calendars you select silence your phone. All calendars synced to this phone are
                        listed: Google, Samsung, Outlook / Exchange and others.
                    </Text>
                    {renderBody()}
                    {state.phase === 'ready' ? (
                        <Text style={[styles.summary, {color: muted}]}>
                            {describeSelection(selection, calendars)}
                        </Text>
                    ) : null}
                    <View style={styles.actions}>
                        <TouchableOpacity onPress={onClose} accessibilityRole="button" style={styles.actionBtn}>
                            <Text style={[styles.link, {color: link}]}>Cancel</Text>
                        </TouchableOpacity>
                        {state.phase === 'ready' ? (
                            <TouchableOpacity
                                onPress={save}
                                disabled={!chosen.length || saving}
                                accessibilityRole="button"
                                accessibilityState={{disabled: !chosen.length || saving}}
                                style={[styles.primaryBtn, (!chosen.length || saving) && styles.disabled]}>
                                <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

export default CalendarPickerModal;

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    box2: {
        width: wp('88%'),
        maxHeight: hp('86%'),
        borderRadius: wp('3%'),
        padding: wp('5%'),
    },
    title: {
        fontSize: wp('4.6%'),
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: hp('0.8%'),
    },
    intro: {
        fontSize: wp('3.2%'),
        lineHeight: wp('4.6%'),
        marginBottom: hp('1%'),
    },
    // flexShrink lets the list take all the room the dialog has (it was capped at 48% of the
    // screen, so only ~4 rows were visible and every drag had to be tiny).
    list: {
        flexGrow: 0,
        flexShrink: 1,
    },
    listContent: {
        paddingBottom: hp('1%'),
    },
    group: {
        marginTop: hp('1%'),
    },
    groupTitle: {
        fontSize: wp('3.2%'),
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    groupSub: {
        fontSize: wp('3%'),
        marginBottom: hp('0.4%'),
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 48,
        paddingVertical: hp('0.6%'),
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    box: {
        width: 22,
        height: 22,
        borderRadius: 4,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tick: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
        lineHeight: 16,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginHorizontal: wp('3%'),
    },
    flex: {
        flex: 1,
    },
    name: {
        fontSize: wp('3.7%'),
    },
    calNote: {
        fontSize: wp('2.9%'),
        marginTop: 2,
    },
    center: {
        alignItems: 'center',
        paddingVertical: hp('2%'),
    },
    note: {
        fontSize: wp('3.4%'),
        lineHeight: wp('5%'),
        textAlign: 'center',
        marginVertical: hp('1%'),
    },
    summary: {
        fontSize: wp('3.1%'),
        textAlign: 'center',
        marginTop: hp('1%'),
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginTop: hp('1.5%'),
    },
    actionBtn: {
        paddingHorizontal: wp('4%'),
        minHeight: 44,
        justifyContent: 'center',
    },
    link: {
        fontSize: wp('3.6%'),
        fontWeight: '600',
    },
    primaryBtn: {
        backgroundColor: ACTION_BUTTON_BG,
        borderRadius: wp('4%'),
        paddingHorizontal: wp('5%'),
        minHeight: 44,
        justifyContent: 'center',
        marginTop: hp('0.5%'),
    },
    primaryText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: wp('3.6%'),
    },
    disabled: {
        opacity: 0.45,
    },
});
