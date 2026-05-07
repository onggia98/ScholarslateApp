package com.nmcnpm.scholarslate.exception;

import org.springframework.http.HttpStatus;

/**
 * Base exception cho toàn bộ ứng dụng.
 * Được @ControllerAdvice bắt và trả về HTTP status tương ứng.
 */
public class AppException extends RuntimeException {

    private final HttpStatus status;

    public AppException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }

    // Factory methods tiện dụng
    public static AppException notFound(String message) {
        return new AppException(HttpStatus.NOT_FOUND, message);
    }

    public static AppException badRequest(String message) {
        return new AppException(HttpStatus.BAD_REQUEST, message);
    }

    public static AppException conflict(String message) {
        return new AppException(HttpStatus.CONFLICT, message);
    }

    public static AppException forbidden(String message) {
        return new AppException(HttpStatus.FORBIDDEN, message);
    }
}
