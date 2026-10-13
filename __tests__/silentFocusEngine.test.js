// The wrapper must send only engine-shaped rules to native, and be a no-op
// where the native engine doesn't exist (iOS, tests).

describe('on Android with the native module', () => {
    let native;
    let engine;

    beforeEach(() => {
        jest.resetModules();
        const RN = require('react-native');
        RN.Platform.OS = 'android';
        native = {
            getState: jest.fn(() => Promise.resolve({silentActive: false})),
            evaluate: jest.fn(r => Promise.resolve({lastReason: r})),
            setManualSilent: jest.fn(on => Promise.resolve({silentActive: on})),
            setSchedules: jest.fn(() => Promise.resolve({scheduleCount: 1})),
            reset: jest.fn(() => Promise.resolve({})),
            addListener: jest.fn(),
            removeListeners: jest.fn(),
        };
        RN.NativeModules.SilentFocus = native;
        engine = require('../src/utils/silentFocusEngine');
    });

    afterEach(() => {
        delete require('react-native').NativeModules.SilentFocus;
    });

    test('is available', () => {
        expect(engine.isEngineAvailable).toBe(true);
    });

    test('pushes converted rules, skipping calendar rows', async () => {
        await engine.pushSchedulesToEngine([
            {id: 7, startTime: '09:00:00', endTime: '17:00:00', days: ['Monday'], enabled: true, eventType: 'custom'},
            {id: 8, startTime: '13:00:00', endTime: '14:00:00', days: ['Monday'], enabled: true, eventType: 'calendar'},
        ]);
        expect(native.setSchedules).toHaveBeenCalledWith([
            {id: '7', startMinute: 540, endMinute: 1020, days: [1], enabled: true},
        ]);
    });

    test('manual toggle goes to the engine', async () => {
        await expect(engine.setManualSilent(1)).resolves.toEqual({silentActive: true});
        expect(native.setManualSilent).toHaveBeenCalledWith(true);
    });
});

describe('without the native module', () => {
    test('calls resolve to null instead of throwing', async () => {
        jest.resetModules();
        const engine = require('../src/utils/silentFocusEngine');
        expect(engine.isEngineAvailable).toBe(false);
        await expect(engine.getEngineState()).resolves.toBeNull();
        await expect(engine.setManualSilent(true)).resolves.toBeNull();
        await expect(engine.resetEngine()).resolves.toBeNull();
        expect(engine.subscribeEngineState(() => {})).toEqual(expect.any(Function));
    });
});
