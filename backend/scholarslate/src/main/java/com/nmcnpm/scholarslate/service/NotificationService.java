package com.nmcnpm.scholarslate.service;

import com.nmcnpm.scholarslate.dto.common.PagedResponse;
import com.nmcnpm.scholarslate.dto.notification.NotificationResponse;
import com.nmcnpm.scholarslate.exception.AppException;
import com.nmcnpm.scholarslate.mapper.NotificationMapper;
import com.nmcnpm.scholarslate.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final NotificationMapper notificationMapper;

    @Transactional(readOnly = true)
    public PagedResponse<NotificationResponse> getNotifications(
            UUID userId, Boolean isRead, int page, int size) {

        var pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());

        var result = (isRead != null)
                ? notificationRepository.findByUserIdAndIsReadOrderByCreatedAtDesc(userId, isRead, pageable)
                : notificationRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable);

        return PagedResponse.of(result.map(notificationMapper::toResponse));
    }

    @Transactional(readOnly = true)
    public long countUnread(UUID userId) {
        return notificationRepository.countByUserIdAndIsReadFalse(userId);
    }

    @Transactional
    public void markAsRead(UUID notificationId, UUID userId) {
        var notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> AppException.notFound("Notification not found"));

        if (!notification.getUser().getId().equals(userId)) {
            throw AppException.forbidden("Access denied");
        }

        notification.setIsRead(true);
        notificationRepository.save(notification);
    }

    @Transactional
    public int markAllAsRead(UUID userId) {
        return notificationRepository.markAllAsRead(userId);
    }
}
