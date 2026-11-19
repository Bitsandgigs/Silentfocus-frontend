package com.SilenceFocus

import android.os.Build
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "Silence_Focus"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    override fun onCreate(savedInstanceState: Bundle?) {
        // No native splash dialog: it never painted and left a black gap. The logo is the
        // window background (sf_launch_window) and LogoScreen continues it seamlessly.
        // Round 4: react-native-screens fragments must never be restored. With the
        // saved state, a font-size or display-size change (activity recreated)
        // crashed with "Screen fragments should never be restored". JS state is
        // kept by React Native itself; nothing relies on the native saved state.
        super.onCreate(null)
        // Android 12+: remove the system splash instantly instead of its fade-out. The window
        // background underneath shows the identical logo, so the default crossfade only
        // produced a dim/blank flicker.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            splashScreen.setOnExitAnimationListener { it.remove() }
        }
    }
}
