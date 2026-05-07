package com.nmcnpm.scholarslate.service.ai;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * Gọi HuggingFace Inference API để tạo embedding vector(384).
 * Model: BAAI/bge-small-en-v1.5 (feature-extraction, 384 dims).
 *
 * URL format mới (2025): pipeline/feature-extraction/{model}
 * — URL cũ /models/{model} trả 404 kể từ đầu 2026.
 *
 * Response có thể là:
 *   - 2D: List<List<Float>>           → sentence-level embedding (pooled)
 *   - 3D: List<List<List<Float>>>     → token-level, cần mean-pool qua token dimension
 *
 * Batch max 32. HTTP 503 (model cold start) → chờ 30s, retry 1 lần.
 */
@Slf4j
@Service
public class EmbeddingService {

    /**
     * HuggingFace Router — endpoint mới, ổn định hơn api-inference.huggingface.co/pipeline/.
     * BAAI/bge-small-en-v1.5 được router chạy đúng task feature-extraction (không bị nhầm sang sentence-similarity).
     * {model} được thay thế bằng giá trị từ application.yml.
     */
    private static final String HF_PIPELINE_URL =
            "https://router.huggingface.co/hf-inference/models/{model}";

    private final RestClient restClient;
    private final String model;
    private final int batchSize;
    private final long retryWaitMs;

    public EmbeddingService(
            @Value("${ai.huggingface.api-key}") String apiKey,
            @Value("${ai.huggingface.model}") String model,
            @Value("${ai.huggingface.batch-size:32}") int batchSize,
            @Value("${ai.huggingface.retry-wait-on-503-ms:30000}") long retryWaitMs) {
        this.restClient = RestClient.builder()
                .defaultHeader("Authorization", "Bearer " + apiKey)
                .build();
        this.model = model;
        this.batchSize = batchSize;
        this.retryWaitMs = retryWaitMs;
    }

    /**
     * Tạo embedding cho một đoạn text.
     * Trả về float[] (384 dimensions) hoặc null nếu lỗi.
     */
    public float[] embed(String text) {
        List<float[]> results = embedBatch(List.of(text));
        return (results != null && !results.isEmpty()) ? results.get(0) : null;
    }

    /**
     * Tạo embedding batch. Gọi HF feature-extraction pipeline.
     * Tự động xử lý cả response 2D (pooled) và 3D (per-token → mean pool).
     */
    public List<float[]> embedBatch(List<String> texts) {
        String url = HF_PIPELINE_URL.replace("{model}", model);
        log.info("[HF] POST {} | batch={}", url, texts.size());

        for (int attempt = 0; attempt <= 1; attempt++) {
            try {
                // Không truyền "options" — một số HF endpoints báo lỗi nếu gặp field lạ
                @SuppressWarnings("unchecked")
                var raw = (List<Object>) restClient.post()
                        .uri(url)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("inputs", texts))
                        .retrieve()
                        .body(List.class);

                if (raw == null || raw.isEmpty()) {
                    log.error("[HF] Empty/null body from {} — check API key and model name", url);
                    return null;
                }

                log.info("[HF] Got response: outerSize={}, firstElementType={}",
                        raw.size(),
                        raw.get(0) == null ? "null" : raw.get(0).getClass().getSimpleName());

                return raw.stream()
                        .map(this::extractEmbedding)
                        .toList();

            } catch (org.springframework.web.client.HttpClientErrorException e) {
                // 4xx — log body để xem thông báo lỗi từ HF
                log.error("[HF] HTTP {} from {}: {}", e.getStatusCode(), url,
                        e.getResponseBodyAsString());
                return null;
            } catch (org.springframework.web.client.HttpServerErrorException e) {
                String body = e.getResponseBodyAsString();
                if (attempt == 0 && e.getStatusCode().value() == 503) {
                    log.warn("[HF] 503 cold start, waiting {}ms: {}", retryWaitMs, body);
                    try { Thread.sleep(retryWaitMs); } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        return null;
                    }
                } else {
                    log.error("[HF] HTTP {} from {}: {}", e.getStatusCode(), url, body);
                    return null;
                }
            } catch (Exception e) {
                log.error("[HF] Request failed (attempt={}): {} — {}",
                        attempt + 1, e.getClass().getSimpleName(), e.getMessage());
                return null;
            }
        }
        return null;
    }

    /**
     * Trích xuất float[] từ một phần tử response.
     * - Nếu phần tử là List<Number> → sentence embedding (2D response) → convert trực tiếp.
     * - Nếu phần tử là List<List<Number>> → token embeddings (3D response) → mean pool.
     */
    @SuppressWarnings("unchecked")
    private float[] extractEmbedding(Object item) {
        if (item instanceof List<?> list && !list.isEmpty()) {
            Object first = list.get(0);
            if (first instanceof Number) {
                // 2D response: đây là sentence embedding
                return toFloatArray((List<Number>) list);
            } else if (first instanceof List<?>) {
                // 3D response: list of token embeddings → mean pool
                List<List<Number>> tokenEmbeddings = (List<List<Number>>) list;
                return meanPool(tokenEmbeddings);
            }
        }
        log.warn("Unexpected embedding format: {}", item == null ? "null" : item.getClass().getSimpleName());
        return new float[0];
    }

    /** Mean-pool theo token dimension: shape [seq_len, hidden_size] → [hidden_size] */
    private float[] meanPool(List<List<Number>> tokenEmbeddings) {
        if (tokenEmbeddings.isEmpty()) return new float[0];
        int dims = tokenEmbeddings.get(0).size();
        float[] result = new float[dims];
        for (List<Number> token : tokenEmbeddings) {
            for (int d = 0; d < dims; d++) {
                result[d] += token.get(d).floatValue();
            }
        }
        float n = tokenEmbeddings.size();
        for (int d = 0; d < dims; d++) result[d] /= n;
        return result;
    }

    private float[] toFloatArray(List<Number> numbers) {
        float[] arr = new float[numbers.size()];
        for (int i = 0; i < numbers.size(); i++) {
            arr[i] = numbers.get(i).floatValue();
        }
        return arr;
    }
}
