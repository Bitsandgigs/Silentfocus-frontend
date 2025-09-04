import {
    Image,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {styles} from './CustomTextInputViewStyle';
import {Colors} from '../../utils/theme';
import KeyboardManager from 'react-native-keyboard-manager';

export default function CustomTextInputView(props) {
    const {
        textColor = null,
        placeholder = '',
        value = '',
        onChangeText = () => {},
        innerRef,
        blurOnSubmit = true,
        onSubmitEditing = () => {},
        secureTextEntry = false,
        keyboardType = 'default',
        returnKeyType = 'next',
        numberOfLines = 1,
        leftIcon,
        leftIconStyle = {},
        rightIcon,
        rightIconStyle = {},
        onPressRightIcon = () => {},
        textInputStyle = {},
        customTextInputStyle = {},
        isValid = true,
        errorMessage = '',
        type = 'textInput',
        disabled = false,
        rightCustomElement,
        onPress,
        textStyle = {},
    } = props;

    // Variables
    const inputValidContainerStyle = StyleSheet.flatten([
        styles.validInputContainerStyle,
    ]);
    const inputInvalidContainerStyle = StyleSheet.flatten([
        styles.invalidInputContainerStyle,
    ]);

    // Render Component
    return (
        <View style={[styles.containerView, customTextInputStyle]}>
            <TouchableOpacity
                activeOpacity={9}
                onPress={() => {
                    if (type === 'textInput') {
                        innerRef?.current?.focus();
                    } else if (!disabled && onPress) {
                        onPress();
                    }
                }}
                style={[
                    inputValidContainerStyle,
                    !isValid && inputInvalidContainerStyle,
                    textInputStyle,
                ]}>
                {leftIcon && (
                    <TouchableOpacity
                        disabled
                        style={styles.leftIconTouchableOpacity}>
                        <Image
                            style={[styles.leftIcon, leftIconStyle]}
                            source={leftIcon}
                            resizeMode={'contain'}
                            resizeMethod={'resize'}
                        />
                    </TouchableOpacity>
                )}

                {type === 'textInput' ? (
                    <TextInput
                        style={[
                            styles.textInputView,
                            textColor !== null && {color: textColor},
                        ]}
                        placeholder={placeholder}
                        textContentType={'oneTimeCode'}
                        placeholderTextColor={Colors.placeHolder}
                        value={value}
                        onChangeText={onChangeText}
                        ref={innerRef}
                        blurOnSubmit={blurOnSubmit}
                        onSubmitEditing={onSubmitEditing}
                        secureTextEntry={secureTextEntry}
                        keyboardType={keyboardType}
                        returnKeyType={returnKeyType}
                        autoCapitalize={'none'}
                        autoCorrect={false}
                        autoComplete={'off'}
                        spellCheck={false}
                        numberOfLines={numberOfLines}
                        editable={!disabled}
                        onLayout={() => {
                            if (Platform.OS === 'ios') {
                                KeyboardManager.reloadLayoutIfNeeded();
                            }
                        }}
                    />
                ) : (
                    <Text
                        numberOfLines={1}
                        style={[
                            styles.textView,
                            textStyle,
                            {
                                color:
                                    value !== ''
                                        ? Colors.black
                                        : Colors.placeHolder,
                            },
                        ]}>
                        {value !== '' ? value : placeholder}
                    </Text>
                )}
                {rightCustomElement && <>{rightCustomElement}</>}
                {rightIcon && (
                    <TouchableOpacity
                        onPress={onPressRightIcon}
                        style={styles.rightIconTouchableOpacity}>
                        {!isValid ? (
                            <Image
                                style={[
                                    styles.errorImageStyle,
                                    styles.rightIcon,
                                ]}
                                source={rightIcon}
                                resizeMode={'contain'}
                                resizeMethod={'resize'}
                            />
                        ) : (
                            <Image
                                style={[styles.rightIcon, rightIconStyle]}
                                source={rightIcon}
                                resizeMode={'contain'}
                                resizeMethod={'resize'}
                            />
                        )}
                    </TouchableOpacity>
                )}
            </TouchableOpacity>
            {!isValid && errorMessage !== '' ? (
                <Text style={styles.errorMessageLabel}>{errorMessage}</Text>
            ) : (
                <Text style={styles.errorMessageLabel} />
            )}
        </View>
    );
}
