import React from 'react';
import { Text, TouchableHighlight, View } from 'react-native';

// Mics Constants
import { styles } from './CustomButtonStyle';
import { Colors, CommonStyle } from '../../utils/theme';

export default function CustomButton(props) {
    // props
    const {
        title = '',
        onPress = () => { },
        buttonStyle = {},
        textStyle = {},
        disabled = false,
    } = props;

    // Render Component
    return (
        <TouchableHighlight
            onPress={onPress}
            disabled={disabled}
            underlayColor={Colors.hideThemeColor}
            style={[
                styles.buttonContainer,
                buttonStyle,
                {
                    backgroundColor: disabled ? Colors.hideThemeColor : Colors.themeColor,
                },
            ]}>
            <View style={[CommonStyle.flex, CommonStyle.centerItem]}>
                <View style={styles.innerView}>
                    <Text disabled={disabled} style={[styles.titleText, textStyle]}>
                        {title}
                    </Text>
                </View>
            </View>
        </TouchableHighlight>
    );
}