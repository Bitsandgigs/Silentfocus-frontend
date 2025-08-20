import {createContext, useEffect, useReducer, useState} from 'react';

// Lib
import {addEventListener} from '@react-native-community/netinfo';

// Mics Constants
import {getAsyncData} from '../../function/commonFunctions';
import {Constants, Emitter} from '../theme';

// Create Context
export const AppContext = createContext({
  isSplashShow: true,
  setIsSplashShow: () => {},
  isGetStarted: true,
  setIsGetStarted: () => {},
  isLogin: false,
  setIsLogin: () => {},
  isInternetConnection: true,
  setIsInternetConnection: () => {},
  constantValue: Constants.commonConstant.appUser,
  updateConstantValue: () => {},
});

const constantsReducer = (state, action) => {
  switch (action.type) {
    case 'UPDATE_CONSTANT':
      return {...state, constantValue: action.payload};
    default:
      return state;
  }
};

export default function ContextProvider(props) {
  // props
  const {children} = props;

  // useState
  const [isSplashShow, setIsSplashShow] = useState(true);
  const [isGetStarted, setIsGetStarted] = useState(true);
  const [isInternetConnection, setIsInternetConnection] = useState(true);
  const [isLogin, setIsLogin] = useState(false);

  const [state, dispatch] = useReducer(constantsReducer, {
    constantValue: Constants.commonConstant.appUser,
  });

  // Update constant value
  const updateConstantValue = newValue => {
    dispatch({type: 'UPDATE_CONSTANT', payload: newValue});
  };

  // useEffect
  useEffect(() => {
    InitialAppSetUp();
  }, []);

  useEffect(() => {
    const unsubscribe = addEventListener(state => {
      if (state.isConnected) {
        setIsInternetConnection(state.isConnected);
      } else {
        setIsInternetConnection(false);
        setIsLogin(false);
      }
    });

    return () => {
      unsubscribe();
      Emitter.removeAllListeners();
    };
  }, []);

  //   Function
  const InitialAppSetUp = () => {
    getAsyncData(Constants.asyncStorageKeys.showGetStarted).then(response => {
      if (response === true) {
        setIsGetStarted(false);
      }
    });

    getAsyncData(Constants.asyncStorageKeys.userBaseURL).then(response => {
      if (response !== null) {
        Constants.commonConstant.appBaseURL = response;
      }
    });

    getAsyncData(Constants.asyncStorageKeys.userToken).then(token => {
      if (token !== null) {
        Constants.commonConstant.appToken = `Bearer ${token}`;
      }
    });

    getAsyncData(Constants.asyncStorageKeys.isLoginUser).then(response => {
      if (response === true) {
        setIsLogin(true);
      } else {
        setIsLogin(false);
      }
    });

    // getAsyncData(Constants.asyncStorageKeys.userData).then(data => {
    //   if (data !== null) {
    //     Constants.commonConstant.appUser = data;
    //     Constants.commonConstant.appUserId = data?.id;
    //     updateConstantValue(data);
    //     setIsLogin(true);
    //   } else {
    //     setIsLogin(false);
    //   }
    // });

    getAsyncData(Constants.asyncStorageKeys.pusherData).then(data => {
      if (data !== null) {
        Constants.commonConstant.appPusherData = data;
      }
    });

    Emitter.addListener(
      Constants.eventListenerKeys.internetConnectionListener,
      async () => {
        setIsInternetConnection(false);
      },
    );

    Emitter.addListener(
      Constants.eventListenerKeys.logoutListener,
      async () => {
        setIsLogin(false);
        setIsGetStarted(true);
      },
    );
  };

  // Render Component
  return (
    <AppContext.Provider
      value={{
        isSplashShow,
        setIsSplashShow,
        isGetStarted,
        setIsGetStarted,
        isLogin,
        setIsLogin,
        isInternetConnection,
        setIsInternetConnection,
        ...state,
        updateConstantValue,
      }}>
      {children}
    </AppContext.Provider>
  );
}
