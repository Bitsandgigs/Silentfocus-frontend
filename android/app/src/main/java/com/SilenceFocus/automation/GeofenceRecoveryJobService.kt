package com.SilenceFocus.automation

import android.app.job.JobParameters
import android.app.job.JobService

/**
 * Re-registers Silent Zone geofences from the native cache when Play
 * Services has dropped them: after device Location changes, after Play
 * Services data is cleared, and every 12 h as a safety net. Never touches
 * DND itself; sync/evaluate do.
 */
class GeofenceRecoveryJobService : JobService() {

    override fun onStartJob(params: JobParameters?): Boolean {
        when (params?.jobId) {
            GeofenceRegistrar.JOB_LOCATION_SETTING -> {
                // Content triggers are one-shot: re-arm before handling.
                GeofenceRegistrar.scheduleRecoveryJobs(this)
                GeofenceRegistrar.onLocationSettingChanged(this)
            }
            else -> if (GeofenceRegistrar.isLocationOn(this)) GeofenceRegistrar.sync(this, force = true)
        }
        return false
    }

    override fun onStopJob(params: JobParameters?): Boolean = false
}
