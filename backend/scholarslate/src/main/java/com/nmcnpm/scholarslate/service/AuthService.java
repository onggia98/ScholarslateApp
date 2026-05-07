package com.nmcnpm.scholarslate.service;

import com.nmcnpm.scholarslate.dto.auth.AuthResponse;
import com.nmcnpm.scholarslate.dto.auth.LoginRequest;
import com.nmcnpm.scholarslate.dto.auth.RegisterRequest;
import com.nmcnpm.scholarslate.entity.User;
import com.nmcnpm.scholarslate.exception.AppException;
import com.nmcnpm.scholarslate.repository.UserRepository;
import com.nmcnpm.scholarslate.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw AppException.conflict("Email already registered");
        }

        User user = User.builder()
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role("USER")
                .build();

        userRepository.save(user);

        String token = jwtUtil.generateToken(user.getId(), user.getRole());
        return buildAuthResponse(user, token);
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> AppException.badRequest("Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw AppException.badRequest("Invalid email or password");
        }

        String token = jwtUtil.generateToken(user.getId(), user.getRole());
        return buildAuthResponse(user, token);
    }

    private AuthResponse buildAuthResponse(User user, String token) {
        return AuthResponse.builder()
                .token(token)
                .userId(user.getId())
                .email(user.getEmail())
                .role(user.getRole())
                .build();
    }
}
