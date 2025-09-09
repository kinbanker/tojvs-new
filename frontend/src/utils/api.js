import axios from 'axios';
import toast from 'react-hot-toast';

// Base URL configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 
  (process.env.NODE_ENV === 'production' 
    ? '/api'  // 프로덕션: 상대 경로 사용
    : 'http://localhost:3002/api');  // 개발: 절대 경로

// ===============================
// Refresh Token 함수
// ===============================
const refreshToken = async () => {
  const refresh = localStorage.getItem('refreshToken');
  if (!refresh) return null;
  
  try {
    const response = await fetch(`${API_BASE_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh })
    });
    
    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('token', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      return data.accessToken;
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
  }
  return null;
};

// ===============================
// Axios 인스턴스 생성
// ===============================
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// ===============================
// 요청 인터셉터 - 토큰 자동 첨부
// ===============================
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ===============================
// 응답 인터셉터 - 토큰 만료 처리
// ===============================
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response) {
      const { status, data } = error.response;

      // 🔑 토큰 만료 시 자동 갱신 & 재시도
      if (
        status === 401 && 
        data?.code === 'TOKEN_EXPIRED' && 
        !originalRequest._retry
      ) {
        originalRequest._retry = true;

        const newToken = await refreshToken();
        if (newToken) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return axios(originalRequest);
        }
      }

      // 🔑 401 오류 처리 개선 - 기존 코드를 이렇게 변경
      if (status === 401) {
        const errorMessage = data.error || '인증에 실패했습니다.';
        
        // 로그인 페이지에서의 401은 로그인 실패
        if (window.location.pathname === '/login') {
          toast.error(errorMessage, { id: 'login-error' }); // ID로 중복 방지
        } else {
          // 다른 페이지에서의 401은 세션 만료 
          localStorage.clear();
          window.location.href = '/login';
          toast.error('세션이 만료되었습니다. 다시 로그인해주세요.', { id: 'session-expired' });
        }
      } else if (status === 403) {
        toast.error('권한이 없습니다.');
      } else if (status === 404) {
        toast.error('요청한 리소스를 찾을 수 없습니다.');
      } else if (status >= 500) {
        toast.error('서버 오류가 발생했습니다.');
      } else {
        const errorMessage = data.error || data.message || '오류가 발생했습니다.';
        toast.error(errorMessage);
      }
    } else if (error.request) {
      toast.error('서버에 연결할 수 없습니다.');
    } else {
      toast.error('요청 처리 중 오류가 발생했습니다.');
    }

    return Promise.reject(error);
  }
);

// ===============================
// API methods
// ===============================
const apiUtils = {
  // Auth
  login: (credentials) => api.post('/login', credentials),
  register: (userData) => api.post('/register', userData),
  getProfile: () => api.get('/profile'),
  refresh: (refreshToken) => api.post('/refresh', { refreshToken }),
  logout: () => api.post('/logout'),

  // Kanban
  getKanbanCards: () => api.get('/kanban'),
  addKanbanCard: (card) => api.post('/kanban', card),
  updateKanbanCard: (id, updates) => api.put(`/kanban/${id}`, updates),
  deleteKanbanCard: (id) => api.delete(`/kanban/${id}`),

  // Stocks (Mock data for MVP)
  getStockData: (ticker) => api.get(`/stocks/${ticker}`),

  // Health check
  healthCheck: () => api.get('/health')
};

export default apiUtils;
