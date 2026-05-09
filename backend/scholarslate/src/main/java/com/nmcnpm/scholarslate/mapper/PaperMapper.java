package com.nmcnpm.scholarslate.mapper;

import com.nmcnpm.scholarslate.dto.paper.PaperResponse;
import com.nmcnpm.scholarslate.entity.Paper;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Mapper thủ công cho Paper → PaperResponse.
 * Không dùng MapStruct để tránh vấn đề compilation ordering
 * với Spring Boot 4.x component scan.
 * embedding bị bỏ qua vì không có trong PaperResponse.
 */
@Component
public class PaperMapper {

    /**
     * Map Paper → PaperResponse với isFavorite được chỉ định rõ ràng.
     * Dùng khi caller đã biết trạng thái favorite (e.g., qua Set<UUID> từ FavoriteRepository).
     */
    public PaperResponse toResponse(Paper paper, boolean isFavorite) {
        if (paper == null) return null;

        // Extract topic names — distinct() guards against duplicate topic names
        // (e.g. two users created a topic with the same name linked to the same paper)
        List<String> topicNames = paper.getTopics() == null ? List.of()
                : paper.getTopics().stream()
                        .map(t -> t.getName())
                        .distinct()
                        .collect(Collectors.toList());

        return PaperResponse.builder()
                .id(paper.getId())
                .arxivId(paper.getArxivId())
                .title(paper.getTitle())
                .abstractText(paper.getAbstractText())
                .authors(paper.getAuthors())
                .paperUrl(paper.getPaperUrl())
                .pdfUrl(paper.getPdfUrl())
                .summary(paper.getSummary())
                .qualityScore(paper.getQualityScore())
                .isDuplicate(paper.getIsDuplicate())
                .processingStatus(paper.getProcessingStatus())
                .retryCount(paper.getRetryCount())
                .lastError(paper.getLastError())
                .lastRetryAt(paper.getLastRetryAt())
                .publishedAt(paper.getPublishedAt())
                .createdAt(paper.getCreatedAt())
                .topics(topicNames)
                .isFavorite(isFavorite)
                .build();
    }

    /**
     * Map Paper → PaperResponse với isFavorite = false (không có user context).
     * Dùng trong Admin endpoints, Retry/Pipeline, và Recommendations.
     */
    public PaperResponse toResponse(Paper paper) {
        return toResponse(paper, false);
    }

    /**
     * Map danh sách Paper với favorite context.
     * favoritedIds: Set paper_id đã được user favorite — O(1) membership check.
     */
    public List<PaperResponse> toResponseList(List<Paper> papers, Set<UUID> favoritedIds) {
        if (papers == null) return List.of();
        return papers.stream()
                .map(p -> toResponse(p, favoritedIds.contains(p.getId())))
                .toList();
    }

    /**
     * Map danh sách Paper không có user context (isFavorite = false cho tất cả).
     * Dùng cho Recommendations (không cần is_favorite) và Admin.
     */
    public List<PaperResponse> toResponseList(List<Paper> papers) {
        return toResponseList(papers, Set.of());
    }
}
