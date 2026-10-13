/* eslint-env jest */
// #5 Tier 1: optional battery guidance in Permissions - no new permission.
import fs from 'fs';
import path from 'path';
import {buildPermissionRows} from '../src/utils/permissionHub';

const hub = extra => ({dndAccess: true, exactAlarms: true, notificationAccess: true, fineLocation: true, backgroundLocation: true, locationServicesOn: true, calendar: true, ...extra});
const battery = rows => rows.find(r => r.key === 'battery');

test('shown only with Silent Zones and battery optimisation on; optional, never required', () => {
    const row = battery(buildPermissionRows(hub({zonesInUse: true, batteryUnrestricted: false})));
    expect(row).toMatchObject({ok: false, required: false, actionLabel: 'Open'});
    expect(row.why).toMatch(/Sleeping/);
    expect(battery(buildPermissionRows(hub({zonesInUse: true, batteryUnrestricted: true})))).toBeUndefined();
    expect(battery(buildPermissionRows(hub({zonesInUse: false, batteryUnrestricted: false})))).toBeUndefined();
    // Older native code (no fields): hidden.
    expect(battery(buildPermissionRows(hub()))).toBeUndefined();
});

test('the manifest requests no battery-exemption permission', () => {
    const manifest = fs.readFileSync(path.join(__dirname, '../android/app/src/main/AndroidManifest.xml'), 'utf8');
    expect(manifest).not.toMatch(/REQUEST_IGNORE_BATTERY_OPTIMIZATIONS/);
    expect(manifest).not.toMatch(/FOREGROUND_SERVICE_LOCATION/);
});
