package com.nmcnpm.scholarslate.dto.notification;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationResponse {

    private UUID id;
    private UUID paperId;
    private String paperTitle;
    private String type;
    private String message;
    private Boolean isRead;
    private OffsetDateTime createdAt;
}
