package com.nmcnpm.scholarslate.repository;

import com.nmcnpm.scholarslate.entity.PaperTopic;
import com.nmcnpm.scholarslate.entity.PaperTopicId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface PaperTopicRepository extends JpaRepository<PaperTopic, PaperTopicId> {

    boolean existsById(PaperTopicId id);

    // Insert idempotent — ON CONFLICT DO NOTHING tương đương
    // Dùng khi pipeline gán paper vào topic sau topic matching (UC12)
    @Query(value = """
            INSERT INTO paper_topic (paper_id, topic_id, created_at)
            VALUES (:paperId, :topicId, NOW())
            ON CONFLICT (paper_id, topic_id) DO NOTHING
            """, nativeQuery = true)
    @Modifying
    void insertIfNotExists(@Param("paperId") UUID paperId, @Param("topicId") UUID topicId);

    // Đếm số paper trong topic — dùng cho stats
    long countByIdTopicId(UUID topicId);
}
