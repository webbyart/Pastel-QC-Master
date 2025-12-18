
import React, { useMemo, useState, useEffect } from 'react';
import { fetchQCLogs, getApiUrl } from '../services/db';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CheckCircle2, AlertTriangle, Package, Activity, Loader2, ScanLine, FileSpreadsheet, RefreshCw, AlertCircle, Settings as SettingsIcon, ClipboardList, ShieldAlert, X, DatabaseZap } from 'lucide-react';
import { QCStatus, QCRecord } from '../types';
import { useNavigate } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<QCRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<{message: string, isMixed: boolean, code?: string} | null>(null);

  useEffect(() => {
    const init = async () => {
        setError(null);
        let hasCachedData = false;

        try {
            const cachedData = await fetchQCLogs(false);
            if (cachedData && cachedData.length > 0) {
                setLogs(cachedData);
                setIsLoading(false);
                hasCachedData = true;
            }
        } catch (e) { console.warn("Cache load skip", e); }

        // Try automatic cloud connection
        setIsRefreshing(true);
        try {
            const freshData = await fetchQCLogs(true);
            setLogs(freshData);
            setError(null);
        } catch (e: any) {
            console.error("Auto-connect failed:", e);
            const isMissingTable = e.message?.includes('TABLE_NOT_FOUND');
            if (!hasCachedData) {
                setError({ 
                    message: isMissingTable ? "ยังไม่ได้สร้างตารางในฐานข้อมูล" : "ไม่สามารถซิงค์ข้อมูล Cloud ได้",
                    isMixed: e.isMixedContent,
                    code: isMissingTable ? 'TABLE_MISSING' : undefined
                });
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
          const data = await fetchQCLogs(true);
          setLogs(data);
      } catch (e: any) {
          alert(`รีเฟรชไม่สำเร็จ: ${e.message}`);
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
    { name: 'ผ่าน (Pass)', value: stats.passed, color: '#4ADE80' },
    { name: 'ชำรุด (Damage)', value: stats.damaged, color: '#F87171' },
  ];

  return (
    <div className="space-y-6 pb-20 animate-fade-in relative min-h-screen">
      
      {isRefreshing && logs.length > 0 && (
          <div className="absolute inset-x-0 top-0 z-50 flex justify-center mt-4">
              <div className="bg-white dark:bg-gray-800 px-6 py-2 rounded-full shadow-2xl flex items-center gap-3 border border-gray-100 dark:border-gray-700 animate-slide-up">
                  <Loader2 className="animate-spin text-pastel-blueDark" size={16} />
                  <span className="font-bold text-xs text-gray-700 dark:text-gray-200">Syncing Cloud...</span>
              </div>
          </div>
      )}

      <header className="flex justify-between items-start mb-2 px-1">
        <div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">ภาพรวมระบบ</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Dashboard สรุปผลการตรวจสอบ</p>
        </div>
        <button 
            onClick={handleManualRefresh} 
            disabled={isRefreshing}
            className="p-3 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
        >
            <RefreshCw size={20} className={`text-pastel-blueDark ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </header>
    
      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => navigate('/qc')} className="flex items-center justify-between p-5 rounded-[2rem] bg-gradient-to-br from-pastel-blueDark to-blue-700 text-white shadow-xl shadow-blue-500/30 active:scale-95 transition-all group">
            <div className="text-left">
                <p className="font-bold text-lg">สแกน QC</p>
                <p className="text-blue-100 text-[10px] uppercase font-bold tracking-wider opacity-70">Start Scan</p>
            </div>
            <ScanLine size={24} />
        </button>
        <button onClick={() => navigate('/report')} className="flex items-center justify-between p-5 rounded-[2rem] bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm active:scale-95 transition-all group">
            <div className="text-left">
                <p className="font-bold text-lg text-gray-800 dark:text-white">รายงาน</p>
                <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">Reports</p>
            </div>
            <FileSpreadsheet size={24} className="text-pastel-purpleDark" />
        </button>
      </div>

      {isLoading && logs.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-[40vh] space-y-4">
              <Loader2 className="animate-spin text-pastel-blueDark" size={40} />
              <p className="text-gray-400 font-medium animate-pulse">Initializing System...</p>
          </div>
      ) : logs.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-10 text-center border border-gray-100 dark:border-gray-700 shadow-sm animate-fade-in">
             <ClipboardList size={48} className="text-pastel-blueDark mx-auto mb-6" />
             <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-3">ยังไม่มีข้อมูล</h3>
             <button onClick={() => navigate('/qc')} className="bg-pastel-blueDark text-white px-10 py-4 rounded-2xl font-bold shadow-xl">สแกนสินค้าแรก</button>
          </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 h-[350px]">
          <h3 className="text-lg font-bold mb-6 text-gray-800 dark:text-white border-l-4 border-pastel-blueDark pl-3">คุณภาพรวม</h3>
          <div className="w-full h-full">
            <ResponsiveContainer width="100%" height="80%">
                <PieChart>
                <Pie data={pieData} innerRadius={60} outerRadius={85} paddingAngle={8} dataKey="value" stroke="none">
                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip />
                </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
            {[
                { label: 'Total', value: stats.total, icon: Package, color: 'text-blue-500' },
                { label: 'Pass', value: stats.passed, icon: CheckCircle2, color: 'text-green-500' },
                { label: 'Damage', value: stats.damaged, icon: AlertTriangle, color: 'text-red-500' },
                { label: 'Revenue', value: `฿${stats.value.toLocaleString()}`, icon: Activity, color: 'text-purple-500' },
            ].map(stat => (
                <div key={stat.label} className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700">
                    <stat.icon className={`${stat.color} mb-2`} size={20} />
                    <p className="text-2xl font-black text-gray-800 dark:text-white">{stat.value}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">{stat.label}</p>
                </div>
            ))}
        </div>
      </div>
      )}
    </div>
  );
};
