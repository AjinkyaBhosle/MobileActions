package com.ajinkya.mobileaction

import android.app.Notification
import android.content.Intent
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.util.concurrent.ConcurrentLinkedDeque

/**
 * Listens to system notifications.
 * User must grant access via Settings → Apps → Special access → Notification access.
 *
 * We keep a ring-buffer of the last N notifications in memory; WakeWordModule
 * exposes them to JS via getRecentNotifications().
 */
class MobileActionNotificationListener : NotificationListenerService() {

    companion object {
        private const val TAG = "NotifListener"
        private const val MAX_RECENT = 20
        // Static ring buffer accessed from WakeWordModule.getRecentNotifications()
        val recent: ConcurrentLinkedDeque<NotifEntry> = ConcurrentLinkedDeque()

        fun isEnabled(context: android.content.Context): Boolean {
            val cn = "${context.packageName}/${MobileActionNotificationListener::class.java.name}"
            val flat = android.provider.Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners"
            ) ?: return false
            return flat.split(":").any { it.equals(cn, ignoreCase = true) }
        }
    }

    data class NotifEntry(
        val packageName: String,
        val appName: String,
        val title: String,
        val text: String,
        val time: Long
    )

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.d(TAG, "Notification listener connected")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        try {
            val extras = sbn.notification.extras ?: return
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
            val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
                ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
                ?: ""

            if (title.isEmpty() && text.isEmpty()) return

            val pm = packageManager
            val appName = try {
                pm.getApplicationLabel(pm.getApplicationInfo(sbn.packageName, 0)).toString()
            } catch (e: PackageManager.NameNotFoundException) {
                sbn.packageName
            }

            val entry = NotifEntry(
                packageName = sbn.packageName,
                appName = appName,
                title = title,
                text = text,
                time = sbn.postTime
            )
            recent.addFirst(entry)
            while (recent.size > MAX_RECENT) recent.pollLast()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to ingest notification: ${e.message}")
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) { /* no-op */ }
}
