#!/bin/bash
# Socket Connection Test Script
# 소켓 연결 문제를 진단하기 위한 스크립트

echo "🔍 tojvs Socket Connection Debugger"
echo "===================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if backend is running
echo "1. Backend 서버 상태 확인..."
if curl -s http://localhost:3001/api/health > /dev/null; then
    echo -e "${GREEN}✓ Backend 서버가 실행 중입니다${NC}"
    curl -s http://localhost:3001/api/health | python3 -m json.tool
else
    echo -e "${RED}✗ Backend 서버에 연결할 수 없습니다${NC}"
    echo "  → backend 디렉토리에서 'npm start'를 실행하세요"
    exit 1
fi

echo ""
echo "2. Frontend 서버 상태 확인..."
if curl -s http://localhost:3000 > /dev/null; then
    echo -e "${GREEN}✓ Frontend 서버가 실행 중입니다${NC}"
else
    echo -e "${YELLOW}⚠ Frontend 서버에 연결할 수 없습니다${NC}"
    echo "  → frontend 디렉토리에서 'npm start'를 실행하세요"
fi

echo ""
echo "3. Socket.io 연결 테스트..."
# Test socket connection with node script
cat > /tmp/socket-test.js << 'EOF'
const io = require('socket.io-client');

// Test without auth first
console.log('Testing socket connection without auth...');
const socket1 = io('http://localhost:3001', {
    transports: ['websocket', 'polling'],
    reconnection: false
});

socket1.on('connect_error', (error) => {
    console.log('Expected auth error:', error.message);
    socket1.disconnect();
    
    // Now test with mock token
    console.log('\nTesting with mock token...');
    const jwt = require('jsonwebtoken');
    const mockToken = jwt.sign(
        { id: 1, username: 'test' },
        'development-secret-key',
        { expiresIn: '1h' }
    );
    
    const socket2 = io('http://localhost:3001', {
        auth: { token: mockToken },
        transports: ['websocket', 'polling']
    });
    
    socket2.on('connect', () => {
        console.log('✓ Socket connected successfully!');
        console.log('Socket ID:', socket2.id);
        socket2.disconnect();
        process.exit(0);
    });
    
    socket2.on('connect_error', (error) => {
        console.error('✗ Socket connection failed:', error.message);
        process.exit(1);
    });
});

setTimeout(() => {
    console.error('Timeout: Connection test took too long');
    process.exit(1);
}, 5000);
EOF

# Check if required packages are installed
if [ ! -d "node_modules/socket.io-client" ]; then
    echo -e "${YELLOW}Installing socket.io-client for testing...${NC}"
    npm install socket.io-client jsonwebtoken --no-save 2>/dev/null
fi

node /tmp/socket-test.js

echo ""
echo "4. 포트 사용 현황 확인..."
echo "Port 3000 (Frontend):"
lsof -i :3000 2>/dev/null | grep LISTEN || echo "  포트 3000이 사용되지 않음"
echo ""
echo "Port 3001 (Backend):"
lsof -i :3001 2>/dev/null | grep LISTEN || echo "  포트 3001이 사용되지 않음"

echo ""
echo "5. 환경 변수 확인..."
echo "Backend .env 파일:"
if [ -f "backend/.env" ]; then
    echo -e "${GREEN}✓ backend/.env 파일 존재${NC}"
    grep -E "^(PORT|NODE_ENV|N8N_WEBHOOK_URL)" backend/.env 2>/dev/null || echo "  주요 설정이 없음"
else
    echo -e "${YELLOW}⚠ backend/.env 파일이 없습니다${NC}"
    echo "  → backend/.env.example을 복사하여 .env 파일을 생성하세요"
fi

echo ""
echo "Frontend .env 파일:"
if [ -f "frontend/.env" ] || [ -f "frontend/.env.local" ]; then
    echo -e "${GREEN}✓ Frontend 환경 파일 존재${NC}"
else
    echo -e "${YELLOW}⚠ frontend/.env 또는 .env.local 파일이 없습니다${NC}"
    echo "  → frontend/.env.example을 복사하여 .env.local 파일을 생성하세요"
fi

echo ""
echo "===================================="
echo "진단 완료!"
echo ""
echo "문제 해결 팁:"
echo "1. 두 서버가 모두 실행 중인지 확인하세요"
echo "2. 환경 변수 파일이 올바르게 설정되었는지 확인하세요"
echo "3. 방화벽이 포트를 차단하지 않는지 확인하세요"
echo "4. 브라우저 콘솔에서 에러 메시지를 확인하세요"
echo ""
echo "여전히 문제가 있다면:"
echo "- Backend 로그 확인: backend 디렉토리에서 서버 로그 확인"
echo "- Frontend 콘솔 확인: 브라우저 개발자 도구 > Console"
echo "- Network 탭 확인: WebSocket 연결 상태 확인"