import React, { useMemo, useState } from 'react';
import { 
  ExternalLink, 
  Calendar, 
  User, 
  Loader2, 
  Newspaper,
  Twitter,
  MessageCircle,
  TrendingUp,
  Clock,
  ChevronRight,
  Image as ImageIcon,
  Hash
} from 'lucide-react';

// Helper function to handle different data structures
const getArticles = (data) => {
  return data?.articles || data?.news || data?.items || [];
};

// Helper function to get social media posts
const getSocialPosts = (data) => {
  return data?.tweets || data?.socialPosts || data?.social || [];
};

const NewsDisplay = ({ data, isConnected = false, isLoading = false, error = null }) => {
  const [activeTab, setActiveTab] = useState('all');
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
      <div className="flex flex-col items-center justify-center py-20">
        <div className="bg-gray-100 rounded-full p-6 mb-4">
          <Newspaper className="w-12 h-12 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-700 mb-2">뉴스 데이터가 없습니다</h3>
        <p className="text-gray-500 text-center max-w-md">
          키워드나 종목명을 말씀해주시면 관련 뉴스와 소셜 미디어 정보를 찾아드립니다.
        </p>
      </div>
    );
  }

  // Get articles and social posts from various possible data structures
  const articles = getArticles(newsData);
  const socialPosts = getSocialPosts(newsData);
  const hasContent = articles.length > 0 || socialPosts.length > 0;

  // Filter content based on active tab
  const getFilteredContent = () => {
    if (activeTab === 'news') return { articles, socialPosts: [] };
    if (activeTab === 'social') return { articles: [], socialPosts };
    return { articles, socialPosts };
  };

  const { articles: filteredArticles, socialPosts: filteredSocial } = getFilteredContent();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-3xl font-bold mb-2">
              {newsData.keyword || newsData.ticker || '뉴스'} 정보
            </h2>
            {newsData.message && (
              <p className="text-blue-100">{newsData.message}</p>
            )}
          </div>
          <div className={`flex items-center px-3 py-1 rounded-full text-xs font-medium ${
            isConnected 
              ? 'bg-green-400/20 text-green-100 border border-green-400/30' 
              : 'bg-red-400/20 text-red-100 border border-red-400/30'
          }`}>
            <span className="w-2 h-2 rounded-full mr-2 animate-pulse ${
              isConnected ? 'bg-green-400' : 'bg-red-400'
            }" />
            {isConnected ? '실시간 연결' : '연결 끊김'}
          </div>
        </div>

        {/* Stats */}
        {hasContent && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/10 rounded-lg p-3">
              <p className="text-blue-100 text-xs mb-1">총 콘텐츠</p>
              <p className="text-2xl font-bold">{articles.length + socialPosts.length}</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <p className="text-blue-100 text-xs mb-1">뉴스 기사</p>
              <p className="text-2xl font-bold">{articles.length}</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <p className="text-blue-100 text-xs mb-1">소셜 미디어</p>
              <p className="text-2xl font-bold">{socialPosts.length}</p>
            </div>
          </div>
        )}
      </div>

      {hasContent && (
        <>
          {/* Tab Navigation */}
          <div className="flex space-x-2 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === 'all'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              전체 ({articles.length + socialPosts.length})
            </button>
            <button
              onClick={() => setActiveTab('news')}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === 'news'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              <Newspaper className="w-4 h-4 inline mr-1" />
              뉴스 ({articles.length})
            </button>
            <button
              onClick={() => setActiveTab('social')}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === 'social'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              <Twitter className="w-4 h-4 inline mr-1" />
              소셜 ({socialPosts.length})
            </button>
          </div>

          {/* News Articles */}
          {filteredArticles.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-gray-800 flex items-center">
                <Newspaper className="w-5 h-5 mr-2 text-blue-600" />
                최신 뉴스
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {filteredArticles.map((item, index) => (
                  <article
                    key={index}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-200 overflow-hidden group"
                  >
                    {/* Image Section */}
                    {item.imageUrl ? (
                      <div className="h-48 overflow-hidden bg-gray-100">
                        <img 
                          src={item.imageUrl} 
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="h-48 bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center">
                        <ImageIcon className="w-12 h-12 text-gray-300" />
                      </div>
                    )}

                    <div className="p-5">
                      {/* Source & Time */}
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                        <span className="font-medium text-blue-600">
                          {item.source || '뉴스'}
                        </span>
                        {item.publishedAt && (
                          <span className="flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            {new Date(item.publishedAt).toLocaleDateString('ko-KR', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h4 className="font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
                        {item.title}
                      </h4>

                      {/* Description */}
                      <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                        {item.description}
                      </p>

                      {/* Read More Link */}
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-blue-600 hover:text-blue-700 text-sm font-medium group/link"
                        >
                          자세히 보기
                          <ChevronRight className="w-4 h-4 ml-1 group-hover/link:translate-x-1 transition-transform" />
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* Social Media Posts */}
          {filteredSocial.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-gray-800 flex items-center">
                <Twitter className="w-5 h-5 mr-2 text-blue-400" />
                소셜 미디어
              </h3>
              <div className="space-y-3">
                {filteredSocial.map((post, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 p-5"
                  >
                    <div className="flex items-start space-x-4">
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-white" />
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Author Info */}
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-semibold text-gray-900">
                              {post.author || 'Unknown'}
                            </p>
                            <p className="text-sm text-gray-500">
                              @{post.username || 'user'}
                            </p>
                          </div>
                          <Twitter className="w-5 h-5 text-blue-400" />
                        </div>

                        {/* Post Content */}
                        <p className="text-gray-800 mb-3 whitespace-pre-wrap">
                          {post.text}
                        </p>

                        {/* Hashtags */}
                        {post.hashtags && post.hashtags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {post.hashtags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded-full"
                              >
                                <Hash className="w-3 h-3 mr-1" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Engagement Stats */}
                        <div className="flex items-center space-x-6 text-sm text-gray-500">
                          {post.likes !== undefined && (
                            <span className="flex items-center">
                              <TrendingUp className="w-4 h-4 mr-1" />
                              {post.likes.toLocaleString()}
                            </span>
                          )}
                          {post.retweets !== undefined && (
                            <span className="flex items-center">
                              <MessageCircle className="w-4 h-4 mr-1" />
                              {post.retweets.toLocaleString()}
                            </span>
                          )}
                          {post.createdAt && (
                            <span className="flex items-center">
                              <Calendar className="w-4 h-4 mr-1" />
                              {new Date(post.createdAt).toLocaleDateString('ko-KR')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty State for No Results */}
      {!hasContent && (
        <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-xl">
          <div className="bg-white rounded-full p-6 mb-4 shadow-sm">
            <Newspaper className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">검색 결과가 없습니다</h3>
          <p className="text-gray-500 text-center max-w-md">
            다른 키워드로 검색해보시거나 잠시 후 다시 시도해주세요.
          </p>
          {newsData.error && (
            <p className="text-sm text-red-500 mt-2">{newsData.error}</p>
          )}
        </div>
      )}

      {/* Source and Update Time */}
      <div className="flex justify-between items-center text-xs text-gray-400 pt-4 border-t">
        <span>데이터 제공: {newsData.source || 'Multiple Sources'}</span>
        <span>
          마지막 업데이트: {
            newsData.lastUpdate 
              ? new Date(newsData.lastUpdate).toLocaleString('ko-KR')
              : new Date().toLocaleString('ko-KR')
          }
        </span>
      </div>
    </div>
  );
};

export default NewsDisplay;