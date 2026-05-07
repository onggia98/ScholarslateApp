package com.nmcnpm.scholarslate.scheduler;

import com.nmcnpm.scholarslate.repository.PaperRepository;
import com.nmcnpm.scholarslate.service.ai.PaperPipelineService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Retry Scheduler — chạy mỗi 30 phút (fixedDelay).
 * Xử lý lại các paper có processing_status = 'FAILED' chưa vượt quá 3 lần retry.
 *
 * fixedDelay (không phải fixedRate): chờ đủ 30 phút SAU KHI batch trước xong
 * → tránh overlap nếu batch chạy lâu hơn 30 phút.
 *
 * Giới hạn MAX_RETRIES = 3:
 * - retryCount >= 3 → paper không còn được retry tự động.
 * - Admin có thể reset thủ công qua API PATCH /admin/papers/{id}/reset.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RetryScheduler {

    /** Tối đa 3 lần retry tự động. Sau đó admin xử lý thủ công (UC17). */
    private static final int MAX_RETRIES = 3;

    private final PaperRepository paperRepository;
    private final PaperPipelineService paperPipelineService;

    /**
     * fixedDelay có thể override qua application.yml: scheduler.retry.fixed-delay-ms
     * Default: 1_800_000 ms = 30 phút.
     */
    @Scheduled(fixedDelayString = "${scheduler.retry.fixed-delay-ms:1800000}")
    public void retryFailed() {
        var failedPapers = paperRepository.findFailedPapersForRetry(MAX_RETRIES);

        if (failedPapers.isEmpty()) {
            log.debug("Retry Scheduler: no FAILED papers eligible for retry");
            return;
        }

        log.info("Retry Scheduler: retrying {} FAILED paper(s) (retryCount < {})",
                failedPapers.size(), MAX_RETRIES);

        int success = 0;
        int failure = 0;

        for (var paper : failedPapers) {
            try {
                paperPipelineService.retry(paper);
                success++;
            } catch (Exception e) {
                // REQUIRES_NEW đã bảo vệ — exception ở đây là bất ngờ
                log.error("Unexpected retry error for arxivId={} (retryCount={}): {}",
                        paper.getArxivId(), paper.getRetryCount(), e.getMessage());
                failure++;
            }
        }

        log.info("Retry Scheduler finished — success={} failure={}", success, failure);
    }
}
