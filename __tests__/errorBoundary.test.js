// Phase 5: a JS rendering error must leave a usable screen, and the report
// sent to crash reporting must be scrubbed. Separate file: no module resets.

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import ErrorBoundary from '../src/componentes/ErrorBoundary';

describe('ErrorBoundary', () => {
    test('the error boundary shows a recoverable fallback instead of a blank screen', () => {
        const RN = require('react-native');
        const record = jest.fn();
        RN.NativeModules.SilentFocus = {recordJsError: record};
        RN.Platform.OS = 'android';
        let shouldThrow = true;
        const Boom = () => {
            if (shouldThrow) throw new Error('render failed for +91 98765 43210');
            return <RN.Text>recovered</RN.Text>;
        };
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        let tree;
        ReactTestRenderer.act(() => {
            tree = ReactTestRenderer.create(
                <ErrorBoundary>
                    <Boom />
                </ErrorBoundary>,
            );
        });
        const texts = () => tree.root.findAllByType(RN.Text).map(n => [].concat(n.props.children).join(''));
        expect(texts()).toContain('Something went wrong');
        expect(JSON.stringify(texts())).not.toMatch(/98765|stack/i);
        expect(record).toHaveBeenCalled();
        expect(record.mock.calls[0][1]).not.toMatch(/98765/);
        shouldThrow = false;
        const button = tree.root.findAllByProps({accessibilityRole: 'button'})[0];
        ReactTestRenderer.act(() => button.props.onPress());
        expect(texts()).toContain('recovered');
        spy.mockRestore();
        delete RN.NativeModules.SilentFocus;
    });
});
