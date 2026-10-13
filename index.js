/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

// Release builds must not leak data through device logs (logcat). Errors are
// kept, and the few that remain never include tokens or message contents.
if (!__DEV__) {
    const noop = () => {};
    console.log = noop;
    console.info = noop;
    console.debug = noop;
    console.warn = noop;
}

// Notifications are handled natively (android/.../comms/
// SilentFocusNotificationListener): messages while Silent Focus is on and
// automated replies work without a JS runtime.

AppRegistry.registerComponent(appName, () => App);
