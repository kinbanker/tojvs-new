import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, CreditCard, User, LogOut, TrendingUp, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';
import { useSocket } from '../hooks/useSocket';
import VoiceRecorder from './VoiceRecorder';
import ChatPanel from './ChatPanel';
import KanbanBoard from './KanbanBoard';
import NewsDisplay from './NewsDisplay';
import MarketDisplay from './MarketDisplay';
import PlanManagement from './PlanManagement';
import Profile from './Profile';
import DataFreshnessIndicator from './DataFreshnessIndicator';
import apiUtils from '../utils/api';
import sessionManager from '../utils/sessionManager';

const Dashboard = ({ onLogout }) => {
  const [activeMenu, setActiveMenu] = useState('home');
  const [currentView, setCurrentView] = useState('welcome');
  const [viewData, setViewData] = useState(null);
  const [viewTimestamp, setViewTimestamp] = useState(null);
  const [isHistoricalView, setIsHistoricalView] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [customSocket, setCustomSocket] = useState(null);
  const [isCustomSocketConnected, setIsCustomSocketConnected] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [customSocketMessage, setCustomSocketMessage] = useState(null);
  
  // 중복 처리 방지를 위한 ref
  const lastProcessedMessageId = useRef(null);
  const processingMessage = useRef(false);
  const toastIdRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const { isConnected, lastMessage, sendVoiceCommand, socket, sessionId } = useSocket(user.id);

  // 통합 연결 상태
  const isAnySocketConnected = isCustomSocketConnected || isConnected;

  // Toast 정리 함수
  const clearAllToasts = () => {
    toast.dismiss();
  };

  // 컴포넌트 마운트 시 세션 확인
  useEffect(() => {
    const session = sessionManager.getSession();
    if (session && session.userId === user.id) {
      console.log('Restored session:', session);
      // 세션이 유효하면 자동 재연결 시도
      if (session.socketId && !isAnySocketConnected) {
        toast.loading('이전 세션 복구 중...', { duration: 2000 });
      }
    } else if (user.id) {
      // 새 세션 생성
      sessionManager.createNewSession();
    }
  }, [user.id]);

  // 메뉴 변경 시 처리
  useEffect(() => {
    if (activeMenu !== 'home') {
      clearAllToasts();
      setCustomSocketMessage(null);
      lastProcessedMessageId.current = null;
      setIsHistoricalView(false);
    }
  }, [activeMenu]);

  // 소켓 연결 함수들
  const createSocketWithPolling = () => {
    console.log('🔄 Trying Socket.IO with polling transport...');
    const session = sessionManager.getSession();
    
    return io('https://dev.tojvs.com', {
      path: '/socket.io/',
      transports: ['polling'],
      upgrade: false,
      auth: {
        token: localStorage.getItem('token'),
        sessionId: session?.sessionId,
        userId: user.id,
        previousSocketId: session?.socketId
      },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 10000
    });
  };

  const createSocketWithWebsocket = () => {
    console.log('🔄 Trying Socket.IO with websocket transport...');
    const session = sessionManager.getSession();
    
    return io('https://dev.tojvs.com', {
      path: '/socket.io/',
      transports: ['websocket'],
      forceNew: true,
      auth: {
        token: localStorage.getItem('token'),
        sessionId: session?.sessionId,
        userId: user.id,
        previousSocketId: session?.socketId
      },
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      timeout: 5000
    });
  };

  const createSocketRelativePath = () => {
    console.log('🔄 Trying Socket.IO with relative path...');
    const session = sessionManager.getSession();
    
    return io('/', {
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      auth: {
        token: localStorage.getItem('token'),
        sessionId: session?.sessionId,
        userId: user.id,
        previousSocketId: session?.socketId
      },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
  };

  const createSocketHttp = () => {
    console.log('🔄 Trying Socket.IO with HTTP (fallback)...');
    const session = sessionManager.getSession();
    
    return io('http://dev.tojvs.com', {
      path: '/socket.io/',
      transports: ['polling'],
      auth: {
        token: localStorage.getItem('token'),
        sessionId: session?.sessionId,
        userId: user.id,
        previousSocketId: session?.socketId
      },
      reconnection: false,
      timeout: 5000
    });
  };

  // 소켓 이벤트 리스너 설정
  const setupSocketListeners = (socketInstance, connectionType) => {
    socketInstance.on('connect', () => {
      console.log(`✅ ${connectionType} socket connected:`, socketInstance.id);
      setIsCustomSocketConnected(true);
      setConnectionAttempts(0);
      
      // 소켓 ID를 세션에 저장
      sessionManager.updateSocketId(socketInstance.id);
      
      if (activeMenu === 'home') {
        toast.success(`서버에 연결되었습니다 (${connectionType})`);
      }
    });

    socketInstance.on('disconnect', (reason) => {
      console.log(`❌ ${connectionType} socket disconnected:`, reason);
      setIsCustomSocketConnected(false);
      
      // 재연결 카운트 증가
      sessionManager.incrementReconnectCount();
      
      if (reason !== 'io client disconnect' && activeMenu === 'home') {
        toast.error('서버 연결이 끊어졌습니다.');
      }
    });

    socketInstance.on('connect_error', (error) => {
      console.error(`❌ ${connectionType} connection error:`, error.message);
      setIsCustomSocketConnected(false);
      setConnectionAttempts(prev => prev + 1);
    });

    socketInstance.on('reconnect', (attemptNumber) => {
      console.log(`🔄 ${connectionType} reconnected after`, attemptNumber, 'attempts');
      setIsCustomSocketConnected(true);
      sessionManager.resetReconnectCount();
      
      if (activeMenu === 'home') {
        toast.success('서버에 재연결되었습니다.');
      }
    });

    // 세션 복구 이벤트
    socketInstance.on('session-recovered', (data) => {
      console.log('Session recovered:', data);
      if (data.commandId) {
        sessionManager.updateCommandId(data.commandId);
      }
      toast.success('이전 세션이 복구되었습니다');
    });

    // 커스텀 소켓의 메시지 처리 (중복 방지)
    socketInstance.on('command-result', (message) => {
      console.log('Received result via custom socket:', message);
      
      const messageId = `${message.timestamp}_${message.type}_${message.commandId || ''}`;
      
      if (lastProcessedMessageId.current === messageId) {
        console.log('Duplicate message detected, skipping:', messageId);
        return;
      }
      
      // 커맨드 ID 저장
      if (message.commandId) {
        sessionManager.updateCommandId(message.commandId);
      }
      
      if (activeMenu === 'home') {
        lastProcessedMessageId.current = messageId;
        setCustomSocketMessage(message);
      }
    });

    // voiceCommandResult 이벤트도 처리
    socketInstance.on('voiceCommandResult', (result) => {
      console.log('📢 Voice command result from n8n:', result);
      
      const messageId = `${result.timestamp}_${result.type}_${result.commandId || ''}`;
      if (lastProcessedMessageId.current === messageId) {
        console.log('Duplicate voiceCommandResult detected, skipping:', messageId);
        return;
      }
      
      // 커맨드 ID 저장
      if (result.commandId) {
        sessionManager.updateCommandId(result.commandId);
      }
      
      if (activeMenu === 'home') {
        lastProcessedMessageId.current = messageId;
        setCustomSocketMessage(result);
      }
    });

    // processing 이벤트 처리 개선
    socketInstance.on('processing', (status) => {
      console.log('Processing status:', status);
      if (status.message && activeMenu === 'home') {
        if (toastIdRef.current) {
          toast.dismiss(toastIdRef.current);
        }
        toastIdRef.current = toast.loading(status.message, { duration: 2000 });
      }
    });

    socketInstance.on('error', (error) => {
      console.error('Server error:', error);
      if (activeMenu === 'home') {
        toast.error(error.message || '오류가 발생했습니다');
      }
    });

    return socketInstance;
  };

  // 다중 연결 시도 함수
  const attemptConnection = async () => {
    if (connectionAttempts >= 4) {
      console.log('❌ All connection attempts failed');
      if (activeMenu === 'home') {
        toast.error('서버 연결에 실패했습니다. 새로고침 버튼을 눌러주세요.');
      }
      return;
    }

    let socketInstance = null;
    let connectionType = '';

    try {
      switch (connectionAttempts) {
        case 0:
          socketInstance = createSocketWithPolling();
          connectionType = 'HTTPS Polling';
          break;
        case 1:
          socketInstance = createSocketRelativePath();
          connectionType = 'Relative Path';
          break;
        case 2:
          socketInstance = createSocketWithWebsocket();
          connectionType = 'HTTPS WebSocket';
          break;
        case 3:
          socketInstance = createSocketHttp();
          connectionType = 'HTTP Fallback';
          break;
        default:
          return;
      }

      if (socketInstance) {
        if (customSocket) {
          customSocket.disconnect();
        }

        setupSocketListeners(socketInstance, connectionType);
        setCustomSocket(socketInstance);

        setTimeout(() => {
          if (!socketInstance.connected) {
            console.log(`❌ ${connectionType} connection timeout, trying next method...`);
            socketInstance.disconnect();
            setConnectionAttempts(prev => prev + 1);
          }
        }, 5000);
      }
    } catch (error) {
      console.error(`❌ Error creating ${connectionType} socket:`, error);
      setConnectionAttempts(prev => prev + 1);
    }
  };

  // 소켓 초기화
  useEffect(() => {
    if (user.id && localStorage.getItem('token')) {
      console.log('🚀 Starting socket connection attempts...');
      attemptConnection();
    }

    return () => {
      if (customSocket) {
        customSocket.disconnect();
        console.log('🔌 Custom socket disconnected on unmount');
      }
      clearAllToasts();
    };
  }, [user.id, connectionAttempts]);

  // 수동 재연결 함수
  const handleManualReconnect = () => {
    setConnectionAttempts(0);
    setIsCustomSocketConnected(false);
    if (customSocket) {
      customSocket.disconnect();
    }
    // 세션 새로고침
    sessionManager.refreshSession();
    toast.info('연결을 다시 시도합니다...');
  };

  // 페이지 새로고침 함수
  const handlePageRefresh = () => {
    // 세션 저장
    sessionManager.saveSession();
    window.location.reload();
  };

  // 칸반보드 관련 키워드 체크 함수
  const checkKanbanKeywords = (text) => {
    const kanbanKeywords = [
      '매매이력', '매매현황', '수익현황', '칸반보드', '칸반',
      '거래이력', '거래현황', '투자현황', '포트폴리오',
      '매수현황', '매도현황', '보유현황', '보유종목',
      '수익률', '손익현황', '투자이력'
    ];
    
    const lowerText = text.toLowerCase().replace(/\s/g, '');
    return kanbanKeywords.some(keyword => lowerText.includes(keyword));
  };

  // 커스텀 소켓 메시지 처리 (중복 방지 개선 + 스냅샷 저장)
  useEffect(() => {
    if (activeMenu !== 'home' || !customSocketMessage || processingMessage.current) {
      return;
    }
    
    const { type, data, timestamp, commandId } = customSocketMessage;
    
    const messageUniqueId = `${timestamp}_${type}_${commandId || Date.now()}`;
    
    if (lastMessageIdRef.current === messageUniqueId) {
      console.log('Message already processed:', messageUniqueId);
      return;
    }
    
    processingMessage.current = true;
    lastMessageIdRef.current = messageUniqueId;
    
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
    }
    
    // 스냅샷 데이터 생성
    let snapshot = null;
    
    switch(type) {
      case 'news':
        const articleCount = data?.articles?.length || 0;
        const socialCount = data?.socialMedia?.length || 0;  // socialMedia 필드 확인
        const totalCount = articleCount + socialCount;
        
        console.log('Processing news data:', { 
          articles: articleCount, 
          social: socialCount,
          data: data 
        });
        
        if (totalCount > 0) {
          const message = socialCount > 0 
            ? `${articleCount}개의 뉴스와 ${socialCount}개의 소셜 미디어를 찾았습니다`
            : `${articleCount}개의 뉴스를 찾았습니다`;
            
          toastIdRef.current = toast.success(message);
          setCurrentView('news');
          setViewData(data);  // 전체 데이터를 그대로 전달
          setViewTimestamp(timestamp);
          setIsHistoricalView(false);
          
          // 뉴스 스냅샷 저장 (socialMedia 포함)
          snapshot = {
            type: 'news',
            data: {
              keyword: data.keyword,
              ticker: data.ticker,
              articles: data.articles?.slice(0, 3), // 처음 3개만 저장
              socialMedia: data.socialMedia?.slice(0, 2) // 처음 2개만 저장
            },
            timestamp
          };
          
          addMessage(`뉴스를 찾았습니다: ${data.keyword || data.ticker}`, 'system', messageUniqueId, snapshot);
        }
        break;
        
      case 'kanban':
        if (data.action === 'ADD_CARD') {
          toastIdRef.current = toast.success('칸반 카드가 추가되었습니다');
          setCurrentView('kanban');
          setViewTimestamp(timestamp);
          setIsHistoricalView(false);
          
          // 칸반 스냅샷 저장
          snapshot = {
            type: 'kanban',
            data: data.card,
            timestamp
          };
          
          addMessage(`${data.card.ticker} ${data.card.column} 추가됨`, 'system', messageUniqueId, snapshot);
        }
        break;
        
      case 'market':
        toastIdRef.current = toast.success('시장 데이터를 불러왔습니다');
        setCurrentView('market');
        setViewData(data);
        setViewTimestamp(timestamp);
        setIsHistoricalView(false);
        
        // 시장 데이터 스냅샷 저장
        snapshot = {
          type: 'market',
          data: {
            ticker: data.ticker,
            name: data.name,
            price: data.price,
            change: data.change,
            changePercent: data.changePercent
          },
          timestamp
        };
        
        addMessage(`${data.name || data.ticker}: $${data.price?.toLocaleString()}`, 'system', messageUniqueId, snapshot);
        break;
        
      case 'chart':
        setCurrentView('chart');
        setViewData(data);
        setViewTimestamp(timestamp);
        setIsHistoricalView(false);
        break;
        
      default:
        break;
    }
    
    setTimeout(() => {
      processingMessage.current = false;
    }, 100);
  }, [customSocketMessage, activeMenu]);

  // 메시지 클릭 핸들러
  const handleMessageClick = (message, messageType) => {
    console.log('Message clicked:', message, messageType);
    
    // 홈 메뉴로 전환 (이미 홈이면 유지)
    if (activeMenu !== 'home') {
      setActiveMenu('home');
    }
    
    // 스냅샷 데이터가 있는 경우
    if (message.snapshot) {
      const timeDiff = Date.now() - new Date(message.timestamp).getTime();
      
      // 데이터 타입별 처리
      switch(messageType) {
        case 'news':
          // 뉴스는 5분 이상 지났으면 과거 데이터로 표시
          setIsHistoricalView(timeDiff > 5 * 60 * 1000);
          setCurrentView('news');
          setViewData(message.snapshot.data);
          setViewTimestamp(message.snapshot.timestamp);
          break;
          
        case 'market':
          // 시장 데이터는 1초 이상 지났으면 과거 데이터로 표시
          setIsHistoricalView(timeDiff > 1000);
          setCurrentView('market');
          setViewData(message.snapshot.data);
          setViewTimestamp(message.snapshot.timestamp);
          break;
          
        case 'kanban':
          // 칸반은 현재 데이터를 보여주되, 변경사항 표시
          setCurrentView('kanban');
          setViewTimestamp(message.snapshot.timestamp);
          setIsHistoricalView(false); // 칸반은 항상 현재 상태 표시
          
          // 과거 카드 정보는 별도로 전달
          if (message.snapshot.data) {
            // TODO: KanbanBoard에 하이라이트할 카드 정보 전달
            console.log('Historical card data:', message.snapshot.data);
          }
          break;
          
        default:
          break;
      }
    } else {
      // 스냅샷이 없는 경우 현재 뷰로 이동
      switch(messageType) {
        case 'news':
        case 'market':
        case 'kanban':
          setCurrentView(messageType);
          setIsHistoricalView(false);
          setViewTimestamp(new Date().toISOString());
          break;
      }
    }
  };

  // 커스텀 소켓을 통한 메시지 송신 함수
  const sendCustomMessage = (message, type = 'voice-command') => {
    // 칸반보드 관련 키워드 체크
    if (checkKanbanKeywords(message)) {
      console.log('📋 Kanban keywords detected, switching to kanban view');
      setCurrentView('kanban');
      setViewTimestamp(new Date().toISOString());
      setIsHistoricalView(false);
      toast.success('칸반보드를 표시합니다');
      
      // 칸반보드 표시 메시지를 채팅에 추가
      addMessage('칸반보드를 표시합니다', 'system');
      
      // 원래 메시지도 서버로 전송 (서버에서 추가 처리할 수 있도록)
      if (customSocket && isCustomSocketConnected) {
        const commandId = sessionManager.getCommandId() || `cmd_${user.id}_${Date.now()}`;
        
        customSocket.emit(type, {
          text: message,
          userId: user.id,
          commandId,
          sessionId: sessionManager.getSessionId(),
          timestamp: new Date().toISOString()
        });
        
        sessionManager.updateCommandId(commandId);
        console.log('📤 Message sent via custom socket:', message, 'with commandId:', commandId);
      }
      return;
    }
    
    // 기존 메시지 송신 로직
    if (customSocket && isCustomSocketConnected) {
      const commandId = sessionManager.getCommandId() || `cmd_${user.id}_${Date.now()}`;
      
      customSocket.emit(type, {
        text: message,
        userId: user.id,
        commandId,
        sessionId: sessionManager.getSessionId(),
        timestamp: new Date().toISOString()
      });
      
      // 커맨드 ID 저장
      sessionManager.updateCommandId(commandId);
      console.log('📤 Message sent via custom socket:', message, 'with commandId:', commandId);
    } else {
      console.warn('❌ Custom socket not connected, cannot send message');
      if (activeMenu === 'home') {
        toast.error('서버에 연결되지 않았습니다.');
      }
    }
  };

  // 메시지 추가 함수 (스냅샷 지원)
  const addMessage = (text, sender = 'user', messageId = null, snapshot = null) => {
    setMessages(prev => {
      if (messageId && prev.some(msg => msg.messageId === messageId)) {
        console.log('Duplicate chat message prevented:', messageId);
        return prev;
      }
      
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.text === text && 
          new Date() - lastMessage.timestamp < 1000) {
        return prev;
      }
      
      return [...prev, {
        id: Date.now(),
        messageId: messageId,
        text,
        sender,
        timestamp: new Date(),
        snapshot: snapshot // 스냅샷 데이터 저장
      }];
    });
  };

  const handleVoiceInput = (text) => {
    addMessage(text, 'user');
    
    // 칸반보드 관련 키워드 체크 (음성 입력)
    if (checkKanbanKeywords(text)) {
      console.log('📋 Kanban keywords detected in voice input');
      setCurrentView('kanban');
      setViewTimestamp(new Date().toISOString());
      setIsHistoricalView(false);
      toast.success('칸반보드를 표시합니다');
      addMessage('칸반보드를 표시합니다', 'system');
      
      // 서버에도 메시지 전송 (추가 처리를 위해)
      if (customSocket && isCustomSocketConnected) {
        sendCustomMessage(text);
      } else if (socket && isConnected) {
        sendVoiceCommand(text);
      }
      return;
    }
    
    // 기존 음성 입력 처리
    if (customSocket && isCustomSocketConnected) {
      sendCustomMessage(text);
    } else if (socket && isConnected) {
      sendVoiceCommand(text);
    } else {
      if (activeMenu === 'home') {
        toast.error('서버에 연결되지 않았습니다.');
      }
    }
  };

  // 로그아웃 개선
  const handleLogout = async () => {
    clearAllToasts();
    
    // 세션 정리
    sessionManager.logout();
    
    try {
      await apiUtils.logout();
    } catch (error) {
      console.warn('서버 로그아웃 실패 (무시 가능):', error);
    } finally {
      if (customSocket) {
        customSocket.disconnect();
        setCustomSocket(null);
        setIsCustomSocketConnected(false);
      }
      
      localStorage.clear();
      toast.success('로그아웃 되었습니다.', { duration: 1500 });
      setTimeout(() => {
        onLogout();
      }, 100);
    }
  };

  const renderMainContent = () => {
    if (activeMenu === 'plan') {
      return <PlanManagement />;
    }
    
    if (activeMenu === 'profile') {
      return <Profile user={user} />;
    }

    return (
      <AnimatePresence mode="wait">
        {currentView === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center h-full"
          >
            <div className="text-center">
              <div className="inline-flex items-center justify-center bg-blue-100 p-6 rounded-full mb-6">
                <TrendingUp className="w-16 h-16 text-blue-600" />
              </div>
              <h1 className="text-4xl font-bold text-gray-800 mb-4">
                안녕하세요, {user.username}님!
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                투자비스 AI 어시스턴트가 준비되었습니다
              </p>
              <div className="bg-gray-50 rounded-lg p-6 max-w-lg mx-auto">
                <p className="text-gray-700 mb-4">이렇게 말씀해보세요:</p>
                <div className="space-y-2 text-left">
                  <p className="text-gray-600">• "테슬라 최신 뉴스 보여줘"</p>
                  <p className="text-gray-600">• "SQQQ 17.9불 1천주 매수대기"</p>
                  <p className="text-gray-600">• "나스닥 현재 지수 알려줘"</p>
                  <p className="text-gray-600">• "현재 매매현황 보여줘"</p>
                </div>
              </div>
              
              {/* 연결 상태 및 디버깅 정보 */}
              <div className="mt-6 space-y-4">
                <div className="flex justify-center space-x-4">
                  <div className="flex items-center bg-white px-4 py-2 rounded-lg shadow-sm">
                    <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className="text-sm text-gray-600">
                      Hook Socket: {isConnected ? '연결됨' : '연결 끊김'}
                    </span>
                  </div>
                  <div className="flex items-center bg-white px-4 py-2 rounded-lg shadow-sm">
                    <div className={`w-2 h-2 rounded-full mr-2 ${isCustomSocketConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className="text-sm text-gray-600">
                      Custom Socket: {isCustomSocketConnected ? '연결됨' : '연결 끊김'}
                    </span>
                  </div>
                </div>
                
                {/* 디버깅 정보 */}
                <div className="bg-white p-4 rounded-lg shadow-sm max-w-lg mx-auto">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">연결 정보</h4>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p>연결 시도: {connectionAttempts + 1}/4</p>
                    <p>토큰 존재: {localStorage.getItem('token') ? '✅' : '❌'}</p>
                    <p>사용자 ID: {user.id || '없음'}</p>
                    <p>세션 ID: {sessionId || sessionManager.getSessionId() || '없음'}</p>
                    {customSocket && (
                      <p>소켓 ID: {customSocket.id || '연결 중...'}</p>
                    )}
                  </div>
                  
                  <div className="flex gap-2 mt-3">
                    {!isAnySocketConnected && (
                      <button
                        onClick={handleManualReconnect}
                        className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        다시 연결
                      </button>
                    )}
                    <button
                      onClick={handlePageRefresh}
                      className="flex-1 px-4 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition-colors"
                    >
                      페이지 새로고침
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        
        {currentView === 'news' && (
          <motion.div
            key="news"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {viewTimestamp && (
              <DataFreshnessIndicator 
                type="news"
                timestamp={viewTimestamp}
              />
            )}
            <NewsDisplay 
              data={viewData} 
              isConnected={isAnySocketConnected}
              isHistorical={isHistoricalView}
            />
          </motion.div>
        )}
        
        {currentView === 'market' && (
          <motion.div
            key="market"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {viewTimestamp && (
              <DataFreshnessIndicator 
                type="market"
                timestamp={viewTimestamp}
              />
            )}
            <MarketDisplay 
              data={viewData} 
              isConnected={isAnySocketConnected}
              isHistorical={isHistoricalView}
            />
          </motion.div>
        )}
        
        {currentView === 'kanban' && (
          <motion.div
            key="kanban"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {viewTimestamp && (
              <DataFreshnessIndicator 
                type="kanban"
                timestamp={viewTimestamp}
              />
            )}
            <KanbanBoard 
              socket={customSocket || socket} 
              lastMessage={customSocketMessage || lastMessage}
            />
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Chat Panel */}
      <div className="w-1/4 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">투자비스 AI</h2>
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full ${isAnySocketConnected ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="ml-2 text-sm text-white opacity-90">
                {isAnySocketConnected ? '연결됨' : '연결 끊김'}
              </span>
            </div>
          </div>
        </div>
        
        <ChatPanel 
          messages={messages} 
          className="flex-1 overflow-y-auto"
          isConnected={isAnySocketConnected}
          isInitializing={false}
          isLoading={false}
          error={null}
          disabled={false}
          onMessageClick={handleMessageClick}
        />
        
        <VoiceRecorder 
          onTranscript={handleVoiceInput}
          className="border-t bg-gray-50"
          isConnected={isAnySocketConnected}
          disabled={false}
        />
      </div>
      
      {/* Right Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1">
              <button
                onClick={() => { 
                  setActiveMenu('home'); 
                  clearAllToasts();
                  lastProcessedMessageId.current = null;
                  lastMessageIdRef.current = null;
                  setIsHistoricalView(false);
                }}
                className={`flex items-center px-4 py-2 rounded-lg transition ${
                  activeMenu === 'home' 
                    ? 'bg-blue-50 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Home className="w-5 h-5 mr-2" />
                홈
              </button>
              <button
                onClick={() => { 
                  setActiveMenu('plan'); 
                  clearAllToasts(); 
                }}
                className={`flex items-center px-4 py-2 rounded-lg transition ${
                  activeMenu === 'plan' 
                    ? 'bg-blue-50 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <CreditCard className="w-5 h-5 mr-2" />
                플랜관리
              </button>
              <button
                onClick={() => { 
                  setActiveMenu('profile'); 
                  clearAllToasts(); 
                }}
                className={`flex items-center px-4 py-2 rounded-lg transition ${
                  activeMenu === 'profile' 
                    ? 'bg-blue-50 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <User className="w-5 h-5 mr-2" />
                프로필
              </button>
            </div>
            
            <button
              onClick={handleLogout}
              className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition"
            >
              <LogOut className="w-5 h-5 mr-2" />
              로그아웃
            </button>
          </div>
        </header>
        
        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="space-y-4 w-full max-w-4xl">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            renderMainContent()
          )}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;