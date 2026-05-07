package com.nmcnpm.scholarslate.mapper;

import com.nmcnpm.scholarslate.dto.topic.TopicResponse;
import com.nmcnpm.scholarslate.entity.Topic;
import org.springframework.stereotype.Component;

/**
 * Mapper thủ công cho Topic → TopicResponse.
 * Không dùng MapStruct để tránh vấn đề bean detection với Spring Boot 4.x.
 */
@Component
public class TopicMapper {

    public TopicResponse toResponse(Topic topic) {
        if (topic == null) return null;

        return TopicResponse.builder()
                .id(topic.getId())
                .name(topic.getName())
                .keywords(topic.getKeywords())
                .isActive(topic.getIsActive())
                .createdAt(topic.getCreatedAt())
                .updatedAt(topic.getUpdatedAt())
                .build();
    }
}
