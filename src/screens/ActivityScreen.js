import React, {useState, useEffect} from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    useColorScheme,
    FlatList,
    Platform,
    NativeEventEmitter,
    NativeModules,
} from 'react-native';
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {SafeAreaView} from 'react-native-safe-area-context';
import CallIcon from '../assets/svgs/Call';
import MessageIcon from '../assets/svgs/Message';
import CrossIcon from '../assets/svgs/CrossButton';
import CallLogs from 'react-native-call-log';
import SmsAndroid from 'react-native-get-sms-android';
import {Image} from 'react-native-svg';
import {useIsFocused} from '@react-navigation/native';
import {showAlert} from '../function/Alert';
import {Constants} from '../utils/theme';
import EndPoints from '../utils/api/endpoints';
import APICall from '../utils/api/api';
import CustomLoader from '../componentes/CustomLoader/CustomLoader';

const ActivityCenterScreen = () => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const background = isDark ? '#111' : '#fff';
    const isFocused = useIsFocused();
    const [logs, setLogs] = useState([]);
    const [arrayEvents, setArrayEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // useEffect(() => {
    //     const eventEmitter = new NativeEventEmitter(
    //         NativeModules.RNAndroidNotificationListener,
    //     );
    //     const subscription = eventEmitter.addListener(
    //         'notificationPosted',
    //         notification => {
    //             try {
    //                 const parsed = JSON.parse(notification);
    //                 console.log('FOREGROUND_NOTIFICATION ===>', parsed);

    //                 if (parsed.package === 'com.whatsapp') {
    //                     const title = parsed.title?.toLowerCase() || '';
    //                     const text = parsed.text?.toLowerCase() || '';

    //                     if (
    //                         title.includes('missed voice call') ||
    //                         text.includes('missed voice call') ||
    //                         text.includes('missed video call')
    //                     ) {
    //                         console.log(
    //                             'WHATSAPP MISSED CALL DETECTED ===>',
    //                             parsed,
    //                         );
    //                     }
    //                 }
    //             } catch (err) {
    //                 console.error(err);
    //             }
    //         },
    //     );

    //     return () => subscription.remove();
    // }, []);

    // useEffect(() => {
    //     const subscription = RNAndroidNotificationListener.addEventListener(
    //         RNAndroidNotificationListenerHeadlessJsName,
    //         notification => {
    //             try {
    //                 const parsed = JSON.parse(notification);
    //                 console.log('RAW_NOTIFICATION ===>', parsed);

    //                 // WhatsApp missed call detection
    //                 if (parsed.package === 'com.whatsapp') {
    //                     const title = parsed.title?.toLowerCase() || '';
    //                     const text = parsed.text?.toLowerCase() || '';

    //                     if (
    //                         title.includes('missed voice call') ||
    //                         text.includes('missed voice call') ||
    //                         text.includes('missed video call')
    //                     ) {
    //                         console.log(
    //                             'WHATSAPP MISSED CALL DETECTED ===>',
    //                             parsed,
    //                         );
    //                     }
    //                 }
    //             } catch (error) {
    //                 console.error('Failed to parse notification:', error);
    //             }
    //         },
    //     );

    //     return () => subscription.remove();
    // }, []);

    const fetchMissedCalls = async events => {
        try {
            const logs = await CallLogs.loadAll();
            console.log('CALL__logs====', logs);

            const today = new Date();
            today.setHours(0, 0, 0, 0); // Start of today

            const missedCalls = logs
                .filter(log => {
                    const logTimestamp = Number(log.timestamp);

                    // Check today's date
                    const logDate = new Date(logTimestamp);
                    if (logDate < today) return false;

                    // Check if log falls within ANY event time
                    return (
                        log.type === 'MISSED' &&
                        isWithinEventTime(logTimestamp, events)
                    );
                })
                .map(log => ({
                    id: `call-${log.timestamp}`,
                    name: log.name || log.phoneNumber,
                    type: 'CALL',
                    time: formatTime(log.timestamp),
                    timestamp: log.timestamp,
                }));

            return missedCalls;
        } catch (e) {
            console.error('Error fetching call logs:', e);
            return [];
        }
    };

    const fetchSMS = events => {
        return new Promise(resolve => {
            SmsAndroid.list(
                JSON.stringify({
                    box: 'inbox',
                    maxCount: 50,
                }),
                fail => {
                    console.log('Failed to fetch SMS:', fail);
                    resolve([]);
                },
                (count, smsList) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    const messages = JSON.parse(smsList)
                        .filter(msg => {
                            const msgTimestamp = Number(msg.date);

                            // Only today's SMS
                            const msgDate = new Date(msgTimestamp);
                            if (msgDate < today) return false;

                            // Check if falls in event time
                            return isWithinEventTime(msgTimestamp, events);
                        })
                        .map(msg => ({
                            id: `sms-${msg._id}`,
                            name: msg.address,
                            type: 'SMS',
                            time: formatTime(msg.date),
                            timestamp: msg.date,
                        }));

                    resolve(messages);
                },
            );
        });
    };

    const formatTime = timestamp => {
        const now = Date.now();
        const diff = Math.floor((now - timestamp) / 60000);
        if (diff < 60) return `${diff} min ago`;
        if (diff < 1440) return `${Math.floor(diff / 60)} hrs ago`;
        return `${Math.floor(diff / 1440)} days ago`;
    };

    const fetchLogs = async () => {
        if (Platform.OS !== 'android') {
            console.log('Call and SMS fetching only supported on Android');
            return;
        }
        setIsLoading(true);
        // Make sure events are loaded
        if (!arrayEvents || arrayEvents.length === 0) {
            console.log('No events available to filter logs');
            setIsLoading(false);
            return;
        }

        const missedCalls = await fetchMissedCalls(arrayEvents);
        const sms = await fetchSMS(arrayEvents);

        // Merge and sort
        const combined = [...missedCalls, ...sms].sort(
            (a, b) => Number(b.timestamp) - Number(a.timestamp),
        );

        setLogs(combined);
        setIsLoading(false);
    };

    const convertToTodayTimestamp = timeStr => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const today = new Date();
        today.setHours(hours, minutes, 0, 0);
        return today.getTime();
    };

    const isWithinEventTime = (timestamp, events) => {
        const now = Date.now();

        return events.some(event => {
            const startTimestamp = convertToTodayTimestamp(event.startTime);
            const endTimestamp = convertToTodayTimestamp(event.endTime);

            // Ignore upcoming events (enabled but not started yet)
            if (event.enabled && now < startTimestamp) return false;

            // Include events that are past or currently active
            return timestamp >= startTimestamp && timestamp <= endTimestamp;
        });
    };

    // // Check if timestamp falls inside any event range
    // const isWithinEventTime = (timestamp, events) => {
    //     return events.some(event => {
    //         if (!event.enabled) return false; // Skip disabled events

    //         const startTimestamp = convertToTodayTimestamp(event.startTime);
    //         const endTimestamp = convertToTodayTimestamp(event.endTime);

    //         return timestamp >= startTimestamp && timestamp <= endTimestamp;
    //     });
    // };

    useEffect(() => {
        if (isFocused) {
            getScheduleApiCall();
        }
    }, [isFocused]);

    const getScheduleApiCall = async () => {
        const url = EndPoints.getScheduleTimerData;
        const payload = {
            userId: Constants.commonConstant.appUserId,
        };

        await APICall('get', payload, url).then(response => {
            if (
                response?.statusCode === Constants.apiStatusCode.success &&
                response?.data
            ) {
                const responseData = response?.data;
                if (responseData?.status === '1') {
                    if (
                        responseData?.result &&
                        responseData?.result?.length > 0
                    ) {
                        const formattedData = responseData.result.map(
                            (item, index) => ({
                                id: item.schedule_id || index,
                                startTime: item.from_time || '00:00',
                                endTime: item.to_time || '00:00',
                                days: item.selected_days || 'Everyday',
                                enabled: item.isTimerEnabled === true || false,
                            }),
                        );

                        setArrayEvents(formattedData);
                        console.log('EVENT_DATA====', formattedData);
                    } else {
                        setArrayEvents([]);
                    }
                } else if (responseData?.status === '0') {
                    showAlert(
                        Constants.commonConstant.appName,
                        responseData?.message,
                    );
                }
            } else if (
                response?.statusCode === Constants.apiStatusCode.invalidContent
            ) {
                const errorData = response?.data;
                showAlert(Constants.commonConstant.appName, errorData?.detail);
            } else if (
                response?.statusCode ===
                Constants.apiStatusCode.unprocessableContent
            ) {
                const errorData = response?.data?.detail[0];
                showAlert(Constants.commonConstant.appName, errorData?.msg);
            } else if (
                response?.statusCode === Constants.apiStatusCode.serverError
            ) {
                showAlert(
                    Constants.commonConstant.appName,
                    'Internal Server Error',
                );
            }
        });
    };

    useEffect(() => {
        if (arrayEvents.length > 0) {
            fetchLogs();
        }
    }, [arrayEvents]);

    const handleClearAll = () => {
        setLogs([]);
    };

    const handleDelete = id => {
        setLogs(prev => prev.filter(item => item.id !== id));
    };

    const renderIcon = type => {
        if (type === 'CALL') return <CallIcon color="#fff" />;
        if (type === 'SMS' || type === 'WHATSAPP')
            return <MessageIcon color="#fff" />;
        return <View style={styles.defaultIcon} />;
    };

    const renderItem = ({item}) => (
        <View style={styles.cardWrapper}>
            <View
                style={[
                    styles.card,
                    {
                        backgroundColor: isDark
                            ? 'rgba(85,85,85,0.12)'
                            : '#eeeeee',
                    },
                ]}>
                <View
                    style={[
                        styles.avatar,
                        {
                            backgroundColor: isDark ? '#999' : '#ffff',
                            justifyContent: 'center',
                            alignItems: 'center',
                        },
                    ]}>
                    {item.profilePic ? (
                        <Image
                            source={{uri: item.profilePic}}
                            style={styles.avatarImage}
                            resizeMode="cover"
                        />
                    ) : (
                        <Text style={styles.avatarLetter}>
                            {item.name
                                ? item.name.charAt(0).toUpperCase()
                                : '?'}
                        </Text>
                    )}
                </View>
                <View style={styles.textBlock}>
                    <Text
                        style={[
                            styles.name,
                            {color: isDark ? '#fff' : '#1a1a1a'},
                        ]}>
                        {item.name}
                    </Text>
                    <Text
                        style={[
                            styles.subText,
                            {color: isDark ? '#aaa' : '#555'},
                        ]}>
                        {item.type}
                    </Text>
                </View>

                <Text style={[styles.time, {color: isDark ? '#aaa' : '#555'}]}>
                    {item.time}
                </Text>

                <View style={styles.iconWrapper}>{renderIcon(item.type)}</View>
            </View>

            <TouchableOpacity
                onPress={() => handleDelete(item.id)}
                style={[
                    styles.crossBtn,
                    {backgroundColor: isDark ? '#000' : '#222'},
                ]}>
                <CrossIcon width={wp('4%')} height={wp('4%')} color="#fff" />
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView style={{flex: 1, backgroundColor: background}}>
            <View style={[styles.container, {backgroundColor: background}]}>
                <Text style={[styles.title, {color: '#D6721E'}]}>
                    Activity Center
                </Text>

                {/* Clear All Button */}
                {logs.length > 0 && (
                    <View style={styles.clearAllWrapper}>
                        <TouchableOpacity onPress={handleClearAll}>
                            <Text
                                style={[
                                    styles.clearAll,
                                    {
                                        backgroundColor: isDark
                                            ? '#000'
                                            : '#222',
                                        color: '#fff',
                                    },
                                ]}>
                                Clear All
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* FlatList for Logs */}
                <FlatList
                    data={logs}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    ListEmptyComponent={
                        !isLoading && (
                            <Text style={styles.emptyText}>
                                No activity found
                            </Text>
                        )
                    }
                    contentContainerStyle={{paddingBottom: hp('12%')}}
                />
            </View>
            <CustomLoader isLoading={isLoading} />
        </SafeAreaView>
    );
};

export default ActivityCenterScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: hp('1%'),
        paddingHorizontal: wp('5%'),
    },
    title: {
        fontSize: wp('5.5%'),
        fontWeight: '700',
        alignSelf: 'center',
        marginBottom: hp('1.5%'),
    },
    clearAllWrapper: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginBottom: hp('1%'),
    },
    clearAll: {
        fontSize: wp('3%'),
        paddingVertical: hp('0.5%'),
        paddingHorizontal: wp('4%'),
        borderRadius: wp('3%'),
    },
    cardWrapper: {
        width: wp('90%'),
        minHeight: hp('11%'),
        alignSelf: 'center',
        position: 'relative',
        marginBottom: hp('2%'),
    },
    card: {
        flex: 1,
        borderRadius: wp('4%'),
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: wp('4%'),
    },
    avatar: {
        width: wp('10%'),
        height: wp('10%'),
        borderRadius: wp('1%'),
        marginRight: wp('3%'),
    },
    textBlock: {
        flex: 1,
        justifyContent: 'center',
    },
    name: {
        fontSize: wp('3.8%'),
        fontWeight: '600',
    },
    subText: {
        fontSize: wp('3.2%'),
        marginTop: hp('0.3%'),
    },
    time: {
        fontSize: wp('3%'),
        marginRight: wp('2%'),
    },
    iconWrapper: {
        backgroundColor: '#D6721E',
        borderRadius: wp('6%'),
        padding: wp('2%'),
        justifyContent: 'center',
        alignItems: 'center',
    },
    crossBtn: {
        position: 'absolute',
        top: hp(1),
        right: hp('1%'),
        width: wp('6%'),
        height: wp('6%'),
        borderRadius: wp('3%'),
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    defaultIcon: {
        width: wp('4%'),
        height: wp('4%'),
        backgroundColor: '#fff',
        borderRadius: wp('2%'),
    },
    emptyText: {
        textAlign: 'center',
        fontSize: wp('4%'),
        color: '#888',
        marginTop: hp('5%'),
    },
});
