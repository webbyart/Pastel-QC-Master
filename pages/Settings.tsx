
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getUsers, saveUser, deleteUser } from '../services/db';
import { User } from '../types';
import { LogOut, Moon, Sun, User as UserIcon, Plus, Trash2, Edit2, X, Box } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Settings: React.FC = () => {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // User Management State
  const [users, setUsers] = useState<User[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});

  useEffect(() => {
    if (user?.role === 'admin') {
      setUsers(getUsers());
    }
  }, [user, showUserModal]);

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser.username) return;
    
    saveUser({
        id: editingUser.id || Date.now().toString(),
        username: editingUser.username,
        role: editingUser.role || 'user'
    });
    setShowUserModal(false);
    setUsers(getUsers());
  };

  const handleDeleteUser = (id: string) => {
    if (confirm('ยืนยันการลบผู้ใช้งานนี้?')) {
        deleteUser(id);
        setUsers(getUsers());
    }
  };

  return (
    <div className="space-y-6 pb-24 md:pb-0 animate-fade-in">
      <h1 className="text-3xl font-display font-bold text-gray-800 dark:text-white ml-2">ตั้งค่าระบบ (Settings)</h1>

      <div className="space-y-4">
        {/* User Profile Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-5">
          <div className="bg-gradient-to-br from-pastel-purple to-pastel-blue p-4 rounded-2xl shadow-inner">
            <UserIcon className="w-8 h-8 text-pastel-purpleDark" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white capitalize">{user?.username}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${user?.role === 'admin' ? 'bg-purple-500' : 'bg-green-500'}`}></span>
                สิทธิ์: {user?.role}
            </p>
          </div>
        </div>

        {/* Admin Section: Data Management */}
        {user?.role === 'admin' && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 font-semibold text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider">
                    ผู้ดูแลระบบ (Admin)
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    <button 
                        onClick={() => navigate('/products')}
                        className="w-full text-left flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-500">
                                <Box size={20} />
                            </div>
                            <span className="text-gray-700 dark:text-gray-200 font-medium">จัดการสินค้า / คลังสินค้า</span>
                        </div>
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-3 py-1 rounded-full">Products</span>
                    </button>
                </div>
            </div>
        )}

        {/* Admin Section: User Management */}
        {user?.role === 'admin' && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <span className="font-semibold text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider">จัดการผู้ใช้งาน</span>
                    <button 
                        onClick={() => { setEditingUser({role: 'user'}); setShowUserModal(true); }}
                        className="flex items-center gap-1 text-xs bg-pastel-blue text-pastel-blueDark px-3 py-1.5 rounded-xl font-bold hover:bg-pastel-blueDark hover:text-white transition-all active:scale-95"
                    >
                        <Plus size={14} /> เพิ่มผู้ใช้
                    </button>
                </div>
                <div className="p-4">
                    <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="text-gray-400 border-b border-gray-100 dark:border-gray-700">
                                    <th className="pb-3 pl-2 font-medium">ชื่อผู้ใช้</th>
                                    <th className="pb-3 font-medium">สิทธิ์</th>
                                    <th className="pb-3 text-right pr-2 font-medium">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {users.map(u => (
                                    <tr key={u.id} className="group">
                                        <td className="py-3 pl-2 text-gray-800 dark:text-gray-200 font-medium">{u.username}</td>
                                        <td className="py-3">
                                            <span className={`px-2 py-1 rounded-lg text-xs font-bold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="py-3 text-right pr-2">
                                            {u.username !== user.username && (
                                                <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => { setEditingUser(u); setShowUserModal(true); }} className="p-1.5 bg-blue-50 text-blue-500 rounded-lg hover:bg-blue-100">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDeleteUser(u.id)} className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {/* Preferences */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 font-semibold text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider">
            การแสดงผล
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            <div className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer" onClick={toggleTheme}>
              <div className="flex items-center gap-3">
                 <div className={`p-2 rounded-xl ${isDark ? 'bg-purple-900/20' : 'bg-orange-50'}`}>
                    {isDark ? <Moon className="text-purple-400" size={20} /> : <Sun className="text-orange-400" size={20} />}
                 </div>
                 <span className="text-gray-700 dark:text-gray-200 font-medium">โหมดกลางคืน (Dark Mode)</span>
              </div>
              <button 
                className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ease-in-out ${isDark ? 'bg-pastel-purpleDark' : 'bg-gray-300'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-300 ${isDark ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>

         {/* Actions */}
         <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
             <button 
               onClick={logout}
               className="w-full text-left p-4 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-3 transition-colors font-medium"
             >
                <LogOut size={20} />
                ออกจากระบบ (Sign Out)
             </button>
         </div>
      </div>

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowUserModal(false)} />
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm shadow-2xl animate-slide-up overflow-hidden relative">
                <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-700/50">
                    <h3 className="font-bold text-lg text-gray-800 dark:text-white">{editingUser.id ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}</h3>
                    <button onClick={() => setShowUserModal(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full transition-colors"><X size={20} className="text-gray-400" /></button>
                </div>
                <form onSubmit={handleSaveUser} className="p-6 space-y-4">
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">ชื่อผู้ใช้</label>
                        <input 
                            type="text" 
                            required
                            value={editingUser.username || ''}
                            onChange={e => setEditingUser({...editingUser, username: e.target.value})}
                            className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:ring-2 focus:ring-pastel-blue outline-none transition-all"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">สิทธิ์การใช้งาน</label>
                        <select 
                            value={editingUser.role}
                            onChange={e => setEditingUser({...editingUser, role: e.target.value as any})}
                            className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:ring-2 focus:ring-pastel-blue outline-none transition-all"
                        >
                            <option value="user">User (ทั่วไป)</option>
                            <option value="admin">Admin (ผู้ดูแล)</option>
                        </select>
                    </div>
                    <button type="submit" className="w-full bg-pastel-blueDark hover:bg-blue-800 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all mt-2">
                        บันทึกข้อมูล
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
