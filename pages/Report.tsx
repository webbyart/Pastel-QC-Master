
import React, { useState, useEffect, useMemo } from 'react';
import { fetchQCLogs, exportQCLogs } from '../services/db';
import { QCRecord, QCStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { Download, Filter, Search, Loader2, Calendar, FileText, CheckCircle2, AlertTriangle, User, RefreshCw, ClipboardList, ImageIcon, DollarSign, TrendingUp, AlertCircle, Tag, Layers } from 'lucide-react';

export const Report: React.FC = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<QCRecord[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<QCRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<QCStatus | 'All'>('All');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => { loadData(); }, [user]);

  const loadData = async (force = false) => {
    if (!user) return;
    setIsLoading(true);
    try {
        // จำกัดข้อมูลหากเป็น User ทั่วไป
        const inspectorId = user.role === 'admin' ? undefined : user.username;
        const data = await fetchQCLogs(force, inspectorId);
        setLogs(data);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const summaryStats = useMemo(() => {
    const passed = filteredLogs.filter(l => l.status === QCStatus.PASS);
    const damaged = filteredLogs.filter(l => l.status === QCStatus.DAMAGE);
    return {
        passCount: passed.length,
        passValue: passed.reduce((sum, l) => sum + (l.sellingPrice || 0), 0),
        damageCount: damaged.length,
        damageValue: damaged.reduce((sum, l) => sum + (l.sellingPrice || 0), 0),
    };
  }, [filteredLogs]);

  useEffect(() => {
    let result = logs;
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(l => l.productName.toLowerCase().includes(lower) || l.barcode.toLowerCase().includes(lower));
    }
    if (statusFilter !== 'All') result = result.filter(l => l.status === statusFilter);
    if (dateFilter) result = result.filter(l => l.timestamp.startsWith(dateFilter));
    setFilteredLogs(result);
  }, [logs, search, statusFilter, dateFilter]);

  const handleExport = async () => {
      setIsExporting(true);
      try {
          // Export เฉพาะที่ Filter อยู่
          await exportQCLogs(filteredLogs);
      } finally { setIsExporting(false); }
  };

  return (
    <div className="space-y-6 pb-24 animate-fade-in">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">รายงานสรุปผล</h1>
          <p className="text-sm text-gray-500">{user?.role === 'admin' ? 'ตรวจสอบประวัติทั้งหมด' : 'ประวัติการตรวจสอบของคุณ'}</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => loadData(true)} className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-all active:rotate-180">
                <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button 
                onClick={handleExport}
                disabled={isExporting || filteredLogs.length === 0}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-pastel-blueDark text-white px-8 py-4 rounded-2xl shadow-xl shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
                {isExporting ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
                <span className="font-black text-xs uppercase tracking-widest">Export Excel</span>
            </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border-l-8 border-green-500 shadow-sm">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pass Count</p>
            <p className="text-2xl font-black text-green-600">{summaryStats.passCount}</p>
            <p className="text-[10px] text-gray-400 mt-1">Value: ฿{summaryStats.passValue.toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border-l-8 border-red-500 shadow-sm">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Damage Count</p>
            <p className="text-2xl font-black text-red-600">{summaryStats.damageCount}</p>
            <p className="text-[10px] text-gray-400 mt-1">Loss: ฿{summaryStats.damageValue.toLocaleString()}</p>
        </div>
        <div className="bg-pastel-blueDark p-6 rounded-3xl text-white shadow-xl shadow-blue-500/20">
            <p className="text-[10px] font-black text-blue-100 uppercase tracking-widest mb-1">Total Checked</p>
            <p className="text-2xl font-black">{filteredLogs.length}</p>
            <p className="text-[10px] text-blue-200 mt-1">Items processed in period</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" placeholder="ค้นหาชื่อสินค้า..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-gray-900 border-none rounded-2xl text-sm dark:text-white" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-none rounded-2xl text-sm font-bold dark:text-white appearance-none">
            <option value="All">สถานะทั้งหมด</option>
            <option value={QCStatus.PASS}>Pass Only</option>
            <option value={QCStatus.DAMAGE}>Damage Only</option>
        </select>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-none rounded-2xl text-sm font-bold dark:text-white" />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-sm overflow-hidden border border-gray-100 dark:border-gray-700">
          <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-400 text-[9px] font-black uppercase tracking-widest border-b border-gray-100 dark:border-gray-700">
                      <tr>
                          <th className="p-5 pl-8">บาร์โค้ด / RMS</th>
                          <th className="p-5">สินค้า</th>
                          <th className="p-5">สถานะ</th>
                          <th className="p-5">ราคาขาย</th>
                          <th className="p-5">ผู้ตรวจ</th>
                          <th className="p-5 pr-8">วันที่</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {filteredLogs.map(log => (
                          <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors">
                              <td className="p-5 pl-8 font-mono text-[11px] text-gray-400">{log.barcode}</td>
                              <td className="p-5 font-bold text-sm dark:text-white">{log.productName}</td>
                              <td className="p-5">
                                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${log.status === QCStatus.PASS ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                      {log.status}
                                  </span>
                              </td>
                              <td className="p-5 font-black text-sm dark:text-gray-300">฿{log.sellingPrice.toLocaleString()}</td>
                              <td className="p-5 text-xs text-gray-500 font-bold">{log.inspectorId}</td>
                              <td className="p-5 pr-8 text-[10px] text-gray-400 font-bold">{new Date(log.timestamp).toLocaleDateString()}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
          {filteredLogs.length === 0 && (
              <div className="p-20 text-center flex flex-col items-center gap-4 text-gray-300">
                  <ClipboardList size={64} className="opacity-10" />
                  <p className="font-black text-xs uppercase tracking-widest">ไม่พบข้อมูลการตรวจสอบ</p>
              </div>
          )}
      </div>
    </div>
  );
};
