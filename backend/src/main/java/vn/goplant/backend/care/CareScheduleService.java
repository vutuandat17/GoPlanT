package vn.goplant.backend.care;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Collectors;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Care schedules and their materialised occurrences (care tasks).
 * <p>
 * Occurrences are generated ahead of time for a rolling horizon of {@value #HORIZON_DAYS} days ("phương án A").
 * Generation is idempotent thanks to {@code UNIQUE(care_schedule_id, due_date)}; it runs when a schedule is created
 * or updated, lazily when a user reads today's tasks or a calendar range, and periodically from
 * {@link CareTaskGenerationJob}. All "today" computations use the account time zone ({@code users.timezone}).
 * Completed and skipped tasks are immutable history.
 */
@Service
public class CareScheduleService {
    public static final int HORIZON_DAYS = 30;
    public static final int MAX_CALENDAR_DAYS = 62;
    public static final int MAX_GENERATE_AHEAD_DAYS = 120;
    public static final int OVERDUE_LOOKBACK_DAYS = 7;
    public static final Set<String> TASK_TYPES = Set.of(
            "watering", "fertilizing", "pruning", "weeding", "repotting",
            "cleaning", "environment_check", "pest_control", "misting", "other");

    private static final String SCHEDULE_COLUMNS = """
            s.id,s.user_plant_id,p.display_name AS plant_name,c.scientific_name AS plant_scientific_name,
            s.task_type,s.title,s.note,s.repeat_type,s.frequency_days,s.days_of_week,s.time_of_day,
            s.start_date,s.end_date,s.timezone,s.next_due_at,s.is_active,s.created_at
            FROM care_schedules s
            JOIN user_plants p ON p.id=s.user_plant_id
            JOIN plant_catalog c ON c.id=p.plant_catalog_id
            """;
    private static final String TASK_COLUMNS = """
            t.id,t.care_schedule_id,t.user_plant_id,p.display_name AS plant_name,t.task_type,s.title,
            t.due_date,t.due_at,t.status,t.completed_at,t.skipped_at,t.note
            FROM care_tasks t
            JOIN care_schedules s ON s.id=t.care_schedule_id
            JOIN user_plants p ON p.id=t.user_plant_id
            """;
    private static final String RECOMPUTE_NEXT_DUE = """
            UPDATE care_schedules s SET next_due_at=(
                SELECT min(t.due_at) FROM care_tasks t
                WHERE t.care_schedule_id=s.id AND t.status='pending'
                  AND t.due_date >= (now() AT TIME ZONE s.timezone)::date)
            """;

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public CareScheduleService(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    // ───────────────────────────── Schedules ─────────────────────────────

    @Transactional
    public Schedule create(UUID owner, UUID plantId, ScheduleRequest request) {
        requireActivePlant(owner, plantId);
        ZoneId zone = userZone(owner);
        Rule rule = normalize(request, LocalDate.now(clock.withZone(zone)));
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO care_schedules(id,owner_user_id,user_plant_id,task_type,title,note,repeat_type,frequency_days,
                    days_of_week,time_of_day,start_date,end_date,timezone)
                VALUES (?,?,?,?,?,?,?,?,?::integer[],?,?,?,?)
                """, id, owner, plantId, rule.taskType(), rule.title(), rule.note(), rule.repeatType(), rule.frequencyDays(),
                pgIntArray(rule.daysOfWeek()), rule.timeOfDay(), rule.startDate(), rule.endDate(), zone.getId());
        generate(id, null);
        return get(owner, id);
    }

    @Transactional
    public Schedule update(UUID owner, UUID scheduleId, ScheduleRequest request) {
        var zones = jdbc.queryForList("SELECT timezone FROM care_schedules WHERE id=? AND owner_user_id=? AND is_active FOR UPDATE",
                String.class, scheduleId, owner);
        if (zones.isEmpty()) throw notFound("Không tìm thấy lịch chăm sóc.");
        ZoneId zone = ZoneId.of(zones.getFirst());
        LocalDate today = LocalDate.now(clock.withZone(zone));
        Rule rule = normalize(request, today);
        jdbc.update("""
                UPDATE care_schedules SET task_type=?,title=?,note=?,repeat_type=?,frequency_days=?,days_of_week=?::integer[],
                    time_of_day=?,start_date=?,end_date=?,generated_until=NULL,updated_at=now()
                WHERE id=? AND owner_user_id=?
                """, rule.taskType(), rule.title(), rule.note(), rule.repeatType(), rule.frequencyDays(), pgIntArray(rule.daysOfWeek()),
                rule.timeOfDay(), rule.startDate(), rule.endDate(), scheduleId, owner);
        // Future pending occurrences follow the new rule; completed/skipped history and overdue items are kept.
        jdbc.update("DELETE FROM care_tasks WHERE care_schedule_id=? AND status='pending' AND due_date >= ?", scheduleId, today);
        jdbc.update("UPDATE care_tasks SET task_type=?,updated_at=now() WHERE care_schedule_id=? AND status='pending'", rule.taskType(), scheduleId);
        generate(scheduleId, null);
        return get(owner, scheduleId);
    }

    /** Stops a schedule: pending occurrences are removed, completed/skipped history is preserved. */
    @Transactional
    public void deactivate(UUID owner, UUID scheduleId) {
        int changed = jdbc.update("""
                UPDATE care_schedules SET is_active=false,deactivated_at=now(),next_due_at=NULL,updated_at=now()
                WHERE id=? AND owner_user_id=? AND is_active
                """, scheduleId, owner);
        if (changed == 0) throw notFound("Không tìm thấy lịch chăm sóc.");
        jdbc.update("DELETE FROM care_tasks WHERE care_schedule_id=? AND status='pending'", scheduleId);
    }

    /** Called when a plant is archived so that it no longer produces reminders. */
    @Transactional
    public void deactivateForPlant(UUID owner, UUID plantId) {
        jdbc.update("""
                UPDATE care_schedules SET is_active=false,deactivated_at=now(),next_due_at=NULL,updated_at=now()
                WHERE user_plant_id=? AND owner_user_id=? AND is_active
                """, plantId, owner);
        jdbc.update("DELETE FROM care_tasks WHERE user_plant_id=? AND owner_user_id=? AND status='pending'", plantId, owner);
    }

    @Transactional
    public List<Schedule> list(UUID owner, UUID plantId) {
        if (plantId != null) requireActivePlant(owner, plantId);
        recomputeStaleNextDue(owner);
        String sql = "SELECT " + SCHEDULE_COLUMNS + " WHERE s.owner_user_id=? AND s.is_active AND p.archived_at IS NULL"
                + (plantId == null ? "" : " AND s.user_plant_id=?")
                + " ORDER BY s.next_due_at NULLS LAST, s.created_at DESC";
        return plantId == null ? jdbc.query(sql, SCHEDULE_MAPPER, owner) : jdbc.query(sql, SCHEDULE_MAPPER, owner, plantId);
    }

    public Schedule get(UUID owner, UUID scheduleId) {
        var rows = jdbc.query("SELECT " + SCHEDULE_COLUMNS + " WHERE s.id=? AND s.owner_user_id=? AND s.is_active AND p.archived_at IS NULL",
                SCHEDULE_MAPPER, scheduleId, owner);
        if (rows.isEmpty()) throw notFound("Không tìm thấy lịch chăm sóc.");
        return rows.getFirst();
    }

    // ───────────────────────────── Tasks ─────────────────────────────

    @Transactional
    public TodayView today(UUID owner, LocalDate clientDate) {
        ZoneId zone = userZone(owner);
        LocalDate today = resolveDate(zone, clientDate);
        ensureGenerated(owner, today.plusDays(HORIZON_DAYS - 1));
        List<Task> tasks = jdbc.query("SELECT " + TASK_COLUMNS + """
                WHERE t.owner_user_id=? AND p.archived_at IS NULL
                  AND (t.due_date=? OR (t.status='pending' AND t.due_date BETWEEN ? AND ?))
                ORDER BY t.due_date, t.due_at, p.display_name
                """, taskMapper(today), owner, today, today.minusDays(OVERDUE_LOOKBACK_DAYS), today.minusDays(1));
        return new TodayView(today, zone.getId(), tasks, summarize(tasks));
    }

    @Transactional
    public CalendarView calendar(UUID owner, LocalDate from, LocalDate to, UUID plantId, UUID scheduleId) {
        if (to.isBefore(from)) throw badRequest("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.");
        if (ChronoUnit.DAYS.between(from, to) + 1 > MAX_CALENDAR_DAYS) {
            throw badRequest("Khoảng thời gian tối đa là " + MAX_CALENDAR_DAYS + " ngày.");
        }
        ZoneId zone = userZone(owner);
        LocalDate today = LocalDate.now(clock.withZone(zone));
        LocalDate generationCap = today.plusDays(MAX_GENERATE_AHEAD_DAYS);
        LocalDate through = maxDate(to, today.plusDays(HORIZON_DAYS - 1));
        ensureGenerated(owner, through.isAfter(generationCap) ? generationCap : through);

        StringBuilder sql = new StringBuilder("SELECT ").append(TASK_COLUMNS)
                .append(" WHERE t.owner_user_id=? AND p.archived_at IS NULL AND t.due_date BETWEEN ? AND ?");
        List<Object> params = new ArrayList<>(List.of(owner, from, to));
        if (plantId != null) { sql.append(" AND t.user_plant_id=?"); params.add(plantId); }
        if (scheduleId != null) { sql.append(" AND t.care_schedule_id=?"); params.add(scheduleId); }
        sql.append(" ORDER BY t.due_date, t.due_at, p.display_name");
        List<Task> tasks = jdbc.query(sql.toString(), taskMapper(today), params.toArray());
        return new CalendarView(from, to, zone.getId(), tasks, summarize(tasks));
    }

    @Transactional
    public Task complete(UUID owner, UUID taskId, TaskActionRequest request) {
        LockedTask task = lockPendingTask(owner, taskId);
        LocalDate today = resolveDate(task.zone(), request == null ? null : request.date());
        if (task.dueDate().isAfter(today)) throw badRequest("Chưa đến ngày thực hiện công việc này.");
        jdbc.update("UPDATE care_tasks SET status='completed',completed_at=now(),note=?,updated_at=now() WHERE id=?",
                blankToNull(request == null ? null : request.note()), taskId);
        jdbc.update(RECOMPUTE_NEXT_DUE + " WHERE s.id=?", task.scheduleId());
        return getTask(owner, taskId, today);
    }

    @Transactional
    public Task skip(UUID owner, UUID taskId, TaskActionRequest request) {
        LockedTask task = lockPendingTask(owner, taskId);
        LocalDate today = resolveDate(task.zone(), request == null ? null : request.date());
        jdbc.update("UPDATE care_tasks SET status='skipped',skipped_at=now(),note=?,updated_at=now() WHERE id=?",
                blankToNull(request == null ? null : request.note()), taskId);
        jdbc.update(RECOMPUTE_NEXT_DUE + " WHERE s.id=?", task.scheduleId());
        return getTask(owner, taskId, today);
    }

    // ───────────────────────────── Time zone ─────────────────────────────

    /** Moves active schedules and their pending occurrences to the account's new time zone. */
    @Transactional
    public void applyUserTimezone(UUID owner, String timezone) {
        jdbc.update("UPDATE care_schedules SET timezone=?,updated_at=now() WHERE owner_user_id=? AND is_active", timezone, owner);
        jdbc.update("""
                UPDATE care_tasks t SET due_at=(t.due_date + s.time_of_day) AT TIME ZONE s.timezone, updated_at=now()
                FROM care_schedules s
                WHERE s.id=t.care_schedule_id AND t.owner_user_id=? AND t.status='pending'
                """, owner);
        jdbc.update(RECOMPUTE_NEXT_DUE + " WHERE s.owner_user_id=? AND s.is_active", owner);
    }

    // ───────────────────────────── Generation ─────────────────────────────

    /** Generates occurrences for one schedule up to the rolling horizon. Used by the periodic job. */
    @Transactional
    public void generateSchedule(UUID scheduleId) {
        generate(scheduleId, null);
    }

    /** Active schedules whose generated horizon is shorter than {@value #HORIZON_DAYS} days. */
    public List<UUID> schedulesNeedingGeneration() {
        return jdbc.queryForList("""
                SELECT s.id FROM care_schedules s JOIN user_plants p ON p.id=s.user_plant_id
                WHERE s.is_active AND p.archived_at IS NULL
                  AND (s.end_date IS NULL OR s.generated_until IS NULL OR s.generated_until < s.end_date)
                  AND (s.generated_until IS NULL OR s.generated_until < (now() AT TIME ZONE s.timezone)::date + ?)
                """, UUID.class, HORIZON_DAYS - 1);
    }

    /** Refreshes next_due_at for schedules whose next occurrence day has passed. */
    @Transactional
    public int recomputeAllStaleNextDue() {
        return jdbc.update(RECOMPUTE_NEXT_DUE + " WHERE s.is_active AND s.next_due_at IS NOT NULL AND s.next_due_at < now()");
    }

    private void recomputeStaleNextDue(UUID owner) {
        jdbc.update(RECOMPUTE_NEXT_DUE + " WHERE s.owner_user_id=? AND s.is_active AND (s.next_due_at IS NULL OR s.next_due_at < now())", owner);
    }

    private void ensureGenerated(UUID owner, LocalDate through) {
        List<UUID> ids = jdbc.queryForList("""
                SELECT s.id FROM care_schedules s JOIN user_plants p ON p.id=s.user_plant_id
                WHERE s.owner_user_id=? AND s.is_active AND p.archived_at IS NULL
                  AND (s.end_date IS NULL OR s.generated_until IS NULL OR s.generated_until < s.end_date)
                  AND (s.generated_until IS NULL OR s.generated_until < ?)
                """, UUID.class, owner, through);
        for (UUID id : ids) generate(id, through);
        recomputeStaleNextDue(owner);
    }

    private void generate(UUID scheduleId, LocalDate requestedThrough) {
        var rows = jdbc.query("""
                SELECT s.owner_user_id,s.user_plant_id,s.task_type,s.repeat_type,s.frequency_days,s.days_of_week,s.time_of_day,
                       s.start_date,s.end_date,s.timezone,s.generated_until
                FROM care_schedules s JOIN user_plants p ON p.id=s.user_plant_id
                WHERE s.id=? AND s.is_active AND p.archived_at IS NULL
                FOR UPDATE OF s
                """, (rs, n) -> new GenerationRow(rs.getObject("owner_user_id", UUID.class), rs.getObject("user_plant_id", UUID.class),
                rs.getString("task_type"), rs.getString("repeat_type"), (Integer) rs.getObject("frequency_days"), intList(rs, "days_of_week"),
                rs.getObject("time_of_day", LocalTime.class), rs.getObject("start_date", LocalDate.class),
                rs.getObject("end_date", LocalDate.class), ZoneId.of(rs.getString("timezone")),
                rs.getObject("generated_until", LocalDate.class)), scheduleId);
        if (rows.isEmpty()) return;
        GenerationRow s = rows.getFirst();

        LocalDate today = LocalDate.now(clock.withZone(s.zone()));
        LocalDate horizon = today.plusDays(HORIZON_DAYS - 1);
        LocalDate target = requestedThrough != null && requestedThrough.isAfter(horizon) ? requestedThrough : horizon;
        LocalDate cap = today.plusDays(MAX_GENERATE_AHEAD_DAYS);
        if (target.isAfter(cap)) target = cap;
        if (s.endDate() != null && target.isAfter(s.endDate())) target = s.endDate();

        LocalDate from = maxDate(s.startDate(), today);
        if (s.generatedUntil() != null) from = maxDate(from, s.generatedUntil().plusDays(1));

        if (!from.isAfter(target)) {
            var rule = new RecurrenceCalculator.Rule(s.repeatType(), s.frequencyDays(), s.daysOfWeek(), s.startDate(), s.endDate());
            List<LocalDate> dates = RecurrenceCalculator.occurrences(rule, from, target);
            if (!dates.isEmpty()) {
                jdbc.batchUpdate("""
                        INSERT INTO care_tasks(care_schedule_id,owner_user_id,user_plant_id,task_type,due_date,due_at)
                        VALUES (?,?,?,?,?,?)
                        ON CONFLICT (care_schedule_id,due_date) DO NOTHING
                        """, dates.stream().map(date -> new Object[]{scheduleId, s.owner(), s.plantId(), s.taskType(), date,
                        Timestamp.from(ZonedDateTime.of(date, s.timeOfDay(), s.zone()).toInstant())}).toList());
            }
            jdbc.update("UPDATE care_schedules SET generated_until=GREATEST(COALESCE(generated_until, ?), ?) WHERE id=?", target, target, scheduleId);
        }
        jdbc.update(RECOMPUTE_NEXT_DUE + " WHERE s.id=?", scheduleId);
    }

    // ───────────────────────────── Helpers ─────────────────────────────

    private Rule normalize(ScheduleRequest request, LocalDate today) {
        String taskType = request.taskType().trim().toLowerCase(Locale.ROOT);
        if (!TASK_TYPES.contains(taskType)) throw badRequest("Loại công việc không hợp lệ: " + request.taskType());
        String repeatType = request.repeatType().trim().toUpperCase(Locale.ROOT);
        Integer frequencyDays = null;
        List<Integer> days = null;
        if (RecurrenceCalculator.DAILY_INTERVAL.equals(repeatType)) {
            if (request.frequencyDays() == null) throw badRequest("frequencyDays là bắt buộc khi repeatType = DAILY_INTERVAL.");
            frequencyDays = request.frequencyDays();
        } else if (RecurrenceCalculator.WEEKLY.equals(repeatType)) {
            if (request.daysOfWeek() == null || request.daysOfWeek().isEmpty()) {
                throw badRequest("daysOfWeek là bắt buộc khi repeatType = WEEKLY.");
            }
            Set<Integer> unique = new TreeSet<>();
            for (Integer day : request.daysOfWeek()) {
                if (day == null || day < 1 || day > 7) throw badRequest("daysOfWeek chỉ nhận giá trị từ 1 (Thứ Hai) đến 7 (Chủ Nhật).");
                unique.add(day);
            }
            days = List.copyOf(unique);
        } else {
            throw badRequest("repeatType phải là DAILY_INTERVAL hoặc WEEKLY.");
        }
        LocalDate startDate = request.startDate() == null ? today : request.startDate();
        if (request.endDate() != null && request.endDate().isBefore(startDate)) {
            throw badRequest("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.");
        }
        LocalTime time = request.timeOfDay() == null ? LocalTime.of(8, 0) : request.timeOfDay().withSecond(0).withNano(0);
        return new Rule(taskType, blankToNull(request.title()), blankToNull(request.note()), repeatType, frequencyDays, days,
                time, startDate, request.endDate());
    }

    private LocalDate resolveDate(ZoneId zone, LocalDate clientDate) {
        LocalDate serverToday = LocalDate.now(clock.withZone(zone));
        if (clientDate == null) return serverToday;
        if (Math.abs(ChronoUnit.DAYS.between(serverToday, clientDate)) > 1) {
            throw badRequest("Ngày của thiết bị lệch quá xa so với múi giờ tài khoản (" + zone.getId() + ").");
        }
        return clientDate;
    }

    private LockedTask lockPendingTask(UUID owner, UUID taskId) {
        var rows = jdbc.query("""
                SELECT t.care_schedule_id,t.due_date,t.status,s.timezone FROM care_tasks t
                JOIN care_schedules s ON s.id=t.care_schedule_id
                JOIN user_plants p ON p.id=t.user_plant_id
                WHERE t.id=? AND t.owner_user_id=? AND p.archived_at IS NULL
                FOR UPDATE OF t
                """, (rs, n) -> new LockedTask(rs.getObject("care_schedule_id", UUID.class), rs.getObject("due_date", LocalDate.class),
                rs.getString("status"), ZoneId.of(rs.getString("timezone"))), taskId, owner);
        if (rows.isEmpty()) throw notFound("Không tìm thấy công việc chăm sóc.");
        LockedTask task = rows.getFirst();
        if (!"pending".equals(task.status())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Công việc đã được đánh dấu "
                    + ("completed".equals(task.status()) ? "hoàn thành" : "bỏ qua") + " và không thể thay đổi.");
        }
        return task;
    }

    private Task getTask(UUID owner, UUID taskId, LocalDate today) {
        return jdbc.queryForObject("SELECT " + TASK_COLUMNS + " WHERE t.id=? AND t.owner_user_id=?", taskMapper(today), taskId, owner);
    }

    private void requireActivePlant(UUID owner, UUID plantId) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM user_plants WHERE id=? AND owner_user_id=? AND archived_at IS NULL",
                Integer.class, plantId, owner);
        if (count == null || count == 0) throw notFound("Không tìm thấy cây trong tài khoản.");
    }

    private ZoneId userZone(UUID owner) {
        var zones = jdbc.queryForList("SELECT timezone FROM users WHERE id=?", String.class, owner);
        if (zones.isEmpty()) throw notFound("Không tìm thấy tài khoản.");
        return ZoneId.of(zones.getFirst());
    }

    private static DaySummary summarize(List<Task> tasks) {
        int pending = 0, completed = 0, skipped = 0, overdue = 0;
        for (Task task : tasks) {
            switch (task.status()) {
                case "completed" -> completed++;
                case "skipped" -> skipped++;
                default -> { pending++; if (task.overdue()) overdue++; }
            }
        }
        return new DaySummary(tasks.size(), pending, completed, skipped, overdue);
    }

    private static RowMapper<Task> taskMapper(LocalDate today) {
        return (rs, n) -> {
            LocalDate due = rs.getObject("due_date", LocalDate.class);
            String status = rs.getString("status");
            return new Task(rs.getObject("id", UUID.class), rs.getObject("care_schedule_id", UUID.class),
                    rs.getObject("user_plant_id", UUID.class), rs.getString("plant_name"), rs.getString("task_type"),
                    rs.getString("title"), due, instant(rs, "due_at"), status, instant(rs, "completed_at"),
                    instant(rs, "skipped_at"), rs.getString("note"), "pending".equals(status) && due.isBefore(today));
        };
    }

    private static final RowMapper<Schedule> SCHEDULE_MAPPER = (rs, n) -> new Schedule(
            rs.getObject("id", UUID.class), rs.getObject("user_plant_id", UUID.class), rs.getString("plant_name"),
            rs.getString("plant_scientific_name"), rs.getString("task_type"), rs.getString("title"), rs.getString("note"),
            rs.getString("repeat_type"), (Integer) rs.getObject("frequency_days"), intList(rs, "days_of_week"),
            rs.getObject("time_of_day", LocalTime.class), rs.getObject("start_date", LocalDate.class),
            rs.getObject("end_date", LocalDate.class), rs.getString("timezone"), instant(rs, "next_due_at"),
            rs.getBoolean("is_active"), instant(rs, "created_at"));

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private static List<Integer> intList(ResultSet rs, String column) throws SQLException {
        Array array = rs.getArray(column);
        if (array == null) return null;
        Object[] values = (Object[]) array.getArray();
        return Arrays.stream(values).map(value -> ((Number) value).intValue()).toList();
    }

    private static String pgIntArray(List<Integer> values) {
        return values == null ? null : values.stream().map(String::valueOf).collect(Collectors.joining(",", "{", "}"));
    }

    private static LocalDate maxDate(LocalDate a, LocalDate b) { return a.isAfter(b) ? a : b; }
    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static ResponseStatusException notFound(String message) { return new ResponseStatusException(HttpStatus.NOT_FOUND, message); }
    private static ResponseStatusException badRequest(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }

    // ───────────────────────────── Types ─────────────────────────────

    public record ScheduleRequest(
            @NotBlank String taskType,
            @Size(max = 160) String title,
            @Size(max = 2000) String note,
            @NotNull @Pattern(regexp = "(?i)DAILY_INTERVAL|WEEKLY") String repeatType,
            @Min(1) @Max(365) Integer frequencyDays,
            @Size(min = 1, max = 7) List<@NotNull @Min(1) @Max(7) Integer> daysOfWeek,
            LocalTime timeOfDay,
            LocalDate startDate,
            LocalDate endDate) {}

    public record TaskActionRequest(@Size(max = 2000) String note, LocalDate date) {}

    public record Schedule(UUID id, UUID plantId, String plantName, String plantScientificName, String taskType, String title,
                           String note, String repeatType, Integer frequencyDays, List<Integer> daysOfWeek, LocalTime timeOfDay,
                           LocalDate startDate, LocalDate endDate, String timezone, Instant nextDueAt, boolean active, Instant createdAt) {}

    public record Task(UUID id, UUID scheduleId, UUID plantId, String plantName, String taskType, String title, LocalDate dueDate,
                       Instant dueAt, String status, Instant completedAt, Instant skippedAt, String note, boolean overdue) {}

    public record DaySummary(int total, int pending, int completed, int skipped, int overdue) {}
    public record TodayView(LocalDate date, String timezone, List<Task> tasks, DaySummary summary) {}
    public record CalendarView(LocalDate from, LocalDate to, String timezone, List<Task> tasks, DaySummary summary) {}

    private record Rule(String taskType, String title, String note, String repeatType, Integer frequencyDays, List<Integer> daysOfWeek,
                        LocalTime timeOfDay, LocalDate startDate, LocalDate endDate) {}
    private record GenerationRow(UUID owner, UUID plantId, String taskType, String repeatType, Integer frequencyDays,
                                 List<Integer> daysOfWeek, LocalTime timeOfDay, LocalDate startDate, LocalDate endDate,
                                 ZoneId zone, LocalDate generatedUntil) {}
    private record LockedTask(UUID scheduleId, LocalDate dueDate, String status, ZoneId zone) {}
}
