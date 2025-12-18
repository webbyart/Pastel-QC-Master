
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
  const [showHelp, setShowHelp] = useState(false);

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
        } catch (e) {
            console.warn("Local cache not available", e);
        }

        const url = getApiUrl();
        if (!url) {
            setIsLoading(false);
            if (!hasCachedData) {
                setError({ message: "กรุณาตั้งค่าการเชื่อมต่อในหน้า 'ตั้งค่า' ก่อนเริ่มใช้งาน", isMixed: false });
            }
            return;
        }

        setIsRefreshing(true);
        try {
            const freshData = await fetchQCLogs(true);
            setLogs(freshData);
            setError(null);
        } catch (e: any) {
            console.error("Cloud refresh error:", e);
            const isMixed = e.isMixedContent || e.message === "MIXED_CONTENT_BLOCKED";
            const isMissingTable = e.message?.includes('TABLE_NOT_FOUND');
            
            if (!hasCachedData) {
                setError({ 
                    message: isMissingTable 
                        ? "ยังไม่ได้สร้างตารางในฐานข้อมูล Supabase" 
                        : (isMixed ? "บราวเซอร์บล็อกการเชื่อมต่อ (Mixed Content)" : (e.message || "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้")), 
                    isMixed,
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
      const url = getApiUrl();
      if (!url) {
          alert("ไม่พบ URL สำหรับเชื่อมต่อ กรุณาไปที่หน้าตั้งค่า");
          return;
      }
      setIsRefreshing(true);
      setError(null);
      try {
          const data = await fetchQCLogs(true);
          setLogs(data);
      } catch (e: any) {
          const isMissingTable = e.message?.includes('TABLE_NOT_FOUND');
          if (isMissingTable) {
              setError({ message: "ยังไม่ได้สร้างตารางในฐานข้อมูล Supabase", isMixed: false, code: 'TABLE_MISSING' });
          } else {
              alert(`ไม่สามารถรีเฟรชข้อมูลได้: ${e.message}`);
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
    { name: 'ผ่าน (Pass)', value: stats.passed, color: '#4ADE80' },
    { name: 'ชำรุด (Damage)', value: stats.damaged, color: '#F87171' },
  ];

  const recentLogs = logs.slice(0, 5);

  return (
    <div className="space-y-6 pb-20 animate-fade-in relative min-h-screen">
      
      {isRefreshing && logs.length > 0 && (
          <div className="absolute inset-x-0 top-0 z-50 flex justify-center mt-4">
              <div className="bg-white dark:bg-gray-800 px-6 py-2 rounded-full shadow-2xl flex items-center gap-3 border border-gray-100 dark:border-gray-700 animate-slide-up">
                  <Loader2 className="animate-spin text-pastel-blueDark" size={16} />
                  <span className="font-bold text-xs text-gray-700 dark:text-gray-200">Refreshing...</span>
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
        <button 
            onClick={() => navigate('/qc')}
            className="flex items-center justify-between p-5 rounded-[2rem] bg-gradient-to-br from-pastel-blueDark to-blue-700 text-white shadow-xl shadow-blue-500/30 transform active:scale-95 transition-all group"
        >
            <div className="text-left">
                <p className="font-bold text-lg">สแกน QC</p>
                <p className="text-blue-100 text-[10px] uppercase font-bold tracking-wider opacity-70">Start Scan</p>
            </div>
            <div className="bg-white/20 p-3 rounded-2xl group-hover:rotate-12 transition-transform">
                <ScanLine size={24} />
            </div>
        </button>

        <button 
            onClick={() => navigate('/report')}
            className="flex items-center justify-between p-5 rounded-[2rem] bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transform active:scale-95 transition-all group"
        >
            <div className="text-left">
                <p className="font-bold text-lg text-gray-800 dark:text-white">รายงาน</p>
                <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">Reports</p>
            </div>
            <div className="bg-pastel-purple p-3 rounded-2xl group-hover:rotate-12 transition-transform">
                <FileSpreadsheet size={24} className="text-pastel-purpleDark" />
            </div>
        </button>
      </div>

      {error && logs.length === 0 && (
          <div className="bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900/30 rounded-3xl p-8 text-center animate-slide-up shadow-xl">
              <div className="bg-red-50 dark:bg-red-900/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                  {error.code === 'TABLE_MISSING' ? <DatabaseZap size={40} className="text-amber-500" /> : (error.isMixed ? <ShieldAlert size={40} className="text-red-500" /> : <AlertCircle size={40} className="text-red-500" />)}
              </div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">{error.code === 'TABLE_MISSING' ? "ยังไม่ได้สร้างตาราง" : (error.isMixed ? "การเชื่อมต่อถูกบล็อก" : "ไม่สามารถเชื่อมต่อได้")}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-xs mx-auto leading-relaxed">{error.message}</p>
              
              <div className="flex flex-col gap-3">
                  {error.code === 'TABLE_MISSING' ? (
                      <button 
                        onClick={() => navigate('/settings')}
                        className="bg-amber-500 text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-amber-500/30 hover:bg-amber-600 transition-all flex items-center justify-center gap-2"
                      >
                          <SettingsIcon size={20} /> ไปหน้าตั้งค่าเพื่อสร้างตาราง
                      </button>
                  ) : error.isMixed ? (
                      <button 
                        onClick={() => setShowHelp(true)}
                        className="bg-amber-500 text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-amber-500/30 hover:bg-amber-600 transition-all flex items-center justify-center gap-2"
                      >
                          <ShieldAlert size={20} /> วิธีปลดบล็อกการเชื่อมต่อ
                      </button>
                  ) : (
                      <button 
                        onClick={() => navigate('/settings')}
                        className="bg-pastel-blueDark text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-blue-500/30 hover:bg-sky-800 transition-all"
                      >
                          ไปที่หน้าตั้งค่า
                      </button>
                  )}
              </div>
          </div>
      )}

      {/* Connection Help Modal */}
      {showHelp && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowHelp(false)} />
              <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-8 shadow-2xl relative animate-slide-up max-w-md w-full">
                  <button onClick={() => setShowHelp(false)} className="absolute top-6 right-6 p-2 bg-gray-100 dark:bg-gray-700 rounded-full"><X size={20}/></button>
                  <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
                      <ShieldAlert className="text-amber-500" /> วิธีแก้การเชื่อมต่อ
                  </h3>
                  <div className="space-y-6 text-sm">
                      <div className="flex gap-4">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">1</div>
                          <div>
                              <p className="font-bold text-gray-800 dark:text-gray-200">เปิดการตั้งค่าเว็บไซต์</p>
                              <p className="text-gray-500 text-xs">คลิกไอคอน "แม่กุญแจ" หรือ "ตัวเลื่อน" ด้านซ้ายของ URL (Address Bar)</p>
                          </div>
                      </div>
                      <div className="flex gap-4">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">2</div>
                          <div>
                              <p className="font-bold text-gray-800 dark:text-gray-200">เลือก Site Settings</p>
                              <p className="text-gray-500 text-xs">กดเมนู "Site Settings" หรือ "การตั้งค่าไซต์"</p>
                          </div>
                      </div>
                      <div className="flex gap-4">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">3</div>
                          <div>
                              <p className="font-bold text-gray-800 dark:text-gray-200">อนุญาต Insecure Content</p>
                              <p className="text-gray-500 text-xs">หาหัวข้อ <b>Insecure Content</b> (เนื้อหาที่ไม่ปลอดภัย) แล้วเปลี่ยนเป็น <b>Allow</b> (อนุญาต)</p>
                          </div>
                      </div>
                      <div className="flex gap-4">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold">4</div>
                          <div>
                              <p className="font-bold text-gray-800 dark:text-gray-200">รีเฟรชหน้าเว็บ</p>
                              <p className="text-gray-500 text-xs">กลับมาที่หน้าเว็บแล้วกดรีเฟรช 1 ครั้งเพื่อเริ่มใช้งาน</p>
                          </div>
                      </div>
                  </div>
                  <button 
                    onClick={() => window.location.reload()}
                    className="w-full mt-8 py-4 bg-pastel-blueDark text-white rounded-2xl font-bold shadow-lg"
                  >
                      รีเฟรชหน้าเว็บทันที
                  </button>
              </div>
          </div>
      )}

      {isLoading && logs.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-[40vh] space-y-4">
              <Loader2 className="animate-spin text-pastel-blueDark" size={40} />
              <p className="text-gray-400 font-medium animate-pulse">Loading Dashboard...</p>
          </div>
      ) : logs.length === 0 && !error ? (
          <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-10 text-center border border-gray-100 dark:border-gray-700 shadow-sm animate-fade-in">
             <div className="bg-pastel-blue w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                <ClipboardList size={48} className="text-pastel-blueDark" />
             </div>
             <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-3">ยังไม่มีข้อมูล QC</h3>
             <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-xs mx-auto">
                เริ่มต้นการตรวจสอบโดยการสแกนบาร์โค้ดสินค้าที่คลัง
             </p>
             <button 
                onClick={() => navigate('/qc')}
                className="bg-pastel-blueDark text-white px-10 py-4 rounded-2xl font-bold shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
            >
                สแกนสินค้าเลย
            </button>
          </div>
      ) : logs.length > 0 && (
      <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col group">
            <div className="flex justify-between items-start mb-2">
                <span className="text-gray-400 text-[10px] uppercase font-black tracking-widest">Total Logs</span>
                <Package className="w-5 h-5 text-blue-500 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-3xl font-black text-gray-800 dark:text-white">{stats.total}</span>
            <span className="text-[10px] text-gray-400 font-bold mt-1">รายการสะสม</span>
        </div>
        <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col group">
            <div className="flex justify-between items-start mb-2">
                <span className="text-gray-400 text-[10px] uppercase font-black tracking-widest">QC Pass</span>
                <CheckCircle2 className="w-5 h-5 text-green-500 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-3xl font-black text-green-600">{stats.passed}</span>
            <span className="text-[10px] text-gray-400 font-bold mt-1">รายการที่ผ่าน</span>
        </div>
        <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col group">
            <div className="flex justify-between items-start mb-2">
                <span className="text-gray-400 text-[10px] uppercase font-black tracking-widest">Damaged</span>
                <AlertTriangle className="w-5 h-5 text-red-500 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-3xl font-black text-red-600">{stats.damaged}</span>
            <span className="text-[10px] text-gray-400 font-bold mt-1">รายการเสียหาย</span>
        </div>
         <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col group">
            <div className="flex justify-between items-start mb-2">
                <span className="text-gray-400 text-[10px] uppercase font-black tracking-widest">Revenue</span>
                <Activity className="w-5 h-5 text-purple-500 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-2xl font-black text-gray-800 dark:text-white">฿{stats.value.toLocaleString()}</span>
            <span className="text-[10px] text-gray-400 font-bold mt-1">มูลค่าราคาขาย</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 h-80 flex flex-col">
          <h3 className="text-lg font-bold mb-6 text-gray-800 dark:text-white border-l-4 border-pastel-blueDark pl-3">สัดส่วนคุณภาพ</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                <Pie
                    data={pieData}
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                >
                    {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                </Pie>
                <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                />
                </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white border-l-4 border-pastel-purpleDark pl-3">กิจกรรมล่าสุด</h3>
                <button onClick={() => navigate('/report')} className="text-xs text-pastel-blueDark font-black uppercase tracking-tighter hover:underline">All History</button>
            </div>
            <div className="space-y-4 flex-1">
                {recentLogs.map(log => (
                    <div key={log.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl group hover:bg-white dark:hover:bg-gray-700 transition-all border border-transparent hover:border-gray-100">
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${log.status === QCStatus.PASS ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                {log.status === QCStatus.PASS ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                            </div>
                            <div className="max-w-[120px] md:max-w-none">
                                <p className="font-bold text-sm text-gray-800 dark:text-gray-200 truncate">{log.productName}</p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{new Date(log.timestamp).toLocaleTimeString('th-TH')}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="font-black text-sm text-gray-800 dark:text-gray-100">฿{log.sellingPrice.toLocaleString()}</span>
                        </div>
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
