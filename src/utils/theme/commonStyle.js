import {StyleSheet} from 'react-native';
import Colors from './colors';
import Responsive from './responsive';

const CommonStyle = StyleSheet.create({
    flex: {
        flex: 1,
    },
    centerItem: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {textAlign: 'center', fontSize: 30},
    codeFieldRoot: {
        marginTop: 10,
        marginBottom: 14,
        alignItems: 'center',
        // backgroundColor: Colors.red,
    },
    cell: {
        width: Responsive.widthPercentageToDP(15),
        height: Responsive.widthPercentageToDP(15),
        borderRadius: 10,
        backgroundColor: Colors.textInputBg,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 5,
    },
    cellText: {
        color: Colors.textPrimary,
        fontSize: 22,
        fontWeight: '500',
        textAlign: 'center',
    },
    focusCell: {
        borderColor: Colors.textPrimary,
    },
    errorCell: {
        borderColor: Colors.redShadeEB,
    },
    errorText: {
        color: Colors.redLight,
    },
});

export default CommonStyle;
