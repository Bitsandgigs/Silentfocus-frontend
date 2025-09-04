import {useState} from 'react';
import {
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useColorScheme,
    View,
} from 'react-native';

// Lib
import {useNavigation} from '@react-navigation/native';
import moment from 'moment';

// Component
import ContainerView from '../componentes/ContainerView/ContainerView';
import SafeAreaContainerView from '../componentes/SafeAreaContainerView/SafeAreaContainerView';
import CustomTextInputView from '../componentes/CustomTextInputView/CustomTextInputView';

// Misc Constants
import {
    convertTo24HourFormat,
    height,
    localize,
    width,
} from '../function/commonFunctions';
import BackIcon from '../assets/svgs/Back';
import {Colors, Images, Responsive} from '../utils/theme';
import CustomDateTimePicker from '../componentes/CustomDateTimePicker/CustomDateTimePicker';
import {showAlert} from '../function/Alert';
import CustomButton from '../componentes/CustomButton/CustomButton';

export default function ScheduleTimeScreen() {
    // navigation
    const navigation = useNavigation();

    // Variable
    const isDark = useColorScheme() === 'dark';

    // Array
    const arrDaysOfWeek = [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
    ];

    // useState
    const [arraySelectedDays, setArraySelectedDays] = useState([]);

    const [fromTime, setFromTime] = useState(
        moment(moment().format('YYYY-MM-DD') + ' ' + '08:00')
            .utc()
            .toDate(),
    );
    const [isFromTimeModalVisible, setIsFromTimeModalVisible] = useState(false);
    const [fromTimeString, setFromTimeString] = useState('');

    const [toTime, setToTime] = useState(
        moment(moment().format('YYYY-MM-DD') + ' ' + '08:00')
            .utc()
            .toDate(),
    );
    const [isToTimeModalVisible, setIsToTimeModalVisible] = useState(false);
    const [toTimeString, setToTimeString] = useState('');

    const formattedTime = time => moment(time).format('hh:mm A');

    // Function
    const onPressGoBack = () => {
        navigation.goBack();
    };

    const onPressSingleDay = data => {
        const selectedDayIndex = arraySelectedDays.findIndex(
            item => item.day === data,
        );

        if (selectedDayIndex !== -1) {
            const updatedArrayDays = [...arraySelectedDays];
            updatedArrayDays[selectedDayIndex].status =
                !updatedArrayDays[selectedDayIndex].status;

            updatedArrayDays;
        } else {
            const updatedArrayDays = [
                ...arraySelectedDays,
                {
                    day: data,
                    status: true,
                },
            ];

            setArraySelectedDays(updatedArrayDays);
        }
    };

    const openFromTimeModal = () => {
        setIsFromTimeModalVisible(true);
    };

    const closeFromTimeModal = () => {
        setIsFromTimeModalVisible(false);
    };

    const openToTimeModal = () => {
        setIsToTimeModalVisible(true);
    };

    const onChangeFromTime = selectedFromTime => {
        setIsFromTimeModalVisible(false);
        if (fromTimeString === '' && toTimeString === '') {
            const Time = moment(selectedFromTime).format('hh:mm A');
            setFromTime(selectedFromTime);
            setFromTimeString(Time);
        } else if (toTimeString === '') {
            const Time = moment(selectedFromTime).format('hh:mm A');
            setFromTime(selectedFromTime);
            setFromTimeString(Time);
        } else if (selectedFromTime < toTime) {
            const Time = moment(selectedFromTime).format('hh:mm A');
            setFromTime(selectedFromTime);
            setFromTimeString(Time);
        } else {
            showAlert(
                localize('SF13'),
                localize('SF14'),
                localize('SF15'),
                '',
                () => {
                    setIsFromTimeModalVisible(true);
                },
            );
        }
    };

    const onChangeToTime = selectedToTime => {
        setIsToTimeModalVisible(false);
        if (fromTimeString === '' && toTimeString === '') {
            const Time = moment(selectedToTime).format('hh:mm A');
            setToTime(selectedToTime);
            setToTimeString(Time);
        } else if (toTimeString === '') {
            const Time = moment(selectedToTime).format('hh:mm A');
            setToTime(selectedToTime);
            setToTimeString(Time);
        } else if (selectedToTime < toTime) {
            const Time = moment(selectedToTime).format('hh:mm A');
            setToTime(selectedToTime);
            setToTimeString(Time);
        } else {
            showAlert(
                localize('SF13'),
                localize('SF14'),
                localize('SF15'),
                '',
                () => {
                    setIsToTimeModalVisible(true);
                },
            );
        }
    };

    // Render Component
    const fromToTimeStyles = props =>
        StyleSheet.create({
            fromInput: {
                textAlign: 'center',
                color: props.fromTimeString ? Colors.white : Colors.black,
            },
            formStyle: {
                marginTop: Responsive.heightPercentageToDP('1%'),
            },
        });

    const handleConfirmPress = async () => {
        const selectedDays = arraySelectedDays
            .filter(item => item.status)
            .map(item => item.day)
            .join(', '); // or format to "Weekdays" / "Everyday" later if needed

        const newSchedule = {
            id: Date.now().toString(), // unique id
            start: fromTimeString,
            end: toTimeString,
            days: selectedDays || 'Custom',
            enabled: true,
        };

        console.log('newSchedule', newSchedule);

        navigation.navigate('MainTabs', {newSchedule});

        // navigation.goBack();
        // const payload = {
        //     email: values.email ? values.email : '',
        //     otp: value ? value : '',
        // };

        // setIsLoading(true);
        // VerifyOtpApiCall(payload);
        // console.log('fromTimeString', fromTimeString);
        // console.log('toTimeString', toTimeString);
        // console.log('arraySelectedDays', arraySelectedDays);
        // console.log(
        //     'toTimeString_24_hrs_formate',
        //     convertTo24HourFormat(toTimeString),
        // );
        // console.log(
        //     'fromTimeString_24_hrs_formate',
        //     convertTo24HourFormat(fromTimeString),
        // );
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
                        {backgroundColor: isDark ? '#111111' : '#ffffff'},
                    ]}>
                    <TouchableOpacity
                        onPress={onPressGoBack}
                        style={styles.backButton}>
                        <BackIcon width={26} height={26} color={Colors.black} />
                    </TouchableOpacity>

                    <ScrollView
                        contentContainerStyle={[
                            styles.scrollContent,
                            {backgroundColor: isDark ? '#111111' : '#fff'},
                        ]}
                        showsVerticalScrollIndicator={false}>
                        <Text
                            style={[
                                styles.greeting,
                                {color: isDark ? 'white' : '#000000'},
                            ]}>
                            {localize('SF3')}
                        </Text>

                        <View style={styles.centerView}>
                            <Text
                                style={[
                                    styles.daysText,
                                    {color: isDark ? 'white' : '#000000'},
                                ]}>
                                {localize('SF6')}
                            </Text>
                            <View style={styles.allDaysView}>
                                {arrDaysOfWeek.map((day, index) => {
                                    return (
                                        <View
                                            key={day}
                                            style={styles.daysOfWeekView}>
                                            <TouchableOpacity
                                                onPress={() =>
                                                    onPressSingleDay(day)
                                                }
                                                style={[
                                                    styles.singleDayTouchableOpacity,
                                                    {
                                                        backgroundColor:
                                                            arraySelectedDays.some(
                                                                item =>
                                                                    item.status &&
                                                                    item.day ===
                                                                        day,
                                                            )
                                                                ? Colors.themeColor
                                                                : '#5555551F',
                                                    },
                                                ]}>
                                                <Text
                                                    style={[
                                                        styles.singleDayText,
                                                        {
                                                            color: arraySelectedDays.some(
                                                                item =>
                                                                    item.status &&
                                                                    item.day ===
                                                                        day,
                                                            )
                                                                ? Colors.white
                                                                : Colors.black,
                                                        },
                                                    ]}>
                                                    {day.substring(0, 3)}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })}
                            </View>
                            <View style={styles.fromTimeView}>
                                <View style={styles.fromAndToView}>
                                    <Image
                                        source={Images.iconClock}
                                        style={styles.clockIcon}
                                    />
                                    <Text style={styles.fromAndToText}>
                                        {localize('SF7')}
                                    </Text>
                                </View>
                                <CustomTextInputView
                                    key={'input_2'}
                                    label={''}
                                    placeholder={localize('SF9')}
                                    value={fromTimeString}
                                    blurOnSubmit
                                    onFocus={openFromTimeModal}
                                    type={'dropdown'}
                                    onPress={openFromTimeModal}
                                    textInputStyle={{
                                        width: Responsive.widthPercentageToDP(
                                            '30',
                                        ),
                                        height: Responsive.heightPercentageToDP(
                                            '4',
                                        ),
                                        backgroundColor: fromTimeString
                                            ? Colors.themeColor
                                            : '#5555551F',
                                    }}
                                    textStyle={
                                        fromToTimeStyles({fromTimeString})
                                            .fromInput
                                    }
                                />
                            </View>
                            <View style={styles.lineView} />
                            <View style={styles.toTimeView}>
                                <View style={styles.fromAndToView}>
                                    <Image
                                        source={Images.iconClock}
                                        style={styles.clockIcon}
                                    />
                                    <Text style={styles.fromAndToText}>
                                        {localize('SF8')}
                                    </Text>
                                </View>
                                <CustomTextInputView
                                    key={'input_3'}
                                    label={''}
                                    placeholder={localize('SF9')}
                                    value={toTimeString}
                                    blurOnSubmit
                                    onFocus={openToTimeModal}
                                    type={'dropdown'}
                                    onPress={openToTimeModal}
                                    textInputStyle={{
                                        width: Responsive.widthPercentageToDP(
                                            '30',
                                        ),
                                        height: Responsive.heightPercentageToDP(
                                            '4',
                                        ),
                                        backgroundColor: toTimeString
                                            ? Colors.themeColor
                                            : '#5555551F',
                                    }}
                                    textStyle={
                                        fromToTimeStyles({toTimeString})
                                            .fromInput
                                    }
                                />
                            </View>
                        </View>
                    </ScrollView>
                    <CustomButton
                        title={localize('SF16')}
                        onPress={handleConfirmPress}
                        disabled={
                            fromTimeString === '' ||
                            toTimeString === '' ||
                            !arraySelectedDays.some(item => item.status)
                        }
                    />
                </View>
            </SafeAreaContainerView>
            <CustomDateTimePicker
                date={fromTime}
                onChange={onChangeFromTime}
                onCancel={() => setIsFromTimeModalVisible(false)}
                modePicker={'time'}
                isModalVisible={isFromTimeModalVisible}
                title={localize('SF10')}
                isShowCloseButton
                confirmButtonText={localize('SF11')}
                maxDate={moment().clone().endOf('day').toDate()}
                minDate={moment().clone().startOf('day').toDate()}
            />
            <CustomDateTimePicker
                date={toTime}
                onChange={onChangeToTime}
                onCancel={() => setIsToTimeModalVisible(false)}
                modePicker={'time'}
                isModalVisible={isToTimeModalVisible}
                title={localize('SF12')}
                isShowCloseButton
                confirmButtonText={localize('SF11')}
                maxDate={moment().clone().endOf('day').toDate()}
                minDate={moment().clone().startOf('day').toDate()}
            />
        </ContainerView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: height(20),
        paddingHorizontal: width(20),
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: height(12),
        paddingTop: height(2),
    },
    greeting: {
        fontSize: width(25),
        fontWeight: 700,
        fontFamily: 'Roboto',
        marginTop: height(20),
    },
    centerView: {
        marginTop: height(25),
    },
    daysText: {
        fontSize: width(15),
        fontWeight: 400,
        fontFamily: 'Roboto',
    },
    allDaysView: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: height(10),
    },
    daysOfWeekView: {},
    singleDayTouchableOpacity: {
        justifyContent: 'center',
        alignItems: 'center',
        width: width(42),
        height: height(25),
        borderRadius: width(8),
    },
    singleDayText: {
        fontSize: width(13),
        fontWeight: 400,
        fontFamily: 'Roboto',
        textTransform: 'capitalize',
    },
    fromTimeView: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: height(40),
    },
    fromAndToView: {
        flexDirection: 'row',
        marginTop: height(10),
    },
    clockIcon: {
        width: 22,
        height: 22,
        tintColor: '#ff9800',
        marginRight: 8,
    },
    fromAndToText: {
        fontSize: width(15),
        fontWeight: 400,
        fontFamily: 'Roboto',
        marginLeft: width(5),
    },
    lineView: {
        height: height(1),
        backgroundColor: '#5555551F',
    },
    toTimeView: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: height(20),
    },
});
