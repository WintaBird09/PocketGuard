package com.nkabeh.momosms

import android.content.Context
import org.json.JSONArray
import java.io.File

internal object PendingSmsQueue {
  private const val FILE_NAME = "momo-pending-messages.json"
  private const val SEEN_FILE_NAME = "momo-notified-transaction-ids.json"

  fun read(context: Context): JSONArray {
    val file = File(context.noBackupFilesDir, FILE_NAME)
    if (!file.exists()) return JSONArray()
    return try {
      JSONArray(file.readText())
    } catch (_: Exception) {
      JSONArray()
    }
  }

  fun write(context: Context, messages: JSONArray) {
    File(context.noBackupFilesDir, FILE_NAME).writeText(messages.toString())
  }

  fun hasSeenTransaction(context: Context, transactionId: String): Boolean =
    readSeenTransactions(context).contains(transactionId)

  fun markTransactionSeen(context: Context, transactionId: String) {
    val ids = readSeenTransactions(context)
    ids.add(transactionId)
    File(context.noBackupFilesDir, SEEN_FILE_NAME).writeText(JSONArray(ids).toString())
  }

  private fun readSeenTransactions(context: Context): LinkedHashSet<String> {
    val file = File(context.noBackupFilesDir, SEEN_FILE_NAME)
    if (!file.exists()) return linkedSetOf()
    return try {
      val array = JSONArray(file.readText())
      LinkedHashSet((0 until array.length()).mapNotNull { index -> array.optString(index).takeIf(String::isNotBlank) })
    } catch (_: Exception) {
      linkedSetOf()
    }
  }
}