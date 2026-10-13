module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.setup.js'],
  // RN libraries ship untranspiled ESM; let babel-jest transform them.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|@react-native-async-storage|@react-native-firebase|@react-native-google-signin|@notifee|react-native-.*)/)',
  ],
};
