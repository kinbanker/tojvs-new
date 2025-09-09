import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { TrendingUp, User, Lock, Phone, ChevronLeft } from 'lucide-react';
import apiUtils from '../utils/api'; // ✅ axios 대신 apiUtils 사용

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    passwordConfirm: '',
    phone: '',
    termsAgreed: false,
    marketingConsent: false
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const validateForm = () => {
    const newErrors = {};

    // Username validation
    if (!/^[a-zA-Z]+$/.test(formData.username)) {
      newErrors.username = 'ID는 영문자만 사용 가능합니다.';
    }

    // Password validation
    if (formData.password.length < 8) {
      newErrors.password = '비밀번호는 8자 이상이어야 합니다.';
    }

    // Password confirmation
    if (formData.password !== formData.passwordConfirm) {
      newErrors.passwordConfirm = '비밀번호가 일치하지 않습니다.';
    }

    // Phone validation
    if (!/^010-\d{4}-\d{4}$/.test(formData.phone)) {
      newErrors.phone = '올바른 휴대폰 번호 형식이 아닙니다. (010-0000-0000)';
    }

    // Terms agreement
    if (!formData.termsAgreed) {
      newErrors.termsAgreed = '이용약관에 동의해주세요.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setLoading(true);

    try {
      // ✅ apiUtils.register 사용
      const response = await apiUtils.register({
        username: formData.username,
        password: formData.password,
        phone: formData.phone,
        marketingConsent: formData.marketingConsent
      });

      if (response.data.success) {
        toast.success('회원가입이 완료되었습니다!');
        navigate('/login');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || '회원가입에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const formatPhoneNumber = (value) => {
    const numbers = value.replace(/[^\d]/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setFormData({ ...formData, phone: formatted });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center mb-6">
          <Link to="/login" className="mr-4">
            <ChevronLeft className="w-6 h-6 text-gray-600 hover:text-gray-800" />
          </Link>
          <div className="flex-1 text-center">
            <div className="inline-flex items-center justify-center bg-blue-600 p-3 rounded-full mb-2">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">회원가입</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 아이디 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              아이디 *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${
                  errors.username ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="영문 아이디"
              />
            </div>
            {errors.username && <p className="text-red-500 text-xs mt-1">{errors.username}</p>}
          </div>

          {/* 비밀번호 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              비밀번호 *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${
                  errors.password ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="8자 이상"
              />
            </div>
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
          </div>

          {/* 비밀번호 확인 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              비밀번호 확인 *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                name="passwordConfirm"
                value={formData.passwordConfirm}
                onChange={handleChange}
                required
                className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${
                  errors.passwordConfirm ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="비밀번호 재입력"
              />
            </div>
            {errors.passwordConfirm && <p className="text-red-500 text-xs mt-1">{errors.passwordConfirm}</p>}
          </div>

          {/* 휴대폰 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              휴대폰 번호 *
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handlePhoneChange}
                required
                maxLength="13"
                className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${
                  errors.phone ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="010-0000-0000"
              />
            </div>
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
          </div>

          {/* 약관 동의 */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="terms"
                name="termsAgreed"
                checked={formData.termsAgreed}
                onChange={handleChange}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="terms" className="ml-2 text-sm text-gray-700">
                <span className="text-red-500">*</span> 이용약관 및 개인정보처리방침에 동의합니다
              </label>
            </div>
            {errors.termsAgreed && <p className="text-red-500 text-xs">{errors.termsAgreed}</p>}

            <div className="flex items-center">
              <input
                type="checkbox"
                id="marketing"
                name="marketingConsent"
                checked={formData.marketingConsent}
                onChange={handleChange}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="marketing" className="ml-2 text-sm text-gray-700">
                마케팅 정보 수신에 동의합니다 (선택)
              </label>
            </div>
          </div>

          {/* 제출 버튼 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
            로그인
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
