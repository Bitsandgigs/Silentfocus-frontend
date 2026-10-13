package com.SilenceFocus.automation

import android.app.AutomaticZenRule
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.service.notification.Condition
import android.service.notification.ZenPolicy
import android.util.Log
import com.SilenceFocus.MainActivity

/**
 * The only code that changes the device's interruption state.
 *
 * API 29+: activates an app-owned AutomaticZenRule ("Silent Focus" mode) that
 * silences calls/messages/notifications but allows alarms and media. Turning
 * it off only deactivates our rule, so the user's own DND setting and ringer
 * mode (Ring/Vibrate/Silent) come back exactly as they were - nothing is
 * forced to Ring. This is also the supported path for targetSdk 35/36, where
 * global setInterruptionFilter calls are converted into implicit modes.
 *
 * API 24-28: falls back to INTERRUPTION_FILTER_ALARMS and restores the
 * captured filter/ringer afterwards, unless the user changed it meanwhile.
 *
 * Break-through calls ([paused]): the rule is switched off while Silent Focus
 * stays owned - the captured previous state, `ownedSince` and the session are
 * kept, so resuming re-applies silencing without starting a new session.
 */
class DndController(context: Context, private val store: EngineStore) {

    private val ctx = context.applicationContext
    private val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    private val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    data class Result(val applied: Boolean, val blockedReason: String?)

    fun hasAccess(): Boolean = nm.isNotificationPolicyAccessGranted

    fun currentInterruptionFilter(): Int = nm.currentInterruptionFilter

    fun currentRingerMode(): Int = audio.ringerMode

    /** Idempotent: safe to call on every evaluation. */
    fun apply(silent: Boolean, nowMillis: Long, paused: Boolean = false): Result {
        if (!hasAccess()) {
            // Can't silence, and can't restore either; keep ownership so the
            // restore happens once access is granted again.
            return Result(applied = !silent && !store.owned, blockedReason = BLOCKED_NO_DND_ACCESS)
        }
        return try {
            when {
                !silent -> deactivate()
                paused -> pause(nowMillis)
                else -> activate(nowMillis)
            }
            Result(applied = true, blockedReason = null)
        } catch (e: SecurityException) {
            Log.w(TAG, "DND change rejected: ${e.javaClass.simpleName}")
            Result(applied = false, blockedReason = BLOCKED_NO_DND_ACCESS)
        } catch (e: RuntimeException) {
            Log.w(TAG, "DND change failed: ${e.javaClass.simpleName}")
            Result(applied = false, blockedReason = BLOCKED_SYSTEM_ERROR)
        }
    }

    private fun activate(nowMillis: Long) {
        if (!store.owned) {
            store.previousRingerMode = audio.ringerMode
            store.previousInterruptionFilter = nm.currentInterruptionFilter
            store.ownedSince = nowMillis
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val id = ensureZenRule()
            nm.setAutomaticZenRuleState(id, Condition(conditionId(), RULE_NAME, Condition.STATE_TRUE))
        } else {
            nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALARMS)
            store.appliedInterruptionFilter = NotificationManager.INTERRUPTION_FILTER_ALARMS
        }
        store.owned = true
        store.dndPaused = false
    }

    /** Stop silencing for a break-through call, keeping ownership. */
    private fun pause(nowMillis: Long) {
        if (!store.owned) {
            store.previousRingerMode = audio.ringerMode
            store.previousInterruptionFilter = nm.currentInterruptionFilter
            store.ownedSince = nowMillis
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            store.zenRuleId?.let { id ->
                if (nm.getAutomaticZenRule(id) != null) {
                    nm.setAutomaticZenRuleState(id, Condition(conditionId(), RULE_NAME, Condition.STATE_FALSE))
                }
            }
        } else if (!store.dndPaused && nm.currentInterruptionFilter == store.appliedInterruptionFilter) {
            val prevFilter = store.previousInterruptionFilter
            if (prevFilter > 0) nm.setInterruptionFilter(prevFilter)
        }
        store.owned = true
        store.dndPaused = true
    }

    private fun deactivate() {
        if (!store.owned) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            store.zenRuleId?.let { id ->
                if (nm.getAutomaticZenRule(id) != null) {
                    nm.setAutomaticZenRuleState(id, Condition(conditionId(), RULE_NAME, Condition.STATE_FALSE))
                }
            }
        } else {
            // Only undo what we did; if the user changed DND meanwhile, respect it.
            if (nm.currentInterruptionFilter == store.appliedInterruptionFilter) {
                val prevFilter = store.previousInterruptionFilter
                if (prevFilter > 0) nm.setInterruptionFilter(prevFilter)
                val prevRinger = store.previousRingerMode
                if (prevRinger >= 0 && audio.ringerMode != prevRinger) audio.ringerMode = prevRinger
            }
        }
        store.owned = false
        store.ownedSince = 0L
        store.dndPaused = false
    }

    private fun conditionId(): Uri = Condition.newId(ctx).appendPath(CONDITION_PATH).build()

    /** Reuses the stored rule, recreating it if the user deleted it in Settings. */
    private fun ensureZenRule(): String {
        store.zenRuleId?.let { id -> if (nm.getAutomaticZenRule(id) != null) return id }
        val policy = ZenPolicy.Builder()
            .disallowAllSounds()
            .allowAlarms(true)
            .allowMedia(true)
            .build()
        val rule = AutomaticZenRule(
            RULE_NAME,
            null,
            ComponentName(ctx, MainActivity::class.java),
            conditionId(),
            policy,
            NotificationManager.INTERRUPTION_FILTER_PRIORITY,
            true,
        )
        return nm.addAutomaticZenRule(rule).also { store.zenRuleId = it }
    }

    companion object {
        private const val TAG = "SilentFocusDnd"
        private const val RULE_NAME = "Silent Focus"
        private const val CONDITION_PATH = "silent_focus"
        const val BLOCKED_NO_DND_ACCESS = "DND_ACCESS_MISSING"
        const val BLOCKED_SYSTEM_ERROR = "SYSTEM_ERROR"

        fun ringerModeName(mode: Int): String = when (mode) {
            AudioManager.RINGER_MODE_SILENT -> "silent"
            AudioManager.RINGER_MODE_VIBRATE -> "vibrate"
            AudioManager.RINGER_MODE_NORMAL -> "normal"
            else -> "unknown"
        }
    }
}
