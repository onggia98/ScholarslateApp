package com.nmcnpm.scholarslate.repository;

import com.nmcnpm.scholarslate.entity.Notification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    // Danh sách notification của user, mới nhất trước — UC11
    Page<Notification> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    // Filter theo isRead — UC11
    Page<Notification> findByUserIdAndIsReadOrderByCreatedAtDesc(
            UUID userId, Boolean isRead, Pageable pageable);

    // Đếm unread — hiển thị badge
    long countByUserIdAndIsReadFalse(UUID userId);

    // Mark all read — UC11
    @Modifying
    @Query("UPDATE Notification n SET n.isRead = true WHERE n.user.id = :userId AND n.isRead = false")
    int markAllAsRead(@Param("userId") UUID userId);

    // Insert idempotent — ON CONFLICT (user_id, paper_id, type) DO NOTHING
    // Mỗi (user, paper) chỉ nhận đúng một NEW_PAPER notification
    @Modifying
    @Query(value = """
            INSERT INTO notification (id, user_id, paper_id, type, message, is_read, created_at)
            VALUES (gen_random_uuid(), :userId, :paperId, 'NEW_PAPER', :message, false, NOW())
            ON CONFLICT (user_id, paper_id, type) DO NOTHING
            """, nativeQuery = true)
    void insertIfNotExists(
            @Param("userId") UUID userId,
            @Param("paperId") UUID paperId,
            @Param("message") String message);
}
