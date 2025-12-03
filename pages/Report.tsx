import React, { useState, useEffect } from 'react';
import { getQCLogs, exportQCLogs } from '../services/db';
import { QCRecord, QCStatus } from '../types';
import { Download, Filter, Search, Loader2, Calendar, FileText, CheckCircle2, AlertTriangle, User, Tag } from 'lucide-react';

export const Report: React.FC = () => {
  const [logs, setLogs] = useState<QCRecord[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<QCRecord[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<QCStatus | 'All'>('All');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    const data = getQCLogs();
    setLogs(data);
  }, []);

  useEffect(() => {
    let result = logs;

    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(l => 
        l.productName.toLowerCase().includes(lower) || 
        l.barcode.includes(lower) ||
        l.inspectorId.toLowerCase().includes(lower)
      );
    }

    if (statusFilter !== 'All') {
      result = result.filter(l => l.status === statusFilter);
    }

    if (dateFilter) {
      result = result.filter(l => l.timestamp.startsWith(dateFilter));
    }

    setFilteredLogs(result);
  }, [logs, search, statusFilter, dateFilter]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
        await exportQCLogs();
    } catch (e) {
        console.error(e);
    } finally {
        setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-24 md:pb-0 animate-fade-in">
       <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <FileText className="text-pastel-purpleDark" />
            รายงาน (Reports)
          </h1>
          <p className="text-gray-500 dark:text-gray-400">ประวัติการตรวจสอบคุณภาพสินค้า</p>
        </div>
        
        <button 
           onClick={handleExport}
           disabled={isExporting}
           className={`flex items-center justify-center gap-2 bg-pastel-greenDark hover:bg-green-800 text-white px-5 py-3 rounded-xl transition-all shadow-md active:scale-95 ${isExporting ? 'opacity-70 cursor-wait' : ''}`}
        >
           {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
           <span className="font-medium">{isExporting ? 'กำลังส่งออก...' : 'ส่งออก Excel'}</span>
        </button>
      </header>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search */}
        <div className="relative">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
           <input 
             type="text" 
             placeholder="ค้นหา..." 
             value={search}
             onChange={(e) => setSearch(e.target.value)}
             className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-xl border-none focus:ring-2 focus:ring-pastel-blue dark:text-white transition-all placeholder-gray-400"
           />
        </div>

        {/* Status Filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-xl border-none focus:ring-2 focus:ring-pastel-blue dark:text-white appearance-none cursor-pointer transition-all text-gray-700"
          >
            <option value="All">สถานะทั้งหมด</option>
            <option value={QCStatus.PASS}>ผ่าน (Pass)</option>
            <option value={QCStatus.DAMAGE}>ชำรุด (Damage)</option>
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <div className="bg-gray-200 dark:bg-gray-600 rounded-full p-1">
               <svg className="w-3 h-3 text-gray-500 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>

        {/* Date Filter */}
        <div className="relative">
           <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
           <input 
             type="date"
             value={dateFilter}
             onChange={(e) => setDateFilter(e.target.value)}
             className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-xl border-none focus:ring-2 focus:ring-pastel-blue dark:text-white transition-all text-gray-700"
           />
        </div>
      </div>

      {/* List Container */}
      <div className="animate-slide-up">
        
        {/* Desktop Table */}
        <div className="hidden md:block bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider">
                <tr>
                  <th className="p-4 pl-6">วัน/เวลา</th>
                  <th className="p-4">สินค้า</th>
                  <th className="p-4">สถานะ</th>
                  <th className="p-4">ราคาขาย</th>
                  <th className="p-4">หมายเหตุ</th>
                  <th className="p-4 pr-6">ผู้ตรวจสอบ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="p-4 pl-6 text-sm text-gray-500 dark:text-gray-400">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{new Date(log.timestamp).toLocaleDateString('th-TH')}</span><br/>
                      <span className="text-xs opacity-70">{new Date(log.timestamp).toLocaleTimeString('th-TH')}</span>
                    </td>
                    <td className="p-4">
                      <p className="font-medium text-gray-800 dark:text-white">{log.productName}</p>
                      <p className="text-xs text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 inline-block px-1 rounded">{log.barcode}</p>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${log.status === 'Pass' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {log.status === 'Pass' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                        {log.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm">
                      <div className="flex flex-col">
                        <span className="text-gray-800 dark:text-white font-bold">฿{log.sellingPrice.toFixed(2)}</span>
                        <span className="text-xs text-gray-400 line-through">฿{log.costPrice.toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate">
                      {log.reason ? log.reason : <span className="text-gray-300 italic">-</span>}
                    </td>
                    <td className="p-4 pr-6 text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-pastel-blue text-pastel-blueDark flex items-center justify-center text-xs font-bold uppercase">
                              {log.inspectorId.substring(0,2)}
                          </div>
                          {log.inspectorId}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-gray-400">
                      <div className="flex flex-col items-center">
                          <Search size={32} className="mb-2 opacity-20" />
                          <p>ไม่พบข้อมูลตามเงื่อนไขที่กำหนด</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Card List View (Enhanced) */}
        <div className="md:hidden space-y-4">
           {filteredLogs.map(log => (
              <div 
                key={log.id} 
                className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex"
              >
                 {/* Status Strip Indicator */}
                 <div className={`w-2 flex-shrink-0 ${log.status === QCStatus.PASS ? 'bg-green-500' : 'bg-red-500'}`} />
                 
                 <div className="flex-1 p-4">
                    {/* Header: Date & Status */}
                    <div className="flex justify-between items-start mb-3">
                       <div>
                          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide mb-0.5">
                              {new Date(log.timestamp).toLocaleDateString('th-TH')} • {new Date(log.timestamp).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})}
                          </p>
                          <h3 className="font-bold text-gray-800 dark:text-white text-lg leading-tight">{log.productName}</h3>
                       </div>
                       <div className={`
                          flex items-center justify-center w-8 h-8 rounded-full shadow-sm
                          ${log.status === QCStatus.PASS ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}
                       `}>
                          {log.status === QCStatus.PASS ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                       </div>
                    </div>

                    {/* Meta Info Badge */}
                    <div className="flex items-center gap-2 mb-4">
                        <span className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded-md text-xs font-mono text-gray-500 dark:text-gray-400">
                            <Tag size={12} /> {log.barcode}
                        </span>
                        <span className="flex items-center gap-1 bg-pastel-blue/30 px-2 py-1 rounded-md text-xs font-medium text-pastel-blueDark dark:text-pastel-blue">
                            <User size={12} /> {log.inspectorId}
                        </span>
                    </div>

                    {/* Price and Reason Section */}
                    <div className="flex justify-between items-end pt-3 border-t border-gray-50 dark:border-gray-700/50 border-dashed">
                        <div>
                           <p className="text-xs text-gray-400 mb-0.5">ราคาขาย</p>
                           <p className="text-xl font-bold text-gray-800 dark:text-white">฿{log.sellingPrice.toLocaleString()}</p>
                        </div>
                        {log.reason && (
                           <div className="flex-1 ml-6 text-right">
                              <p className="text-xs text-gray-400 mb-0.5">หมายเหตุ</p>
                              <p className="text-sm text-gray-600 dark:text-gray-300 italic truncate max-w-[150px] ml-auto">"{log.reason}"</p>
                           </div>
                        )}
                    </div>
                 </div>
              </div>
           ))}
           
           {filteredLogs.length === 0 && (
             <div className="p-12 text-center text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                 <div className="bg-gray-50 dark:bg-gray-700 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText size={24} className="opacity-50" />
                 </div>
                 <h3 className="font-bold text-gray-600 dark:text-gray-300">ไม่พบข้อมูล</h3>
                 <p className="text-sm mt-1">ลองเปลี่ยนเงื่อนไขการค้นหา</p>
             </div>
           )}
        </div>

      </div>
    </div>
  );
};