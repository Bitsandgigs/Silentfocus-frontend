import { Keyboard } from 'react-native';

// Lib
import Axios from 'axios';

// API Config
import APIConfig from '../../config';

// Mics Constants
import { apiStatusCode, commonConstant } from '../theme/constants';
import { checkInternetConnection } from '../../function/commonFunctions';
import { bearerFor, handleAuthRejected, isAuthFailure } from '../session';
import { Constants, Emitter } from '../theme';

const axiosInstance = Axios.create({
  baseURL: APIConfig.baseURL,
  headers: APIConfig.headers,
  timeout: APIConfig.timeout,
});

// Debug-only request trace. Never logs headers (bearer token), request
// bodies (passwords, notification contents) or response bodies.
const debugTrace = (method, url, status) => {
  if (__DEV__) {
    console.log(`[API] ${String(method).toUpperCase()} ${url} -> ${status}`);
  }
};

axiosInstance.interceptors.request.use(
  config => {
    const { appToken } = commonConstant;
    // The 401 confirmation carries the token it checks.
    if (appToken && !config.sfAuthProbe) {
      // Backend (Laravel Sanctum) requires the "Bearer" scheme
      config.headers.Authorization = bearerFor(appToken);
    }
    return config;
  },
  error => Promise.reject(error),
);

// Read-only authenticated request used to confirm a 401 before the session
// is treated as expired: 'REJECTED' (auth failure again), 'VALID' (any
// other answer from the server - the token works) or 'UNKNOWN' (network
// error / 5xx: nothing is decided). Never logs the token.
export const AUTH_PROBE_ENDPOINT = 'settings';

export const confirmSessionRejected = async token => {
  try {
    await axiosInstance({
      method: 'get',
      url: AUTH_PROBE_ENDPOINT,
      headers: { Authorization: bearerFor(token) },
      sfAuthProbe: true,
    });
    return 'VALID';
  } catch (error) {
    const response = error?.response;
    if (!response) return 'UNKNOWN';
    if (isAuthFailure(response.status, response.data)) return 'REJECTED';
    return response.status >= 500 ? 'UNKNOWN' : 'VALID';
  }
};

axiosInstance.interceptors.response.use(
  response => response,
  error => {
    // Only a confirmed auth rejection ends the session - and then as an
    // expiry that keeps the account's data (session.handleAuthRejected);
    // 403s, 5xx and network errors leave the user signed in.
    const response = error?.response;
    if (
      response &&
      !error?.config?.sfAuthProbe &&
      isAuthFailure(response.status, response.data)
    ) {
      handleAuthRejected(error?.config?.headers, { confirm: confirmSessionRejected });
    }
    return Promise.reject(error);
  },
);

const getFormData = object => {
  const formData = new FormData();
  Object.keys(object).forEach(key => formData.append(key, object[key]));
  return formData;
};

// Turns an axios error into the {statusCode, data} shape screens consume.
// `sentToken`: only a request that carried a session token can have its
// session rejected; a 401 from e.g. login (wrong password) is shown as-is.
// Exported for tests.
export const toErrorResult = (error, sentToken = false) => {
  const response = error?.response;
  if (response) {
    if (sentToken && isAuthFailure(response.status, response.data)) {
      return {
        statusCode: apiStatusCode.unAuthorized,
        data: response.data,
        isAuthError: true,
      };
    }
    return { statusCode: response.status, data: response.data };
  }
  return {
    statusCode: apiStatusCode.networkError,
    data: null,
    isNetworkError: true,
    message: error?.message || 'Network Error',
  };
};

const APICall = async (
  method = 'post',
  body,
  url = '',
  headers = {},
  formData = false,
  keyboardOff = true,
) => {
  if (keyboardOff) {
    Keyboard.dismiss();
  }
  const internet = await checkInternetConnection();
  if (!internet) {
    Emitter.emit(Constants.eventListenerKeys.internetConnectionListener);
    return {
      statusCode: apiStatusCode.networkError,
      data: null,
      isNetworkError: true,
      isOffline: true,
    };
  }
  const apiMethod = method.toLowerCase();
  const config = {
    method: apiMethod,
  };

  if (url) {
    config.url = url;
  }
  if (body && apiMethod === 'get') {
    config.params = body;
  } else if (
    body &&
    (apiMethod === 'post' || apiMethod === 'patch') &&
    !formData
  ) {
    config.data = body;
  } else if (
    body &&
    (apiMethod === 'post' || apiMethod === 'patch') &&
    formData
  ) {
    headers = { 'Content-Type': 'multipart/form-data' };
    config.data = getFormData(body);
  } else {
    config.data = body;
  }
  if (headers) {
    config.headers = headers;
  }

  const sentToken = !!commonConstant.appToken;
  try {
    const res = await axiosInstance(config);
    debugTrace(apiMethod, url, res.status);
    return { statusCode: res.status, data: res.data };
  } catch (error) {
    const result = toErrorResult(error, sentToken);
    debugTrace(
      apiMethod,
      url,
      result.isNetworkError ? `network error (${result.message})` : result.statusCode,
    );
    return result;
  }
};

export default APICall;
