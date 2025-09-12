import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { Bot, User, Loader2, AlertCircle, ExternalLink, Clock, TrendingUp, Newspaper, Layout } from 'lucide-react';

// Simple toast implementation if react-hot-toast is not available
const toast = {
  success: (message) => {
    console.log('Success:', message);
  },
  error: (message) => {
    console.error('Error:', message);
  }
};

const ChatPanel = ({ 
  messages, 
  className = '', 
  isConnected = false, 
  isInitializing = false, 
  isLoading = false, 
  error = null,
  disabled = false,
  onMessageClick = null 
}) => {
  const messagesEndRef = useRef(null);
  const [hoveredMessage, setHoveredMessage] = useState(null);

  // Memoize messages to prevent unnecessary re-renders
  const memoizedMessages = useMemo(() => messages, [messages]);

  // Auto-scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [memoizedMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (messagesEndRef.current) {
        messagesEndRef.current = null;
      }
    };
  }, []);

  // 메시지 타입 판별
  const getMessageType = (message) => {
    if (!message.text || message.sender === 'user') return null;
    
    const text = message.text.toLowerCase();
    
    // 칸반 관련
    if (text.includes('추가됨') || text.includes('추가했습니다')) {
      if (text.includes('buy-') || text.includes('sell-') || 
          text.includes('매수') || text.includes('매도')) {
        return 'kanban';
      }
    }
    
    // 뉴스 관련
    if (text.includes('뉴스') || text.includes('news')) {
      return 'news';
    }
    
    // 시장 데이터 관련
    if (text.includes('현재가') || text.includes('지수') || 
        text.includes('가격') || (text.includes('$') && !text.includes('추가'))) {
      return 'market';
    }
    
    return null;
  };

  // 메시지 타입별 아이콘
  const getMessageIcon = (type) => {
    switch(type) {
      case 'kanban':
        return <Layout className="w-3 h-3" />;
      case 'news':
        return <Newspaper className="w-3 h-3" />;
      case 'market':
        return <TrendingUp className="w-3 h-3" />;
      default:
        return null;
    }
  };

  // 메시지 클릭 핸들러
  const handleMessageClick = (message) => {
    const messageType = getMessageType(message);
    
    if (!messageType || !onMessageClick || message.sender === 'user') {
      return;
    }
    
    onMessageClick(message, messageType);
  };

  // Show initializing state
  if (isInitializing) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="flex items-center justify-center py-10">
          <div className="flex space-x-1 mr-2">
            <div className="w-1 h-3 bg-gray-400 rounded-full animate-pulse" />
            <div className="w-1 h-3 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
            <div className="w-1 h-3 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
          </div>
          <span className="text-sm text-gray-600">채팅 초기화 중...</span>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
          <span className="text-gray-600">메시지를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    toast.error(error);
    return (
      <div className={`p-4 ${className}`}>
        <div className="flex items-center justify-center py-10 text-red-600">
          <AlertCircle className="w-4 h-4 mr-2" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  // Show connection error or disabled state
  if (!isConnected || disabled) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="flex items-center justify-center py-10">
          <AlertCircle className={`w-4 h-4 mr-2 ${isConnected ? 'text-gray-400' : 'text-yellow-600'}`} />
          <span className={`text-sm ${isConnected ? 'text-gray-500' : 'text-yellow-600'}`}>
            {!isConnected ? '서버 연결이 끊겼습니다. 재연결을 시도해주세요.' : '채팅 기능이 비활성화되었습니다.'}
          </span>
        </div>
        <div className={`mt-2 text-xs text-center ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
          {isConnected ? '● 서버 연결됨' : '● 서버 연결 끊김'}
        </div>
      </div>
    );
  }

  // Show empty state if no messages
  if (!memoizedMessages || memoizedMessages.length === 0) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="text-center py-10 text-gray-500">
          <p className="text-sm">대화가 없습니다.</p>
          <p className="text-xs mt-1 text-gray-400">음성 명령으로 대화를 시작하세요. 예: "테슬라 뉴스 보여줘"</p>
        </div>
        <div className={`mt-2 text-xs text-center ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
          {isConnected ? '● 서버 연결됨' : '● 서버 연결 끊김'}
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">대화</h2>
        <div
          className={`text-xs flex items-center ${
            isConnected ? 'text-green-600' : 'text-red-600'
          }`}
          aria-label={isConnected ? '서버 연결됨' : '서버 연결 끊김'}
        >
          <span className="mr-1">●</span>
          {isConnected ? '서버 연결됨' : '서버 연결 끊김'}
        </div>
      </div>
      <div className="space-y-4 max-h-full overflow-y-auto">
        {memoizedMessages.map((message) => {
          const messageType = getMessageType(message);
          const isClickable = messageType && onMessageClick && message.sender !== 'user';
          
          return (
            <div
              key={`${message.id}-${message.timestamp}`}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              role="listitem"
              aria-label={message.sender === 'user' ? '사용자 메시지' : '봇 메시지'}
              onMouseEnter={() => setHoveredMessage(message.id)}
              onMouseLeave={() => setHoveredMessage(null)}
            >
              <div
                className={`flex items-start max-w-[80%] ${
                  message.sender === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                <div
                  className={`flex-shrink-0 ${
                    message.sender === 'user' ? 'ml-2' : 'mr-2'
                  }`}
                >
                  {message.sender === 'user' ? (
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-white" aria-hidden="true" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                      <Bot className="w-5 h-5 text-white" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div
                  className={`rounded-lg px-4 py-2 ${
                    message.sender === 'user'
                      ? 'bg-blue-600 text-white'
                      : isClickable 
                        ? 'bg-gray-100 text-gray-800 cursor-pointer hover:bg-gray-200 transition-colors'
                        : 'bg-gray-100 text-gray-800'
                  }`}
                  onClick={() => isClickable && handleMessageClick(message)}
                >
                  <div className="flex items-start gap-2">
                    <p className="text-sm flex-1">{message.text}</p>
                    {isClickable && hoveredMessage === message.id && (
                      <div className="flex items-center gap-1 opacity-60">
                        {getMessageIcon(messageType)}
                        <ExternalLink className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <p
                      className={`text-xs ${
                        message.sender === 'user' ? 'text-blue-100' : 'text-gray-500'
                      }`}
                    >
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                    {isClickable && (
                      <span className="text-xs text-gray-400">
                        클릭하여 이동
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatPanel;
