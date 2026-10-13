import { createContext, useEffect, useReducer, useState } from 'react';
import { Alert } from 'react-native';

// Lib
import NetInfo, { addEventListener } from '@react-native-community/netinfo';

// Mics Constants
import { getAsyncData } from '../../function/commonFunctions';
import { Constants, Emitter } from '../theme';
import { applySession, clearSession, discardCredentials, loadSession } from '../session';
import { ACCOUNT_SWITCH_BLOCKED_MESSAGE, CLAIM_BLOCKED, claimLocalHistory, ensureSignedOut } from '../outbox';
import { loadAppConfig } from '../appConfig';

// A connection counts as online unless NetInfo positively says otherwise.
export const isOnline = netState =>
  !!netState?.isConnected && netState?.isInternetReachable !== false;

// Create Context
export const AppContext = createContext({
  isSplashShow: true,
  setIsSplashShow: () => { },
  isGetStarted: true,
  setIsGetStarted: () => { },
  isLogin: false,
  setIsLogin: () => { },
  isSessionLoaded: false,
  isInternetConnection: true,
  setIsInternetConnection: () => { },
  constantValue: Constants.commonConstant.appUser,
  updateConstantValue: () => { },
});

const constantsReducer = (state, action) => {
  switch (action.type) {
    case 'UPDATE_CONSTANT':
      return { ...state, constantValue: action.payload };
    default:
      return state;
  }
};

export default function ContextProvider(props) {
  // props
  const { children } = props;

  // useState
  const [isSplashShow, setIsSplashShow] = useState(true);
  const [isGetStarted, setIsGetStarted] = useState(true);
  const [isInternetConnection, setIsInternetConnection] = useState(true);
  const [isLogin, setIsLogin] = useState(false);
  const [isSessionLoaded, setIsSessionLoaded] = useState(false);

  const [state, dispatch] = useReducer(constantsReducer, {
    constantValue: Constants.commonConstant.appUser,
  });

  // Update constant value
  const updateConstantValue = newValue => {
    dispatch({ type: 'UPDATE_CONSTANT', payload: newValue });
  };

  // useEffect
  useEffect(() => {
    InitialAppSetUp();
  }, []);

  useEffect(() => {
    // Connectivity only drives the offline banner; it never touches isLogin.
    const unsubscribe = addEventListener(netState => {
      setIsInternetConnection(isOnline(netState));
    });

    return () => {
      unsubscribe();
      Emitter.removeAllListeners();
    };
  }, []);

  //   Function
  const InitialAppSetUp = () => {
    // Public config (GET /app-config): background only. Cached/default
    // values apply until it answers; failure or offline changes nothing.
    loadAppConfig().catch(() => null);

    getAsyncData(Constants.asyncStorageKeys.showGetStarted).then(response => {
      if (response === true) {
        setIsGetStarted(false);
      }
    });

    // Token and user are restored together, and the token is in memory
    // before isLogin flips, so Home's first requests are authenticated.
    loadSession()
      .then(async session => {
        if (session) {
          // Local history must be this account's before it is shown.
          if ((await claimLocalHistory(session.user?.user_id)) === CLAIM_BLOCKED) {
            await discardCredentials();
            setIsLogin(false);
            Alert.alert('Silent Focus', ACCOUNT_SWITCH_BLOCKED_MESSAGE);
            return;
          }
          applySession(session);
          updateConstantValue(session.user);
          setIsLogin(true);
        } else {
          // Signed out: finish a sign-out that was cut short (engine still
          // silencing or holding rules), keeping its pending data.
          setIsLogin(false);
          await ensureSignedOut();
          // Half-written session (e.g. user without token): start clean.
          getAsyncData(Constants.asyncStorageKeys.userData).then(data => {
            if (data !== null) {
              clearSession();
            }
          });
        }
      })
      .catch(() => setIsLogin(false))
      .finally(() => setIsSessionLoaded(true));

    Emitter.addListener(
      Constants.eventListenerKeys.internetConnectionListener,
      () => {
        // APICall saw no connection; confirm with NetInfo so a transient
        // failed check doesn't leave the banner stuck on.
        NetInfo.fetch()
          .then(netState => setIsInternetConnection(isOnline(netState)))
          .catch(() => setIsInternetConnection(false));
      },
    );

    Emitter.addListener(
      Constants.eventListenerKeys.logoutListener,
      () => {
        setIsLogin(false);
        updateConstantValue(Constants.commonConstant.appUser);
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
        isSessionLoaded,
        isInternetConnection,
        setIsInternetConnection,
        ...state,
        updateConstantValue,
      }}>
      {children}
    </AppContext.Provider>
  );
}
