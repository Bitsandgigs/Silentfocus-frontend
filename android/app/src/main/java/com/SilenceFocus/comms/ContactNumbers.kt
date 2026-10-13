package com.SilenceFocus.comms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract

/**
 * Numbers of the phone contact a notification's person URI points to
 * (content://com.android.contacts/...). Used only to match a WhatsApp caller
 * to an emergency contact, only when Contacts permission is ALREADY granted
 * (it is requested for Emergency Contacts, never for this). Results stay in
 * memory; nothing is stored or logged.
 */
object ContactNumbers {

    fun resolve(context: Context, personUri: String?, max: Int = 10): List<String> {
        if (personUri.isNullOrBlank()) return emptyList()
        if (context.checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) return emptyList()
        return runCatching {
            val resolver = context.contentResolver
            val uri = Uri.parse(personUri)
            if (uri.authority != ContactsContract.AUTHORITY) return emptyList()
            val contactUri = if (uri.pathSegments.contains("lookup")) ContactsContract.Contacts.lookupContact(resolver, uri) else uri
            val id = contactUri?.lastPathSegment?.toLongOrNull() ?: return emptyList()
            val out = ArrayList<String>()
            resolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
                "${ContactsContract.CommonDataKinds.Phone.CONTACT_ID} = ?",
                arrayOf(id.toString()),
                null,
            )?.use { c ->
                while (c.moveToNext() && out.size < max) {
                    PhoneNumbers.normalize(c.getString(0))?.let(out::add)
                }
            }
            out.distinct()
        }.getOrDefault(emptyList())
    }
}
