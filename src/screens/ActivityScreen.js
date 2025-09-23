import React, {useState, useEffect} from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    useColorScheme,
    FlatList,
    Platform,
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

const ActivityCenterScreen = () => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const background = isDark ? '#111' : '#fff';

    const [logs, setLogs] = useState([]);

    /* -------------------- FETCH CALL LOGS -------------------- */
    const fetchMissedCalls = async () => {
        try {
            const logs = await CallLogs.loadAll();
            console.log('CALL__logs====', logs);
            const missedCalls = logs
                .filter(log => log.type === 'MISSED') // Only missed calls
                .map(log => ({
                    id: `call-${log.timestamp}`,
                    name: log.name || log.phoneNumber,
                    type: 'CALL',
                    time: formatTime(log.timestamp),
                }));
            return missedCalls;
        } catch (e) {
            console.error('Error fetching call logs:', e);
            return [];
        }
    };

    /* -------------------- FETCH SMS -------------------- */
    const fetchSMS = () => {
        return new Promise(resolve => {
            SmsAndroid.list(
                JSON.stringify({
                    box: 'inbox', // inbox or sent
                    maxCount: 20,
                }),
                fail => {
                    console.log('Failed to fetch SMS:', fail);
                    resolve([]);
                },
                (count, smsList) => {
                    const messages = JSON.parse(smsList).map(msg => ({
                        id: `sms-${msg._id}`,
                        name: msg.address,
                        type: 'SMS',
                        time: formatTime(msg.date),
                    }));
                    resolve(messages);
                },
            );
        });
    };

    /* -------------------- FORMAT TIME -------------------- */
    const formatTime = timestamp => {
        const now = Date.now();
        const diff = Math.floor((now - timestamp) / 60000); // difference in minutes
        if (diff < 60) return `${diff} min ago`;
        if (diff < 1440) return `${Math.floor(diff / 60)} hrs ago`;
        return `${Math.floor(diff / 1440)} days ago`;
    };

    /* -------------------- COMBINED FETCH -------------------- */
    const fetchLogs = async () => {
        if (Platform.OS !== 'android') {
            console.log('Call and SMS fetching only supported on Android');
            return;
        }

        const missedCalls = await fetchMissedCalls();
        const sms = await fetchSMS();

        // Merge and sort by most recent
        const combined = [...missedCalls, ...sms].sort(
            (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
        );

        setLogs(combined);
    };

    useEffect(() => {
        fetchLogs();
    }, []);

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
                        <Text style={styles.emptyText}>No activity found</Text>
                    }
                    contentContainerStyle={{paddingBottom: hp('12%')}}
                />
            </View>
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
