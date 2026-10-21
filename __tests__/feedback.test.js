import fs from 'fs';
import path from 'path';

import EndPoints from '../src/utils/api/endpoints';
import Constants from '../src/utils/theme/constants';
import {FEEDBACK_MAX_LENGTH, sendFeedback} from '../src/utils/feedback';

const device = () => ({app_version: '1.0 (1)', os_version: '16', device_model: 'Google Pixel 8'});
const okResponse = {statusCode: Constants.apiStatusCode.success, data: {status: '1'}};

describe('sendFeedback', () => {
    let calls;
    const transport = response => async (...args) => {
        calls.push(args);
        return response;
    };

    beforeEach(() => {
        calls = [];
        Constants.commonConstant.appToken = 'token';
    });
    afterAll(() => {
        Constants.commonConstant.appToken = '';
    });

    test('posts trimmed message, category and device basics to /feedback', async () => {
        const result = await sendFeedback({category: 'bug', message: '  Map is blank  '}, {transport: transport(okResponse), device});
        expect(result).toEqual({ok: true});
        expect(EndPoints.feedback).toBe('feedback');
        const [method, body, url] = calls[0];
        expect(method).toBe('post');
        expect(url).toBe('feedback');
        expect(body).toMatchObject({category: 'bug', message: 'Map is blank', device_model: 'Google Pixel 8'});
    });

    test('unknown category falls back to other; long text is capped', async () => {
        await sendFeedback({category: 'spam', message: 'x'.repeat(FEEDBACK_MAX_LENGTH + 50)}, {transport: transport(okResponse), device});
        expect(calls[0][1].category).toBe('other');
        expect(calls[0][1].message).toHaveLength(FEEDBACK_MAX_LENGTH);
    });

    test('too short or signed out: nothing is sent', async () => {
        expect(await sendFeedback({message: ' a '}, {transport: transport(okResponse), device})).toEqual({ok: false, reason: 'empty'});
        Constants.commonConstant.appToken = '';
        expect(await sendFeedback({message: 'Hello'}, {transport: transport(okResponse), device})).toEqual({ok: false, reason: 'signedOut'});
        expect(calls).toHaveLength(0);
    });

    test('offline and server failures are reported', async () => {
        expect((await sendFeedback({message: 'Hello'}, {transport: transport({isOffline: true}), device})).reason).toBe('offline');
        const failed = await sendFeedback(
            {message: 'Hello'},
            {transport: transport({statusCode: 422, data: {status: '0', message: 'Too long'}}), device},
        );
        expect(failed).toEqual({ok: false, reason: 'validation', message: 'Too long'});
    });

    test('does not send a client email, including from legacy callers', async () => {
        await sendFeedback(
            {category: 'idea', message: 'Add a quiet-hours shortcut', email: ' User@Example.COM '},
            {transport: transport(okResponse), device},
        );
        expect(calls[0][1]).not.toHaveProperty('email');
    });

    test('distinguishes an expired session', async () => {
        expect(
            await sendFeedback(
                {message: 'Hello'},
                {transport: transport({statusCode: 401, isAuthError: true, data: {message: 'Unauthenticated.'}}), device},
            ),
        ).toEqual({ok: false, reason: 'auth', message: 'Unauthenticated.'});
    });
});

describe('Accounts layout', () => {
    test('Feedback sits between Privacy & Data and Legal', () => {
        const src = fs.readFileSync(path.join(__dirname, '../src/screens/ProfileScreen.js'), 'utf8');
        const order = ['title="Privacy & Data"', 'title="Feedback"', '<FeedbackForm />', 'title="Legal"'].map(t => src.indexOf(t));
        expect(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]))).toBe(true);
    });

    test('does not include a client email field in the feedback form', () => {
        const src = fs.readFileSync(path.join(__dirname, '../src/componentes/FeedbackForm.js'), 'utf8');
        expect(src).not.toContain('Your email');
        expect(src).not.toContain('name@example.com');
    });
});
