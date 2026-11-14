package vn.goplant.backend.care;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Keeps the rolling horizon of materialised care tasks filled for every active schedule. */
@Component
public class CareTaskGenerationJob {
    private static final Logger log = LoggerFactory.getLogger(CareTaskGenerationJob.class);
    private final CareScheduleService care;

    public CareTaskGenerationJob(CareScheduleService care) { this.care = care; }

    @Scheduled(initialDelayString = "${goplant.care.generation-initial-delay:PT1M}",
            fixedDelayString = "${goplant.care.generation-interval:PT1H}")
    public void run() {
        int generated = 0;
        for (UUID scheduleId : care.schedulesNeedingGeneration()) {
            try {
                care.generateSchedule(scheduleId);
                generated++;
            } catch (RuntimeException exception) {
                log.warn("Could not generate care tasks for schedule {}", scheduleId, exception);
            }
        }
        int refreshed = care.recomputeAllStaleNextDue();
        if (generated > 0 || refreshed > 0) {
            log.info("Care task generation: {} schedules extended, {} next-due values refreshed", generated, refreshed);
        }
    }
}
