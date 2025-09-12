import React from 'react';
import { Clock, AlertCircle, CheckCircle } from 'lucide-react';

const DataFreshnessIndicator = ({ 
  type, 
  timestamp, 
  currentData = null,
  historicalData = null 
}) => {
  
  // 시간 차이 계산
  const getTimeDiff = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}일 전`;
    if (hours > 0) return `${hours}시간 전`;
    if (minutes > 0) return `${minutes}분 전`;
    if (seconds > 30) return `${seconds}초 전`;
    return '방금 전';
  };

  // 날짜 포맷
  const formatDate = (ts) => {
    const date = new Date(ts);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? '오후' : '오전';
    const displayHours = hours % 12 || 12;
    
    return `${year}년 ${month}월 ${day}일 ${ampm} ${displayHours}시 ${minutes}분`;
  };

  // 데이터 타입별 최신성 판단
  const getFreshnessStatus = () => {
    const timeDiff = Date.now() - new Date(timestamp).getTime();
    
    switch(type) {
      case 'market':
      case 'chart':
        // 시장 데이터: 1초 이상 지나면 과거 데이터
        if (timeDiff > 1000) {
          return {
            status: 'historical',
            color: 'bg-orange-100 border-orange-300 text-orange-800',
            icon: <AlertCircle className="w-4 h-4" />,
            message: '과거 시점 데이터'
          };
        }
        return {
          status: 'fresh',
          color: 'bg-green-100 border-green-300 text-green-800',
          icon: <CheckCircle className="w-4 h-4" />,
          message: '실시간 데이터'
        };
        
      case 'news':
        // 뉴스: 5분 이상 지나면 업데이트 필요
        if (timeDiff > 5 * 60 * 1000) {
          return {
            status: 'stale',
            color: 'bg-yellow-100 border-yellow-300 text-yellow-800',
            icon: <Clock className="w-4 h-4" />,
            message: '업데이트 권장'
          };
        }
        return {
          status: 'fresh',
          color: 'bg-blue-100 border-blue-300 text-blue-800',
          icon: <CheckCircle className="w-4 h-4" />,
          message: '최신 뉴스'
        };
        
      case 'kanban':
        // 칸반: 현재 데이터와 비교
        if (historicalData && currentData) {
          const isDifferent = 
            historicalData.column !== currentData.column ||
            historicalData.price !== currentData.price ||
            historicalData.quantity !== currentData.quantity;
            
          if (isDifferent) {
            return {
              status: 'changed',
              color: 'bg-orange-100 border-orange-300 text-orange-800',
              icon: <AlertCircle className="w-4 h-4" />,
              message: '현재와 다름'
            };
          }
        }
        return {
          status: 'current',
          color: 'bg-green-100 border-green-300 text-green-800',
          icon: <CheckCircle className="w-4 h-4" />,
          message: '현재 상태'
        };
        
      default:
        return {
          status: 'unknown',
          color: 'bg-gray-100 border-gray-300 text-gray-800',
          icon: <Clock className="w-4 h-4" />,
          message: ''
        };
    }
  };

  const freshness = getFreshnessStatus();

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${freshness.color}`}>
      <div className="flex items-center gap-2">
        {freshness.icon}
        <div>
          <div className="text-sm font-medium">
            {freshness.message}
          </div>
          <div className="text-xs opacity-75">
            {getTimeDiff(timestamp)} ({formatDate(timestamp)})
          </div>
        </div>
      </div>
      
      {/* 추가 정보 */}
      {type === 'kanban' && historicalData && currentData && (
        <div className="text-xs text-right">
          {historicalData.column !== currentData.column && (
            <div>위치: {historicalData.column} → {currentData.column}</div>
          )}
          {historicalData.price !== currentData.price && (
            <div>가격: ${historicalData.price} → ${currentData.price}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default DataFreshnessIndicator;