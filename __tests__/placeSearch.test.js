import fs from 'fs';
import path from 'path';

import {PLACE_DETAILS_FIELDS, PLACES_NEW_REQUEST_URL, placeFromDetails} from '../src/utils/placeSearch';

describe('Silent Zone place search', () => {
    test('reads Places API (New) details', () => {
        const details = {
            id: 'ChIJx2E7b8UEdkgRtw6rLyLUl5w',
            formattedAddress: '10 Downing St, London SW1A 2AA, UK',
            location: {latitude: 51.5033395, longitude: -0.1275662},
            displayName: {text: '10 Downing St'},
        };
        expect(placeFromDetails({description: '10 Downing Street, London, UK'}, details)).toEqual({
            latitude: 51.5033395,
            longitude: -0.1275662,
            address: '10 Downing St, London SW1A 2AA, UK',
            name: '10 Downing St',
        });
    });

    test('still reads legacy details; no coordinates -> null', () => {
        const legacy = {geometry: {location: {lat: 12.9, lng: 77.5}}, formatted_address: 'Addr', name: 'Office'};
        expect(placeFromDetails({}, legacy)).toEqual({latitude: 12.9, longitude: 77.5, address: 'Addr', name: 'Office'});
        expect(placeFromDetails({description: 'x'}, {})).toBeNull();
        expect(placeFromDetails({description: 'x'}, null)).toBeNull();
    });

    test('the form uses Places API (New) with only the needed fields', () => {
        expect(PLACES_NEW_REQUEST_URL).toEqual({
            useOnPlatform: 'all',
            url: 'https://places.googleapis.com',
            headers: {'Content-Type': 'application/json'},
        });
        expect(PLACE_DETAILS_FIELDS).not.toMatch(/\*/);
        const src = fs.readFileSync(path.join(__dirname, '../src/screens/MapScreen.js'), 'utf8');
        expect(src).toMatch(/isNewPlacesAPI=\{true\}/);
        expect(src).toMatch(/requestUrl=\{PLACES_NEW_REQUEST_URL\}/);
        expect(src).toMatch(/fields=\{PLACE_DETAILS_FIELDS\}/);
    });

    test('bounds autocomplete traffic and exposes safe failure states', () => {
        const src = fs.readFileSync(path.join(__dirname, '../src/screens/MapScreen.js'), 'utf8');
        expect(src).toMatch(/debounce=\{350\}/);
        expect(src).toMatch(/minLength=\{2\}/);
        expect(src).toMatch(/onFail=\{\(\) =>/);
        expect(src).toMatch(/onNotFound=\{\(\) =>/);
        expect(src).toMatch(/Google quota or network issue/);
    });
});
