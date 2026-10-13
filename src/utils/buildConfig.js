// Build-time configuration provided by the native app (Android BuildConfig,
// filled from the gitignored android/local.properties or CI secrets).
// Nothing secret is committed to the JS source.

import {NativeModules} from 'react-native';

const constants = NativeModules.SilentFocus || {};

// Google Places autocomplete key. Empty when not configured (search then
// shows an error; current location and map tapping still work). iOS has no
// native source for it yet - see the Phase 5 report.
export const MAPS_API_KEY = typeof constants.mapsApiKey === 'string' ? constants.mapsApiKey : '';

export const IS_DEBUG_BUILD = !!constants.isDebugBuild;

// Debug builds only: numeric user id of a dedicated test account that may
// receive server writes (set via SF_DEBUG_SERVER_WRITES_ACCOUNT_ID at build
// time; empty by default and always empty in release builds).
export const DEBUG_SERVER_WRITES_ACCOUNT_ID =
    typeof constants.debugServerWritesAccountId === 'string' && /^[0-9]+$/.test(constants.debugServerWritesAccountId)
        ? constants.debugServerWritesAccountId
        : '';

// Field-test build type (android `fieldTest`): automatic uploads (activity /
// session sync, auto-reply push, logout pre-sync) are off even though it is
// not a debug build. User actions (sign-in, saving settings) still write.
export const AUTOMATIC_UPLOADS_DISABLED = constants.automaticUploadsDisabled === true;
