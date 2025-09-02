import React from 'react';
import { ExternalLink, Calendar, User } from 'lucide-react';

const NewsDisplay = ({ data }) => {
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">뉴스 검색 결과</h2>
        <p className="text-gray-600">키워드: {data.keyword}</p>
      </div>

      {data.news && data.news.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">최신 뉴스</h3>
          <div className="grid gap-4">
            {data.news.map((item, index) => (
              <div key={index} className="bg-white p-4 rounded-lg shadow-sm border hover:shadow-md transition">
                <h4 className="font-semibold text-blue-600 mb-2">{item.title}</h4>
                <p className="text-gray-600 text-sm mb-3">{item.description}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center space-x-4">
                    <span className="flex items-center">
                      <Calendar className="w-3 h-3 mr-1" />
                      {new Date(item.publishedAt).toLocaleDateString()}
                    </span>
                    <span>{item.source}</span>
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center text-blue-500 hover:text-blue-600"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    자세히 보기
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.tweets && data.tweets.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">소셜 미디어</h3>
          <div className="grid gap-4">
            {data.tweets.map((tweet, index) => (
              <div key={index} className="bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center mb-2">
                  <User className="w-4 h-4 mr-2 text-gray-500" />
                  <span className="font-semibold text-sm">{tweet.author}</span>
                  <span className="text-xs text-gray-500 ml-2">@{tweet.username}</span>
                </div>
                <p className="text-gray-700 text-sm">{tweet.text}</p>
                <p className="text-xs text-gray-500 mt-2">
                  {new Date(tweet.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NewsDisplay;