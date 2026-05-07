package com.nmcnpm.scholarslate.security;

import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity          // Cho phép dùng @PreAuthorize trên method
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final UserDetailsServiceImpl userDetailsService;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            // Tắt CSRF — không cần với stateless JWT API
            .csrf(AbstractHttpConfigurer::disable)

            // CORS — Spring Security detect CorsFilter bean tự động
            .cors(cors -> cors.configurationSource(request -> {
                CorsConfiguration config = new CorsConfiguration();
                // FRONTEND_URL được set qua env var khi deploy (Railway/Vercel URL)
                String frontendUrl = System.getenv("FRONTEND_URL");
                List<String> origins = frontendUrl != null && !frontendUrl.isBlank()
                    ? List.of("http://localhost:5173", "http://localhost:3000", frontendUrl)
                    : List.of("http://localhost:5173", "http://localhost:3000");
                config.setAllowedOrigins(origins);
                config.setAllowedMethods(List.of("GET","POST","PUT","DELETE","PATCH","OPTIONS"));
                config.setAllowedHeaders(List.of("*"));
                config.setAllowCredentials(true);
                config.setMaxAge(3600L);
                return config;
            }))

            // Stateless — không tạo session
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            .authorizeHttpRequests(auth -> auth
                // Preflight OPTIONS request — browser gửi trước CORS request, phải permitAll
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                // Actuator health check — Railway cần gọi mà không cần token
                .requestMatchers("/api/actuator/health").permitAll()

                // Public endpoints — không cần token
                .requestMatchers("/api/auth/**").permitAll()

                // Admin endpoints — chỉ ADMIN
                .requestMatchers("/api/admin/**").hasRole("ADMIN")

                // Tất cả endpoints còn lại yêu cầu đăng nhập
                .anyRequest().authenticated()
            )

            .exceptionHandling(ex -> ex
                // 401 — không có token hoặc token không hợp lệ
                .authenticationEntryPoint((request, response, authException) -> {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    response.setContentType("application/json");
                    response.getWriter().write(
                        "{\"success\":false,\"message\":\"Unauthorized\",\"data\":null}");
                })
                // 403 — đã xác thực nhưng không đủ quyền (e.g. USER gọi endpoint ADMIN)
                .accessDeniedHandler((request, response, accessDeniedException) -> {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType("application/json");
                    response.getWriter().write(
                        "{\"success\":false,\"message\":\"Forbidden\",\"data\":null}");
                })
            )

            // Thêm JWT filter trước UsernamePasswordAuthenticationFilter
            .addFilterBefore(jwtAuthenticationFilter,
                UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * CorsFilter bean — Spring Security tự động detect và áp dụng trước các security filter.
     * FRONTEND_URL env var được set trên Railway/Vercel để cho phép production domain.
     */
    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        String frontendUrl = System.getenv("FRONTEND_URL");
        List<String> origins = frontendUrl != null && !frontendUrl.isBlank()
            ? List.of("http://localhost:5173", "http://localhost:3000", frontendUrl)
            : List.of("http://localhost:5173", "http://localhost:3000");
        config.setAllowedOrigins(origins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }

    @Bean
    public AuthenticationProvider authenticationProvider() {
        // Spring Security 6.x: constructor nhận UserDetailsService trực tiếp
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    /**
     * BCrypt cost=10 — chuẩn cho production.
     * Hash được seed sẵn trong V5__seed_admin.sql.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }
}
