package com.SilenceFocus.comms

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.util.Log

/**
 * Makes a break-through call audible.
 *
 * Android's Telecom decides whether an incoming call rings from a DND check
 * made when the call arrives, BEFORE any call-screening app is consulted
 * (Telecom's DND_PRE_CHECK). Pausing Silent Focus from the screening service
 * therefore can't make the dialer ring for that call, so while the call is
 * ringing we play the user's own ringtone/vibration, following their ringer
 * mode (Ring: sound + vibrate, Vibrate: vibrate only, Silent: nothing) and
 * their own DND (the ringtone usage stays muted by any other active mode).
 * Stopped when the phone stops ringing, or after [MAX_RING_MS].
 */
object BreakthroughRinger {

    private const val TAG = "SilentFocusRinger"
    /** Lets NotificationManager apply the paused rule before we play. */
    private const val START_DELAY_MS = 400L
    private const val MAX_RING_MS = 60_000L

    private val main = Handler(Looper.getMainLooper())
    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null
    private val stopRunnable = Runnable { stop() }

    private val attributes: AudioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()

    fun startSoon(context: Context) {
        val ctx = context.applicationContext
        main.postDelayed({
            // Stopped ringing during the delay: resume silence instead.
            if (CallBreakthroughs.isPhoneIdle(ctx) == true) CallBreakthroughs.onRingingStopped(ctx) else start(ctx)
        }, START_DELAY_MS)
    }

    @Synchronized
    fun start(ctx: Context) {
        stop()
        val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val mode = audio.ringerMode
        try {
            if (mode == AudioManager.RINGER_MODE_NORMAL) {
                val uri = RingtoneManager.getActualDefaultRingtoneUri(ctx, RingtoneManager.TYPE_RINGTONE)
                    ?: Settings.System.DEFAULT_RINGTONE_URI
                ringtone = RingtoneManager.getRingtone(ctx, uri)?.apply {
                    audioAttributes = attributes
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) isLooping = true
                    play()
                }
            }
            if (mode != AudioManager.RINGER_MODE_SILENT) {
                @Suppress("DEPRECATION")
                val v = ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                if (v?.hasVibrator() == true) {
                    @Suppress("DEPRECATION")
                    v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 1000, 1000), 0), attributes)
                    vibrator = v
                }
            }
            Log.i(TAG, "ringing for break-through call (ringerMode=$mode)")
        } catch (e: RuntimeException) {
            Log.w(TAG, "could not ring: ${e.javaClass.simpleName}")
        }
        main.removeCallbacks(stopRunnable)
        main.postDelayed(stopRunnable, MAX_RING_MS)
    }

    @Synchronized
    fun stop() {
        main.removeCallbacksAndMessages(null)
        ringtone?.let { runCatching { it.stop() } }
        ringtone = null
        vibrator?.let { runCatching { it.cancel() } }
        vibrator = null
    }

    val isRinging: Boolean @Synchronized get() = ringtone?.isPlaying == true || vibrator != null
}
