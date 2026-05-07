package com.nmcnpm.scholarslate.dto.topic;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class TopicRequest {

    @NotBlank(message = "Topic name is required")
    @Size(max = 255, message = "Topic name must not exceed 255 characters")
    private String name;

    /**
     * Comma-separated keywords, tối đa 5, tổng tối đa 255 ký tự.
     * Ví dụ: "large language model,rag,vector database"
     * Validation chi tiết (đếm số keyword) được thực hiện tại Service.
     */
    @Size(max = 255, message = "Keywords must not exceed 255 characters")
    private String keywords;

    private Boolean isActive = true;
}
