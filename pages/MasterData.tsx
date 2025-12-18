
import React, { useState, useEffect } from 'react';
import { fetchMasterData, importMasterData, deleteProduct, saveProduct, bulkSaveProducts, clearAllCloudData, exportMasterData, fetchCloudStats, dbGet } from '../services/db';
import { ProductMaster } from '../types';
import { Trash2, Search, Plus, Edit2, Loader2, Box, FileDown, CloudUpload, FileSpreadsheet, AlertTriangle, RefreshCw, Zap, Database, Server, AlertCircle } from 'lucide-react';

export const MasterData: React.FC = () => {
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cloudStats, setCloudStats] = useState({ remaining: 0, checked: 0, total: 0 });
  
  // Progress States
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [processLabel, setProcessLabel] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<ProductMaster>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Initial Load from Cache immediately
  useEffect(() => { 
    const init = async () => {
        // ขั้นแรก: ดึงข้อมูลจาก IndexedDB มาแสดงทันที ไม่ต้องรอ Cloud
        try {
            const cached = await dbGet('qc_cache_master');
            if (cached && cached.length > 0) {
                setProducts(cached);
            }
        } catch (e) { console.warn("Cache load failed", e); }

        // ขั้นต่อมา: โหลด Stats และอัปเดตข้อมูลจาก Cloud ในเบื้องหลัง
        loadSessionData(false); 
    };
    init();
  }, []);

  const loadSessionData = async (forceUpdate = false) => {
    // ถ้ามีข้อมูลในหน้าจอแล้วและไม่ใช่การกด Refresh บังคับ ไม่ต้องเปิด Spinner ใหญ่
    if (products.length === 0 || forceUpdate) setIsLoading(true);
    
    try {
        // แยกการโหลดเพื่อให้ Stats มาก่อนได้
        fetchCloudStats().then(stats => setCloudStats(stats));
        
        const data = await fetchMasterData(forceUpdate);
        if (data && data.length > 0) {
            setProducts(data);
        }
    } catch (e) {
        console.warn("Load Cloud failed", e);
    } finally { 
        setIsLoading(false); 
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsProcessing(true);
      setProcessLabel('กำลังอ่านข้อมูล Excel...');
      setProgressPct(10);
      try {
        const newProducts = await importMasterData(e.target.files[0]);
        setProgressPct(30);
        setProcessLabel(`กำลังอัปโหลด ${newProducts.length.toLocaleString()} รายการ...`);
        
        await bulkSaveProducts(newProducts, (pct) => {
            setProgressPct(30 + Math.floor(pct * 0.7));
        });

        await loadSessionData(true);
        setIsProcessing(false);
        alert(`✅ นำเข้าสำเร็จ!`);
      } catch (err: any) { 
        alert('เกิดข้อผิดพลาด: ' + err.message); 
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

  const handleClearData = async () => {
    if (confirm("⚠️ ต้องการล้างข้อมูลทั้งหมด?")) {
        setIsProcessing(true);
        setProcessLabel('กำลังล้างข้อมูล...');
        try {
            await clearAllCloudData();
            setProducts([]);
            setCloudStats({ remaining: 0, checked: 0, total: 0 });
            setIsProcessing(false);
            alert("ล้างข้อมูลเรียบร้อย");
        } catch (e: any) {
            alert("ล้มเหลว: " + e.message);
            setIsProcessing(false);
        }
    }
  };

  const handleDelete = async (id: string) => {
      setIsLoading(true);
      try {
          await deleteProduct(id);
          await loadSessionData(true);
          setDeleteId(null);
      } catch (e: any) {
          alert("ลบไม่สำเร็จ: " + e.message);
      } finally {
          setIsLoading(false);
      }
  };

  const filtered = products.filter(p => 
    p.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.barcode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-24 animate-fade-in relative min-h-screen">
      
      {/* Loading Progress Overlay */}
      {isProcessing && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-xl">
              <div className="bg-white dark:bg-gray-800 rounded-[3rem] p-10 w-full max-w-sm shadow-2xl flex flex-col items-center gap-8 animate-slide-up text-center">
                  <div className="w-24 h-24 rounded-full border-4 border-pastel-blueDark border-t-transparent animate-spin flex items-center justify-center">
                    <span className="text-sm font-black text-pastel-blueDark">{progressPct}%</span>
                  </div>
                  <div className="space-y-2">
                      <h3 className="text-lg font-bold text-gray-800 dark:text-white">{processLabel}</h3>
                  </div>
              </div>
          </div>
      )}

      {/* Cloud Inventory Stats Header */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-5">
            <div className="p-4 bg-pastel-blue/50 dark:bg-gray-700 rounded-3xl text-pastel-blueDark">
                <Database size={24} />
            </div>
            <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">คลังสินค้า (Cloud)</p>
                <p className="text-2xl font-black text-gray-800 dark:text-white">{cloudStats.total.toLocaleString()}</p>
            </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-5">
            <div className="p-4 bg-pastel-purple/50 dark:bg-gray-700 rounded-3xl text-pastel-purpleDark">
                <Server size={24} />
            </div>
            <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">ตรวจแล้ว (QC)</p>
                <p className="text-2xl font-black text-gray-800 dark:text-white">{cloudStats.checked.toLocaleString()}</p>
            </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
        <div className="flex justify-between items-center">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-display font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Box className="text-pastel-blueDark" size={24} />
                    คลังสินค้าหลัก
                </h1>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Local Cache Enabled</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => loadSessionData(true)} className="bg-gray-100 dark:bg-gray-700 p-3 rounded-2xl text-gray-500 hover:text-pastel-blueDark active:bg-gray-200 transition-all">
                <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
              </button>
              <button onClick={handleClearData} className="bg-red-50 dark:bg-red-900/20 p-3 rounded-2xl text-red-500">
                <Trash2 size={20}/>
              </button>
              <button onClick={() => { setIsEditMode(false); setEditingProduct({}); setShowModal(true); }} className="bg-pastel-blueDark text-white p-3 rounded-2xl shadow-lg">
                <Plus size={24}/>
              </button>
            </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 dark:bg-gray-900/50 rounded-2xl">
            <label className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-green-200 text-green-700 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tight cursor-pointer shadow-sm active:scale-95 transition-all">
                <FileSpreadsheet size={14} />
                <span>Excel Import</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
            </label>
            <button onClick={handleSyncToCloud} disabled={products.length === 0} className="flex items-center gap-2 bg-pastel-blueDark text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tight shadow-md">
                <CloudUpload size={14} />
                <span>Sync Cloud</span>
            </button>
            <div className="flex-1" />
            <button onClick={() => exportMasterData()} disabled={products.length === 0} className="p-2.5 bg-white dark:bg-gray-800 border border-gray-100 rounded-xl text-gray-500">
              <FileDown size={18}/>
            </button>
        </div>

        <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" placeholder="ค้นหาบาร์โค้ด หรือชื่อสินค้า..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-gray-900 border-none focus:ring-2 focus:ring-pastel-blueDark rounded-[1.5rem] text-sm font-medium transition-all" 
            />
        </div>
      </div>

      {isLoading && products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 space-y-4">
              <Loader2 size={32} className="animate-spin text-pastel-blueDark" />
              <p className="text-xs font-bold uppercase tracking-widest text-center">กำลังตรวจสอบคลังสินค้า...</p>
          </div>
      ) : products.length === 0 ? (
        <div className="p-20 text-center flex flex-col items-center gap-4 text-gray-300">
            <AlertCircle size={64} className="opacity-20" />
            <p className="font-bold text-sm uppercase tracking-widest">ไม่พบสินค้าในระบบ</p>
            <p className="text-xs">กรุณานำเข้าไฟล์ Excel หรือซิงค์กับ Cloud</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left table-fixed">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-400 text-[10px] uppercase font-black tracking-widest border-b border-gray-100">
                        <tr>
                            <th className="p-4 pl-8 w-32">Barcode</th>
                            <th className="p-4">Product Name</th>
                            <th className="p-4 w-24 text-center">Price</th>
                            <th className="p-4 pr-8 w-20 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {filtered.map(product => (
                            <tr key={product.barcode} className="hover:bg-gray-50 dark:hover:bg-gray-700/20 group">
                                <td className="p-4 pl-8">
                                    <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded">
                                        {product.barcode}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <p className="text-xs font-bold text-gray-800 dark:text-white truncate">{product.productName}</p>
                                </td>
                                <td className="p-4 text-center">
                                    <span className="text-xs text-pastel-blueDark font-black">฿{product.unitPrice?.toLocaleString() || 0}</span>
                                </td>
                                <td className="p-4 pr-8 text-right">
                                    <div className="flex justify-end gap-3">
                                        <button onClick={() => { setIsEditMode(true); setEditingProduct(product); setShowModal(true); }} className="text-blue-500"><Edit2 size={14}/></button>
                                        <button onClick={() => setDeleteId(product.barcode)} className="text-red-500"><Trash2 size={14}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="bg-white dark:bg-gray-800 rounded-[3rem] w-full max-w-sm shadow-2xl relative animate-slide-up overflow-hidden">
                <div className="p-10 space-y-6">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-3">
                        {isEditMode ? <Edit2 size={24} /> : <Plus size={24} />}
                        {isEditMode ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
                    </h2>
                    <form onSubmit={handleSaveProduct} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-gray-400 ml-1">Barcode / ID</label>
                            <input type="text" required disabled={isEditMode} value={editingProduct.barcode || ''} onChange={e => setEditingProduct({...editingProduct, barcode: e.target.value})} className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm font-mono focus:ring-2 focus:ring-pastel-blueDark" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-gray-400 ml-1">Product Name</label>
                            <textarea required rows={3} value={editingProduct.productName || ''} onChange={e => setEditingProduct({...editingProduct, productName: e.target.value})} className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm font-medium resize-none focus:ring-2 focus:ring-pastel-blueDark" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-gray-400 ml-1">Cost (฿)</label>
                                <input type="number" step="0.01" value={editingProduct.costPrice || ''} onChange={e => setEditingProduct({...editingProduct, costPrice: Number(e.target.value)})} className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm font-bold" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-gray-400 ml-1">Price (฿)</label>
                                <input type="number" step="0.01" value={editingProduct.unitPrice || ''} onChange={e => setEditingProduct({...editingProduct, unitPrice: Number(e.target.value)})} className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm text-pastel-blueDark font-black" />
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-pastel-blueDark text-white font-black py-5 rounded-[1.5rem] shadow-xl active:scale-95 transition-all text-sm mt-4">
                            {isEditMode ? 'อัปเดตข้อมูล' : 'บันทึกลงคลัง'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
      )}

      {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
             <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
             <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-8 shadow-2xl relative animate-slide-up max-w-xs w-full text-center">
                 <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle size={40} />
                 </div>
                 <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">ยืนยันการลบ?</h3>
                 <p className="text-gray-400 text-xs mb-8">ลบรหัส {deleteId} ใช่หรือไม่?</p>
                 <div className="flex gap-4">
                     <button onClick={() => setDeleteId(null)} className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 rounded-2xl font-bold">ยกเลิก</button>
                     <button onClick={() => handleDelete(deleteId!)} className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-bold shadow-lg shadow-red-500/20 active:scale-95 transition-all">ลบข้อมูล</button>
                 </div>
             </div>
          </div>
      )}
    </div>
  );
};
