package com.nmcnpm.scholarslate.service;

import com.nmcnpm.scholarslate.dto.topic.TopicRequest;
import com.nmcnpm.scholarslate.dto.topic.TopicResponse;
import com.nmcnpm.scholarslate.entity.Topic;
import com.nmcnpm.scholarslate.entity.User;
import com.nmcnpm.scholarslate.exception.AppException;
import com.nmcnpm.scholarslate.mapper.TopicMapper;
import com.nmcnpm.scholarslate.repository.TopicRepository;
import com.nmcnpm.scholarslate.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TopicService {

    private final TopicRepository topicRepository;
    private final UserRepository userRepository;
    private final TopicMapper topicMapper;

    @Value("${limits.max-topics-per-user:10}")
    private int maxTopicsPerUser;

    @Value("${limits.max-keywords-per-topic:5}")
    private int maxKeywordsPerTopic;

    @Transactional(readOnly = true)
    public List<TopicResponse> getTopics(UUID userId) {
        return topicRepository.findByUserId(userId).stream()
                .map(topicMapper::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public TopicResponse getTopic(UUID topicId, UUID userId) {
        return topicMapper.toResponse(findTopicByIdAndUser(topicId, userId));
    }

    @Transactional
    public TopicResponse createTopic(TopicRequest request, UUID userId) {
        // Kiểm tra giới hạn 10 topic/user
        if (topicRepository.countByUserId(userId) >= maxTopicsPerUser) {
            throw AppException.badRequest("Maximum " + maxTopicsPerUser + " topics per user");
        }

        // Kiểm tra tên trùng trong cùng user
        if (topicRepository.existsByUserIdAndName(userId, request.getName())) {
            throw AppException.conflict("Topic name already exists");
        }

        String keywords = normalizeKeywords(request.getKeywords());

        User user = userRepository.getReferenceById(userId);
        Topic topic = Topic.builder()
                .name(request.getName().trim())
                .keywords(keywords)
                .isActive(request.getIsActive() != null ? request.getIsActive() : true)
                .user(user)
                .build();

        // saveAndFlush — buộc Hibernate flush ngay để @CreationTimestamp/@UpdateTimestamp được populate
        return topicMapper.toResponse(topicRepository.saveAndFlush(topic));
    }

    @Transactional
    public TopicResponse updateTopic(UUID topicId, TopicRequest request, UUID userId) {
        Topic topic = findTopicByIdAndUser(topicId, userId);

        // Kiểm tra tên trùng (bỏ qua chính nó)
        if (topicRepository.existsByUserIdAndNameAndIdNot(userId, request.getName(), topicId)) {
            throw AppException.conflict("Topic name already exists");
        }

        topic.setName(request.getName().trim());
        topic.setKeywords(normalizeKeywords(request.getKeywords()));
        if (request.getIsActive() != null) {
            topic.setIsActive(request.getIsActive());
        }

        return topicMapper.toResponse(topicRepository.saveAndFlush(topic));
    }

    @Transactional
    public void deleteTopic(UUID topicId, UUID userId) {
        Topic topic = findTopicByIdAndUser(topicId, userId);
        // Hard delete — PAPER_TOPIC bị xóa cascade, PAPER giữ nguyên
        topicRepository.delete(topic);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private Topic findTopicByIdAndUser(UUID topicId, UUID userId) {
        return topicRepository.findByIdAndUserId(topicId, userId)
                .orElseThrow(() -> AppException.notFound("Topic not found"));
    }

    /**
     * Chuẩn hóa keywords: trim, lowercase, loại bỏ rỗng, tối đa 5 keywords.
     * Định dạng lưu: "large language model,rag,vector database"
     */
    private String normalizeKeywords(String keywords) {
        if (keywords == null || keywords.isBlank()) return null;

        List<String> kws = Arrays.stream(keywords.split(","))
                .map(String::trim)
                .map(String::toLowerCase)
                .filter(k -> !k.isEmpty())
                .distinct()
                .toList();

        if (kws.size() > maxKeywordsPerTopic) {
            throw AppException.badRequest("Maximum " + maxKeywordsPerTopic + " keywords per topic");
        }

        return String.join(",", kws);
    }
}
