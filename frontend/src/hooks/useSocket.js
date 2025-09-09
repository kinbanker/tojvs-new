import { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import toast from 'react-hot-toast';

// Socket server URL configuration
const getSocketUrl = () => {
  // Check if we're in production
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    // Production: Use same domain with port 3001
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  
  // Development: Use localhost
  return 'http://localhost:3001';
};

const SOCKET_SERVER_URL = getSocketUrl();

export const useSocket = (userId) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    if (!token) {
      console.warn('No token found, skipping socket connection');
      setConnectionError('인증 토큰이 없습니다. 다시 로그인해주세요.');
      return;
    }

    const connectSocket = () => {
      try {
        console.log('Attempting to connect to:', SOCKET_SERVER_URL);
        
        // Clean up existing connection
        if (socketRef.current) {
          socketRef.current.removeAllListeners();
          socketRef.current.disconnect();
        }
        
        socketRef.current = io(SOCKET_SERVER_URL, {
          auth: { token },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: maxReconnectAttempts,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 20000,
          forceNew: true,
          autoConnect: true
        });

        // Connection established
        socketRef.current.on('connect', () => {
          console.log('✅ Socket connected:', socketRef.current.id);
          setIsConnected(true);
          setConnectionError(null);
          
          if (reconnectAttemptsRef.current > 0) {
            toast.success('서버에 재연결되었습니다');
          }
          reconnectAttemptsRef.current = 0;
        });

        // Connection lost
        socketRef.current.on('disconnect', (reason) => {
          console.log('❌ Socket disconnected:', reason);
          setIsConnected(false);
          
          // Auto reconnect for certain disconnect reasons
          if (reason === 'io server disconnect') {
            // Server initiated disconnect, try to reconnect
            reconnectTimeoutRef.current = setTimeout(() => {
              if (socketRef.current) {
                socketRef.current.connect();
              }
            }, 1000);
          } else if (reason === 'transport close' || reason === 'transport error') {
            setConnectionError('서버 연결이 불안정합니다. 재연결 시도중...');
          }
        });

        // Connection error
        socketRef.current.on('connect_error', (error) => {
          console.error('Socket connection error:', error.message, error.type);
          reconnectAttemptsRef.current++;
          
          if (error.message === 'Authentication error') {
            setConnectionError('인증 실패. 다시 로그인해주세요.');
            toast.error('인증 실패. 다시 로그인해주세요.');
            // Clear token and redirect to login
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
            return;
          }
          
          if (reconnectAttemptsRef.current === 1) {
            setConnectionError(`서버 연결 중... (시도: ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
            toast.loading('서버 연결 중...', { duration: 3000 });
          } else if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            setConnectionError(`재연결 시도 중... (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          } else {
            setConnectionError('서버 연결 실패. 페이지를 새로고침해주세요.');
            toast.error('서버 연결 실패. 페이지를 새로고침해주세요.');
          }
        });

        // Reconnection attempts
        socketRef.current.on('reconnect_attempt', (attemptNumber) => {
          console.log(`Reconnection attempt ${attemptNumber}`);
          setConnectionError(`재연결 시도 중... (${attemptNumber}/${maxReconnectAttempts})`);
        });

        // Successfully reconnected
        socketRef.current.on('reconnect', (attemptNumber) => {
          console.log(`✅ Reconnected after ${attemptNumber} attempts`);
          setIsConnected(true);
          setConnectionError(null);
          toast.success('서버에 재연결되었습니다');
        });

        // Server messages
        socketRef.current.on('connected', (data) => {
          console.log('Server confirmed connection:', data);
          setIsConnected(true);
          setConnectionError(null);
        });

        // Command processing status
        socketRef.current.on('processing', (status) => {
          console.log('Processing status:', status);
          if (status.message) {
            toast.loading(status.message, { duration: 2000 });
          }
        });

        // Command results
        socketRef.current.on('command-result', (message) => {
          console.log('Received result:', message);
          setLastMessage(message);
          
          // Show success message based on type
          if (message.type === 'kanban') {
            toast.success('칸반 카드가 추가되었습니다');
          } else if (message.type === 'news') {
            toast.success('뉴스를 찾았습니다');
          } else if (message.type === 'market') {
            toast.success('시세 정보를 가져왔습니다');
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

        // Error messages from server
        socketRef.current.on('error', (error) => {
          console.error('Server error:', error);
          const errorMessage = error.message || '오류가 발생했습니다';
          setConnectionError(errorMessage);
          toast.error(errorMessage);
        });

        // Ping-pong for keeping connection alive
        socketRef.current.on('ping', () => {
          console.log('Ping received from server');
        });

      } catch (error) {
        console.error('Failed to create socket connection:', error);
        setConnectionError('소켓 연결 생성 실패: ' + error.message);
        toast.error('서버 연결 실패');
      }
    };

    // Initial connection
    connectSocket();

    // Cleanup
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (socketRef.current) {
        console.log('Cleaning up socket connection');
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [userId]);
  
  // Send voice command
  const sendVoiceCommand = useCallback((text) => {
    if (!socketRef.current) {
      toast.error('서버에 연결되어 있지 않습니다');
      return false;
    }
    
    if (!socketRef.current.connected) {
      toast.error('서버 연결을 확인해주세요');
      return false;
    }
    
    try {
      console.log('Sending voice command:', text);
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
  }, []);
  
  // Move kanban card
  const moveCard = useCallback((cardId, fromColumn, toColumn) => {
    if (!socketRef.current || !socketRef.current.connected) {
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
  }, []);
  
  // Manual reconnect
  const reconnect = useCallback(() => {
    if (socketRef.current) {
      console.log('Manual reconnect triggered');
      reconnectAttemptsRef.current = 0;
      socketRef.current.connect();
      toast.loading('재연결 시도중...', { duration: 2000 });
    }
  }, []);
  
  // Get connection info
  const getConnectionInfo = useCallback(() => {
    return {
      url: SOCKET_SERVER_URL,
      connected: socketRef.current?.connected || false,
      id: socketRef.current?.id || null,
      transport: socketRef.current?.io?.engine?.transport?.name || 'unknown'
    };
  }, []);
  
  return {
    isConnected,
    lastMessage,
    connectionError,
    sendVoiceCommand,
    moveCard,
    reconnect,
    socket: socketRef.current,
    getConnectionInfo
  };
};