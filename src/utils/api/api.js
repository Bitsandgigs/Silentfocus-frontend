import { Keyboard } from 'react-native';

// Lib
import Axios from 'axios';

// API Config
import APIConfig from '../../config';

// Mics Constants
import { apiStatusCode, commonConstant } from '../theme/constants';
import { checkInternetConnection, logout } from '../../function/commonFunctions';
import { Constants, Emitter } from '../theme';

const axiosInstance = Axios.create({
  baseURL: APIConfig.baseURL,
  headers: APIConfig.headers,
});

axiosInstance.interceptors.request.use(
  async config => {
    const { appToken } = commonConstant;
    if (appToken !== '') {
      config.headers.Authorization = appToken;
    }
    console.log('config =====', config);
    return config;
  },
  error => {
    return Promise.reject(error);
  },
);

axiosInstance.interceptors.response.use(
  async response => {
    return response;
  },
  error => {
    const status = error?.response?.status;
    if (status === apiStatusCode.invalidContent) {
      // Handle invalidContent
    } else if (status === apiStatusCode.unAuthorized) {
      if (Constants.commonConstant.appToken) {
        logout();
      }
    } else if (status === 403) {
      // Handle forbidden
    } else if (status === apiStatusCode.serverError) {
      // Handle serverError
    }
    return Promise.resolve(error?.response);
  },
);

const getFormData = object => {
  const formData = new FormData();
  Object.keys(object).forEach(key => formData.append(key, object[key]));
  return formData;
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
    return;
  }
  const apiMethod = method.toLowerCase();
  const config = {
    method: apiMethod,
    timeout: 1000 * 60 * 2,
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

  return new Promise(resolve => {
    axiosInstance(config)
      .then(res => {
        resolve({ statusCode: res.status, data: res.data });
      })
      .catch(error => {
        console.log('error =====', JSON.stringify(error));
        if (error?.response) {
          resolve({
            statusCode: error.response.status,
            data: error.response.data,
          });
        }
        resolve({ statusCode: 500, data: 'Something went to wrong!' });
      });
  });
};

export default APICall;
