package com.nmcnpm.scholarslate.repository;

import com.nmcnpm.scholarslate.entity.Paper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PaperRepository extends JpaRepository<Paper, UUID> {

    // Kiểm tra arxiv_id đã tồn tại chưa — dùng trước khi insert (pipeline)
    boolean existsByArxivId(String arxivId);

    Optional<Paper> findByArxivId(String arxivId);

    // Danh sách paper DONE (không duplicate) — API list mặc định (UC05)
    Page<Paper> findByProcessingStatusAndIsDuplicateFalse(
            String processingStatus, Pageable pageable);

    // Lọc paper DONE theo topic — dùng cho UC05 filter by topic
    @Query("""
            SELECT p FROM Paper p
            JOIN PaperTopic pt ON pt.paper = p
            WHERE pt.topic.id = :topicId
            AND p.processingStatus = 'DONE'
            AND p.isDuplicate = false
            """)
    Page<Paper> findDonePapersByTopicId(@Param("topicId") UUID topicId, Pageable pageable);

    // Full-text search — UC05, dùng GIN index idx_paper_fts_search (title+abstract+authors)
    // plainto_tsquery: AND logic, hỗ trợ tìm theo tên tác giả
    @Query(value = """
            SELECT * FROM paper
            WHERE processing_status = 'DONE'
            AND is_duplicate = false
            AND to_tsvector('english',
                coalesce(title,'') || ' ' || coalesce(abstract,'') || ' ' || coalesce(authors,''))
                @@ plainto_tsquery('english', :keyword)
            ORDER BY published_at DESC
            """,
            countQuery = """
            SELECT count(*) FROM paper
            WHERE processing_status = 'DONE'
            AND is_duplicate = false
            AND to_tsvector('english',
                coalesce(title,'') || ' ' || coalesce(abstract,'') || ' ' || coalesce(authors,''))
                @@ plainto_tsquery('english', :keyword)
            """,
            nativeQuery = true)
    Page<Paper> fullTextSearch(@Param("keyword") String keyword, Pageable pageable);

    // Duplicate detection — cosine distance < 0.05 (similarity > 0.95) trong 90 ngày
    // <=> là cosine distance operator của pgvector (0 = identical, 1 = orthogonal)
    @Query(value = """
            SELECT * FROM paper
            WHERE processing_status = 'DONE'
            AND is_duplicate = false
            AND id != :excludeId
            AND published_at >= :windowStart
            AND embedding IS NOT NULL
            AND embedding <=> CAST(:embedding AS vector) < 0.05
            ORDER BY embedding <=> CAST(:embedding AS vector)
            LIMIT 1
            """, nativeQuery = true)
    Optional<Paper> findDuplicate(
            @Param("excludeId") UUID excludeId,
            @Param("embedding") String embedding,
            @Param("windowStart") OffsetDateTime windowStart);

    // Recommendation — top 10 papers gần nhất, distance < 0.5 (similarity > 50%)
    // ef_search=128 được set global qua HikariCP connection-init-sql
    @Query(value = """
            SELECT * FROM paper
            WHERE processing_status = 'DONE'
            AND is_duplicate = false
            AND id != :paperId
            AND published_at >= :oneYearAgo
            AND embedding IS NOT NULL
            AND embedding <=> CAST(:embedding AS vector) < 0.5
            ORDER BY embedding <=> CAST(:embedding AS vector)
            LIMIT :maxResults
            """, nativeQuery = true)
    List<Paper> findRecommendations(
            @Param("paperId") UUID paperId,
            @Param("embedding") String embedding,
            @Param("oneYearAgo") OffsetDateTime oneYearAgo,
            @Param("maxResults") int maxResults);

    // Retry Scheduler — FAILED papers chưa vượt quá 3 lần retry (UC17)
    @Query("SELECT p FROM Paper p WHERE p.processingStatus = 'FAILED' AND p.retryCount < :maxRetries")
    List<Paper> findFailedPapersForRetry(@Param("maxRetries") int maxRetries);

    // Topic matching — UC12, dùng GIN index idx_paper_fts_topic (title+abstract only)
    // phraseto_tsquery: exact phrase match — keyword topic là chủ đề, không phải tên người
    @Query(value = """
            SELECT COUNT(*) > 0 FROM paper
            WHERE id = :paperId
            AND to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,''))
                @@ phraseto_tsquery('english', :keyword)
            """, nativeQuery = true)
    boolean matchesTopic(@Param("paperId") UUID paperId, @Param("keyword") String keyword);

    // Trend statistics — UC15, tính động theo tháng (YYYY-MM), giới hạn 2 năm
    // Không dùng bảng statistics riêng — tính trực tiếp từ PAPER và PAPER_TOPIC
    @Query(value = """
            SELECT TO_CHAR(p.published_at, 'YYYY-MM') AS month, COUNT(p.id) AS count
            FROM paper p
            JOIN paper_topic pt ON pt.paper_id = p.id
            WHERE pt.topic_id = :topicId
            AND p.published_at >= :since
            AND p.processing_status = 'DONE'
            AND p.is_duplicate = false
            GROUP BY TO_CHAR(p.published_at, 'YYYY-MM')
            ORDER BY month ASC
            """, nativeQuery = true)
    List<Object[]> findTrendStats(
            @Param("topicId") UUID topicId,
            @Param("since") OffsetDateTime since);

    // Admin — xem paper FAILED (UC17)
    Page<Paper> findByProcessingStatus(String processingStatus, Pageable pageable);

    // Admin — reset 1 paper FAILED: giữ status=FAILED, chỉ reset retryCount để RetryScheduler pick up lại
    @Modifying
    @Query("UPDATE Paper p SET p.retryCount = 0, p.lastError = null WHERE p.id = :id AND p.processingStatus = 'FAILED'")
    int resetFailedPaper(@Param("id") UUID id);

    // Admin — bulk reset TẤT CẢ paper FAILED: giữ status=FAILED, reset retryCount=0
    // RetryScheduler tìm theo processingStatus='FAILED' AND retryCount < MAX_RETRIES — phải giữ FAILED
    @Modifying
    @Query("UPDATE Paper p SET p.retryCount = 0, p.lastError = null WHERE p.processingStatus = 'FAILED'")
    int resetAllFailedPapers();
}
