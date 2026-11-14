package vn.goplant.backend.care;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.goplant.backend.care.CareScheduleService.CalendarView;
import vn.goplant.backend.care.CareScheduleService.Schedule;
import vn.goplant.backend.care.CareScheduleService.ScheduleRequest;
import vn.goplant.backend.care.CareScheduleService.Task;
import vn.goplant.backend.care.CareScheduleService.TaskActionRequest;
import vn.goplant.backend.care.CareScheduleService.TodayView;

/** Care schedules (recurring rules) and care tasks (concrete occurrences). All data is scoped to the JWT subject. */
@RestController
@RequestMapping("/api/v1")
public class CareScheduleController {
    private final CareScheduleService care;

    public CareScheduleController(CareScheduleService care) { this.care = care; }

    @PostMapping("/plants/{plantId}/schedules")
    @ResponseStatus(HttpStatus.CREATED)
    public Schedule create(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID plantId, @Valid @RequestBody ScheduleRequest request) {
        return care.create(owner(jwt), plantId, request);
    }

    @GetMapping("/plants/{plantId}/schedules")
    public List<Schedule> listForPlant(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID plantId) {
        return care.list(owner(jwt), plantId);
    }

    @GetMapping("/schedules")
    public List<Schedule> list(@AuthenticationPrincipal Jwt jwt) {
        return care.list(owner(jwt), null);
    }

    @GetMapping("/schedules/today")
    public TodayView today(@AuthenticationPrincipal Jwt jwt,
                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return care.today(owner(jwt), date);
    }

    @GetMapping("/schedules/calendar")
    public CalendarView calendar(@AuthenticationPrincipal Jwt jwt,
                                 @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                 @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                 @RequestParam(required = false) UUID plantId,
                                 @RequestParam(required = false) UUID scheduleId) {
        return care.calendar(owner(jwt), from, to, plantId, scheduleId);
    }

    @GetMapping("/schedules/{scheduleId}")
    public Schedule get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID scheduleId) {
        return care.get(owner(jwt), scheduleId);
    }

    @PutMapping("/schedules/{scheduleId}")
    public Schedule update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID scheduleId, @Valid @RequestBody ScheduleRequest request) {
        return care.update(owner(jwt), scheduleId, request);
    }

    @DeleteMapping("/schedules/{scheduleId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID scheduleId) {
        care.deactivate(owner(jwt), scheduleId);
    }

    @PostMapping("/tasks/{taskId}/complete")
    public Task complete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID taskId,
                         @Valid @RequestBody(required = false) TaskActionRequest request) {
        return care.complete(owner(jwt), taskId, request);
    }

    @PostMapping("/tasks/{taskId}/skip")
    public Task skip(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID taskId,
                     @Valid @RequestBody(required = false) TaskActionRequest request) {
        return care.skip(owner(jwt), taskId, request);
    }

    private static UUID owner(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
}
