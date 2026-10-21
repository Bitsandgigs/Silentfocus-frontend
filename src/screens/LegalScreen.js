import React from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import BackIcon from '../assets/svgs/Back';

// These are review drafts, deliberately kept in-app until the client/legal
// owner approves publication. They are functional offline links, not invented
// public URLs or claims about an unverified legal entity/retention policy.
const terms = [
    ['Draft Terms of Service', 'This draft is provided for review and is not a published agreement.'],
    ['Using Silent Focus', 'Silent Focus can request Do Not Disturb access and automate device silencing from your manual choice, schedules, calendar events, and Custom Silent Zones. You remain responsible for checking device settings and emergency communications.'],
    ['Permissions and replies', 'Features need your consent for the Android permissions they request. Optional Auto Reply can invoke Android reply actions only after you enable it and provide the required consent.'],
    ['Availability', 'Automation can be affected by Android, manufacturer settings, permissions, battery controls, notification access, connectivity, and changes to calendar or location data.'],
    ['Approval pending', 'A legal owner must approve the final terms, applicable contact details, governing terms, and effective date before public publication.'],
];
const privacy = [
    ['Draft Privacy Policy', 'This draft describes observed application behavior for review. It is not an approved public privacy policy.'],
    ['Information used on your device', 'The app can use calendar occurrences (including titles and times) for Calendar Mode; location for Custom Silent Zones; contacts and call-related permissions for emergency and urgent-caller features; notification access for supported WhatsApp and WhatsApp Business handling; and notification permission for status alerts. Calendar titles and session history are stored device-locally for the related features.'],
    ['Optional communications', 'Auto Reply is optional and requires your consent. When enabled, Android reply actions may send a response through the relevant service.'],
    ['Account and support', 'Account authentication, feedback submission, and any configured server synchronization can send the information needed by those features to the service backend. This draft does not claim all data remains on-device.'],
    ['Controls and retention', 'The app provides local activity/history clearing and logout controls. The applicable server-side retention, deletion process, third parties, support contact, legal entity, and effective date require owner approval before publication.'],
];

export default function LegalScreen() {
    const navigation = useNavigation();
    const {params} = useRoute();
    const isPrivacy = params?.document === 'privacy';
    const sections = isPrivacy ? privacy : terms;
    const dark = useColorScheme() === 'dark';
    const fg = dark ? '#fff' : '#171717';
    return <SafeAreaView style={[styles.page, {backgroundColor: dark ? '#111' : '#fff'}]}>
        <View style={styles.header}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} style={styles.back}>
                <BackIcon width={26} height={26} color={fg} />
            </TouchableOpacity>
            <Text style={[styles.title, {color: fg}]}>{isPrivacy ? 'Privacy Policy' : 'Terms of Service'}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
            {sections.map(([heading, body]) => <View key={heading} style={styles.section}>
                <Text style={[styles.heading, {color: fg}]}>{heading}</Text>
                <Text style={[styles.body, {color: dark ? '#c9c9c9' : '#4a4a4a'}]}>{body}</Text>
            </View>)}
        </ScrollView>
    </SafeAreaView>;
}

const styles = StyleSheet.create({
    page: {flex: 1}, header: {height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12},
    back: {height: 44, width: 44, justifyContent: 'center', alignItems: 'center'}, title: {fontSize: 20, fontWeight: '700'},
    content: {padding: 20, paddingBottom: 48}, section: {marginBottom: 24}, heading: {fontSize: 18, fontWeight: '700', marginBottom: 8},
    body: {fontSize: 15, lineHeight: 23},
});
