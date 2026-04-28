package com.ajinkya.mobileaction

import android.content.*
import android.os.IBinder
import android.os.Build
import android.provider.ContactsContract
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

    /**
     * Look up a contact's phone number by partial name match.
     * Returns the phone number string (digits only) or null if no match.
     * Requires READ_CONTACTS permission.
     */
    @ReactMethod
    fun lookupContact(nameQuery: String, promise: Promise) {
        try {
            val resolver = reactApplicationContext.contentResolver
            val uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
            val projection = arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            )
            val cursor = resolver.query(uri, projection, null, null, null)
            var bestMatch: String? = null
            val q = nameQuery.lowercase().trim()
            cursor?.use {
                val nameIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                val numIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                while (it.moveToNext()) {
                    val name = (it.getString(nameIdx) ?: "").lowercase()
                    val firstName = name.split(" ").firstOrNull() ?: ""
                    if (name.contains(q) || q == firstName || q.contains(firstName) && firstName.isNotEmpty()) {
                        bestMatch = it.getString(numIdx)?.replace("[^0-9+]".toRegex(), "")
                        if (name.startsWith(q) || firstName == q) {
                            // strong match — stop searching
                            break
                        }
                    }
                }
            }
            Log.d(TAG, "lookupContact('$nameQuery') -> $bestMatch")
            promise.resolve(bestMatch)
        } catch (e: Exception) {
            Log.e(TAG, "lookupContact error: ${e.message}")
            promise.reject("LOOKUP_ERROR", e.message, e)
        }
    }

    /**
     * Place a phone call silently via TelecomManager (no dialer UI flicker).
     * Requires CALL_PHONE permission already granted.
     */
    @ReactMethod
    fun placeCall(phoneNumber: String, promise: Promise) {
        val intent = Intent(reactApplicationContext, WakeWordService::class.java)
        intent.action = "PLACE_CALL"
        intent.putExtra("number", phoneNumber)
        reactApplicationContext.startService(intent)
        promise.resolve(true)
    }

    /**
     * Read the in-memory ring buffer of recent notifications captured by
     * MobileActionNotificationListener. Throws if the user hasn't granted
     * notification access — JS catches this and opens the settings page.
     */
    @ReactMethod
    fun getRecentNotifications(promise: Promise) {
        try {
            if (!MobileActionNotificationListener.isEnabled(reactApplicationContext)) {
                promise.reject("NO_PERMISSION", "Notification access not granted")
                return
            }
            val arr = Arguments.createArray()
            for (n in MobileActionNotificationListener.recent) {
                val m = Arguments.createMap()
                m.putString("packageName", n.packageName)
                m.putString("appName", n.appName)
                m.putString("title", n.title)
                m.putString("text", n.text)
                m.putDouble("time", n.time.toDouble())
                arr.pushMap(m)
            }
            promise.resolve(arr)
        } catch (e: Exception) {
            promise.reject("READ_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setMute(mute: Boolean, promise: Promise) {
        try {
            val am = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
            val direction = if (mute) android.media.AudioManager.ADJUST_MUTE else android.media.AudioManager.ADJUST_UNMUTE
            am.adjustStreamVolume(android.media.AudioManager.STREAM_MUSIC, direction, 0)
            am.adjustStreamVolume(android.media.AudioManager.STREAM_RING, direction, 0)
            am.adjustStreamVolume(android.media.AudioManager.STREAM_NOTIFICATION, direction, 0)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("MUTE_ERROR", e.message, e)
        }
    }

    /**
     * Fire a media-key broadcast that any active media app responds to
     * (Spotify, YouTube Music, system music player, etc.).
     */
    @ReactMethod
    fun mediaKey(key: String, promise: Promise) {
        try {
            val keyCode = when (key.uppercase()) {
                "PLAY"     -> android.view.KeyEvent.KEYCODE_MEDIA_PLAY
                "PAUSE"    -> android.view.KeyEvent.KEYCODE_MEDIA_PAUSE
                "TOGGLE"   -> android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
                "NEXT"     -> android.view.KeyEvent.KEYCODE_MEDIA_NEXT
                "PREVIOUS" -> android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS
                "STOP"     -> android.view.KeyEvent.KEYCODE_MEDIA_STOP
                else -> { promise.reject("BAD_KEY", "Unknown media key: $key"); return }
            }
            val am = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
            am.dispatchMediaKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, keyCode))
            am.dispatchMediaKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, keyCode))
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("MEDIA_KEY_ERROR", e.message, e)
        }
    }

    /**
     * Trigger the system screenshot via accessibility shortcut.
     * Note: This requires the app to have an Accessibility Service to fully
     * automate it. As a fallback we fire the global action from the bound
     * accessibility hook when available; otherwise we just guide the user.
     */
    @ReactMethod
    fun takeScreenshot(promise: Promise) {
        // No system API exists for non-system apps to take screenshots without
        // the user explicitly using the hardware key combo. We open Quick
        // Settings as a hint.
        promise.resolve(false)
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
