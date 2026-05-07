package com.nmcnpm.scholarslate.mapper;

import com.nmcnpm.scholarslate.dto.notification.NotificationResponse;
import com.nmcnpm.scholarslate.entity.Notification;
import org.springframework.stereotype.Component;

/**
 * Mapper thủ công cho Notification → NotificationResponse.
 * Không dùng MapStruct để tránh vấn đề bean detection với Spring Boot 4.x.
 * paper.id  → paperId
 * paper.title → paperTitle
 */
@Component
public class NotificationMapper {

    public NotificationResponse toResponse(Notification notification) {
        if (notification == null) return null;

        return NotificationResponse.builder()
                .id(notification.getId())
                .paperId(notification.getPaper() != null ? notification.getPaper().getId() : null)
                .paperTitle(notification.getPaper() != null ? notification.getPaper().getTitle() : null)
                .type(notification.getType())
                .message(notification.getMessage())
                .isRead(notification.getIsRead())
                .createdAt(notification.getCreatedAt())
                .build();
    }
}
