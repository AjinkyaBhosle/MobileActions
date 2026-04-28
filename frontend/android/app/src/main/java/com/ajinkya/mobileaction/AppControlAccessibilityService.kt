package com.ajinkya.mobileaction

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.concurrent.atomic.AtomicReference

/**
 * Accessibility service that lets the app drive UI on other apps.
 *
 * The user must enable this service in Settings → Accessibility → Mobile Action.
 * Once enabled, WakeWordModule uses a static reference to invoke gestures and
 * node-tree searches on whatever app is currently in the foreground.
 */
class AppControlAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "AccService"
        private val instance = AtomicReference<AppControlAccessibilityService?>(null)
        fun get(): AppControlAccessibilityService? = instance.get()
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance.set(this)
        Log.d(TAG, "Accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) { /* not used — we drive on demand */ }
    override fun onInterrupt() { /* no-op */ }
    override fun onUnbind(intent: android.content.Intent?): Boolean {
        instance.compareAndSet(this, null)
        return super.onUnbind(intent)
    }

    /** Find a node whose text or content-description matches `query` (case-insensitive substring) and click it. */
    fun clickByLabel(query: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val q = query.lowercase()
        val hit = findNode(root) { node ->
            val t = (node.text?.toString() ?: "").lowercase()
            val c = (node.contentDescription?.toString() ?: "").lowercase()
            (t.contains(q) || c.contains(q)) && (node.isClickable || node.isLongClickable)
        }
        return hit?.performAction(AccessibilityNodeInfo.ACTION_CLICK) ?: false
    }

    /** Find the focused EditText (or first editable node) and replace its text. */
    fun typeText(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val node = findNode(root) { it.isFocused && it.isEditable } ?: findNode(root) { it.isEditable } ?: return false
        val args = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text) }
        return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    /** Scroll the first scrollable node found, in the given direction. */
    fun scroll(direction: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val node = findNode(root) { it.isScrollable } ?: return false
        val action = when (direction.lowercase()) {
            "up", "backward" -> AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
            "down", "forward" -> AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
            else -> AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
        }
        return node.performAction(action)
    }

    /** Perform a clipboard action on the focused EditText. */
    fun clipboardAction(name: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val node = findNode(root) { it.isFocused && it.isEditable } ?: findNode(root) { it.isEditable } ?: return false
        val action = when (name.uppercase()) {
            "COPY"       -> AccessibilityNodeInfo.ACTION_COPY
            "CUT"        -> AccessibilityNodeInfo.ACTION_CUT
            "PASTE"      -> AccessibilityNodeInfo.ACTION_PASTE
            "SELECT_ALL" -> AccessibilityNodeInfo.ACTION_SELECT
            else -> return false
        }
        if (name.uppercase() == "SELECT_ALL") {
            // Need to set selection range to whole text
            val text = node.text?.toString() ?: ""
            val args = Bundle().apply {
                putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, 0)
                putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, text.length)
            }
            return node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, args)
        }
        return node.performAction(action)
    }

    /** Press global system buttons. */
    fun globalAction(name: String): Boolean {        val act = when (name.uppercase()) {
            "BACK" -> GLOBAL_ACTION_BACK
            "HOME" -> GLOBAL_ACTION_HOME
            "RECENTS" -> GLOBAL_ACTION_RECENTS
            "NOTIFICATIONS" -> GLOBAL_ACTION_NOTIFICATIONS
            "QUICK_SETTINGS" -> GLOBAL_ACTION_QUICK_SETTINGS
            "POWER_DIALOG" -> GLOBAL_ACTION_POWER_DIALOG
            "LOCK_SCREEN" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) GLOBAL_ACTION_LOCK_SCREEN else GLOBAL_ACTION_BACK
            "TAKE_SCREENSHOT" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) GLOBAL_ACTION_TAKE_SCREENSHOT else return false
            else -> return false
        }
        return performGlobalAction(act)
    }

    /** Tap at absolute screen coordinates. */
    fun tapAt(x: Float, y: Float): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val path = Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 100))
            .build()
        return dispatchGesture(gesture, null, null)
    }

    /** Recursively walk node tree and return first node matching `pred`. */
    private fun findNode(root: AccessibilityNodeInfo, pred: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
        if (pred(root)) return root
        for (i in 0 until root.childCount) {
            val child = root.getChild(i) ?: continue
            val match = findNode(child, pred)
            if (match != null) return match
        }
        return null
    }

    /** Concatenate every visible text node in the foreground window. */
    fun readVisibleText(): String {
        val root = rootInActiveWindow ?: return ""
        val sb = StringBuilder()
        collectText(root, sb)
        return sb.toString().trim()
    }

    private fun collectText(node: AccessibilityNodeInfo, sb: StringBuilder) {
        val t = node.text?.toString()
        if (!t.isNullOrBlank()) sb.append(t).append(' ')
        val cd = node.contentDescription?.toString()
        if (!cd.isNullOrBlank() && cd != t) sb.append(cd).append(' ')
        for (i in 0 until node.childCount) {
            val c = node.getChild(i) ?: continue
            collectText(c, sb)
        }
    }
}
