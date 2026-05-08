package com.nmcnpm.scholarslate.dto.paper;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Response DTO cho Paper.
 * KHÔNG chứa embedding — @Mapping(target = "embedding", ignore = true) trong mapper.
 * @JsonProperty("abstract") ghi đè snake_case vì "abstract" là reserved keyword trong Java.
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaperResponse {

    private UUID id;
    private String arxivId;          // → arxiv_id (snake_case)
    private String title;

    @JsonProperty("abstract")       // override: abstractText → "abstract" (không phải "abstract_text")
    private String abstractText;

    private String authors;
    private String paperUrl;         // → paper_url
    private String pdfUrl;           // → pdf_url
    private String summary;
    private Float qualityScore;      // → quality_score
    private Boolean isDuplicate;     // → is_duplicate
    private String processingStatus; // → processing_status
    private OffsetDateTime publishedAt; // → published_at
    private OffsetDateTime createdAt;   // → created_at
    private String lastError;        // → last_error

    /** Danh sách tên topic liên kết với paper — populated bởi PaperService */
    private List<String> topics;
}
