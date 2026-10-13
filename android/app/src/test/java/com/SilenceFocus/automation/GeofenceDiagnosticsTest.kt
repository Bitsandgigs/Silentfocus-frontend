package com.SilenceFocus.automation

import com.SilenceFocus.automation.GeofenceDiagnostics.Kind
import com.SilenceFocus.automation.GeofenceDiagnostics.Record
import com.SilenceFocus.comms.MemoryKeyValue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GeofenceDiagnosticsTest {

    private val now = 1_791_620_000_000L

    private fun event(i: Int) = Record(
        kind = Kind.EVENT, at = now + i, transition = "ENTER", zoneIds = listOf("9", "12"),
        fixTime = now + i - 95_000, fixAgeMs = 95_000, accuracyM = 41, provider = "fused",
        distanceM = 80, radiusM = 100, evalMs = 42, silentActive = true, dndApplied = true,
        blockedReason = null, permissions = "1111",
    )

    @Test fun `round trip keeps every field`() {
        val records = listOf(
            event(1),
            Record(kind = Kind.ERROR, at = now, errorCode = 1000, evalMs = 5, silentActive = false, dndApplied = true, permissions = "1101"),
            Record(kind = Kind.REGISTRATION, at = now, status = "BACKGROUND_LOCATION_MISSING", permissions = "1100"),
        )
        assertEquals(records, GeofenceDiagnostics.decode(GeofenceDiagnostics.encode(records)))
    }

    @Test fun `bounded - only the newest MAX_RECORDS are kept`() {
        var list = emptyList<Record>()
        repeat(GeofenceDiagnostics.MAX_RECORDS + 25) { list = GeofenceDiagnostics.append(list, event(it)) }
        assertEquals(GeofenceDiagnostics.MAX_RECORDS, list.size)
        assertEquals(now + 25, list.first().at)
        assertEquals(now + GeofenceDiagnostics.MAX_RECORDS + 24, list.last().at)
    }

    @Test fun `privacy - no coordinates are stored, distance is rounded to 10 m`() {
        val encoded = GeofenceDiagnostics.encode(listOf(event(1)))
        assertFalse(encoded.contains("12.93")) // no latitude/longitude can appear
        assertEquals(80, GeofenceDiagnostics.roundedDistance(83.4))
        assertEquals(90, GeofenceDiagnostics.roundedDistance(85.0))
        assertNull(GeofenceDiagnostics.roundedDistance(null))
        assertNull(GeofenceDiagnostics.roundedDistance(-1.0))
        assertNull(GeofenceDiagnostics.roundedDistance(Double.NaN))
    }

    @Test fun `fix age separates detection delay from delivery delay`() {
        assertEquals(95_000L, GeofenceDiagnostics.fixAgeMs(200_000_000_000L, 105_000_000_000L))
        assertNull(GeofenceDiagnostics.fixAgeMs(100L, 0L)) // no elapsed time on the fix
        assertNull(GeofenceDiagnostics.fixAgeMs(100L, 200L)) // clock mismatch
    }

    @Test fun `permission flags are fine, coarse, background, location-on`() {
        assertEquals("1111", GeofenceDiagnostics.permissionFlags(true, true, true, true))
        assertEquals("0110", GeofenceDiagnostics.permissionFlags(false, true, true, false))
    }

    @Test fun `store - records, reports last registration status, clears (logout)`() {
        val store = GeofenceDiagnosticsStore(MemoryKeyValue())
        store.record(Record(kind = Kind.REGISTRATION, at = now, status = "REGISTERED", permissions = "1111"))
        store.record(event(2))
        assertEquals("REGISTERED", store.lastRegistrationStatus())
        assertEquals(2, store.all().size)
        store.clear()
        assertTrue(store.all().isEmpty())
    }

    @Test fun `malformed stored records are skipped, not fatal`() {
        assertTrue(GeofenceDiagnostics.decode("garbage").isEmpty())
        assertTrue(GeofenceDiagnostics.decode(null).isEmpty())
    }
}
