#!/bin/bash
# ============================================================
# test-api.sh — Test tất cả endpoints của Paper Tracker API
# Chạy: chmod +x test-api.sh && ./test-api.sh
# ============================================================

BASE="https://scholarslateapp-production.up.railway.app/api"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass=0; fail=0

check() {
  local label="$1"
  local status="$2"
  local body="$3"
  local expect="${4:-200}"

  if [ "$status" = "$expect" ]; then
    echo -e "${GREEN}✅ PASS${NC} [$status] $label"
    ((pass++))
  else
    echo -e "${RED}❌ FAIL${NC} [$status] $label"
    echo "   Body: $(echo "$body" | head -c 200)"
    ((fail++))
  fi
}

echo "======================================================"
echo " Paper Tracker API Test — $BASE"
echo "======================================================"

# ── 1. HEALTH CHECK ───────────────────────────────────────
echo -e "\n${YELLOW}── Health ──${NC}"
R=$(curl -s -o /tmp/b -w "%{http_code}" "$BASE/actuator/health")
check "GET /actuator/health" "$R" "$(cat /tmp/b)"

# ── 2. AUTH ───────────────────────────────────────────────
echo -e "\n${YELLOW}── Auth ──${NC}"

# Register (có thể 400 nếu email đã tồn tại — đó là đúng)
R=$(curl -s -o /tmp/b -w "%{http_code}" -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@test.com","password":"Test1234!"}')
B=$(cat /tmp/b)
if [ "$R" = "200" ] || [ "$R" = "201" ] || [ "$R" = "400" ]; then
  echo -e "${GREEN}✅ PASS${NC} [$R] POST /auth/register (200/201=tạo mới, 400=email đã tồn tại)"
  ((pass++))
else
  echo -e "${RED}❌ FAIL${NC} [$R] POST /auth/register"
  echo "   Body: $(echo "$B" | head -c 200)"
  ((fail++))
fi

# Login user
R=$(curl -s -o /tmp/b -w "%{http_code}" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@test.com","password":"Test1234!"}')
B=$(cat /tmp/b)
check "POST /auth/login (user)" "$R" "$B"
TOKEN=$(echo "$B" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo -e "   ${RED}Không lấy được token — thử login lại với admin${NC}"
  R=$(curl -s -o /tmp/b -w "%{http_code}" -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@papertracker.local","password":"admin123"}')
  B=$(cat /tmp/b)
  TOKEN=$(echo "$B" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null)
  echo "   Admin token: ${TOKEN:0:30}..."
fi

AUTH="Authorization: Bearer $TOKEN"

# Login admin
R=$(curl -s -o /tmp/b -w "%{http_code}" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@papertracker.local","password":"admin123"}')
B=$(cat /tmp/b)
check "POST /auth/login (admin)" "$R" "$B"
ADMIN_TOKEN=$(echo "$B" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null)
ADMIN_AUTH="Authorization: Bearer $ADMIN_TOKEN"

# ── 3. TOPICS ─────────────────────────────────────────────
echo -e "\n${YELLOW}── Topics ──${NC}"

R=$(curl -s -o /tmp/b -w "%{http_code}" "$BASE/topics" -H "$AUTH")
check "GET /topics" "$R" "$(cat /tmp/b)"

R=$(curl -s -o /tmp/b -w "%{http_code}" -X POST "$BASE/topics" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"AI Research","keywords":"machine learning,deep learning","isActive":true}')
B=$(cat /tmp/b)
check "POST /topics" "$R" "$B" "200"
TOPIC_ID=$(echo "$B" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)

if [ -n "$TOPIC_ID" ]; then
  R=$(curl -s -o /tmp/b -w "%{http_code}" -X PUT "$BASE/topics/$TOPIC_ID" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"name":"AI Research Updated","keywords":"nlp,transformers","isActive":true}')
  check "PUT /topics/{id}" "$R" "$(cat /tmp/b)"

  R=$(curl -s -o /tmp/b -w "%{http_code}" -X DELETE "$BASE/topics/$TOPIC_ID" \
    -H "$AUTH")
  check "DELETE /topics/{id}" "$R" "$(cat /tmp/b)"
fi

# ── 4. PAPERS ─────────────────────────────────────────────
echo -e "\n${YELLOW}── Papers ──${NC}"

R=$(curl -s -o /tmp/b -w "%{http_code}" "$BASE/papers" -H "$AUTH")
B=$(cat /tmp/b)
check "GET /papers" "$R" "$B"
PAPER_ID=$(echo "$B" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',{}).get('content',[]); print(items[0]['id'] if items else '')" 2>/dev/null)

R=$(curl -s -o /tmp/b -w "%{http_code}" "$BASE/papers/search?q=machine+learning" -H "$AUTH")
check "GET /papers/search?q=machine+learning" "$R" "$(cat /tmp/b)"

R=$(curl -s -o /tmp/b -w "%{http_code}" "$BASE/papers/favorites" -H "$AUTH")
check "GET /papers/favorites" "$R" "$(cat /tmp/b)"

if [ -n "$PAPER_ID" ]; then
  R=$(curl -s -o /tmp/b -w "%{http_code}" "$BASE/papers/$PAPER_ID" -H "$AUTH")
  check "GET /papers/{id}" "$R" "$(cat /tmp/b)"

  R=$(curl -s -o /tmp/b -w "%{http_code}" "$BASE/papers/$PAPER_ID/recommendations" -H "$AUTH")
  check "GET /papers/{id}/recommendations" "$R" "$(cat /tmp/b)"

  R=$(curl -s -o /tmp/b -w "%{http_code}" -X POST "$BASE/papers/$PAPER_ID/favorite" -H "$AUTH")
  check "POST /papers/{id}/favorite" "$R" "$(cat /tmp/b)"

  R=$(curl -s -o /tmp/b -w "%{http_code}" -X DELETE "$BASE/papers/$PAPER_ID/favorite" -H "$AUTH")
  check "DELETE /papers/{id}/favorite" "$R" "$(cat /tmp/b)"
else
  echo -e "   ${YELLOW}⚠ Chưa có paper nào trong DB — skip paper detail tests${NC}"
fi

# ── 5. NOTIFICATIONS ──────────────────────────────────────
echo -e "\n${YELLOW}── Notifications ──${NC}"

R=$(curl -s -o /tmp/b -w "%{http_code}" "$BASE/notifications" -H "$AUTH")
check "GET /notifications" "$R" "$(cat /tmp/b)"

R=$(curl -s -o /tmp/b -w "%{http_code}" "$BASE/notifications/unread-count" -H "$AUTH")
check "GET /notifications/unread-count" "$R" "$(cat /tmp/b)"

R=$(curl -s -o /tmp/b -w "%{http_code}" -X PATCH "$BASE/notifications/read-all" -H "$AUTH")
check "PATCH /notifications/read-all" "$R" "$(cat /tmp/b)"

# ── 6. ADMIN ──────────────────────────────────────────────
echo -e "\n${YELLOW}── Admin ──${NC}"

R=$(curl -s -o /tmp/b -w "%{http_code}" "$BASE/admin/stats/trend" -H "$ADMIN_AUTH")
check "GET /admin/stats/trend" "$R" "$(cat /tmp/b)"

R=$(curl -s -o /tmp/b -w "%{http_code}" "$BASE/admin/papers/failed" -H "$ADMIN_AUTH")
check "GET /admin/papers/failed" "$R" "$(cat /tmp/b)"

R=$(curl -s -o /tmp/b -w "%{http_code}" -X POST "$BASE/admin/pipeline/retry" -H "$ADMIN_AUTH")
check "POST /admin/pipeline/retry" "$R" "$(cat /tmp/b)"

# ── 7. AUTH PROTECTION ────────────────────────────────────
echo -e "\n${YELLOW}── Auth Protection (phải trả 401) ──${NC}"

R=$(curl -s -o /tmp/b -w "%{http_code}" "$BASE/topics")
check "GET /topics without token → 401" "$R" "$(cat /tmp/b)" "401"

R=$(curl -s -o /tmp/b -w "%{http_code}" "$BASE/admin/stats/trend" -H "$AUTH")
check "GET /admin/stats/trend with USER token → 403" "$R" "$(cat /tmp/b)" "403"

# ── SUMMARY ───────────────────────────────────────────────
echo ""
echo "======================================================"
echo -e " Kết quả: ${GREEN}$pass PASS${NC} | ${RED}$fail FAIL${NC}"
echo "======================================================"
