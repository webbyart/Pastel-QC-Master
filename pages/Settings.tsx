
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { 
  getSupabaseConfig, setSupabaseConfig, testApiConnection, 
  clearProductsCloud, clearQCLogsCloud, fetchAllUsers, saveUserData, deleteUserData
} from '../services/db';
import { User } from '../types';
import { 
  LogOut, Moon, Sun, Check, AlertCircle, RefreshCw, Copy, Terminal, 
  DatabaseZap, Box, ClipboardList, ShieldAlert, X, UserCheck, Plus, Trash2, Edit2, UserPlus, Star, Mail
} from 'lucide-react';

const SQL_USERS_SETUP = `-- 👤 SQL สำหรับระบบจัดการผู้ใช้งาน (RBAC)
-- 1. สร้างตาราง Users
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    role TEXT CHECK (role IN ('admin', 'user')) DEFAULT 'user',
    status TEXT CHECK (status IN ('active', 'inactive', 'suspended')) DEFAULT 'active',
    is_online BOOLEAN DEFAULT false,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. เพิ่ม Master Superadmin
INSERT INTO users (username, role, first_name, status) 
VALUES ('artkitthana12@gmail.com', 'admin', 'Master Superadmin', 'active')
ON CONFLICT (username) DO NOTHING;

-- 3. ตั้งค่าสิทธิ์การเข้าถึง (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Users Access" ON users;
CREATE POLICY "Public Users Access" ON users FOR ALL TO anon USING (true) WITH CHECK (true);`;

export const Settings: React.FC = () => {
  const { logout, user: currentUser } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const initialConfig = getSupabaseConfig();
  const [url, setUrl] = useState(initialConfig.url);
  const [key, setKey] = useState(initialConfig.key);
  
  const [activeTab, setActiveTab] = useState<'users' | 'config' | 'sql'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [confirmType, setConfirmType] = useState<'none' | 'products' | 'logs'>('none');

  // User Modal State
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});

  useEffect(() => {
    if (activeTab === 'users') loadUsers();
  }, [activeTab]);

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
        const data = await fetchAllUsers();
        setUsers(data);
    } catch (e) {} finally { setIsLoadingUsers(false); }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        await saveUserData(editingUser);
        setShowUserModal(false);
        loadUsers();
    } catch (e: any) { alert(e.message); }
  };

  const handleDeleteUser = async (id: string) => {
    if (id === currentUser?.id) return alert('ไม่สามารถลบตัวเองได้');
    if (confirm('ยืนยันการลบผู้ใช้งานนี้?')) {
        await deleteUserData(id);
        loadUsers();
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('คัดลอก SQL แล้ว');
  };

  return (
    <div className="space-y-6 pb-24 animate-fade-in max-w-5xl mx-auto px-4">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-display font-bold dark:text-white">การจัดการระบบ</h1>
            <p className="text-sm text-gray-400 font-medium">จัดการผู้ใช้และฐานข้อมูลระดับ Admin</p>
        </div>
        <button onClick={toggleTheme} className="p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            {isDark ? <Sun className="text-yellow-500" /> : <Moon className="text-pastel-blueDark" />}
        </button>
      </div>

      <div className="flex p-1.5 bg-gray-100 dark:bg-gray-800 rounded-2xl w-fit">
          <button onClick={() => setActiveTab('users')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-white dark:bg-gray-700 shadow-sm text-pastel-blueDark dark:text-white' : 'text-gray-400'}`}>User Manager</button>
          <button onClick={() => setActiveTab('config')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'config' ? 'bg-white dark:bg-gray-700 shadow-sm text-pastel-blueDark dark:text-white' : 'text-gray-400'}`}>API Config</button>
          <button onClick={() => setActiveTab('sql')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'sql' ? 'bg-white dark:bg-gray-700 shadow-sm text-pastel-blueDark dark:text-white' : 'text-gray-400'}`}>SQL Scripts</button>
      </div>

      {activeTab === 'users' ? (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-pastel-blue/50 rounded-2xl text-pastel-blueDark"><UserCheck size={24} /></div>
                        <h2 className="text-xl font-bold dark:text-white">รายชื่อผู้ใช้งาน</h2>
                    </div>
                    <button onClick={() => { setEditingUser({}); setShowUserModal(true); }} className="bg-pastel-blueDark text-white px-6 py-3 rounded-xl flex items-center gap-2 font-bold text-sm shadow-lg active:scale-95 transition-all">
                        <UserPlus size={18} /> เพิ่มผู้ใช้
                    </button>
                </div>

                <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left">
                        <thead className="text-[10px] font-black uppercase text-gray-400 tracking-widest border-b border-gray-50 dark:border-gray-700">
                            <tr>
                                <th className="p-4">ผู้ใช้งาน / Email</th>
                                <th className="p-4">สิทธิ์</th>
                                <th className="p-4">สถานะ</th>
                                <th className="p-4 text-right">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                            {users.map(u => (
                                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center font-bold text-gray-500 overflow-hidden">
                                                    {u.username === 'artkitthana12@gmail.com' ? <Star className="text-amber-500 fill-amber-500" size={18} /> : u.username.charAt(0).toUpperCase()}
                                                </div>
                                                <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-800 ${u.is_online ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                            </div>
                                            <div>
                                                <p className={`font-bold text-sm dark:text-white ${u.username === 'artkitthana12@gmail.com' ? 'text-amber-600' : ''}`}>
                                                    {u.username}
                                                </p>
                                                {u.username === 'artkitthana12@gmail.com' && (
                                                    <span className="text-[8px] font-black text-amber-500 bg-amber-50 px-2 py-0.5 rounded uppercase tracking-tighter">Master Superadmin</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${u.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                            {u.role}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${u.status === 'active' ? 'text-green-500' : 'text-red-500'}`}>
                                            ● {u.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right space-x-2">
                                        <button onClick={() => { setEditingUser(u); setShowUserModal(true); }} className="p-2 text-gray-400 hover:text-pastel-blueDark"><Edit2 size={16}/></button>
                                        <button 
                                            onClick={() => handleDeleteUser(u.id)} 
                                            disabled={u.username === 'artkitthana12@gmail.com'}
                                            className={`p-2 transition-colors ${u.username === 'artkitthana12@gmail.com' ? 'opacity-20 cursor-not-allowed' : 'text-gray-400 hover:text-red-500'}`}
                                        >
                                            <Trash2 size={16}/>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-2xl text-red-500"><ShieldAlert size={24} /></div>
                    <h2 className="text-xl font-bold dark:text-white uppercase tracking-tight">Danger Zone</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button onClick={() => setConfirmType('products')} className="flex flex-col items-center gap-4 p-8 rounded-[2rem] bg-red-50/50 dark:bg-red-900/10 border-2 border-dashed border-red-100 dark:border-red-900/30 group active:scale-95 transition-all">
                        <Box size={32} className="text-red-400 group-hover:scale-110 transition-transform" />
                        <span className="font-black text-red-600 text-xs uppercase tracking-widest">Clear Products</span>
                    </button>
                    <button onClick={() => setConfirmType('logs')} className="flex flex-col items-center gap-4 p-8 rounded-[2rem] bg-orange-50/50 dark:bg-orange-900/10 border-2 border-dashed border-orange-100 dark:border-orange-900/30 group active:scale-95 transition-all">
                        <ClipboardList size={32} className="text-orange-400 group-hover:scale-110 transition-transform" />
                        <span className="font-black text-orange-600 text-xs uppercase tracking-widest">Clear History</span>
                    </button>
                </div>
            </div>
        </div>
      ) : activeTab === 'config' ? (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-pastel-blue/50 rounded-2xl text-pastel-blueDark"><DatabaseZap size={24} /></div>
                    <h2 className="text-xl font-bold dark:text-white">Cloud Connection</h2>
                </div>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Supabase URL</label>
                        <input type="text" value={url} onChange={e => setUrl(e.target.value)} className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm font-mono dark:text-white" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-gray-400 ml-2">API Key</label>
                        <input type="password" value={key} onChange={e => setKey(e.target.value)} className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm font-mono dark:text-white" />
                    </div>
                </div>
                <button onClick={() => { setSupabaseConfig(url, key); alert('Saved!'); }} className="w-full py-5 bg-pastel-blueDark text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all">บันทึกการตั้งค่า</button>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-pastel-purple/50 rounded-2xl flex items-center justify-center text-pastel-purpleDark font-black text-xl">{currentUser?.username.charAt(0).toUpperCase()}</div>
                        <div>
                            <p className="font-bold text-lg dark:text-white">{currentUser?.username}</p>
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{currentUser?.role} Account</p>
                        </div>
                    </div>
                    <button onClick={logout} className="p-4 bg-red-50 text-red-500 rounded-2xl active:scale-90 transition-all"><LogOut size={24}/></button>
                </div>
            </div>
        </div>
      ) : (
        <div className="space-y-6">
            <div className="bg-gray-900 p-10 rounded-[3rem] shadow-xl text-white space-y-4">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <Terminal size={32} className="text-amber-400" />
                        <h2 className="text-xl font-bold">SQL Setup (Full RBAC)</h2>
                    </div>
                    <button onClick={() => copy(SQL_USERS_SETUP)} className="bg-white/10 p-3 rounded-xl hover:bg-white/20 transition-all"><Copy size={20}/></button>
                </div>
                <pre className="text-[10px] font-mono text-green-300 bg-black/30 p-6 rounded-[2rem] overflow-x-auto h-[400px] custom-scrollbar">
                    {SQL_USERS_SETUP}
                </pre>
            </div>
        </div>
      )}

      {/* User Edit/Add Modal */}
      {showUserModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
            <div className="bg-white dark:bg-gray-800 rounded-[3rem] p-10 w-full max-w-md shadow-2xl animate-slide-up border border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-xl font-bold dark:text-white">{editingUser.id ? 'แก้ไขข้อมูลผู้ใช้' : 'เพิ่มผู้ใช้งานใหม่'}</h2>
                    <button onClick={() => setShowUserModal(false)} className="p-2 bg-gray-50 dark:bg-gray-900 rounded-full"><X size={20}/></button>
                </div>
                <form onSubmit={handleSaveUser} className="space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Email / Username *</label>
                        <input 
                            type="text" required 
                            disabled={editingUser.username === 'artkitthana12@gmail.com'}
                            value={editingUser.username || ''} 
                            onChange={e => setEditingUser({...editingUser, username: e.target.value.toLowerCase()})} 
                            className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm font-bold dark:text-white" 
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Role *</label>
                            <select value={editingUser.role || 'user'} onChange={e => setEditingUser({...editingUser, role: e.target.value as any})} className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm font-bold dark:text-white">
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Status</label>
                            <select value={editingUser.status || 'active'} onChange={e => setEditingUser({...editingUser, status: e.target.value as any})} className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm font-bold dark:text-white">
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                                <option value="suspended">Suspended</option>
                            </select>
                        </div>
                    </div>
                    <button type="submit" className="w-full py-5 bg-pastel-blueDark text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl mt-4">บันทึกข้อมูล</button>
                </form>
            </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmType !== 'none' && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <div className="bg-white dark:bg-gray-800 rounded-[3rem] p-10 w-full max-w-sm text-center space-y-6">
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-500 mx-auto"><ShieldAlert size={48}/></div>
                <div>
                    <h2 className="text-xl font-bold dark:text-white">ยืนยันการล้างข้อมูล?</h2>
                    <p className="text-xs text-gray-500 mt-2">ข้อมูล {confirmType === 'products' ? 'สินค้า' : 'ประวัติ QC'} ทั้งหมดจะถูกลบถาวร</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setConfirmType('none')} className="py-4 bg-gray-100 dark:bg-gray-700 rounded-2xl font-bold text-xs text-gray-400">ยกเลิก</button>
                    <button onClick={async () => { 
                        setIsClearing(true);
                        if(confirmType === 'products') await clearProductsCloud();
                        else await clearQCLogsCloud();
                        setConfirmType('none');
                        setIsClearing(false);
                        alert('ลบข้อมูลสำเร็จ');
                    }} className="py-4 bg-red-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest">ยืนยันการลบ</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
