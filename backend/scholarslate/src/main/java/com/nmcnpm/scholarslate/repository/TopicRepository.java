package com.nmcnpm.scholarslate.repository;

import com.nmcnpm.scholarslate.entity.Topic;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TopicRepository extends JpaRepository<Topic, UUID> {

    // Lấy tất cả topic của user — dùng cho CRUD topic (UC02, UC03, UC04)
    List<Topic> findByUserId(UUID userId);

    // Lấy active topics — dùng cho Scheduler fetch arXiv (UC10)
    List<Topic> findByUserIdAndIsActiveTrue(UUID userId);

    // Lấy toàn bộ active topics trên hệ thống — dùng cho Main Pipeline Scheduler
    List<Topic> findByIsActiveTrue();

    // Kiểm tra trùng tên topic trong cùng user — unique constraint (user_id, name)
    boolean existsByUserIdAndName(UUID userId, String name);

    // Kiểm tra trùng tên khi update (bỏ qua chính nó)
    boolean existsByUserIdAndNameAndIdNot(UUID userId, String name, UUID id);

    // Đếm số topic của user — giới hạn tối đa 10 topic/user (kiểm soát tại Service)
    long countByUserId(UUID userId);

    Optional<Topic> findByIdAndUserId(UUID id, UUID userId);
}
