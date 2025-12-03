
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Box } from 'lucide-react';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(username)) {
      navigate('/');
    } else {
      setError('ชื่อผู้ใช้ไม่ถูกต้อง ลองใช้ "admin" หรือ "user"');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-pastel-purple p-3 rounded-full mb-4">
            <Box className="w-8 h-8 text-pastel-purpleDark" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">ยินดีต้อนรับ</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">เข้าสู่ระบบ QC Master System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ชื่อผู้ใช้ (Username)</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-pastel-purpleDark focus:outline-none dark:text-white transition-all"
              placeholder="ระบุชื่อผู้ใช้..."
            />
          </div>
          
          {error && <p className="text-red-500 text-sm text-center bg-red-50 p-2 rounded-lg">{error}</p>}

          <button
            type="submit"
            className="w-full bg-pastel-purpleDark hover:bg-purple-800 text-white font-semibold py-3 rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            เข้าสู่ระบบ
          </button>
        </form>
        
        <div className="mt-6 text-center text-xs text-gray-400">
          Hint: ใช้ <strong>admin</strong> หรือ <strong>user</strong> เพื่อเข้าใช้งาน
        </div>
      </div>
    </div>
  );
};
