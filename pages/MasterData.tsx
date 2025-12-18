
import React, { useState, useEffect } from 'react';
import { fetchMasterData, importMasterData, deleteProduct, saveProduct, bulkSaveProducts, clearAllCloudData, exportMasterData, updateLocalMasterDataCache } from '../services/db';
import { ProductMaster } from '../types';
import { Trash2, Search, Plus, Edit2, X, Loader2, Box, FileDown, CloudUpload, FileSpreadsheet, AlertTriangle, RefreshCw, Zap } from 'lucide-react';

export const MasterData: React.FC = () => {
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Progress States
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [processLabel, setProcessLabel] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<ProductMaster>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { 
    loadSessionData(true); 
  }, []);

  const loadSessionData = async (forceUpdate = false) => {
    setIsLoading(true);
    try {
        const data = await fetchMasterData(forceUpdate); 
        setProducts(data);
    } catch (e) {
        console.warn("Load failed", e);
    } finally { setIsLoading(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsProcessing(true);
      setProcessLabel('1/2: Reading Excel Data...');
      setProgressPct(0);
      try {
        // Step 1: Import from File
        const newProducts = await importMasterData(e.target.files[0], (pct) => setProgressPct(Math.floor(pct * 0.3))); // File processing is 30% of progress
        
        // Step 2: Auto Sync to Cloud
        setProcessLabel(`2/2: Uploading ${newProducts.length} items to Cloud...`);
        await bulkSaveProducts(newProducts, (pct) => {
            // Mapping 0-100% of upload to 30-100% of total progress
            const totalPct = 30 + Math.floor(pct * 0.7);
            setProgressPct(totalPct);
        });

        setProducts(newProducts);
        await updateLocalMasterDataCache(newProducts);
        
        setTimeout(() => {
            setIsProcessing(false);
            alert(`✅ นำเข้าและบันทึกขึ้น Cloud สำเร็จ!\nจำนวน ${newProducts.length} รายการพร้อมใช้งานสำหรับทุกคนแล้ว`);
        }, 500);
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
      if (!confirm(`ต้องการอัปโหลดสินค้า ${products.length} รายการปัจจุบันขึ้น Cloud หรือไม่?`)) return;
      
      setIsProcessing(true);
      setProcessLabel('Force Uploading to Cloud...');
      setProgressPct(0);
      
      try {
          await bulkSaveProducts(products, (pct) => setProgressPct(pct));
          setTimeout(() => {
              setIsProcessing(false);
              alert('✅ บันทึกข้อมูลขึ้น Cloud สำเร็จ!');
              loadSessionData(true);
          }, 500);
      } catch (e: any) { 
          alert(`ไม่สามารถบันทึกข้อมูลได้: ${e.message}`); 
          setIsProcessing(false);
      }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct.barcode || !editingProduct.productName) return;
    setIsLoading(true);
    try {
        const newItem = editingProduct as ProductMaster;
        await saveProduct(newItem);
        await loadSessionData(true);
        setShowModal(false);
    } catch (e: any) {
        alert("บันทึกไม่สำเร็จ: " + e.message);
    } finally {
        setIsLoading(false);
    }
  };

  const handleClearData = async () => {
    if (confirm("⚠️ คำเตือนร้ายแรง: ต้องการลบข้อมูลสินค้าและประวัติการตรวจ 'ทั้งระบบ Cloud' ใช่หรือไม่?\nข้อมูลจะหายไปจากพนักงานทุกคนทันที!")) {
        setIsProcessing(true);
        setProcessLabel('Deleting Cloud Data (Nuclear Clear)...');
        setProgressPct(0);
        try {
            await clearAllCloudData((pct) => setProgressPct(pct));
            setProducts([]);
            setTimeout(() => {
                setIsProcessing(false);
                alert("ล้างข้อมูลสินค้าและประวัติการตรวจเรียบร้อยแล้ว");
            }, 500);
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
    <div className="space-y-4 pb-24 md:pb-0 animate-fade-in relative min-h-screen">
      
      {/* Enhanced Progress Overlay */}
      {isProcessing && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-xl animate-fade-in">
              <div className="bg-white dark:bg-gray-800 rounded-[3rem] p-10 w-full max-w-sm shadow-2xl border border-white/10 flex flex-col items-center gap-8 animate-slide-up text-center">
                  <div className="relative">
                      <svg className="w-32 h-32 transform -rotate-90">
                          <circle
                            cx="64" cy="64" r="58"
                            stroke="currentColor" strokeWidth="8"
                            fill="transparent"
                            className="text-gray-100 dark:text-gray-700"
                          />
                          <circle
                            cx="64" cy="64" r="58"
                            stroke="currentColor" strokeWidth="8"
                            fill="transparent"
                            strokeDasharray={2 * Math.PI * 58}
                            strokeDashoffset={2 * Math.PI * 58 * (1 - progressPct / 100)}
                            strokeLinecap="round"
                            className="text-pastel-blueDark transition-all duration-300"
                          />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl font-black text-pastel-blueDark dark:text-pastel-blue">{progressPct}%</span>
                      </div>
                  </div>
                  
                  <div className="space-y-2">
                      <h3 className="text-lg font-bold text-gray-800 dark:text-white leading-tight">{processLabel}</h3>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] animate-pulse">Synchronizing Cloud Data...</p>
                  </div>

                  <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-pastel-blueDark transition-all duration-300 shadow-[0_0_15px_rgba(3,105,161,0.6)]"
                        style={{ width: `${progressPct}%` }}
                      />
                  </div>
              </div>
          </div>
      )}

      {/* Header Panel */}
      <div className="bg-white dark:bg-gray-800 p-5 md:p-6 -mx-4 md:mx-0 md:rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-4">
        <div className="flex justify-between items-center">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl md:text-2xl font-display font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <Box className="text-pastel-blueDark" size={24} />
                        คลังสินค้า
                    </h1>
                    <span className="bg-pastel-blueDark text-white px-3 py-1 rounded-full text-[11px] font-black shadow-lg">
                        {products.length.toLocaleString()} Items
                    </span>
                </div>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest ml-1">Cloud Sync: Real-time</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => loadSessionData(true)} title="Refresh Cloud" className="bg-gray-100 dark:bg-gray-700 p-2.5 rounded-xl text-gray-500 hover:text-pastel-blueDark transition-colors">
                <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
              </button>
              <button onClick={handleClearData} title="Delete All Data on Cloud" className="bg-red-50 dark:bg-red-900/20 p-2.5 rounded-xl text-red-500 hover:bg-red-100 transition-all">
                <Trash2 size={20}/>
              </button>
              <button onClick={() => { setIsEditMode(false); setEditingProduct({}); setShowModal(true); }} className="bg-pastel-blue/50 dark:bg-gray-700 p-2.5 rounded-xl text-pastel-blueDark dark:text-white hover:scale-105 active:scale-95 transition-all shadow-sm">
                <Plus size={24}/>
              </button>
            </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700">
            <label className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-green-200 text-green-700 dark:text-green-400 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight cursor-pointer shadow-sm active:scale-95 transition-all">
                <FileSpreadsheet size={14} />
                <span>Import & Save to Cloud</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
            </label>
            <button onClick={handleSyncToCloud} disabled={products.length === 0} className="flex items-center gap-2 bg-pastel-blueDark text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight shadow-md active:scale-95 transition-all disabled:opacity-50">
                <CloudUpload size={14} />
                <span>Save to Cloud</span>
            </button>
            <div className="flex-1" />
            <button onClick={() => exportMasterData()} disabled={products.length === 0} className="p-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg text-gray-500 hover:text-blue-500">
              <FileDown size={16}/>
            </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" placeholder="ค้นหาบาร์โค้ด หรือชื่อสินค้า..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900 border-none focus:ring-2 focus:ring-pastel-blueDark rounded-xl text-[11px] font-medium transition-all" 
            />
        </div>
      </div>

      {/* Product Table */}
      {isLoading && products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 space-y-4">
              <Loader2 size={32} className="animate-spin text-pastel-blueDark" />
              <p className="text-[10px] font-black uppercase tracking-widest text-center">Fetching data from Cloud...</p>
          </div>
      ) : filtered.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center gap-3">
              <div className="p-8 bg-gray-50 dark:bg-gray-800 rounded-full">
                <Box size={48} className="text-gray-200" />
              </div>
              <p className="text-xs text-gray-400">ไม่พบรายการสินค้า</p>
          </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left table-fixed">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-400 text-[9px] uppercase font-black tracking-widest border-b border-gray-100 dark:border-gray-700">
                        <tr>
                            <th className="p-3 pl-6 w-28">Barcode</th>
                            <th className="p-3">Product Name</th>
                            <th className="p-3 w-20 text-center">Cost/Sell</th>
                            <th className="p-3 pr-6 w-16 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {filtered.map(product => (
                            <tr key={product.barcode} className="hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors group">
                                <td className="p-3 pl-6">
                                    <span className="font-mono text-[9px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 px-1.5 py-0.5 rounded leading-none">
                                        {product.barcode}
                                    </span>
                                </td>
                                <td className="p-3">
                                    <p className="text-[10px] font-bold text-gray-800 dark:text-white truncate leading-tight">{product.productName}</p>
                                    <span className="text-[8px] text-gray-400 block mt-0.5">LOT: {product.lotNo || 'N/A'}</span>
                                </td>
                                <td className="p-3 text-center">
                                    <div className="flex flex-col">
                                        <span className="text-[8px] text-gray-400 line-through">฿{product.costPrice}</span>
                                        <span className="text-[10px] text-pastel-blueDark font-black">฿{product.unitPrice || 0}</span>
                                    </div>
                                </td>
                                <td className="p-3 pr-6 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => { setIsEditMode(true); setEditingProduct(product); setShowModal(true); }} className="text-blue-500 hover:scale-110 transition-transform"><Edit2 size={12}/></button>
                                        <button onClick={() => setDeleteId(product.barcode)} className="text-red-500 hover:scale-110 transition-transform"><Trash2 size={12}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900/20 text-center">
                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Showing {filtered.length} of {products.length} Items</p>
            </div>
        </div>
      )}

      {/* Modal & Delete Confirm */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] w-full max-w-sm shadow-2xl relative animate-slide-up overflow-hidden">
                <div className="p-8 space-y-5">
                    <h2 className="text-base font-bold text-gray-800 dark:text-white flex items-center gap-2 mb-2">
                        {isEditMode ? <Edit2 size={18} /> : <Plus size={18} />}
                        {isEditMode ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
                    </h2>
                    <form onSubmit={handleSaveProduct} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Barcode / ID</label>
                            <input type="text" required disabled={isEditMode} value={editingProduct.barcode || ''} onChange={e => setEditingProduct({...editingProduct, barcode: e.target.value})} className="w-full p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-[11px] font-mono focus:ring-1 focus:ring-pastel-blueDark" placeholder="สแกนรหัสสินค้า..." />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Product Name</label>
                            <textarea required rows={2} value={editingProduct.productName || ''} onChange={e => setEditingProduct({...editingProduct, productName: e.target.value})} className="w-full p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-[11px] font-medium resize-none focus:ring-1 focus:ring-pastel-blueDark" placeholder="ชื่อสินค้าอย่างย่อ" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Cost (฿)</label>
                                <input type="number" step="0.01" value={editingProduct.costPrice || ''} onChange={e => setEditingProduct({...editingProduct, costPrice: Number(e.target.value)})} className="w-full p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-[11px] font-bold" placeholder="ทุน" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Price (฿)</label>
                                <input type="number" step="0.01" value={editingProduct.unitPrice || ''} onChange={e => setEditingProduct({...editingProduct, unitPrice: Number(e.target.value)})} className="w-full p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-[11px] text-pastel-blueDark font-black" placeholder="ราคาขาย" />
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-pastel-blueDark text-white font-bold py-4 rounded-2xl shadow-xl active:scale-95 transition-all text-[11px] mt-2 flex items-center justify-center gap-2">
                            {isEditMode ? 'อัปเดต Cloud' : 'บันทึกลง Cloud'}
                            <Zap size={14} fill="currentColor" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
      )}

      {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-fade-in">
             <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
             <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-8 shadow-2xl relative animate-slide-up max-w-xs w-full text-center border border-red-50 dark:border-red-900/30">
                 <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
                    <AlertTriangle size={32} />
                 </div>
                 <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-2">ยืนยันการลบ?</h3>
                 <p className="text-gray-400 text-[10px] mb-6 px-4">ต้องการลบรหัส {deleteId} ออกจากฐานข้อมูล Cloud ใช่หรือไม่?</p>
                 <div className="flex gap-3">
                     <button onClick={() => setDeleteId(null)} className="flex-1 py-3 bg-gray-50 dark:bg-gray-700 rounded-xl font-bold text-[10px]">ยกเลิก</button>
                     <button onClick={() => handleDelete(deleteId!)} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold text-[10px] shadow-lg shadow-red-500/20 active:scale-95 transition-all">ยืนยันลบ</button>
                 </div>
             </div>
          </div>
      )}
    </div>
  );
};
