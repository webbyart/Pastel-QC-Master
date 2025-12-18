
import React, { useState, useEffect, useCallback } from 'react';
import { fetchMasterData, importMasterData, deleteProduct, saveProduct, bulkSaveProducts, clearAllCloudData, exportMasterData, fetchCloudStats, dbGet } from '../services/db';
import { ProductMaster } from '../types';
import { Trash2, Search, Plus, Edit2, Loader2, Box, FileDown, CloudUpload, FileSpreadsheet, AlertTriangle, RefreshCw, Zap, Database, Server, AlertCircle } from 'lucide-react';

export const MasterData: React.FC = () => {
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cloudStats, setCloudStats] = useState({ remaining: 0, checked: 0, total: 0 });
  const [hasInitialized, setHasInitialized] = useState(false);
  
  // Progress States
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [processLabel, setProcessLabel] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<ProductMaster>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadSessionData = useCallback(async (forceUpdate = false) => {
    if (hasInitialized && !forceUpdate) return;
    
    if (products.length === 0 || forceUpdate) setIsLoading(true);
    
    try {
        const stats = await fetchCloudStats();
        setCloudStats(stats);
        
        const data = await fetchMasterData(forceUpdate);
        if (data && data.length > 0) {
            setProducts(data);
        }
        setHasInitialized(true);
    } catch (e) {
        console.warn("Load Cloud failed", e);
    } finally { 
        setIsLoading(false); 
    }
  }, [hasInitialized, products.length]);

  useEffect(() => { 
    const init = async () => {
        try {
            const cached = await dbGet('qc_cache_master');
            if (cached && cached.length > 0) {
                setProducts(cached);
            }
        } catch (e) { console.warn("Cache load failed", e); }
        loadSessionData(false); 
    };
    init();
  }, [loadSessionData]);

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

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-pastel-blue/50 rounded-xl text-pastel-blueDark">
                <Database size={20} />
            </div>
            <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Inventory</p>
                <p className="text-xl font-black text-gray-800 dark:text-white">{cloudStats.total.toLocaleString()}</p>
            </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-pastel-purple/50 rounded-xl text-pastel-purpleDark">
                <Server size={20} />
            </div>
            <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Checked</p>
                <p className="text-xl font-black text-gray-800 dark:text-white">{cloudStats.checked.toLocaleString()}</p>
            </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-5">
        <div className="flex justify-between items-center">
            <h1 className="text-2xl font-display font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <Box className="text-pastel-blueDark" size={24} />
                คลังสินค้า
            </h1>
            <div className="flex gap-2">
              <button onClick={() => loadSessionData(true)} className="p-3 bg-gray-50 rounded-xl text-gray-400 hover:text-pastel-blueDark transition-all">
                <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => { setIsEditMode(false); setEditingProduct({}); setShowModal(true); }} className="bg-pastel-blueDark text-white p-3 rounded-xl shadow-lg">
                <Plus size={20}/>
              </button>
            </div>
        </div>

        <div className="flex flex-wrap gap-2">
            <label className="flex-1 bg-white border border-gray-100 dark:bg-gray-800 p-3 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-green-600 cursor-pointer active:scale-95 transition-all shadow-sm">
                <FileSpreadsheet size={16} /> Import
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
            </label>
            <button onClick={handleSyncToCloud} className="flex-1 bg-pastel-blueDark text-white p-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all">
                <CloudUpload size={16} /> Sync
            </button>
        </div>

        <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
            <input 
              type="text" placeholder="ค้นหาสินค้า..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-gray-900 border-none rounded-2xl text-sm font-medium" 
            />
        </div>
      </div>

      {isLoading && products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-4">
              <Loader2 size={32} className="animate-spin text-pastel-blueDark" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">Syncing...</p>
          </div>
      ) : products.length === 0 ? (
        <div className="p-20 text-center flex flex-col items-center gap-4 text-gray-300 bg-white rounded-[2.5rem]">
            <AlertCircle size={48} className="opacity-20" />
            <p className="text-xs font-bold uppercase tracking-widest">No Products Found</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left table-fixed">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-400 text-[9px] uppercase font-black tracking-widest border-b border-gray-100">
                        <tr>
                            <th className="p-4 pl-8 w-28">Barcode</th>
                            <th className="p-4">Name</th>
                            <th className="p-4 w-20 text-center">Price</th>
                            <th className="p-4 pr-8 w-16 text-right">Edit</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {filtered.slice(0, 50).map(product => ( // Limit display for performance on mobile
                            <tr key={product.barcode} className="hover:bg-gray-50 active:bg-gray-100 transition-colors">
                                <td className="p-4 pl-8">
                                    <span className="font-mono text-[9px] text-gray-400 bg-gray-50 px-2 py-1 rounded">
                                        {product.barcode}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <p className="text-[11px] font-bold text-gray-800 dark:text-white truncate">{product.productName}</p>
                                </td>
                                <td className="p-4 text-center">
                                    <span className="text-[11px] text-pastel-blueDark font-black">฿{product.unitPrice?.toLocaleString()}</span>
                                </td>
                                <td className="p-4 pr-8 text-right">
                                    <button onClick={() => { setIsEditMode(true); setEditingProduct(product); setShowModal(true); }} className="text-blue-400"><Edit2 size={14}/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length > 50 && (
                    <div className="p-4 text-center text-[9px] font-bold text-gray-400 uppercase tracking-widest border-t border-gray-50">
                        Showing first 50 of {filtered.length} items
                    </div>
                )}
            </div>
        </div>
      )}

      {/* Modal - Simplified for mobile */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="bg-white dark:bg-gray-800 rounded-t-[3rem] md:rounded-[3rem] w-full max-w-sm shadow-2xl relative animate-slide-up overflow-hidden">
                <div className="p-8 pb-12 md:pb-8 space-y-6">
                    <h2 className="text-lg font-bold flex items-center gap-3">
                        {isEditMode ? <Edit2 size={20} /> : <Plus size={20} />}
                        {isEditMode ? 'Edit Product' : 'New Product'}
                    </h2>
                    <form onSubmit={handleSaveProduct} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Barcode</label>
                            <input type="text" required disabled={isEditMode} value={editingProduct.barcode || ''} onChange={e => setEditingProduct({...editingProduct, barcode: e.target.value})} className="w-full p-4 rounded-xl bg-gray-50 border-none text-xs font-mono" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Name</label>
                            <textarea required rows={2} value={editingProduct.productName || ''} onChange={e => setEditingProduct({...editingProduct, productName: e.target.value})} className="w-full p-4 rounded-xl bg-gray-50 border-none text-xs font-medium resize-none" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Price (฿)</label>
                                <input type="number" step="0.01" value={editingProduct.unitPrice || ''} onChange={e => setEditingProduct({...editingProduct, unitPrice: Number(e.target.value)})} className="w-full p-4 rounded-xl bg-gray-50 border-none text-xs font-black" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Cost (฿)</label>
                                <input type="number" step="0.01" value={editingProduct.costPrice || ''} onChange={e => setEditingProduct({...editingProduct, costPrice: Number(e.target.value)})} className="w-full p-4 rounded-xl bg-gray-50 border-none text-xs font-black" />
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-pastel-blueDark text-white font-black py-5 rounded-2xl shadow-xl active:scale-95 transition-all text-xs mt-4">
                            Save Product
                        </button>
                    </form>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
