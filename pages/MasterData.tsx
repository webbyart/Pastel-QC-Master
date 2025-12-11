
import React, { useState, useEffect } from 'react';
import { fetchMasterData, importMasterData, deleteProduct, saveProduct, compressImage, getApiUrl } from '../services/db';
import { ProductMaster } from '../types';
import { Upload, Trash2, Search, Plus, Edit2, X, Loader2, Database, Package, Sparkles, Box, Camera, ImageIcon, AlertTriangle, Link, RefreshCw, AlertCircle, Settings, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const MasterData: React.FC = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasApiUrl, setHasApiUrl] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<ProductMaster>>({});

  // Delete Confirm State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadData(false);
  }, []);

  const loadData = async (isManualRefresh = false) => {
    if (!getApiUrl()) {
        setHasApiUrl(false);
        setIsLoading(false);
        return;
    }
    
    setError(null);
    let hasCachedData = false;

    // 1. Instant Cache Display
    if (!isManualRefresh) {
        try {
            const cached = await fetchMasterData(false);
            if (cached.length > 0) {
                setProducts(cached);
                setIsLoading(false);
                hasCachedData = true;
            }
        } catch (e) {
            console.warn("Cache load failed", e);
        }
    } else {
        setIsRefreshing(true);
    }
    
    // 2. Network Sync
    try {
        const fresh = await fetchMasterData(true, isManualRefresh);
        setProducts(fresh);
        setIsLoading(false);
    } catch(e: any) {
        console.error(e);
        if (!hasCachedData) {
            setError(e.message || "Failed to load products");
        } else if (isManualRefresh) {
            if (e.message.includes('quota') || e.message.includes('exceeded')) {
                 alert('⚠️ ระบบ Google ยุ่งอยู่ (Quota Exceeded) กรุณารอสักครู่แล้วลองใหม่');
            } else {
                 alert(`Update failed: ${e.message}`);
            }
        }
    } finally {
        setIsRefreshing(false);
        setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsImporting(true);
      setImportProgress(10);
      
      try {
        const count = await importMasterData(e.target.files[0]);
        setImportProgress(100);
        
        setTimeout(() => {
            loadData(true); 
            setIsImporting(false);
            setImportProgress(0);
            alert(`✨ นำเข้าข้อมูลสำเร็จ ${count} รายการ!`);
        }, 500);
      } catch (err) {
        setIsImporting(false);
        setImportProgress(0);
        alert('เกิดข้อผิดพลาดในการนำเข้า');
        console.error(err);
      }
    }
  };

  const handleDelete = (barcode: string) => {
    setDeleteId(barcode);
  };

  const confirmDelete = async () => {
    if (deleteId) {
        await deleteProduct(deleteId);
        setProducts(products.filter(p => p.barcode !== deleteId));
        setDeleteId(null);
    }
  };

  const handleEdit = (product: ProductMaster) => {
    setIsEditMode(true);
    setEditingProduct(product);
    setShowModal(true);
  };

  const handleCreate = () => {
    setIsEditMode(false);
    setEditingProduct({});
    setShowModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct.barcode || !editingProduct.productName) {
        alert('กรุณาระบุบาร์โค้ดและชื่อสินค้า');
        return;
    }
    setIsLoading(true);
    await saveProduct({
        barcode: editingProduct.barcode,
        productName: editingProduct.productName,
        costPrice: Number(editingProduct.costPrice) || 0,
        unitPrice: Number(editingProduct.unitPrice) || 0,
        stock: Number(editingProduct.stock) || 0,
        image: editingProduct.image,
        lotNo: editingProduct.lotNo,
        productType: editingProduct.productType
    });
    setShowModal(false);
    loadData(true);
  };

  const filtered = products.filter(p => 
    p.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.barcode.includes(searchTerm) ||
    (p.lotNo && p.lotNo.includes(searchTerm)) ||
    (p.productType && p.productType.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (!hasApiUrl) {
      return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center p-6">
              <div className="bg-red-50 p-6 rounded-full mb-4">
                  <Link size={48} className="text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">ยังไม่ได้เชื่อมต่อ Google Sheet</h2>
              <p className="text-gray-500 mb-6 max-w-md">กรุณาไปที่เมนู "ตั้งค่า" แล้วระบุ Google Apps Script Web App URL เพื่อเริ่มต้นใช้งาน</p>
              <button 
                onClick={() => navigate('/settings')}
                className="bg-pastel-blueDark text-white px-6 py-3 rounded-xl font-bold shadow-lg"
              >
                  ไปที่ตั้งค่า
              </button>
          </div>
      )
  }

  return (
    <div className="space-y-6 pb-24 md:pb-0 animate-fade-in relative min-h-screen">
      
      {/* Loading Overlay */}
      {isRefreshing && products.length > 0 && (
          <div className="absolute inset-0 bg-white/50 dark:bg-black/20 z-20 flex items-start justify-center pt-32 backdrop-blur-[1px]">
              <div className="bg-white dark:bg-gray-800 px-6 py-3 rounded-full shadow-xl flex items-center gap-3 border border-gray-100 dark:border-gray-700 animate-slide-up">
                  <Loader2 className="animate-spin text-pastel-blueDark" size={20} />
                  <span className="font-medium text-sm text-gray-700 dark:text-gray-200">กำลังอัปเดตข้อมูลสินค้า...</span>
              </div>
          </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col gap-4 bg-gradient-to-r from-pastel-blue to-white dark:from-gray-800 dark:to-gray-900 p-6 -mx-4 md:-mx-8 md:rounded-b-3xl shadow-sm border-b border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-start">
            <div>
            <h1 className="text-3xl font-display font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <Box className="text-pastel-blueDark" />
                คลังสินค้า (Scrap Crossborder)
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">จัดการรายการสินค้าทั้งหมด {products.length} รายการ</p>
            </div>
            
            <button 
                onClick={handleCreate}
                className="flex items-center justify-center gap-2 bg-pastel-blueDark hover:bg-sky-800 text-white p-3 rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
            >
                <Plus size={24} />
            </button>
        </div>

        {/* Action Bar */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
            <label className={`flex-shrink-0 flex items-center justify-center gap-2 bg-white dark:bg-gray-700 border border-pastel-green/50 text-green-700 dark:text-green-300 px-4 py-2 rounded-xl text-sm font-medium cursor-pointer transition-all shadow-sm active:scale-95 ${isImporting ? 'opacity-75 cursor-not-allowed' : ''}`}>
                <Upload size={16} />
                <span>นำเข้า Excel</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} disabled={isImporting} />
            </label>
            <button 
                onClick={() => loadData(true)}
                disabled={isRefreshing}
                className="flex-shrink-0 flex items-center justify-center gap-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm active:scale-95"
            >
                <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                <span>อัปเดต</span>
            </button>
        </div>

        {/* Import Progress Bar */}
        {isImporting && (
             <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 overflow-hidden relative">
                <div 
                    className="bg-pastel-greenDark h-2.5 rounded-full transition-all duration-300 ease-out flex items-center justify-center relative" 
                    style={{ width: `${importProgress}%` }}
                >
                    <div className="absolute top-0 bottom-0 left-0 right-0 bg-white/20 animate-pulse"></div>
                </div>
                <span className="absolute right-0 -top-4 text-xs font-bold text-gray-500">{Math.round(importProgress)}%</span>
             </div>
        )}

        {/* Search */}
        <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input 
                type="text" 
                placeholder="ค้นหา ชื่อสินค้า, RMS ID, Lot หรือ Type..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-pastel-blue focus:outline-none dark:text-white shadow-sm"
            />
        </div>
      </div>

      {/* Content Area */}
      {error && products.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-64 text-center p-6 bg-red-50 dark:bg-red-900/10 rounded-3xl border border-red-100 dark:border-red-900/30">
              {error.includes('quota') || error.includes('exceeded') ? (
                  <>
                    <Clock size={48} className="text-orange-500 mb-4 animate-pulse" />
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">ระบบกำลังทำงานหนัก (Quota Exceeded)</h3>
                    <p className="text-gray-600 dark:text-gray-300 mb-4 max-w-xs">กรุณารอสักครู่ (ประมาณ 1 นาที) แล้วกดปุ่ม "อัปเดต" ใหม่อีกครั้ง</p>
                  </>
              ) : (
                  <>
                    <AlertCircle size={48} className="text-red-400 mb-4" />
                    <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300">เกิดข้อผิดพลาด</h3>
                    <p className="text-gray-500 mb-4">{error}</p>
                    <button onClick={() => navigate('/settings')} className="text-blue-500 hover:underline flex items-center gap-1">
                        <Settings size={16} /> ตรวจสอบการตั้งค่า
                    </button>
                  </>
              )}
          </div>
      ) : isLoading && products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Loader2 size={40} className="animate-spin text-pastel-blueDark mb-4" />
              <p>กำลังโหลดข้อมูล...</p>
          </div>
      ) : filtered.length === 0 ? (
        // Empty State
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-slide-up">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-full shadow-lg mb-6 animate-bounce-soft">
                <Database size={64} className="text-pastel-blueDark opacity-50" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">ไม่พบสินค้า</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-xs mx-auto">
                ไม่พบข้อมูลใน Sheet "Scrap Crossborder" หรือนำเข้าจาก Excel
            </p>
            <button 
                onClick={() => loadData(true)}
                disabled={isRefreshing}
                className="flex items-center gap-2 bg-pastel-blueDark hover:bg-sky-800 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
            >
                <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
                <span>ดึงข้อมูลจาก Google Sheet</span>
            </button>
        </div>
      ) : (
        // Desktop Table View
        <div className="hidden md:block bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-sm">
                    <tr>
                        <th className="p-4 pl-6 font-medium">RMS ID</th>
                        <th className="p-4 font-medium">Lot No.</th>
                        <th className="p-4 font-medium">Type</th>
                        <th className="p-4 font-medium">ชื่อสินค้า</th>
                        <th className="p-4 font-medium">ต้นทุน</th>
                        <th className="p-4 font-medium">Unit Price</th>
                        <th className="p-4 font-medium text-right pr-6">จัดการ</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filtered.map(product => (
                        <tr key={product.barcode} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                            <td className="p-4 pl-6 font-mono text-gray-600 dark:text-gray-300 font-bold">{product.barcode}</td>
                            <td className="p-4 text-gray-600 dark:text-gray-300">{product.lotNo || '-'}</td>
                             <td className="p-4 text-gray-600 dark:text-gray-300">
                                 {product.productType ? (
                                    <span className="px-2 py-1 rounded bg-blue-50 text-blue-600 text-xs font-bold">{product.productType}</span>
                                 ) : '-'}
                             </td>
                            <td className="p-4 font-bold text-gray-800 dark:text-white">{product.productName}</td>
                            <td className="p-4 font-medium text-gray-600 dark:text-gray-300">฿{product.costPrice.toFixed(2)}</td>
                            <td className="p-4 font-medium text-gray-600 dark:text-gray-300">฿{(product.unitPrice || 0).toLocaleString()}</td>
                            <td className="p-4 text-right pr-6">
                                <div className="flex justify-end gap-2">
                                    <button onClick={() => handleEdit(product)} className="p-2 text-blue-500 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                                        <Edit2 size={16} />
                                    </button>
                                    <button onClick={() => handleDelete(product.barcode)} className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      )}

      {/* Mobile Grid View */}
      <div className="md:hidden grid grid-cols-1 gap-4">
        {filtered.map((product) => (
             <div 
                key={product.barcode} 
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4"
             >
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <span className="text-xs font-bold text-pastel-blueDark bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">RMS: {product.barcode}</span>
                        {product.lotNo && <span className="ml-2 text-xs text-gray-500">Lot: {product.lotNo}</span>}
                    </div>
                    <div className="flex gap-2">
                            <button onClick={() => handleEdit(product)} className="text-blue-500"><Edit2 size={16} /></button>
                            <button onClick={() => handleDelete(product.barcode)} className="text-red-500"><Trash2 size={16} /></button>
                    </div>
                </div>
                
                <h3 className="font-bold text-gray-800 dark:text-white mb-2">{product.productName}</h3>
                
                <div className="flex justify-between items-center text-sm bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl">
                    <div>
                        <p className="text-xs text-gray-400">ต้นทุน</p>
                        <span className="font-bold text-gray-700 dark:text-gray-300">฿{product.costPrice.toFixed(2)}</span>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-gray-400">Unit Price</p>
                        <span className="font-bold text-gray-700 dark:text-gray-300">฿{(product.unitPrice || 0).toLocaleString()}</span>
                    </div>
                </div>
             </div>
        ))}
      </div>

      {/* Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md shadow-2xl relative animate-slide-up overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-gradient-to-r from-pastel-blue/30 to-pastel-purple/30 p-6 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        {isEditMode ? <Edit2 size={20} /> : <Plus size={20} />}
                        {isEditMode ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
                    </h2>
                    <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/50 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>
                
                <form onSubmit={handleSaveProduct} className="p-6 space-y-5 overflow-y-auto">
                    <div className="space-y-1">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">RMS Return Item ID (Barcode)</label>
                        <input 
                            type="text" 
                            required
                            disabled={isEditMode}
                            value={editingProduct.barcode || ''}
                            onChange={e => setEditingProduct({...editingProduct, barcode: e.target.value})}
                            className={`w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blue focus:bg-white dark:focus:bg-gray-800 transition-all outline-none ${isEditMode ? 'opacity-60 cursor-not-allowed' : ''}`}
                            placeholder="ระบุ RMS ID..."
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">Lot No.</label>
                            <input 
                                type="text" 
                                value={editingProduct.lotNo || ''}
                                onChange={e => setEditingProduct({...editingProduct, lotNo: e.target.value})}
                                className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blue focus:bg-white dark:focus:bg-gray-800 transition-all outline-none"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">Type</label>
                            <input 
                                type="text" 
                                value={editingProduct.productType || ''}
                                onChange={e => setEditingProduct({...editingProduct, productType: e.target.value})}
                                className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blue focus:bg-white dark:focus:bg-gray-800 transition-all outline-none"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">Product Name</label>
                        <input 
                            type="text" 
                            required
                            value={editingProduct.productName || ''}
                            onChange={e => setEditingProduct({...editingProduct, productName: e.target.value})}
                            className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blue focus:bg-white dark:focus:bg-gray-800 transition-all outline-none"
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">ต้นทุน (฿)</label>
                            <input 
                                type="number" 
                                required
                                min="0"
                                step="0.01"
                                value={editingProduct.costPrice || ''}
                                onChange={e => setEditingProduct({...editingProduct, costPrice: Number(e.target.value)})}
                                className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blue focus:bg-white dark:focus:bg-gray-800 transition-all outline-none font-mono"
                                placeholder="0.00"
                            />
                        </div>
                         <div className="space-y-1">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">Unit Price (฿)</label>
                            <input 
                                type="number" 
                                min="0"
                                step="0.01"
                                value={editingProduct.unitPrice || ''}
                                onChange={e => setEditingProduct({...editingProduct, unitPrice: Number(e.target.value)})}
                                className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blue focus:bg-white dark:focus:bg-gray-800 transition-all outline-none font-mono"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-pastel-blueDark to-blue-600 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/30 transform active:scale-95 transition-all mt-4 disabled:opacity-50"
                    >
                        {isLoading ? <Loader2 className="animate-spin mx-auto" /> : (isEditMode ? 'บันทึกการแก้ไข' : 'สร้างสินค้า')}
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
             <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-2xl relative animate-slide-up max-w-sm w-full text-center">
                 <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     <AlertTriangle className="text-red-500" size={32} />
                 </div>
                 <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">ยืนยันการลบสินค้า?</h3>
                 <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                     คุณแน่ใจหรือไม่ที่จะลบสินค้านี้ การกระทำนี้ไม่สามารถย้อนกลับได้
                 </p>
                 <div className="flex gap-3">
                     <button 
                         onClick={() => setDeleteId(null)}
                         className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold"
                     >
                         ยกเลิก
                     </button>
                     <button 
                         onClick={confirmDelete}
                         className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/30"
                     >
                         ลบสินค้า
                     </button>
                 </div>
             </div>
          </div>
      )}
    </div>
  );
};
