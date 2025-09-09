import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, AlertCircle } from 'lucide-react';

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
  disabled = false 
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const mediaStreamRef = useRef(null);

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
            // Check connection before sending
            if (!isConnected) {
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
  }, [onTranscript, isConnected, cleanup]);

  const startRecording = async () => {
    // Check prerequisites
    if (!isSupported || !recognitionRef.current) {
      toast.error('음성 인식을 사용할 수 없습니다.');
      return;
    }

    if (!isConnected) {
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

  // Show unsupported message
  if (!isSupported) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="flex items-center space-x-3 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <div>
            <p className="text-sm font-medium">음성 인식 불가</p>
            <p className="text-xs">{error || 'Chrome, Edge, Safari 브라우저를 사용해주세요.'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 ${className}`}>
      <div className="flex items-center space-x-3">
        <button
          onClick={toggleRecording}
          disabled={disabled || !isConnected || isInitializing}
          className={`relative p-3 rounded-full transition-all ${
            isRecording 
              ? 'bg-red-500 hover:bg-red-600' 
              : disabled || !isConnected
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
          } ${error ? 'ring-2 ring-red-400' : ''}`}
          title={
            !isConnected 
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
            <Mic className={`w-6 h-6 ${disabled || !isConnected ? 'text-gray-300' : 'text-white'}`} />
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
          
          {!isConnected && !isRecording && (
            <div className="flex items-center text-yellow-600">
              <AlertCircle className="w-4 h-4 mr-1" />
              <p className="text-sm">서버 연결 대기중...</p>
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
      
      {/* Connection status indicator */}
      <div className={`mt-2 text-xs ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
        {isConnected ? '● 서버 연결됨' : '● 서버 연결 끊김'}
      </div>
    </div>
  );
};

export default VoiceRecorder;