package com.nmcnpm.scholarslate.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Bảng "user" — dùng dấu nháy kép vì "user" là reserved keyword trong PostgreSQL.
 */
@Entity
@Table(name = "\"user\"")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    /**
     * Giá trị hợp lệ: "USER" | "ADMIN" — enforced bởi CHECK constraint trong DB.
     * Default: "USER". ADMIN chỉ tạo qua Flyway seed (V5).
     */
    @Column(nullable = false, length = 10)
    @Builder.Default
    private String role = "USER";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false,
            columnDefinition = "TIMESTAMP WITH TIME ZONE")
    private OffsetDateTime createdAt;
}
