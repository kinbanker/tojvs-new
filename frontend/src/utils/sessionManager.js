/**
 * SessionManager - 브라우저 재시작 후에도 소켓 연결 정보를 유지하기 위한 유틸리티
 * sessionStorage와 localStorage를 조합하여 세션 지속성 보장
 */

const SESSION_KEY = 'tojvs_session';
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24시간

class SessionManager {
  constructor() {
    this.sessionData = this.loadSession();
    this.initializeSession();
  }

  /**
   * 세션 초기화
   */
  initializeSession() {
    // 페이지 로드 시 세션 검증
    if (this.sessionData) {
      const isValid = this.validateSession();
      if (!isValid) {
        this.clearSession();
      }
    }

    // 브라우저 탭/창이 닫힐 때 세션 저장
    window.addEventListener('beforeunload', () => {
      this.saveSession();
    });

    // 페이지 가시성 변경 감지 (백그라운드/포그라운드 전환)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.saveSession();
      } else {
        this.refreshSession();
      }
    });
  }

  /**
   * 세션 데이터 로드
   */
  loadSession() {
    try {
      // localStorage에서 영구 세션 데이터 로드
      const savedSession = localStorage.getItem(SESSION_KEY);
      if (savedSession) {
        const session = JSON.parse(savedSession);
        
        // 세션 타임아웃 체크
        if (session.timestamp && Date.now() - session.timestamp < SESSION_TIMEOUT) {
          return session;
        }
      }

      // sessionStorage에서 임시 세션 데이터 로드
      const tempSession = sessionStorage.getItem(SESSION_KEY);
      if (tempSession) {
        return JSON.parse(tempSession);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
    return null;
  }

  /**
   * 세션 데이터 저장
   */
  saveSession() {
    if (!this.sessionData) return;

    try {
      const sessionToSave = {
        ...this.sessionData,
        timestamp: Date.now()
      };

      // localStorage에 영구 저장 (브라우저 재시작 후에도 유지)
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionToSave));
      
      // sessionStorage에도 저장 (빠른 접근용)
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionToSave));
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  /**
   * 세션 유효성 검증
   */
  validateSession() {
    if (!this.sessionData) return false;

    // 토큰 존재 여부 확인
    const token = localStorage.getItem('token');
    if (!token) return false;

    // 세션 타임아웃 확인
    if (this.sessionData.timestamp) {
      const elapsed = Date.now() - this.sessionData.timestamp;
      if (elapsed > SESSION_TIMEOUT) {
        return false;
      }
    }

    // 사용자 정보 확인
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.id) return false;

    return true;
  }

  /**
   * 세션 새로고침
   */
  refreshSession() {
    const isValid = this.validateSession();
    if (isValid && this.sessionData) {
      this.sessionData.lastActive = Date.now();
      this.saveSession();
    } else {
      // 세션이 유효하지 않으면 새로 생성
      this.createNewSession();
    }
  }

  /**
   * 새 세션 생성
   */
  createNewSession() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const token = localStorage.getItem('token');

    if (user.id && token) {
      this.sessionData = {
        sessionId: this.generateSessionId(),
        userId: user.id,
        username: user.username,
        timestamp: Date.now(),
        lastActive: Date.now(),
        socketId: null,
        commandId: null,
        reconnectCount: 0
      };
      this.saveSession();
    }
  }

  /**
   * 세션 ID 생성
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 소켓 ID 업데이트
   */
  updateSocketId(socketId) {
    if (!this.sessionData) {
      this.createNewSession();
    }
    if (this.sessionData) {
      this.sessionData.socketId = socketId;
      this.sessionData.lastActive = Date.now();
      this.saveSession();
    }
  }

  /**
   * 커맨드 ID 업데이트
   */
  updateCommandId(commandId) {
    if (!this.sessionData) {
      this.createNewSession();
    }
    if (this.sessionData) {
      this.sessionData.commandId = commandId;
      this.sessionData.lastActive = Date.now();
      this.saveSession();
    }
  }

  /**
   * 재연결 카운트 증가
   */
  incrementReconnectCount() {
    if (this.sessionData) {
      this.sessionData.reconnectCount = (this.sessionData.reconnectCount || 0) + 1;
      this.saveSession();
    }
  }

  /**
   * 재연결 카운트 리셋
   */
  resetReconnectCount() {
    if (this.sessionData) {
      this.sessionData.reconnectCount = 0;
      this.saveSession();
    }
  }

  /**
   * 세션 데이터 가져오기
   */
  getSession() {
    return this.sessionData;
  }

  /**
   * 세션 ID 가져오기
   */
  getSessionId() {
    return this.sessionData?.sessionId || null;
  }

  /**
   * 소켓 ID 가져오기
   */
  getSocketId() {
    return this.sessionData?.socketId || null;
  }

  /**
   * 커맨드 ID 가져오기
   */
  getCommandId() {
    return this.sessionData?.commandId || null;
  }

  /**
   * 세션 클리어
   */
  clearSession() {
    this.sessionData = null;
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  }

  /**
   * 로그아웃 시 세션 정리
   */
  logout() {
    this.clearSession();
  }
}

// Singleton 인스턴스
const sessionManager = new SessionManager();

export default sessionManager;