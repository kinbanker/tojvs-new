import React from 'react';
import { User, Phone, Calendar, Shield } from 'lucide-react';

const Profile = ({ user }) => {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="flex items-center mb-6">
          <div className="bg-blue-100 p-4 rounded-full">
            <User className="w-12 h-12 text-blue-600" />
          </div>
          <div className="ml-4">
            <h2 className="text-2xl font-bold">{user.username}</h2>
            <p className="text-gray-600">무료 플랜 사용중</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center py-3 border-b">
            <User className="w-5 h-5 text-gray-400 mr-3" />
            <div className="flex-1">
              <p className="text-sm text-gray-500">사용자명</p>
              <p className="font-medium">{user.username}</p>
            </div>
          </div>

          <div className="flex items-center py-3 border-b">
            <Phone className="w-5 h-5 text-gray-400 mr-3" />
            <div className="flex-1">
              <p className="text-sm text-gray-500">휴대폰</p>
              <p className="font-medium">{user.phone || '010-****-****'}</p>
            </div>
          </div>

          <div className="flex items-center py-3 border-b">
            <Calendar className="w-5 h-5 text-gray-400 mr-3" />
            <div className="flex-1">
              <p className="text-sm text-gray-500">가입일</p>
              <p className="font-medium">{new Date().toLocaleDateString()}</p>
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