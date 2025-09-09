import React, { useState, useEffect } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import apiUtils from '../utils/api'; // ✅ For fetching profile (plan info)

const PlanManagement = () => {
  const [currentPlan, setCurrentPlan] = useState('free');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Static plans data (backend doesn't provide dynamic plans endpoint)
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

  useEffect(() => {
    const fetchCurrentPlan = async () => {
      try {
        // Fetch from /api/profile (as in Profile.js), assuming user.plan field
        const response = await apiUtils.getProfile();
        setCurrentPlan(response.data.plan || 'free'); // Fallback to 'free' if not set
      } catch (error) {
        console.error('Failed to fetch profile for plan:', error);
        setError('플랜 정보를 불러오지 못했습니다.');
        toast.error(error.response?.data?.error || '프로필 정보를 불러오지 못했습니다.');
        setCurrentPlan('free'); // Fallback
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentPlan();
  }, []);

  const handleUpgrade = (planId) => {
    if (planId === currentPlan) return;

    // No backend /plans/upgrade endpoint; placeholder for future (e.g., redirect to billing)
    toast.info(`업그레이드 기능은 준비 중입니다. ${planId.toUpperCase()} 플랜으로 변경하려면 관리자에게 문의하세요.`);
    // Future: window.open('https://billing-link.com/upgrade', '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
        <span className="text-gray-600">플랜 정보 불러오는 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10 text-red-500">
        {error}
      </div>
    );
  }

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
              onClick={() => handleUpgrade(plan.id)}
              className={`w-full py-2 px-4 rounded-lg font-medium transition ${
                currentPlan === plan.id
                  ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
              disabled={currentPlan === plan.id}
            >
              {currentPlan === plan.id ? '현재 플랜' : '업그레이드 (준비 중)'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlanManagement;