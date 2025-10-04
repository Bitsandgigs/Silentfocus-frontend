/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {RNAndroidNotificationListenerHeadlessJsName} from 'react-native-android-notification-listener';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EndPoints from './src/utils/api/endpoints';
import {commonConstant} from './src/utils/theme/constants';
import APICall from './src/utils/api/api';

const WHATSAPP_NOTIFICATIONS_KEY = 'WHATSAPP_NOTIFICATIONS';

export const SendNotificationToApi = async notification => {
    try {
        const payload = {
            userId: commonConstant.appUserId || 0, // ✅ logged-in userId
            data: [notification], // single notification
        };

        const url = EndPoints.whatssAppCalllogs; // 👉 your endpoint

        const response = await APICall('post', payload, url, {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        });

        if (response?.statusCode === 200 && response?.data?.status === '1') {
            console.log('✅ Notification stored in API:', response?.data);
        } else {
            console.warn('⚠️ Failed to store notification in API:', response);
        }
    } catch (err) {
        console.error('❌ Error while sending notification to API:', err);
    }
};

// const saveWhatsappNotification = async newNotification => {
//     try {
//         // Get existing notifications
//         const existingData = await AsyncStorage.getItem(
//             WHATSAPP_NOTIFICATIONS_KEY,
//         );
//         let notifications = existingData ? JSON.parse(existingData) : [];

//         // Add new notification at the top
//         notifications.unshift(newNotification);

//         // Optional: limit to last 100 notifications to avoid storage issues
//         if (notifications.length > 100) {
//             notifications = notifications.slice(0, 100);
//         }

//         // Save updated array
//         await AsyncStorage.setItem(
//             WHATSAPP_NOTIFICATIONS_KEY,
//             JSON.stringify(notifications),
//         );

//         console.log(
//             '✅ Stored WhatsApp notification successfully',
//             newNotification,
//         );
//     } catch (err) {
//         console.error('❌ Error saving WhatsApp notification:', err);
//     }
// };

// const headlessNotificationListener = async notification => {
//     try {
//         let parsed = notification;

//         if (
//             notification?.notification &&
//             typeof notification.notification === 'string'
//         ) {
//             parsed = JSON.parse(notification.notification);
//         } else if (typeof notification === 'string') {
//             parsed = JSON.parse(notification);
//         }

//         // ✅ Only handle WhatsApp + WhatsApp Business
//         if (
//             parsed.app === 'com.whatsapp' ||
//             parsed.app === 'com.whatsapp.w4b'
//         ) {
//             const sender = parsed.title || 'Unknown';
//             const message = parsed.text?.trim() || '';
//             const timestamp = parsed.time
//                 ? new Date(Number(parsed.time)).toLocaleString()
//                 : null;

//             if (!message) return; // skip empty

//             // 🚫 Skip unwanted junk notifications
//             const junkPatterns = [
//                 'calling…',
//                 'ringing…',
//                 'checking for new messages',
//                 'new messages',
//                 'incoming voice call',
//                 'incoming video call',
//             ];

//             const lowerMsg = message.toLowerCase();
//             if (junkPatterns.some(p => lowerMsg.includes(p))) {
//                 return; // skip
//             }

//             // Determine type
//             let type = 'message';
//             if (
//                 lowerMsg.includes('missed voice call') ||
//                 lowerMsg.includes('missed video call')
//             ) {
//                 type = 'call';
//             }

//             const cleanData = {
//                 senderName: sender,
//                 content: message,
//                 type, // "message" or "call"
//                 timestamp,
//             };

//             // ✅ Prevent duplicate save
//             const existingData = await AsyncStorage.getItem(
//                 WHATSAPP_NOTIFICATIONS_KEY,
//             );
//             let notifications = existingData ? JSON.parse(existingData) : [];

//             const alreadyExists = notifications.some(
//                 n =>
//                     n.senderName === cleanData.senderName &&
//                     n.content === cleanData.content &&
//                     n.type === cleanData.type &&
//                     n.timestamp === cleanData.timestamp,
//             );

//             if (alreadyExists) {
//                 console.log('⚠️ Duplicate ignored:', cleanData);
//                 return;
//             }

//             // Save new notification
//             await saveWhatsappNotification(cleanData);

//             console.log('🚀 STORED CLEAN DATA ===>', cleanData);
//         }
//     } catch (err) {
//         console.error('❌ Failed to parse notification:', err, notification);
//     }
// };

// const headlessNotificationListener = async notification => {
//     try {
//         let parsed = notification;

//         if (
//             notification?.notification &&
//             typeof notification.notification === 'string'
//         ) {
//             parsed = JSON.parse(notification.notification);
//         } else if (typeof notification === 'string') {
//             parsed = JSON.parse(notification);
//         }

//         if (
//             parsed.app === 'com.whatsapp' ||
//             parsed.app === 'com.whatsapp.w4b'
//         ) {
//             const sender = parsed.title || 'Unknown';
//             const message = parsed.text?.trim() || '';
//             const timestamp = parsed.time
//                 ? new Date(Number(parsed.time)).toLocaleString()
//                 : null;

//             if (!message) return;

//             const lowerMsg = message.toLowerCase();

//             // 🚫 Skip junk & summary notifications
//             const junkPatterns = [
//                 'calling…',
//                 'ringing…',
//                 'checking for new messages',
//                 'new messages',
//                 'incoming voice call',
//                 'incoming video call',
//                 'messages from', // 👉 filters "4 messages from 2 chats"
//             ];
//             if (junkPatterns.some(p => lowerMsg.includes(p))) return;

//             // Detect type
//             let type = 'message';
//             if (
//                 lowerMsg.includes('missed voice call') ||
//                 lowerMsg.includes('missed video call')
//             ) {
//                 type = 'call';
//             }

//             const cleanData = {
//                 senderName: sender,
//                 content: message,
//                 type,
//                 timestamp,
//             };

//             // Load existing
//             const existingData = await AsyncStorage.getItem(
//                 WHATSAPP_NOTIFICATIONS_KEY,
//             );
//             let notifications = existingData ? JSON.parse(existingData) : [];

//             // ✅ If it's a missed call with "X missed", keep only the latest
//             if (type === 'call' && /\d+ missed/i.test(message)) {
//                 // Remove any older missed-call counts from same sender
//                 notifications = notifications.filter(
//                     n =>
//                         !(
//                             n.senderName === sender &&
//                             n.type === 'call' &&
//                             /\d+ missed/i.test(n.content)
//                         ),
//                 );
//             }

//             // // ✅ Prevent duplicates (same sender + message + type)
//             // const alreadyExists = notifications.some(
//             //     n =>
//             //         n.senderName === cleanData.senderName &&
//             //         n.content === cleanData.content &&
//             //         n.type === cleanData.type,
//             // );
//             const alreadyExists = notifications.some(
//                 n =>
//                     n.senderName === cleanData.senderName &&
//                     n.content === cleanData.content &&
//                     n.type === cleanData.type &&
//                     n.timestamp === cleanData.timestamp,
//             );
//             if (alreadyExists) {
//                 console.log('⚠️ Duplicate ignored:', cleanData);
//                 return;
//             }

//             // Save
//             notifications.unshift(cleanData);
//             if (notifications.length > 100) {
//                 notifications = notifications.slice(0, 100);
//             }
//             await AsyncStorage.setItem(
//                 WHATSAPP_NOTIFICATIONS_KEY,
//                 JSON.stringify(notifications),
//             );

//             console.log('🚀 STORED CLEAN DATA ===>', cleanData);
//         }
//     } catch (err) {
//         console.error('❌ Failed to parse notification:', err, notification);
//     }
// };

const headlessNotificationListener = async notification => {
    try {
        let parsed = notification;

        if (
            notification?.notification &&
            typeof notification.notification === 'string'
        ) {
            parsed = JSON.parse(notification.notification);
        } else if (typeof notification === 'string') {
            parsed = JSON.parse(notification);
        }

        if (
            parsed.app === 'com.whatsapp' ||
            parsed.app === 'com.whatsapp.w4b'
        ) {
            const sender = parsed.title || 'Unknown';
            const message = parsed.text?.trim() || '';
            const timestamp = parsed.time
                ? new Date(Number(parsed.time)).toLocaleString()
                : null;

            if (!message) return;

            const lowerMsg = message.toLowerCase();

            // 🚫 Skip junk & summary
            const junkPatterns = [
                'calling…',
                'ringing…',
                'checking for new messages',
                'new messages',
                'messages from',
                'incoming voice call',
                'incoming video call',
            ];
            if (junkPatterns.some(p => lowerMsg.includes(p))) return;

            let type = 'message';
            if (
                lowerMsg.includes('missed voice call') ||
                lowerMsg.includes('missed video call')
            ) {
                type = 'call';
            }

            const cleanData = {
                senderName: sender,
                content: message,
                type,
                timestamp,
            };

            // ✅ Save locally (AsyncStorage)
            // await saveWhatsappNotification(cleanData);

            // ✅ Send to API
            // await SendNotificationToApi(cleanData);

            console.log('🚀 STORED & SENT DATA ===>', cleanData);
        }
    } catch (err) {
        console.error('❌ Failed to parse notification:', err, notification);
    }
};

AppRegistry.registerHeadlessTask(
    RNAndroidNotificationListenerHeadlessJsName,
    () => headlessNotificationListener,
);

AppRegistry.registerComponent(appName, () => App);
