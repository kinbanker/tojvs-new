import React, { useEffect, useRef } from 'react';
import { Bot, User, WifiOff, Wifi } from 'lucide-react';

const ChatPanel = ({ messages, className, isConnected = true }) => {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Connection Status Bar */}
      {!isConnected && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2">
          <div className="flex items-center text-red-600">
            <WifiOff className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">서버 연결 끊김</span>
          </div>
        </div>
      )}
      
      {/* Messages Area */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <div className="flex items-center justify-center mb-3">
                {isConnected ? (
                  <Wifi className="w-8 h-8 text-green-500" />
                ) : (
                  <WifiOff className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <p className="text-gray-500">
                {isConnected 
                  ? '대화를 시작해보세요' 
                  : '서버 연결 대기중...'}
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex items-start max-w-[80%] ${
                  message.sender === 'user' ? 'flex-row-reverse' : ''
                }`}>
                  <div className={`flex-shrink-0 ${
                    message.sender === 'user' ? 'ml-2' : 'mr-2'
                  }`}>
                    {message.sender === 'user' ? (
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </div>
                  
                  <div className={`rounded-lg px-4 py-2 ${
                    message.sender === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    <p className="text-sm">{message.text}</p>
                    <p className={`text-xs mt-1 ${
                      message.sender === 'user' ? 'text-blue-100' : 'text-gray-500'
                    }`}>
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;