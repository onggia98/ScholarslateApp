package com.nmcnpm.scholarslate.scheduler;

import com.nmcnpm.scholarslate.repository.TopicRepository;
import com.nmcnpm.scholarslate.service.ai.ArxivFetchService;
import com.nmcnpm.scholarslate.service.ai.PaperPipelineService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Main Pipeline Scheduler — chạy hàng ngày lúc 06:00 (server time).
 * Cron: "0 0 6 * * *"
 *
 * Logic:
 * 1. Lấy toàn bộ Active Topics trên hệ thống.
 * 2. Dedup keywords để không fetch cùng keyword 2 lần.
 * 3. Với mỗi keyword: fetch 5–10 paper mới nhất từ arXiv.
 * 4. Với mỗi paper: gọi PaperPipelineService.process() (REQUIRES_NEW).
 *
 * Lỗi của 1 paper không dừng cả batch — exception được bắt và log.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MainScheduler {

    private final TopicRepository topicRepository;
    private final ArxivFetchService arxivFetchService;
    private final PaperPipelineService paperPipelineService;

    /**
     * Cron có thể override qua application.yml: scheduler.main.cron
     * Default: 06:00 hàng ngày.
     */
    @Scheduled(cron = "${scheduler.main.cron:0 0 6 * * *}")
    public void runDailyFetch() {
        log.info("=== Main Scheduler STARTED ===");
        long startMs = System.currentTimeMillis();

        var activeTopics = topicRepository.findByIsActiveTrue();
        if (activeTopics.isEmpty()) {
            log.info("Main Scheduler: no active topics found, skipping.");
            return;
        }

        // Dedup keywords — giữ thứ tự insertion để output log dễ đọc
        Set<String> uniqueKeywords = new LinkedHashSet<>();
        for (var topic : activeTopics) {
            if (topic.getKeywords() == null || topic.getKeywords().isBlank()) continue;
            Arrays.stream(topic.getKeywords().split(","))
                    .map(String::trim)
                    .filter(k -> !k.isEmpty())
                    .forEach(uniqueKeywords::add);
        }

        log.info("Processing {} unique keyword(s) from {} active topic(s)",
                uniqueKeywords.size(), activeTopics.size());

        AtomicInteger processed = new AtomicInteger(0);
        AtomicInteger skipped  = new AtomicInteger(0);
        AtomicInteger failed   = new AtomicInteger(0);

        for (String keyword : uniqueKeywords) {
            var papers = arxivFetchService.fetchByKeyword(keyword);
            log.debug("Keyword '{}' → {} papers fetched", keyword, papers.size());

            for (var paper : papers) {
                try {
                    boolean queued = paperPipelineService.process(paper);
                    if (queued) processed.incrementAndGet();
                    else        skipped.incrementAndGet();
                } catch (Exception e) {
                    // Lỗi đã được xử lý bên trong REQUIRES_NEW — log thêm ở đây nếu có exception bất ngờ
                    log.error("Unexpected pipeline error for arxivId={}: {}",
                            paper.getArxivId(), e.getMessage());
                    failed.incrementAndGet();
                }
            }
        }

        long elapsedSec = (System.currentTimeMillis() - startMs) / 1000;
        log.info("=== Main Scheduler FINISHED in {}s — processed={} skipped={} failed={} ===",
                elapsedSec, processed.get(), skipped.get(), failed.get());
    }
}
