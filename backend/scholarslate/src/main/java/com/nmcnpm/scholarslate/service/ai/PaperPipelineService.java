package com.nmcnpm.scholarslate.service.ai;

import com.nmcnpm.scholarslate.entity.Paper;
import com.nmcnpm.scholarslate.entity.Topic;
import com.nmcnpm.scholarslate.repository.NotificationRepository;
import com.nmcnpm.scholarslate.repository.PaperRepository;
import com.nmcnpm.scholarslate.repository.PaperTopicRepository;
import com.nmcnpm.scholarslate.repository.TopicRepository;
import com.nmcnpm.scholarslate.util.VectorUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;

/**
 * Orchestrates the full AI pipeline for a single paper:
 *   embed → duplicate check → Groq summary → topic matching → notification.
 *
 * REQUIRES_NEW: mỗi paper chạy trong transaction độc lập.
 * Lỗi 1 paper không rollback các paper khác.
 * Gọi bởi MainScheduler (paper mới) và RetryScheduler (paper FAILED).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaperPipelineService {

    /** Cửa sổ 90 ngày cho duplicate detection — tránh khớp với paper quá cũ. */
    private static final int DUPLICATE_WINDOW_DAYS = 90;

    private final PaperRepository paperRepository;
    private final TopicRepository topicRepository;
    private final PaperTopicRepository paperTopicRepository;
    private final NotificationRepository notificationRepository;
    private final EmbeddingService embeddingService;
    private final GroqService groqService;

    /**
     * Xử lý paper mới (trạng thái PENDING từ ArxivFetchService).
     * Trả về false nếu arxiv_id đã tồn tại (idempotency skip) — caller dùng để đếm skipped.
     * Trả về true nếu paper được đưa vào pipeline (dù kết quả DONE hay FAILED).
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean process(Paper paper) {
        if (paperRepository.existsByArxivId(paper.getArxivId())) {
            log.debug("Skipping duplicate arxivId: {}", paper.getArxivId());
            return false;
        }
        // Lưu trước để có ID — cần cho findDuplicate và matchesTopic
        Paper saved = paperRepository.save(paper);
        runPipeline(saved);
        return true;
    }

    /**
     * Retry một paper FAILED (gọi bởi RetryScheduler).
     * Tăng retryCount và cập nhật lastRetryAt trước khi thử lại.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void retry(Paper paper) {
        paper.setRetryCount(paper.getRetryCount() + 1);
        paper.setLastRetryAt(OffsetDateTime.now());
        paper.setProcessingStatus("PENDING");
        paper.setLastError(null);
        paperRepository.save(paper);
        runPipeline(paper);
    }

    // ── Core pipeline ─────────────────────────────────────────────────────────

    /**
     * Pipeline chính:
     * 1. Embedding (HuggingFace)
     * 2. Duplicate detection (pgvector cosine distance < 0.05)
     * 3. Groq summary + quality_score
     * 4. Topic matching + notification
     * 5. Mark DONE
     */
    private void runPipeline(Paper paper) {

        // ── Step 1: Embedding ─────────────────────────────────────────────────
        String embeddingInput = buildEmbeddingText(paper);
        float[] embedding = embeddingService.embed(embeddingInput);
        if (embedding == null || embedding.length == 0) {
            markFailed(paper, "Embedding failed: empty/null response from HuggingFace");
            return;
        }
        paper.setEmbedding(embedding);

        // ── Step 2: Duplicate detection ───────────────────────────────────────
        // So sánh cosine distance với các paper DONE trong 90 ngày qua
        String embeddingStr = VectorUtils.toVectorString(embedding);
        var windowStart = OffsetDateTime.now().minusDays(DUPLICATE_WINDOW_DAYS);
        var duplicate = paperRepository.findDuplicate(paper.getId(), embeddingStr, windowStart);

        if (duplicate.isPresent()) {
            log.info("Duplicate detected — arxivId={} matches original={}",
                    paper.getArxivId(), duplicate.get().getArxivId());
            paper.setIsDuplicate(true);
            paper.setOriginalPaper(duplicate.get());
            paper.setProcessingStatus("DONE");
            paperRepository.save(paper);
            return; // Không cần Groq hay topic matching cho bản trùng
        }

        // ── Step 3: Groq — summary + quality_score ────────────────────────────
        var groqResult = groqService.summarize(paper.getTitle(), paper.getAbstractText());
        if (!groqResult.isValid()) {
            markFailed(paper, groqResult.error());
            return;
        }
        paper.setSummary(groqResult.summary());
        paper.setQualityScore(groqResult.qualityScore());

        // ── Step 4: Topic matching + notification ─────────────────────────────
        List<Topic> activeTopics = topicRepository.findByIsActiveTrue();
        matchTopicsAndNotify(paper, activeTopics);

        // ── Step 5: Mark DONE ─────────────────────────────────────────────────
        paper.setProcessingStatus("DONE");
        paperRepository.save(paper);
        log.info("Pipeline DONE — arxivId={}", paper.getArxivId());
    }

    /**
     * Với mỗi active topic, kiểm tra xem paper có khớp keyword nào không.
     * Nếu khớp: tạo PaperTopic link + notification cho owner của topic.
     */
    private void matchTopicsAndNotify(Paper paper, List<Topic> topics) {
        for (Topic topic : topics) {
            if (topic.getKeywords() == null || topic.getKeywords().isBlank()) continue;

            // Keywords comma-separated: "large language model,rag,transformer"
            // phraseto_tsquery trong matchesTopic xử lý exact phrase match
            boolean matched = Arrays.stream(topic.getKeywords().split(","))
                    .map(String::trim)
                    .filter(k -> !k.isEmpty())
                    .anyMatch(kw -> paperRepository.matchesTopic(paper.getId(), kw));

            if (matched) {
                // INSERT ... ON CONFLICT DO NOTHING — idempotent
                paperTopicRepository.insertIfNotExists(paper.getId(), topic.getId());

                String message = String.format(
                        "New paper matching your topic \"%s\": %s",
                        topic.getName(), paper.getTitle());
                notificationRepository.insertIfNotExists(
                        topic.getUser().getId(), paper.getId(), message);

                log.debug("Matched arxivId={} → topic={}", paper.getArxivId(), topic.getName());
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void markFailed(Paper paper, String error) {
        paper.setProcessingStatus("FAILED");
        paper.setLastError(error);
        paperRepository.save(paper);
        log.warn("Pipeline FAILED — arxivId={}: {}", paper.getArxivId(), error);
    }

    /**
     * Ghép title + abstract để tạo embedding — khớp với chiến lược GIN index.
     */
    private String buildEmbeddingText(Paper paper) {
        String title = paper.getTitle() != null ? paper.getTitle() : "";
        String abs = paper.getAbstractText() != null ? paper.getAbstractText() : "";
        return (title + " " + abs).trim();
    }

}
