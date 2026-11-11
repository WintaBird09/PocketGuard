package com.nkabeh.momosms

import android.Manifest
import android.content.Context
import android.content.BroadcastReceiver
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Telephony
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray

class PocketGuardMomoSmsModule : Module() {
  private var pendingBroadcastReceiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("PocketGuardMomoSms")
    Events("onSharedText", "onPendingSmsAvailable")

    AsyncFunction("getSharedText") {
      consumeSharedText()
    }

    AsyncFunction("queryInbox") { senderId: String, limit: Int ->
      queryInbox(senderId, limit)
    }

    AsyncFunction("getPendingSms") {
      getPendingSms()
    }

    AsyncFunction("clearPendingSms") { ids: List<String> ->
      clearPendingSms(ids)
    }

    AsyncFunction("setAutoImportEnabled") { enabled: Boolean ->
      preferences().edit().putBoolean(KEY_AUTO_IMPORT, enabled).apply()
    }

    AsyncFunction("getAutoImportEnabled") {
      preferences().getBoolean(KEY_AUTO_IMPORT, false)
    }

    AsyncFunction("setTransactionAlertsEnabled") { enabled: Boolean ->
      preferences().edit().putBoolean(KEY_TRANSACTION_ALERTS, enabled).apply()
    }

    OnCreate {
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          sendEvent("onPendingSmsAvailable", emptyMap())
        }
      }
      val filter = IntentFilter(MomoSmsReceiver.ACTION_PENDING_AVAILABLE)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context().registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("DEPRECATION") context().registerReceiver(receiver, filter)
      }
      pendingBroadcastReceiver = receiver
    }

    OnDestroy {
      pendingBroadcastReceiver?.let { context().unregisterReceiver(it) }
      pendingBroadcastReceiver = null
    }

    OnNewIntent { intent ->
      if (intent.action == Intent.ACTION_SEND && intent.type == "text/plain") {
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
        if (text.isNotEmpty()) sendEvent("onSharedText", mapOf("text" to text))
      }
    }

    OnActivityEntersForeground {
      sendEvent("onPendingSmsAvailable", emptyMap())
    }
  }

  private fun context(): Context = appContext.reactContext ?: throw IllegalStateException("No app context")

  private fun preferences() = context().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun consumeSharedText(): String? {
    val activity = appContext.activityProvider?.currentActivity ?: return null
    val intent = activity.intent
    if (intent.action != Intent.ACTION_SEND || intent.type != "text/plain") return null
    val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.takeIf { it.isNotEmpty() }
    intent.removeExtra(Intent.EXTRA_TEXT)
    intent.action = Intent.ACTION_MAIN
    return text
  }

  private fun queryInbox(senderId: String, limit: Int): List<Map<String, Any>> {
    if (ContextCompat.checkSelfPermission(context(), Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
      throw SecurityException("SMS inbox permission is required to scan messages.")
    }
    if (senderId.isBlank()) return emptyList()
    val result = mutableListOf<Map<String, Any>>()
    val projection = arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE)
    context().contentResolver.query(
      Telephony.Sms.Inbox.CONTENT_URI,
      projection,
      "LOWER(${Telephony.Sms.ADDRESS}) = LOWER(?)",
      arrayOf(senderId),
      "${Telephony.Sms.DATE} DESC",
    )?.use { cursor ->
      val idColumn = cursor.getColumnIndexOrThrow(Telephony.Sms._ID)
      val addressColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
      val bodyColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
      val dateColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
      while (cursor.moveToNext() && result.size < limit.coerceIn(1, 1000)) {
        val address = cursor.getString(addressColumn) ?: continue
        if (!address.equals(senderId, ignoreCase = true)) continue
        result.add(
          mapOf(
            "id" to cursor.getString(idColumn),
            "address" to address,
            "body" to cursor.getString(bodyColumn).orEmpty(),
            "date" to cursor.getLong(dateColumn),
          ),
        )
      }
    }
    return result
  }

  private fun getPendingSms(): List<Map<String, Any>> {
    val messages = PendingSmsQueue.read(context())
    return (0 until messages.length()).mapNotNull { index ->
      val message = messages.optJSONObject(index) ?: return@mapNotNull null
      mapOf(
        "id" to message.optString("id"),
        "address" to message.optString("address"),
        "body" to message.optString("body"),
        "date" to message.optLong("date"),
      )
    }
  }

  private fun clearPendingSms(ids: List<String>) {
    val remove = ids.toSet()
    val current = PendingSmsQueue.read(context())
    val kept = JSONArray()
    for (index in 0 until current.length()) {
      val item = current.optJSONObject(index) ?: continue
      if (item.optString("id") !in remove) kept.put(item)
    }
    PendingSmsQueue.write(context(), kept)
  }

  companion object {
    const val PREFS_NAME = "pocket_guard_momo_sms"
    const val KEY_AUTO_IMPORT = "auto_import_enabled"
    const val KEY_TRANSACTION_ALERTS = "transaction_alerts_enabled"
  }
}