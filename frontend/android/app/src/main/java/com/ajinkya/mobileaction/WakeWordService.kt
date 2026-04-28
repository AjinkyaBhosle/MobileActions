package com.ajinkya.mobileaction

import android.app.Service
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.ServiceInfo
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import android.os.Build
import android.os.PowerManager
import android.util.Log
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.content.Context
import androidx.core.app.NotificationCompat
import android.provider.ContactsContract
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import org.vosk.android.StorageService
import java.io.IOException

class WakeWordService : Service(), RecognitionListener {
    private var model: Model? = null
    private var speechService: SpeechService? = null
    private val binder = WakeWordBinder()
    private val TAG = "WakeWordService"
    private var wakeLock: PowerManager.WakeLock? = null
    
    // Direct callback to WakeWordModule — avoids cross-process broadcast issues
    interface WakeCallback {
        fun onWakeTriggered()
        fun onCommandHandled()
    }
    var wakeCallback: WakeCallback? = null

    inner class WakeWordBinder : Binder() {
        fun getService(): WakeWordService = this@WakeWordService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        showNotification()
        
        when (intent?.action) {
            "FLASHLIGHT_ON" -> setFlashlight(true)
            "FLASHLIGHT_OFF" -> setFlashlight(false)
            "VOLUME_UP" -> adjustVolume(true)
            "VOLUME_DOWN" -> adjustVolume(false)
            "PLACE_CALL" -> {
                val number = intent.getStringExtra("number") ?: ""
                if (number.isNotEmpty()) makePhoneCall(number)
            }
        }

        return START_STICKY
    }

    private fun setFlashlight(state: Boolean) {
        try {
            val cameraManager = getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val cameraId = cameraManager.cameraIdList[0]
            cameraManager.setTorchMode(cameraId, state)
        } catch (e: Exception) {
            Log.e(TAG, "Flashlight Error: ${e.message}")
        }
    }

    private fun adjustVolume(increase: Boolean) {
        try {
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val direction = if (increase) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER
            audioManager.adjustStreamVolume(AudioManager.STREAM_MUSIC, direction, AudioManager.FLAG_SHOW_UI)
        } catch (e: Exception) {
            Log.e(TAG, "Volume Error: ${e.message}")
        }
    }

    override fun onCreate() {
        super.onCreate()
        acquireWakeLock()
        showNotification()
        initModel()
    }

    /**
     * Keep the CPU running so Vosk can process audio even when screen is off.
     */
    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "MobileAction::WakeWordLock"
            )
            wakeLock?.acquire()
            Log.d(TAG, "WakeLock acquired — CPU will stay active")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire WakeLock: ${e.message}")
        }
    }

    private fun showNotification() {
        val channelId = "wake_word_service"
        val channelName = "Wake Word Service"
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_LOW)
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Mobile Action Assistant")
            .setContentText("Hands-free listening active")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(1, notification)
            }
        } catch (e: Exception) {
            Log.e("WakeWordService", "Failed to start foreground service: ${e.message}")
        }
    }

    private fun initModel() {
        StorageService.unpack(this, "vosk-model", "model",
            { model: Model? ->
                this.model = model
                Log.d(TAG, "Vosk model loaded successfully")
                startListening()
            },
            { exception: IOException ->
                Log.e(TAG, "Failed to unpack model: ${exception.message}")
            }
        )
    }

    private var isCommandState = false
    private var isTransitioning = false
    private var isFlashlightOn = false  // Track flashlight state for React Native bridge calls
    private val WAKE_WORDS = arrayOf("hey mobile", "hi mobile", "hello mobile", "ok mobile", "yo mobile", "mobile", "action")
    
    private val WAKE_GRAMMAR = "[\"hey mobile\", \"hi mobile\", \"hello mobile\", \"ok mobile\", \"yo mobile\", \"mobile\", \"action\", \"[unk]\"]"

    fun startListening() {
        try {
            if (model == null) {
                Log.w(TAG, "Model not ready, cannot start listening")
                return
            }
            
            // In the Hybrid architecture, we ONLY use the Wake Word grammar in Vosk.
            // Complex commands are handled by Google STT + OpenAI.
            val rec = Recognizer(model, 16000.0f, WAKE_GRAMMAR)
            
            speechService?.stop()
            speechService = SpeechService(rec, 16000.0f)
            speechService?.startListening(this)
            
            isCommandState = false
            isTransitioning = false
            Log.d(TAG, "Listening for: WAKE WORD")
        } catch (e: Exception) {
            Log.e(TAG, "Native Init Error: ${e.message}")
            // Retry after brief pause
            val handler = android.os.Handler(android.os.Looper.getMainLooper())
            handler.postDelayed({ startListening() }, 2000)
        }
    }

    fun stopListening() {
        Log.d(TAG, "Assistant Paused")
        speechService?.stop()
        speechService = null
        isCommandState = false
        isTransitioning = false
    }

    /**
     * Extract the recognized text from Vosk's JSON response.
     */
    private fun extractText(json: String): String {
        return try {
            val obj = JSONObject(json)
            val text = obj.optString("partial", "").ifEmpty {
                obj.optString("text", "")
            }
            text.lowercase().trim()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse Vosk JSON: $json")
            ""
        }
    }

    override fun onPartialResult(hypothesis: String) {
        val text = extractText(hypothesis)
        if (text.isEmpty() || text == "[unk]") return
        if (isTransitioning) return
        
        // Only use partials for WAKE WORD detection
        if (!isCommandState) {
            if (WAKE_WORDS.any { text.contains(it) }) {
                Log.d(TAG, ">>> WAKE WORD DETECTED: \"$text\"")
                enterCommandState()
            }
        }
        // Commands wait for onResult/onFinalResult (complete phrases)
    }

    private fun isWakeWordOnly(text: String): Boolean {
        return WAKE_WORDS.any { text.trim() == it }
    }

    private var lastWakeTimestamp = 0L

    private fun enterCommandState() {
        if (isCommandState) return
        
        val now = System.currentTimeMillis()
        if (now - lastWakeTimestamp < 2000) {
            Log.d(TAG, "Wake word cooldown active, ignoring")
            return
        }
        lastWakeTimestamp = now
        
        isCommandState = true
        isTransitioning = true
        
        // CRITICAL: Stop the old recognizer IMMEDIATELY to free the microphone
        // so ExpoSpeechRecognition can take over in React Native
        speechService?.stop()
        speechService = null
        
        vibrate(100)
        Log.d(TAG, ">>> HANDING OFF TO REACT NATIVE")
        // Use direct callback instead of sendBroadcast to avoid cross-process issues
        wakeCallback?.onWakeTriggered()
            ?: Log.w(TAG, "No wakeCallback registered! Broadcast fallback.")
        
        // We do NOT restart startListening() here!
        // React Native will capture the command via Google STT, 
        // then call WakeWordModule.startListening() to resume Vosk when done.
    }

    // handleCommandHypothesis removed — handled by React Native + OpenAI

    private fun vibrate(duration: Long) {
        try {
            val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(android.os.VibrationEffect.createOneShot(duration, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(duration)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Vibration failed: ${e.message}")
        }
    }

    private fun makePhoneCall(number: String) {
        try {
            val telecomManager = getSystemService(Context.TELECOM_SERVICE) as android.telecom.TelecomManager
            val uri = android.net.Uri.fromParts("tel", number, null)
            val extras = android.os.Bundle()
            if (androidx.core.content.ContextCompat.checkSelfPermission(this, android.Manifest.permission.CALL_PHONE) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                telecomManager.placeCall(uri, extras)
                Log.d(TAG, "Initiated silent call via TelecomManager to: $number")
            } else {
                Log.e(TAG, "Missing CALL_PHONE permission")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Call failed: ${e.message}")
        }
    }

    private fun findContactNumber(nameQuery: String): String? {
        var phoneNumber: String? = null
        try {
            val uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
            val projection = arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            )
            val cursor = contentResolver.query(uri, projection, null, null, null)
            cursor?.use {
                val nameIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                val numberIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                while (it.moveToNext()) {
                    val contactName = it.getString(nameIndex) ?: ""
                    // Very simple loose matching for offline Vosk transcription
                    if (contactName.lowercase().contains(nameQuery.lowercase()) || nameQuery.lowercase().contains(contactName.lowercase().split(" ")[0])) {
                        phoneNumber = it.getString(numberIndex)
                        break
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read contacts: ${e.message}")
        }
        return phoneNumber
    }

    private fun parseSpokenNumber(text: String): String {
        return text.replace("zero", "0")
                   .replace("one", "1")
                   .replace("two", "2")
                   .replace("three", "3")
                   .replace("four", "4")
                   .replace("five", "5")
                   .replace("six", "6")
                   .replace("seven", "7")
                   .replace("eight", "8")
                   .replace("nine", "9")
                   .replace("[^0-9]".toRegex(), "")
    }

    override fun onResult(hypothesis: String) {
        val text = extractText(hypothesis)
        if (text.isEmpty() || text == "[unk]" || isTransitioning) return
        Log.d(TAG, "Result: \"$text\" (commandState=$isCommandState)")
        
        if (!isCommandState) {
            // Backup wake word detection (in case partials missed it)
            if (WAKE_WORDS.any { text.contains(it) }) {
                Log.d(TAG, ">>> WAKE WORD via Result: \"$text\"")
                enterCommandState()
            }
        }
    }

    override fun onFinalResult(hypothesis: String) {
        val text = extractText(hypothesis)
        if (text.isEmpty() || text == "[unk]" || isTransitioning) return
        Log.d(TAG, "Final: \"$text\" (commandState=$isCommandState)")
        
        if (!isCommandState) {
            // Backup wake word detection (in case partials missed it)
            if (WAKE_WORDS.any { text.contains(it) }) {
                Log.d(TAG, ">>> WAKE WORD via Final: \"$text\"")
                enterCommandState()
            }
        }
    }

    override fun onError(exception: Exception) {
        Log.e(TAG, "Vosk Error: ${exception.message}")
        isCommandState = false
        isTransitioning = false
        val handler = android.os.Handler(android.os.Looper.getMainLooper())
        handler.postDelayed({ startListening() }, 2000)
    }

    override fun onTimeout() {
        Log.d(TAG, "Vosk timeout — restarting listener")
        isCommandState = false
        isTransitioning = false
        startListening()
    }

    override fun onDestroy() {
        super.onDestroy()
        speechService?.shutdown()
        try {
            wakeLock?.release()
            Log.d(TAG, "WakeLock released")
        } catch (e: Exception) {}
    }
}
