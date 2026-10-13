/* eslint-env jest */
// #3: honest radius options - reliable 100/150/200 m, legacy radii kept as saved.
import {
    effectiveRadius,
    MONITORED_MIN_RADIUS,
    RADIUS_PRECISION_NOTE,
    RADIUS_PRESETS,
    radiusChoices,
    radiusLabel,
    validateZoneForm,
} from '../src/utils/zoneForm';

const zone = extra => ({name: 'Office', latitude: 12.9, longitude: 77.6, radius: 150, ...extra});

test('offered presets are the reliable ones only - no 10 m / 50 m', () => {
    expect(RADIUS_PRESETS).toEqual([100, 150, 200]);
    expect(radiusChoices(undefined)).toEqual([100, 150, 200]);
    expect(RADIUS_PRECISION_NOTE).toMatch(/100 m/);
    expect(RADIUS_PRECISION_NOTE).toMatch(/not guaranteed/);
});

test('a legacy 300 / 500 m zone keeps its radius as an extra, selectable choice', () => {
    expect(radiusChoices(300)).toEqual([100, 150, 200, 300]);
    expect(radiusChoices(500)).toEqual([100, 150, 200, 500]);
    expect(radiusChoices(150)).toEqual([100, 150, 200]);
    expect(validateZoneForm(zone({radius: 300, originalRadius: 300}))).toBeNull();
    expect(validateZoneForm(zone({radius: 500}))).toBeNull();
});

test('a saved radius below 100 m is never silently changed - shown as requested vs monitored', () => {
    expect(radiusChoices(50)).toEqual([50, 100, 150, 200]);
    expect(radiusLabel(50)).toBe('50 m (monitored as 100 m)');
    expect(radiusLabel(150)).toBe('150 m');
    expect(radiusLabel(null)).toBe('');
    expect(effectiveRadius(50)).toBe(MONITORED_MIN_RADIUS);
    expect(effectiveRadius(10)).toBe(100);
    expect(effectiveRadius(300)).toBe(300);
    // Editing other fields of such a zone keeps its saved value...
    expect(validateZoneForm(zone({radius: 50, originalRadius: 50}))).toBeNull();
    // ...but nobody can newly choose a radius under 100 m.
    expect(validateZoneForm(zone({radius: 50}))).toMatch(/between 100/);
    expect(validateZoneForm(zone({radius: 10, originalRadius: 50}))).toMatch(/between 100/);
});

test('upper bound unchanged', () => {
    expect(validateZoneForm(zone({radius: 6000}))).toMatch(/5000/);
});
