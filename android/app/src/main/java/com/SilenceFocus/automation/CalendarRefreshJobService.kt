package com.SilenceFocus.automation

import android.app.job.JobParameters
import android.app.job.JobService

/**
 * Runs after the device calendar changes (content-URI trigger) and every
 * 12 h. Re-reads occurrences and re-evaluates; the sync re-arms the
 * one-shot content trigger for the next change.
 */
class CalendarRefreshJobService : JobService() {

    override fun onStartJob(params: JobParameters?): Boolean {
        CalendarSync.sync(this)
        AutomationEngine.evaluate(this, TriggerReason.CALENDAR_SYNCED)
        return false
    }

    override fun onStopJob(params: JobParameters?): Boolean = false
}
