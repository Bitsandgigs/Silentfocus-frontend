/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.useFakeTimers();

// No network in tests: rendering App would otherwise fetch the live app-config.
jest.mock('../src/utils/appConfig', () => ({
  ...jest.requireActual('../src/utils/appConfig'),
  loadAppConfig: jest.fn(() => Promise.resolve(null)),
}));

test('renders correctly', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(() => {
    renderer?.unmount();
  });
});
