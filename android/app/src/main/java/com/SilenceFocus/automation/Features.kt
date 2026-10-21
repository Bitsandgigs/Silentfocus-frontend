package com.SilenceFocus.automation

/**
 * Product feature policy (compile-time).
 */
object Features {
    /**
     * Location Mode (automatic silencing at public places found through
     * Google Places). Off since the client's Round 11 feedback: nearby
     * places were taken as proof of presence and silenced the phone at home.
     * This is a permanent fail-closed product decision, not a temporary gate:
     * legacy preference/cache data is purged and cannot be restored.
     */
    const val PUBLIC_PLACES_LOCATION_MODE = false
}

/** Public Places can never become an active automation source. */
val AutomationSettings.publicPlacesActive: Boolean
    get() = false
