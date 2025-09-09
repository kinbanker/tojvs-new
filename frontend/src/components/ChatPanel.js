import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { Bot, User, Loader2, AlertCircle } from 'lucide-react';

// Simple toast implementation if react-hot-toast is not available (VoiceRecorder.js와 일관)
const toast = {
  success: (message) => {
    console.log('Success:', message);
    // You can implement a simple toast UI here if needed
  },
  error: (message) => {
    console.error('Error:', message);
    // You can implement a simple toast UI here if needed
  }
};

const ChatPanel = ({ 
  messages, 
  className = '', 
  isConnected = false, 
  isInitializing = false, 
  isLoading = false, 
  error = null,
  disabled = false 
}) => {
  const messagesEndRef = useRef(null);

  // Memoize messages to prevent unnecessary re-renders
  const memoizedMessages = useMemo(() => messages, [messages]);

  // Auto-scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [memoizedMessages]);

  // Cleanup on unmount (VoiceRecorder.js 스타일)
  useEffect(() => {
    return () => {
      // Clear any pending scroll if needed
      if (messagesEndRef.current) {
        messagesEndRef.current = null;
      }
    };
  }, []);

  // Show initializing state (VoiceRecorder.js처럼 초기화 중 표시)
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
    toast.error(error); // VoiceRecorder.js처럼 toast 호출
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
        {/* Connection status indicator */}
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
        {/* Connection status indicator */}
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
        {/* Connection status indicator (VoiceRecorder.js 스타일) */}
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
        {memoizedMessages.map((message) => (
          <div
            key={`${message.id}-${message.timestamp}`} // 안정적 키 생성
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            role="listitem"
            aria-label={message.sender === 'user' ? '사용자 메시지' : '봇 메시지'}
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
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <p className="text-sm">{message.text}</p>
                <p
                  className={`text-xs mt-1 ${
                    message.sender === 'user' ? 'text-blue-100' : 'text-gray-500'
                  }`}
                >
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatPanel;