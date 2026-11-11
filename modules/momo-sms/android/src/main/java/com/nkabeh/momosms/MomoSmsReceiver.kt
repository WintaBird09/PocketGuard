package com.nkabeh.momosms

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Telephony
import android.telephony.SmsMessage
import androidx.core.content.ContextCompat
import org.json.JSONObject

class MomoSmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val prefs = context.getSharedPreferences(PocketGuardMomoSmsModule.PREFS_NAME, Context.MODE_PRIVATE)
    val autoImport = prefs.getBoolean(PocketGuardMomoSmsModule.KEY_AUTO_IMPORT, false)
    val alertsEnabled = prefs.getBoolean(PocketGuardMomoSmsModule.KEY_TRANSACTION_ALERTS, false)
    if (!autoImport && !alertsEnabled) return

    val senderId = configuredSenderId(context)
    val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent)
    val pending = PendingSmsQueue.read(context)
    val messagesToNotify = mutableListOf<ParsedMomoMessage>()
    val idsToMarkSeen = mutableListOf<String>()
    parts.groupBy { it.originatingAddress.orEmpty() }.forEach { (address, segments) ->
      if (!address.equals(senderId, ignoreCase = true)) return@forEach
      val ordered = segments.sortedBy { it.timestampMillis }
      val body = ordered.joinToString(separator = "") { it.messageBody.orEmpty() }.trim()
      if (!looksLikeTransaction(body)) return@forEach
      val timestamp = ordered.firstOrNull()?.timestampMillis ?: System.currentTimeMillis()
      val transactionId = FINANCIAL_ID_REGEX.find(body)?.groupValues?.getOrNull(1)
      val queueId = transactionId ?: "sms-$timestamp-${body.hashCode().toUInt().toString(16)}"
      if (PendingSmsQueue.hasSeenTransaction(context, queueId)) return@forEach

      val alreadyQueued = (0 until pending.length()).any { index ->
        pending.optJSONObject(index)?.optString("id") == queueId
      }
      if (!alreadyQueued) {
        pending.put(
          JSONObject()
            .put("id", queueId)
            .put("transactionId", transactionId ?: JSONObject.NULL)
            .put("address", address)
            .put("body", body)
            .put("date", timestamp),
        )
        val parsed = parseTransaction(body)
        messagesToNotify.add(
          parsed ?: ParsedMomoMessage(
            action = if (body.startsWith("You have received", ignoreCase = true)) "received" else "paid",
            amount = 0,
            counterparty = "Mobile Money transaction",
            transactionId = transactionId ?: queueId,
          ),
        )
      }
      idsToMarkSeen.add(queueId)
    }
    if (messagesToNotify.isEmpty() && pending.length() == 0) return

    PendingSmsQueue.write(context, pending)
    idsToMarkSeen.forEach { PendingSmsQueue.markTransactionSeen(context, it) }
    context.sendBroadcast(
      Intent(ACTION_PENDING_AVAILABLE).setPackage(context.packageName),
    )
    if (alertsEnabled) messagesToNotify.forEach { showNotification(context, it) }
  }

  private fun looksLikeTransaction(body: String): Boolean =
    OPENING_REGEX.containsMatchIn(body) && FINANCIAL_ID_REGEX.containsMatchIn(body)

  private fun parseTransaction(body: String): ParsedMomoMessage? {
    val opening = OPENING_REGEX.find(body)?.value ?: return null
    val action = if (opening.equals("You have received", ignoreCase = true)) "received" else "paid"
    val amount = AMOUNT_REGEX.find(body)?.groupValues?.getOrNull(1)
      ?.replace(",", "")
      ?.replace(" ", "")
      ?.toLongOrNull() ?: return null
    val counterparty = COUNTERPARTY_REGEX.find(body)?.groupValues?.getOrNull(1)?.trim()
      ?.takeIf { it.isNotBlank() } ?: return null
    val transactionId = FINANCIAL_ID_REGEX.find(body)?.groupValues?.getOrNull(1) ?: return null
    return ParsedMomoMessage(action, amount, counterparty, transactionId)
  }

  private fun configuredSenderId(context: Context): String = try {
    context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
      .metaData?.getString("com.nkabeh.pocketguard.MOMO_SENDER_ID") ?: DEFAULT_SENDER_ID
  } catch (_: Exception) {
    DEFAULT_SENDER_ID
  }

  private fun showNotification(context: Context, message: ParsedMomoMessage) {
    if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Mobile Money transactions", NotificationManager.IMPORTANCE_HIGH),
      )
    }
    val uri = Uri.parse("pocketguard://momo-review")
      .buildUpon()
      .appendQueryParameter("transactionId", message.transactionId)
      .build()
    val launch = Intent(Intent.ACTION_VIEW, uri)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val pendingIntent = PendingIntent.getActivity(
      context,
      message.transactionId.hashCode() and 0x7fffffff,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION") Notification.Builder(context)
    }
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(if (message.action == "received") "Mobile Money received" else "Mobile Money payment")
      .setContentText(
        if (message.amount > 0) {
          "${message.amount.toString().reversed().chunked(3).joinToString(",").reversed()} XAF ${if (message.action == "received") "from" else "to"} ${message.counterparty}. Tap to record it."
        } else {
          "A Mobile Money transaction needs review. Tap to record it."
        },
      )
      .setContentIntent(pendingIntent)
      .setAutoCancel(true)
      .build()
    manager.notify(message.transactionId.hashCode() and 0x7fffffff, notification)
  }

  companion object {
    private const val DEFAULT_SENDER_ID = "MobileMoney"
    private const val CHANNEL_ID = "momo-alerts"
    const val ACTION_PENDING_AVAILABLE = "com.nkabeh.momosms.PENDING_AVAILABLE"
    private val OPENING_REGEX = Regex("You have received|Your payment of|You have transferred", RegexOption.IGNORE_CASE)
    private val AMOUNT_REGEX = Regex("(?:You have received|Your payment of|You have transferred)\\s+([\\d, ]+)\\s*(?:XAF|FCFA)", RegexOption.IGNORE_CASE)
    private val COUNTERPARTY_REGEX = Regex("(?:from|to)\\s+(.+?)\\s*\\(\\d{6,}\\)", RegexOption.IGNORE_CASE)
    private val FINANCIAL_ID_REGEX = Regex("Financial Transaction Id\\s*:\\s*([^\\s.]+)", RegexOption.IGNORE_CASE)
  }
}

private data class ParsedMomoMessage(
  val action: String,
  val amount: Long,
  val counterparty: String,
  val transactionId: String,
)