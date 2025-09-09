# 🔧 tojvs 소켓 연결 문제 해결 가이드

## 📋 체크리스트

### 1. 환경 설정 파일 확인
```bash
# Backend 환경 설정
cd backend
cp .env.example .env
# .env 파일을 열어 설정 확인

# Frontend 환경 설정
cd frontend
cp .env.example .env.local
# .env.local 파일을 열어 설정 확인
```

### 2. 서버 실행 순서
올바른 실행 순서가 중요합니다:

```bash
# 1. Backend 서버 먼저 실행
cd backend
npm install
npm start
# 포트 3001에서 실행 확인

# 2. 새 터미널에서 Frontend 실행
cd frontend
npm install
npm start
# 포트 3000에서 실행 확인
```

### 3. 포트 확인
```bash
# 포트 사용 확인
lsof -i :3000  # Frontend
lsof -i :3001  # Backend

# Windows에서는
netstat -an | findstr :3000
netstat -an | findstr :3001
```

### 4. 디버깅 스크립트 실행
```bash
chmod +x debug-socket.sh
./debug-socket.sh
```

## 🔍 일반적인 문제와 해결책

### 문제 1: "서버 연결 끊김" 메시지
**원인:**
- Backend 서버가 실행되지 않음
- 포트가 차단됨
- 토큰이 만료됨

**해결:**
1. Backend 서버가 실행 중인지 확인
2. `http://localhost:3001/api/health` 접속 테스트
3. 로그아웃 후 다시 로그인

### 문제 2: "Authentication error"
**원인:**
- JWT 토큰이 없거나 만료됨
- JWT_SECRET이 일치하지 않음

**해결:**
1. 로그아웃 후 다시 로그인
2. Backend의 JWT_SECRET 확인
3. localStorage 클리어: `localStorage.clear()`

### 문제 3: CORS 에러
**원인:**
- CORS 설정이 잘못됨
- 프로덕션/개발 환경 불일치

**해결:**
1. Backend의 CORS 설정 확인
2. Frontend URL이 허용 목록에 있는지 확인

### 문제 4: 소켓이 계속 재연결 시도
**원인:**
- 네트워크 불안정
- 서버 과부하
- 잘못된 URL 설정

**해결:**
1. 네트워크 연결 확인
2. Backend 로그 확인
3. Socket URL 설정 확인

## 🛠️ 브라우저 디버깅

### Chrome DevTools에서 확인하기:
1. F12로 개발자 도구 열기
2. Network 탭 > WS 필터 선택
3. Socket 연결 상태 확인
4. Console 탭에서 에러 메시지 확인

### Console에서 테스트:
```javascript
// 현재 연결 상태 확인
console.log('Socket Connected:', window.socket?.connected);

// 수동 재연결
window.socket?.connect();

// 토큰 확인
console.log('Token:', localStorage.getItem('token'));
```

## 📱 모바일에서 테스트
로컬 개발 서버를 모바일에서 테스트하려면:

1. 컴퓨터와 모바일이 같은 네트워크에 있어야 함
2. 컴퓨터의 IP 주소 확인:
   ```bash
   # Mac/Linux
   ifconfig | grep inet
   
   # Windows
   ipconfig
   ```
3. 모바일 브라우저에서 `http://[컴퓨터IP]:3000` 접속

## 🚀 프로덕션 배포 시

### 1. 환경 변수 설정
```bash
# Backend
NODE_ENV=production
JWT_SECRET=강력한_시크릿_키_생성
CORS_ORIGINS=https://yourdomain.com

# Frontend
REACT_APP_API_URL=https://api.yourdomain.com
REACT_APP_SOCKET_URL=https://api.yourdomain.com
```

### 2. Nginx 설정 (WebSocket 지원)
```nginx
location /socket.io/ {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 3. PM2로 Backend 실행
```bash
pm2 start backend/server.js --name tojvs-backend
pm2 save
pm2 startup
```

## 📞 추가 지원
문제가 지속되면 다음 정보와 함께 이슈를 생성해주세요:
- 브라우저 콘솔 에러 메시지
- Backend 서버 로그
- `debug-socket.sh` 실행 결과
- 환경 (OS, Node 버전, 브라우저)

## 🔄 최신 업데이트 (2025.01.09)
- Socket.io 연결 안정성 개선
- 자동 재연결 로직 강화
- 디버깅 도구 추가
- 환경 변수 템플릿 제공