package com.nmcnpm.scholarslate.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.*;

import java.io.Serializable;
import java.util.UUID;

/**
 * Composite Primary Key cho bảng paper_topic.
 * Implements Serializable — bắt buộc với @EmbeddedId.
 */
@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class PaperTopicId implements Serializable {

    @Column(name = "paper_id", nullable = false)
    private UUID paperId;

    @Column(name = "topic_id", nullable = false)
    private UUID topicId;
}
