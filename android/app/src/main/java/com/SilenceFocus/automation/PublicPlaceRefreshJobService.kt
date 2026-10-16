package com.SilenceFocus.automation

import android.app.job.JobParameters
import android.app.job.JobService
import android.util.Log

/** Runs one PublicPlaces search off the main thread (network required). */
class PublicPlaceRefreshJobService : JobService() {

    override fun onStartJob(params: JobParameters?): Boolean {
        Thread {
            val retry = runCatching { PublicPlaces.refresh(this) }
                .onFailure { Log.w("SilentFocusPlaces", "refresh crashed: ${it.javaClass.simpleName}") }
                .getOrDefault(false)
            jobFinished(params, retry)
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters?): Boolean = true
}
