// Thin wrappers around the backend routes that don't have a screen wired up
// yet (Devices/FCM, Permissions, generic Settings, Geofence, Auto Response
// Templates/History, backend Calendar, Silent Sessions, Active Rules, Logs,
// Notifications, Location Master). Each function just forwards to APICall
// and resolves the same {statusCode, data} shape APICall already returns -
// screens can add their own status-code/Alert handling when the matching UI
// is built, the same way LoginScreen/HomeScreen/etc. already do.

import EndPoints from './endpoints';
import APICall from './api';

// Profile (self, no user_id needed)
export const getProfile = () => APICall('get', null, EndPoints.getProfile);
export const updateProfileSelf = payload => APICall('put', payload, EndPoints.updateProfileSelf);

// Dashboard
export const getDashboard = () => APICall('get', null, EndPoints.getDashboard);

// Devices
export const getDevices = (params = {}) => APICall('get', params, EndPoints.getDevices);
export const registerDevice = payload => APICall('post', payload, EndPoints.registerDevice);
export const getDeviceDetail = deviceId => APICall('get',null,EndPoints.getDeviceDetail.replace('{device_id}', deviceId));
export const updateDevice = (deviceId, payload) => APICall('put',payload,EndPoints.updateDevice.replace('{device_id}', deviceId));
export const deleteDevice = deviceId => APICall('delete',null,EndPoints.deleteDevice.replace('{device_id}', deviceId));
export const updateFcmToken = payload => APICall('post', payload, EndPoints.updateFcmToken);
export const postDeviceLocation = payload => APICall('post', payload, EndPoints.postDeviceLocation);
export const deviceHeartbeat = payload => APICall('post', payload, EndPoints.deviceHeartbeat);

// Permissions
export const getPermissions = deviceId => APICall('get', { device_id: deviceId }, EndPoints.getPermissions);
export const syncPermissions = payload => APICall('post', payload, EndPoints.syncPermissions);

// Settings (generic app settings, distinct from control modes)
export const getSettings = () => APICall('get', null, EndPoints.getSettings);
export const updateSettings = payload => APICall('put', payload, EndPoints.updateSettings);

// Geofence
export const getGeofenceCategories = () => APICall('get', null, EndPoints.getGeofenceCategories);
export const getGeofenceLocations = (params = {}) => APICall('get', params, EndPoints.getGeofenceLocations);
export const createGeofenceLocation = payload => APICall('post', payload, EndPoints.createGeofenceLocation);
export const getGeofenceLocationDetail = locId => APICall('get',null,EndPoints.getGeofenceLocationDetail.replace('{loc_id}', locId));
export const updateGeofenceLocation = (locId, payload) => APICall('put',payload,EndPoints.updateGeofenceLocation.replace('{loc_id}', locId));
export const deleteGeofenceLocation = locId => APICall('delete',null,EndPoints.deleteGeofenceLocation.replace('{loc_id}', locId));
export const checkGeofence = payload => APICall('post', payload, EndPoints.checkGeofence);
export const getNearbyGeofences = payload => APICall('post', payload, EndPoints.getNearbyGeofences);
export const getGeofencePreferences = () => APICall('get', null, EndPoints.getGeofencePreferences);
export const updateGeofencePreferences = payload => APICall('post', payload, EndPoints.updateGeofencePreferences);

// Auto Response Templates
export const getAutoResponseTemplates = (params = {}) => APICall('get', params, EndPoints.getAutoResponseTemplates);
export const createAutoResponseTemplate = payload => APICall('post', payload, EndPoints.createAutoResponseTemplate);
export const getAutoResponseTemplateDetail = templateId => APICall('get', null, EndPoints.getAutoResponseTemplateDetail.replace('{template_id}', templateId));
export const updateAutoResponseTemplate = (templateId, payload) => APICall('put', payload, EndPoints.updateAutoResponseTemplate.replace('{template_id}', templateId));
export const deleteAutoResponseTemplate = templateId => APICall('delete', null, EndPoints.deleteAutoResponseTemplate.replace('{template_id}', templateId));
export const setDefaultAutoResponseTemplate = templateId => APICall('post', null, EndPoints.setDefaultAutoResponseTemplate.replace('{template_id}', templateId));

// Calendar (backend-connected calendar, distinct from the device-native
// calendar already used for "Create Calendar Schedules")
export const getCalendarStatus = () => APICall('get', null, EndPoints.getCalendarStatus);
export const connectCalendar = payload => APICall('post', payload, EndPoints.connectCalendar);
export const disconnectCalendar = () => APICall('post', null, EndPoints.disconnectCalendar);
export const syncCalendar = payload => APICall('post', payload, EndPoints.syncCalendar);
export const getCalendarEvents = (params = {}) => APICall('get', params, EndPoints.getCalendarEvents);
export const getUpcomingCalendarEvents = () => APICall('get', null, EndPoints.getUpcomingCalendarEvents);

// Silent Sessions
export const getSilentSessions = (params = {}) => APICall('get', params, EndPoints.getSilentSessions);
export const startSilentSession = payload => APICall('post', payload, EndPoints.startSilentSession);
export const getActiveSilentSession = () => APICall('get', null, EndPoints.getActiveSilentSession);
export const getSilentSessionDetail = sessionId => APICall('get', null, EndPoints.getSilentSessionDetail.replace('{session_id}', sessionId));
export const endSilentSession = (sessionId, payload) => APICall('post', payload, EndPoints.endSilentSession.replace('{session_id}', sessionId));
export const getSilentSessionSummary = sessionId => APICall('get', null, EndPoints.getSilentSessionSummary.replace('{session_id}', sessionId));
export const getSilentSessionLogs = (sessionId, params = {}) => APICall('get', params, EndPoints.getSilentSessionLogs.replace('{session_id}', sessionId));

// Active Rules
export const getActiveRules = () => APICall('get', null, EndPoints.getActiveRules);
export const addActiveRule = payload => APICall('post', payload, EndPoints.addActiveRule);
export const endActiveRule = (ruleId, payload) => APICall('post', payload, EndPoints.endActiveRule.replace('{rule_id}', ruleId));

// Logs (generic, session-scoped)
export const getLogs = (params = {}) => APICall('get', params, EndPoints.getLogs);
export const addLogs = payload => APICall('post', payload, EndPoints.addLogs)

export const addBulkLogs = payload => APICall('post', payload, EndPoints.addBulkLogs);
// Auto Response History
export const getAutoResponseHistory = (params = {}) => APICall('get', params, EndPoints.getAutoResponseHistory);
export const addAutoResponseHistory = payload => APICall('post', payload, EndPoints.addAutoResponseHistory);
// Notifications
export const getNotificationSettings = () => APICall('get', null, EndPoints.getNotificationSettings);
export const updateNotificationSettings = payload => APICall('put', payload, EndPoints.updateNotificationSettings);
export const getNotifications = (params = {}) => APICall('get', params, EndPoints.getNotifications);

export const readNotification = notificationId => APICall('post', null, EndPoints.readNotification.replace('{notification_id}', notificationId));
export const readAllNotifications = () => APICall('post', null, EndPoints.readAllNotifications);

// Sync
export const offlineSync = payload => APICall('post', payload, EndPoints.offlineSync);
// Location Master
export const getCountries = (params = {}) => APICall('get', params, EndPoints.getCountries);
export const getStates = (countryId, params = {}) => APICall('get', { country_id: countryId, ...params }, EndPoints.getStates);
