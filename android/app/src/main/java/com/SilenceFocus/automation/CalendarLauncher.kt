package com.SilenceFocus.automation

import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.CalendarContract

/**
 * Opens "a calendar app" for the user. This is deliberately separate from the
 * calendars Silent Focus reads: Android has no API to open a particular
 * account in a particular app, so whichever app handles calendar VIEW (often
 * Samsung Calendar on Samsung phones, even for Google accounts) shows what
 * that app shows. Nothing here is hardcoded to an app; with several handlers
 * the system chooser lets the user pick, and the default app is never changed.
 */
object CalendarLauncher {
    const val RESULT_NONE = "none"
    const val RESULT_APP = "app"
    const val RESULT_CHOOSER = "chooser"

    fun viewIntent(atMillis: Long): Intent {
        val uri = CalendarContract.CONTENT_URI.buildUpon().appendPath("time").also {
            ContentUris.appendId(it, atMillis)
        }.build()
        return Intent(Intent.ACTION_VIEW).setData(uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    /** none / app / chooser for [handlerCount] resolved activities. */
    fun modeFor(handlerCount: Int): String = when {
        handlerCount <= 0 -> RESULT_NONE
        handlerCount == 1 -> RESULT_APP
        else -> RESULT_CHOOSER
    }

    /**
     * Account-specific calendar apps, by provider label (see CalendarSync.providerLabel). Generic
     * calendar apps (Samsung / AOSP) show every account, so they are never blocked.
     */
    private val APPS_BY_PROVIDER = mapOf(
        "Google" to setOf("com.google.android.calendar"),
        "Outlook / Exchange" to setOf("com.microsoft.office.outlook", "com.microsoft.office.outlook.beta"),
    )

    /**
     * Drops the account-specific apps of providers the user did NOT select, so choosing an Outlook
     * calendar never offers Google Calendar (and the other way round). An empty result means no
     * suitable app is installed. No selection info (empty set) leaves the list untouched.
     */
    fun filterHandlers(handlers: List<String>, providers: Set<String>): List<String> {
        if (providers.isEmpty()) return handlers
        val blocked = APPS_BY_PROVIDER.filterKeys { it !in providers }.values.flatten().toSet()
        return handlers.filter { it !in blocked }
    }

    /** Providers of the calendars Silent Focus uses (null selection = every visible calendar). */
    fun selectedProviders(ctx: Context): Set<String> = runCatching {
        val selection = EngineStore(ctx).calendarSelection
        CalendarSync.listCalendars(ctx)
            .filter { if (selection == null) it.visible else it.id in selection }
            .map { CalendarSync.providerLabel(it.accountType) }
            .toSet()
    }.getOrDefault(emptySet())

    /** Launches and returns the mode; second value is the resolved package(s), for diagnostics. */
    fun launch(ctx: Context, atMillis: Long): Pair<String, List<String>> {
        val intent = viewIntent(atMillis)
        val resolved = ctx.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
        val all = resolved.map { it.activityInfo.packageName }.distinct()
        val handlers = filterHandlers(all, selectedProviders(ctx))
        // Apps of calendars the user did not select must not appear in the system chooser either.
        val excluded = resolved.filter { it.activityInfo.packageName !in handlers }
            .map { android.content.ComponentName(it.activityInfo.packageName, it.activityInfo.name) }
        // Exactly one matching app: open that one directly (not whichever the system defaults to).
        if (handlers.size == 1 && all.size > 1) intent.setPackage(handlers[0])
        val mode = modeFor(handlers.size)
        when (mode) {
            RESULT_APP -> ctx.startActivity(intent)
            RESULT_CHOOSER -> ctx.startActivity(
                Intent.createChooser(intent, "Open calendar with").apply {
                    if (excluded.isNotEmpty()) putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, excluded.toTypedArray())
                }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
        return mode to handlers
    }
}
