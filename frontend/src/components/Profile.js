import React, { useEffect, useState } from 'react';
import { User, Phone, Calendar, Shield, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import apiUtils from '../utils/api'; // ✅ 서버 API 사용

const Profile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await apiUtils.getProfile();
        setProfile(response.data);
      } catch (error) {
        toast.error(error.response?.data?.error || '프로필 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">프로필 불러오는 중...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-10 text-gray-500">
        프로필 데이터를 불러올 수 없습니다.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="flex items-center mb-6">
          <div className="bg-blue-100 p-4 rounded-full">
            <User className="w-12 h-12 text-blue-600" />
          </div>
          <div className="ml-4">
            <h2 className="text-2xl font-bold">{profile.username}</h2>
            <p className="text-gray-600">무료 플랜 사용중</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center py-3 border-b">
            <User className="w-5 h-5 text-gray-400 mr-3" />
            <div className="flex-1">
              <p className="text-sm text-gray-500">사용자명</p>
              <p className="font-medium">{profile.username}</p>
            </div>
          </div>

          <div className="flex items-center py-3 border-b">
            <Phone className="w-5 h-5 text-gray-400 mr-3" />
            <div className="flex-1">
              <p className="text-sm text-gray-500">휴대폰</p>
              <p className="font-medium">{profile.phone || '010-****-****'}</p>
            </div>
          </div>

          <div className="flex items-center py-3 border-b">
            <Calendar className="w-5 h-5 text-gray-400 mr-3" />
            <div className="flex-1">
              <p className="text-sm text-gray-500">가입일</p>
              <p className="font-medium">
                {new Date(profile.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex items-center py-3">
            <Shield className="w-5 h-5 text-gray-400 mr-3" />
            <div className="flex-1">
              <p className="text-sm text-gray-500">보안</p>
              <button className="text-blue-600 hover:text-blue-700 font-medium">
                비밀번호 변경
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
