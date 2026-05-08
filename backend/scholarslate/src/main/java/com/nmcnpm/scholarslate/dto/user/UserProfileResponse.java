package com.nmcnpm.scholarslate.dto.user;

import lombok.Builder;
import lombok.Getter;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Profile của user hiện tại — trả về từ GET /api/users/me.
 */
@Getter
@Builder
public class UserProfileResponse {
    private UUID id;
    private String email;
    private String role;
    private OffsetDateTime createdAt; // → created_at (snake_case)
}
