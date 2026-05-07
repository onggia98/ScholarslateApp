package com.nmcnpm.scholarslate.controller;

import com.nmcnpm.scholarslate.dto.common.ApiResponse;
import com.nmcnpm.scholarslate.dto.common.PagedResponse;
import com.nmcnpm.scholarslate.dto.notification.NotificationResponse;
import com.nmcnpm.scholarslate.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    // UC11 — Danh sách notification, filter theo isRead
    @GetMapping
    public ApiResponse<PagedResponse<NotificationResponse>> getNotifications(
            @AuthenticationPrincipal UUID userId,
            @RequestParam(required = false) Boolean isRead,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(
                notificationService.getNotifications(userId, isRead, page, size));
    }

    // UC11 — Đếm unread (dùng cho badge)
    @GetMapping("/unread-count")
    public ApiResponse<Long> countUnread(@AuthenticationPrincipal UUID userId) {
        return ApiResponse.ok(notificationService.countUnread(userId));
    }

    // UC11 — Mark một notification là đã đọc
    @PatchMapping("/{id}/read")
    public ApiResponse<Void> markAsRead(
            @PathVariable UUID id,
            @AuthenticationPrincipal UUID userId) {
        notificationService.markAsRead(id, userId);
        return ApiResponse.ok("Marked as read");
    }

    // UC11 — Mark tất cả là đã đọc
    @PatchMapping("/read-all")
    public ApiResponse<Void> markAllAsRead(@AuthenticationPrincipal UUID userId) {
        notificationService.markAllAsRead(userId);
        return ApiResponse.ok("All notifications marked as read");
    }
}
