import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, AlertCircle, Keyboard, Send } from 'lucide-react';

// Simple toast implementation if react-hot-toast is not available
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

const VoiceRecorder = ({ 
  onTranscript, 
  className = '',
  isConnected = false,
  disabled = false,
  isReconnecting = false,  // 재연결 시도 상태 추가
  connectionAttempts = 0    // 연결 시도 횟수 추가
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [inputMode, setInputMode] = useState('voice'); // 'voice' or 'keyboard'
  const [keyboardInput, setKeyboardInput] = useState('');
  
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const inputRef = useRef(null);

  // 연결 상태 메시지 헬퍼 함수
  const getConnectionMessage = () => {
    if (isConnected) {
      return null;
    } else if (isReconnecting) {
      return '서버 재연결 시도 중...';
    } else if (connectionAttempts >= 4) {
      return '서버 연결 대기중...';
    } else {
      return '서버 연결 중...';
    }
  };

  // Cleanup function
  const cleanup = useCallback(() => {
    // Clear timers
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    // Stop recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        console.log('Recognition cleanup:', e.message);
      }
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    setIsRecording(false);
    setTranscript('');
  }, []);

  useEffect(() => {
    // Check browser support
    const SpeechRecognition = window.webkitSpeechRecognition || 
                              window.SpeechRecognition || 
                              window.mozSpeechRecognition || 
                              window.msSpeechRecognition;
    
    if (!SpeechRecognition) {
      setIsSupported(false);
      setError('음성 인식이 지원되지 않는 브라우저입니다.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      
      // Configure recognition
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ko-KR';
      recognition.maxAlternatives = 1;
      
      // Handle results
      recognition.onresult = (event) => {
        clearTimeout(silenceTimerRef.current);
        
        const current = event.resultIndex;
        const transcript = event.results[current][0].transcript;
        
        setTranscript(transcript);
        
        if (event.results[current].isFinal) {
          console.log('Final transcript:', transcript);
          
          // Send transcript if it's not empty
          if (transcript.trim() && onTranscript) {
            // Check connection before sending - 재연결 중에는 경고하지 않음
            if (!isConnected && !isReconnecting && connectionAttempts >= 4) {
              setError('서버 연결이 끊겼습니다. 잠시 후 다시 시도해주세요.');
              toast.error('서버 연결이 끊겼습니다.');
              cleanup();
              return;
            }
            
            // Call parent's handler
            onTranscript(transcript.trim());
            toast.success('음성 인식 완료');
          }
          
          setTranscript('');
          
          // Auto-stop after final result
          silenceTimerRef.current = setTimeout(() => {
            if (recognitionRef.current && isRecording) {
              stopRecording();
            }
          }, 2000);
        }
      };
      
      // Handle errors
      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        
        let errorMessage = '음성 인식 오류가 발생했습니다.';
        let shouldStop = true;
        
        switch(event.error) {
          case 'network':
            errorMessage = '네트워크 오류가 발생했습니다.';
            break;
          case 'not-allowed':
            errorMessage = '마이크 권한이 거부되었습니다. 브라우저 설정을 확인해주세요.';
            break;
          case 'no-speech':
            errorMessage = '음성이 감지되지 않았습니다.';
            shouldStop = false; // Continue listening
            break;
          case 'audio-capture':
            errorMessage = '마이크를 찾을 수 없습니다.';
            break;
          case 'aborted':
            console.log('Speech recognition aborted');
            shouldStop = true;
            break;
          case 'service-not-allowed':
            errorMessage = 'HTTPS 연결이 필요합니다.';
            break;
          default:
            errorMessage = `음성 인식 오류: ${event.error}`;
        }
        
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          setError(errorMessage);
          toast.error(errorMessage);
        }
        
        if (shouldStop) {
          cleanup();
        }
      };
      
      // Handle end
      recognition.onend = () => {
        console.log('Speech recognition ended');
        setIsRecording(false);
        clearTimeout(silenceTimerRef.current);
        setIsInitializing(false);
      };
      
      // Handle start
      recognition.onstart = () => {
        console.log('Speech recognition started');
        setError(null);
        setIsInitializing(false);
      };
      
      // No speech detected
      recognition.onspeechend = () => {
        console.log('Speech ended');
      };
      
      // Audio start/end events
      recognition.onaudiostart = () => {
        console.log('Audio capturing started');
      };
      
      recognition.onaudioend = () => {
        console.log('Audio capturing ended');
      };
      
      recognitionRef.current = recognition;
      
    } catch (error) {
      console.error('Failed to initialize speech recognition:', error);
      setIsSupported(false);
      setError('음성 인식 초기화 실패');
    }
    
    // Cleanup on unmount
    return () => {
      cleanup();
    };
  }, [onTranscript, isConnected, isReconnecting, connectionAttempts, cleanup]);

  const startRecording = async () => {
    // Check prerequisites
    if (!isSupported || !recognitionRef.current) {
      toast.error('음성 인식을 사용할 수 없습니다.');
      return;
    }

    // 재연결 중이 아니고 4회 시도 후 실패한 경우에만 에러 표시
    if (!isConnected && !isReconnecting && connectionAttempts >= 4) {
      setError('서버와 연결되지 않았습니다.');
      toast.error('서버와 연결되지 않았습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    if (disabled) {
      toast.error('음성 인식이 비활성화되어 있습니다.');
      return;
    }

    if (isInitializing) {
      console.log('Already initializing...');
      return;
    }

    try {
      setIsInitializing(true);
      setError(null);
      
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      // Start recognition
      recognitionRef.current.start();
      setIsRecording(true);
      toast.success('음성 인식을 시작합니다. 말씀해주세요.');
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      setIsInitializing(false);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setError('마이크 권한이 거부되었습니다.');
        toast.error('마이크 사용 권한을 허용해주세요.');
      } else if (error.name === 'NotFoundError') {
        setError('마이크를 찾을 수 없습니다.');
        toast.error('마이크가 연결되어 있는지 확인해주세요.');
      } else if (error.name === 'SecureContextRequiredError') {
        setError('HTTPS 연결이 필요합니다.');
        toast.error('보안 연결(HTTPS)이 필요합니다.');
      } else {
        setError('음성 인식 시작 실패');
        toast.error('음성 인식을 시작할 수 없습니다.');
      }
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current && isRecording) {
      try {
        console.log('Stopping recording...');
        recognitionRef.current.stop();
        
        // Cleanup media stream
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
        }
        
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      } catch (error) {
        console.error('Failed to stop recording:', error);
        cleanup();
      }
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Handle keyboard input submission
  const handleKeyboardSubmit = (e) => {
    e?.preventDefault();
    
    if (!keyboardInput.trim()) {
      return;
    }

    // 재연결 중이 아니고 4회 시도 후 실패한 경우에만 에러 표시
    if (!isConnected && !isReconnecting && connectionAttempts >= 4) {
      setError('서버 연결이 끊겼습니다. 잠시 후 다시 시도해주세요.');
      toast.error('서버 연결이 끊겼습니다.');
      return;
    }

    if (disabled) {
      toast.error('입력이 비활성화되어 있습니다.');
      return;
    }

    // Send the keyboard input
    if (onTranscript) {
      onTranscript(keyboardInput.trim());
      toast.success('메시지 전송 완료');
    }

    // Clear the input
    setKeyboardInput('');
  };

  // Handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleKeyboardSubmit();
    }
  };

  // Toggle between voice and keyboard input modes
  const toggleInputMode = () => {
    setInputMode(prevMode => {
      const newMode = prevMode === 'voice' ? 'keyboard' : 'voice';
      
      // If switching to keyboard mode, focus the input
      if (newMode === 'keyboard') {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      
      // If switching from voice mode while recording, stop recording
      if (prevMode === 'voice' && isRecording) {
        stopRecording();
      }
      
      return newMode;
    });
    setError(null);
  };

  // 연결 상태 메시지 가져오기
  const connectionMessage = getConnectionMessage();

  // Show unsupported message only for voice mode
  if (!isSupported && inputMode === 'voice') {
    return (
      <div className={`p-4 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <div>
              <p className="text-sm font-medium">음성 인식 불가</p>
              <p className="text-xs">{error || 'Chrome, Edge, Safari 브라우저를 사용해주세요.'}</p>
            </div>
          </div>
          <button
            onClick={toggleInputMode}
            className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
            title="키보드 입력으로 전환"
          >
            <Keyboard className="w-5 h-5 text-blue-600" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 ${className}`}>
      {/* Input Mode Toggle Button */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-600">
          {inputMode === 'voice' ? '음성 입력' : '키보드 입력'}
        </span>
        <button
          onClick={toggleInputMode}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
          title={inputMode === 'voice' ? '키보드 입력으로 전환' : '음성 입력으로 전환'}
        >
          {inputMode === 'voice' ? (
            <>
              <Keyboard className="w-4 h-4 text-gray-600" />
              <span className="text-sm text-gray-600">키보드</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 text-gray-600" />
              <span className="text-sm text-gray-600">음성</span>
            </>
          )}
        </button>
      </div>

      {/* Voice Input Mode */}
      {inputMode === 'voice' && (
        <div className="flex items-center space-x-3">
          <button
            onClick={toggleRecording}
            disabled={disabled || (!isConnected && !isReconnecting && connectionAttempts >= 4) || isInitializing}
            className={`relative p-3 rounded-full transition-all ${
              isRecording 
                ? 'bg-red-500 hover:bg-red-600' 
                : disabled || (!isConnected && !isReconnecting && connectionAttempts >= 4)
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
            } ${error ? 'ring-2 ring-red-400' : ''}`}
            title={
              !isConnected && !isReconnecting && connectionAttempts >= 4
                ? '서버 연결 대기중' 
                : disabled 
                  ? '음성 인식 비활성화' 
                  : isRecording 
                    ? '녹음 중지' 
                    : '녹음 시작'
            }
          >
            {isRecording ? (
              <>
                <MicOff className="w-6 h-6 text-white" />
                <span className="absolute top-0 right-0 w-3 h-3 bg-red-400 rounded-full animate-pulse" />
              </>
            ) : (
              <Mic className={`w-6 h-6 ${disabled || (!isConnected && !isReconnecting && connectionAttempts >= 4) ? 'text-gray-300' : 'text-white'}`} />
            )}
          </button>
          
          <div className="flex-1">
            {isInitializing && (
              <div className="flex items-center">
                <div className="flex space-x-1 mr-2">
                  <div className="w-1 h-3 bg-gray-400 rounded-full animate-pulse" />
                  <div className="w-1 h-3 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
                  <div className="w-1 h-3 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                </div>
                <span className="text-sm text-gray-600">초기화 중...</span>
              </div>
            )}
            
            {isRecording && !isInitializing && (
              <div className="flex items-center">
                <div className="flex space-x-1 mr-2">
                  <div className="w-1 h-4 bg-blue-400 rounded-full animate-bounce" />
                  <div className="w-1 h-4 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-1 h-4 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
                <span className="text-sm text-gray-600">듣고 있습니다...</span>
              </div>
            )}
            
            {transcript && (
              <div className="mt-1">
                <p className="text-sm text-gray-700 italic">"{transcript}"</p>
              </div>
            )}
            
            {connectionMessage && !isRecording && (
              <div className={`flex items-center ${isReconnecting ? 'text-gray-600' : 'text-yellow-600'}`}>
                <AlertCircle className="w-4 h-4 mr-1" />
                <p className="text-sm">{connectionMessage}</p>
              </div>
            )}
            
            {isConnected && !isRecording && !transcript && !error && !isInitializing && (
              <div>
                <p className="text-sm text-gray-500">마이크를 클릭하여 음성 명령을 시작하세요</p>
                <p className="text-xs text-gray-400 mt-1">예: "테슬라 뉴스 보여줘", "SQQQ 17불 100주 매수대기"</p>
              </div>
            )}
            
            {error && !isRecording && (
              <div className="flex items-center text-red-600">
                <AlertCircle className="w-4 h-4 mr-1" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Keyboard Input Mode */}
      {inputMode === 'keyboard' && (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <input
              ref={inputRef}
              type="text"
              value={keyboardInput}
              onChange={(e) => setKeyboardInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={disabled || (!isConnected && !isReconnecting && connectionAttempts >= 4)}
              placeholder={
                connectionMessage || '메시지를 입력하세요 (Enter로 전송)'
              }
              className={`flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                disabled || (!isConnected && !isReconnecting && connectionAttempts >= 4)
                  ? 'bg-gray-100 border-gray-300 cursor-not-allowed' 
                  : 'bg-white border-gray-300 focus:ring-blue-500 focus:border-blue-500'
              }`}
            />
            <button
              onClick={handleKeyboardSubmit}
              disabled={disabled || (!isConnected && !isReconnecting && connectionAttempts >= 4) || !keyboardInput.trim()}
              className={`p-2.5 rounded-lg transition-all ${
                disabled || (!isConnected && !isReconnecting && connectionAttempts >= 4) || !keyboardInput.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
              title="메시지 전송"
            >
              <Send className={`w-5 h-5 ${
                disabled || (!isConnected && !isReconnecting && connectionAttempts >= 4) || !keyboardInput.trim() 
                  ? 'text-gray-300' 
                  : 'text-white'
              }`} />
            </button>
          </div>
          
          {connectionMessage && (
            <div className={`flex items-center ${isReconnecting ? 'text-gray-600' : 'text-yellow-600'}`}>
              <AlertCircle className="w-4 h-4 mr-1" />
              <p className="text-sm">{connectionMessage}</p>
            </div>
          )}
          
          {isConnected && !error && (
            <p className="text-xs text-gray-400">
              예: "테슬라 뉴스 보여줘", "SQQQ 17불 100주 매수대기", "나스닥 현재 지수"
            </p>
          )}
          
          {error && (
            <div className="flex items-center text-red-600">
              <AlertCircle className="w-4 h-4 mr-1" />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>
      )}
      
      {/* Connection status indicator */}
      <div className={`mt-2 text-xs ${
        isConnected ? 'text-green-600' : 
        isReconnecting ? 'text-gray-600' : 
        'text-red-600'
      }`}>
        {isConnected ? '● 서버 연결됨' : 
         isReconnecting ? '● 재연결 시도 중' : 
         '● 서버 연결 끊김'}
      </div>
    </div>
  );
};

export default VoiceRecorder;