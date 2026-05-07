# ============================================================
# Dockerfile — Paper Tracker Backend (Scholarslate)
# Multi-stage build: Maven build → JRE 21 slim runtime
# ============================================================

# ── Stage 1: Build ───────────────────────────────────────────
FROM eclipse-temurin:21-jdk-alpine AS build

WORKDIR /app

# Copy Maven wrapper và pom.xml trước để cache dependency layer
COPY mvnw pom.xml ./
COPY .mvn .mvn

# Download dependencies (layer này được cache nếu pom.xml không đổi)
RUN ./mvnw dependency:go-offline -q

# Copy source code và build
COPY src ./src
RUN ./mvnw package -DskipTests -q

# ── Stage 2: Runtime ─────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine AS runtime

WORKDIR /app

# Tạo user non-root để bảo mật
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy JAR từ stage build
# Artifact name: scholarslate-0.0.1-SNAPSHOT.jar
COPY --from=build /app/target/scholarslate-*.jar app.jar

RUN chown appuser:appgroup app.jar
USER appuser

# Railway inject PORT env var tự động (mặc định 8080)
EXPOSE 8080

# JVM flags tối ưu cho container:
# -XX:+UseContainerSupport   — đọc memory limit từ cgroup, không dùng RAM vật lý
# -XX:MaxRAMPercentage=75.0  — dùng tối đa 75% RAM được cấp phát
ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "-jar", "app.jar"]
