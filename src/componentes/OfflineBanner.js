import React, {useContext} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

// Mics Constants
import {AppContext} from '../utils/context/contextProvider';

// Non-blocking notice shown while the device is offline. The current screen
// (and the session) stay as they are underneath it.
const OfflineBanner = () => {
    const {isInternetConnection} = useContext(AppContext);

    if (isInternetConnection) {
        return null;
    }

    return (
        <View pointerEvents="none" style={styles.wrapper}>
            <SafeAreaView edges={['top']} style={styles.banner}>
                <Text accessibilityRole="alert" style={styles.text}>
                    You're offline. Some information may be out of date.
                </Text>
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
    },
    banner: {
        paddingBottom: 8,
        paddingHorizontal: 16,
        backgroundColor: '#333333',
    },
    text: {
        color: '#ffffff',
        fontSize: 13,
        textAlign: 'center',
    },
});

export default OfflineBanner;
