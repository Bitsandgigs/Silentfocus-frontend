import React, {useState, useEffect} from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    useColorScheme,
    FlatList,
    Switch,
    Image,
    Platform,
    Alert,
    Linking,
} from 'react-native';

// Lib
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {useIsFocused, useNavigation} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {syncAllAutomationSources} from '../utils/automationSync';
import moment from 'moment';

// Component
import ModernSilentButton from '../componentes/ModernSilentButton';
import ContainerView from '../componentes/ContainerView/ContainerView';
import SafeAreaContainerView from '../componentes/SafeAreaContainerView/SafeAreaContainerView';

// Misc Constants
import {Colors, Constants, Images, Permissions} from '../utils/theme';
import screens from '../utils/theme/screens';
import {localize, width} from '../function/commonFunctions';
import EndPoints from '../utils/api/endpoints';
import APICall from '../utils/api/api';
import {showAlert, showApiErrorAlert} from '../function/Alert';
import LearningSuggestionCard from '../componentes/LearningSuggestionCard';
import {
    SCHEDULE_TYPE,
    formatOnceRange,
    normalizeOnceRow,
    normalizeScheduleRow,
    onceStatusLabel,
    weeklyDaysLabel,
} from '../utils/scheduleRules';
import {
    activateOnceSchedules,
    cancelOnceSchedule,
    isEngineAvailable,
    openDndAccessSettings,
    openExactAlarmSettings,
    pushSchedulesToEngine,
    setManualSilent,
    syncDeviceCalendar,
} from '../utils/silentFocusEngine';
import {
    ensureLocationAutomationPermissions,
    requestCalendarPermission,
} from '../utils/locationPermissions';
import useSilentFocusState from '../utils/useSilentFocusState';
import {
    describeEngineState,
    formatCountdown,
    silenceEndsAt,
} from '../utils/engineStatus';
import CustomLoader from '../componentes/CustomLoader/CustomLoader';
import {linkColor} from '../utils/theme/controlColors';
import {getFloatingActionBottomOffset} from '../utils/bottomNavigationLayout';


export default function HomeScreen() {
    const navigation = useNavigation();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    // Orange link text: AA on the light cards too (#D6721E was ~3:1).
    const link = linkColor(isDark);
    const [isLoading, setIsLoading] = useState(false);
    const [arrayEvents, setArrayEvents] = useState([]);
    const isFocused = useIsFocused();
    const {engineState, setEngineState} = useSilentFocusState();
    // Counts manual Silent ON taps (Smart Location Learning's only signal).
    const [manualOnCount, setManualOnCount] = useState(0);
    const [scheduleLoadError, setScheduleLoadError] = useState(false);
    // One-time schedules: native, on this phone (see OnceSchedules.kt).
    const [onceRows, setOnceRows] = useState([]);
    const silentActive = !!engineState?.silentActive;
    const activeScheduleIds = (engineState?.activeRules || [])
        .filter(rule => rule.source === 'SCHEDULE')
        .map(rule => String(rule.ruleId));

    // const [arrayEvents, setArrayEvents] = useState([
    //     {
    //         id: 1,
    //         startTime: '12:12',
    //         endTime: '14:00',
    //         days: 'Everyday',
    //         enabled: false,
    //     },
    //     {
    //         id: 2,
    //         startTime: '15:00',
    //         endTime: '18:00',
    //         days: 'Weekdays',
    //         enabled: false,
    //     },
    // ]);

    const dummyNotifications = [
        {
            id: '1',
            name: 'Steve Jobs',
            type: 'CALL',
            time: '5 min ago',
        },
        {
            id: '2',
            name: 'Elon Musk',
            type: 'WHATSAPP',
            time: '10 min ago',
        },
        {
            id: '3',
            name: 'Bill Gates',
            type: 'SMS',
            time: '15 min ago',
        },
        {
            id: '4',
            name: 'Sundar Pichai',
            type: 'CALL',
            time: '20 min ago',
        },
    ];

    // Display-only tick: timing remains native/persisted.  It covers both
    // schedule countdowns and the Manual elapsed timer without a JS clock.
    const [now, setNow] = useState(Date.now());
    const silenceEnd = silenceEndsAt(engineState);
    const status = describeEngineState(engineState, now);
    useEffect(() => {
        if (!silenceEnd && engineState?.source !== 'MANUAL') {
            return undefined;
        }
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [silenceEnd, engineState?.source]);

    // A schedule started or ended natively (alarm): refresh the one-time list
    // so its status (On now / Finished) is current. SCHEDULE_CHANGED (our own
    // reload) is not a trigger, so this can't loop.
    const lastReason = engineState?.lastReason;
    const lastEvaluatedAt = engineState?.evaluatedAt;
    useEffect(() => {
        if (isFocused && (lastReason === 'SCHEDULE_START' || lastReason === 'SCHEDULE_END')) {
            loadOnceSchedules();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastReason, lastEvaluatedAt, isFocused]);

    // Home is where the app lands: refresh everything the native engine
    // automates from (settings, zones, device calendar). The engine keeps
    // its last copy if a request fails, so this never blocks automation.
    useEffect(() => {
        if (isFocused) {
            setIsLoading(true);
            getScheduleApiCall();
            loadOnceSchedules();
            syncAllAutomationSources()
                .then(state => state && setEngineState(state))
                .catch(() => {});
        }
    }, [isFocused]);


    const convertTo24HourFormat = time => {
        return moment(time, ['HH:mm ']).format('h:mm A');
    };

    // Manual toggle: the native engine decides and applies; the UI only
    // renders what it reports back.
    const promptDndAccess = () => {
        Alert.alert(
            'Permission required',
            'Silent Focus needs “Do Not Disturb” access to silence this phone.',
            [
                {text: 'Cancel', style: 'cancel'},
                {text: 'Open Settings', onPress: openDndAccessSettings},
            ],
        );
    };

    // Permission fixes started from the Home banners (never automatically).
    const onPressLocationIssue = async () => {
        if (status.locationIssue?.status === 'LOCATION_OFF') {
            Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(
                () => {},
            );
            return;
        }
        await ensureLocationAutomationPermissions();
        syncAllAutomationSources()
            .then(state => state && setEngineState(state))
            .catch(() => {});
    };

    const onPressCalendarIssue = async () => {
        await requestCalendarPermission();
        syncDeviceCalendar()
            .then(state => state && setEngineState(state))
            .catch(() => {});
    };

    const onPressSilentButton = async () => {
        if (!isEngineAvailable) {
            showAlert(
                Constants.commonConstant.appName,
                'Silent Focus automation is only available on Android.',
            );
            return;
        }
        if (engineState && !engineState.dndAccess) {
            promptDndAccess();
            return;
        }
        try {
            const turningOn = !engineState?.silentActive;
            const next = await setManualSilent(turningOn);
            setEngineState(next);
            if (turningOn && next?.silentActive) {
                setManualOnCount(c => c + 1);
            }
            if (next?.blockedReason === 'DND_ACCESS_MISSING') {
                promptDndAccess();
            } else if (next?.blockedReason) {
                showAlert(
                    Constants.commonConstant.appName,
                    'Silent Focus could not change the phone mode.',
                );
            }
        } catch (e) {
            showAlert(
                Constants.commonConstant.appName,
                'Silent Focus could not change the phone mode.',
            );
        }
    };

    // Saves the enabled flag, then refreshes the native alarms. Enabling a
    // schedule never silences the phone by itself: the engine does that at
    // the schedule's start time (or now, if it is already inside it).
    const toggleSwitch = async id => {
        const previous = arrayEvents;
        const updatedData = arrayEvents.map(item =>
            item.id === id ? {...item, enabled: !item.enabled} : item,
        );
        setArrayEvents(updatedData);

        const selectedSchedule = updatedData.find(item => item.id === id);
        const payload = {
            schedule_id: selectedSchedule.id ? selectedSchedule.id : '',
            isTimerEnabled: selectedSchedule.enabled
                ? selectedSchedule.enabled
                : 'false',
        };

        setIsLoading(true);
        const saved = await postTimerScheduleApiCall(payload);
        if (!saved) {
            setArrayEvents(previous);
            return;
        }
        pushSchedulesToEngine(updatedData)
            .then(setEngineState)
            .catch(() => {});
    };

    const onPressAddNewSchedule = () => {
        navigation.navigate(screens.ScheduleTimeScreen);
    };

    const onPressDelete = (schedule, isRunning) => {
        Alert.alert(
            isRunning ? 'End and delete this schedule?' : 'Delete this schedule?',
            isRunning
                ? 'This schedule is active now. Silent Focus will stay on if another mode is still active.'
                : 'This weekly schedule will be removed.',
            [
                {text: 'Cancel', style: 'cancel'},
                {
                    text: isRunning ? 'End and delete' : 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        const payload = {
                            userId: Constants.commonConstant.appUserId || '',
                            schedule_id: schedule?.id || '',
                        };
                        setIsLoading(true);
                        ScheduleTimerDataDeleteApiCall(payload);
                    },
                },
            ],
        );
    };

    const onPressEdit = item => {
        navigation.navigate(screens.EditScheduleTimeScreen, {
            scheduleData: item,
        });
    };

    const ScheduleTimerDataDeleteApiCall = async payload => {
        let url = EndPoints.scheduleTimerDataDelete.replace(
            '{schedule_id}',
            `${payload.schedule_id}`,
        );

        url = `${url}?userId=${payload.userId}`;

        await APICall('delete', null, url).then(response => {
            setIsLoading(false);
            if (
                response?.statusCode === Constants.apiStatusCode.success &&
                response?.data
            ) {
                const responseData = response?.data;
                if (responseData?.status === '1') {
                    // Drop its alarms right away, not on the next refresh.
                    const remaining = arrayEvents.filter(
                        item => item.id !== payload.schedule_id,
                    );
                    setArrayEvents(remaining);
                    pushSchedulesToEngine(remaining)
                        .then(setEngineState)
                        .catch(() => {});
                } else {
                    showApiErrorAlert(Constants.commonConstant.appName, response);
                }
            } else {
                showApiErrorAlert(Constants.commonConstant.appName, response);
            }
        });
    };

    // Also makes this account's one-time schedules the ones that automate.
    const applyOnceResult = result => {
        if (Array.isArray(result?.schedules)) {
            setOnceRows(result.schedules.map(normalizeOnceRow));
        }
        if (result?.state) {
            setEngineState(result.state);
        }
    };

    const loadOnceSchedules = () =>
        activateOnceSchedules(Constants.commonConstant.appUserId)
            .then(applyOnceResult)
            .catch(() => {});

    // remove=false ends an active schedule now (kept as Cancelled).
    const changeOnceSchedule = (item, remove) => {
        const active = item.status === 'ACTIVE';
        Alert.alert(
            active ? 'End this schedule now?' : 'Delete this schedule?',
            active
                ? 'Silent Focus stops for this one-time schedule. Other active modes stay on.'
                : `${formatOnceRange(item.startAt, item.endAt)} will be removed.`,
            [
                {text: 'Cancel', style: 'cancel'},
                {
                    text: active ? 'End now' : 'Delete',
                    style: 'destructive',
                    onPress: () =>
                        cancelOnceSchedule(Constants.commonConstant.appUserId, item.id, remove)
                            .then(result => {
                                if (!result?.ok) {
                                    showAlert(Constants.commonConstant.appName, 'The schedule could not be changed.');
                                }
                                applyOnceResult(result);
                            })
                            .catch(() => showAlert(Constants.commonConstant.appName, 'The schedule could not be changed.')),
                },
            ],
        );
    };

    // Loads schedules and hands them to the native engine, which owns the
    // alarms. On failure the engine keeps its last copy (works offline).
    const getScheduleApiCall = async () => {
        const url = EndPoints.getScheduleTimerData;
        const payload = {
            userId: Constants.commonConstant.appUserId,
        };

        const response = await APICall('get', payload, url);
        setIsLoading(false);
        const ok = response?.statusCode === Constants.apiStatusCode.success;
        if (ok && (response?.data?.status === '1' || response?.data?.status === '0')) {
            // status '0' = the user has no schedules yet (not an error).
            const rows = Array.isArray(response.data.result)
                ? response.data.result
                : [];
            const formattedData = rows.map(normalizeScheduleRow);
            setArrayEvents(formattedData);
            setScheduleLoadError(false);
            pushSchedulesToEngine(formattedData)
                .then(setEngineState)
                .catch(() => {});
        } else {
            // Shown inline with a retry; the engine keeps its last copy, so
            // schedules still run offline.
            setScheduleLoadError(true);
        }
    };

    // Returns true when the backend accepted the change.
    const postTimerScheduleApiCall = async payload => {
        const url = EndPoints.postTimerSchedule;
        const response = await APICall('post', payload, url);
        setIsLoading(false);
        if (
            response?.statusCode === Constants.apiStatusCode.success &&
            response?.data?.status === '1'
        ) {
            return true;
        }
        showApiErrorAlert(Constants.commonConstant.appName, response);
        return false;
    };

    // Render Component
    // const renderCustomScheduleItem = ({item}) => (

    //     <View style={styles.containerView}>
    //         <View
    //             style={[
    //                 styles.card,
    //                 {backgroundColor: isDark ? '#1C1C1C' : '#5555551F'},
    //             ]}>
    //             <View style={styles.cardContent}>
    //                 <Image source={Images.iconClock} style={styles.icon} />
    //                 <View style={styles.timeBlock}>
    //                     <Text
    //                         style={[
    //                             styles.timeRange,
    //                             {color: isDark ? 'white' : '#1C1C1C'},
    //                         ]}>
    //                         {convertTo24HourFormat(item.startTime)} -{' '}
    //                         {convertTo24HourFormat(item.endTime)}
    //                     </Text>

    //                     <View style={styles.labelBlock}>
    //                         <Text
    //                             style={[
    //                                 styles.everyday,
    //                                 {
    //                                     color: isDark
    //                                         ? 'rgba(250,250,250,0.45)'
    //                                         : '#555',
    //                                 },
    //                             ]}>
    //                             {item.days === 'Everyday'
    //                                 ? 'Everyday'
    //                                 : item.days
    //                                       .map(day => day.slice(0, 3))
    //                                       .join(', ')}
    //                         </Text>

    //                         <View
    //                             style={[
    //                                 styles.dividerLine,
    //                                 {
    //                                     backgroundColor: isDark
    //                                         ? 'rgba(85, 85, 85, 0.35)'
    //                                         : '#D9D9D9',
    //                                 },
    //                             ]}
    //                         />

    //                         <View
    //                             style={{
    //                                 flexDirection: 'row',
    //                                 width: wp('65%'),
    //                                 justifyContent: 'space-between',
    //                             }}>
    //                             <Text style={styles.addSchedule}>
    //                                 Add Schedule ＋
    //                             </Text>

    //                             <View
    //                                 style={{
    //                                     flexDirection: 'row',
    //                                     alignItems: 'center',
    //                                 }}>
    //                                 <TouchableOpacity
    //                                     style={{margin: 5}}
    //                                     onPress={() => onPressEdit(item)}
    //                                     disabled={activeScheduleId === item.id}>
    //                                     <Text style={{color: '#D6721E'}}>
    //                                         Edit
    //                                     </Text>
    //                                 </TouchableOpacity>
    //                                 <TouchableOpacity
    //                                     style={{margin: 5}}
    //                                     onPress={() => {
    //                                         onPressDelete(item.id);
    //                                     }}
    //                                     disabled={activeScheduleId === item.id}>
    //                                     <Text style={{color: '#D6721E'}}>
    //                                         Delete
    //                                     </Text>
    //                                 </TouchableOpacity>
    //                             </View>
    //                         </View>
    //                     </View>
    //                 </View>
    //                 <Switch
    //                     value={item.enabled}
    //                     style={styles.toggleWrapper}
    //                     onValueChange={() => toggleSwitch(item.id)}
    //                     trackColor={{false: '#444', true: '#ff9800'}}
    //                     thumbColor={item.enabled ? '#fff' : '#fff'}
    //                 />
    //             </View>
    //         </View>
    //     </View>

    // );

    const renderOnceScheduleItem = item => {
        // Times decide between native refreshes; cancelled/finished are final.
        const t = Date.now();
        const status =
            item.status === 'CANCELLED' || item.status === 'COMPLETED'
                ? item.status
                : t >= item.endAt
                ? 'COMPLETED'
                : t >= item.startAt || activeScheduleIds.includes(item.id)
                ? 'ACTIVE'
                : 'PENDING';
        const muted = isDark ? 'rgba(250,250,250,0.65)' : '#555';
        const action = (label, onPress, a11y) => (
            <TouchableOpacity
                style={{margin: 5, minHeight: 32, justifyContent: 'center'}}
                accessibilityRole="button"
                accessibilityLabel={a11y}
                onPress={onPress}>
                <Text style={{color: link}}>{label}</Text>
            </TouchableOpacity>
        );
        return (
            <View style={styles.containerView}>
                <View style={[styles.card, {backgroundColor: isDark ? '#1C1C1C' : '#5555551F'}]}>
                    <View style={styles.cardContent}>
                        <Image source={Images.iconClock} style={styles.icon} />
                        <View style={styles.timeBlock}>
                            <Text style={[styles.timeRange, {color: isDark ? 'white' : '#1C1C1C'}]}>
                                {formatOnceRange(item.startAt, item.endAt, t)}
                            </Text>
                            <View style={styles.labelBlock}>
                                <Text style={[styles.everyday, {color: muted}]}>
                                    {onceStatusLabel(status)}
                                </Text>
                                <View
                                    style={[
                                        styles.dividerLine,
                                        {backgroundColor: isDark ? 'rgba(85, 85, 85, 0.35)' : '#D9D9D9'},
                                    ]}
                                />
                                <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end'}}>
                                    {status === 'PENDING' &&
                                        action(
                                            'Edit',
                                            () =>
                                                navigation.navigate(screens.EditScheduleTimeScreen, {
                                                    scheduleData: item,
                                                }),
                                            'Edit one-time schedule',
                                        )}
                                    {status === 'ACTIVE'
                                        ? action('End now', () => changeOnceSchedule({...item, status}, false), 'End one-time schedule now')
                                        : action('Delete', () => changeOnceSchedule({...item, status}, true), 'Delete one-time schedule')}
                                </View>
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        );
    };

    const renderCustomScheduleItem = ({item}) => {
        if (item.kind === SCHEDULE_TYPE.ONCE) {
            return renderOnceScheduleItem(item);
        }
        const isRunning = activeScheduleIds.includes(String(item.id));

        return (
            <View style={styles.containerView}>
                <View
                    style={[
                        styles.card,
                        {backgroundColor: isDark ? '#1C1C1C' : '#5555551F'},
                    ]}>
                    <View style={styles.cardContent}>
                        <Image source={Images.iconClock} style={styles.icon} />
                        <View style={styles.timeBlock}>
                            <Text
                                style={[
                                    styles.timeRange,
                                    {color: isDark ? 'white' : '#1C1C1C'},
                                ]}>
                                {convertTo24HourFormat(item.startTime)} -{' '}
                                {convertTo24HourFormat(item.endTime)}
                            </Text>

                            <View style={styles.labelBlock}>
                                <Text
                                    style={[
                                        styles.everyday,
                                        {
                                            color: isDark
                                                ? 'rgba(250,250,250,0.45)'
                                                : '#555',
                                        },
                                    ]}>
                                    {weeklyDaysLabel(item.days)}
                                </Text>

                                <View
                                    style={[
                                        styles.dividerLine,
                                        {
                                            backgroundColor: isDark
                                                ? 'rgba(85, 85, 85, 0.35)'
                                                : '#D9D9D9',
                                        },
                                    ]}
                                />

                                <View
                                    style={{
                                        flexDirection: 'row',
                                        width: wp('65%'),
                                        justifyContent: 'space-between',
                                    }}>
                                    <Text style={[styles.addSchedule, {color: link}]}>
                                        Add Schedule ＋
                                    </Text>

                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                        }}>
                                        <TouchableOpacity
                                            style={{margin: 5}}
                                            onPress={() => onPressEdit(item)}>
                                            <Text style={{color: link}}>
                                                Edit
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={{margin: 5}}
                                            onPress={() => {
                                                onPressDelete(item, isRunning);
                                            }}>
                                            <Text style={{color: link}}>
                                                Delete
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </View>
                        <Switch
                            value={item.enabled}
                            style={styles.toggleWrapper}
                            onValueChange={() => toggleSwitch(item.id)}
                            // trackColor={{false: '#444', true: '#ff9800'}}
                            trackColor={{false: '#444', true: '#ff9800'}}
                            thumbColor={item.enabled ? '#fff' : '#fff'}
                        />
                    </View>
                </View>
            </View>
        );
    };

    const renderMissedNotificationItem = ({item}) => (
        <View
            key={item.id}
            style={[
                styles.missedItem,
                {
                    backgroundColor: isDark ? '#222' : '#f6f6f6',
                },
            ]}>
            <Text
                style={[
                    styles.sender,
                    {
                        color: isDark ? 'white' : '#000',
                    },
                ]}>
                {item.name ? item.name : ''}
            </Text>
            <View style={styles.callRow}>
                <Text style={[styles.type, {color: '#aaa'}]}>
                    {item.type ? item.type : ''}
                </Text>
                <Text style={[styles.time, {color: '#aaa'}]}>
                    {item.time ? item.time : ''}
                </Text>
            </View>
        </View>
    );

    const capitalizeFirstLetter = name => {
        if (!name) return '';
        return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    };
    return (
        <ContainerView>
            <SafeAreaContainerView
                style={{
                    flex: 1,
                    backgroundColor: isDark ? '#111111' : '#ffffff',
                }}>
                <View
                    style={[
                        styles.container,
                        {backgroundColor: isDark ? '#111111' : '#fff'},
                    ]}>
                    <ScrollView
                        contentContainerStyle={[
                            styles.scrollContent,
                            {backgroundColor: isDark ? '#111111' : '#fff'},
                        ]}
                        showsVerticalScrollIndicator={false}>
                        {/* <View style={styles.container}>
                            <Text style={styles.title}>
                                {running ? 'Silent Mode ON' : 'Silent Mode OFF'}
                            </Text>
                            <Text style={styles.timer}>{timeLeft}</Text>
                        </View> */}
                        <Text
                            style={[
                                styles.greeting,
                                {color: isDark ? 'white' : '#000000'},
                            ]}>
                            {localize('SF1')}{' '}
                            {capitalizeFirstLetter(
                                Constants.commonConstant.appUser.username,
                            )}
                        </Text>
                        <Text
                            style={[
                                styles.subgreeting,
                                {color: isDark ? 'white' : '#000000'},
                            ]}>
                            {localize('SF2')}
                        </Text>

                        <TouchableOpacity
                            onPress={onPressSilentButton}
                            accessibilityRole="button"
                            accessibilityLabel={
                                silentActive
                                    ? 'Turn Silent Focus off'
                                    : 'Turn Silent Focus on'
                            }
                            style={styles.silentButtonWrapper}>
                            <ModernSilentButton
                                silentMode={silentActive}
                                timerFormatted={
                                    silenceEnd
                                        ? formatCountdown(
                                              (silenceEnd - now) / 1000,
                                          )
                                        : status.manualElapsed != null
                                            ? formatCountdown(status.manualElapsed)
                                            : 'ON'
                                }
                            />
                        </TouchableOpacity>
                        <View style={styles.engineStatus}>
                            <Text
                                style={[
                                    styles.engineStatusTitle,
                                    {color: isDark ? 'white' : '#1C1C1C'},
                                ]}>
                                {status.title}
                            </Text>
                            {!!status.detail && (
                                <Text style={styles.engineStatusDetail}>
                                    {status.detail}
                                </Text>
                            )}
                            {status.manualElapsed != null && (
                                <Text style={styles.engineStatusDetail}>
                                    Silent for {formatCountdown(status.manualElapsed)}
                                </Text>
                            )}
                            {!!status.next && (
                                <Text style={styles.engineStatusDetail}>
                                    {status.next}
                                </Text>
                            )}
                            {status.warning === 'DND_ACCESS_MISSING' && (
                                <TouchableOpacity
                                    onPress={openDndAccessSettings}
                                    style={styles.engineWarning}>
                                    <Text style={styles.engineWarningText}>
                                        Silent Focus can't control this phone
                                        without Do Not Disturb access. Tap to
                                        open Settings.
                                    </Text>
                                </TouchableOpacity>
                            )}
                            {!!status.locationIssue && (
                                <TouchableOpacity
                                    onPress={onPressLocationIssue}
                                    style={styles.engineWarning}>
                                    <Text style={styles.engineWarningText}>
                                        {status.locationIssue.message}
                                    </Text>
                                </TouchableOpacity>
                            )}
                            {!!status.calendarIssue && (
                                <TouchableOpacity
                                    onPress={onPressCalendarIssue}
                                    style={styles.engineWarning}>
                                    <Text style={styles.engineWarningText}>
                                        {status.calendarIssue.message}
                                    </Text>
                                </TouchableOpacity>
                            )}
                            {status.warning === 'EXACT_ALARM_MISSING' && (
                                <TouchableOpacity
                                    onPress={openExactAlarmSettings}
                                    style={styles.engineWarning}>
                                    <Text style={styles.engineWarningText}>
                                        Schedules may start a few minutes late.
                                        Tap to allow "Alarms & reminders".
                                    </Text>
                                </TouchableOpacity>
                            )}
                            <LearningSuggestionCard
                                manualOnCount={manualOnCount}
                            />
                        </View>
                        <View>
                            <Text
                                style={[
                                    styles.title,
                                    {color: isDark ? 'white' : '#1C1C1C'},
                                ]}>
                                SET A SCHEDULE
                            </Text>
                            <Text
                                style={[
                                    styles.description,
                                    {color: isDark ? '#FAFAFA' : '#1C1C1C'},
                                ]}>
                                Have the Silent Focus turn on automatically at a
                                set time
                            </Text>
                            <FlatList
                                key={'scheduleData'}
                                // Legacy rows the old Home created from calendar
                                // events; calendar automation now reads the
                                // device calendar directly.
                                data={[
                                    ...arrayEvents.filter(
                                        item => item.eventType !== 'calendar',
                                    ),
                                    ...onceRows,
                                ]}
                                keyExtractor={item => item.id.toString()}
                                renderItem={renderCustomScheduleItem}
                                extraData={[arrayEvents, onceRows, now, engineState]}
                                keyboardShouldPersistTaps={'handled'}
                                scrollEnabled={false}
                                ListEmptyComponent={
                                    isLoading ? null : scheduleLoadError ? (
                                        <TouchableOpacity
                                            onPress={() => {
                                                setIsLoading(true);
                                                getScheduleApiCall();
                                            }}
                                            accessibilityRole="button">
                                            <Text style={styles.scheduleEmpty}>
                                                Couldn't load your schedules.
                                                Saved schedules keep running on
                                                this phone. Tap to retry.
                                            </Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <Text style={styles.scheduleEmpty}>
                                            No schedules yet. Tap + to add one.
                                        </Text>
                                    )
                                }
                            />
                        </View>
                        {/* {silentMode ? (
                            timer > 0 && (
                                <View style={styles.missedSection}>
                                    <Text
                                        style={[
                                            styles.missedTitle,
                                            {color: isDark ? 'white' : '#000'},
                                        ]}>
                                        Missed Notification
                                    </Text>
                                    <Text style={[styles.seeAll, {color: link}]}>See all</Text>
                                    <FlatList
                                        key={'notificationData'}
                                        data={dummyNotifications}
                                        keyExtractor={item => item.id}
                                        renderItem={
                                            renderMissedNotificationItem
                                        }
                                        extraData={dummyNotifications}
                                        keyboardShouldPersistTaps={'handled'}
                                        showsVerticalScrollIndicator={false}
                                        showsHorizontalScrollIndicator={false}
                                        scrollEnabled={false}
                                    />
                                </View>
                            )
                        ) : (
                            <View>
                                <Text
                                    style={[
                                        styles.title,
                                        {color: isDark ? 'white' : '#1C1C1C'},
                                    ]}>
                                    SET A SCHEDULE
                                </Text>
                                <Text
                                    style={[
                                        styles.description,
                                        {color: isDark ? '#FAFAFA' : '#1C1C1C'},
                                    ]}>
                                    Have the Silent Focus turn on automatically
                                    at a set time
                                </Text>
                                <FlatList
                                    key={'scheduleData'}
                                    data={data}
                                    keyExtractor={item => item.id.toString()}
                                    renderItem={renderCustomScheduleItem}
                                    extraData={data}
                                    keyboardShouldPersistTaps={'handled'}
                                    scrollEnabled={false}
                                />
                            </View>
                        )} */}
                    </ScrollView>
                </View>
                <View style={styles.addNewScheduleView}>
                    <TouchableOpacity
                        onPress={onPressAddNewSchedule}
                        accessibilityRole="button"
                        accessibilityLabel="Add schedule"
                        testID="home-add-schedule"
                        style={styles.addNewScheduleTouchableOpacity}>
                        <Image
                            source={Images.iconPlus}
                            style={styles.addNewScheduleImage}
                            resizeMode={'contain'}
                        />
                    </TouchableOpacity>
                </View>
            </SafeAreaContainerView>
            <CustomLoader isLoading={isLoading} />
        </ContainerView>
    );
}

const styles = StyleSheet.create({
    scheduleEmpty: {
        fontSize: wp('3.6%'),
        color: '#777',
        textAlign: 'center',
        marginVertical: hp('2%'),
        paddingHorizontal: wp('6%'),
    },
    container: {
        flex: 1,
        paddingTop: hp('1%'),
        paddingHorizontal: wp('5%'),
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: hp('12%'),
        paddingTop: hp('2%'),
    },
    scrollContainer: {
        paddingTop: 20,
        paddingBottom: 20,
    },
    title: {
        fontSize: wp('3.4%'),
        fontFamily: 'Roboto',
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: hp('0.6%'),
        marginTop: hp('-0.6%'),
    },
    description: {
        fontSize: wp('3.3%'),
        fontFamily: 'Roboto',
        fontWeight: '400',
        marginBottom: hp('1.5%'),
    },
    greeting: {
        fontSize: wp('7%'),
        fontWeight: '600',
        fontFamily: 'Roboto',
        marginTop: hp('2%'),
    },

    silentButtonWrapper: {
        alignItems: 'center',
        marginVertical: hp('4%'),
    },
    callRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: hp('0.5%'),
    },
    missedSection: {
        marginTop: hp('1%'),
    },
    missedTitle: {
        fontSize: wp('4.5%'),
        fontWeight: '600',
        fontFamily: 'Roboto',
    },
    seeAll: {
        position: 'absolute',
        right: 0,
        top: 0,
        color: '#D6721E',
        fontSize: wp('3.5%'),
        fontWeight: '600',
        fontFamily: 'Roboto',
    },
    missedItem: {
        marginTop: hp('2%'),
        borderRadius: wp('3%'),
        padding: wp('4%'),
        fontFamily: 'Roboto',
    },
    sender: {
        fontWeight: '700',
        fontSize: wp('4.2%'),
    },
    type: {
        fontSize: wp('3.2%'),
    },
    time: {
        fontSize: wp('3.2%'),
        textAlign: 'right',
        fontFamily: 'Roboto',
    },
    scheduleSection: {
        marginTop: hp('2%'),
    },
    containerView: {
        paddingHorizontal: wp('3%'),
        marginBottom: hp('2.5%'),
    },
    card: {
        borderRadius: wp('4.5%'),
        padding: wp('5%'),
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    timeBlock: {
        flex: 1,
        marginLeft: wp('4%'),
    },
    timeRange: {
        fontSize: wp('4%'),
        fontWeight: '600',
        fontFamily: 'Roboto',
    },
    labelBlock: {
        marginTop: hp('0.7%'),
    },
    everyday: {
        fontSize: wp('3.2%'),
        fontFamily: 'Roboto',
        marginBottom: hp('0.8%'),
    },
    dividerLine: {
        width: wp('65%'),
        height: 1,
        marginVertical: hp('0.5%'),
    },
    addSchedule: {
        fontSize: wp('3.3%'),
        fontWeight: '500',
        fontFamily: 'Roboto',
        marginTop: hp('0.8%'),
        color: '#D6721E',
    },
    toggleWrapper: {
        marginTop: hp('0.8%'),
        alignSelf: 'flex-start',
    },
    icon: {
        width: 22,
        height: 22,
        tintColor: '#ff9800',
        marginRight: 8,
    },
    addNewScheduleView: {
        position: 'absolute',
        // SafeAreaContainerView already places this screen above the system
        // navigation inset. Offset from the *visible* tab bar, not a scaled
        // screen height, so the entire 60dp action remains above it on both
        // gesture and 3-button Android navigation.
        bottom: getFloatingActionBottomOffset(),
        right: 0,
        marginRight: width(10),
        zIndex: 101,
        elevation: 101,
    },
    addNewScheduleTouchableOpacity: {
        justifyContent: 'center',
        alignItems: 'center',
        width: width(60),
        height: width(60),
        backgroundColor: Colors.themeColor,
        borderRadius: width(30),
    },
    addNewScheduleImage: {
        width: width(20),
        height: width(20),
        tintColor: Colors.white,
    },
    timer: {fontSize: 32, fontWeight: 'bold'},
    engineStatus: {
        alignItems: 'center',
        marginBottom: hp('2%'),
    },
    engineStatusTitle: {
        fontSize: wp('4.2%'),
        fontWeight: '600',
    },
    engineStatusDetail: {
        fontSize: wp('3.4%'),
        color: '#888',
        marginTop: hp('0.4%'),
        textAlign: 'center',
    },
    engineWarning: {
        marginTop: hp('1%'),
        paddingVertical: hp('1%'),
        paddingHorizontal: wp('4%'),
        borderRadius: wp('3%'),
        backgroundColor: '#FDECEA',
    },
    engineWarningText: {
        color: '#B3261E',
        fontSize: wp('3.3%'),
        textAlign: 'center',
    },
});
