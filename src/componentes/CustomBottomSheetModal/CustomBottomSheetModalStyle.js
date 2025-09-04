import {StyleSheet} from 'react-native';

// Lib
import {hasNotch} from 'react-native-device-info';

// Mics Constants
import {Colors, Fonts} from '../../utils/theme';

// Common Function
import {height, width} from '../../function/commonFunctions';

export const styles = StyleSheet.create({
    modalContainerStyle: {
        margin: 0,
        justifyContent: 'flex-end',
    },
    bottomSheetContainer: {
        width: '100%',
        backgroundColor: Colors.white,
        borderTopRightRadius: height(20),
        borderTopLeftRadius: height(20),
        paddingHorizontal: width(16),
        paddingBottom: hasNotch() ? height(25) : height(20),
        paddingTop: height(4),
    },
    modalHorizontalLine: {
        alignSelf: 'center',
        marginBottom: height(15),
        width: width(60),
        height: height(3),
        borderRadius: width(20),
        backgroundColor: Colors.borderColor,
        marginHorizontal: -width(16),
    },
    headerView: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitleText: {
        flex: 1,
        flexWrap: 'wrap',
        fontSize: width(16),
        // fontFamily: Fonts.fonts.InterMedium,
        color: Colors.themeColor,
        fontWeight: 600,
    },
    closeIconTouchableOpacity: {
        justifyContent: 'center',
        alignItems: 'center',
        width: width(30),
        height: width(30),
        borderRadius: width(15),
        borderWidth: 1,
        borderColor: Colors.borderColor,
    },
    closeIcon: {
        width: width(12),
        height: height(12),
        tintColor: Colors.red,
    },
    lineView: {
        borderWidth: 0.8,
        borderColor: Colors.borderColor,
        backgroundColor: Colors.borderColor,
        marginTop: height(10),
        marginBottom: height(10),
    },
});
