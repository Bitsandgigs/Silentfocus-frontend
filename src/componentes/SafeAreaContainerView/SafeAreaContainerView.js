import React from 'react';

// Lib
import {SafeAreaView} from 'react-native-safe-area-context';

// Mics Constants
import {styles} from './SafeAreaContainerViewStyle';

const SafeAreaContainerView = ({children, style = {}}) => {
    return (
        <SafeAreaView style={[styles.container, style]}>
            {children}
        </SafeAreaView>
    );
};

export default SafeAreaContainerView;
