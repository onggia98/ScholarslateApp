package com.nmcnpm.scholarslate.controller;

import com.nmcnpm.scholarslate.dto.common.ApiResponse;
import com.nmcnpm.scholarslate.dto.topic.TopicRequest;
import com.nmcnpm.scholarslate.dto.topic.TopicResponse;
import com.nmcnpm.scholarslate.service.TopicService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/topics")
@RequiredArgsConstructor
public class TopicController {

    private final TopicService topicService;

    // UC02 — Xem danh sách topic
    @GetMapping
    public ApiResponse<List<TopicResponse>> getTopics(
            @AuthenticationPrincipal UUID userId) {
        return ApiResponse.ok(topicService.getTopics(userId));
    }

    // UC02 — Xem chi tiết topic
    @GetMapping("/{id}")
    public ApiResponse<TopicResponse> getTopic(
            @PathVariable UUID id,
            @AuthenticationPrincipal UUID userId) {
        return ApiResponse.ok(topicService.getTopic(id, userId));
    }

    // UC03 — Tạo topic mới
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<TopicResponse> createTopic(
            @Valid @RequestBody TopicRequest request,
            @AuthenticationPrincipal UUID userId) {
        return ApiResponse.ok(topicService.createTopic(request, userId));
    }

    // UC04 — Cập nhật topic
    @PutMapping("/{id}")
    public ApiResponse<TopicResponse> updateTopic(
            @PathVariable UUID id,
            @Valid @RequestBody TopicRequest request,
            @AuthenticationPrincipal UUID userId) {
        return ApiResponse.ok(topicService.updateTopic(id, request, userId));
    }

    // UC04 — Xóa topic (hard delete, cascade paper_topic)
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTopic(
            @PathVariable UUID id,
            @AuthenticationPrincipal UUID userId) {
        topicService.deleteTopic(id, userId);
    }
}
