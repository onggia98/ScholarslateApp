package com.nmcnpm.scholarslate.controller;

import com.nmcnpm.scholarslate.dto.common.ApiResponse;
import com.nmcnpm.scholarslate.dto.common.PagedResponse;
import com.nmcnpm.scholarslate.dto.paper.PaperResponse;
import com.nmcnpm.scholarslate.service.FavoriteService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/papers")
@RequiredArgsConstructor
public class FavoriteController {

    private final FavoriteService favoriteService;

    // UC08 — Danh sách paper yêu thích
    @GetMapping("/favorites")
    public ApiResponse<PagedResponse<PaperResponse>> getFavorites(
            @AuthenticationPrincipal UUID userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ApiResponse.ok(favoriteService.getFavorites(userId, page, size));
    }

    // UC07 — Lưu yêu thích
    @PostMapping("/{paperId}/favorite")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<Void> addFavorite(
            @PathVariable UUID paperId,
            @AuthenticationPrincipal UUID userId) {
        favoriteService.addFavorite(paperId, userId);
        return ApiResponse.ok("Added to favorites");
    }

    // UC09 — Bỏ lưu yêu thích — user_id từ JWT, không từ client
    @DeleteMapping("/{paperId}/favorite")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeFavorite(
            @PathVariable UUID paperId,
            @AuthenticationPrincipal UUID userId) {
        favoriteService.removeFavorite(paperId, userId);
    }
}
