# 중복 카드 생성 문제 해결 가이드

## 문제 설명
n8n 워크플로우에서 한 번의 요청을 보냈는데 칸반 보드에 3개의 동일한 카드가 생성되는 문제

## 원인
1. 서버에서 `command-result`와 `voiceCommandResult` 두 개의 이벤트를 동시에 발송
2. 클라이언트에서 여러 이벤트 리스너가 중복으로 처리
3. 카드 ID 중복 체크 로직 부재

## 해결 방법

### 1. Frontend 수정 사항 (완료)
- **KanbanBoard.js**: 카드 ID 기반 중복 체크 추가
- **Dashboard.js**: Toast 메시지 중복 방지를 위한 toastIdRef 추가
- **useSocket.js**: 이벤트 ID 추적으로 중복 메시지 방지

### 2. Backend 수정 사항 (필요)

`backend/server.js` 파일에서 `/webhook/n8n-result` 엔드포인트를 찾아서 다음과 같이 수정하세요:

```javascript
// 🔥 Improved n8n webhook endpoint
app.post('/webhook/n8n-result', asyncHandler(async (req, res) => {
  const { commandId, socketId, userId: requestUserId, type, data } = req.body;
  
  console.log('📥 [n8n Webhook] Received:', {
    commandId,
    socketId,
    requestUserId,
    type,
    timestamp: new Date().toISOString()
  });
  
  let targetUserId = null;
  
  // Try multiple methods to identify the user
  if (commandId && pendingCommands.has(commandId)) {
    const commandData = pendingCommands.get(commandId);
    targetUserId = commandData.userId;
    console.log(`✅ [n8n Webhook] Found user ${targetUserId} via commandId ${commandId}`);
    pendingCommands.delete(commandId);
  } else if (socketId && socketUserMap.has(socketId)) {
    const socketData = socketUserMap.get(socketId);
    targetUserId = socketData.userId;
    console.log(`✅ [n8n Webhook] Found user ${targetUserId} via socketId ${socketId}`);
  } else if (requestUserId) {
    targetUserId = requestUserId;
    console.log(`✅ [n8n Webhook] Using userId ${targetUserId} from request`);
  }
  
  if (!targetUserId) {
    console.error('❌ [n8n Webhook] Could not identify target user');
    return res.status(400).json({ 
      success: false, 
      error: 'User identification failed'
    });
  }
  
  // Handle kanban card creation
  if (type === 'kanban' && data && data.action === 'ADD_CARD') {
    try {
      // 중복 체크: 2초 이내에 같은 카드가 생성되었는지 확인
      const existingCard = await db.get(
        `SELECT id FROM kanban_cards 
         WHERE user_id = ? AND ticker = ? AND price = ? AND quantity = ? 
         AND created_at > datetime("now", "-2 seconds")`,
        targetUserId, data.card.ticker, data.card.price, data.card.quantity
      );
      
      if (existingCard) {
        console.log(`⚠️ [n8n Webhook] Duplicate card detected, using existing card ID: ${existingCard.id}`);
        data.card.id = existingCard.id;
      } else {
        // Save to database
        const result = await db.run(
          'INSERT INTO kanban_cards (user_id, ticker, price, quantity, column_id, notes) VALUES (?, ?, ?, ?, ?, ?)',
          targetUserId, 
          data.card.ticker, 
          data.card.price, 
          data.card.quantity, 
          data.card.column || data.card.column_id || 'buy-wait',
          data.card.notes || ''
        );
        
        data.card.id = result.lastID;
        console.log(`✅ [n8n Webhook] Card saved to DB with ID: ${result.lastID}`);
      }
      
      // Update voice command as processed
      if (commandId) {
        await db.run(
          'UPDATE voice_commands SET processed = 1, intent_type = ? WHERE command_id = ?',
          'ADD_TRADE', commandId
        );
      }
      
      // 🔥 중요: 하나의 이벤트만 발송 (중복 방지)
      const sent = emitToUser(targetUserId, 'command-result', {
        type,
        data,
        timestamp: new Date().toISOString(),
        commandId
      });
      
      // ❌ 제거: voiceCommandResult 이벤트 발송 제거
      // ❌ 제거: kanban-update 브로드캐스트 제거
      
      if (!sent) {
        console.log(`⚠️ [n8n Webhook] User ${targetUserId} has no active connections`);
      }
      
    } catch (error) {
      console.error('❌ [n8n Webhook] Error processing kanban result:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Database error',
        details: error.message
      });
    }
  } else {
    // Generic result handling (non-kanban)
    const sent = emitToUser(targetUserId, 'command-result', {
      type,
      data,
      timestamp: new Date().toISOString(),
      commandId
    });
    
    if (!sent) {
      console.log(`⚠️ [n8n Webhook] User ${targetUserId} has no active connections`);
    }
  }
  
  res.json({ 
    success: true,
    userId: targetUserId,
    delivered: userSocketMap.has(targetUserId),
    activeSockets: userSocketMap.get(targetUserId)?.size || 0
  });
}));
```

### 3. 배포 방법

```bash
# 1. 서버에 SSH 접속
ssh your-server

# 2. 프로젝트 디렉토리로 이동
cd /path/to/tojvs-new

# 3. develop 브랜치로 체크아웃
git checkout develop

# 4. 최신 변경사항 가져오기
git pull origin develop

# 5. Frontend 재빌드
cd frontend
npm install
npm run build

# 6. Backend 재시작
cd ../backend
pm2 restart tojvs-backend

# 7. 로그 확인
pm2 logs tojvs-backend --lines 50
```

### 4. 테스트 방법

1. 음성 명령 실행: "SQQQ 17.9불 100주 매수 대기"
2. 칸반 보드 확인: 카드가 1개만 생성되는지 확인
3. 서버 로그 확인: 중복 체크 메시지 확인

### 5. 주요 변경 사항

#### Frontend
- ✅ 카드 ID 기반 중복 체크
- ✅ 타임스탬프 기반 중복 메시지 필터링
- ✅ Toast 메시지 중복 방지

#### Backend
- ⚠️ **수동 수정 필요**: `/webhook/n8n-result` 엔드포인트에서 중복 이벤트 발송 제거
- DB에 중복 카드 체크 로직 추가
- 단일 이벤트(`command-result`)만 발송

### 6. 문제가 지속될 경우

1. 서버 로그 확인:
```bash
pm2 logs tojvs-backend --lines 100 | grep "n8n Webhook"
```

2. 클라이언트 콘솔 확인:
- Chrome DevTools > Console
- "Duplicate" 관련 메시지 확인

3. 네트워크 탭 확인:
- Chrome DevTools > Network > WS
- Socket.IO 메시지 확인

### 7. 롤백 방법

문제가 발생한 경우:
```bash
git checkout main
pm2 restart tojvs-backend
```

## 문의사항
문제가 지속되거나 추가 도움이 필요한 경우 이슈를 생성해주세요.
