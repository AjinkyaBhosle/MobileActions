package com.ajinkya.mobileaction

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.AlarmClock
import android.provider.ContactsContract
import android.provider.MediaStore
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.telecom.TelecomManager
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Full background pipeline:
 *   1. Android SpeechRecognizer for transcription
 *   2. OpenAI chat/completions via HttpURLConnection for command parsing
 *   3. Native action dispatcher — mirrors JS actionExecutor for top ~15 actions
 *   4. Android TextToSpeech (free) for voice feedback
 *
 * Runs entirely from the foreground service so it works when the app is swiped
 * away, minimized, or the screen is locked. JS/React-Native is NOT required.
 */
class NativeCommandProcessor(private val context: Context) {
    private val TAG = "NativeCmdProcessor"
    private val prefs: SharedPreferences =
        context.getSharedPreferences("mobile_action_prefs", Context.MODE_PRIVATE)

    private val mainHandler = Handler(Looper.getMainLooper())
    private val netExecutor = Executors.newSingleThreadExecutor()

    // Singleton-ish TTS (init once, reused)
    private var tts: TextToSpeech? = null
    private var ttsReady = false

    init {
        initTts()
    }

    private fun initTts() {
        if (tts != null) return
        tts = TextToSpeech(context.applicationContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts?.language = Locale.US
                ttsReady = true
                Log.d(TAG, "TTS ready")
            } else {
                Log.w(TAG, "TTS init failed")
            }
        }
    }

    fun speak(text: String) {
        if (!ttsReady) {
            mainHandler.postDelayed({ speak(text) }, 400)
            return
        }
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "ma-${System.currentTimeMillis()}")
    }

    // ─── Entry point — called by WakeWordService on wake detection ───
    fun startListeningAndProcess() {
        speak("Yes")
        // Small delay so "Yes" acknowledgement doesn't bleed into STT input
        mainHandler.postDelayed({ startSpeechRecognition() }, 600)
    }

    private fun startSpeechRecognition() {
        mainHandler.post {
            try {
                val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                        RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
                }
                recognizer.setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) { Log.d(TAG, "STT ready") }
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(rmsdB: Float) {}
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() {}
                    override fun onEvent(eventType: Int, params: Bundle?) {}
                    override fun onPartialResults(partialResults: Bundle?) {}
                    override fun onError(error: Int) {
                        Log.w(TAG, "STT error: $error")
                        recognizer.destroy()
                        notifyWakeHandled()
                    }
                    override fun onResults(results: Bundle?) {
                        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        val text = matches?.firstOrNull() ?: ""
                        Log.d(TAG, "STT result: '$text'")
                        recognizer.destroy()
                        if (text.isBlank() || isWakeOrFiller(text)) {
                            notifyWakeHandled()
                        } else {
                            sendToOpenAI(text)
                        }
                    }
                })
                recognizer.startListening(intent)
            } catch (e: Exception) {
                Log.e(TAG, "STT start failed: ${e.message}")
                notifyWakeHandled()
            }
        }
    }

    private fun isWakeOrFiller(text: String): Boolean {
        val normalized = text.trim().lowercase().replace(Regex("[^a-z0-9 ]"), "")
        return normalized in setOf("hey mobile", "hey mobil", "hi mobile", "he mobile",
            "hey", "hi", "ok", "yes", "yes sir")
    }

    // ─── OpenAI call (native, off the main thread) ───
    private fun sendToOpenAI(userText: String) {
        val apiKey = prefs.getString("openai_api_key", "") ?: ""
        if (apiKey.isBlank()) {
            Log.w(TAG, "No OpenAI API key saved in prefs")
            speak("Configuration incomplete. Please open the app first.")
            notifyWakeHandled()
            return
        }

        netExecutor.submit {
            try {
                val body = JSONObject().apply {
                    put("model", "gpt-4o-mini")
                    put("response_format", JSONObject().put("type", "json_object"))
                    put("temperature", 0.2)
                    put("max_tokens", 300)
                    put("messages", JSONArray().apply {
                        put(JSONObject().apply {
                            put("role", "system")
                            put("content", BRIEF_SYSTEM_PROMPT)
                        })
                        put(JSONObject().apply {
                            put("role", "user")
                            put("content", userText)
                        })
                    })
                }

                val conn = (URL("https://api.openai.com/v1/chat/completions").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    doOutput = true
                    connectTimeout = 10000
                    readTimeout = 15000
                    setRequestProperty("Authorization", "Bearer $apiKey")
                    setRequestProperty("Content-Type", "application/json")
                }
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
                val code = conn.responseCode
                val resp = if (code in 200..299) {
                    conn.inputStream.bufferedReader().readText()
                } else {
                    conn.errorStream?.bufferedReader()?.readText() ?: ""
                }
                conn.disconnect()

                if (code !in 200..299) {
                    Log.w(TAG, "OpenAI error $code: $resp")
                    speak("I couldn't process that")
                    notifyWakeHandled()
                    return@submit
                }

                val content = JSONObject(resp)
                    .getJSONArray("choices")
                    .getJSONObject(0)
                    .getJSONObject("message")
                    .getString("content")
                val parsed = JSONObject(content)
                val actions = parsed.optJSONArray("actions") ?: JSONArray()

                Log.d(TAG, "Parsed ${actions.length()} action(s): $content")
                mainHandler.post { executeActions(actions, userText) }
            } catch (e: Exception) {
                Log.e(TAG, "OpenAI call failed", e)
                speak("Network error")
                notifyWakeHandled()
            }
        }
    }

    // ─── Action dispatcher (mirrors JS executor, top 15 actions) ───
    private fun executeActions(actions: JSONArray, userText: String) {
        if (actions.length() == 0) {
            speak("I didn't understand")
            notifyWakeHandled()
            return
        }
        for (i in 0 until actions.length()) {
            val act = actions.getJSONObject(i)
            val name = act.optString("action", "")
            val params = act.optJSONObject("params") ?: JSONObject()
            try {
                runAction(name, params)
            } catch (e: Exception) {
                Log.e(TAG, "Action '$name' failed: ${e.message}")
            }
        }
        notifyWakeHandled()
    }

    private fun runAction(name: String, p: JSONObject) {
        Log.d(TAG, "[NativeExec] action=$name params=$p")
        when (name) {
            "flashlight_on" -> { setFlashlight(true); speak("Flashlight on") }
            "flashlight_off" -> { setFlashlight(false); speak("Flashlight off") }
            "volume_up" -> { adjustVolume(true); speak("Volume up") }
            "volume_down" -> { adjustVolume(false); speak("Volume down") }
            "mute" -> { muteAudio(true); speak("Muted") }
            "unmute" -> { muteAudio(false); speak("Unmuted") }
            "time_query" -> {
                val now = java.text.SimpleDateFormat("h:mm a", Locale.US).format(java.util.Date())
                speak("It is $now")
            }
            "date_query" -> {
                val d = java.text.SimpleDateFormat("EEEE, MMMM d", Locale.US).format(java.util.Date())
                speak("Today is $d")
            }
            "set_alarm" -> {
                val hour = p.optString("hour", "7").toIntOrNull() ?: 7
                val minute = p.optString("minute", "0").toIntOrNull() ?: 0
                val label = p.optString("label", "Mobile Action alarm")
                val i = Intent(AlarmClock.ACTION_SET_ALARM).apply {
                    putExtra(AlarmClock.EXTRA_HOUR, hour)
                    putExtra(AlarmClock.EXTRA_MINUTES, minute)
                    putExtra(AlarmClock.EXTRA_MESSAGE, label)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(i)
                speak("Alarm set for %d:%02d".format(hour, minute))
            }
            "open_camera" -> {
                val i = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
                context.startActivity(i); speak("Opening camera")
            }
            "open_maps" -> {
                val q = p.optString("query", "")
                val uri = if (q.isBlank()) Uri.parse("geo:0,0") else Uri.parse("geo:0,0?q=${Uri.encode(q)}")
                val i = Intent(Intent.ACTION_VIEW, uri).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
                context.startActivity(i); speak(if (q.isBlank()) "Opening maps" else "Searching for $q")
            }
            "wifi_settings" -> openSettings(Settings.ACTION_WIFI_SETTINGS, "Wi-Fi settings")
            "bluetooth_settings" -> openSettings(Settings.ACTION_BLUETOOTH_SETTINGS, "Bluetooth settings")
            "open_dialer" -> {
                val i = Intent(Intent.ACTION_DIAL).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
                context.startActivity(i); speak("Opening dialer")
            }
            "make_call" -> {
                val contact = p.optString("contact", "")
                val number = if (contact.matches(Regex("^[0-9+\\-\\s()]+$"))) {
                    contact.replace(Regex("[^0-9+]"), "")
                } else findContactNumber(contact) ?: ""
                if (number.isNotBlank()) {
                    try {
                        val tm = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
                        tm.placeCall(Uri.fromParts("tel", number, null), Bundle())
                        speak("Calling $contact")
                    } catch (e: SecurityException) {
                        val i = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number")).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
                        context.startActivity(i)
                        speak("Opening dialer for $contact")
                    }
                } else speak("Contact not found")
            }
            "send_sms" -> {
                val contact = p.optString("contact", "")
                val message = p.optString("message", "")
                val number = if (contact.matches(Regex("^[0-9+\\-\\s()]+$"))) {
                    contact.replace(Regex("[^0-9+]"), "")
                } else findContactNumber(contact) ?: contact
                val uri = if (message.isBlank()) Uri.parse("sms:$number")
                else Uri.parse("sms:$number?body=${Uri.encode(message)}")
                val i = Intent(Intent.ACTION_VIEW, uri).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
                context.startActivity(i)
                speak("Opening message to $contact")
            }
            "open_app" -> {
                val appName = p.optString("appName", p.optString("name", ""))
                val pkgName = p.optString("packageName", "")
                val pkg = if (pkgName.isNotBlank()) pkgName else lookupAppPackage(appName)
                if (pkg.isNotBlank()) {
                    val launch = context.packageManager.getLaunchIntentForPackage(pkg)
                    if (launch != null) {
                        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        context.startActivity(launch); speak("Opening $appName")
                    } else speak("Can't find $appName")
                } else speak("I don't know the app $appName")
            }
            "ai_chat", "speak" -> {
                val text = p.optString("text", p.optString("message", ""))
                if (text.isNotBlank()) speak(text)
            }
            else -> {
                Log.w(TAG, "Unsupported action in native path: $name — falling back to JS broadcast")
                broadcastToJs(name, p)
            }
        }
    }

    private fun notifyWakeHandled() {
        context.sendBroadcast(Intent("com.ajinkya.mobileaction.COMMAND_HANDLED"))
    }

    private fun broadcastToJs(action: String, params: JSONObject) {
        // Silent when JS is dead — only helps when app is alive
        val i = Intent("com.ajinkya.mobileaction.EXEC_ACTION").apply {
            putExtra("action", action)
            putExtra("params", params.toString())
        }
        context.sendBroadcast(i)
    }

    // ─── Helpers ───
    private fun setFlashlight(on: Boolean) {
        val cm = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        cm.setTorchMode(cm.cameraIdList[0], on)
    }

    private fun adjustVolume(up: Boolean) {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val dir = if (up) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER
        am.adjustStreamVolume(AudioManager.STREAM_MUSIC, dir, AudioManager.FLAG_SHOW_UI)
    }

    private fun muteAudio(mute: Boolean) {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val dir = if (mute) AudioManager.ADJUST_MUTE else AudioManager.ADJUST_UNMUTE
        am.adjustStreamVolume(AudioManager.STREAM_MUSIC, dir, 0)
    }

    private fun openSettings(action: String, spokenLabel: String) {
        val i = Intent(action).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        try { context.startActivity(i); speak("Opening $spokenLabel") } catch (_: Exception) {}
    }

    private fun findContactNumber(name: String): String? {
        if (name.isBlank()) return null
        return try {
            val cursor = context.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER),
                null, null, null
            )
            cursor?.use {
                val ni = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                val pi = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                while (it.moveToNext()) {
                    val contactName = it.getString(ni) ?: ""
                    if (contactName.lowercase().contains(name.lowercase())) return it.getString(pi)
                }
            }
            null
        } catch (e: Exception) { null }
    }

    private fun lookupAppPackage(appName: String): String {
        if (appName.isBlank()) return ""
        val pm = context.packageManager
        val target = appName.lowercase()
        try {
            val apps = pm.getInstalledApplications(0)
            for (ai in apps) {
                val label = pm.getApplicationLabel(ai).toString().lowercase()
                if (label == target || label.contains(target) || target.contains(label)) {
                    return ai.packageName
                }
            }
        } catch (e: Exception) { Log.w(TAG, "App lookup failed: ${e.message}") }
        return ""
    }

    fun shutdown() {
        try { tts?.stop(); tts?.shutdown() } catch (_: Exception) {}
    }

    companion object {
        // Kept short to save tokens — native path is fast-lane for common actions.
        private val BRIEF_SYSTEM_PROMPT = """
You are a phone assistant. Output ONLY JSON with key "actions" (array).
Supported actions: flashlight_on, flashlight_off, volume_up, volume_down, mute, unmute,
time_query, date_query, set_alarm{hour,minute,label}, open_camera, open_maps{query},
wifi_settings, bluetooth_settings, open_dialer, make_call{contact},
send_sms{contact,message}, open_app{appName}, ai_chat{text}.
Always respond with {"actions":[...]}. For unknown requests use ai_chat with a short answer.
Examples:
"flashlight on" → {"actions":[{"action":"flashlight_on","params":{}}]}
"set alarm 7 am" → {"actions":[{"action":"set_alarm","params":{"hour":"7","minute":"0"}}]}
"call mom" → {"actions":[{"action":"make_call","params":{"contact":"mom"}}]}
"what time" → {"actions":[{"action":"time_query","params":{}}]}
""".trimIndent()
    }
}
