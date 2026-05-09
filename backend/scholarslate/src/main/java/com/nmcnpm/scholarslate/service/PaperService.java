package com.nmcnpm.scholarslate.service;

import com.nmcnpm.scholarslate.dto.common.PagedResponse;
import com.nmcnpm.scholarslate.dto.paper.PaperResponse;
import com.nmcnpm.scholarslate.exception.AppException;
import com.nmcnpm.scholarslate.mapper.PaperMapper;
import com.nmcnpm.scholarslate.repository.FavoriteRepository;
import com.nmcnpm.scholarslate.repository.PaperRepository;
import com.nmcnpm.scholarslate.util.VectorUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PaperService {

    private final PaperRepository paperRepository;
    private final FavoriteRepository favoriteRepository;
    private final PaperMapper paperMapper;

    /**
     * Danh sách paper DONE — có thể filter theo topicId hoặc keyword search (UC05).
     * Mặc định sort theo published_at DESC.
     *
     * @param userId ID của user đang request — dùng để populate is_favorite trong response.
     *               null được chấp nhận (admin context hoặc public).
     */
    @Transactional(readOnly = true)
    public PagedResponse<PaperResponse> getPapers(UUID userId, UUID topicId, String keyword,
                                                   int page, int size) {
        // Fetch tất cả paper_id đã favorite của user một lần — O(1) lookup khi map
        Set<UUID> favIds = userId != null
                ? favoriteRepository.findFavoritedPaperIdsByUserId(userId)
                : Set.of();

        var pageable = PageRequest.of(page, size, Sort.by("publishedAt").descending());

        if (StringUtils.hasText(keyword)) {
            // Native query already has ORDER BY — strip sort from Pageable to avoid
            // Spring Data JPA appending "ORDER BY publishedat" (camelCase → column not found)
            var unsorted = PageRequest.of(page, size);
            return PagedResponse.of(
                    paperRepository.fullTextSearch(keyword, unsorted)
                            .map(p -> paperMapper.toResponse(p, favIds.contains(p.getId()))));
        }

        if (topicId != null) {
            return PagedResponse.of(
                    paperRepository.findDonePapersByTopicId(topicId, pageable)
                            .map(p -> paperMapper.toResponse(p, favIds.contains(p.getId()))));
        }

        return PagedResponse.of(
                paperRepository.findByProcessingStatusAndIsDuplicateFalse("DONE", pageable)
                        .map(p -> paperMapper.toResponse(p, favIds.contains(p.getId()))));
    }

    /**
     * Chi tiết một paper (UC06).
     *
     * @param userId ID của user đang request — dùng để populate is_favorite.
     */
    @Transactional(readOnly = true)
    public PaperResponse getPaper(UUID paperId, UUID userId) {
        var paper = paperRepository.findById(paperId)
                .orElseThrow(() -> AppException.notFound("Paper not found"));

        boolean isFav = userId != null
                && favoriteRepository.existsByUserIdAndPaperId(userId, paperId);

        return paperMapper.toResponse(paper, isFav);
    }

    /**
     * Recommendation top-10 paper liên quan (UC14).
     * Dùng HNSW cosine distance < 0.5, cached 1h tại Controller.
     * is_favorite không cần thiết cho recommendations (chỉ hiển thị để đọc).
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
