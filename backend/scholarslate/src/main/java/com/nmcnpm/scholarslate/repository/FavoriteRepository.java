package com.nmcnpm.scholarslate.repository;

import com.nmcnpm.scholarslate.entity.Favorite;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface FavoriteRepository extends JpaRepository<Favorite, UUID> {

    // Kiểm tra paper đã được favorite chưa — unique constraint (user_id, paper_id)
    boolean existsByUserIdAndPaperId(UUID userId, UUID paperId);

    Optional<Favorite> findByUserIdAndPaperId(UUID userId, UUID paperId);

    // Danh sách favorite của user — UC08
    Page<Favorite> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    // Bỏ lưu favorite — UC09, user_id lấy từ JWT (không nhận từ client)
    @Modifying
    @Query("DELETE FROM Favorite f WHERE f.user.id = :userId AND f.paper.id = :paperId")
    int deleteByUserIdAndPaperId(@Param("userId") UUID userId, @Param("paperId") UUID paperId);
}
