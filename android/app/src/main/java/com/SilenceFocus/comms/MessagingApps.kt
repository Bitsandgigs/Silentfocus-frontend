package com.SilenceFocus.comms

import android.content.Context
import android.content.pm.PackageManager

/**
 * Messaging apps Silent Focus can offer for automatic replies (the plan may allow only some of them).
 * A reply is only ever possible when the app's notification carries an inline Reply action; this list
 * just names well-known apps so the user can choose, it is not a promise that each one works.
 */
object MessagingApps {
    val KNOWN: Map<String, String> = linkedMapOf(
        "com.whatsapp" to "WhatsApp",
        "com.whatsapp.w4b" to "WhatsApp Business",
        "com.linkedin.android" to "LinkedIn",
        "com.instagram.android" to "Instagram",
        "org.telegram.messenger" to "Telegram",
        "com.facebook.orca" to "Messenger",
        "org.thoughtcrime.securesms" to "Signal",
        "com.Slack" to "Slack",
        "com.google.android.apps.messaging" to "Messages",
        "com.microsoft.teams" to "Microsoft Teams",
    )

    /** Known apps that are installed (needs the matching <queries> entries in the manifest). */
    fun installed(ctx: Context): List<Pair<String, String>> {
        val pm = ctx.packageManager
        return KNOWN.filter { (pkg, _) ->
            runCatching { pm.getApplicationInfo(pkg, 0) }.isSuccess
        }.map { it.key to it.value }
    }
}
