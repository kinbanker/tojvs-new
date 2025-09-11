import React, { useMemo } from 'react';
import { ExternalLink, Calendar, User, Loader2 } from 'lucide-react';

// Helper function to handle different data structures
const getArticles = (data) => {
  return data?.articles || data?.news || data?.items || [];
};

const NewsDisplay = ({ data, isConnected = false, isLoading = false, error = null }) => {
  // Memoize newsData to prevent unnecessary re-renders
  const newsData = useMemo(() => data, [data]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
        <span className="text-gray-600">뉴스 데이터를 불러오는 중...</span>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="text-center py-10 text-red-500">
        {error}
      </div>
    );
  }

  // Show empty state if no data
  if (!newsData) {
    return (
      <div className="text-center py-10 text-gray-500">
        뉴스 데이터를 불러오려면 키워드나 티커를 입력하세요.
      </div>
    );
  }

  // Get articles from various possible data structures
  const articles = getArticles(newsData);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">뉴스 검색 결과</h2>
          <p className="text-gray-600">
            키워드: {newsData.keyword || newsData.ticker || '없음'}
            {newsData.message && (
              <span className="ml-2 text-sm text-gray-500">({newsData.message})</span>
            )}
          </p>
        </div>
        {/* Connection status indicator */}
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

      {articles.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">
            최신 뉴스 ({articles.length}건)
          </h3>
          <div className="grid gap-4">
            {articles.map((item, index) => (
              <div
                key={index}
                className="bg-white p-4 rounded-lg shadow-sm border hover:shadow-md transition"
              >
                <h4 className="font-semibold text-blue-600 mb-2">{item.title}</h4>
                <p className="text-gray-600 text-sm mb-3">{item.description}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center space-x-4">
                    {item.publishedAt && (
                      <span className="flex items-center">
                        <Calendar className="w-3 h-3 mr-1" />
                        {new Date(item.publishedAt).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    )}
                    {item.source && <span>{item.source}</span>}
                  </div>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center text-blue-500 hover:text-blue-600"
                      aria-label={`${item.title} 자세히 보기`}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      자세히 보기
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {newsData.tweets && newsData.tweets.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">
            소셜 미디어 ({newsData.tweets.length}건)
          </h3>
          <div className="grid gap-4">
            {newsData.tweets.map((tweet, index) => (
              <div key={index} className="bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center mb-2">
                  <User className="w-4 h-4 mr-2 text-gray-500" />
                  <span className="font-semibold text-sm">{tweet.author}</span>
                  <span className="text-xs text-gray-500 ml-2">@{tweet.username}</span>
                </div>
                <p className="text-gray-700 text-sm">{tweet.text}</p>
                <p className="text-xs text-gray-500 mt-2">
                  {new Date(tweet.createdAt).toLocaleString('ko-KR')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Show message when no articles found */}
      {articles.length === 0 && !newsData.tweets?.length && (
        <div className="text-center py-10 text-gray-500">
          <p>검색 결과가 없습니다.</p>
          {newsData.error && (
            <p className="text-sm text-red-500 mt-2">{newsData.error}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default NewsDisplay;