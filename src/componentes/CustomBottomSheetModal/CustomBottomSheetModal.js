import React, {useEffect, useState} from 'react';
import {
    Image,
    Platform,
    StatusBar,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

// Lib
import Modal from 'react-native-modal';

// Mics Constants
import {styles} from './CustomBottomSheetModalStyle';
import {Colors, Constants, Images} from '../../utils/theme';

export default function CustomBottomSheetModal(props) {
    // props
    const {
        modalVisible = false,
        title,
        isShowCloseButton,
        onCancelModal,
        isBackdropPress = true,
        children,
    } = props;

    // useState
    const [isShowModal, setIsShowModal] = useState(false);

    // useEffect
    useEffect(() => {
        setIsShowModal(modalVisible);
    }, [modalVisible]);

    // Function
    const onPressCancel = () => {
        if (isBackdropPress) {
            setIsShowModal(false);

            if (onCancelModal) {
                onCancelModal();
            }
        }
    };

    // Render Component
    return (
        <Modal
            isVisible={isShowModal}
            animationIn={'slideInUp'}
            animationOut={'slideOutDown'}
            backdropColor={Colors.blackOpacity}
            onBackdropPress={onPressCancel}
            onBackButtonPress={onPressCancel}
            style={styles.modalContainerStyle}
            deviceWidth={Constants.commonConstant.scrWidth}
            deviceHeight={Constants.commonConstant.scrHeight}
            animationInTiming={Constants.commonConstant.animTime200}
            animationOutTiming={Constants.commonConstant.animTime200}
            onModalHide={onPressCancel}
            avoidKeyboard={false}
            statusBarTranslucent={Platform.OS !== 'android'}>
            <StatusBar
                barStyle={'dark-content'}
                backgroundColor={Colors.darkBlackOpacity}
            />
            <View style={styles.bottomSheetContainer}>
                <View style={styles.modalHorizontalLine} />
                {isBackdropPress && (
                    <View style={styles.headerView}>
                        {title && (
                            <Text style={styles.headerTitleText}>{title}</Text>
                        )}

                        {isShowCloseButton && (
                            <TouchableOpacity
                                onPress={onCancelModal}
                                style={styles.closeIconTouchableOpacity}>
                                <Image
                                    source={Images.iconCross}
                                    resizeMode={'contain'}
                                    style={styles.closeIcon}
                                />
                            </TouchableOpacity>
                        )}
                    </View>
                )}
                <View style={styles.lineView} />
                {children}
            </View>
        </Modal>
    );
}
