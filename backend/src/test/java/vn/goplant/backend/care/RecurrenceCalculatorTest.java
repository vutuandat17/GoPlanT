package vn.goplant.backend.care;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

class RecurrenceCalculatorTest {
    private static final LocalDate START = LocalDate.of(2026, 11, 16); // Monday

    private static RecurrenceCalculator.Rule daily(int every, LocalDate end) {
        return new RecurrenceCalculator.Rule("DAILY_INTERVAL", every, null, START, end);
    }

    private static RecurrenceCalculator.Rule weekly(List<Integer> days, LocalDate end) {
        return new RecurrenceCalculator.Rule("WEEKLY", null, days, START, end);
    }

    @Test
    void everyDayFromStart() {
        var dates = RecurrenceCalculator.occurrences(daily(1, null), START, START.plusDays(4));
        assertEquals(5, dates.size());
        assertEquals(START, dates.getFirst());
    }

    @Test
    void intervalStaysAlignedWithStartDateWhenWindowBeginsLater() {
        // every 3 days from 16/11: 16, 19, 22, 25 ...
        var dates = RecurrenceCalculator.occurrences(daily(3, null), START.plusDays(4), START.plusDays(10));
        assertEquals(List.of(LocalDate.of(2026, 11, 22), LocalDate.of(2026, 11, 25)), dates);
    }

    @Test
    void windowBeforeStartIsClippedToStart() {
        var dates = RecurrenceCalculator.occurrences(daily(2, null), START.minusDays(10), START.plusDays(4));
        assertEquals(List.of(START, START.plusDays(2), START.plusDays(4)), dates);
    }

    @Test
    void endDateIsInclusiveAndClipsWindow() {
        var dates = RecurrenceCalculator.occurrences(daily(1, START.plusDays(2)), START, START.plusDays(30));
        assertEquals(3, dates.size());
        assertEquals(START.plusDays(2), dates.getLast());
    }

    @Test
    void weeklyUsesIsoDaysOfWeek() {
        // Monday, Wednesday, Sunday over two weeks
        var dates = RecurrenceCalculator.occurrences(weekly(List.of(1, 3, 7), null), START, START.plusDays(13));
        assertEquals(6, dates.size());
        assertTrue(dates.stream().allMatch(d -> d.getDayOfWeek() == DayOfWeek.MONDAY
                || d.getDayOfWeek() == DayOfWeek.WEDNESDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY));
    }

    @Test
    void emptyWhenWindowAfterEnd() {
        assertTrue(RecurrenceCalculator.occurrences(daily(1, START), START.plusDays(1), START.plusDays(5)).isEmpty());
    }

    @Test
    void rejectsInvalidRules() {
        assertThrows(IllegalArgumentException.class, () -> RecurrenceCalculator.occurrences(weekly(List.of(), null), START, START));
        assertThrows(IllegalArgumentException.class, () -> RecurrenceCalculator.occurrences(
                new RecurrenceCalculator.Rule("MONTHLY", null, null, START, null), START, START));
    }
}
