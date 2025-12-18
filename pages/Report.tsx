
import React, { useState, useEffect, useMemo } from 'react';
import { fetchQCLogs, exportQCLogs } from '../services/db';
import { QCRecord, QCStatus } from '../types';
import { Download, Filter, Search, Loader2, Calendar, FileText, CheckCircle2, AlertTriangle, User, RefreshCw, ClipboardList, ImageIcon, DollarSign, TrendingUp, AlertCircle, Tag, Layers } from 'lucide-react';

export const Report: React.FC = () => {
  const [logs, setLogs] = useState<QCRecord[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<QCRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<QCStatus | 'All'>('All');
  const [dateFilter, setDateFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [lotFilter, setLotFilter] = useState('All');

  useEffect(() => { loadData(); }, []);

  const loadData = async (force = false) => {
    setIsLoading(true);
    try {
        const data = await fetchQCLogs(force);
        setLogs(data);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  // Get unique options for filters
  const filterOptions = useMemo(() => {
    const types = new Set<string>();
    const lots = new Set<string>();
    logs.forEach(l => {
      if (l.productType) types.add(l.productType);
      if (l.lotNo) lots.add(l.lotNo);
    });
    return {
      types: Array.from(types).sort(),
      lots: Array.from(lots).sort()
    };
  }, [logs]);

  // Update summary stats based on filtered data for accurate local viewing
  const summaryStats = useMemo(() => {
    const passed = filteredLogs.filter(l => l.status === QCStatus.PASS);
    const damaged = filteredLogs.filter(l => l.status === QCStatus.DAMAGE);
    return {
        passCount: passed.length,
        passCost: passed.reduce((sum, l) => sum + (l.costPrice || 0), 0),
        passValue: passed.reduce((sum, l) => sum + (l.sellingPrice || 0), 0),
        damageCount: damaged.length,
        damageCost: damaged.reduce((sum, l) => sum + (l.costPrice || 0), 0),
        damageValue: damaged.reduce((sum, l) => sum + (l.sellingPrice || 0), 0),
    };
  }, [filteredLogs]);

  useEffect(() => {
    let result = logs;
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(l => 
        l.productName.toLowerCase().includes(lower) || 
        l.barcode.toLowerCase().includes(lower)
      );
    }
    if (statusFilter !== 'All') result = result.filter(l => l.status === statusFilter);
    if (dateFilter) result = result.filter(l => l.timestamp.startsWith(dateFilter));
    if (typeFilter !== 'All') result = result.filter(l => l.productType === typeFilter);
    if (lotFilter !== 'All') result = result.filter(l => l.lotNo === lotFilter);
    
    setFilteredLogs(result);
  }, [logs, search, statusFilter, dateFilter, typeFilter, lotFilter]);

  return (
    <div className="space-y-6 pb-24 animate-fade-in">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white">รายงานสรุปผล</h1>
          <p className="text-gray-500">ประวัติการตรวจสอบและการเงิน</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => loadData(true)} className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button 
                onClick={async () => { setIsExporting(true); await exportQCLogs(); setIsExporting(false); }}
                disabled={isExporting}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-pastel-greenDark text-white px-5 py-3 rounded-xl shadow-lg hover:scale-105 transition-transform disabled:opacity-50"
            >
                {isExporting ? <Loader2 className="animate-spin" /> : <Download size={20} />}
                <span className="font-bold">ส่งออก Excel</span>
            </button>
        </div>
      </header>

      {/* Financial Summary Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border-l-4 border-green-500 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">ผ่าน (Pass)</span>
                <CheckCircle2 className="text-green-500" size={20} />
            </div>
            <div className="text-2xl font-black text-gray-800 dark:text-white">{summaryStats.passCount} <span className="text-sm font-normal text-gray-400">รายการ</span></div>
            <div className="mt-2 text-xs text-green-600 flex justify-between font-bold">
                <span>ยอดขาย: ฿{summaryStats.passValue.toLocaleString()}</span>
                <span className="text-gray-400">ทุน: ฿{summaryStats.passCost.toLocaleString()}</span>
            </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border-l-4 border-red-500 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">ชำรุด (Damage)</span>
                <AlertTriangle className="text-red-500" size={20} />
            </div>
            <div className="text-2xl font-black text-gray-800 dark:text-white">{summaryStats.damageCount} <span className="text-sm font-normal text-gray-400">รายการ</span></div>
            <div className="mt-2 text-xs text-red-600 flex justify-between font-bold">
                <span>สูญเสีย: ฿{summaryStats.damageValue.toLocaleString()}</span>
                <span className="text-gray-400">ทุน: ฿{summaryStats.damageCost.toLocaleString()}</span>
            </div>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-2xl text-white shadow-xl shadow-blue-500/20">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-black text-blue-100 uppercase tracking-widest">รวมราคาขายที่ได้</span>
                <TrendingUp size={20} />
            </div>
            <div className="text-2xl font-black">฿{summaryStats.passValue.toLocaleString()}</div>
            <p className="text-[10px] text-blue-200 mt-1 font-bold uppercase tracking-tighter">Current Filter Value</p>
        </div>

        <div className="bg-gradient-to-br from-purple-600 to-pink-700 p-5 rounded-2xl text-white shadow-xl shadow-purple-500/20">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-black text-purple-100 uppercase tracking-widest">รวมต้นทุนที่ตรวจสอบ</span>
                <DollarSign size={20} />
            </div>
            <div className="text-2xl font-black">฿{(summaryStats.passCost + summaryStats.damageCost).toLocaleString()}</div>
            <p className="text-[10px] text-purple-200 mt-1 font-bold uppercase tracking-tighter">Total Checked Cost</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm flex flex-col gap-4 border border-gray-100 dark:border-gray-700">
        <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="ค้นหาบาร์โค้ด หรือชื่อสินค้า..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 rounded-2xl outline-none focus:ring-2 focus:ring-pastel-blueDark transition-all text-sm font-medium" 
            />
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <select 
                  value={statusFilter} 
                  onChange={e => setStatusFilter(e.target.value as any)} 
                  className="w-full pl-9 pr-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-xl outline-none text-xs font-bold appearance-none cursor-pointer"
                >
                    <option value="All">สถานะทั้งหมด</option>
                    <option value={QCStatus.PASS}>ผ่าน (PASS)</option>
                    <option value={QCStatus.DAMAGE}>ชำรุด (DAMAGE)</option>
                </select>
            </div>

            <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <select 
                  value={typeFilter} 
                  onChange={e => setTypeFilter(e.target.value)} 
                  className="w-full pl-9 pr-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-xl outline-none text-xs font-bold appearance-none cursor-pointer"
                >
                    <option value="All">ประเภทสินค้า (All)</option>
                    {filterOptions.types.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>

            <div className="relative">
                <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <select 
                  value={lotFilter} 
                  onChange={e => setLotFilter(e.target.value)} 
                  className="w-full pl-9 pr-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-xl outline-none text-xs font-bold appearance-none cursor-pointer"
                >
                    <option value="All">Lot Number (All)</option>
                    {filterOptions.lots.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
            </div>

            <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input 
                  type="date" 
                  value={dateFilter} 
                  onChange={e => setDateFilter(e.target.value)} 
                  className="w-full pl-9 pr-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-xl outline-none text-xs font-bold cursor-pointer" 
                />
            </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-sm overflow-hidden border border-gray-100 dark:border-gray-700">
          <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left text-sm table-fixed">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-400 uppercase font-black text-[10px] tracking-widest border-b border-gray-100 dark:border-gray-700">
                      <tr>
                          <th className="p-4 pl-8 w-40">RMS ID</th>
                          <th className="p-4 w-64">ชื่อสินค้า</th>
                          <th className="p-4 w-28">สถานะ</th>
                          <th className="p-4 w-28 text-center">ประเภท / Lot</th>
                          <th className="p-4 w-32">ราคา</th>
                          <th className="p-4 w-48">สาเหตุ / หมายเหตุ</th>
                          <th className="p-4 pr-8 w-28 text-right">ผู้ตรวจ</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {filteredLogs.map(log => (
                          <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                              <td className="p-4 pl-8 font-mono text-[11px] text-gray-500 dark:text-gray-400 truncate">{log.barcode}</td>
                              <td className="p-4">
                                  <p className="font-bold text-gray-800 dark:text-white truncate leading-tight">{log.productName}</p>
                                  <p className="text-[9px] text-gray-400 font-mono mt-0.5">{new Date(log.timestamp).toLocaleString()}</p>
                              </td>
                              <td className="p-4">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${log.status === QCStatus.PASS ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>
                                      {log.status}
                                  </span>
                              </td>
                              <td className="p-4 text-center">
                                  <p className="text-[10px] font-bold text-gray-600 dark:text-gray-300 truncate">{log.productType || '-'}</p>
                                  <p className="text-[9px] text-gray-400 uppercase truncate">Lot: {log.lotNo || '-'}</p>
                              </td>
                              <td className="p-4">
                                  <div className="flex flex-col">
                                    <span className="font-black text-gray-800 dark:text-white">฿{log.sellingPrice.toLocaleString()}</span>
                                    <span className="text-[9px] text-gray-400 line-through">฿{log.costPrice.toLocaleString()}</span>
                                  </div>
                              </td>
                              <td className="p-4">
                                  <p className="text-gray-400 italic text-[11px] leading-tight line-clamp-2">{log.reason || '-'}</p>
                                  {log.remark && <p className="text-[9px] text-blue-400 mt-1 truncate">{log.remark}</p>}
                              </td>
                              <td className="p-4 pr-8 text-right">
                                  <div className="flex flex-col items-end">
                                      <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">{log.inspectorId}</span>
                                      <div className="flex gap-1 mt-1">
                                          {log.imageUrls.length > 0 && <ImageIcon size={12} className="text-pastel-blueDark" />}
                                      </div>
                                  </div>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
          {filteredLogs.length === 0 && !isLoading && (
              <div className="p-20 text-center flex flex-col items-center gap-4 text-gray-300">
                  <ClipboardList size={64} className="opacity-10" />
                  <p className="font-bold text-sm uppercase tracking-widest">ไม่พบข้อมูลตามเงื่อนไขที่ระบุ</p>
                  <button onClick={() => { setSearch(''); setStatusFilter('All'); setDateFilter(''); setTypeFilter('All'); setLotFilter('All'); }} className="text-pastel-blueDark text-xs font-black underline underline-offset-4">RESET FILTERS</button>
              </div>
          )}
          {isLoading && (
              <div className="p-20 text-center flex flex-col items-center gap-4 text-gray-300">
                  <Loader2 size={32} className="animate-spin text-pastel-blueDark" />
                  <p className="font-bold text-xs uppercase tracking-widest">กำลังดึงข้อมูล...</p>
              </div>
          )}
      </div>
    </div>
  );
};
