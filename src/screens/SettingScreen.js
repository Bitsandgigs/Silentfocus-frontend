import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Dimensions,
  useColorScheme,
  KeyboardAvoidingView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Toggle from '../assets/svgs/Toggle';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import LocationSingle from '../assets/svgs/LocationSingle';
import CalenderSingle from '../assets/svgs/CalenderSingle';
import NotificationSingle from '../assets/svgs/NotificationSingle';

const {width} = Dimensions.get('window');
const CARD_WIDTH = 334.913;
const CARD_HEIGHT = 110.644;

const SettingsScreen = () => {
  const [locationMode, setLocationMode] = useState(false);
  const [calendarMode, setCalendarMode] = useState(true);
  const [customMode, setCustomMode] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [tempResponse, setTempResponse] = useState('');
  const [autoResponse, setAutoResponse] = useState('');

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const background = isDark ? '#111' : '#fff';
  const bg = isDark ? '#111111' : '#FFFFFF';
  const card = isDark ? 'rgba(85, 85, 85, 0.12)' : '#2E3A3E14';
  const text = isDark ? '#FFFFFF' : '#1A1A1A';
  const mutedText = isDark ? '#AAA' : '#444';
  const divider = isDark ? 'rgba(85, 85, 85, 0.35)' : '#C2C2C2';

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: background}}>
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={hp('10%')} // adjust depending on your tab height
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}>
          <Text style={styles.title}>Control Center</Text>

          <Text style={[styles.sectionTitle, {color: text}]}>
            SELECT YOUR DESIRED SILENT FOCUS MODE
          </Text>

          {/* Location, Calendar, and Custom Modes */}
          {[
            {
              icon: <LocationSingle />,
              title: 'Location Mode',
              desc: 'Your phone will be muted automatically when any silent zones detected like libraries, offices, or religious places.',
              toggle: locationMode,
              onPress: () => setLocationMode(p => !p),
            },
            {
              icon: <CalenderSingle />,
              title: 'Calendar Mode',
              desc: 'Your phone will be muted automatically during scheduled meetings or events.',
              toggle: calendarMode,
              onPress: () => setCalendarMode(p => !p),
            },
            {
              icon: <NotificationSingle />,
              title: 'Custom',
              desc: 'You can add your custom location',
              toggle: customMode,
              onPress: () => setCustomMode(p => !p),
              isCustom: true,
            },
          ].map((item, idx) => (
            <View
              key={idx}
              style={[
                styles.modeCard,
                {
                  backgroundColor: card,
                  minHeight: item.isCustom ? undefined : hp('14%'),
                  paddingVertical: item.isCustom ? hp('2.8%') : hp('2%'),
                },
              ]}>
              <View style={styles.row}>
                <View style={styles.iconBox}>{item.icon}</View>
                <View style={styles.textBlock}>
                  <Text style={[styles.modeTitle, {color: text}]}>
                    {item.title}
                  </Text>
                  <Text style={[styles.modeDesc, {color: mutedText}]}>
                    {item.desc}
                  </Text>
                </View>
                <TouchableOpacity onPress={item.onPress}>
                  <Toggle isOn={item.toggle} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* Auto Response Section */}
          <Text style={[styles.sectionTitle, {color: text}]}>
            SET AUTO RESPONSE
          </Text>
          <View style={[styles.responseCard, {backgroundColor: card}]}>
            <Text style={[styles.modeSubTitle, {color: text}]}>
              SELECT RESPONSE
            </Text>
            <View style={[styles.divider, {backgroundColor: divider}]} />
            {autoResponse ? (
              <View style={styles.responseRow}>
                <Text style={[styles.responsePreview, {color: mutedText}]}>
                  "{autoResponse}"
                </Text>
                <TouchableOpacity onPress={() => setAutoResponse('')}>
                  <Text style={styles.deleteBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  setTempResponse(autoResponse);
                  setModalVisible(true);
                }}>
                <Text style={styles.manualText}>Write Manually ＋</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Modal */}
          <Modal
            visible={modalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setModalVisible(false)}>
            <View style={styles.modalOverlay}>
              <View
                style={[
                  styles.modalContent,
                  {backgroundColor: isDark ? '#1c1c1c' : '#fff'},
                ]}>
                <Text style={[styles.modalTitle, {color: text}]}>
                  Set Auto Response
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {color: text, backgroundColor: isDark ? '#222' : '#f2f2f2'},
                  ]}
                  placeholder="Type your message..."
                  placeholderTextColor={mutedText}
                  value={tempResponse}
                  onChangeText={setTempResponse}
                  multiline
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={() => {
                      setAutoResponse(tempResponse.trim());
                      setModalVisible(false);
                    }}>
                    <Text style={{color: '#fff', fontWeight: '600'}}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setModalVisible(false)}>
                    <Text style={{color: '#D6721E', fontWeight: '600'}}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: hp('1%'),
    paddingHorizontal: wp('5%'),
  },
  scrollContent: {
    paddingBottom: hp('25%'), // Increased from 12% to 20% to clear bottom navigation
    paddingTop: hp('2%'),
  },
  title: {
    fontSize: wp('5.5%'),
    fontWeight: '700',
    color: '#D6721E',
    textAlign: 'center',
    marginBottom: hp('3%'),
  },
  sectionTitle: {
    fontSize: wp('3.4%'),
    fontWeight: '700',
    marginBottom: hp('1.5%'),
    marginTop: hp('1%'),
  },
  modeCard: {
    width: wp('90%'),
    borderRadius: wp('4.5%'),
    paddingHorizontal: wp('4%'),
    alignSelf: 'center',
    marginBottom: hp('2%'),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('3%'),
  },
  iconBox: {
    width: wp('8%'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    marginLeft: wp('2.5%'),
  },
  modeTitle: {
    fontSize: wp('4%'),
    fontWeight: '700',
    marginBottom: hp('0.5%'),
  },
  modeDesc: {
    fontSize: wp('3.2%'),
  },
  responseCard: {
    width: wp('90%'),
    borderRadius: wp('4.5%'),
    paddingHorizontal: wp('5%'),
    paddingVertical: hp('2%'),
    alignSelf: 'center',
    marginTop: hp('1.5%'),
    marginBottom: hp('2%'), // Added bottom margin to ensure spacing
  },
  modeSubTitle: {
    fontSize: wp('3.3%'),
    fontWeight: '600',
    marginBottom: hp('1%'),
  },
  divider: {
    height: 1,
    marginBottom: hp('1.2%'),
    marginTop: hp('0.5%'),
  },
  manualText: {
    fontSize: wp('3.5%'),
    fontWeight: '600',
    color: '#D6721E',
    marginTop: hp('0.5%'),
  },
  responsePreview: {
    fontSize: wp('3.2%'),
    fontStyle: 'italic',
    flex: 1,
  },
  responseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: hp('0.5%'),
  },
  deleteBtn: {
    color: '#D6721E',
    fontSize: wp('4.5%'),
    paddingHorizontal: wp('2%'),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: wp('85%'),
    borderRadius: wp('3.5%'),
    padding: wp('5%'),
  },
  modalTitle: {
    fontSize: wp('4.5%'),
    fontWeight: '600',
    marginBottom: hp('1.5%'),
  },
  input: {
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: wp('2.5%'),
    padding: wp('3%'),
    fontSize: wp('3.5%'),
    minHeight: hp('12%'),
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: hp('3%'),
  },
  saveBtn: {
    backgroundColor: '#D6721E',
    paddingVertical: hp('1%'),
    paddingHorizontal: wp('5%'),
    borderRadius: wp('2%'),
  },
  cancelBtn: {
    paddingVertical: hp('1%'),
    paddingHorizontal: wp('5%'),
  },
});

export default SettingsScreen;
