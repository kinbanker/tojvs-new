import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

const PlanManagement = () => {
  const [currentPlan, setCurrentPlan] = useState('free');

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: '0',
      features: [
        '월 30회 음성 명령',
        '기본 매매일지',
        '뉴스 검색',
        '이메일 지원'
      ],
      notIncluded: [
        '실시간 알림',
        'API 연동',
        '고급 분석',
        '우선 지원'
      ]
    },
    {
      id: 'basic',
      name: 'Basic',
      price: '19,900',
      features: [
        '무제한 음성 명령',
        '고급 매매일지',
        '실시간 뉴스',
        '가격 알림',
        '이메일 지원'
      ],
      notIncluded: [
        'API 연동',
        '고급 분석',
        '우선 지원'
      ]
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '39,900',
      features: [
        '무제한 음성 명령',
        '고급 매매일지',
        '실시간 뉴스',
        '가격 알림',
        'API 연동',
        '고급 분석',
        '우선 지원'
      ],
      notIncluded: []
    }
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">플랜 관리</h2>
        <p className="text-gray-600">현재 플랜: <span className="font-semibold">{currentPlan.toUpperCase()}</span></p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div 
            key={plan.id}
            className={`bg-white rounded-lg shadow-lg p-6 ${
              currentPlan === plan.id ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <div className="text-3xl font-bold text-blue-600">
                ₩{plan.price}
                <span className="text-sm text-gray-500 font-normal">/월</span>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              {plan.features.map((feature, index) => (
                <div key={index} className="flex items-center">
                  <Check className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{feature}</span>
                </div>
              ))}
              {plan.notIncluded.map((feature, index) => (
                <div key={index} className="flex items-center opacity-50">
                  <X className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0" />
                  <span className="text-sm text-gray-500 line-through">{feature}</span>
                </div>
              ))}
            </div>

            <button
              className={`w-full py-2 px-4 rounded-lg font-medium transition ${
                currentPlan === plan.id
                  ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
              disabled={currentPlan === plan.id}
            >
              {currentPlan === plan.id ? '현재 플랜' : '업그레이드'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlanManagement;