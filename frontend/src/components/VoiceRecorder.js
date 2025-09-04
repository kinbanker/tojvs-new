import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const VoiceRecorder = ({ onTranscript, className }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);

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
          if (transcript.trim()) {
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
        
        switch(event.error) {
          case 'network':
            errorMessage = '네트워크 오류가 발생했습니다.';
            break;
          case 'not-allowed':
            errorMessage = '마이크 권한이 거부되었습니다. 브라우저 설정을 확인해주세요.';
            break;
          case 'no-speech':
            errorMessage = '음성이 감지되지 않았습니다.';
            break;
          case 'audio-capture':
            errorMessage = '마이크를 찾을 수 없습니다.';
            break;
          case 'aborted':
            console.log('Speech recognition aborted by user');
            setIsRecording(false);
            setError(null);
            return;
          default:
            errorMessage = `음성 인식 오류: ${event.error}`;
        }
        
        setError(errorMessage);
        toast.error(errorMessage);
        setIsRecording(false);
      };
      
      // Handle end
      recognition.onend = () => {
        console.log('Speech recognition ended');
        setIsRecording(false);
        clearTimeout(silenceTimerRef.current);
      };
      
      // Handle start
      recognition.onstart = () => {
        console.log('Speech recognition started');
        setError(null);
      };
      
      // No speech detected
      recognition.onspeechend = () => {
        console.log('Speech ended');
      };
      
      recognitionRef.current = recognition;
      
    } catch (error) {
      console.error('Failed to initialize speech recognition:', error);
      setIsSupported(false);
      setError('음성 인식 초기화 실패');
    }
    
    // Cleanup
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
      clearTimeout(silenceTimerRef.current);
    };
  }, [onTranscript]);

  const startRecording = async () => {
    if (!isSupported || !recognitionRef.current) {
      toast.error('음성 인식을 사용할 수 없습니다.');
      return;
    }

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Start recognition
      recognitionRef.current.start();
      setIsRecording(true);
      setError(null);
      toast.success('음성 인식을 시작합니다. 말씀해주세요.');
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setError('마이크 권한이 거부되었습니다.');
        toast.error('마이크 사용 권한을 허용해주세요.');
      } else if (error.name === 'NotFoundError') {
        setError('마이크를 찾을 수 없습니다.');
        toast.error('마이크가 연결되어 있는지 확인해주세요.');
      } else {
        setError('음성 인식 시작 실패');
        toast.error('음성 인식을 시작할 수 없습니다.');
      }
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current && isRecording) {
      try {
        clearTimeout(silenceTimerRef.current);
        recognitionRef.current.stop();
        console.log('Recording stopped');
        // 상태는 onend 이벤트에서 처리되도록 함
      } catch (error) {
        console.error('Failed to stop recording:', error);
        setIsRecording(false); // 오류 시에만 직접 상태 변경
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
          className={`relative p-3 rounded-full transition-all ${
            isRecording 
              ? 'bg-red-500 hover:bg-red-600' 
              : 'bg-blue-600 hover:bg-blue-700'
          } ${error ? 'ring-2 ring-red-400' : ''}`}
          title={isRecording ? '녹음 중지' : '녹음 시작'}
        >
          {isRecording ? (
            <>
              <MicOff className="w-6 h-6 text-white" />
              <span className="absolute top-0 right-0 w-3 h-3 bg-red-400 rounded-full animate-pulse" />
            </>
          ) : (
            <Mic className="w-6 h-6 text-white" />
          )}
        </button>
        
        <div className="flex-1">
          {isRecording && (
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
          
          {!isRecording && !transcript && !error && (
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
    </div>
  );
};

export default VoiceRecorder;