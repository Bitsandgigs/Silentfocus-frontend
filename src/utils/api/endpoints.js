// Backend routes are served from the API root (https://silent.rpaywin.com/),
// NOT under /api. Paths are relative (no leading slash) to the baseURL.
const EndPoints = {
    // App bootstrap (public)
    appConfig: 'app-config',

    // Auth Flow
    login: 'login',
    register: 'signup',
    verifyOtp: 'verify-otp',
    setscheduleTimerData: 'scheduleTimerData',
    getScheduleTimerData: 'get-scheduleTimerData',
    postTimerSchedule: 'post-timerSchedule',
    scheduleTimerCalendarEventData: 'scheduleTimerCalendarEventData',
    forgotPassword: 'forgot-password',
    resetPassword: 'reset-password',
    resetNewPassword: 'create-new-password',
    resendOtp: 'resend-otp',
    scheduleTimerDataDelete: 'scheduleTimerData/{schedule_id}',
    getScheduleTimerDetail: 'scheduleTimerData/{schedule_id}',
    logOut: 'logout',
    // Authenticated; deletes/anonymises the signed-in account and revokes
    // all of its tokens.
    deleteAccount: 'account',
    // Authenticated; stores feedback from the Accounts screen.
    feedback: 'feedback',
    EditScheduleTimerData: 'scheduleTimerData/{schedule_id}',
    setControlModes: 'control/modes',
    getControlModes: 'control/modes',
    updateProfile: 'users/{user_id}',
    getUserProfile: 'users/{user_id}',
    socialLogin: 'v1/social-login',
    whatssAppCalllogs: 'logs',
    getWhatssAppCalllogs: 'logs',
    changePassword: 'change-password',

    // Profile (self, no user_id needed)
    getProfile: 'profile',
    updateProfileSelf: 'profile',

    // Dashboard
    getDashboard: 'dashboard',

    // Devices
    getDevices: 'devices',
    registerDevice: 'devices',
    getDeviceDetail: 'devices/{device_id}',
    updateDevice: 'devices/{device_id}',
    deleteDevice: 'devices/{device_id}',
    updateFcmToken: 'devices/fcm-token',
    postDeviceLocation: 'device-location',
    deviceHeartbeat: 'devices/heartbeat',

    // Permissions
    getPermissions: 'permissions',
    syncPermissions: 'permissions/sync',

    // Settings (generic app settings, distinct from control modes)
    getSettings: 'settings',
    updateSettings: 'settings',

    // Geofence
    getGeofenceCategories: 'geofence/categories',
    getGeofenceLocations: 'geofence/locations',
    createGeofenceLocation: 'geofence/locations',
    getGeofenceLocationDetail: 'geofence/locations/{loc_id}',
    updateGeofenceLocation: 'geofence/locations/{loc_id}',
    deleteGeofenceLocation: 'geofence/locations/{loc_id}',
    checkGeofence: 'geofence/check',
    getNearbyGeofences: 'geofence/nearby',
    getGeofencePreferences: 'geofence/preferences',
    updateGeofencePreferences: 'geofence/preferences',

    // Silent Zones
    getSilentZones: 'silent-zones',
    createSilentZone: 'silent-zones',
    getSilentZoneDetail: 'silent-zones/{zone_id}',
    updateSilentZone: 'silent-zones/{zone_id}',
    deleteSilentZone: 'silent-zones/{zone_id}',
    toggleSilentZoneStatus: 'silent-zones/{zone_id}/status',

    // Auto Response Templates
    getAutoResponseTemplates: 'auto-response-templates',
    createAutoResponseTemplate: 'auto-response-templates',
    getAutoResponseTemplateDetail: 'auto-response-templates/{template_id}',
    updateAutoResponseTemplate: 'auto-response-templates/{template_id}',
    deleteAutoResponseTemplate: 'auto-response-templates/{template_id}',
    setDefaultAutoResponseTemplate: 'auto-response-templates/{template_id}/default',

    // Calendar (backend-connected calendar, distinct from device-native calendar sync)
    getCalendarStatus: 'calendar/status',
    connectCalendar: 'calendar/connect',
    disconnectCalendar: 'calendar/disconnect',
    syncCalendar: 'calendar/sync',
    getCalendarEvents: 'calendar/events',
    getUpcomingCalendarEvents: 'calendar/events/upcoming',

    // Silent Sessions
    getSilentSessions: 'silent-sessions',
    startSilentSession: 'silent-sessions/start',
    getActiveSilentSession: 'silent-sessions/active',
    getSilentSessionDetail: 'silent-sessions/{session_id}',
    endSilentSession: 'silent-sessions/{session_id}/end',
    getSilentSessionSummary: 'silent-sessions/{session_id}/summary',
    getSilentSessionLogs: 'silent-sessions/{session_id}/logs',

    // Active Rules
    getActiveRules: 'active-rules',
    addActiveRule: 'active-rules',
    endActiveRule: 'active-rules/{rule_id}/end',

    // Logs (generic)
    getLogs: 'logs',
    addLogs: 'logs',
    addBulkLogs: 'logs/bulk',

    // Auto Response History
    getAutoResponseHistory: 'auto-response-history',
    addAutoResponseHistory: 'auto-response-history',

    // Notifications
    getNotificationSettings: 'notification-settings',
    updateNotificationSettings: 'notification-settings',
    getNotifications: 'notifications',
    readNotification: 'notifications/{notification_id}/read',
    readAllNotifications: 'notifications/read-all',

    // Sync
    offlineSync: 'sync',

    // Location Master
    getCountries: 'countries',
    getStates: 'states',
    getCities: 'cities',
};

export default EndPoints;
