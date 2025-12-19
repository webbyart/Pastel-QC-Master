
import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, ScanLine, FileSpreadsheet, Settings, Box, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (!user) return <Outlet />;

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'หน้าหลัก', roles: ['admin', 'user'] },
    { to: '/products', icon: Box, label: 'คลังสินค้า', roles: ['admin'] },
    { to: '/qc', icon: ScanLine, label: 'ตรวจสอบ', roles: ['admin', 'user'] },
    { to: '/report', icon: FileSpreadsheet, label: 'รายงาน', roles: ['admin', 'user'] },
    { to: '/settings', icon: Settings, label: 'ตั้งค่า', roles: ['admin'] },
  ];

  const visibleItems = navItems.filter(item => item.roles.includes(user.role));

  const isCurrent = (path: string) => location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  return (
    <div className="min-h-screen flex flex-col md:pl-64 bg-gray-50 dark:bg-gray-900">
      {/* Mobile Top Bar */}
      <header className="md:hidden sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-6 py-4 flex justify-between items-center z-40">
        <div className="flex items-center gap-2">
            <div className="bg-pastel-blueDark p-1.5 rounded-lg">
                <Box className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold dark:text-white">QC Master</span>
        </div>
        <div className="flex items-center gap-4">
            <span className="text-[10px] font-black uppercase text-gray-400 tracking-tighter max-w-[80px] truncate">{user.username}</span>
            <button onClick={logout} className="p-2 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl active:scale-90 transition-all">
                <LogOut size={18} />
            </button>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed top-0 left-0 w-64 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-col z-20">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-1">
             <div className="bg-pastel-blueDark p-2 rounded-xl">
                <Box className="w-6 h-6 text-white" />
             </div>
             <h1 className="text-xl font-display font-bold dark:text-white">QC Master</h1>
          </div>
          <p className="text-xs text-gray-500 ml-1">RBAC System Enabled</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center p-4 rounded-2xl transition-all ${
                  isActive ? 'bg-pastel-blueDark text-white shadow-lg' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`
              }
            >
              <item.icon className="w-5 h-5 mr-3" />
              <span className="font-bold text-sm">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        
        <div className="p-6">
             <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-2xl relative group">
                <div className="flex justify-between items-start">
                    <div className="flex-1 overflow-hidden">
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">{user.role} mode</p>
                        <p className="font-bold truncate dark:text-white text-sm">{user.username}</p>
                    </div>
                    <button 
                        onClick={logout}
                        title="Sign Out"
                        className="ml-2 p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-xl transition-all active:scale-90"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-[9px] text-green-500 font-bold">ONLINE</span>
                </div>
             </div>
        </div>
      </aside>

      {/* Content Area */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex justify-around p-2 z-50 pb-safe">
        {visibleItems.map((item) => {
           const active = isCurrent(item.to);
           return (
            <NavLink key={item.to} to={item.to} className="flex flex-col items-center p-2">
                <item.icon className={`w-6 h-6 ${active ? 'text-pastel-blueDark' : 'text-gray-400'}`} />
                <span className={`text-[10px] mt-1 font-bold ${active ? 'text-pastel-blueDark' : 'text-gray-400'}`}>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};
