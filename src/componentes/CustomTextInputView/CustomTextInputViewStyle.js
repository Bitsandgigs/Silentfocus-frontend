import {StyleSheet} from 'react-native';

// Common Function
import {height, width} from '../../function/commonFunctions';
import {Colors} from '../../utils/theme';

export const styles = StyleSheet.create({
    containerView: {
        marginVertical: height(2),
        // backgroundColor: Colors.white,
    },
    leftIconTouchableOpacity: {
        paddingHorizontal: width(4),
        paddingVertical: height(2),
    },
    labelText: {
        fontSize: width(16),
        color: Colors.lightBlack,
        fontWeight: 500,
        marginVertical: 8,
    },
    leftIcon: {
        width: width(22),
        height: width(22),
    },
    textInputView: {
        flex: 1,
        flexWrap: 'wrap',
        height: height(45),
        fontSize: width(14),
        color: Colors.black,
        fontWeight: 400,
        marginHorizontal: width(2),
    },
    textView: {
        flex: 1,
        flexWrap: 'wrap',
        fontSize: width(14),
        color: Colors.black,
        fontWeight: 400,
        marginHorizontal: width(2),
    },
    rightIconTouchableOpacity: {
        paddingHorizontal: width(4),
        paddingVertical: height(2),
    },
    rightIcon: {
        width: width(24),
        height: width(24),
    },
    validInputContainerStyle: {
        flexDirection: 'row',
        alignItems: 'center',
        height: height(55),
        backgroundColor: Colors.textInputBg,
        paddingHorizontal: width(12),
        borderRadius: height(14),
    },
    invalidInputContainerStyle: {
        flexDirection: 'row',
        alignItems: 'center',
        height: height(55),
        paddingHorizontal: width(12),
        borderRadius: height(14),
        borderWidth: width(1),
        borderColor: Colors.red,
    },
    errorImageStyle: {
        tintColor: Colors.themeColor,
    },
    errorMessageLabel: {
        fontSize: width(12),
        color: Colors.red,
        fontWeight: 400,
        marginHorizontal: width(10),
        marginTop: height(3),
        marginBottom: height(5),
    },
});
