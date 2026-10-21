package com.SilenceFocus.automation

import android.Manifest
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract
import android.util.Log

/**
 * Reads upcoming occurrences from the device calendar into the engine's
 * cache. Runs natively (boot, calendar-change job, periodic job, app
 * resume), so calendar automation doesn't depend on any screen being open.
 *
 * Idempotent: every sync replaces the cache with the current occurrences in
 * [LOOKBACK_MS, LOOKAHEAD_MS], keyed calendarId:eventId:begin, so edited or
 * deleted events simply change or disappear and nothing is duplicated.
 * The provider occurrence title, ids, times and all-day flag are read. The
 * title stays in the device-local occurrence cache only; notes, locations and
 * attendees are never read.
 *
 * Round 3 (#4): every calendar Android's Calendar Provider holds on this
 * phone is available - Google, Samsung, Exchange/Outlook, local and any
 * other account whose app syncs into the provider - not just Google. The
 * user may pick which ones silence the phone ([EngineStore.calendarSelection];
 * null = all calendars shown in the phone's calendar app, the previous
 * behaviour). Calendars that an app keeps only to itself (e.g. Outlook
 * without its "sync calendars" option) can't be read by any other app.
 */
object CalendarSync {

    private const val TAG = "SilentFocusCalendar"
    private const val LOOKBACK_MS = 24L * 60 * 60 * 1000
    private const val LOOKAHEAD_MS = 14L * 24 * 60 * 60 * 1000
    private const val JOB_CONTENT = 4201
    private const val JOB_PERIODIC = 4202
    private const val PERIODIC_MS = 12L * 60 * 60 * 1000

    const val STATUS_DISABLED = "DISABLED"
    const val STATUS_NO_PERMISSION = "CALENDAR_PERMISSION_MISSING"
    const val STATUS_SYNCED = "SYNCED"
    const val STATUS_FAILED = "FAILED"

    fun hasPermission(ctx: Context) =
        ctx.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED

    /** Refreshes the cache; the caller evaluates the engine afterwards. */
    fun sync(context: Context, now: Long = System.currentTimeMillis()) {
        val ctx = context.applicationContext
        val store = EngineStore(ctx)
        if (!store.settings.calendarEnabled) {
            store.calendarEvents = emptyList()
            store.calendarStatus = STATUS_DISABLED
            cancelJobs(ctx)
            return
        }
        if (!hasPermission(ctx)) {
            store.calendarEvents = emptyList()
            store.calendarStatus = STATUS_NO_PERMISSION
            cancelJobs(ctx)
            return
        }
        try {
            store.calendarEvents = query(ctx, now - LOOKBACK_MS, now + LOOKAHEAD_MS, store.calendarSelection)
            store.calendarStatus = STATUS_SYNCED
            store.calendarLastSync = now
            Log.i(TAG, "synced ${store.calendarEvents.size} occurrence(s)")
        } catch (e: RuntimeException) {
            // Keep the previous cache: stale-but-known beats nothing.
            store.calendarStatus = STATUS_FAILED
            Log.w(TAG, "calendar query failed: ${e.javaClass.simpleName}")
        }
        scheduleJobs(ctx)
    }

    /** One calendar of the Calendar Provider (no events, titles or attendees). */
    data class DeviceCalendar(
        val id: Long,
        val name: String,
        val accountName: String?,
        val accountType: String?,
        val color: Int?,
        val visible: Boolean,
        val synced: Boolean,
        val primary: Boolean,
    )

    /** Where a calendar comes from, for grouping in the picker. */
    fun providerLabel(accountType: String?): String = when {
        accountType == null -> "Other"
        accountType == "com.google" -> "Google"
        accountType == CalendarContract.ACCOUNT_TYPE_LOCAL -> "On this phone"
        accountType.startsWith("com.samsung") || accountType == "com.osp.app.signin" -> "Samsung"
        accountType.contains("exchange", ignoreCase = true) ||
            accountType.startsWith("com.microsoft") ||
            accountType.contains("outlook", ignoreCase = true) -> "Outlook / Exchange"
        else -> "Other"
    }

    /**
     * The selection the engine uses: null = every visible calendar; otherwise
     * only the chosen ids that still exist (a deleted calendar drops out).
     */
    fun effectiveSelection(selection: Set<Long>?, available: Collection<Long>): Set<Long>? =
        selection?.filter { it in available }?.toSet()

    /** SQL selection for the instances query (ids are numbers, never user text). */
    fun instanceSelection(selection: Set<Long>?): String =
        if (selection == null) {
            "${CalendarContract.Instances.VISIBLE} = 1"
        } else if (selection.isEmpty()) {
            "0"
        } else {
            "${CalendarContract.Instances.CALENDAR_ID} IN (${selection.sorted().joinToString(",")})"
        }

    /** All calendars on the phone, for the picker. Throws if the provider fails. */
    fun listCalendars(ctx: Context): List<DeviceCalendar> {
        val projection = arrayOf(
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.ACCOUNT_NAME,
            CalendarContract.Calendars.ACCOUNT_TYPE,
            CalendarContract.Calendars.CALENDAR_COLOR,
            CalendarContract.Calendars.VISIBLE,
            CalendarContract.Calendars.SYNC_EVENTS,
            CalendarContract.Calendars.IS_PRIMARY,
        )
        val out = ArrayList<DeviceCalendar>()
        ctx.contentResolver.query(CalendarContract.Calendars.CONTENT_URI, projection, null, null, null)?.use { c ->
            while (c.moveToNext()) {
                val name = c.getString(1)?.takeIf { it.isNotBlank() } ?: c.getString(2) ?: "Calendar"
                out += DeviceCalendar(
                    id = c.getLong(0),
                    name = name,
                    accountName = c.getString(2),
                    accountType = c.getString(3),
                    color = if (c.isNull(4)) null else c.getInt(4),
                    visible = !c.isNull(5) && c.getInt(5) == 1,
                    // Missing column value = the provider syncs it (local calendars).
                    synced = c.isNull(6) || c.getInt(6) == 1,
                    primary = !c.isNull(7) && c.getInt(7) == 1,
                )
            }
        }
        return sortForPicker(out)
    }

    /** Grouped by provider, then account, primary first, then name. */
    fun sortForPicker(list: List<DeviceCalendar>): List<DeviceCalendar> = list.sortedWith(
        compareBy<DeviceCalendar>({ providerLabel(it.accountType) }, { it.accountName.orEmpty().lowercase() })
            .thenByDescending { it.primary }
            .thenBy { it.name.lowercase() },
    )

    private fun query(ctx: Context, from: Long, to: Long, chosen: Set<Long>?): List<CalendarEvent> {
        // A chosen calendar that was deleted simply matches nothing.
        val selection = instanceSelection(chosen)
        val uri = CalendarContract.Instances.CONTENT_URI.buildUpon().also {
            ContentUris.appendId(it, from)
            ContentUris.appendId(it, to)
        }.build()
        val projection = arrayOf(
            CalendarContract.Instances.CALENDAR_ID,
            CalendarContract.Instances.EVENT_ID,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.STATUS,
            CalendarContract.Instances.SELF_ATTENDEE_STATUS,
            CalendarContract.Instances.TITLE,
        )
        // Default: visible calendars only. A calendar the user chose counts
        // even if hidden in their calendar app. Cancelled events and ones
        // the user declined never silence the phone.
        val events = LinkedHashMap<String, CalendarEvent>()
        ctx.contentResolver.query(uri, projection, selection, null, "${CalendarContract.Instances.BEGIN} ASC")?.use { c ->
            while (c.moveToNext()) {
                val status = if (c.isNull(5)) -1 else c.getInt(5)
                val attendee = if (c.isNull(6)) -1 else c.getInt(6)
                if (status == CalendarContract.Events.STATUS_CANCELED) continue
                if (attendee == CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED) continue
                val begin = c.getLong(2)
                val end = c.getLong(3)
                if (end <= begin) continue
                val key = "${c.getLong(0)}:${c.getLong(1)}:$begin"
                events[key] = CalendarEvent(
                    key = key,
                    begin = begin,
                    end = end,
                    allDay = c.getInt(4) == 1,
                    title = CalendarTitles.normalize(c.getString(7)),
                )
            }
        }
        return events.values.toList()
    }

    /**
     * A content-change job (fires shortly after any calendar change, incl.
     * account sync) plus a 12 h periodic job to extend the look-ahead.
     * JobScheduler only - no foreground service or polling.
     */
    fun scheduleJobs(ctx: Context) {
        val js = ctx.getSystemService(JobScheduler::class.java) ?: return
        val service = ComponentName(ctx, CalendarRefreshJobService::class.java)
        runCatching {
            js.schedule(
                JobInfo.Builder(JOB_CONTENT, service)
                    .addTriggerContentUri(
                        JobInfo.TriggerContentUri(
                            CalendarContract.CONTENT_URI,
                            JobInfo.TriggerContentUri.FLAG_NOTIFY_FOR_DESCENDANTS,
                        ),
                    )
                    .setTriggerContentUpdateDelay(5_000)
                    .setTriggerContentMaxDelay(60_000)
                    .build(),
            )
        }
        if (js.getPendingJob(JOB_PERIODIC) == null) {
            runCatching {
                js.schedule(
                    JobInfo.Builder(JOB_PERIODIC, service)
                        .setPeriodic(PERIODIC_MS)
                        .setPersisted(true)
                        .build(),
                )
            }
        }
    }

    fun cancelJobs(ctx: Context) {
        val js = ctx.getSystemService(JobScheduler::class.java) ?: return
        js.cancel(JOB_CONTENT)
        js.cancel(JOB_PERIODIC)
    }
}
