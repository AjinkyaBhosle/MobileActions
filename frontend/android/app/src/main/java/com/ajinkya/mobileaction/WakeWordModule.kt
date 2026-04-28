package com.ajinkya.mobileaction

import android.content.*
import android.os.IBinder
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class WakeWordModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private var wakeWordService: WakeWordService? = null
    private var isBound = false
    private val TAG = "WakeWordModule"

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(className: ComponentName, service: IBinder) {
            val binder = service as WakeWordService.WakeWordBinder
            wakeWordService = binder.getService()
            isBound = true
            Log.d(TAG, "Service Bound Successfully")
            
            // Register direct callback so wake events go straight to JS
            wakeWordService?.wakeCallback = object : WakeWordService.WakeCallback {
                override fun onWakeTriggered() {
                    Log.d(TAG, "WakeCallback.onWakeTriggered -> emitting to JS")
                    sendEventToJS("onBackgroundWake", null)
                }
                override fun onCommandHandled() {
                    Log.d(TAG, "WakeCallback.onCommandHandled -> emitting to JS")
                    sendEventToJS("onCommandHandled", null)
                }
            }
        }

        override fun onServiceDisconnected(arg0: ComponentName) {
            isBound = false
            wakeWordService = null
        }
    }

    init {
        // Register receiver for background triggers
        val filter = IntentFilter()
        filter.addAction("onWakeTriggered")
        filter.addAction("onCommandHandled")
        filter.addAction("onTranscriptReceived")

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    when (intent?.action) {
                        "onWakeTriggered" -> sendEventToJS("onBackgroundWake", null)
                        "onCommandHandled" -> sendEventToJS("onCommandHandled", null)
                        "onTranscriptReceived" -> {
                            val text = intent.getStringExtra("text")
                            val params = Arguments.createMap()
                            params.putString("text", text)
                            sendEventToJS("onTranscript", params)
                        }
                    }
                }
            }, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            reactContext.registerReceiver(object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    when (intent?.action) {
                        "onWakeTriggered" -> sendEventToJS("onBackgroundWake", null)
                        "onCommandHandled" -> sendEventToJS("onCommandHandled", null)
                        "onTranscriptReceived" -> {
                            val text = intent.getStringExtra("text")
                            val params = Arguments.createMap()
                            params.putString("text", text)
                            sendEventToJS("onTranscript", params)
                        }
                    }
                }
            }, filter)
        }
        
        // Bind to service
        val intent = Intent(reactContext, WakeWordService::class.java)
        reactContext.bindService(intent, connection, Context.BIND_AUTO_CREATE)
    }

    override fun getName(): String = "WakeWordModule"

    @ReactMethod
    fun startListening() {
        wakeWordService?.startListening()
    }

    @ReactMethod
    fun stopListening() {
        wakeWordService?.stopListening()
    }

    @ReactMethod
    fun startService() {
        val intent = Intent(reactApplicationContext, WakeWordService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactApplicationContext.startForegroundService(intent)
        } else {
            reactApplicationContext.startService(intent)
        }
    }

    @ReactMethod
    fun stopService() {
        val intent = Intent(reactApplicationContext, WakeWordService::class.java)
        reactApplicationContext.stopService(intent)
    }

    @ReactMethod
    fun setFlashlight(state: Boolean) {
        val intent = Intent(reactApplicationContext, WakeWordService::class.java)
        intent.action = if (state) "FLASHLIGHT_ON" else "FLASHLIGHT_OFF"
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun adjustVolume(increase: Boolean) {
        val intent = Intent(reactApplicationContext, WakeWordService::class.java)
        intent.action = if (increase) "VOLUME_UP" else "VOLUME_DOWN"
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Keep NativeEventEmitter happy
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep NativeEventEmitter happy
    }

    private fun sendEventToJS(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
