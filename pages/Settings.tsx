
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getUsers, saveUser, deleteUser, getApiUrl, setApiUrl, testApiConnection, clearCache } from '../services/db';
import { User } from '../types';
import { LogOut, Moon, Sun, User as UserIcon, Plus, Trash2, Edit2, X, Box, Link, Check, AlertCircle, CheckCircle, RefreshCw, HelpCircle, AlertTriangle, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Settings: React.FC = () => {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // User Management State
  const [users, setUsers] = useState<User[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});
  
  // API URL State
  const [url, setUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  
  // Test Connection State
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean; message?: string; error?: string} | null>(null);

  useEffect(() => {
    if (user?.role === 'admin') {
      setUsers(getUsers());
    }
    const current = getApiUrl();
    setUrl(current);
    setSavedUrl(current);
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

  const handleSaveUrl = () => {
      setApiUrl(url);
      setSavedUrl(url);
      alert('บันทึก URL เรียบร้อยแล้ว');
      // Clear previous test
      setTestResult(null);
  };

  const handleTestConnection = async () => {
      if (!url) return;
      setIsTesting(true);
      setTestResult(null);
      
      // Save temporarily to test
      setApiUrl(url);
      
      const result = await testApiConnection();
      setTestResult(result);
      setIsTesting(false);
  };
  
  const handleClearCache = () => {
      if(confirm('คุณต้องการล้างแคชข้อมูลทั้งหมดหรือไม่? (ข้อมูลจะถูกโหลดใหม่จาก Google Sheet)')) {
          clearCache();
          alert('ล้างแคชเรียบร้อยแล้ว');
          window.location.reload();
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

        {/* API Connection Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
             <div className="p-4 border-b border-gray-100 dark:border-gray-700 font-semibold text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider flex items-center gap-2">
                <Link size={16} />
                เชื่อมต่อ Google Sheets (API)
            </div>
            <div className="p-6">
                <div className="mb-4 text-sm text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                    <p className="font-bold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-2"><HelpCircle size={16}/> ขั้นตอนการเชื่อมต่อ:</p>
                    <ul className="list-disc list-inside space-y-1 ml-1">
                        <li>สร้าง Google Apps Script ใน Sheet ของคุณ</li>
                        <li>กด <strong>Deploy</strong> &gt; <strong>New deployment</strong></li>
                        <li>เลือก type: <strong>Web app</strong></li>
                        <li>Execute as: <strong>Me</strong> (อีเมลของคุณ)</li>
                        <li>Who has access: <strong>Anyone</strong> (สำคัญมาก!)</li>
                        <li>Copy URL มาวางในช่องด้านล่าง</li>
                    </ul>
                </div>

                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Google Script Web App URL</label>
                <div className="flex flex-col md:flex-row gap-3">
                    <input 
                        type="text" 
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://script.google.com/macros/s/.../exec"
                        className="flex-1 p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-pastel-blue outline-none dark:text-white font-mono text-sm"
                    />
                    <div className="flex gap-2">
                        <button 
                            onClick={handleTestConnection}
                            disabled={!url || isTesting}
                            className={`px-4 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap ${isTesting ? 'bg-gray-100 text-gray-400' : 'bg-orange-100 text-orange-600 hover:bg-orange-200'}`}
                        >
                            <RefreshCw size={18} className={isTesting ? 'animate-spin' : ''} />
                            {isTesting ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
                        </button>
                        <button 
                            onClick={handleSaveUrl}
                            className="bg-pastel-blueDark text-white px-6 py-3 rounded-xl font-bold hover:bg-sky-800 transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap"
                        >
                            <Check size={18} />
                            บันทึก
                        </button>
                    </div>
                </div>

                {/* Test Result Message */}
                {testResult && (
                    <div className={`mt-4 p-4 rounded-xl flex items-start gap-3 animate-slide-up ${testResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        {testResult.success ? <CheckCircle className="flex-shrink-0 mt-0.5" /> : <AlertCircle className="flex-shrink-0 mt-0.5" />}
                        <div>
                            <p className="font-bold">{testResult.success ? 'การเชื่อมต่อสำเร็จ!' : 'เชื่อมต่อล้มเหลว'}</p>
                            <p className="text-sm mt-1 opacity-90">{testResult.message || testResult.error}</p>
                        </div>
                    </div>
                )}
                
                {/* Troubleshooting Guide (Only Show on Error) */}
                {testResult && !testResult.success && (
                    <div className="mt-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-700 border-2 border-dashed border-gray-200 dark:border-gray-600 animate-slide-up">
                        <h4 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 mb-3">
                            <AlertTriangle className="text-orange-500" size={20}/>
                            แนวทางแก้ไขปัญหา (Troubleshooting)
                        </h4>
                        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                             <div className="flex gap-3">
                                 <div className="bg-white dark:bg-gray-800 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shadow-sm">1</div>
                                 <div>
                                     <p className="font-semibold text-gray-800 dark:text-white">สิทธิ์การเข้าถึง (Who has access)</p>
                                     <p>ต้องตั้งค่าเป็น <strong>"Anyone" (ทุกคน)</strong> เท่านั้น หากตั้งเป็น "Anyone with Google Account" หรือ "Only me" ระบบจะไม่สามารถดึงข้อมูลได้</p>
                                 </div>
                             </div>
                             <div className="flex gap-3">
                                 <div className="bg-white dark:bg-gray-800 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shadow-sm">2</div>
                                 <div>
                                     <p className="font-semibold text-gray-800 dark:text-white">การ Deploy ใหม่</p>
                                     <p>หากมีการแก้ไขโค้ดใน Script Editor ต้องกด <strong>Deploy &gt; New deployment</strong> ทุกครั้ง เพื่อให้โค้ดใหม่เริ่มทำงาน</p>
                                 </div>
                             </div>
                             <div className="flex gap-3">
                                 <div className="bg-white dark:bg-gray-800 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shadow-sm">3</div>
                                 <div>
                                     <p className="font-semibold text-gray-800 dark:text-white">URL ถูกต้องหรือไม่?</p>
                                     <p>URL ต้องลงท้ายด้วย <code>/exec</code> เสมอ ตรวจสอบว่าไม่มีตัวอักษรอื่นต่อท้าย</p>
                                 </div>
                             </div>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Maintenance */}
         <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
             <div className="p-4 border-b border-gray-100 dark:border-gray-700 font-semibold text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider">
                การจัดการข้อมูล
             </div>
             <button 
               onClick={handleClearCache}
               className="w-full text-left p-4 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/10 flex items-center gap-3 transition-colors font-medium"
             >
                <Database size={20} />
                ล้างแคชข้อมูล (Clear Local Data)
             </button>
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
