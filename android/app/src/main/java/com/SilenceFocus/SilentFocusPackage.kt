package com.SilenceFocus

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class SilentFocusPackage: ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): kotlin.collections.List<NativeModule> =
        _root_ide_package_.kotlin.collections.listOf(SilentFocusModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): kotlin.collections.List<ViewManager<*, *>> =
        _root_ide_package_.kotlin.collections.emptyList()
}