// Keeps the native Auto Reply settings (the offline source the notification
// listener uses) in step with the account on the backend. Contracts from the
// backend source (SilentFocusController / SilentFocus model):
//  - GET  auto-response-templates            paginated {id, name, message, is_default, ...}
//  - POST auto-response-templates            {name (req, <=191), message (req, <=1000), is_default?}
//  - PUT  auto-response-templates/{id}       partial {name?, message?}
//  - POST auto-response-templates/{id}/default
//  - GET/PUT settings                        auto_response_enabled (bool)
//  - GET  silent-zones / PUT silent-zones/{id} partial
//                                            {auto_response_template_id, auto_response_enabled}
// Mapping:
//  - local "default reply"  <-> the account's default template
//  - local per-zone reply   <-> a template linked from that zone
//  - local "Auto reply" on   -> settings.auto_response_enabled (push only:
//    a server value never switches automatic replies on for a device; the
//    user must turn it on here, since replies are sent on their behalf)
//  - cooldown / "reply to messaging apps" stay local (no backend field).
// Nothing is ever deleted on the server. A zone pointing at a template the
// account doesn't have is treated as "no zone reply" and left untouched
// until the user saves a reply for that zone.

import AsyncStorage from '@react-native-async-storage/async-storage';

import APICall from './api/api';
import EndPoints from './api/endpoints';
import {extractList, extractPagination, toBooleanFlag} from './api/normalizers';
import {DEFAULT_REPLY, cleanTemplate, getCommsState, setAutoReplySettings} from './comms';
import {serverWritesAllowed} from './serverSync';
import {Constants} from './theme';

const KEY_PENDING = 'sf.autoReply.pendingPush';
const KEY_INITIALIZED = 'sf.autoReply.syncInitialized';
const JSON_HEADERS = {'Content-Type': 'application/json', Accept: 'application/json'};
const MAX_PAGES = 10;
export const DEFAULT_TEMPLATE_NAME = 'Default reply';
export const zoneTemplateName = zoneName => `Silent Zone: ${String(zoneName || 'Zone').slice(0, 150)}`;

const ok = r => r?.statusCode === Constants.apiStatusCode.success && r?.data?.status === '1';

// ---- Pure mapping (tested)

export const normalizeTemplate = t =>
    t && t.id != null
        ? {id: String(t.id), name: String(t.name || ''), message: String(t.message || ''), isDefault: toBooleanFlag(t.is_default)}
        : null;

/** Server state -> what the local Auto Reply settings should become. */
export const serverToLocal = ({settings, templates, zones}) => {
    const byId = Object.fromEntries(templates.map(t => [t.id, t]));
    const def = templates.find(t => t.isDefault) || null;
    const zoneTemplates = {};
    zones.forEach(z => {
        const t = z.autoResponseTemplateId != null ? byId[String(z.autoResponseTemplateId)] : null;
        if (z.autoResponseEnabled && t && cleanTemplate(t.message)) {
            zoneTemplates[String(z.id)] = cleanTemplate(t.message);
        }
    });
    const out = {zoneTemplates};
    if (def && cleanTemplate(def.message)) out.defaultTemplate = cleanTemplate(def.message);
    return out;
};

/**
 * Local settings + current server state -> the ordered write plan. Each step
 * is {kind, ...}; executed in order, later steps may use created ids.
 */
export const planPush = ({local, settings, templates, zones}) => {
    const steps = [];
    if (!settings || toBooleanFlag(settings.auto_response_enabled) !== !!local.enabled) {
        steps.push({kind: 'settings', body: {auto_response_enabled: !!local.enabled}});
    }
    const message = cleanTemplate(local.defaultTemplate) || DEFAULT_REPLY;
    const def = templates.find(t => t.isDefault);
    if (def) {
        if (cleanTemplate(def.message) !== message) steps.push({kind: 'updateTemplate', id: def.id, body: {message}});
    } else {
        steps.push({kind: 'createTemplate', ref: 'default', body: {name: DEFAULT_TEMPLATE_NAME, message, is_default: true}});
    }
    const byId = Object.fromEntries(templates.map(t => [t.id, t]));
    const linkedIds = new Set(
        zones.filter(z => z.autoResponseTemplateId != null).map(z => String(z.autoResponseTemplateId)),
    );
    zones.forEach(z => {
        const zoneId = String(z.id);
        const text = cleanTemplate(local.zoneTemplates?.[zoneId]);
        const linked = z.autoResponseTemplateId != null ? byId[String(z.autoResponseTemplateId)] : null;
        if (text) {
            if (linked && !linked.isDefault) {
                if (cleanTemplate(linked.message) !== text) steps.push({kind: 'updateTemplate', id: linked.id, body: {message: text}});
                if (!z.autoResponseEnabled) {
                    steps.push({kind: 'linkZone', zoneId, templateId: linked.id});
                }
            } else {
                // Retry-safe: a template this app created for the zone on an
                // earlier, interrupted push (created, not yet linked) is reused
                // instead of creating a duplicate.
                const leftover = templates.find(
                    t => !t.isDefault && t.name === zoneTemplateName(z.name) && !linkedIds.has(t.id),
                );
                if (leftover) {
                    if (cleanTemplate(leftover.message) !== text) {
                        steps.push({kind: 'updateTemplate', id: leftover.id, body: {message: text}});
                    }
                    steps.push({kind: 'linkZone', zoneId, templateId: leftover.id});
                } else {
                    steps.push({kind: 'createTemplate', ref: `zone:${zoneId}`, body: {name: zoneTemplateName(z.name), message: text}});
                    steps.push({kind: 'linkZone', zoneId, templateRef: `zone:${zoneId}`});
                }
            }
        } else if (linked && z.autoResponseEnabled) {
            // The user cleared this zone's reply: stop using it for the zone
            // (the template itself is kept).
            steps.push({kind: 'unlinkZone', zoneId});
        }
    });
    return steps;
};

// ---- Server I/O

const fetchAllTemplates = async transport => {
    let rows = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
        const r = await transport('get', {page, per_page: 50}, EndPoints.getAutoResponseTemplates);
        if (!ok(r)) throw new Error('templates');
        rows = rows.concat(extractList(r.data.result));
        if (!extractPagination(r.data.result)?.hasMore) break;
    }
    return rows.map(normalizeTemplate).filter(Boolean);
};

const fetchServerState = async (transport, fetchZones) => {
    const s = await transport('get', null, EndPoints.getSettings);
    if (!ok(s)) throw new Error('settings');
    const templates = await fetchAllTemplates(transport);
    const zones = await fetchZones();
    return {settings: s.data.result || {}, templates, zones};
};

const runStep = async (transport, step, created) => {
    switch (step.kind) {
        case 'settings':
            return ok(await transport('put', step.body, EndPoints.updateSettings, JSON_HEADERS));
        case 'createTemplate': {
            const r = await transport('post', step.body, EndPoints.createAutoResponseTemplate, JSON_HEADERS);
            if (!ok(r) || r.data.result?.id == null) return false;
            created[step.ref] = String(r.data.result.id);
            return true;
        }
        case 'updateTemplate':
            return ok(
                await transport('put', step.body, EndPoints.updateAutoResponseTemplate.replace('{template_id}', step.id), JSON_HEADERS),
            );
        case 'linkZone': {
            const templateId = step.templateId ?? created[step.templateRef];
            if (templateId == null) return false;
            return ok(
                await transport(
                    'put',
                    {auto_response_template_id: Number(templateId), auto_response_enabled: true},
                    EndPoints.updateSilentZone.replace('{zone_id}', step.zoneId),
                    JSON_HEADERS,
                ),
            );
        }
        case 'unlinkZone':
            return ok(
                await transport(
                    'put',
                    {auto_response_enabled: false},
                    EndPoints.updateSilentZone.replace('{zone_id}', step.zoneId),
                    JSON_HEADERS,
                ),
            );
        default:
            return false;
    }
};

export const isPushPending = async () => {
    try {
        return (await AsyncStorage.getItem(KEY_PENDING)) === '1';
    } catch (e) {
        return false;
    }
};
const setPending = on => (on ? AsyncStorage.setItem(KEY_PENDING, '1') : AsyncStorage.removeItem(KEY_PENDING)).catch(() => {});

/** Logout: the next account starts from its own server state. */
export const clearAutoReplySyncState = () =>
    AsyncStorage.multiRemove([KEY_PENDING, KEY_INITIALIZED]).catch(() => {});

let running = null;
const once = fn => {
    if (running) return running;
    running = fn().finally(() => {
        running = null;
    });
    return running;
};

/** Local settings differ from a fresh install (customised before syncing existed). */
export const hasLocalCustomisation = autoReply =>
    !!autoReply &&
    ((cleanTemplate(autoReply.defaultTemplate) || DEFAULT_REPLY) !== DEFAULT_REPLY ||
        Object.values(autoReply.zoneTemplates || {}).some(t => cleanTemplate(t)));

/**
 * Pull: when no local edit is waiting to be pushed, server values replace
 * the local ones (account is the source across devices). With a pending
 * edit, the local values are pushed first. Resolves the new comms state or
 * null when the server couldn't be reached (local settings keep working).
 */
export const syncAutoReply = ({
    transport = APICall,
    fetchZones,
    writesEnabled = serverWritesAllowed(),
} = {}) =>
    once(async () => {
        if (!Constants.commonConstant.appToken || typeof fetchZones !== 'function') return null;
        try {
            // First sync on this device: replies customised before server
            // sync existed are pushed rather than overwritten.
            if ((await AsyncStorage.getItem(KEY_INITIALIZED).catch(() => null)) !== '1') {
                if (hasLocalCustomisation((await getCommsState()).autoReply)) await setPending(true);
                await AsyncStorage.setItem(KEY_INITIALIZED, '1').catch(() => {});
            }
            if ((await isPushPending()) && writesEnabled) {
                await pushNow({transport, fetchZones});
            }
            if (await isPushPending()) return null; // still unsent: keep local values
            const server = await fetchServerState(transport, fetchZones);
            // The user may have saved while the server was being read: their
            // edit wins and is pushed next, never overwritten by this pull.
            if (await isPushPending()) return null;
            const next = serverToLocal(server);
            return await setAutoReplySettings(next);
        } catch (e) {
            return null;
        }
    });

const pushNow = async ({transport, fetchZones}) => {
    const local = (await getCommsState()).autoReply;
    const server = await fetchServerState(transport, fetchZones);
    const created = {};
    for (const step of planPush({local, ...server})) {
        if (!(await runStep(transport, step, created))) throw new Error(`push:${step.kind}`);
    }
    await setPending(false);
};

/**
 * Call after the user saved Auto Reply settings locally. Marks them pending
 * and pushes now if possible; otherwise they're pushed on the next sync.
 */
export const pushAutoReply = async ({transport = APICall, fetchZones, writesEnabled = serverWritesAllowed()} = {}) => {
    await setPending(true);
    if (!writesEnabled || !Constants.commonConstant.appToken || typeof fetchZones !== 'function') return false;
    try {
        // A sync already running may be a pull that started before this
        // save; wait for it, then push (instead of reusing its result).
        if (running) await running.catch(() => null);
        await once(() => pushNow({transport, fetchZones}));
        return true;
    } catch (e) {
        return false;
    }
};
