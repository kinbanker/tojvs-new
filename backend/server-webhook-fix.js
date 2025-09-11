// n8n webhook endpoint - 중복 카드 생성 방지 버전
// server.js의 /webhook/n8n-result 엔드포인트를 다음과 같이 수정

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
      // n8n에서 이미 카드 ID를 생성한 경우 사용, 아니면 새로 생성
      const cardId = data.card.id || `card-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      
      // 중복 체크: 같은 카드 ID가 이미 있는지 확인
      const existingCard = await db.get(
        'SELECT id FROM kanban_cards WHERE id = ? OR (user_id = ? AND ticker = ? AND price = ? AND quantity = ? AND created_at > datetime("now", "-2 seconds"))',
        cardId, targetUserId, data.card.ticker, data.card.price, data.card.quantity
      );
      
      if (existingCard) {
        console.log(`⚠️ [n8n Webhook] Duplicate card detected, skipping DB insert`);
        // 이미 있는 카드 정보 사용
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
      // command-result 이벤트만 사용 (voiceCommandResult는 제거)
      const sent = emitToUser(targetUserId, 'command-result', {
        type,
        data,
        timestamp: new Date().toISOString(),
        commandId // commandId 포함하여 클라이언트에서 중복 체크 가능
      });
      
      // 브로드캐스트는 하지 않음 (이미 command-result로 처리됨)
      
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