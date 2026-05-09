package com.nmcnpm.scholarslate.controller;

import com.nmcnpm.scholarslate.dto.common.ApiResponse;
import com.nmcnpm.scholarslate.dto.common.PagedResponse;
import com.nmcnpm.scholarslate.dto.paper.PaperResponse;
import com.nmcnpm.scholarslate.scheduler.MainScheduler;
import com.nmcnpm.scholarslate.scheduler.RetryScheduler;
import com.nmcnpm.scholarslate.service.AdminService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * UC17 — Admin endpoints: xem và reset paper FAILED.
 * Yêu cầu role ADMIN — bảo vệ bởi @PreAuthorize + SecurityConfig.
 * Business logic và @Transactional nằm trong AdminService.
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final AdminService adminService;
    private final MainScheduler mainScheduler;
    private final RetryScheduler retryScheduler;

    // UC17 — Xem danh sách paper FAILED
    @GetMapping("/papers/failed")
    public ApiResponse<PagedResponse<PaperResponse>> getFailedPapers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(adminService.getFailedPapers(page, size));
    }

    // UC17 — Reset 1 paper FAILED về retryCount=0 để RetryScheduler pick up lại
    @PostMapping("/papers/{id}/reset")
    public ApiResponse<Void> resetFailedPaper(@PathVariable UUID id) {
        adminService.resetFailedPaper(id);
        return ApiResponse.ok("Paper reset — RetryScheduler will reprocess it within 30 minutes");
    }

    /**
     * Trigger Main Pipeline thủ công — fetch paper mới từ arXiv, không cần chờ 06:00.
     * Chạy async trong virtual thread để không block HTTP response.
     */
    @PostMapping("/pipeline/trigger")
    public ApiResponse<Void> triggerPipeline() {
        Thread.ofVirtual().name("manual-pipeline").start(mainScheduler::runDailyFetch);
        return ApiResponse.ok("Main pipeline triggered — check server logs for progress");
    }

    /**
     * Force-chạy Retry Scheduler ngay lập tức — không cần chờ 30 phút.
     * Hữu ích sau khi sửa lỗi (e.g., đổi embedding URL) để re-process các paper FAILED.
     */
    @PostMapping("/pipeline/retry")
    public ApiResponse<Void> triggerRetry() {
        Thread.ofVirtual().name("manual-retry").start(retryScheduler::retryFailed);
        return ApiResponse.ok("Retry triggered — processing FAILED papers in background");
    }

    /**
     * Reset toàn bộ FAILED papers về retryCount=0 để RetryScheduler có thể retry lại.
     * Dùng sau khi sửa lỗi hệ thống (e.g., API key hết hạn, endpoint thay đổi).
     */
    @PostMapping("/papers/reset-all-failed")
    public ApiResponse<Void> resetAllFailedPapers() {
        int count = adminService.resetAllFailedPapers();
        return ApiResponse.ok("Reset " + count + " FAILED paper(s) — call /pipeline/retry to reprocess");
    }
}
