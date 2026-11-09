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

    /** Launches and returns the mode; second value is the resolved package(s), for diagnostics. */
    fun launch(ctx: Context, atMillis: Long): Pair<String, List<String>> {
        val intent = viewIntent(atMillis)
        val handlers = ctx.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
            .map { it.activityInfo.packageName }.distinct()
        val mode = modeFor(handlers.size)
        when (mode) {
            RESULT_APP -> ctx.startActivity(intent)
            RESULT_CHOOSER -> ctx.startActivity(
                Intent.createChooser(intent, "Open calendar with").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
        return mode to handlers
    }
}
