import React, { useMemo, useState, useEffect } from 'react';
import { fetchQCLogs } from '../services/db';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { CheckCircle2, AlertTriangle, Package, DollarSign, Activity, Loader2, ScanLine, FileSpreadsheet, RefreshCw, AlertCircle, Settings as SettingsIcon, ClipboardList, ArrowRight } from 'lucide-react';
import { QCStatus, QCRecord } from '../types';
import { useNavigate } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<QCRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optimized Loading Strategy:
  useEffect(() => {
    const init = async () => {
        setError(null);
        let hasCachedData = false;

        // Step 1: Get cached data first
        try {
            const cachedData = await fetchQCLogs(false);
            if (cachedData.length > 0) {
                setLogs(cachedData);
                setIsLoading(false);
                hasCachedData = true;
            }
        } catch (e) {
            console.warn("Cache load error", e);
        }

        // Step 2: Fetch fresh data in background (Throttled)
        setIsRefreshing(true);
        try {
            // fetchQCLogs(forceUpdate=true, skipThrottle=false)
            const freshData = await fetchQCLogs(true, false);
            setLogs(freshData);
            setIsLoading(false);
        } catch (e: any) {
            console.error("Background refresh failed", e);
            // ONLY show error if we don't have cached data
            if (!hasCachedData) {
                 setError(e.message || "Failed to connect");
            }
        } finally {
            setIsRefreshing(false);
            setIsLoading(false);
        }
    };
    init();
  }, []);

  const handleManualRefresh = async () => {
      setIsRefreshing(true);
      setError(null);
      try {
          // fetchQCLogs(forceUpdate=true, skipThrottle=true)
          const data = await fetchQCLogs(true, true);
          setLogs(data);
          if (data.length === 0) {
             // alert('เชื่อมต่อสำเร็จ แต่ไม่พบข้อมูลใน Sheet "QC_Logs"');
          }
      } catch (e: any) {
          if (logs.length > 0) {
               alert(`Update failed: ${e.message}`);
          } else {
               setError(e.message);
          }
      } finally {
          setIsRefreshing(false);
      }
  };

  const stats = useMemo(() => {
    return {
      total: logs.length,
      passed: logs.filter(l => l.status === QCStatus.PASS).length,
      damaged: logs.filter(l => l.status === QCStatus.DAMAGE).length,
      value: logs.reduce((acc, curr) => acc + (curr.sellingPrice || 0), 0)
    };
  }, [logs]);

  const pieData = [
    { name: 'ผ่าน (Pass)', value: stats.passed, color: '#4ADE80' }, // Green
    { name: 'ชำรุด (Damage)', value: stats.damaged, color: '#F87171' }, // Red
  ];

  const recentLogs = logs.slice(0, 5);

  return (
    <div className="space-y-6 pb-20 animate-fade-in relative min-h-screen">
      
      {/* Loading Overlay for Manual Refresh */}
      {isRefreshing && logs.length > 0 && (
          <div className="absolute inset-0 bg-white/50 dark:bg-black/20 z-10 flex items-start justify-center pt-20 backdrop-blur-[1px] rounded-3xl">
              <div className="bg-white dark:bg-gray-800 px-6 py-3 rounded-full shadow-xl flex items-center gap-3 border border-gray-100 dark:border-gray-700 animate-slide-up">
                  <Loader2 className="animate-spin text-pastel-blueDark" size={20} />
                  <span className="font-medium text-sm text-gray-700 dark:text-gray-200">กำลังอัปเดตข้อมูล...</span>
              </div>
          </div>
      )}

      <header className="flex justify-between items-start mb-2">
        <div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">ภาพรวมระบบ (Dashboard)</h1>
            <p className="text-gray-500 dark:text-gray-400">สรุปผลการตรวจสอบคุณภาพสินค้า</p>
        </div>
        <button 
            onClick={handleManualRefresh} 
            disabled={isRefreshing}
            className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors shadow-sm"
        >
            <RefreshCw size={20} className={`text-gray-500 dark:text-gray-300 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </header>
    
      {/* Quick Access Section */}
      <div className="grid grid-cols-2 gap-4">
        <button 
            onClick={() => navigate('/qc')}
            className="flex items-center justify-between p-5 rounded-2xl bg-gradient-to-r from-pastel-blueDark to-blue-600 text-white shadow-lg shadow-blue-500/30 transform active:scale-95 transition-all group"
        >
            <div className="text-left">
                <p className="font-bold text-lg">เริ่มตรวจสอบ</p>
                <p className="text-blue-100 text-xs">Start QC Scan</p>
            </div>
            <div className="bg-white/20 p-3 rounded-xl group-hover:scale-110 transition-transform">
                <ScanLine size={24} />
            </div>
        </button>

        <button 
            onClick={() => navigate('/report')}
            className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transform active:scale-95 transition-all group"
        >
            <div className="text-left">
                <p className="font-bold text-lg text-gray-800 dark:text-white">ดูรายงาน</p>
                <p className="text-gray-400 text-xs">View Report</p>
            </div>
            <div className="bg-pastel-purple p-3 rounded-xl group-hover:scale-110 transition-transform">
                <FileSpreadsheet size={24} className="text-pastel-purpleDark" />
            </div>
        </button>
      </div>

      {/* Error State */}
      {error && logs.length === 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-2xl p-6 text-center animate-slide-up">
              <AlertCircle size={48} className="text-red-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-red-700 dark:text-red-400 mb-1">การเชื่อมต่อล้มเหลว</h3>
              <p className="text-sm text-red-600 dark:text-red-300 mb-4">{error}</p>
              <button 
                onClick={() => navigate('/settings')}
                className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md flex items-center gap-2 mx-auto hover:bg-red-700"
              >
                  <SettingsIcon size={16} /> ไปที่การตั้งค่า
              </button>
          </div>
      )}

      {isLoading && logs.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-[40vh] space-y-4">
              <Loader2 className="animate-spin text-pastel-blueDark" size={40} />
              <p className="text-gray-400 animate-pulse">กำลังโหลดข้อมูลจาก QC_Logs...</p>
          </div>
      ) : logs.length === 0 && !error ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 shadow-sm animate-fade-in">
             <div className="bg-blue-50 dark:bg-blue-900/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5">
                <ClipboardList size={40} className="text-pastel-blueDark dark:text-pastel-blue" />
             </div>
             <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">ยังไม่มีประวัติการตรวจสอบ</h3>
             <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto leading-relaxed">
                ระบบเชื่อมต่อสำเร็จและพร้อมใช้งาน! <br/>
                เริ่มต้นสแกนสินค้าเพื่อบันทึกผลการตรวจสอบ (QC)
             </p>
             
             <div className="flex flex-col sm:flex-row gap-3 justify-center">
                 <button 
                    onClick={() => navigate('/qc')}
                    className="flex items-center justify-center gap-2 bg-pastel-blueDark text-white px-6 py-3.5 rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-sky-800 transition-all active:scale-95"
                >
                    <ScanLine size={20} />
                    เริ่มตรวจสอบสินค้า
                </button>
                 <button 
                    onClick={handleManualRefresh}
                    disabled={isRefreshing}
                    className="flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-6 py-3.5 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all active:scale-95"
                >
                    <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
                    รีเฟรชข้อมูล
                </button>
             </div>
             
             <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700/50">
                 <p className="text-xs text-gray-400">
                    หากคุณมั่นใจว่ามีข้อมูลใน Sheet "QC_Logs" แต่ไม่แสดง <br/>
                    <span className="text-pastel-blueDark dark:text-pastel-blue cursor-pointer hover:underline" onClick={() => navigate('/settings')}>ตรวจสอบการตั้งค่าการเชื่อมต่อ</span>
                </p>
             </div>
          </div>
      ) : (
      <>
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
            <div className="flex justify-between items-start mb-2">
                <span className="text-gray-400 text-xs uppercase font-bold">ตรวจสอบแล้ว</span>
                <Package className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-3xl font-bold text-gray-800 dark:text-white">{stats.total}</span>
            <span className="text-xs text-gray-400 mt-1">รายการ</span>
        </div>
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
            <div className="flex justify-between items-start mb-2">
                <span className="text-gray-400 text-xs uppercase font-bold">ผ่านเกณฑ์</span>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <span className="text-3xl font-bold text-green-600">{stats.passed}</span>
            <span className="text-xs text-gray-400 mt-1">รายการ</span>
        </div>
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
            <div className="flex justify-between items-start mb-2">
                <span className="text-gray-400 text-xs uppercase font-bold">ชำรุด/เสียหาย</span>
                <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <span className="text-3xl font-bold text-red-600">{stats.damaged}</span>
            <span className="text-xs text-gray-400 mt-1">รายการ</span>
        </div>
         <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
            <div className="flex justify-between items-start mb-2">
                <span className="text-gray-400 text-xs uppercase font-bold">มูลค่ารวม</span>
                <Activity className="w-5 h-5 text-purple-500" />
            </div>
            <span className="text-3xl font-bold text-gray-800 dark:text-white">฿{stats.value.toLocaleString()}</span>
            <span className="text-xs text-gray-400 mt-1">บาท</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 h-80">
          <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">สัดส่วนการตรวจสอบ</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">กิจกรรมล่าสุด</h3>
                <button onClick={() => navigate('/report')} className="text-xs text-pastel-blueDark font-bold hover:underline">ดูทั้งหมด</button>
            </div>
            <div className="space-y-4">
                {recentLogs.length === 0 && <p className="text-gray-400 text-sm">ยังไม่มีรายการตรวจสอบ</p>}
                {recentLogs.map(log => (
                    <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${log.status === QCStatus.PASS ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                {log.status === QCStatus.PASS ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                            </div>
                            <div>
                                <p className="font-medium text-sm text-gray-800 dark:text-gray-200 line-clamp-1">{log.productName}</p>
                                <p className="text-xs text-gray-400">{new Date(log.timestamp).toLocaleTimeString('th-TH')}</p>
                            </div>
                        </div>
                        <span className="font-bold text-sm text-gray-700 dark:text-gray-300">฿{log.sellingPrice}</span>
                    </div>
                ))}
            </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
};