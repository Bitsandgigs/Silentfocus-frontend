import NetInfo from '@react-native-community/netinfo';

import Constants from '../src/utils/theme/constants';
import Emitter from '../src/utils/theme/emitter';

// Minimal axios stand-in that runs the app's interceptors around a fake
// transport, so APICall's real error handling is exercised.
const mockHandlers = {};
const mockTransport = jest.fn();
jest.mock('axios', () => {
    const instance = async config => {
        const cfg = mockHandlers.request({...config, headers: {...config.headers}});
        try {
            return await mockTransport(cfg);
        } catch (error) {
            // Like axios: the rejected request's config travels with the error.
            if (!error.config) error.config = cfg;
            return mockHandlers.responseError(error);
        }
    };
    instance.interceptors = {
        request: {use: fn => (mockHandlers.request = fn)},
        response: {
            use: (ok, err) => {
                mockHandlers.responseOk = ok;
                mockHandlers.responseError = err;
            },
        },
    };
    return {__esModule: true, default: {create: () => instance}};
});

const APICall = require('../src/utils/api/api').default;
const {toErrorResult} = require('../src/utils/api/api');

const httpError = (status, data) =>
    Object.assign(new Error(`HTTP ${status}`), {response: {status, data}});

let logoutListener;
let subscription;

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    Constants.commonConstant.appToken = 'secret-token';
    NetInfo.fetch.mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
    });
    logoutListener = jest.fn();
    subscription = Emitter.addListener(
        Constants.eventListenerKeys.logoutListener,
        logoutListener,
    );
});

afterEach(() => {
    subscription.remove();
    console.log.mockRestore?.();
});

const flush = () => new Promise(r => setImmediate(r));

test('sends the Bearer token and never logs it', async () => {
    const logSpy = console.log;
    mockTransport.mockResolvedValue({status: 200, data: {status: '1'}});

    const res = await APICall('get', {page: 1}, 'silent-zones');

    expect(res).toEqual({statusCode: 200, data: {status: '1'}});
    expect(mockTransport.mock.calls[0][0].headers.Authorization).toBe(
        'Bearer secret-token',
    );
    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logged).not.toContain('secret-token');
});

test('401 clears the session', async () => {
    mockTransport.mockRejectedValue(httpError(401, {message: 'Unauthenticated.'}));

    const res = await APICall('get', null, 'profile');
    await flush();

    expect(res.statusCode).toBe(401);
    expect(res.isAuthError).toBe(true);
    expect(Constants.commonConstant.appToken).toBe('');
    expect(logoutListener).toHaveBeenCalledTimes(1);
});

test("backend's 500 'Unauthenticated.' clears the session", async () => {
    mockTransport.mockRejectedValue(httpError(500, {detail: 'Unauthenticated.'}));

    const res = await APICall('get', null, 'profile');
    await flush();

    expect(res.isAuthError).toBe(true);
    expect(logoutListener).toHaveBeenCalledTimes(1);
});

test('a real 500 does NOT log the user out', async () => {
    mockTransport.mockRejectedValue(httpError(500, {detail: 'Server Error'}));

    const res = await APICall('get', null, 'silent-zones');
    await flush();

    expect(res).toEqual({statusCode: 500, data: {detail: 'Server Error'}});
    expect(Constants.commonConstant.appToken).toBe('secret-token');
    expect(logoutListener).not.toHaveBeenCalled();
});

test('a network failure does NOT log the user out', async () => {
    mockTransport.mockRejectedValue(new Error('Network Error'));

    const res = await APICall('get', null, 'silent-zones');
    await flush();

    expect(res).toMatchObject({statusCode: 0, isNetworkError: true});
    expect(Constants.commonConstant.appToken).toBe('secret-token');
    expect(logoutListener).not.toHaveBeenCalled();
});

test('offline short-circuits with a result object and keeps the session', async () => {
    NetInfo.fetch.mockResolvedValue({isConnected: false});
    const offlineListener = jest.fn();
    const sub = Emitter.addListener(
        Constants.eventListenerKeys.internetConnectionListener,
        offlineListener,
    );

    const res = await APICall('get', null, 'silent-zones');

    expect(res).toMatchObject({isOffline: true, isNetworkError: true});
    expect(mockTransport).not.toHaveBeenCalled();
    expect(offlineListener).toHaveBeenCalledTimes(1);
    expect(Constants.commonConstant.appToken).toBe('secret-token');
    sub.remove();
});

test('401 without a stored token (wrong password at login) is shown, not treated as session expiry', async () => {
    Constants.commonConstant.appToken = '';
    mockTransport.mockRejectedValue(
        httpError(401, {status: '0', message: 'Invalid credentials.'}),
    );

    const res = await APICall('post', {email: 'a', password: 'b'}, 'login');
    await flush();

    expect(res).toEqual({
        statusCode: 401,
        data: {status: '0', message: 'Invalid credentials.'},
    });
    expect(res.isAuthError).toBeUndefined();
    expect(logoutListener).not.toHaveBeenCalled();
});

test('toErrorResult keeps backend validation errors intact', () => {
    expect(toErrorResult(httpError(422, {message: 'Invalid email format.'}))).toEqual({
        statusCode: 422,
        data: {message: 'Invalid email format.'},
    });
});
