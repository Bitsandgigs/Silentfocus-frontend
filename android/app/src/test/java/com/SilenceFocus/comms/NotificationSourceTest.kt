package com.SilenceFocus.comms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Test

class NotificationSourceTest {

    private val key = "0|com.whatsapp|1|919876543210@s.whatsapp.net|10123"

    @Test fun `ref is stable per salt and hides the key`() {
        val ref = NotificationSource.ref("salt", key)
        assertEquals(ref, NotificationSource.ref("salt", key))
        assertEquals(24, ref.length)
        assertFalse(ref.contains("9876543210"))
    }

    @Test fun `ref differs per salt and per notification`() {
        assertNotEquals(NotificationSource.ref("a", key), NotificationSource.ref("b", key))
        assertNotEquals(NotificationSource.ref("a", key), NotificationSource.ref("a", "$key-2"))
    }
}
