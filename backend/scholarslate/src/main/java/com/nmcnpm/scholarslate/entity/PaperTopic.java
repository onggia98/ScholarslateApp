package com.nmcnpm.scholarslate.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;

/**
 * Bảng liên kết nhiều-nhiều giữa Paper và Topic.
 * PK tổng hợp (paper_id, topic_id) — không có cột id riêng.
 * FK topic_id → TOPIC ON DELETE CASCADE.
 */
@Entity
@Table(name = "paper_topic")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaperTopic {

    @EmbeddedId
    private PaperTopicId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("paperId")
    @JoinColumn(name = "paper_id", nullable = false)
    private Paper paper;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("topicId")
    @JoinColumn(name = "topic_id", nullable = false)
    private Topic topic;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false,
            columnDefinition = "TIMESTAMP WITH TIME ZONE")
    private OffsetDateTime createdAt;
}
