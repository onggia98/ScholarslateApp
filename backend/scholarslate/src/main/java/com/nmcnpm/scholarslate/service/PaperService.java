package com.nmcnpm.scholarslate.service;

import com.nmcnpm.scholarslate.dto.common.PagedResponse;
import com.nmcnpm.scholarslate.dto.paper.PaperResponse;
import com.nmcnpm.scholarslate.exception.AppException;
import com.nmcnpm.scholarslate.mapper.PaperMapper;
import com.nmcnpm.scholarslate.repository.PaperRepository;
import com.nmcnpm.scholarslate.util.VectorUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PaperService {

    private final PaperRepository paperRepository;
    private final PaperMapper paperMapper;

    /**
     * Danh sách paper DONE — có thể filter theo topicId hoặc keyword search (UC05).
     * Mặc định sort theo published_at DESC.
     */
    @Transactional(readOnly = true)
    public PagedResponse<PaperResponse> getPapers(UUID topicId, String keyword,
                                                   int page, int size) {
        var pageable = PageRequest.of(page, size, Sort.by("publishedAt").descending());

        if (StringUtils.hasText(keyword)) {
            // Native query already has ORDER BY — strip sort from Pageable to avoid
            // Spring Data JPA appending "ORDER BY publishedat" (camelCase → column not found)
            var unsorted = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
            return PagedResponse.of(
                    paperRepository.fullTextSearch(keyword, unsorted)
                            .map(paperMapper::toResponse));
        }

        if (topicId != null) {
            return PagedResponse.of(
                    paperRepository.findDonePapersByTopicId(topicId, pageable)
                            .map(paperMapper::toResponse));
        }

        return PagedResponse.of(
                paperRepository.findByProcessingStatusAndIsDuplicateFalse("DONE", pageable)
                        .map(paperMapper::toResponse));
    }

    /**
     * Chi tiết một paper (UC06).
     */
    @Transactional(readOnly = true)
    public PaperResponse getPaper(UUID paperId) {
        return paperRepository.findById(paperId)
                .map(paperMapper::toResponse)
                .orElseThrow(() -> AppException.notFound("Paper not found"));
    }

    /**
     * Recommendation top-10 paper liên quan (UC14).
     * Dùng HNSW cosine distance < 0.5, cached 1h tại Controller.
     */
    @Transactional(readOnly = true)
    public List<PaperResponse> getRecommendations(UUID paperId) {
        var paper = paperRepository.findById(paperId)
                .orElseThrow(() -> AppException.notFound("Paper not found"));

        if (paper.getEmbedding() == null) return List.of();

        // Chuyển float[] → vector string để dùng trong native query
        String embeddingStr = VectorUtils.toVectorString(paper.getEmbedding());
        var oneYearAgo = java.time.OffsetDateTime.now().minusYears(1);

        return paperMapper.toResponseList(
                paperRepository.findRecommendations(paperId, embeddingStr, oneYearAgo, 10));
    }

    /**
     * Trend statistics theo topic (UC15) — tính động, không có bảng riêng.
     * Trả về list [{month: "2025-01", count: 5}, ...]
     */
    @Transactional(readOnly = true)
    public List<java.util.Map<String, Object>> getTrendStats(UUID topicId) {
        var since = java.time.OffsetDateTime.now()
                .minusYears(2);   // giới hạn 2 năm lịch sử

        return paperRepository.findTrendStats(topicId, since).stream()
                .map(row -> java.util.Map.<String, Object>of(
                        "month", row[0],
                        "count", row[1]))
                .toList();
    }

}
