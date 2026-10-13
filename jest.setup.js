/* eslint-env jest */
// Native modules have no JS implementation under Jest; stub the ones the
// app imports at module load time.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock'),
);

jest.mock('react-native-extra-dimensions-android', () => ({
  get: () => 0,
  getRealWindowHeight: () => 0,
  getRealWindowWidth: () => 0,
  getStatusBarHeight: () => 0,
  getSoftMenuBarHeight: () => 0,
  getSmartBarHeight: () => 0,
  isSoftMenuBarEnabled: () => false,
}));

jest.mock('react-native-permissions', () =>
  require('react-native-permissions/mock'),
);

require('react-native-gesture-handler/jestSetup');

jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);

jest.mock('react-native-device-info', () =>
  require('react-native-device-info/jest/react-native-device-info-mock'),
);

// Generic stub: every export is a jest.fn resolving to undefined, and the
// default export behaves the same. Enough for modules that are only imported
// (not rendered) during the App smoke test.
const stubModule = () => {
  const handler = {
    get: (target, prop) => {
      if (prop === '__esModule') return true;
      if (prop === 'default') return new Proxy({}, handler);
      if (prop === 'then') return undefined;
      if (!(prop in target)) {
        target[prop] = jest.fn(() => Promise.resolve());
      }
      return target[prop];
    },
  };
  return new Proxy({}, handler);
};

[
  '@notifee/react-native',
  '@react-native-google-signin/google-signin',
  '@react-native-firebase/app',
  'react-native-fbsdk-next',
  'react-native-maps',
  'react-native-splash-screen',
  '@react-native-community/blur',
  'react-native-date-picker',
  'react-native-google-places-autocomplete',
  'react-native-keyboard-manager',
].forEach(name => jest.mock(name, stubModule, {virtual: false}));
