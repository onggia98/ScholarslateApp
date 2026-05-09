package com.nmcnpm.scholarslate.controller;

import com.nmcnpm.scholarslate.dto.common.ApiResponse;
import com.nmcnpm.scholarslate.dto.common.PagedResponse;
import com.nmcnpm.scholarslate.dto.paper.PaperResponse;
import com.nmcnpm.scholarslate.service.PaperService;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/papers")
@RequiredArgsConstructor
public class PaperController {

    private final PaperService paperService;

    /**
     * UC05 — Danh sách paper DONE.
     * Query params: topicId (filter), keyword (full-text search), page, size.
     * userId từ JWT → populate is_favorite trong mỗi PaperResponse.
     */
    @GetMapping
    public ApiResponse<PagedResponse<PaperResponse>> getPapers(
            @AuthenticationPrincipal UUID userId,
            @RequestParam(required = false) UUID topicId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ApiResponse.ok(paperService.getPapers(userId, topicId, keyword, page, size));
    }

    // UC05 — Search alias: /api/papers/search?q=... (cùng logic với ?keyword=)
    @GetMapping("/search")
    public ApiResponse<PagedResponse<PaperResponse>> searchPapers(
            @AuthenticationPrincipal UUID userId,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ApiResponse.ok(paperService.getPapers(userId, null, q, page, size));
    }

    // UC06 — Chi tiết paper — is_favorite dựa theo user đang request
    @GetMapping("/{id}")
    public ApiResponse<PaperResponse> getPaper(
            @PathVariable UUID id,
            @AuthenticationPrincipal UUID userId) {
        return ApiResponse.ok(paperService.getPaper(id, userId));
    }

    /**
     * UC14 — Recommendation top-10 paper liên quan.
     * Cache 1 giờ theo paper_id — không ghi vào NOTIFICATION.
     * is_favorite không populate trong recommendations (chỉ dùng để đọc).
     */
    @GetMapping("/{id}/recommendations")
    @Cacheable(value = "recommendations", key = "#id")
    public ApiResponse<List<PaperResponse>> getRecommendations(@PathVariable UUID id) {
        return ApiResponse.ok(paperService.getRecommendations(id));
    }

    // UC15 — Trend statistics theo topic, tính động theo tháng
    @GetMapping("/stats/trend")
    public ApiResponse<List<Map<String, Object>>> getTrendStats(
            @RequestParam UUID topicId) {
        return ApiResponse.ok(paperService.getTrendStats(topicId));
    }
}
