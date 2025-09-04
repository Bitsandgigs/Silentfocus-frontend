package com.silence_focus

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

    private fun setMode(mode: kotlin.Int, promise: Promise) {
        try {
            if (_root_ide_package_.android.os.Build.VERSION.SDK_INT >= _root_ide_package_.android.os.Build.VERSION_CODES.M &&
                !nm().isNotificationPolicyAccessGranted) {
                promise.reject("ERR_NO_ACCESS", "DND access not granted")
                return
            }
            audio().ringerMode = mode
            promise.resolve(true)
        } catch (e: kotlin.Exception) {
            promise.reject("ERR_SET_MODE", e)
        }
    }
}
