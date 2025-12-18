
import React, { useState, useEffect, useMemo } from 'react';
import { fetchQCLogs, exportQCLogs } from '../services/db';
import { QCRecord, QCStatus } from '../types';
import { Download, Filter, Search, Loader2, Calendar, FileText, CheckCircle2, AlertTriangle, User, RefreshCw, ClipboardList, ImageIcon, DollarSign, TrendingUp, AlertCircle } from 'lucide-react';

export const Report: React.FC = () => {
  const [logs, setLogs] = useState<QCRecord[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<QCRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<QCStatus | 'All'>('All');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async (force = false) => {
    setIsLoading(true);
    try {
        const data = await fetchQCLogs(force);
        setLogs(data);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const summaryStats = useMemo(() => {
    const passed = logs.filter(l => l.status === QCStatus.PASS);
    const damaged = logs.filter(l => l.status === QCStatus.DAMAGE);
    return {
        passCount: passed.length,
        passCost: passed.reduce((sum, l) => sum + l.costPrice, 0),
        passValue: passed.reduce((sum, l) => sum + l.sellingPrice, 0),
        damageCount: damaged.length,
        damageCost: damaged.reduce((sum, l) => sum + l.costPrice, 0),
        damageValue: damaged.reduce((sum, l) => sum + l.sellingPrice, 0),
    };
  }, [logs]);

  useEffect(() => {
    let result = logs;
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(l => l.productName.toLowerCase().includes(lower) || l.barcode.includes(lower));
    }
    if (statusFilter !== 'All') result = result.filter(l => l.status === statusFilter);
    if (dateFilter) result = result.filter(l => l.timestamp.startsWith(dateFilter));
    setFilteredLogs(result);
  }, [logs, search, statusFilter, dateFilter]);

  return (
    <div className="space-y-6 pb-24 animate-fade-in">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white">รายงานสรุปผล</h1>
          <p className="text-gray-500">ประวัติการตรวจสอบและการเงิน</p>
        </div>
        <div className="flex gap-2">
            <button onClick={() => loadData(true)} className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm"><RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} /></button>
            <button 
                onClick={async () => { setIsExporting(true); await exportQCLogs(); setIsExporting(false); }}
                disabled={isExporting}
                className="flex items-center gap-2 bg-pastel-greenDark text-white px-5 py-3 rounded-xl shadow-lg hover:scale-105 transition-transform"
            >
                {isExporting ? <Loader2 className="animate-spin" /> : <Download size={20} />}
                <span>ส่งออก Excel</span>
            </button>
        </div>
      </header>

      {/* Financial Summary Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border-l-4 border-green-500 shadow-sm">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase">ผ่าน (Pass)</span>
                <CheckCircle2 className="text-green-500" size={20} />
            </div>
            <div className="text-2xl font-bold text-gray-800 dark:text-white">{summaryStats.passCount} <span className="text-sm font-normal text-gray-400">รายการ</span></div>
            <div className="mt-2 text-xs text-green-600 flex justify-between">
                <span>ยอดขาย: ฿{summaryStats.passValue.toLocaleString()}</span>
                <span className="text-gray-400">ทุน: ฿{summaryStats.passCost.toLocaleString()}</span>
            </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border-l-4 border-red-500 shadow-sm">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase">ชำรุด (Damage)</span>
                <AlertTriangle className="text-red-500" size={20} />
            </div>
            <div className="text-2xl font-bold text-gray-800 dark:text-white">{summaryStats.damageCount} <span className="text-sm font-normal text-gray-400">รายการ</span></div>
            <div className="mt-2 text-xs text-red-600 flex justify-between">
                <span>สูญเสียยอดขาย: ฿{summaryStats.damageValue.toLocaleString()}</span>
                <span className="text-gray-400">จมทุน: ฿{summaryStats.damageCost.toLocaleString()}</span>
            </div>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-2xl text-white shadow-xl shadow-blue-500/20">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-blue-100 uppercase">รวมราคาขายที่ได้</span>
                <TrendingUp size={20} />
            </div>
            <div className="text-2xl font-bold">฿{summaryStats.passValue.toLocaleString()}</div>
            <p className="text-[10px] text-blue-200 mt-1">Net Recovery Value</p>
        </div>

        <div className="bg-gradient-to-br from-purple-600 to-pink-700 p-5 rounded-2xl text-white shadow-xl shadow-purple-500/20">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-purple-100 uppercase">รวมต้นทุนทั้งหมด</span>
                <DollarSign size={20} />
            </div>
            <div className="text-2xl font-bold">฿{(summaryStats.passCost + summaryStats.damageCost).toLocaleString()}</div>
            <p className="text-[10px] text-purple-200 mt-1">Total Inventory Cost</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm flex flex-wrap gap-4 items-center border border-gray-100 dark:border-gray-700">
        <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" placeholder="ค้นหาบาร์โค้ด หรือชื่อสินค้า..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="bg-gray-50 dark:bg-gray-700 px-4 py-2.5 rounded-xl outline-none text-sm">
            <option value="All">สถานะทั้งหมด</option>
            <option value={QCStatus.PASS}>ผ่าน</option>
            <option value={QCStatus.DAMAGE}>ชำรุด</option>
        </select>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="bg-gray-50 dark:bg-gray-700 px-4 py-2.5 rounded-xl outline-none text-sm" />
      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm overflow-hidden border border-gray-100 dark:border-gray-700">
          <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400 uppercase font-bold text-[10px] tracking-wider">
                      <tr>
                          <th className="p-4 pl-6">RMS ID</th>
                          <th className="p-4">ชื่อสินค้า</th>
                          <th className="p-4">สถานะ</th>
                          <th className="p-4">ต้นทุน</th>
                          <th className="p-4">ราคาขาย</th>
                          <th className="p-4">Comment</th>
                          <th className="p-4 pr-6">ผู้ตรวจ</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {filteredLogs.map(log => (
                          <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                              <td className="p-4 pl-6 font-mono text-gray-500">{log.barcode}</td>
                              <td className="p-4 font-bold text-gray-800 dark:text-white">{log.productName}</td>
                              <td className="p-4">
                                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${log.status === QCStatus.PASS ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                      {log.status.toUpperCase()}
                                  </span>
                              </td>
                              <td className="p-4 text-gray-500">฿{log.costPrice.toLocaleString()}</td>
                              <td className="p-4 font-bold text-gray-800 dark:text-white">฿{log.sellingPrice.toLocaleString()}</td>
                              <td className="p-4 text-gray-400 italic text-xs max-w-xs truncate">{log.reason || '-'}</td>
                              <td className="p-4 pr-6 text-gray-500">{log.inspectorId}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
          {filteredLogs.length === 0 && (
              <div className="p-20 text-center flex flex-col items-center gap-4 text-gray-300">
                  <ClipboardList size={64} className="opacity-10" />
                  <p>ไม่พบข้อมูลตามเงื่อนไข</p>
              </div>
          )}
      </div>
    </div>
  );
};
