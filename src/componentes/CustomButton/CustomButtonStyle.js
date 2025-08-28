import { StyleSheet } from 'react-native';

// Mics Constants
import { Colors, Fonts } from '../../utils/theme';

// Common Function
import { height, width } from '../../function/commonFunctions';

export const styles = StyleSheet.create({
    buttonContainer: {
        alignSelf: 'center',
        width: '100%',
        height: height(48),
        borderRadius: width(25),
        backgroundColor: Colors.themeColor,
        marginVertical: height(4),
        zIndex: 0,
    },
    innerView: {
        width: '90%',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center',
    },
    titleText: {
        fontSize: width(15),
        // fontFamily: Fonts.fonts.InterBold,
        color: Colors.white,
        fontWeight: 600,
    },
    unFeelDisabledText: {
        color: Colors.white,
    },
    unFeelDisabledSty: {
        backgroundColor: Colors.hideThemeColor,
    },
});