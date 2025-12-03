
import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, ScanLine, FileSpreadsheet, Settings, Package, Box } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Layout: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Outlet />;
  }

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'หน้าหลัก' },
    { to: '/products', icon: Box, label: 'สินค้า' },
    { to: '/qc', icon: ScanLine, label: 'ตรวจสอบ' },
    { to: '/report', icon: FileSpreadsheet, label: 'รายงาน' },
    { to: '/settings', icon: Settings, label: 'ตั้งค่า' },
  ];

  const isCurrent = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  return (
    <div className="min-h-screen flex flex-col md:pl-64 bg-gray-50 dark:bg-gray-900">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed top-0 left-0 w-64 h-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-r border-gray-200 dark:border-gray-700 flex-col z-20 shadow-sm">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-1">
             <div className="bg-gradient-to-br from-pastel-purple to-pastel-blue p-2 rounded-xl shadow-inner">
                <Box className="w-6 h-6 text-pastel-blueDark" />
             </div>
             <h1 className="text-xl font-display font-bold text-gray-800 dark:text-white tracking-tight">QC Master</h1>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 ml-1">v2.1 ระบบตรวจสอบสินค้า</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center p-3.5 rounded-2xl transition-all duration-300 group ${
                  isActive
                    ? 'bg-pastel-blue/50 dark:bg-gray-700 text-pastel-blueDark dark:text-white font-semibold shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-700 dark:hover:text-gray-200'
                }`
              }
            >
              <item.icon className={`w-5 h-5 mr-3 transition-transform group-hover:scale-110 ${isCurrent(item.to) ? 'text-pastel-blueDark dark:text-pastel-blue' : ''}`} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        
        <div className="p-6">
             <div className="bg-gradient-to-br from-pastel-purple/20 to-pastel-pink/20 rounded-2xl p-4 border border-white/50 dark:border-gray-600">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">เข้าสู่ระบบโดย</p>
                <p className="font-bold text-gray-800 dark:text-white truncate">{user.username}</p>
             </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full relative z-10">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation - Improved Aesthetics */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 shadow-2xl flex justify-around items-center px-2 py-2 z-50 animate-slide-up pb-safe">
        {navItems.map((item) => {
           const active = isCurrent(item.to);
           return (
            <NavLink
                key={item.to}
                to={item.to}
                className="flex flex-col items-center justify-center w-full py-2 relative group"
            >
                <div className={`
                    absolute top-1 rounded-full w-12 h-8 transition-all duration-300
                    ${active ? 'bg-pastel-blue/40 dark:bg-gray-700' : 'bg-transparent'}
                `} />
                
                <item.icon 
                    className={`w-6 h-6 z-10 transition-all duration-300 ${active ? 'text-pastel-blueDark dark:text-pastel-blue mb-0.5' : 'text-gray-400 dark:text-gray-500'}`} 
                    strokeWidth={active ? 2.5 : 2}
                />
                <span className={`text-[10px] font-bold z-10 transition-all duration-300 ${active ? 'text-pastel-blueDark dark:text-pastel-blue' : 'text-gray-400'}`}>
                    {item.label}
                </span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};
