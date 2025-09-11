import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, BarChart3, Info } from 'lucide-react';

const MarketDisplay = ({ data, isConnected = false }) => {
  if (!data) {
    return (
      <div className="text-center py-10 text-gray-500">
        시장 데이터를 불러오려면 종목이나 지수를 요청하세요.
      </div>
    );
  }

  const isPositive = data.change > 0;
  const changeColor = isPositive ? 'text-green-600' : 'text-red-600';
  const bgColor = isPositive ? 'bg-green-50' : 'bg-red-50';
  const borderColor = isPositive ? 'border-green-200' : 'border-red-200';
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1">시장 데이터</h2>
          <p className="text-gray-600">
            {data.name || data.ticker} 실시간 정보
          </p>
        </div>
        <div
          className={`text-xs flex items-center ${
            isConnected ? 'text-green-600' : 'text-red-600'
          }`}
        >
          <span className="mr-1">●</span>
          {isConnected ? '실시간 연결됨' : '연결 끊김'}
        </div>
      </div>

      {/* Main Price Card */}
      <div className={`bg-white rounded-xl shadow-lg border-2 ${borderColor} overflow-hidden`}>
        <div className={`${bgColor} p-6`}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-3xl font-bold text-gray-900">
                {data.ticker}
              </h3>
              <p className="text-lg text-gray-600 mt-1">{data.name}</p>
            </div>
            <TrendIcon className={`w-8 h-8 ${changeColor}`} />
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-baseline justify-between mb-6">
            <div>
              <p className="text-4xl font-bold text-gray-900">
                ${data.price?.toLocaleString('en-US', { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                })}
              </p>
              <div className={`flex items-center mt-2 ${changeColor}`}>
                <span className="text-2xl font-semibold">
                  {isPositive ? '+' : ''}{data.change?.toFixed(2)}
                </span>
                <span className="text-xl ml-3">
                  ({isPositive ? '+' : ''}{data.changePercent?.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Price Range */}
          {(data.high || data.low) && (
            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>일일 변동폭</span>
                <span className="font-semibold">
                  ${data.low?.toLocaleString()} - ${data.high?.toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full"
                  style={{
                    width: `${((data.price - data.low) / (data.high - data.low)) * 100}%`
                  }}
                />
              </div>
            </div>
          )}

          {/* Additional Info Grid */}
          <div className="grid grid-cols-2 gap-4">
            {data.open && (
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">시가</p>
                <p className="text-lg font-semibold">
                  ${data.open.toLocaleString()}
                </p>
              </div>
            )}
            
            {data.previousClose && (
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">전일 종가</p>
                <p className="text-lg font-semibold">
                  ${data.previousClose.toLocaleString()}
                </p>
              </div>
            )}
            
            {data.volume && (
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">거래량</p>
                <p className="text-lg font-semibold">
                  {(data.volume / 1000000).toFixed(1)}M
                </p>
              </div>
            )}
            
            {data.marketCap && (
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">시가총액</p>
                <p className="text-lg font-semibold">
                  ${(data.marketCap / 1000000000).toFixed(1)}B
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Message Section */}
      {data.message && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start">
          <Info className="w-5 h-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
          <p className="text-gray-800">{data.message}</p>
        </div>
      )}

      {/* Source and Update Time */}
      <div className="flex justify-between text-xs text-gray-500">
        <span>데이터 제공: {data.source || 'Polygon.io'}</span>
        <span>
          마지막 업데이트: {
            data.lastUpdate 
              ? new Date(data.lastUpdate).toLocaleString('ko-KR')
              : '알 수 없음'
          }
        </span>
      </div>
    </div>
  );
};

export default MarketDisplay;