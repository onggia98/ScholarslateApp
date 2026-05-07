package com.nmcnpm.scholarslate.dto.paper;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Response DTO cho Paper.
 * KHÔNG chứa embedding — @Mapping(target = "embedding", ignore = true) trong mapper.
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaperResponse {

    private UUID id;
    private String arxivId;
    private String title;
    private String abstractText;
    private String authors;
    private String paperUrl;
    private String pdfUrl;
    private String summary;
    private Float qualityScore;
    private Boolean isDuplicate;
    private String processingStatus;
    private OffsetDateTime publishedAt;
    private OffsetDateTime createdAt;
    private String lastError;   // hiển thị lý do FAILED — dùng cho debug/admin
}
