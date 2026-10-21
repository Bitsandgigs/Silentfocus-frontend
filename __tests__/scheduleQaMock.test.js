jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../src/utils/buildConfig', () => ({SCHEDULE_QA_MOCK: true}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {clearScheduleQaRows, scheduleQaResponse} from '../src/utils/scheduleQaMock';

describe('FieldTest-only schedule QA adapter', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
    });

    test('isolates create, list, edit, toggle and delete', async () => {
        await scheduleQaResponse('post', {
            from_time: '09:00',
            to_time: '10:00',
            days: 'Monday, Friday',
            timezone: 'Asia/Kolkata',
        }, 'scheduleTimerData');
        let listed = await scheduleQaResponse('get', {userId: 1}, 'get-scheduleTimerData');
        expect(listed.data.result).toHaveLength(1);
        expect(listed.data.result[0]).toMatchObject({selected_days: 'Monday, Friday', isTimerEnabled: false});

        const id = listed.data.result[0].schedule_id;
        await scheduleQaResponse('put', {
            from_time: '11:00', to_time: '12:00', days: 'Tuesday',
        }, `scheduleTimerData/${id}`);
        await scheduleQaResponse('post', {schedule_id: id, isTimerEnabled: true}, 'post-timerSchedule');
        listed = await scheduleQaResponse('get', null, 'get-scheduleTimerData');
        expect(listed.data.result[0]).toMatchObject({from_time: '11:00', selected_days: 'Tuesday', isTimerEnabled: true});

        await scheduleQaResponse('delete', null, `scheduleTimerData/${id}?userId=1`);
        listed = await scheduleQaResponse('get', null, 'get-scheduleTimerData');
        expect(listed.data).toEqual({status: '0', result: []});
    });

    test('cleanup removes only the isolated namespace', async () => {
        await AsyncStorage.setItem('normal-app-data', 'keep');
        await scheduleQaResponse('post', {from_time: '09:00', to_time: '10:00', days: 'Monday'}, 'scheduleTimerData');
        await clearScheduleQaRows();
        expect(await AsyncStorage.getItem('normal-app-data')).toBe('keep');
        expect((await scheduleQaResponse('get', null, 'get-scheduleTimerData')).data.result).toEqual([]);
    });
});
