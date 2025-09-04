import React, {useState} from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    useColorScheme,
    Dimensions,
    ScrollView,
    KeyboardAvoidingView,
} from 'react-native';
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import ClockIcon from '../assets/svgs/clock';
import Toggle from '../assets/svgs/Toggle';
import {SafeAreaView} from 'react-native-safe-area-context';
//import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';

const {width} = Dimensions.get('window');

// const ScheduleCard = ({ time = '09:00 AM - 05:00 PM', days = 'Everyday' }) => {
//   const [isEnabled, setIsEnabled] = useState(false);
//   const colorScheme = useColorScheme();
//   const isDark = colorScheme === 'dark';
//    const background = isDark ? '#111' : '#fff';
//   const toggleSwitch = () => setIsEnabled(prev => !prev);

//   return (

//     <View style={styles.container}>

//       <View style={[styles.card, { backgroundColor: isDark ? '#1C1C1C' : '#5555551F' }]}>
//         <View style={styles.cardContent}>
//           <ClockIcon />
//           <View style={styles.timeBlock}>
//             <Text style={[styles.timeRange, { color: isDark ? 'white' : '#1C1C1C' }]}>
//               {time}
//             </Text>

//             <View style={styles.labelBlock}>
//               <Text style={[styles.everyday, { color: isDark ? 'rgba(250,250,250,0.45)' : '#555' }]}>
//                 {days}
//               </Text>

//               <View
//                 style={[
//                   styles.dividerLine,
//                   { backgroundColor: isDark ? 'rgba(85, 85, 85, 0.35)' : '#D9D9D9' },
//                 ]}
//               />

//               <Text style={styles.addSchedule}>Add Schedule  ＋</Text>
//             </View>
//           </View>

//           <TouchableOpacity onPress={toggleSwitch} style={styles.toggleWrapper}>
//             <Toggle isOn={isEnabled} />
//           </TouchableOpacity>
//         </View>
//       </View>
//     </View>

//   );
// };

const ScheduleCard = ({
    time = '09:00 AM - 05:00 PM',
    days = 'Everyday',
    isEnabled,
    onToggle,
}) => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    return (
        <View style={styles.container}>
            <View
                style={[
                    styles.card,
                    {backgroundColor: isDark ? '#1C1C1C' : '#5555551F'},
                ]}>
                <View style={styles.cardContent}>
                    <ClockIcon />
                    <View style={styles.timeBlock}>
                        <Text
                            style={[
                                styles.timeRange,
                                {color: isDark ? 'white' : '#1C1C1C'},
                            ]}>
                            {time}
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
                                {days}
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

                    <TouchableOpacity
                        onPress={onToggle}
                        style={styles.toggleWrapper}>
                        <Toggle isOn={isEnabled} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

export default ScheduleCard;

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: wp('3%'),
        marginBottom: hp('2.5%'),
    },
    //  scrollContent: {
    //   paddingBottom: hp('12%'),
    //   paddingTop: hp('2%'),
    // },

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
});
