package vn.goplant.backend.care;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Pure date arithmetic for care schedule recurrence rules. Dates are local dates in the schedule's time zone.
 * <ul>
 *   <li>{@code DAILY_INTERVAL}: every {@code frequencyDays} days counted from {@code startDate}.</li>
 *   <li>{@code WEEKLY}: on the given ISO-8601 days of week (1 = Monday ... 7 = Sunday), from {@code startDate}.</li>
 * </ul>
 */
public final class RecurrenceCalculator {
    public static final String DAILY_INTERVAL = "DAILY_INTERVAL";
    public static final String WEEKLY = "WEEKLY";

    private RecurrenceCalculator() {}

    public record Rule(String repeatType, Integer frequencyDays, Collection<Integer> daysOfWeek, LocalDate startDate, LocalDate endDate) {}

    /** Occurrence dates within [from, to] (inclusive), clipped to the rule's start and end dates. */
    public static List<LocalDate> occurrences(Rule rule, LocalDate from, LocalDate to) {
        LocalDate first = from.isBefore(rule.startDate()) ? rule.startDate() : from;
        LocalDate last = rule.endDate() != null && rule.endDate().isBefore(to) ? rule.endDate() : to;
        List<LocalDate> result = new ArrayList<>();
        if (first.isAfter(last)) return result;

        if (DAILY_INTERVAL.equals(rule.repeatType())) {
            int step = rule.frequencyDays();
            if (step < 1) throw new IllegalArgumentException("frequencyDays must be >= 1");
            long offset = ChronoUnit.DAYS.between(rule.startDate(), first) % step;
            LocalDate date = offset == 0 ? first : first.plusDays(step - offset);
            for (; !date.isAfter(last); date = date.plusDays(step)) result.add(date);
        } else if (WEEKLY.equals(rule.repeatType())) {
            Set<Integer> days = new TreeSet<>(rule.daysOfWeek());
            if (days.isEmpty()) throw new IllegalArgumentException("daysOfWeek must not be empty");
            for (LocalDate date = first; !date.isAfter(last); date = date.plusDays(1)) {
                if (days.contains(date.getDayOfWeek().getValue())) result.add(date);
            }
        } else {
            throw new IllegalArgumentException("Unsupported repeat type: " + rule.repeatType());
        }
        return result;
    }
}
