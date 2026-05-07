package com.nmcnpm.scholarslate.mapper;

import com.nmcnpm.scholarslate.dto.paper.PaperResponse;
import com.nmcnpm.scholarslate.entity.Paper;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Mapper thủ công cho Paper → PaperResponse.
 * Không dùng MapStruct để tránh vấn đề compilation ordering
 * với toResponseList(List<Paper>) method.
 * embedding bị bỏ qua vì không có trong PaperResponse.
 */
@Component
public class PaperMapper {

    public PaperResponse toResponse(Paper paper) {
        if (paper == null) return null;

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
                .publishedAt(paper.getPublishedAt())
                .createdAt(paper.getCreatedAt())
                .lastError(paper.getLastError())
                .build();
    }

    public List<PaperResponse> toResponseList(List<Paper> papers) {
        if (papers == null) return List.of();
        return papers.stream().map(this::toResponse).toList();
    }
}
