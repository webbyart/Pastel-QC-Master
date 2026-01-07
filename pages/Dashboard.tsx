
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { fetchQCLogs, fetchCloudStats } from '../services/db';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CheckCircle2, AlertTriangle, Package, Activity, Loader2, ScanLine, FileSpreadsheet, RefreshCw, ClipboardList, Database, Zap } from 'lucide-react';
import { QCStatus, QCRecord } from '../types';
import { useNavigate } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<QCRecord[]>([]);
  const [cloudStats, setCloudStats] = useState({ total: 0, checked: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const syncData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsRefreshing(true);
    try {
        const [freshLogs, stats] = await Promise.all([
            fetchQCLogs(true),
            fetchCloudStats()
        ]);
        setLogs(freshLogs);
        setCloudStats({ total: stats.total, checked: stats.checked });
    } catch (e) {
        console.warn("Auto-sync error:", e);
    } finally {
        setIsRefreshing(false);
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    syncData();
    // Real-time Polling: Sync every 10 seconds
    const interval = setInterval(() => syncData(true), 10000);
    return () => clearInterval(interval);
  }, [syncData]);

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
      
      {isRefreshing && (
          <div className="fixed top-24 right-8 z-50">
              <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-pastel-blue/30 flex items-center gap-2 animate-pulse">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>
                  <span className="text-[10px] font-black text-pastel-blueDark uppercase tracking-widest">Live Syncing...</span>
              </div>
          </div>
      )}

      <header className="flex justify-between items-start mb-2 px-1">
        <div>
            <h1 className="text-3xl font-black text-gray-800 dark:text-white uppercase tracking-tight">Dashboard</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">สรุปผลการตรวจสอบแบบเรียลไทม์</p>
        </div>
        <button 
            onClick={() => syncData()} 
            disabled={isRefreshing}
            className="p-3 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
        >
            <RefreshCw size={20} className={`text-pastel-blueDark ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </header>
    
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4">
              <div className="p-4 bg-pastel-blue/50 rounded-2xl text-pastel-blueDark"><Database size={24} /></div>
              <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Inventory</p>
                  <p className="text-2xl font-black text-gray-800 dark:text-white">{cloudStats.total.toLocaleString()}</p>
              </div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4">
              <div className="p-4 bg-pastel-green/50 rounded-2xl text-pastel-greenDark"><CheckCircle2 size={24} /></div>
              <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Passed</p>
                  <p className="text-2xl font-black text-gray-800 dark:text-white">{stats.passed.toLocaleString()}</p>
              </div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4">
              <div className="p-4 bg-pastel-red/50 rounded-2xl text-pastel-redDark"><AlertTriangle size={24} /></div>
              <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Damaged</p>
                  <p className="text-2xl font-black text-gray-800 dark:text-white">{stats.damaged.toLocaleString()}</p>
              </div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4">
              <div className="p-4 bg-pastel-purple/50 rounded-2xl text-pastel-purpleDark"><Activity size={24} /></div>
              <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Checked Items</p>
                  <p className="text-2xl font-black text-gray-800 dark:text-white">{cloudStats.checked.toLocaleString()}</p>
              </div>
          </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => navigate('/qc')} className="flex items-center justify-between p-7 rounded-[2.5rem] bg-gradient-to-br from-pastel-blueDark to-blue-700 text-white shadow-xl shadow-blue-500/30 active:scale-95 transition-all group">
            <div className="text-left">
                <p className="font-black text-xl uppercase tracking-tight">สแกน QC</p>
                <p className="text-blue-100 text-[10px] uppercase font-bold tracking-widest opacity-70">Start Inspection</p>
            </div>
            <ScanLine size={32} />
        </button>
        <button onClick={() => navigate('/report')} className="flex items-center justify-between p-7 rounded-[2.5rem] bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm active:scale-95 transition-all group">
            <div className="text-left">
                <p className="font-black text-xl text-gray-800 dark:text-white uppercase tracking-tight">รายงาน</p>
                <p className="text-gray-400 text-[10px] uppercase font-bold tracking-widest">System Logs</p>
            </div>
            <FileSpreadsheet size={32} className="text-pastel-purpleDark" />
        </button>
      </div>

      {isLoading && logs.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-[30vh] space-y-4">
              <Loader2 className="animate-spin text-pastel-blueDark" size={40} />
              <p className="text-gray-400 font-black uppercase text-[10px] tracking-[0.3em]">Initializing Cloud Session...</p>
          </div>
      ) : logs.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-[3rem] p-16 text-center border border-gray-100 dark:border-gray-700 shadow-sm animate-fade-in flex flex-col items-center gap-6">
             <div className="p-8 bg-gray-50 dark:bg-gray-900 rounded-full text-gray-200"><ClipboardList size={64} /></div>
             <div>
                <h3 className="text-2xl font-black text-gray-800 dark:text-white mb-2 uppercase tracking-tight">ยังไม่มีประวัติวันนี้</h3>
                <p className="text-gray-400 text-sm">เริ่มตรวจสอบสินค้าเพื่อดูสถิติที่นี่</p>
             </div>
             <button onClick={() => navigate('/qc')} className="bg-pastel-blueDark text-white px-12 py-5 rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-3">
                 <Zap size={20} fill="currentColor" /> เริ่มสแกนเลย
             </button>
          </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 p-10 rounded-[3.5rem] shadow-sm border border-gray-100 dark:border-gray-700 min-h-[400px]">
          <h3 className="text-xl font-black mb-8 text-gray-800 dark:text-white uppercase tracking-tight flex items-center gap-3">
              <div className="w-2 h-8 bg-pastel-blueDark rounded-full"></div>
              คุณภาพการผลิต
          </h3>
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                <Pie data={pieData} innerRadius={70} outerRadius={100} paddingAngle={10} dataKey="value" stroke="none">
                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip 
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                />
                </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-8 mt-4">
              <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">PASS: {stats.passed}</span>
              </div>
              <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">DAMAGE: {stats.damaged}</span>
              </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-10 rounded-[3.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-center">
            <div className="space-y-8">
                <div>
                    <p className="text-[10px] font-black text-pastel-blueDark uppercase tracking-[0.3em] mb-2">Revenue Generated</p>
                    <p className="text-6xl font-black text-gray-800 dark:text-white tracking-tighter">฿{stats.value.toLocaleString()}</p>
                </div>
                <div className="h-px bg-gray-100 dark:bg-gray-700 w-full"></div>
                <div className="grid grid-cols-2 gap-6">
                    <div className="p-6 bg-pastel-blue/20 dark:bg-blue-900/10 rounded-3xl border border-pastel-blue/30">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Efficiency Rate</p>
                        <p className="text-2xl font-black text-pastel-blueDark">{stats.total > 0 ? Math.round((stats.passed/stats.total)*100) : 0}%</p>
                    </div>
                    <div className="p-6 bg-pastel-red/20 dark:bg-red-900/10 rounded-3xl border border-pastel-red/30">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Reject Rate</p>
                        <p className="text-2xl font-black text-pastel-redDark">{stats.total > 0 ? Math.round((stats.damaged/stats.total)*100) : 0}%</p>
                    </div>
                </div>
            </div>
        </div>
      </div>
      )}
    </div>
  );
};
