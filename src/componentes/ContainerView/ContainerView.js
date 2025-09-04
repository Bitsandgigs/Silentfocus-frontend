import React from 'react';
import {View} from 'react-native';
import {styles} from './ContainerViewStyle';

const ContainerView = ({children}) => {
    return <View style={styles.viewContainer}>{children}</View>;
};

export default ContainerView;
