import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';

import {
    evaluateEngine,
    getEngineState,
    isEngineAvailable,
    subscribeEngineState,
} from './silentFocusEngine';

// Live native engine state. Re-evaluates when the app returns to the
// foreground, which also picks up DND / exact-alarm access granted in
// Settings meanwhile.
export default function useSilentFocusState() {
    const [engineState, setEngineState] = useState(null);
    const mounted = useRef(true);

    const accept = useCallback(state => {
        if (mounted.current && state) {
            setEngineState(state);
        }
    }, []);

    const refresh = useCallback(
        (reason = 'APP_RESUMED') =>
            evaluateEngine(reason)
                .then(accept)
                .catch(() => getEngineState().then(accept).catch(() => {})),
        [accept],
    );

    useEffect(() => {
        mounted.current = true;
        if (!isEngineAvailable) {
            return undefined;
        }
        const unsubscribe = subscribeEngineState(accept);
        refresh();
        const appStateSub = AppState.addEventListener('change', next => {
            if (next === 'active') {
                refresh();
            }
        });
        return () => {
            mounted.current = false;
            unsubscribe();
            appStateSub.remove();
        };
    }, [accept, refresh]);

    return {engineState, setEngineState: accept, refresh};
}
