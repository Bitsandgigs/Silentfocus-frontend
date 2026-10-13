import config, {configs, resolveConfig} from '../src/config';
import {APP_ENV} from '../src/config/env';

test('the selected environment is the one exported', () => {
    expect(config).toBe(configs[APP_ENV] || configs.development);
});

test('development keeps the currently working API', () => {
    expect(configs.development.baseURL).toBe('https://silent.rpaywin.com/');
});

test('each environment resolves to its own file; unknown falls back to development', () => {
    expect(resolveConfig('staging')).toBe(configs.staging);
    expect(resolveConfig('production')).toBe(configs.production);
    expect(resolveConfig('nope')).toBe(configs.development);
});

test('every environment uses HTTPS (Android blocks cleartext) and no raw IP', () => {
    Object.values(configs).forEach(c => {
        expect(c.baseURL).toMatch(/^https:\/\//);
        expect(c.baseURL).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    });
    expect(configs.production.baseURL).toBe('https://silent.rpaywin.com/');
});
