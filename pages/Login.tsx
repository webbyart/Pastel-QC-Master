
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Box, Loader2, Database, Copy, Check, Terminal, AlertCircle, X } from 'lucide-react';

const INITIAL_SQL = `-- 🚀 SQL สำหรับเริ่มต้นระบบ (Run this in Supabase SQL Editor)
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    first_name TEXT,
    role TEXT CHECK (role IN ('admin', 'user')) DEFAULT 'user',
    status TEXT CHECK (status IN ('active', 'inactive', 'suspended')) DEFAULT 'active',
    is_online BOOLEAN DEFAULT false,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- เพิ่ม Master Superadmin
INSERT INTO users (username, role, first_name, status) 
VALUES ('artkitthana12@gmail.com', 'admin', 'Master Superadmin', 'active')
ON CONFLICT (username) DO NOTHING;

-- ปิด RLS ชั่วคราวเพื่อให้เข้าถึงได้ (หรือสร้าง Policy)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access" ON users;
CREATE POLICY "Public Access" ON users FOR ALL TO anon USING (true) WITH CHECK (true);`;

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return setError('กรุณาระบุชื่อผู้ใช้หรืออีเมล');
    
    setIsLoading(true);
    setError('');
    
    try {
        const success = await login(username);
        if (success) {
          navigate('/');
        }
    } catch (e: any) {
        console.error("Login Error:", e);
        if (e.message?.includes('PGRST205') || e.message?.includes('users\' not found')) {
            setError('ระบบตรวจพบว่าฐานข้อมูลยังไม่ถูกติดตั้ง (Missing Table: users)');
            setShowSetup(true);
        } else {
            setError(e.message || 'การเข้าสู่ระบบล้มเหลว กรุณาตรวจสอบชื่อผู้ใช้');
        }
    } finally {
        setIsLoading(false);
    }
  };

  const copySql = () => {
    navigator.clipboard.writeText(INITIAL_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
      <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] shadow-2xl w-full max-w-md border border-gray-100 dark:border-gray-700 animate-slide-up">
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="bg-pastel-blueDark p-5 rounded-[1.5rem] mb-6 shadow-xl shadow-blue-500/20">
            <Box className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-gray-800 dark:text-white uppercase tracking-tight">QC Master</h1>
          <p className="text-gray-400 text-sm font-medium mt-1">Enterprise Quality Control System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-gray-400 ml-4 tracking-widest">Username / Email</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-6 py-5 rounded-[2rem] bg-gray-50 dark:bg-gray-900 border-none focus:ring-4 focus:ring-pastel-blueDark/10 dark:text-white font-bold transition-all"
              placeholder=""
              disabled={isLoading}
            />
          </div>
          
          {error && (
            <div className={`p-4 rounded-2xl text-[11px] font-bold text-center border animate-fade-in ${showSetup ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-red-50 text-red-500 border-red-100'}`}>
              <div className="flex items-center justify-center gap-2 mb-2">
                <AlertCircle size={16} />
                {error}
              </div>
              {showSetup && (
                <button 
                  type="button"
                  onClick={() => setShowSetup(true)}
                  className="mt-2 text-amber-900 underline decoration-amber-300 decoration-2 underline-offset-4"
                >
                  คลิกที่นี่เพื่อดูวิธีแก้ปัญหา
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-pastel-blueDark hover:bg-blue-800 text-white font-black py-5 rounded-[2rem] transition-all shadow-xl shadow-blue-500/30 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin" size={24} /> : 'ACCESS SYSTEM'}
          </button>
        </form>
        
        <div className="mt-10 pt-8 border-t border-gray-50 dark:border-gray-700/50 text-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">เข้าสู่ระบบ : สามารถแจ้งแอดมิน</p>
        </div>
      </div>

      {/* Database Setup Modal */}
      {showSetup && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
            <div className="bg-white dark:bg-gray-800 rounded-[3rem] p-8 w-full max-w-2xl shadow-2xl animate-slide-up border border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3 text-amber-600">
                        <Terminal size={24} />
                        <h2 className="text-xl font-bold">Database Initialization Required</h2>
                    </div>
                    <button onClick={() => setShowSetup(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X size={20}/></button>
                </div>
                
                <p className="text-sm text-gray-500 mb-6">กรุณาคัดลอก SQL ด้านล่างนี้ไปรันใน <b>Supabase SQL Editor</b> เพื่อสร้างตารางและบัญชีผู้ใช้เริ่มต้น</p>
                
                <div className="relative group">
                    <pre className="bg-gray-900 text-green-400 p-6 rounded-[2rem] text-[11px] font-mono overflow-x-auto h-[300px] border-4 border-gray-800">
                        {INITIAL_SQL}
                    </pre>
                    <button 
                        onClick={copySql}
                        className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-3 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                    >
                        {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                        {copied ? 'Copied!' : 'Copy SQL'}
                    </button>
                </div>

                <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex gap-4 border border-blue-100 dark:border-blue-800">
                    <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg h-fit text-blue-600"><Database size={20} /></div>
                    <div className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
                        <b>ขั้นตอน:</b> 1. เข้า Supabase Dashboard > 2. เลือกโปรเจกต์ > 3. ไปที่แถบ SQL Editor (ไอคอน {'>_'}) > 4. วางคำสั่งด้านบน > 5. กด Run
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
