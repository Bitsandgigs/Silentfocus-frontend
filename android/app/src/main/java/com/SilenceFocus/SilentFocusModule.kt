package com.SilenceFocus

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SilentFocusModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "SilentFocus"

    private fun audio(): AudioManager =
        reactContext.getSystemService(_root_ide_package_.android.content.Context.AUDIO_SERVICE) as android.media.AudioManager

    private fun nm(): NotificationManager =
        reactContext.getSystemService(_root_ide_package_.android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager

    @ReactMethod
    fun hasDndAccess(promise: Promise) {
        try {
            if (_root_ide_package_.android.os.Build.VERSION.SDK_INT < _root_ide_package_.android.os.Build.VERSION_CODES.M) {
                promise.resolve(true) // pre-M had no DND access gate
                return
            }
            promise.resolve(nm().isNotificationPolicyAccessGranted)
        } catch (e: kotlin.Exception) {
            promise.reject("ERR_HAS_DND", e)
        }
    }

    @ReactMethod
    fun checkDndPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve(true) // pre-M has no restriction
                return
            }

            val granted = nm().isNotificationPolicyAccessGranted
            android.util.Log.d("SilentFocus", "DND Permission Granted: $granted") // <--- Debug log
            promise.resolve(granted)
        } catch (e: Exception) {
            promise.reject("ERR_HAS_DND", e)
        }
    }

    @ReactMethod
    fun openDndAccessSettings() {
        try {
            val intent =
                _root_ide_package_.android.content.Intent(_root_ide_package_.android.provider.Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
            intent.addFlags(_root_ide_package_.android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
        } catch (_: kotlin.Exception) {}
    }

    @ReactMethod
    fun setSilent(promise: Promise) = setMode(_root_ide_package_.android.media.AudioManager.RINGER_MODE_SILENT, promise)

    @ReactMethod
    fun setVibrate(promise: Promise) = setMode(_root_ide_package_.android.media.AudioManager.RINGER_MODE_VIBRATE, promise)

    @ReactMethod
    fun setNormal(promise: Promise) = setMode(_root_ide_package_.android.media.AudioManager.RINGER_MODE_NORMAL, promise)

    private fun setMode(mode: Int, promise: Promise) {
        try {
            val notificationManager = nm()
            val audioManager = audio()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !notificationManager.isNotificationPolicyAccessGranted) {
                promise.reject("ERR_NO_ACCESS", "DND access not granted")
                return
            }

            // Explicitly set interruption filter before changing mode
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                when (mode) {
                    AudioManager.RINGER_MODE_SILENT -> {
                        notificationManager.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_NONE)
                    }
                    AudioManager.RINGER_MODE_VIBRATE -> {
                        notificationManager.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
                    }
                    AudioManager.RINGER_MODE_NORMAL -> {
                        notificationManager.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL)
                    }
                }
            }

            // Now set the ringer mode
            audioManager.ringerMode = mode

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_SET_MODE", e)
        }
    }

//    private fun setMode(mode: kotlin.Int, promise: Promise) {
//        try {
//            if (_root_ide_package_.android.os.Build.VERSION.SDK_INT >= _root_ide_package_.android.os.Build.VERSION_CODES.M &&
//                !nm().isNotificationPolicyAccessGranted) {
//                promise.reject("ERR_NO_ACCESS", "DND access not granted")
//                return
//            }
//            audio().ringerMode = mode
//            promise.resolve(true)
//        } catch (e: kotlin.Exception) {
//            promise.reject("ERR_SET_MODE", e)
//        }
//    }
}
