import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, CreditCard, User, LogOut, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSocket } from '../hooks/useSocket';
import VoiceRecorder from './VoiceRecorder';
import ChatPanel from './ChatPanel';
import KanbanBoard from './KanbanBoard';
import NewsDisplay from './NewsDisplay';
import PlanManagement from './PlanManagement';
import Profile from './Profile';
import apiUtils from '../utils/api'; // ✅ 추가

const Dashboard = ({ onLogout }) => {
  const [activeMenu, setActiveMenu] = useState('home');
  const [currentView, setCurrentView] = useState('welcome');
  const [viewData, setViewData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const { isConnected, lastMessage, sendVoiceCommand, socket } = useSocket(user.id);

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
    sendVoiceCommand(text);
  };

  // ✅ 로그아웃 개선: 서버 API 호출 → 로컬스토리지 정리
  const handleLogout = async () => {
    try {
      await apiUtils.logout(); // 서버에 refreshToken 무효화 요청
    } catch (error) {
      console.warn('서버 로그아웃 실패 (무시 가능):', error);
    } finally {
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
            <KanbanBoard socket={socket} />
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
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="ml-2 text-sm text-white opacity-90">
                {isConnected ? '연결됨' : '연결 끊김'}
              </span>
            </div>
          </div>
        </div>
        
        <ChatPanel messages={messages} className="flex-1 overflow-y-auto" />
        
        <VoiceRecorder 
          onTranscript={handleVoiceInput}
          className="border-t bg-gray-50"
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
