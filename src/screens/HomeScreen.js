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
    NativeModules,
    Platform,
    Alert,
} from 'react-native';

// Lib
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {useNavigation, useRoute} from '@react-navigation/native';
import ReactNativeCalendarEvents from 'react-native-calendar-events';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundService from 'react-native-background-actions';
import moment from 'moment';

// Component
import ModernSilentButton from '../componentes/ModernSilentButton';
import ContainerView from '../componentes/ContainerView/ContainerView';
import SafeAreaContainerView from '../componentes/SafeAreaContainerView/SafeAreaContainerView';

// Misc Constants
import {Colors, Images} from '../utils/theme';
import screens from '../utils/theme/screens';
import {height, localize, width} from '../function/commonFunctions';

export default function HomeScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const [silentMode, setSilentMode] = useState(false);
    const [timer, setTimer] = useState(900);
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const [arrayEvents, setArrayEvents] = useState([
        {
            id: '1',
            start: '23:40',
            end: '23:55',
            days: 'Everyday',
            enabled: true,
        },
        {
            id: '2',
            start: '10:00',
            end: '18:00',
            days: 'Weekdays',
            enabled: false,
        },
    ]);
    const {SilentFocus} = NativeModules;
    const [timeLeft, setTimeLeft] = useState('00:00:00');
    const [running, setRunning] = useState(false);

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

    // useEffect
    useEffect(() => {
        let interval;
        if (silentMode && timer > 0) {
            interval = setInterval(() => setTimer(prev => prev - 1), 1000);
        }
        return () => clearInterval(interval);
    }, [silentMode, timer]);

    useEffect(() => {
        if (route.params?.newSchedule) {
            console.log('useEffect logs=======', route.params?.newSchedule);
            // setData(prevData => [...prevData, route.params.newSchedule]);
        }
    }, [route.params?.newSchedule]);

    useEffect(() => {
        console.log('useEffect logs=======', 'called useffect');
        loadEvents();
    }, []);

    const loadEvents = async () => {
        const startDate = new Date().toISOString();
        const endDate = new Date(
            new Date().setDate(new Date().getDate() + 7),
        ).toISOString();

        const fetchedEvents = await ReactNativeCalendarEvents.fetchAllEvents(
            startDate,
            endDate,
        );

        console.log('fetchedEvents=======', fetchedEvents);
        // Add into FlatList data
        addCalendarEventsToData(fetchedEvents);
    };

    const addCalendarEventsToData = events => {
        const formattedEvents = events.map(convertEventToSchedule);

        // merge custom schedules + calendar schedules
        // setData(prev => [...prev, ...formattedEvents]);
    };

    const convertEventToSchedule = event => {
        return {
            id: event.id, // use calendar event id
            start: moment(event.startDate).format('hh:mm A'),
            end: moment(event.endDate).format('hh:mm A'),
            days: event.allDay
                ? 'All Day'
                : moment(event.startDate).format('dddd'),
            enabled: false, // calendar events are usually active
            title: event.title,
        };
    };

    const convertTo24HourFormat = time => {
        return moment(time, ['HH:mm ']).format('h:mm A');
    };

    // Function
    const toggleSilentMode = () => {
        setSilentMode(prevSilentMode => {
            if (!prevSilentMode) {
                setTimer(900); // Reset to 15 minutes
            } else {
                setTimer(0); // Stop timer when turning off
            }
            return !prevSilentMode;
        });
    };

    const ensureAccess = async () => {
        if (Platform.OS !== 'android') {
            Alert.alert('Not supported', 'This feature works only on Android.');
            return false;
        }
        const ok = await SilentFocus.hasDndAccess();
        if (!ok) {
            Alert.alert(
                'Permission required',
                'To change ringer mode, grant “Do Not Disturb” access to this app.',
                [
                    {text: 'Cancel', style: 'cancel'},
                    {
                        text: 'Open Settings',
                        onPress: () => SilentFocus.openDndAccessSettings(),
                    },
                ],
            );
            return false;
        }
        return true;
    };
    useEffect(() => {
        let interval;
        if (silentMode && timer > 0) {
            interval = setInterval(() => {
                setTimer(prev => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        handleTimerComplete();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [silentMode, timer]);

    const handleTimerComplete = async () => {
        console.log('Timer ended, switching back to NORMAL mode');
        await setPhoneNormal();
        setSilentMode(false);
        setRunning(false);
        await BackgroundService.stop();
    };

    const setPhoneSilent = async () => {
        if (!(await ensureAccess())) return;
        await SilentFocus.setSilent();
        console.log('Phone set to SILENT mode');
    };

    const setPhoneNormal = async () => {
        if (!(await ensureAccess())) return;
        await SilentFocus.setNormal();
        console.log('Phone set to NORMAL mode');
    };

    const toggleSwitch = async id => {
        // const updatedData = arrayEvents.map(item =>
        //     item.id === id ? {...item, enabled: !item.enabled} : item,
        // );
        // setArrayEvents(updatedData);

        // const selectedSchedule = updatedData.find(item => item.id === id);

        // if (selectedSchedule?.enabled) {
        // Turn ON Silent Mode
        console.log('Silent mode ON for scheduled timer');
        await setPhoneSilent();
        setSilentMode(true);
        setTimer(900); // Reset timer to 15 min
        setRunning(true);

        BackgroundService.start(backgroundTask, {
            taskName: 'SilentTimer',
            taskTitle: 'Silent Timer Running',
            taskDesc: 'Tracking scheduled silent mode timer',
            taskIcon: {name: 'ic_launcher', type: 'mipmap'},
            parameters: {delay: 1000},
            foregroundServiceType: 'dataSync',
        });
        // } else {
        //     // Turn OFF manually
        //     console.log('Silent mode manually turned OFF');
        //     await setPhoneNormal();
        //     setSilentMode(false);
        //     setRunning(false);
        //     await BackgroundService.stop();
        // }
    };

    const getTimestamp = timeStr => {
        const [h, m] = timeStr.split(':').map(Number);
        const now = new Date();
        now.setHours(h, m, 0, 0);
        return now.getTime();
    };

    const formatTime = ms => {
        let totalSec = Math.floor(ms / 1000);
        let h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
        let m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
        let s = String(totalSec % 60).padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    const checkAndRunTimer = async () => {
        if (arrayEvents && arrayEvents.length > 0) {
            const now = Date.now();
            let activeEvent = null;

            for (const event of arrayEvents) {
                const start = getTimestamp(event.start);
                const end = getTimestamp(event.end);

                console.log('start =====', start);
                console.log('end =====', end);
                console.log('now =====', now);
                console.log('event.enabled', event.enabled);

                if (event.enabled && now >= start && now <= end) {
                    activeEvent = {start, end};
                    break;
                } else {
                    console.log('Else calll');
                }
            }

            console.log('activeEvent =====', activeEvent);

            if (activeEvent) {
                setRunning(true);
                const remaining = activeEvent.end - now;
                setTimeLeft(formatTime(remaining));

                await AsyncStorage.setItem(
                    'timer_state',
                    JSON.stringify(activeEvent),
                );

                // Ensure phone goes to silent mode
                // await setPhoneSilent();
            } else {
                setRunning(false);
                setTimeLeft('00:00:00');
                await AsyncStorage.removeItem('timer_state');

                // Ensure phone goes back to normal
                // await setPhoneNormal();
            }
        }
    };

    // const checkAndRunTimer = async () => {
    //     const start = getTimestamp(event.startTime);
    //     const end = getTimestamp(event.endTime);
    //     const now = Date.now();

    //     if (event.enabled && now >= start && now <= end) {
    //         setRunning(true);
    //         const remaining = end - now;
    //         setTimeLeft(formatTime(remaining));
    //         await AsyncStorage.setItem(
    //             'timer_state',
    //             JSON.stringify({start, end}),
    //         );
    //     } else {
    //         setRunning(false);
    //         setTimeLeft('00:00:00');
    //         await AsyncStorage.removeItem('timer_state');
    //     }
    // };

    const restoreState = async () => {
        const saved = await AsyncStorage.getItem('timer_state');
        if (saved) {
            const {start, end} = JSON.parse(saved);
            if (Date.now() >= start && Date.now() <= end) {
                setRunning(true);
                const remaining = end - Date.now();
                setTimeLeft(formatTime(remaining));
            }
        }
    };

    const backgroundTask = async ({delay}) => {
        for (;;) {
            await new Promise(r => setTimeout(r, delay));
            await checkAndRunTimer();
        }
    };
    // useEffect(() => {
    //     restoreState();

    //     BackgroundService.start(backgroundTask, {
    //         taskName: 'SilentTimer',
    //         taskTitle: 'Silent Timer Running',
    //         taskDesc: 'Tracking scheduled silent mode timer',
    //         taskIcon: {name: 'ic_launcher', type: 'mipmap'},
    //         parameters: {delay: 1000},
    //         foregroundServiceType: 'dataSync',
    //     });

    //     return () => BackgroundService.stop();
    // }, []);

    const onPressAddNewSchedule = () => {
        navigation.navigate(screens.ScheduleTimeScreen);
    };

    // Render Component
    const renderCustomScheduleItem = ({item}) => (
        <View style={styles.containerView}>
            <View
                style={[
                    styles.card,
                    {backgroundColor: isDark ? '#1C1C1C' : '#5555551F'},
                ]}>
                <View style={styles.cardContent}>
                    <Image
                        source={Images.iconClock} // 👈 put your image in assets folder
                        style={styles.icon}
                    />
                    <View style={styles.timeBlock}>
                        <Text
                            style={[
                                styles.timeRange,
                                {color: isDark ? 'white' : '#1C1C1C'},
                            ]}>
                            {convertTo24HourFormat(item.start)} -{' '}
                            {convertTo24HourFormat(item.end)}
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
                                {item.days}
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

                            <Text style={styles.addSchedule}>
                                Add Schedule ＋
                            </Text>
                        </View>
                    </View>
                    <Switch
                        value={item.enabled}
                        style={styles.toggleWrapper}
                        onValueChange={() => toggleSwitch(item.id)}
                        trackColor={{false: '#444', true: '#ff9800'}}
                        thumbColor={item.enabled ? '#fff' : '#fff'}
                    />
                </View>
            </View>
        </View>
    );

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
                            Hi Shipraaa
                        </Text>
                        <Text
                            style={[
                                styles.subgreeting,
                                {color: isDark ? 'white' : '#000000'},
                            ]}>
                            {localize('SF2')}
                        </Text>

                        <TouchableOpacity
                            onPress={toggleSilentMode}
                            style={styles.silentButtonWrapper}>
                            <ModernSilentButton
                                silentMode={silentMode}
                                timerFormatted={
                                    running ? timeLeft : formatTime(timer)
                                }
                            />
                        </TouchableOpacity>
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
                                data={arrayEvents}
                                keyExtractor={item => item.id.toString()}
                                renderItem={renderCustomScheduleItem}
                                extraData={arrayEvents}
                                keyboardShouldPersistTaps={'handled'}
                                scrollEnabled={false}
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
                                    <Text style={styles.seeAll}>See all</Text>
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
                        style={styles.addNewScheduleTouchableOpacity}>
                        <Image
                            source={Images.iconPlus}
                            style={styles.addNewScheduleImage}
                            resizeMode={'contain'}
                        />
                    </TouchableOpacity>
                </View>
            </SafeAreaContainerView>
        </ContainerView>
    );
}

const styles = StyleSheet.create({
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
        bottom: 0,
        right: 0,
        marginBottom: height(100),
        marginRight: width(10),
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
});
