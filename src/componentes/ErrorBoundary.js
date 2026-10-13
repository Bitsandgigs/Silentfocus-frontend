import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {reportError} from '../utils/errorReporting';

/**
 * Catches JS rendering errors below it so the user gets a recoverable screen
 * instead of a blank one. "Try again" remounts the subtree (navigation
 * restarts at its first screen; the signed-in session is kept above it).
 * Stack traces are never shown.
 */
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {hasError: false, attempt: 0};
    }

    static getDerivedStateFromError() {
        return {hasError: true};
    }

    componentDidCatch(error, info) {
        reportError(error, info?.componentStack);
    }

    retry = () => this.setState(s => ({hasError: false, attempt: s.attempt + 1}));

    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container} accessibilityRole="alert">
                    <Text style={styles.title}>Something went wrong</Text>
                    <Text style={styles.body}>
                        This screen ran into a problem. Your settings are safe, and Silent Focus automation keeps
                        running in the background.
                    </Text>
                    <TouchableOpacity onPress={this.retry} style={styles.button} accessibilityRole="button">
                        <Text style={styles.buttonText}>Try again</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    }
}

const styles = StyleSheet.create({
    container: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#fff'},
    title: {fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 8},
    body: {fontSize: 14, lineHeight: 20, color: '#555', textAlign: 'center', marginBottom: 20},
    // Same as ACTION_BUTTON_BG (controlColors); kept literal so the crash screen has no extra imports.
    button: {backgroundColor: '#9A4F08', borderRadius: 22, paddingVertical: 12, paddingHorizontal: 28},
    buttonText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
