#!/bin/bash
# monitor.sh - 서버 상태 모니터링

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "======================================"
echo "   Tojvs Server Monitoring"
echo "======================================"

# 1. 프로세스 상태
echo -e "\n${YELLOW}[1] Process Status${NC}"
pm2 list

# 2. 메모리 사용량
echo -e "\n${YELLOW}[2] Memory Usage${NC}"
pm2 info tojvs-backend | grep -E "memory|heap"

# 3. API 헬스체크
echo -e "\n${YELLOW}[3] API Health Check${NC}"
HEALTH=$(curl -s http://localhost:3001/api/health)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ API is healthy${NC}"
    echo $HEALTH | jq '.'
else
    echo -e "${RED}✗ API is not responding${NC}"
fi

# 4. 데이터베이스 상태
echo -e "\n${YELLOW}[4] Database Status${NC}"
if [ -f backend/database.db ]; then
    DB_SIZE=$(du -h backend/database.db | cut -f1)
    echo -e "${GREEN}✓ Database exists (Size: $DB_SIZE)${NC}"
    
    # 테이블 레코드 수 확인
    sqlite3 backend/database.db "SELECT 'Users:', COUNT(*) FROM users;"
    sqlite3 backend/database.db "SELECT 'Kanban Cards:', COUNT(*) FROM kanban_cards;"
    sqlite3 backend/database.db "SELECT 'Voice Commands:', COUNT(*) FROM voice_commands;"
else
    echo -e "${RED}✗ Database not found${NC}"
fi

# 5. 로그 에러 체크
echo -e "\n${YELLOW}[5] Recent Errors (Last 10)${NC}"
pm2 logs tojvs-backend --err --lines 10 --nostream

# 6. 활성 연결 수
echo -e "\n${YELLOW}[6] Active Connections${NC}"
netstat -an | grep :3001 | grep ESTABLISHED | wc -l

echo -e "\n======================================"