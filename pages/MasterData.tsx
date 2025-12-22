
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fetchMasterData, importMasterData, deleteProduct, saveProduct, bulkSaveProducts, clearAllCloudData, exportMasterData, fetchCloudStats, dbGet } from '../services/db';
import { ProductMaster } from '../types';
import { Trash2, Search, Plus, Edit2, Loader2, Box, FileDown, CloudUpload, FileSpreadsheet, AlertTriangle, RefreshCw, Zap, Database, Server, AlertCircle, X, ClipboardCheck, LayoutGrid } from 'lucide-react';

export const MasterData: React.FC = () => {
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cloudStats, setCloudStats] = useState({ remaining: 0, checked: 0, total: 0 });
  
  const isMounted = useRef(false);
  const isFetching = useRef(false);
  
  // Progress States
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [processLabel, setProcessLabel] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<ProductMaster>>({});

  const loadSessionData = useCallback(async (forceUpdate = false) => {
    if (isFetching.current) return;
    
    isFetching.current = true;
    if (products.length === 0 || forceUpdate) setIsLoading(true);
    
    try {
        const stats = await fetchCloudStats();
        setCloudStats(stats);
        
        const data = await fetchMasterData(forceUpdate);
        if (data) {
            setProducts(data);
        }
    } catch (e) {
        console.warn("Load Cloud failed", e);
    } finally { 
        setIsLoading(false);
        isFetching.current = false;
    }
  }, [products.length]);

  useEffect(() => { 
    if (!isMounted.current) {
        const init = async () => {
            try {
                const cached = await dbGet('qc_cache_master');
                if (cached && cached.length > 0) {
                    setProducts(cached);
                }
            } catch (e) {}
            loadSessionData(false); 
        };
        init();
        isMounted.current = true;
    }
  }, [loadSessionData]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsProcessing(true);
      setProcessLabel('กำลังอ่านข้อมูล Excel...');
      setProgressPct(10);
      try {
        const newProducts = await importMasterData(file);
        
        if (newProducts.length === 0) {
            alert('❌ ไม่พบข้อมูลที่ถูกต้องในไฟล์!\n\nกรุณาตรวจสอบว่าหัวตารางมีช่องชื่อ:\n- บาร์โค้ด (หรือ barcode)\n- ชื่อสินค้า (หรือ productName)');
            setIsProcessing(false);
            return;
        }

        setProgressPct(30);
        setProcessLabel(`พบ ${newProducts.length.toLocaleString()} รายการ กำลังอัปโหลด...`);
        
        await bulkSaveProducts(newProducts, (pct) => {
            setProgressPct(30 + Math.floor(pct * 0.7));
        });

        await loadSessionData(true);
        setIsProcessing(false);
        alert(`✅ นำเข้าสำเร็จ ${newProducts.length} รายการ เรียบร้อยแล้ว!`);
      } catch (err: any) { 
        alert('เกิดข้อผิดพลาดในการนำเข้า: ' + (err.message || 'รูปแบบไฟล์ไม่ถูกต้อง')); 
        setIsProcessing(false);
      } finally { 
        e.target.value = ''; 
      }
    }
  };

  const handleSyncToCloud = async () => {
      if (products.length === 0) return;
      setIsProcessing(true);
      setProcessLabel('กำลังซิงค์ข้อมูลกับ Cloud...');
      try {
          await bulkSaveProducts(products);
          await loadSessionData(true);
          setIsProcessing(false);
          alert('✅ ซิงค์ข้อมูลสำเร็จ!');
      } catch (e: any) { 
          alert(`ไม่สามารถบันทึกได้: ${e.message}`); 
          setIsProcessing(false);
      }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct.barcode || !editingProduct.productName) return;
    setIsLoading(true);
    try {
        await saveProduct(editingProduct as ProductMaster);
        await loadSessionData(true);
        setShowModal(false);
    } catch (e: any) {
        alert("บันทึกไม่สำเร็จ: " + e.message);
    } finally {
        setIsLoading(false);
    }
  };

  const filtered = products.filter(p => 
    (p.productName || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.barcode || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-24 animate-fade-in relative min-h-screen">
      
      {isProcessing && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-xl">
              <div className="bg-white dark:bg-gray-800 rounded-[3rem] p-10 w-full max-w-sm shadow-2xl flex flex-col items-center gap-8 animate-slide-up text-center">
                  <div className="w-20 h-20 rounded-full border-4 border-pastel-blueDark border-t-transparent animate-spin flex items-center justify-center">
                    <span className="text-xs font-black text-pastel-blueDark">{progressPct}%</span>
                  </div>
                  <div className="space-y-1">
                      <h3 className="text-sm font-bold text-gray-800 dark:text-white uppercase tracking-tight">{processLabel}</h3>
                  </div>
              </div>
          </div>
      )}

      {/* Stats Section with Updated Labels and Large Counts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-5">
            <div className="p-4 bg-pastel-blue/50 rounded-2xl text-pastel-blueDark">
                <Database size={24} />
            </div>
            <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Total Inventory</p>
                <p className="text-2xl font-black text-gray-800 dark:text-white">{cloudStats.total.toLocaleString()}</p>
            </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-5">
            <div className="p-4 bg-pastel-green/50 rounded-2xl text-pastel-greenDark">
                <LayoutGrid size={24} />
            </div>
            <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">System Inventory</p>
                <p className="text-2xl font-black text-gray-800 dark:text-white">{products.length.toLocaleString()}</p>
            </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-5">
            <div className="p-4 bg-pastel-purple/50 rounded-2xl text-pastel-purpleDark">
                <ClipboardCheck size={24} />
            </div>
            <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Checked</p>
                <p className="text-2xl font-black text-gray-800 dark:text-white">{cloudStats.checked.toLocaleString()}</p>
            </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
        <div className="flex justify-between items-center">
            <h1 className="text-2xl font-display font-bold text-gray-800 dark:text-white flex items-center gap-3">
                <Box className="text-pastel-blueDark" size={28} />
                คลังสินค้า
            </h1>
            <div className="flex gap-2">
              <button onClick={() => loadSessionData(true)} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-gray-400 hover:text-pastel-blueDark transition-all active:scale-90">
                <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => { setIsEditMode(false); setEditingProduct({}); setShowModal(true); }} className="bg-pastel-blueDark text-white p-3 rounded-xl shadow-lg active:scale-90 transition-transform">
                <Plus size={20}/>
              </button>
            </div>
        </div>

        <div className="flex flex-wrap gap-3">
            <label className="flex-1 min-w-[140px] bg-white border border-gray-100 dark:bg-gray-900 dark:border-gray-700 p-4 rounded-2xl flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest text-green-600 cursor-pointer active:scale-95 transition-all shadow-sm">
                <FileSpreadsheet size={18} /> นำเข้า Excel
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
            </label>
            <button onClick={handleSyncToCloud} className="flex-1 min-w-[140px] bg-pastel-blueDark text-white p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-3 active:scale-95 transition-all">
                <CloudUpload size={18} /> ซิงค์คลาวด์
            </button>
        </div>

        <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
            <input 
              type="text" placeholder="ค้นหาชื่อ หรือ บาร์โค้ด..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-12 pr-4 py-5 bg-gray-50 dark:bg-gray-900 border-none rounded-2xl text-sm font-medium shadow-inner dark:text-white focus:ring-4 focus:ring-pastel-blueDark/10 transition-all" 
            />
        </div>
      </div>

      {isLoading && products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-4">
              <Loader2 size={40} className="animate-spin text-pastel-blueDark" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">กำลังดึงข้อมูล...</p>
          </div>
      ) : products.length === 0 ? (
        <div className="p-24 text-center flex flex-col items-center gap-6 text-gray-300 bg-white dark:bg-gray-800 rounded-[3rem] border border-gray-100 dark:border-gray-700 shadow-sm animate-fade-in">
            <AlertCircle size={64} className="opacity-10" />
            <div className="space-y-1">
                <p className="text-xs font-black uppercase tracking-widest">ยังไม่มีข้อมูลในคลังสินค้า</p>
                <p className="text-[10px]">กรุณานำเข้าจากไฟล์ Excel หรือกดปุ่มบวกเพื่อเพิ่มสินค้า</p>
            </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-[3rem] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left table-fixed">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-400 text-[9px] uppercase font-black tracking-widest border-b border-gray-100 dark:border-gray-700">
                        <tr>
                            <th className="p-5 pl-8 w-40">บาร์โค้ด</th>
                            <th className="p-5">ชื่อสินค้า</th>
                            <th className="p-5 w-24 text-center">ราคาขาย</th>
                            <th className="p-5 pr-8 w-16 text-right">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                        {filtered.map(product => ( 
                            <tr key={product.barcode} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 active:bg-gray-100 transition-colors">
                                <td className="p-5 pl-8">
                                    <span className="font-mono text-[10px] text-gray-400 bg-gray-50 dark:bg-gray-900 px-2 py-1 rounded">
                                        {product.barcode}
                                    </span>
                                </td>
                                <td className="p-5">
                                    <p className="text-[12px] font-bold text-gray-800 dark:text-white truncate" title={product.productName}>{product.productName}</p>
                                </td>
                                <td className="p-5 text-center">
                                    <span className="text-[12px] text-pastel-blueDark dark:text-blue-400 font-black">฿{product.unitPrice?.toLocaleString()}</span>
                                </td>
                                <td className="p-5 pr-8 text-right">
                                    <button onClick={() => { setIsEditMode(true); setEditingProduct(product); setShowModal(true); }} className="text-gray-300 hover:text-pastel-blueDark transition-colors p-2"><Edit2 size={16}/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {filtered.length > 0 && (
                <div className="p-6 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest border-t border-gray-50 dark:border-gray-700">
                    แสดงข้อมูล {filtered.length.toLocaleString()} รายการ
                </div>
            )}
        </div>
      )}

      {/* Modal Edit/Add */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-6 animate-fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowModal(false)} />
            <div className="bg-white dark:bg-gray-800 rounded-t-[3.5rem] md:rounded-[3.5rem] w-full max-w-lg shadow-2xl relative animate-slide-up overflow-hidden">
                <div className="p-10 pb-16 md:pb-10 space-y-8">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold flex items-center gap-3 dark:text-white">
                            {isEditMode ? <Edit2 size={24} className="text-pastel-blueDark" /> : <Plus size={24} className="text-pastel-blueDark" />}
                            {isEditMode ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
                        </h2>
                        <button onClick={() => setShowModal(false)} className="p-2 bg-gray-100 dark:bg-gray-900 rounded-full dark:text-white"><X size={20}/></button>
                    </div>

                    <form onSubmit={handleSaveProduct} className="space-y-6">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-gray-400 ml-2">บาร์โค้ดสินค้า (Barcode)</label>
                            <input type="text" required disabled={isEditMode} value={editingProduct.barcode || ''} onChange={e => setEditingProduct({...editingProduct, barcode: e.target.value})} className="w-full p-5 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm font-mono focus:ring-4 focus:ring-pastel-blueDark/10 dark:text-white" placeholder="สแกน หรือ พิมพ์รหัส..." />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-gray-400 ml-2">ชื่อสินค้า (Product Name)</label>
                            <textarea required rows={2} value={editingProduct.productName || ''} onChange={e => setEditingProduct({...editingProduct, productName: e.target.value})} className="w-full p-5 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm font-medium resize-none focus:ring-4 focus:ring-pastel-blueDark/10 dark:text-white" placeholder="ระบุชื่อสินค้า..." />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-gray-400 ml-2">ราคาขาย (฿)</label>
                                <input type="number" step="0.01" value={editingProduct.unitPrice || ''} onChange={e => setEditingProduct({...editingProduct, unitPrice: Number(e.target.value)})} className="w-full p-5 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-lg font-black dark:text-white" placeholder="0.00" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-gray-400 ml-2">ต้นทุน (฿)</label>
                                <input type="number" step="0.01" value={editingProduct.costPrice || ''} onChange={e => setEditingProduct({...editingProduct, costPrice: Number(e.target.value)})} className="w-full p-5 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-lg font-black dark:text-white" placeholder="0.00" />
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-gradient-to-r from-pastel-blueDark to-blue-600 text-white font-black py-6 rounded-3xl shadow-xl shadow-blue-500/20 active:scale-95 transition-all text-sm mt-4">
                            บันทึกข้อมูลสินค้า
                        </button>
                    </form>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
