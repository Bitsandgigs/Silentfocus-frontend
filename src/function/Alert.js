import { Alert } from 'react-native';
import { Constants } from '../utils/theme';

export function showAlert(title, message, buttonTitle = 'OK') {
    setTimeout(() => {
        Alert.alert(title, message, [
            {
                text: buttonTitle,
            },
        ]);
    }, Constants.commonConstant.animTime100);
}

export function showAlertWithOneCallBack(
    title,
    message,
    okayFirstButtonTitle,
    okayFirstCallback,
) {
    setTimeout(() => {
        Alert.alert(title, message, [
            {
                text: okayFirstButtonTitle,
                onPress: () => {
                    okayFirstCallback();
                },
            },
        ]);
    }, Constants.commonConstant.animTime100);
}

export function showAlertWithTwoCallBack(
    title,
    message,
    cancelTitle,
    cancelSecondCallBack,
    okayTitle,
    okayFirstCallback,
) {
    setTimeout(() => {
        Alert.alert(title, message, [
            {
                text: cancelTitle,
                onPress: () => {
                    cancelSecondCallBack();
                },
                style: 'cancel',
            },
            {
                text: okayTitle,
                onPress: () => {
                    okayFirstCallback();
                },
            },
        ]);
    }, Constants.commonConstant.animTime100);
}
