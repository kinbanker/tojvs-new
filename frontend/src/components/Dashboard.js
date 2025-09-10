import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, CreditCard, User, LogOut, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';
import { useSocket } from '../hooks/useSocket';
import VoiceRecorder from './VoiceRecorder';
import ChatPanel from './ChatPanel';
import KanbanBoard from './KanbanBoard';
import NewsDisplay from './NewsDisplay';
import PlanManagement from './PlanManagement';
import Profile from './Profile';
import apiUtils from '../utils/api';

const Dashboard = ({ onLogout }) => {
  const [activeMenu, setActiveMenu] = useState('home');
  const [currentView, setCurrentView] = useState('welcome');
  const [viewData, setViewData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [customSocket, setCustomSocket] = useState(null);
  const [isCustomSocketConnected, setIsCustomSocketConnected] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const { isConnected, lastMessage, sendVoiceCommand, socket } = useSocket(user.id);

  // 통합 연결 상태 - customSocket 또는 useSocket 중 하나라도 연결되어 있으면 true
  const isAnySocketConnected = isCustomSocketConnected || isConnected;

  // 소켓 연결 함수들
  const createSocketWithPolling = () => {
    console.log('🔄 Trying Socket.IO with polling transport...');
    return io('https://dev.tojvs.com', {
      path: '/socket.io/',
      transports: ['polling'], // WebSocket 제외, polling만 사용
      upgrade: false, // WebSocket으로 업그레이드 방지
      auth: {
        token: localStorage.getItem('token')
      },
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 2000,
      timeout: 10000
    });
  };

  const createSocketWithWebsocket = () => {
    console.log('🔄 Trying Socket.IO with websocket transport...');
    return io('https://dev.tojvs.com', {
      path: '/socket.io/',
      transports: ['websocket'],
      forceNew: true,
      auth: {
        token: localStorage.getItem('token')
      },
      reconnection: true,
      reconnectionAttempts: 2,
      reconnectionDelay: 1000,
      timeout: 5000
    });
  };

  const createSocketRelativePath = () => {
    console.log('🔄 Trying Socket.IO with relative path...');
    return io('/', {
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      auth: {
        token: localStorage.getItem('token')
      },
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000
    });
  };

  const createSocketHttp = () => {
    console.log('🔄 Trying Socket.IO with HTTP (fallback)...');
    return io('http://dev.tojvs.com', {
      path: '/socket.io/',
      transports: ['polling'],
      auth: {
        token: localStorage.getItem('token')
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
      toast.success(`서버에 연결되었습니다 (${connectionType})`);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log(`❌ ${connectionType} socket disconnected:`, reason);
      setIsCustomSocketConnected(false);
      if (reason !== 'io client disconnect') {
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
      toast.success('서버에 재연결되었습니다.');
    });

    // 커스텀 소켓의 메시지 처리
    socketInstance.on('command-result', (message) => {
      console.log('Received result via custom socket:', message);
      setLastMessage(message);
      
      // Show success message based on type
      if (message.type === 'kanban') {
        toast.success('칸반 카드가 추가되었습니다');
      } else if (message.type === 'news') {
        toast.success('뉴스를 찾았습니다');
      }
    });

    socketInstance.on('processing', (status) => {
      console.log('Processing status:', status);
      if (status.message) {
        toast.loading(status.message, { duration: 2000 });
      }
    });

    socketInstance.on('error', (error) => {
      console.error('Server error:', error);
      toast.error(error.message || '오류가 발생했습니다');
    });

    return socketInstance;
  };

  // 다중 연결 시도 함수
  const attemptConnection = async () => {
    if (connectionAttempts >= 4) {
      console.log('❌ All connection attempts failed');
      toast.error('서버 연결에 실패했습니다. 모든 방법을 시도했습니다.');
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
        // 기존 소켓이 있다면 정리
        if (customSocket) {
          customSocket.disconnect();
        }

        setupSocketListeners(socketInstance, connectionType);
        setCustomSocket(socketInstance);

        // 연결 시도 후 잠시 대기
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
    };
  }, [user.id, connectionAttempts]);

  // 수동 재연결 함수
  const handleManualReconnect = () => {
    setConnectionAttempts(0);
    setIsCustomSocketConnected(false);
    if (customSocket) {
      customSocket.disconnect();
    }
    toast.info('연결을 다시 시도합니다...');
  };

  // 기존 useSocket 훅의 lastMessage 처리
  useEffect(() => {
    if (lastMessage) {
      const { type, data } = lastMessage;
      
      switch(type) {
        case 'news':
          setCurrentView('news');
          setViewData(data);
          addMessage(`뉴스를 찾았습니다: ${data.keyword}`, 'system');
          break;
          
        case 'kanban':
          setCurrentView('kanban');
          if (data.action === 'ADD_CARD') {
            addMessage(`${data.card.ticker} ${data.card.column} 추가됨`, 'system');
          }
          break;
          
        case 'chart':
          setCurrentView('chart');
          setViewData(data);
          break;
          
        default:
          break;
      }
    }
  }, [lastMessage]);

  // 커스텀 소켓을 통한 메시지 송신 함수
  const sendCustomMessage = (message, type = 'voice-command') => {
    if (customSocket && isCustomSocketConnected) {
      customSocket.emit(type, {
        text: message,
        userId: user.id,
        timestamp: new Date().toISOString()
      });
      console.log('📤 Message sent via custom socket:', message);
    } else {
      console.warn('❌ Custom socket not connected, cannot send message');
      toast.error('서버에 연결되지 않았습니다.');
    }
  };

  const addMessage = (text, sender = 'user') => {
    setMessages(prev => [...prev, {
      id: Date.now(),
      text,
      sender,
      timestamp: new Date()
    }]);
  };

  const handleVoiceInput = (text) => {
    addMessage(text, 'user');
    
    // 우선순위: 커스텀 소켓 → useSocket 훅
    if (customSocket && isCustomSocketConnected) {
      sendCustomMessage(text);
    } else if (socket && isConnected) {
      sendVoiceCommand(text);
    } else {
      toast.error('서버에 연결되지 않았습니다.');
    }
  };

  // 로그아웃 개선
  const handleLogout = async () => {
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
      toast.success('로그아웃 되었습니다.');
      onLogout();
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
                    {customSocket && (
                      <p>소켓 ID: {customSocket.id || '연결 중...'}</p>
                    )}
                  </div>
                  
                  {!isAnySocketConnected && (
                    <button
                      onClick={handleManualReconnect}
                      className="mt-3 px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
                    >
                      다시 연결 시도
                    </button>
                  )}
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
            <NewsDisplay data={viewData} />
          </motion.div>
        )}
        
        {currentView === 'kanban' && (
          <motion.div
            key="kanban"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <KanbanBoard socket={customSocket || socket} />
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
                onClick={() => setActiveMenu('home')}
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
                onClick={() => setActiveMenu('plan')}
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
                onClick={() => setActiveMenu('profile')}
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