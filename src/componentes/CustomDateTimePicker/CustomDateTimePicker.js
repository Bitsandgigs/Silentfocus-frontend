import React, {useEffect, useState} from 'react';
import DatePicker from 'react-native-date-picker';
// Lib
import moment from 'moment';

// Mics Constants
import {Colors} from '../../utils/theme';
import CustomBottomSheetModal from '../CustomBottomSheetModal/CustomBottomSheetModal';

// Custom Component
import CustomButton from '../CustomButton/CustomButton';
import {styles} from './CustomDateTimePickerStyle';

export default function CustomDateTimePicker(props) {
    const {
        date = moment().toDate(),
        onChange,
        onCancel,
        isModalVisible = false,
        modePicker = 'time',
        minDate = moment().subtract(100, 'years').toDate(),
        maxDate = moment().add(100, 'years').toDate(),
        confirmButtonText = 'Confirm',
        title,
        isShowCloseButton = false,
    } = props;
    const [selectedDate, setSelectedDate] = useState(moment().toDate());
    const [isShowModal, setIsShowModal] = useState(false);

    useEffect(() => {
        setIsShowModal(isModalVisible);
    }, [isModalVisible]);

    useEffect(() => {
        console.log('date=========', date);
        setSelectedDate(date);
    }, [date]);

    const onChangeDate = dateSelected => {
        setSelectedDate(dateSelected);
    };

    const onPressDone = () => {
        if (onChange) onChange(selectedDate);
    };

    const onPressCancel = () => {
        if (onCancel) onCancel();
    };

    return (
        <CustomBottomSheetModal
            modalVisible={isShowModal}
            onCancelModal={onPressCancel}
            title={title}
            isShowCloseButton={isShowCloseButton}>
            <>
                <DatePicker
                    style={styles.datePickerStyle}
                    date={selectedDate}
                    mode={modePicker}
                    onDateChange={onChangeDate}
                    androidVariant={'iosClone'}
                    textColor={Colors.black}
                    minimumDate={minDate}
                    maximumDate={maxDate}
                    is24hourSource={'device'}
                    locale={'en-US'}
                    theme={'light'}
                />
                <CustomButton title={confirmButtonText} onPress={onPressDone} />
            </>
        </CustomBottomSheetModal>
    );
}
