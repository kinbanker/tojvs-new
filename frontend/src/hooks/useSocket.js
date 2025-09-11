import { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import toast from 'react-hot-toast';

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

    const connectSocket = () => {
      try {
        socketRef.current = io(SOCKET_SERVER_URL, {
          auth: { token },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 10000
        });

        // Connection established
        socketRef.current.on('connect', () => {
          console.log('Socket connected');
          setIsConnected(true);
          setConnectionError(null);
          reconnectAttemptsRef.current = 0;
          
          if (reconnectAttemptsRef.current > 0) {
            toast.success('재연결되었습니다');
          }
        });

        // Connection lost
        socketRef.current.on('disconnect', (reason) => {
          console.log('Socket disconnected:', reason);
          setIsConnected(false);
          
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
          
          if (reconnectAttemptsRef.current === 1) {
            toast.error('서버 연결 중... 잠시만 기다려주세요');
          }
          
          if (reconnectAttemptsRef.current > 5) {
            toast.error('서버 연결 실패. 페이지를 새로고침해주세요');
          }
        });

        // Reconnection attempts
        socketRef.current.on('reconnect_attempt', (attemptNumber) => {
          console.log(`Reconnection attempt ${attemptNumber}`);
        });

        // Successfully reconnected
        socketRef.current.on('reconnect', (attemptNumber) => {
          console.log(`Reconnected after ${attemptNumber} attempts`);
          toast.success('서버에 재연결되었습니다');
        });

        // Server messages
        socketRef.current.on('connected', (data) => {
          console.log('Server confirmed connection:', data);
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

        // Debug socket in development
        if (process.env.NODE_ENV === 'development') {
          window.debugSocket = socketRef.current;
          console.log('🔧 Debug socket available: window.debugSocket');
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
      socketRef.current.emit('voice-command', {
        text,
        timestamp: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error('Failed to send voice command:', error);
      toast.error('명령 전송 실패');
      return false;
    }
  }, [isConnected]);
  
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
        toColumn
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
    socket: socketRef.current
  };
};
