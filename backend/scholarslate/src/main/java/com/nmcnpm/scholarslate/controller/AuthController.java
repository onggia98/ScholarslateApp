package com.nmcnpm.scholarslate.controller;

import com.nmcnpm.scholarslate.dto.auth.AuthResponse;
import com.nmcnpm.scholarslate.dto.auth.LoginRequest;
import com.nmcnpm.scholarslate.dto.auth.RegisterRequest;
import com.nmcnpm.scholarslate.dto.common.ApiResponse;
import com.nmcnpm.scholarslate.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    // UC01 — Đăng ký
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ApiResponse.ok(authService.register(request));
    }

    // UC01 — Đăng nhập
    @PostMapping("/login")
    public ApiResponse<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.ok(authService.login(request));
    }
}
