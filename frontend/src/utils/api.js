import axios from 'axios';
import toast from 'react-hot-toast';

// Base URL configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 
  (process.env.NODE_ENV === 'production' 
    ? '/api'  // 프로덕션: 상대 경로 사용
    : 'http://localhost:3001/api');  // 개발: 절대 경로

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - Add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      // Server responded with error
      const { status, data } = error.response;
      
      if (status === 401) {
        // Unauthorized - clear token and redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        toast.error('세션이 만료되었습니다. 다시 로그인해주세요.');
      } else if (status === 403) {
        toast.error('권한이 없습니다.');
      } else if (status === 404) {
        toast.error('요청한 리소스를 찾을 수 없습니다.');
      } else if (status >= 500) {
        toast.error('서버 오류가 발생했습니다.');
      } else {
        // Show server error message if available
        const errorMessage = data.error || data.message || '오류가 발생했습니다.';
        toast.error(errorMessage);
      }
    } else if (error.request) {
      // Request made but no response
      toast.error('서버에 연결할 수 없습니다.');
    } else {
      // Something else happened
      toast.error('요청 처리 중 오류가 발생했습니다.');
    }
    
    return Promise.reject(error);
  }
);

// API methods
const apiUtils = {
  // Auth
  login: (credentials) => api.post('/login', credentials),
  register: (userData) => api.post('/register', userData),
  getProfile: () => api.get('/profile'),
  
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