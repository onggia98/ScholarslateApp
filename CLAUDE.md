# Paper Tracker — Backend (Scholarslate)

## Stack
- Spring Boot 4.0.6, Java 21, PostgreSQL 16 (port 5433), app port 8081
- pgvector, JWT, Groq AI, HuggingFace embeddings

## Start server
cd backend/scholarslate && ./mvnw spring-boot:run

## Database
docker exec -it papertracker-postgres psql -U papertracker -d papertracker

## Admin credentials
Email: admin@papertracker.local | Password: admin123

## API Base URL
http://localhost:8081/api