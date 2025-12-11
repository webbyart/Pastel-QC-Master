
import React, { useState, useEffect } from 'react';
import { fetchQCLogs, exportQCLogs } from '../services/db';
import { QCRecord, QCStatus } from '../types';
import { Download, Filter, Search, Loader2, Calendar, FileText, CheckCircle2, AlertTriangle, User, Tag, ChevronDown, MessageSquare, RefreshCw, ClipboardList } from 'lucide-react';

export const Report: React.FC = () => {
  const [logs, setLogs] = useState<QCRecord[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<QCRecord[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<QCStatus | 'All'>('All');
  const [dateFilter, setDateFilter] = useState('');
  const [inspectorFilter, setInspectorFilter] = useState('All');
  const [commentFilter, setCommentFilter] = useState('All');

  // Derived Data
  const inspectors = Array.from(new Set(logs.map(l => l.inspectorId)));
  // Extract unique comments (reasons), filter out empty ones
  const comments = Array.from(new Set(logs.map(l => l.reason).filter(r => r && r.trim() !== ''))).sort();

  useEffect(() => {
    loadData(false);
  }, []);

  const loadData = async (forceUpdate = false) => {
      // 1. Load from cache first
      if (!forceUpdate) {
        try {
            const cached = await fetchQCLogs(false);
            setLogs(cached);
            setIsLoading(false);
        } catch (e) {
            console.warn("Cache load error in Report", e);
        }
      } else {
        setIsLoading(true);
      }

      // 2. Fetch fresh
      try {
          const fresh = await fetchQCLogs(true, true); // Force refresh with skipThrottle
          setLogs(fresh);
      } catch(e) {
          console.error("Fetch fresh logs error:", e);
          // Do nothing in UI if fresh fetch fails, keep showing cache
      } finally {
          setIsLoading(false);
      }
  };

  useEffect(() => {
    let result = logs;

    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(l => 
        l.productName.toLowerCase().includes(lower) || 
        l.barcode.includes(lower) ||
        l.inspectorId.toLowerCase().includes(lower) ||
        (l.rmsId && l.rmsId.toLowerCase().includes(lower))
      );
    }

    if (statusFilter !== 'All') {
      result = result.filter(l => l.status === statusFilter);
    }

    if (inspectorFilter !== 'All') {
      result = result.filter(l => l.inspectorId === inspectorFilter);
    }

    if (commentFilter !== 'All') {
      result = result.filter(l => l.reason === commentFilter);
    }

    if (dateFilter) {
      result = result.filter(l => l.timestamp.startsWith(dateFilter));
    }

    setFilteredLogs(result);
  }, [logs, search, statusFilter, dateFilter, inspectorFilter, commentFilter]);

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    
    // Simulate Progress
    const interval = setInterval(() => {
        setExportProgress(prev => {
            if (prev >= 95) return prev;
            return prev + 5;
        });
    }, 50);

    try {
        await exportQCLogs();
        clearInterval(interval);
        setExportProgress(100);
        setTimeout(() => {
            setIsExporting(false);
            setExportProgress(0);
        }, 500);
    } catch (e) {
        clearInterval(interval);
        setIsExporting(false);
        console.error(e);
        alert('การส่งออกข้อมูลล้มเหลว ลองใหม่อีกครั้ง');
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
        
        <div className="flex gap-2">
            <button 
                onClick={() => loadData(true)}
                className="flex items-center justify-center p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors shadow-sm text-gray-600 dark:text-gray-300"
            >
                <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button 
            onClick={handleExport}
            disabled={isExporting || isLoading}
            className={`relative overflow-hidden flex items-center justify-center gap-2 bg-pastel-greenDark hover:bg-green-800 text-white px-5 py-3 rounded-xl transition-all shadow-md active:scale-95 ${isExporting || isLoading ? 'cursor-not-allowed opacity-70' : ''}`}
            >
            {isExporting && (
                <div className="absolute inset-0 bg-green-700/50">
                    <div 
                        className="h-full bg-green-600 transition-all duration-100 ease-linear" 
                        style={{ width: `${exportProgress}%` }} 
                    />
                </div>
            )}
            <div className="relative z-10 flex items-center gap-2">
                {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                <span className="font-medium">{isExporting ? `กำลังส่งออก ${exportProgress}%` : 'ส่งออก Excel'}</span>
            </div>
            </button>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Search */}
        <div className="relative md:col-span-1">
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
            className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-xl border-none focus:ring-2 focus:ring-pastel-blue dark:text-white appearance-none cursor-pointer transition-all text-gray-700 truncate"
          >
            <option value="All">สถานะทั้งหมด</option>
            <option value={QCStatus.PASS}>ผ่าน (Pass)</option>
            <option value={QCStatus.DAMAGE}>ชำรุด (Damage)</option>
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <ChevronDown size={14} className="text-gray-500" />
          </div>
        </div>

        {/* Comment Filter */}
        <div className="relative">
          <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <select 
            value={commentFilter}
            onChange={(e) => setCommentFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-xl border-none focus:ring-2 focus:ring-pastel-blue dark:text-white appearance-none cursor-pointer transition-all text-gray-700 truncate"
          >
            <option value="All">Comment ทั้งหมด</option>
            {comments.map(c => (
                <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <ChevronDown size={14} className="text-gray-500" />
          </div>
        </div>

        {/* Inspector Filter */}
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <select 
            value={inspectorFilter}
            onChange={(e) => setInspectorFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-xl border-none focus:ring-2 focus:ring-pastel-blue dark:text-white appearance-none cursor-pointer transition-all text-gray-700 truncate"
          >
            <option value="All">ผู้ตรวจสอบทั้งหมด</option>
            {inspectors.map(name => (
                <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <ChevronDown size={14} className="text-gray-500" />
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
        {isLoading && logs.length === 0 ? (
            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-pastel-blueDark" size={32} /></div>
        ) : (
        <>
        {/* Desktop Table */}
        <div className="hidden md:block bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider">
                <tr>
                  <th className="p-4 pl-6">Lot no.</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">RMS ID</th>
                  <th className="p-4">Product Name</th>
                  <th className="p-4">Unit Price</th>
                  <th className="p-4">ต้นทุน</th>
                  <th className="p-4">ราคาขาย</th>
                  <th className="p-4">Comment</th>
                  <th className="p-4">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="p-4 pl-6 text-sm text-gray-600 dark:text-gray-300">{log.lotNo || '-'}</td>
                    <td className="p-4 text-sm text-gray-600 dark:text-gray-300">{log.productType || '-'}</td>
                    <td className="p-4 text-sm text-gray-600 dark:text-gray-300">{log.rmsId || '-'}</td>
                    <td className="p-4">
                      <p className="font-medium text-gray-800 dark:text-white">{log.productName}</p>
                      <p className="text-xs text-gray-400 font-mono">{log.barcode}</p>
                    </td>
                    <td className="p-4 text-sm text-gray-600 dark:text-gray-300">฿{(log.unitPrice || 0).toLocaleString()}</td>
                    <td className="p-4 text-sm text-gray-600 dark:text-gray-300">฿{log.costPrice.toFixed(2)}</td>
                    <td className="p-4 text-sm font-bold text-gray-800 dark:text-white">฿{log.sellingPrice.toFixed(2)}</td>
                    <td className="p-4 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate">{log.reason || '-'}</td>
                    <td className="p-4 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate">{log.remark || '-'}</td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-gray-400">
                      <div className="flex flex-col items-center">
                          <ClipboardList size={32} className="mb-2 opacity-20" />
                          <p>{logs.length === 0 ? 'ยังไม่มีรายการตรวจสอบ' : 'ไม่พบข้อมูลตามเงื่อนไขที่กำหนด'}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Card List View */}
        <div className="md:hidden space-y-4">
           {filteredLogs.map(log => (
              <div 
                key={log.id} 
                className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex"
              >
                 {/* Status Strip Indicator */}
                 <div className={`w-2 flex-shrink-0 ${log.status === QCStatus.PASS ? 'bg-green-500' : 'bg-red-500'}`} />
                 
                 <div className="flex-1 p-4">
                    {/* Header: RMS & Status */}
                    <div className="flex justify-between items-start mb-3">
                       <div>
                          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide mb-0.5">
                              RMS: {log.rmsId || 'N/A'} • Lot: {log.lotNo || 'N/A'}
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
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        <span className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded-md text-xs font-mono text-gray-500 dark:text-gray-400">
                            <Tag size={12} /> {log.barcode}
                        </span>
                        {log.productType && (
                             <span className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded-md text-xs text-gray-500 dark:text-gray-400">
                                Type: {log.productType}
                             </span>
                        )}
                    </div>

                    {/* Price and Reason Section */}
                    <div className="flex justify-between items-end pt-3 border-t border-gray-50 dark:border-gray-700/50 border-dashed">
                        <div>
                           <p className="text-xs text-gray-400 mb-0.5">ราคาขาย</p>
                           <p className="text-xl font-bold text-gray-800 dark:text-white">฿{log.sellingPrice.toLocaleString()}</p>
                        </div>
                        <div className="flex-1 ml-6 text-right">
                           {log.reason && <p className="text-xs text-gray-600 dark:text-gray-300 italic truncate max-w-[150px] ml-auto">"{log.reason}"</p>}
                           {log.remark && <p className="text-xs text-gray-400 truncate max-w-[150px] ml-auto">Remark: {log.remark}</p>}
                        </div>
                    </div>
                 </div>
              </div>
           ))}
           
           {filteredLogs.length === 0 && (
             <div className="p-12 text-center text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                 <div className="bg-gray-50 dark:bg-gray-700 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <ClipboardList size={24} className="opacity-50" />
                 </div>
                 <h3 className="font-bold text-gray-600 dark:text-gray-300">
                     {logs.length === 0 ? 'ยังไม่มีรายการตรวจสอบ' : 'ไม่พบข้อมูล'}
                 </h3>
                 <p className="text-sm mt-1">
                     {logs.length === 0 ? 'เริ่มสแกนสินค้าเพื่อบันทึกข้อมูล' : 'ลองเปลี่ยนเงื่อนไขการค้นหา หรือกดปุ่มรีเฟรช'}
                 </p>
             </div>
           )}
        </div>
        </>
        )}
      </div>
    </div>
  );
};
