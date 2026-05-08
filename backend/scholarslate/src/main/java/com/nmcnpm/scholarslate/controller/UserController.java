package com.nmcnpm.scholarslate.controller;

import com.nmcnpm.scholarslate.dto.common.ApiResponse;
import com.nmcnpm.scholarslate.dto.user.ChangePasswordRequest;
import com.nmcnpm.scholarslate.dto.user.UserProfileResponse;
import com.nmcnpm.scholarslate.entity.User;
import com.nmcnpm.scholarslate.exception.AppException;
import com.nmcnpm.scholarslate.repository.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * UC profile — xem và cập nhật thông tin tài khoản hiện tại.
 * Tất cả endpoints yêu cầu JWT (bảo vệ bởi SecurityConfig).
 */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    /**
     * GET /api/users/me — lấy thông tin profile của user đang đăng nhập.
     * Authentication.getName() trả về userId (UUID string) — set bởi JwtAuthenticationFilter.
     */
    @GetMapping("/me")
    @Transactional(readOnly = true)
    public ApiResponse<UserProfileResponse> getProfile(Authentication auth) {
        User user = findCurrentUser(auth);
        return ApiResponse.ok(UserProfileResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .role(user.getRole())
                .createdAt(user.getCreatedAt())
                .build());
    }

    /**
     * PATCH /api/users/me/password — đổi mật khẩu.
     * Xác nhận mật khẩu cũ trước khi cho phép đổi.
     */
    @PatchMapping("/me/password")
    @Transactional
    public ApiResponse<Void> changePassword(
            Authentication auth,
            @Valid @RequestBody ChangePasswordRequest request) {

        User user = findCurrentUser(auth);

        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
            throw AppException.badRequest("Current password is incorrect");
        }

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);

        return ApiResponse.ok("Password changed successfully");
    }

    private User findCurrentUser(Authentication auth) {
        UUID userId = UUID.fromString(auth.getName());
        return userRepository.findById(userId)
                .orElseThrow(() -> AppException.notFound("User not found"));
    }
}
