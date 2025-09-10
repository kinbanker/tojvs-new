import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [customSocket, setCustomSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isCustomConnected, setIsCustomConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const socketRef = useRef(null);
  const customSocketRef = useRef(null);

  // Socket 초기화
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No token found for socket connection');
      setConnectionError('인증 토큰이 없습니다');
      return;
    }

    // Hook Socket 연결
    const hookSocket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 20000,
    });

    // Custom Socket 연결  
    const customSocketInstance = io(
      `${process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001'}/custom`,
      {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        timeout: 20000,
      }
    );

    // Hook Socket 이벤트 핸들러
    hookSocket.on('connect', () => {
      console.log('Hook Socket connected:', hookSocket.id);
      setIsConnected(true);
      setConnectionError(null);
      setReconnectAttempt(0);
    });

    hookSocket.on('disconnect', (reason) => {
      console.log('Hook Socket disconnected:', reason);
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        // 서버에서 연결을 끊은 경우 재연결 시도
        hookSocket.connect();
      }
    });

    hookSocket.on('connect_error', (error) => {
      console.error('Hook Socket connection error:', error.message);
      setConnectionError(`연결 오류: ${error.message}`);
      setReconnectAttempt(prev => prev + 1);
    });

    hookSocket.on('reconnect_attempt', (attemptNumber) => {
      console.log('Hook Socket reconnecting...', attemptNumber);
      setReconnectAttempt(attemptNumber);
    });

    hookSocket.on('reconnect', (attemptNumber) => {
      console.log('Hook Socket reconnected after', attemptNumber, 'attempts');
      setIsConnected(true);
      setConnectionError(null);
      setReconnectAttempt(0);
    });

    // Custom Socket 이벤트 핸들러
    customSocketInstance.on('connect', () => {
      console.log('Custom Socket connected:', customSocketInstance.id);
      setIsCustomConnected(true);
    });

    customSocketInstance.on('disconnect', (reason) => {
      console.log('Custom Socket disconnected:', reason);
      setIsCustomConnected(false);
      if (reason === 'io server disconnect') {
        customSocketInstance.connect();
      }
    });

    customSocketInstance.on('connect_error', (error) => {
      console.error('Custom Socket connection error:', error.message);
    });

    customSocketInstance.on('reconnect', (attemptNumber) => {
      console.log('Custom Socket reconnected after', attemptNumber, 'attempts');
      setIsCustomConnected(true);
    });

    // 상태 및 ref 업데이트
    setSocket(hookSocket);
    setCustomSocket(customSocketInstance);
    socketRef.current = hookSocket;
    customSocketRef.current = customSocketInstance;

    // Cleanup
    return () => {
      console.log('Cleaning up socket connections...');
      hookSocket.disconnect();
      customSocketInstance.disconnect();
    };
  }, []); // 빈 dependency array - 한 번만 실행

  // 재연결 함수
  const reconnect = useCallback(() => {
    if (socketRef.current && !socketRef.current.connected) {
      console.log('Attempting to reconnect Hook Socket...');
      socketRef.current.connect();
    }
    if (customSocketRef.current && !customSocketRef.current.connected) {
      console.log('Attempting to reconnect Custom Socket...');
      customSocketRef.current.connect();
    }
  }, []);

  // 수동 연결 해제
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    if (customSocketRef.current) {
      customSocketRef.current.disconnect();
    }
  }, []);

  const value = {
    socket,
    customSocket,
    isConnected,
    isCustomConnected,
    connectionError,
    reconnectAttempt,
    reconnect,
    disconnect,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export default SocketContext;