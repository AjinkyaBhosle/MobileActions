package com.ajinkya.mobileaction

import android.annotation.SuppressLint
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
        // Use accessibility service if available (Android 9+)
        val svc = AppControlAccessibilityService.get()
        if (svc != null) {
            promise.resolve(svc.globalAction("TAKE_SCREENSHOT"))
            return
        }
        promise.resolve(false)
    }

    // ── Accessibility-driven UI actions ────────────────────────────────────

    private fun requireAccessibility(promise: Promise): AppControlAccessibilityService? {
        val svc = AppControlAccessibilityService.get()
        if (svc == null) {
            promise.reject("NO_ACCESSIBILITY", "Accessibility service is not enabled. Open Settings > Accessibility > Mobile Action UI Control.")
            return null
        }
        return svc
    }

    @ReactMethod
    fun accClickLabel(label: String, promise: Promise) {
        val svc = requireAccessibility(promise) ?: return
        promise.resolve(svc.clickByLabel(label))
    }

    @ReactMethod
    fun accTypeText(text: String, promise: Promise) {
        val svc = requireAccessibility(promise) ?: return
        promise.resolve(svc.typeText(text))
    }

    @ReactMethod
    fun accScroll(direction: String, promise: Promise) {
        val svc = requireAccessibility(promise) ?: return
        promise.resolve(svc.scroll(direction))
    }

    @ReactMethod
    fun accGlobalAction(action: String, promise: Promise) {
        val svc = requireAccessibility(promise) ?: return
        promise.resolve(svc.globalAction(action))
    }

    @ReactMethod
    fun accReadScreen(promise: Promise) {
        val svc = requireAccessibility(promise) ?: return
        promise.resolve(svc.readVisibleText())
    }

    @ReactMethod
    fun isAccessibilityEnabled(promise: Promise) {
        promise.resolve(AppControlAccessibilityService.get() != null)
    }

    // ── Location ───────────────────────────────────────────────────────────

    @ReactMethod
    fun getLocation(promise: Promise) {
        try {
            val ctx = reactApplicationContext
            if (androidx.core.content.ContextCompat.checkSelfPermission(
                    ctx, android.Manifest.permission.ACCESS_FINE_LOCATION
                ) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                promise.reject("NO_PERMISSION", "Location permission not granted")
                return
            }
            val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
            val providers = lm.getProviders(true)
            var best: android.location.Location? = null
            for (p in providers) {
                @SuppressLint("MissingPermission")
                val loc = lm.getLastKnownLocation(p) ?: continue
                if (best == null || loc.accuracy < best!!.accuracy) best = loc
            }
            if (best == null) {
                promise.reject("NO_FIX", "No location fix available — open Maps once to acquire GPS")
                return
            }
            val map = Arguments.createMap()
            map.putDouble("lat", best!!.latitude)
            map.putDouble("lng", best!!.longitude)
            map.putDouble("accuracy", best!!.accuracy.toDouble())
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("LOC_ERROR", e.message, e)
        }
    }

    // ── Hardware ───────────────────────────────────────────────────────────

    @ReactMethod
    fun vibrateDevice(durationMs: Int, promise: Promise) {
        try {
            val v = reactApplicationContext.getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(android.os.VibrationEffect.createOneShot(durationMs.toLong(), android.os.VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(durationMs.toLong())
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("VIBRATE_ERR", e.message, e)
        }
    }

    /**
     * Launch ANY installed app by its visible label (case-insensitive substring).
     * Works for Excel, Word, PDF readers, banking apps, SOS apps, anything launchable.
     * Returns the package name on success, or null if no match.
     */
    @ReactMethod
    fun launchAppByName(query: String, promise: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            val q = query.lowercase().trim()
            val launchableApps = pm.getInstalledApplications(0)
                .filter { pm.getLaunchIntentForPackage(it.packageName) != null }

            data class Hit(val score: Int, val pkg: String, val label: String)
            val hits = launchableApps.mapNotNull { ai ->
                val label = (pm.getApplicationLabel(ai)?.toString() ?: "").lowercase()
                val score = when {
                    label == q -> 100
                    label.startsWith(q) -> 50
                    label.split(' ').any { it.startsWith(q) } -> 30
                    label.contains(q) -> 10
                    ai.packageName.contains(q) -> 5
                    else -> 0
                }
                if (score > 0) Hit(score, ai.packageName, label) else null
            }.sortedByDescending { it.score }

            val best = hits.firstOrNull()
            if (best == null) { promise.resolve(null); return }
            val intent = pm.getLaunchIntentForPackage(best.pkg) ?: run { promise.resolve(null); return }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            Log.d(TAG, "launchAppByName('$query') -> ${best.label} (${best.pkg})")
            promise.resolve(best.pkg)
        } catch (e: Exception) {
            Log.e(TAG, "launchAppByName error: ${e.message}")
            promise.reject("LAUNCH_ERR", e.message, e)
        }
    }

    /**
     * Find an audio/video file by partial name in MediaStore and open it
     * with the system's default media player via ACTION_VIEW.
     * type: "audio" | "video" | "any"
     */
    @ReactMethod
    fun findAndPlayMedia(name: String, type: String, promise: Promise) {
        try {
            val q = "%${name.replace("[^a-zA-Z0-9 ]".toRegex(), "")}%"
            val resolver = reactApplicationContext.contentResolver
            data class Found(val uri: android.net.Uri, val mime: String, val title: String)
            var found: Found? = null

            if (type == "audio" || type == "any") {
                val uri = android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                resolver.query(
                    uri,
                    arrayOf(android.provider.MediaStore.Audio.Media._ID, android.provider.MediaStore.Audio.Media.TITLE),
                    "${android.provider.MediaStore.Audio.Media.TITLE} LIKE ?",
                    arrayOf(q),
                    "${android.provider.MediaStore.Audio.Media.DATE_ADDED} DESC LIMIT 1"
                )?.use { c ->
                    if (c.moveToFirst()) {
                        val id = c.getLong(0); val title = c.getString(1) ?: name
                        found = Found(android.content.ContentUris.withAppendedId(uri, id), "audio/*", title)
                    }
                }
            }
            if (found == null && (type == "video" || type == "any")) {
                val uri = android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                resolver.query(
                    uri,
                    arrayOf(android.provider.MediaStore.Video.Media._ID, android.provider.MediaStore.Video.Media.TITLE),
                    "${android.provider.MediaStore.Video.Media.TITLE} LIKE ?",
                    arrayOf(q),
                    "${android.provider.MediaStore.Video.Media.DATE_ADDED} DESC LIMIT 1"
                )?.use { c ->
                    if (c.moveToFirst()) {
                        val id = c.getLong(0); val title = c.getString(1) ?: name
                        found = Found(android.content.ContentUris.withAppendedId(uri, id), "video/*", title)
                    }
                }
            }
            if (found == null) { promise.resolve(null); return }

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(found!!.uri, found!!.mime)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(found!!.title)
        } catch (e: Exception) {
            Log.e(TAG, "findAndPlayMedia error: ${e.message}")
            promise.reject("MEDIA_ERR", e.message, e)
        }
    }

    /**
     * Open a folder in the default file manager (best-effort).
     * Falls back to launching the file manager app itself.
     */
    @ReactMethod
    fun openFileManager(folderPath: String?, promise: Promise) {
        try {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (!folderPath.isNullOrBlank()) {
                    val uri = android.net.Uri.parse("content://com.android.externalstorage.documents/document/primary%3A${android.net.Uri.encode(folderPath)}")
                    setDataAndType(uri, "vnd.android.document/directory")
                } else {
                    setType("*/*")
                }
            }
            try {
                reactApplicationContext.startActivity(intent)
                promise.resolve(true); return
            } catch (e: Exception) { /* try fallback */ }
            // Fallback: open default Files app via launchAppByName
            launchAppByName("files", promise)
        } catch (e: Exception) {
            promise.reject("FM_ERR", e.message, e)
        }
    }

    // ── Continuous location tracking (writes coords to Firestore via JS) ──

    private var trackingHandler: android.os.Handler? = null
    private var trackingRunnable: Runnable? = null

    @ReactMethod
    fun startLocationTracking(intervalSec: Int, durationMin: Int, promise: Promise) {
        try {
            stopLocationTracking(null) // cancel any prior session
            val ctx = reactApplicationContext
            val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
            val handler = android.os.Handler(android.os.Looper.getMainLooper())
            trackingHandler = handler
            val deadline = System.currentTimeMillis() + durationMin * 60_000L

            val r = object : Runnable {
                override fun run() {
                    if (System.currentTimeMillis() > deadline) { Log.d(TAG, "tracking stopped (duration end)"); return }
                    try {
                        @SuppressLint("MissingPermission")
                        val loc = lm.getProviders(true)
                            .mapNotNull { lm.getLastKnownLocation(it) }
                            .minByOrNull { it.accuracy }
                        if (loc != null) {
                            // Emit to JS so JS can write to Firestore
                            val map = Arguments.createMap()
                            map.putDouble("lat", loc.latitude)
                            map.putDouble("lng", loc.longitude)
                            map.putDouble("accuracy", loc.accuracy.toDouble())
                            map.putDouble("ts", System.currentTimeMillis().toDouble())
                            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                .emit("onLocationUpdate", map)
                        }
                    } catch (e: Exception) { Log.w(TAG, "tracking tick error: ${e.message}") }
                    handler.postDelayed(this, intervalSec * 1000L)
                }
            }
            trackingRunnable = r
            handler.post(r)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("TRACK_ERR", e.message, e)
        }
    }

    @ReactMethod
    fun stopLocationTracking(promise: Promise?) {
        trackingRunnable?.let { trackingHandler?.removeCallbacks(it) }
        trackingRunnable = null
        promise?.resolve(true)
    }

    /** Set system clipboard text. */
    @ReactMethod
    fun setClipboard(text: String, promise: Promise) {
        try {
            val cm = reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            cm.setPrimaryClip(android.content.ClipData.newPlainText("MobileAction", text))
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CLIP_ERR", e.message, e)
        }
    }

    /** Read system clipboard text. */
    @ReactMethod
    fun getClipboard(promise: Promise) {
        try {
            val cm = reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            val txt = cm.primaryClip?.getItemAt(0)?.text?.toString() ?: ""
            promise.resolve(txt)
        } catch (e: Exception) {
            promise.reject("CLIP_ERR", e.message, e)
        }
    }

    /** Perform clipboard accessibility actions on the focused EditText. */
    @ReactMethod
    fun accClipboardAction(name: String, promise: Promise) {
        val svc = AppControlAccessibilityService.get()
        if (svc == null) { promise.reject("NO_ACC", "Accessibility not enabled"); return }
        promise.resolve(svc.clipboardAction(name))
    }

    /** Set ringer mode: NORMAL | VIBRATE | SILENT. */
    @ReactMethod
    fun setRingerMode(mode: String, promise: Promise) {
        try {
            val am = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
            val target = when (mode.uppercase()) {
                "NORMAL"  -> android.media.AudioManager.RINGER_MODE_NORMAL
                "VIBRATE" -> android.media.AudioManager.RINGER_MODE_VIBRATE
                "SILENT"  -> android.media.AudioManager.RINGER_MODE_SILENT
                else -> { promise.reject("BAD_MODE", "Use NORMAL|VIBRATE|SILENT"); return }
            }
            am.ringerMode = target
            promise.resolve(true)
        } catch (e: SecurityException) {
            // SILENT often requires DND policy access on Android 6+
            try {
                val intent = Intent(android.provider.Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
            } catch (_: Exception) {}
            promise.reject("DND_PERMISSION", "Grant Do Not Disturb access first", e)
        } catch (e: Exception) {
            promise.reject("RINGER_ERR", e.message, e)
        }
    }

    /** Set Do Not Disturb: ALL (off) | PRIORITY | ALARMS | NONE. */
    @ReactMethod
    fun setDoNotDisturb(filter: String, promise: Promise) {
        try {
            val nm = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !nm.isNotificationPolicyAccessGranted) {
                val intent = Intent(android.provider.Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
                promise.reject("DND_PERMISSION", "Grant Do Not Disturb access first")
                return
            }
            val target = when (filter.uppercase()) {
                "OFF", "ALL" -> android.app.NotificationManager.INTERRUPTION_FILTER_ALL
                "PRIORITY"   -> android.app.NotificationManager.INTERRUPTION_FILTER_PRIORITY
                "ALARMS"     -> android.app.NotificationManager.INTERRUPTION_FILTER_ALARMS
                "NONE", "ON" -> android.app.NotificationManager.INTERRUPTION_FILTER_NONE
                else -> { promise.reject("BAD_FILTER", "Use OFF|PRIORITY|ALARMS|NONE"); return }
            }
            nm.setInterruptionFilter(target)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DND_ERR", e.message, e)
        }
    }

    /** Route audio input/output through Bluetooth SCO (hands-free / headset). */
    @ReactMethod
    fun setBluetoothAudio(on: Boolean, promise: Promise) {
        try {
            val am = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
            am.mode = if (on) android.media.AudioManager.MODE_IN_COMMUNICATION else android.media.AudioManager.MODE_NORMAL
            am.isBluetoothScoOn = on
            if (on) am.startBluetoothSco() else am.stopBluetoothSco()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("BT_AUDIO_ERR", e.message, e)
        }
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
