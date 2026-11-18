jest.mock('../src/utils/navigationRef', () => ({navigateTo: jest.fn()}));

import {getApiErrorMessage, SERVER_BUSY_MESSAGE} from '../src/function/Alert';

const FALLBACK = 'Something went wrong. Please try again.';
const HTML_PAGE = '<!DOCTYPE html>\n<html lang="en-us">\n<head><meta http-equiv="Content-Type" content="text/html"></head><body>Error</body></html>';

describe('getApiErrorMessage', () => {
  it('never shows an HTML error page to the user', () => {
    expect(getApiErrorMessage({data: HTML_PAGE})).toBe(SERVER_BUSY_MESSAGE);
    expect(getApiErrorMessage({data: {message: HTML_PAGE}})).toBe(SERVER_BUSY_MESSAGE);
    expect(getApiErrorMessage({data: {detail: HTML_PAGE}})).toBe(SERVER_BUSY_MESSAGE);
    expect(getApiErrorMessage({data: HTML_PAGE}, 'Could not save.')).toBe(SERVER_BUSY_MESSAGE);
  });

  it('does not show very long text', () => {
    expect(getApiErrorMessage({data: 'x'.repeat(400)})).toBe(FALLBACK);
  });

  it('still shows normal server messages', () => {
    expect(getApiErrorMessage({data: {message: 'Invalid credentials.'}})).toBe('Invalid credentials.');
    expect(getApiErrorMessage({data: 'Service unavailable'})).toBe('Service unavailable');
    expect(getApiErrorMessage({data: {message: 'Use a < b and c > d'}})).toBe('Use a < b and c > d');
  });
});
