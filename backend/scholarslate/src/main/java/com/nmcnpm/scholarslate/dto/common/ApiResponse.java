package com.nmcnpm.scholarslate.dto.common;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Wrapper chuẩn cho tất cả API response đơn lẻ.
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApiResponse<T> {

    private boolean success;
    private String message;
    private T data;

    public static <T> ApiResponse<T> ok(T data) {
        return ApiResponse.<T>builder().success(true).data(data).build();
    }

    public static <T> ApiResponse<T> ok(String message, T data) {
        return ApiResponse.<T>builder().success(true).message(message).data(data).build();
    }

    public static ApiResponse<Void> ok(String message) {
        return ApiResponse.<Void>builder().success(true).message(message).build();
    }

    public static ApiResponse<Void> error(String message) {
        return ApiResponse.<Void>builder().success(false).message(message).build();
    }
}
