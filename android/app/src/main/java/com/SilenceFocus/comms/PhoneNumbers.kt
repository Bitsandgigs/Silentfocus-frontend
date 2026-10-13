package com.SilenceFocus.comms

import java.security.MessageDigest

/**
 * Phone-number helpers for call exceptions. Pure Kotlin (no Android
 * PhoneNumberUtils) so the matching rules are covered by JVM tests.
 *
 * Matching is deliberately simple and conservative:
 *  - formatting (spaces, dashes, brackets, dots) is ignored;
 *  - "00" international prefix is treated like "+";
 *  - numbers with at least [MIN_SUFFIX_MATCH] digits match when their last
 *    [SUFFIX_DIGITS] digits (or all digits of the shorter one) agree, so
 *    "+91 98765 43210", "098765 43210" and "9876543210" are the same caller;
 *  - shorter numbers (service codes) only match exactly.
 */
object PhoneNumbers {

    const val SUFFIX_DIGITS = 10
    const val MIN_SUFFIX_MATCH = 7

    /**
     * Digits with an optional leading "+", or null when the value can't be a
     * caller identity (empty, private/withheld, letters, too short).
     */
    fun normalize(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        var s = raw.trim().trimStart('\u202A', '\u202B', '\u200E', '\u200F', '\u2066', '\u2067', '\u2068', '\uFEFF')
        if (s.startsWith("tel:", ignoreCase = true)) s = s.substring(4)
        s = s.substringBefore(';') // "tel:" parameters such as ;phone-context
        val plus = s.startsWith("+")
        val sb = StringBuilder()
        for (c in s) {
            when {
                c.isDigit() -> sb.append(c)
                c == '+' || c == ' ' || c == '-' || c == '(' || c == ')' || c == '.' || c == '/' -> Unit
                // Direction marks / zero-width and non-breaking spaces that
                // Android and WhatsApp wrap around displayed numbers.
                c in '\u200B'..'\u200F' || c in '\u202A'..'\u202E' || c in '\u2066'..'\u2069' ||
                    c == '\uFEFF' || c == '\u00A0' || c == '\u2007' || c == '\u202F' -> Unit
                else -> return null // letters, '*', '#': not a dialable caller id
            }
        }
        var digits = sb.toString()
        var international = plus
        if (!international && digits.startsWith("00") && digits.length > 4) {
            digits = digits.substring(2)
            international = true
        }
        if (digits.length < 3) return null
        if (digits.all { it == '0' }) return null
        return if (international) "+$digits" else digits
    }

    private fun digitsOf(normalized: String) = normalized.removePrefix("+")

    /** Stable comparison key: the last [SUFFIX_DIGITS] digits (or all, if shorter). */
    fun matchKey(raw: String?): String? {
        val n = normalize(raw) ?: return null
        val d = digitsOf(n)
        return if (d.length >= MIN_SUFFIX_MATCH) d.takeLast(SUFFIX_DIGITS).trimStart('0').ifEmpty { d } else n
    }

    fun sameNumber(a: String?, b: String?): Boolean {
        val na = normalize(a) ?: return false
        val nb = normalize(b) ?: return false
        if (na == nb) return true
        val da = digitsOf(na).trimStart('0')
        val db = digitsOf(nb).trimStart('0')
        if (da.length < MIN_SUFFIX_MATCH || db.length < MIN_SUFFIX_MATCH) return false
        val n = minOf(SUFFIX_DIGITS, da.length, db.length)
        return da.takeLast(n) == db.takeLast(n)
    }

    /**
     * Log/UI-safe form: "+91******1234". Keeps a "+" country prefix of at
     * most 2 digits and the last 4 digits; everything else is masked.
     */
    fun redact(raw: String?): String {
        val n = normalize(raw) ?: return "Unknown"
        val d = digitsOf(n)
        if (d.length <= 4) return "*".repeat(d.length)
        val last = d.takeLast(4)
        val prefix = if (n.startsWith("+")) "+" + d.take(minOf(2, d.length - 4)) else ""
        val masked = d.length - last.length - (prefix.length - if (prefix.isEmpty()) 0 else 1)
        return prefix + "*".repeat(maxOf(masked, 2)) + last
    }

    /**
     * One-way key for recent-call counting, so the repeat-caller history
     * never stores phone numbers. [salt] is per-install.
     */
    fun hashedKey(raw: String?, salt: String): String? {
        val key = matchKey(raw) ?: return null
        val md = MessageDigest.getInstance("SHA-256")
        md.update(salt.toByteArray())
        md.update(key.toByteArray())
        return md.digest().take(12).joinToString("") { "%02x".format(it) }
    }
}
