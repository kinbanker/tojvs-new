투자비스 (tojvs) - AI 음성 트레이딩 어시스턴트 MVP
🚀 빠른 시작 가이드
1. 자동 설치 (권장)
bash
chmod +x setup.sh
./setup.sh
2. 수동 설치
백엔드 설정
bash
cd backend
cp .env.template .env  # .env 파일 생성 후 편집
npm install
node server.js  # 또는 pm2 start server.js --name tojvs-backend
프론트엔드 설정
bash
cd frontend
npm install
npm start  # 개발 모드
# 또는
npm run build  # 프로덕션 빌드
n8n 설정 (Docker)
bash
docker-compose up -d
# 접속: http://localhost:5678
# 계정: .env 파일에서 설정
📋 필수 환경변수 설정
backend/.env 파일을 열어 다음 항목을 설정하세요:

env
# 필수 설정
JWT_SECRET=your-super-secret-key-here  # 강력한 랜덤 문자열로 변경
NODE_ENV=production  # 또는 development

# 선택 설정 (MVP에서는 불필요)
# POLYGON_API_KEY=your-key  # 실시간 주가 (나중에 추가)
# OPENAI_API_KEY=your-key   # n8n에서 설정
🔑 필요한 API 키
MVP 필수
없음 (모의 데이터로 작동)
선택사항 (기능 확장 시)
OpenAI API (n8n에서 설정)
용도: 음성 명령 의도 분석
발급: https://platform.openai.com
Polygon.io API (나중에 추가)
용도: 실시간 주가 데이터
발급: https://polygon.io
🖥️ 서비스 접속 주소
프론트엔드: http://localhost:3000
백엔드 API: http://localhost:3001
n8n 워크플로우: http://localhost:5678
API 헬스체크: http://localhost:3001/api/health
🧪 테스트 계정: .env 파일에서 설정
🎯 주요 기능 테스트
1. 음성 명령 테스트
"테슬라 뉴스 보여줘"
"SQQQ 17불 100주 매수대기"
"TQQQ 매수완료"
2. 칸반 보드
카드 드래그 앤 드롭
실시간 동기화 확인
3. WebSocket 연결
좌측 상단 연결 상태 확인
녹색: 연결됨
빨간색: 연결 끊김
🐛 문제 해결
서버가 시작되지 않음
bash
# 포트 확인
lsof -i :3001
lsof -i :5678

# 프로세스 종료 후 재시작
pm2 restart all
음성 인식이 안 됨
Chrome, Edge, Safari 브라우저 사용
HTTPS 연결 필요 (프로덕션)
마이크 권한 허용
WebSocket 연결 실패
bash
# 백엔드 로그 확인
pm2 logs tojvs-backend

# 방화벽 확인
sudo ufw allow 3001
n8n 연결 실패
n8n 워크플로우 활성화 확인
Webhook URL 확인: /webhook/tojvs-voice
OpenAI Credential 설정 확인
📦 프로젝트 구조
tojvs/
├── backend/
│   ├── server.js          # 메인 서버
│   ├── database.db        # SQLite DB (자동 생성)
│   ├── .env              # 환경변수
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/   # React 컴포넌트
│   │   ├── hooks/        # Custom Hooks
│   │   └── utils/        # 유틸리티
│   ├── build/           # 프로덕션 빌드
│   └── package.json
├── n8n-data/            # n8n 데이터
├── docker-compose.yml   # Docker 설정
├── setup.sh            # 자동 설치 스크립트
└── README.md
🚢 프로덕션 배포
1. 서버 준비
Ubuntu 22.04 LTS
4GB RAM, 2 CPU
Node.js 18+
2. Nginx 설정
nginx
server {
    listen 80;
    server_name tojvs.com;

    location / {
        root /home/appuser/tojvs/frontend/build;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3001;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
3. SSL 설정
bash
sudo certbot --nginx -d tojvs.com
4. PM2 시작
bash
pm2 start backend/server.js --name tojvs-backend
pm2 save
pm2 startup
📈 성능 모니터링
bash
# PM2 모니터링
pm2 monit

# 로그 확인
pm2 logs tojvs-backend --lines 100

# 시스템 리소스
htop
🔒 보안 체크리스트
 JWT Secret 변경
 CORS 설정
 Rate Limiting
 Helmet.js
 SQL Injection 방지
 HTTPS 설정 (프로덕션)
 환경변수 보안 관리
 정기 백업 설정
🛠️ 개발 명령어
Backend
bash
# 개발 모드 실행 (nodemon)
cd backend
npm run dev

# 프로덕션 실행
NODE_ENV=production node server.js

# 데이터베이스 초기화
rm database.db  # 기존 DB 삭제
node server.js  # 자동으로 새 DB 생성
Frontend
bash
# 개발 서버
cd frontend
npm start

# 프로덕션 빌드
npm run build

# 빌드된 파일 테스트
npm run serve
Docker & n8n
bash
# n8n 시작
docker-compose up -d

# n8n 로그 확인
docker-compose logs -f n8n

# n8n 재시작
docker-compose restart n8n

# n8n 중지
docker-compose down
📊 API 엔드포인트
인증
POST /api/register - 회원가입
POST /api/login - 로그인
GET /api/profile - 프로필 조회
칸반
GET /api/kanban - 카드 목록 조회
POST /api/kanban - 카드 추가
PUT /api/kanban/:id - 카드 수정
DELETE /api/kanban/:id - 카드 삭제
주식 (Mock)
GET /api/stocks/:ticker - 주가 조회 (모의 데이터)
WebSocket 이벤트
voice-command - 음성 명령 전송
command-result - 명령 처리 결과
kanban-update - 칸반 업데이트
move-card - 카드 이동
🎨 커스터마이징
색상 테마 변경
frontend/src/App.css 또는 Tailwind 클래스 수정

음성 명령 패턴 추가
n8n 워크플로우의 OpenAI 프롬프트 수정

새 칸반 컬럼 추가
javascript
// frontend/src/components/KanbanBoard.js
const columns = {
  'buy-wait': { title: '매수대기' },
  'buy-done': { title: '매수완료' },
  'sell-wait': { title: '매도대기' },
  'sell-done': { title: '매도완료' },
  // 새 컬럼 추가
  'watching': { title: '관심종목' }
};
📱 모바일 대응
현재 MVP는 데스크톱 중심으로 개발되었습니다.
모바일 대응을 위해서는:

반응형 CSS 추가
터치 제스처 지원
모바일 음성 인식 최적화
🔄 업데이트 방법
bash
# 코드 업데이트
git pull origin main

# 의존성 업데이트
cd backend && npm update
cd ../frontend && npm update

# 재시작
pm2 restart tojvs-backend
📝 라이선스
MIT License

👥 기여하기
Fork the repository
Create your feature branch
Commit your changes
Push to the branch
Create a Pull Request
💬 지원
GitHub Issues: 버그 리포트 및 기능 요청
Email: support@tojvs.com (예시)
🎯 로드맵
Phase 1 (완료) ✅
 기본 인증 시스템
 음성 인식 기능
 칸반 보드
 WebSocket 실시간 통신
Phase 2 (진행중) 🚧
 Polygon.io 실시간 주가
 고급 음성 명령
 가격 알림 기능
 매매 통계 대시보드
Phase 3 (계획) 📋
 모바일 앱
 AI 투자 조언
 소셜 기능
 다국어 지원
Made with ❤️ by tojvs Team

