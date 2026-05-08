package com.nmcnpm.scholarslate.entity;

import com.nmcnpm.scholarslate.converter.VectorUserType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Type;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "paper")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Paper {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(name = "arxiv_id", nullable = false, unique = true, length = 50)
    private String arxivId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String title;

    /**
     * Tên cột thực tế là "abstract" — tránh nhầm với keyword Java.
     * Dùng @Column(name = "abstract") để map đúng.
     */
    @Column(name = "abstract", columnDefinition = "TEXT")
    private String abstractText;

    @Column(columnDefinition = "TEXT")
    private String authors;

    @Column(name = "paper_url", length = 500)
    private String paperUrl;

    @Column(name = "pdf_url", length = 500)
    private String pdfUrl;

    @Column(columnDefinition = "TEXT")
    private String summary;

    /**
     * NULL cho phép vì PENDING và DONE-duplicate không có score.
     * Khi có giá trị phải nằm trong [0.0, 10.0] — enforced bởi CHECK constraint trong DB.
     */
    @Column(name = "quality_score")
    private Float qualityScore;

    /**
     * vector(384) — tương ứng model sentence-transformers/all-MiniLM-L6-v2.
     * Dùng VectorUserType (PGobject) để map float[] ↔ PostgreSQL vector.
     * PGobject.type="vector" cho phép PostgreSQL JDBC driver gửi đúng OID,
     * tránh lỗi "column is of type vector but expression is of type character varying".
     */
    @Type(VectorUserType.class)
    @Column(columnDefinition = "vector(384)")
    private float[] embedding;

    @Column(name = "is_duplicate", nullable = false)
    @Builder.Default
    private Boolean isDuplicate = false;

    /**
     * FK tự tham chiếu — paper gốc khi is_duplicate = true.
     * ON DELETE SET NULL — xem V3 migration.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "original_paper_id")
    private Paper originalPaper;

    /**
     * Trạng thái pipeline AI: "PENDING" | "DONE" | "FAILED"
     * enforced bởi CHECK constraint trong DB.
     */
    @Column(name = "processing_status", nullable = false, length = 10)
    @Builder.Default
    private String processingStatus = "PENDING";

    @Column(name = "retry_count", nullable = false)
    @Builder.Default
    private Integer retryCount = 0;

    @Column(name = "last_error", columnDefinition = "TEXT")
    private String lastError;

    /**
     * Timestamp lần Retry Scheduler xử lý gần nhất.
     * NULL nếu chưa từng retry. Dùng cho admin diagnostic (UC17).
     */
    @Column(name = "last_retry_at", columnDefinition = "TIMESTAMP WITH TIME ZONE")
    private OffsetDateTime lastRetryAt;

    @Column(name = "published_at", columnDefinition = "TIMESTAMP WITH TIME ZONE")
    private OffsetDateTime publishedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false,
            columnDefinition = "TIMESTAMP WITH TIME ZONE")
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false,
            columnDefinition = "TIMESTAMP WITH TIME ZONE")
    private OffsetDateTime updatedAt;

    /**
     * Topics liên kết với paper — join qua bảng PAPER_TOPIC.
     * FetchType.LAZY để tránh N+1 khi chỉ cần paper info.
     * PaperService fetch riêng khi cần topic names.
     */
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "paper_topic",
            joinColumns = @JoinColumn(name = "paper_id"),
            inverseJoinColumns = @JoinColumn(name = "topic_id")
    )
    @Builder.Default
    private List<Topic> topics = new ArrayList<>();
}
