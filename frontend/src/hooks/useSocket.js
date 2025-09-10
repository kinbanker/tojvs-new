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
          }
        });

        // ⭐ n8n Voice command results - 새로 추가된 이벤트 리스너
        socketRef.current.on('voiceCommandResult', (result) => {
          console.log('📢 Voice command result from n8n:', result);
          setLastMessage(result);
          
          // Show success message based on type
          if (result.type === 'news') {
            toast.success(`${result.data.articles?.length || 0}개의 뉴스를 찾았습니다`);
            // Dispatch custom event for components to handle
            window.dispatchEvent(new CustomEvent('voiceCommandNews', {
              detail: result.data
            }));
          } else if (result.type === 'market') {
            toast.success('시장 데이터를 가져왔습니다');
            window.dispatchEvent(new CustomEvent('voiceCommandMarket', {
              detail: result.data
            }));
          } else if (result.type === 'kanban') {
            toast.success('칸반 보드가 업데이트되었습니다');
            window.dispatchEvent(new CustomEvent('voiceCommandKanban', {
              detail: result.data
            }));
          } else if (result.type === 'portfolio') {
            toast.success('포트폴리오 정보를 가져왔습니다');
            window.dispatchEvent(new CustomEvent('voiceCommandPortfolio', {
              detail: result.data
            }));
          } else if (result.type === 'error') {
            toast.error(result.data?.message || '명령을 처리할 수 없습니다');
          }
          
          // Debug logging in development
          if (process.env.NODE_ENV === 'development') {
            console.log('Voice command result details:', {
              type: result.type,
              data: result.data,
              timestamp: result.timestamp,
              source: result.source
            });
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
          toast.error(error.message || '오류가 발생했습니다');
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