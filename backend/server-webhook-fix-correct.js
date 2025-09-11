// n8n webhook endpoint - 올바른 수정 버전
// server.js의 /webhook/n8n-result 엔드포인트를 이 코드로 완전히 교체하세요

app.post('/webhook/n8n-result', asyncHandler(async (req, res) => {
  const { commandId, socketId, userId: requestUserId, type, data } = req.body;
  
  console.log('📥 [n8n Webhook] Received:', {
    commandId,
    socketId,
    requestUserId,
    type,
    timestamp: new Date().toISOString()
  });
  
  // Debug info
  console.log('🔍 [n8n Webhook] Current state:', {
    pendingCommandsSize: pendingCommands.size,
    userSocketMapSize: userSocketMap.size,
    socketUserMapSize: socketUserMap.size,
    ioExists: !!io,
    ioSocketsSize: io ? io.sockets.sockets.size : 0
  });
  
  let targetUserId = null;
  
  // 🔥 Try multiple methods to identify the user
  if (commandId && pendingCommands.has(commandId)) {
    // Method 1: Use commandId to find user (most reliable)
    const commandData = pendingCommands.get(commandId);
    targetUserId = commandData.userId;
    console.log(`✅ [n8n Webhook] Found user ${targetUserId} via commandId ${commandId}`);
    pendingCommands.delete(commandId);
  } else if (socketId && socketUserMap.has(socketId)) {
    // Method 2: Try socketId (might be stale)
    const socketData = socketUserMap.get(socketId);
    targetUserId = socketData.userId;
    console.log(`✅ [n8n Webhook] Found user ${targetUserId} via socketId ${socketId}`);
  } else if (requestUserId) {
    // Method 3: Use userId from request
    targetUserId = requestUserId;
    console.log(`✅ [n8n Webhook] Using userId ${targetUserId} from request`);
  }
  
  if (!targetUserId) {
    console.error('❌ [n8n Webhook] Could not identify target user');
    console.error('Debug info:', {
      commandId,
      socketId,
      requestUserId,
      pendingCommandIds: Array.from(pendingCommands.keys()),
      socketIds: Array.from(socketUserMap.keys())
    });
    
    return res.status(400).json({ 
      success: false, 
      error: 'User identification failed',
      receivedData: { commandId, socketId, requestUserId }
    });
  }
  
  // Handle different result types
  if (type === 'kanban' && data && data.action === 'ADD_CARD') {
    try {
      // 🔥 중복 체크: 2초 이내에 같은 카드가 생성되었는지 확인
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
      // command-result 이벤트만 사용
      const sent = emitToUser(targetUserId, 'command-result', {
        type,
        data,
        timestamp: new Date().toISOString(),
        commandId  // commandId 포함하여 클라이언트에서 중복 체크 가능
      });
      
      // ❌ 다음 이벤트들은 발송하지 않음 (중복 방지):
      // - voiceCommandResult
      // - kanban-update broadcast
      
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
    // Generic result handling (non-kanban types)
    const sent = emitToUser(targetUserId, 'command-result', {
      type,
      data,
      timestamp: new Date().toISOString(),
      commandId
    });
    
    // ❌ voiceCommandResult 이벤트는 발송하지 않음
    
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
