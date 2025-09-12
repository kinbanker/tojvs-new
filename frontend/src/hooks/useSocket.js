import { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import toast from 'react-hot-toast';
import sessionManager from '../utils/sessionManager';

const SOCKET_SERVER_URL = process.env.REACT_APP_SOCKET_URL || 
  (process.env.NODE_ENV === 'production' 
    ? ''  // 프로덕션: 같은 도메인
    : 'http://localhost:3002');  // 개발: 로컬 서버

export const useSocket = (userId) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const processedEventIds = useRef(new Set()); // 처리된 이벤트 ID 추적
  const lastToastTime = useRef({}); // Toast 타입별 마지막 표시 시간
  
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    if (!token) {
      console.warn('No token found, skipping socket connection');
      return;
    }

    // 기존 세션 정보 확인
    const existingSession = sessionManager.getSession();
    console.log('Existing session:', existingSession);

    const connectSocket = () => {
      try {
        // 세션 ID를 auth에 포함
        const sessionId = sessionManager.getSessionId();
        const previousSocketId = sessionManager.getSocketId();
        
        socketRef.current = io(SOCKET_SERVER_URL, {
          auth: { 
            token,
            sessionId,
            previousSocketId,
            userId
          },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 10, // 재연결 시도 횟수 증가
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 10000
        });

        // Connection established
        socketRef.current.on('connect', () => {
          console.log('Socket connected:', socketRef.current.id);
          setIsConnected(true);
          setConnectionError(null);
          
          // 소켓 ID를 세션에 저장
          sessionManager.updateSocketId(socketRef.current.id);
          
          if (reconnectAttemptsRef.current > 0) {
            toast.success('재연결되었습니다');
            sessionManager.resetReconnectCount();
          }
          reconnectAttemptsRef.current = 0;
        });

        // Connection lost
        socketRef.current.on('disconnect', (reason) => {
          console.log('Socket disconnected:', reason);
          setIsConnected(false);
          
          // 재연결 카운트 증가
          sessionManager.incrementReconnectCount();
          
          if (reason === 'io server disconnect') {
            // Server initiated disconnect, try to reconnect
            socketRef.current.connect();
          }
        });

        // Connection error
        socketRef.current.on('connect_error', (error) => {
          console.error('Socket connection error:', error.message);
          setConnectionError(error.message);
          reconnectAttemptsRef.current++;
          
          // 세션 복구 시도
          if (reconnectAttemptsRef.current === 1) {
            const session = sessionManager.getSession();
            if (session && session.socketId) {
              console.log('Attempting session recovery with socket ID:', session.socketId);
              toast.loading('서버 연결 복구 중... 잠시만 기다려주세요');
            } else {
              toast.error('서버 연결 중... 잠시만 기다려주세요');
            }
          }
          
          if (reconnectAttemptsRef.current > 10) {
            toast.error('서버 연결 실패. 페이지를 새로고침해주세요');
          }
        });

        // Reconnection attempts
        socketRef.current.on('reconnect_attempt', (attemptNumber) => {
          console.log(`Reconnection attempt ${attemptNumber}`);
          sessionManager.incrementReconnectCount();
        });

        // Successfully reconnected
        socketRef.current.on('reconnect', (attemptNumber) => {
          console.log(`Reconnected after ${attemptNumber} attempts`);
          toast.success('서버에 재연결되었습니다');
          sessionManager.resetReconnectCount();
        });

        // Server messages
        socketRef.current.on('connected', (data) => {
          console.log('Server confirmed connection:', data);
          // 서버에서 전달받은 세션 정보 저장
          if (data.sessionId) {
            sessionManager.updateCommandId(data.sessionId);
          }
        });

        // Command processing status - 중복 방지 개선
        socketRef.current.on('processing', (status) => {
          console.log('Processing status:', status);
          // processing 메시지는 Dashboard에서 처리하므로 여기서는 스킵
        });

        // Command results - 중복 방지 개선
        socketRef.current.on('command-result', (message) => {
          console.log('Received result:', message);
          
          // 메시지 ID 생성
          const messageId = `${message.timestamp}_${message.type}`;
          
          // 이미 처리한 메시지면 스킵
          if (processedEventIds.current.has(messageId)) {
            console.log('Duplicate command-result detected, skipping');
            return;
          }
          
          processedEventIds.current.add(messageId);
          setLastMessage(message);
          
          // 커맨드 ID 저장
          if (message.commandId) {
            sessionManager.updateCommandId(message.commandId);
          }
          
          // Toast 중복 방지 - 1초 이내 같은 타입의 toast는 표시하지 않음
          const now = Date.now();
          const lastTime = lastToastTime.current[message.type] || 0;
          
          if (now - lastTime > 1000) {
            // Toast는 Dashboard에서 처리하므로 여기서는 스킵
            lastToastTime.current[message.type] = now;
          }
        });

        // ⭐ n8n Voice command results - 중복 방지 개선
        socketRef.current.on('voiceCommandResult', (result) => {
          console.log('📢 Voice command result from n8n:', result);
          
          // 메시지 ID 생성
          const messageId = `${result.timestamp}_${result.type}`;
          
          // 이미 처리한 메시지면 스킵
          if (processedEventIds.current.has(messageId)) {
            console.log('Duplicate voiceCommandResult detected, skipping');
            return;
          }
          
          processedEventIds.current.add(messageId);
          setLastMessage(result);
          
          // 커맨드 ID 저장
          if (result.commandId) {
            sessionManager.updateCommandId(result.commandId);
          }
          
          // Toast 중복 방지
          const now = Date.now();
          const lastTime = lastToastTime.current[result.type] || 0;
          
          if (now - lastTime > 1000) {
            // Custom event dispatch
            window.dispatchEvent(new CustomEvent('voiceCommand' + result.type.charAt(0).toUpperCase() + result.type.slice(1), {
              detail: result.data
            }));
            
            lastToastTime.current[result.type] = now;
          }
          
          // 오래된 이벤트 ID 정리 (메모리 누수 방지)
          if (processedEventIds.current.size > 100) {
            const idsArray = Array.from(processedEventIds.current);
            processedEventIds.current = new Set(idsArray.slice(-50));
          }
        });

        // Kanban updates
        socketRef.current.on('kanban-update', (update) => {
          console.log('Kanban update:', update);
          setLastMessage({
            type: 'kanban-update',
            data: update,
            timestamp: new Date().toISOString()
          });
        });

        // Error messages
        socketRef.current.on('error', (error) => {
          console.error('Server error:', error);
          // Error toast는 Dashboard에서 처리
        });

        // Session recovery 이벤트
        socketRef.current.on('session-recovered', (data) => {
          console.log('Session recovered:', data);
          toast.success('세션이 복구되었습니다');
          if (data.socketId) {
            sessionManager.updateSocketId(data.socketId);
          }
        });

        // Debug socket in development
        if (process.env.NODE_ENV === 'development') {
          window.debugSocket = socketRef.current;
          window.sessionManager = sessionManager;
          console.log('🔧 Debug tools available:');
          console.log('  - window.debugSocket: Socket instance');
          console.log('  - window.sessionManager: Session manager');
        }

      } catch (error) {
        console.error('Failed to create socket connection:', error);
        setConnectionError(error.message);
      }
    };

    connectSocket();

    // Cleanup
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      
      // Clear tracked events
      processedEventIds.current.clear();
      lastToastTime.current = {};
    };
  }, [userId]);
  
  // Send voice command
  const sendVoiceCommand = useCallback((text) => {
    if (!socketRef.current) {
      toast.error('서버에 연결되어 있지 않습니다');
      return false;
    }
    
    if (!isConnected) {
      toast.error('서버 연결을 확인해주세요');
      return false;
    }
    
    try {
      const commandId = sessionManager.getCommandId() || `cmd_${userId}_${Date.now()}`;
      socketRef.current.emit('voice-command', {
        text,
        commandId,
        sessionId: sessionManager.getSessionId(),
        timestamp: new Date().toISOString()
      });
      
      // 새 커맨드 ID 저장
      sessionManager.updateCommandId(commandId);
      return true;
    } catch (error) {
      console.error('Failed to send voice command:', error);
      toast.error('명령 전송 실패');
      return false;
    }
  }, [isConnected, userId]);
  
  // Move kanban card
  const moveCard = useCallback((cardId, fromColumn, toColumn) => {
    if (!socketRef.current || !isConnected) {
      toast.error('서버 연결을 확인해주세요');
      return false;
    }
    
    try {
      socketRef.current.emit('move-card', {
        cardId,
        fromColumn,
        toColumn,
        sessionId: sessionManager.getSessionId()
      });
      return true;
    } catch (error) {
      console.error('Failed to move card:', error);
      toast.error('카드 이동 실패');
      return false;
    }
  }, [isConnected]);
  
  // Manual reconnect
  const reconnect = useCallback(() => {
    if (socketRef.current) {
      // 세션 정보 새로고침
      sessionManager.refreshSession();
      socketRef.current.connect();
    }
  }, []);
  
  return {
    isConnected,
    lastMessage,
    connectionError,
    sendVoiceCommand,
    moveCard,
    reconnect,
    socket: socketRef.current,
    sessionId: sessionManager.getSessionId()
  };
};