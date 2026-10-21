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
import {height, localize, width} from '../function/commonFunctions';
import BackIcon from '../assets/svgs/Back';
import {Colors, Constants, Images, Responsive} from '../utils/theme';
import CustomDateTimePicker from '../componentes/CustomDateTimePicker/CustomDateTimePicker';
import {showAlertWithOneCallBack, showApiErrorAlert} from '../function/Alert';
import CustomButton from '../componentes/CustomButton/CustomButton';
import {controlColors} from '../utils/theme/controlColors';
import EndPoints from '../utils/api/endpoints';
import APICall from '../utils/api/api';
import {
    SCHEDULE_TYPE,
    buildSchedulePayload,
    defaultOnceWindow,
    toggleDay,
} from '../utils/scheduleRules';
import ScheduleTypeSelector, {WeeklyHint} from '../componentes/ScheduleTypeSelector';
import OnceScheduleForm, {confirmAndSaveOnce} from '../componentes/OnceScheduleForm';
import CustomLoader from '../componentes/CustomLoader/CustomLoader';

export default function ScheduleTimeScreen() {
    // navigation
    const navigation = useNavigation();

    // Variable
    const isDark = useColorScheme() === 'dark';
    // Readable in dark mode (Client Issue #2); light mode unchanged.
    const palette = controlColors(isDark);

    // Array
    const arrDaysOfWeek = [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
    ];

    // useState
    // Client feedback: "Once" needs no weekday; "Every week" repeats on the chosen days.
    const [scheduleType, setScheduleType] = useState(SCHEDULE_TYPE.ONCE);
    const [onceWindow, setOnceWindow] = useState(() => defaultOnceWindow());
    const [arraySelectedDays, setArraySelectedDays] = useState([]);

    const [fromTime, setFromTime] = useState(
        moment(moment().format('YYYY-MM-DD') + ' ' + '08:00').toDate(),
    );
    const [isFromTimeModalVisible, setIsFromTimeModalVisible] = useState(false);
    const [fromTimeString, setFromTimeString] = useState('');

    const [toTime, setToTime] = useState(
        moment(moment().format('YYYY-MM-DD') + ' ' + '08:00').toDate(),
    );
    const [isToTimeModalVisible, setIsToTimeModalVisible] = useState(false);
    const [toTimeString, setToTimeString] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Function
    const onPressGoBack = () => {
        navigation.goBack();
    };

    const onPressSingleDay = day => {
        setArraySelectedDays(prev => toggleDay(prev, day));
    };

    const openFromTimeModal = () => {
        setIsFromTimeModalVisible(true);
    };

    const openToTimeModal = () => {
        setIsToTimeModalVisible(true);
    };

    // Start and end are local wall-clock times. End earlier than start is an
    // overnight schedule (e.g. 22:00 -> 07:00 ends the next morning); only
    // identical times are rejected.
    const minutesOfDay = date => date.getHours() * 60 + date.getMinutes();

    const alertSameTime = reopen => {
        showAlertWithOneCallBack(
            localize('SF13'),
            "Start and end time can't be the same.",
            localize('SF15'),
            reopen,
        );
    };

    const onChangeFromTime = selectedFromTime => {
        setIsFromTimeModalVisible(false);
        if (
            toTimeString !== '' &&
            minutesOfDay(selectedFromTime) === minutesOfDay(toTime)
        ) {
            alertSameTime(() => setIsFromTimeModalVisible(true));
            return;
        }
        setFromTime(selectedFromTime);
        setFromTimeString(moment(selectedFromTime).format('hh:mm A'));
    };

    const onChangeToTime = selectedToTime => {
        setIsToTimeModalVisible(false);
        if (
            fromTimeString !== '' &&
            minutesOfDay(selectedToTime) === minutesOfDay(fromTime)
        ) {
            alertSameTime(() => setIsToTimeModalVisible(true));
            return;
        }
        setToTime(selectedToTime);
        setToTimeString(moment(selectedToTime).format('hh:mm A'));
    };

    // Render Component
    const fromToTimeStyles = props =>
        StyleSheet.create({
            fromInput: {
                textAlign: 'center',
                color:
                    props.fromTimeString || props.toTimeString
                        ? palette.timeValueText
                        : palette.placeholder,
            },
            formStyle: {
                marginTop: Responsive.heightPercentageToDP('1%'),
            },
        });

    const handleConfirmPress = async () => {
        if (scheduleType === SCHEDULE_TYPE.ONCE) {
            const saved = await confirmAndSaveOnce({
                userId: Constants.commonConstant.appUserId,
                startAt: onceWindow.startAt,
                endAt: onceWindow.endAt,
            });
            if (saved) {
                navigation.goBack();
            }
            return;
        }
        const selectedDays = arraySelectedDays
            .filter(item => item.status)
            .map(item => item.day)
            .join(', ');

        const payload = buildSchedulePayload({
            userId: Constants.commonConstant.appUserId,
            fromTime: fromTimeString
                ? convertTo24HourFormat(fromTimeString)
                : '',
            toTime: toTimeString ? convertTo24HourFormat(toTimeString) : '',
            days: selectedDays,
        });

        setIsLoading(true);
        SetScheduleApiCall(payload);
    };

    const convertTo24HourFormat = time => {
        return moment(time, ['h:mm A']).format('HH:mm');
    };

    const SetScheduleApiCall = async payload => {
        const url = EndPoints.setscheduleTimerData;

        await APICall('post', payload, url).then(response => {
            setIsLoading(false);
            if (
                response?.statusCode === Constants.apiStatusCode.success &&
                response?.data
            ) {
                const responseData = response?.data;

                if (responseData?.status === '1') {
                    navigation.goBack();
                } else {
                    showApiErrorAlert(Constants.commonConstant.appName, response);
                }
            } else {
                showApiErrorAlert(Constants.commonConstant.appName, response);
            }
        });
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
                        <BackIcon width={26} height={26} color={palette.icon} />
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

                        <ScheduleTypeSelector
                            value={scheduleType}
                            onChange={setScheduleType}
                            palette={palette}
                            isDark={isDark}
                        />

                        {scheduleType === SCHEDULE_TYPE.ONCE ? (
                            <OnceScheduleForm
                                startAt={onceWindow.startAt}
                                endAt={onceWindow.endAt}
                                onChange={setOnceWindow}
                                palette={palette}
                                isDark={isDark}
                            />
                        ) : (
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
                                                accessibilityRole="button"
                                                accessibilityState={{
                                                    selected: arraySelectedDays.some(
                                                        item => item.status && item.day === day,
                                                    ),
                                                }}
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
                                                                ? palette.scheduleSelected
                                                                : palette.pill,
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
                                                                ? palette.scheduleSelectedText
                                                                : palette.pillText,
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
                                    <Text style={[styles.fromAndToText, palette.label && {color: palette.label}]}>
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
                                            ? palette.scheduleSelected
                                            : palette.pill,
                                    }}
                                    textStyle={
                                        fromToTimeStyles({fromTimeString})
                                            .fromInput
                                    }
                                />
                            </View>
                            <View style={[styles.lineView, {backgroundColor: palette.divider}]} />
                            <View style={styles.toTimeView}>
                                <View style={styles.fromAndToView}>
                                    <Image
                                        source={Images.iconClock}
                                        style={styles.clockIcon}
                                    />
                                    <Text style={[styles.fromAndToText, palette.label && {color: palette.label}]}>
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
                                            ? palette.scheduleSelected
                                            : palette.pill,
                                    }}
                                    textStyle={
                                        fromToTimeStyles({toTimeString})
                                            .fromInput
                                    }
                                />
                            </View>
                            <WeeklyHint
                                hasDays={arraySelectedDays.some(item => item.status)}
                                overnight={
                                    fromTimeString !== '' &&
                                    toTimeString !== '' &&
                                    minutesOfDay(toTime) < minutesOfDay(fromTime)
                                }
                                isDark={isDark}
                            />
                        </View>
                        )}
                    </ScrollView>
                    <CustomButton
                        title={localize('SF16')}
                        color={palette.confirmBg}
                        onPress={handleConfirmPress}
                        disabled={
                            scheduleType === SCHEDULE_TYPE.WEEKLY &&
                            (fromTimeString === '' ||
                                toTimeString === '' ||
                                !arraySelectedDays.some(item => item.status))
                        }
                    />
                </View>
            </SafeAreaContainerView>
            <CustomLoader isLoading={isLoading} />
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
