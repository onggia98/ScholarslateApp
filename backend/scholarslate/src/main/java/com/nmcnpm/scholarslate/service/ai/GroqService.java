package com.nmcnpm.scholarslate.service.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * Gọi Groq API để tạo summary và quality_score từ abstract.
 * Model: llama-3.1-8b-instant (cấu hình qua ai.groq.model). Free tier ~30 RPM.
 * Single call cho cả summary + score (response_format: json_object).
 * Retry 1 lần sau 5s cho lỗi 5xx/timeout. KHÔNG retry 429.
 * Delay 2s giữa các calls để tránh rate limit.
 */
@Slf4j
@Service
public class GroqService {

    private static final String GROQ_API = "https://api.groq.com/openai/v1/chat/completions";

    /** Singleton per class — tránh tạo mới ObjectMapper mỗi lần parse response */
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final RestClient restClient;
    private final String model;
    private final int maxSummaryLength;
    private final long callDelayMs;
    private final long transientRetryDelayMs;

    public GroqService(
            @Value("${ai.groq.api-key}") String apiKey,
            @Value("${ai.groq.model}") String model,
            @Value("${ai.groq.max-summary-length:2000}") int maxSummaryLength,
            @Value("${scheduler.groq.call-delay-ms:2000}") long callDelayMs,
            @Value("${scheduler.groq.transient-retry-delay-ms:5000}") long transientRetryDelayMs) {
        this.restClient = RestClient.builder()
                .defaultHeader("Authorization", "Bearer " + apiKey)
                .build();
        this.model = model;
        this.maxSummaryLength = maxSummaryLength;
        this.callDelayMs = callDelayMs;
        this.transientRetryDelayMs = transientRetryDelayMs;
    }

    public record GroqResult(String summary, Float qualityScore, String error) {
        public boolean isValid() { return error == null; }
    }

    /**
     * Gọi Groq API để lấy summary và quality_score từ abstract.
     * Trả về GroqResult với error != null nếu thất bại.
     */
    @SuppressWarnings("unchecked")
    public GroqResult summarize(String title, String abstractText) {
        String prompt = buildPrompt(title, abstractText);

        for (int attempt = 0; attempt <= 1; attempt++) {
            try {
                if (attempt > 0) {
                    Thread.sleep(transientRetryDelayMs);
                    log.warn("Groq retry attempt {} for title: {}", attempt, title);
                }

                var body = Map.of(
                        "model", model,
                        "response_format", Map.of("type", "json_object"),
                        "messages", List.of(Map.of("role", "user", "content", prompt))
                );

                var response = restClient.post()
                        .uri(GROQ_API)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(body)
                        .retrieve()
                        .body(Map.class);

                // Delay 2s giữa các calls — Groq free tier rate limit
                Thread.sleep(callDelayMs);

                return parseResponse(response);

            } catch (Exception e) {
                String msg = e.getMessage() != null ? e.getMessage() : "";
                // 429 (rate limit): KHÔNG retry — để Retry Scheduler xử lý sau
                if (msg.contains("429")) {
                    log.warn("Groq 429 rate limit, skipping retry: {}", title);
                    return new GroqResult(null, null, "Groq rate limit: " + msg);
                }
                // 5xx / timeout: retry 1 lần
                if (attempt == 1) {
                    log.error("Groq failed after retry for '{}': {}", title, msg);
                    return new GroqResult(null, null, msg);
                }
            }
        }
        return new GroqResult(null, null, "Groq failed");
    }

    @SuppressWarnings("unchecked")
    private GroqResult parseResponse(Map<?, ?> response) {
        try {
            var choices = (List<Map<?, ?>>) response.get("choices");
            var message = (Map<?, ?>) choices.get(0).get("message");
            String content = (String) message.get("content");

            // Parse JSON content: {"summary": "...", "quality_score": 7.5}
            var json = OBJECT_MAPPER.readValue(content, Map.class);

            String summary = (String) json.get("summary");
            Number scoreNum = (Number) json.get("quality_score");

            // Validate: summary không rỗng, tối đa 2000 ký tự; score ∈ [0.0, 10.0]
            if (summary == null || summary.isBlank()) {
                return new GroqResult(null, null, "Empty summary from Groq");
            }
            if (summary.length() > maxSummaryLength) {
                summary = summary.substring(0, maxSummaryLength);
            }
            if (scoreNum == null) {
                return new GroqResult(null, null, "Missing quality_score from Groq");
            }
            float score = scoreNum.floatValue();
            if (score < 0.0f || score > 10.0f) {
                return new GroqResult(null, null, "quality_score out of range: " + score);
            }

            return new GroqResult(summary, score, null);
        } catch (Exception e) {
            return new GroqResult(null, null, "Failed to parse Groq response: " + e.getMessage());
        }
    }

    private String buildPrompt(String title, String abstractText) {
        return """
            Analyze this research paper and respond with a JSON object containing exactly two fields:
            1. "summary": A concise summary of the paper in 2-3 sentences (max 2000 characters).
            2. "quality_score": A float between 0.0 and 10.0 rating the paper's significance and clarity.

            Paper Title: %s
            Abstract: %s

            Respond with only the JSON object, no additional text.
            """.formatted(title, abstractText != null ? abstractText : "N/A");
    }
}
