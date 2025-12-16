
import React, { useState, useEffect } from 'react';
import { fetchMasterData, importMasterData, deleteProduct, saveProduct, saveEditLogs, exportEditLogs, getEditLogs, clearEditLogs, getApiUrl, bulkSaveProducts, clearLocalMasterData, exportMasterData } from '../services/db';
import { ProductMaster, ProductEditLog } from '../types';
import { Upload, Trash2, Search, Plus, Edit2, X, Loader2, Database, Package, Sparkles, Box, Camera, ImageIcon, AlertTriangle, Link, RefreshCw, AlertCircle, Settings, Clock, FileDown, History, CloudUpload, Archive } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const MasterData: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasApiUrl, setHasApiUrl] = useState(true);
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<ProductMaster>>({});
  const [originalProduct, setOriginalProduct] = useState<ProductMaster | null>(null);

  // Delete Confirm State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadLocalData();
  }, []);

  const loadLocalData = async () => {
    if (!getApiUrl()) setHasApiUrl(false);
    
    // Always load from cache (localstorage) first. 
    // We removed the auto-fetch from API logic here.
    try {
        const cached = await fetchMasterData(false); // false = do not force network
        setProducts(cached);
    } catch (e) {
        console.warn("Local load failed", e);
    } finally {
        setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsImporting(true);
      
      try {
        // Fast Import: Reads Excel and updates LocalStorage directly. No API calls per row.
        const newProducts = await importMasterData(e.target.files[0]);
        setProducts(newProducts);
        
        setIsImporting(false);
        alert(`✨ นำเข้าข้อมูลสำเร็จ ${newProducts.length} รายการ!\n(ข้อมูลอยู่ในเครื่องแล้ว กด "บันทึกขึ้น Cloud" หากต้องการอัปเดต Google Sheet)`);
      } catch (err) {
        setIsImporting(false);
        alert('เกิดข้อผิดพลาดในการนำเข้า');
        console.error(err);
      } finally {
          // Reset input
          e.target.value = '';
      }
    }
  };

  const handleSyncToCloud = async () => {
      if (products.length === 0) {
          alert('ไม่มีข้อมูลให้บันทึก');
          return;
      }
      if (!confirm(`ยืนยันการบันทึกสินค้า ${products.length} รายการไปยัง Google Sheet?\n\n(ข้อมูลเก่าใน Sheet "Scrap Crossborder" จะถูกแทนที่ทั้งหมด)`)) return;

      setIsSyncing(true);
      try {
          await bulkSaveProducts(products);
          alert('✅ บันทึกข้อมูลไปยัง Google Sheet เรียบร้อยแล้ว');
      } catch (e: any) {
          alert(`เกิดข้อผิดพลาด: ${e.message}`);
      } finally {
          setIsSyncing(false);
      }
  };

  const handleClearAll = () => {
      if (confirm('คุณต้องการ "ลบสินค้าทั้งหมด" ในเครื่องหรือไม่?')) {
          clearLocalMasterData();
          setProducts([]);
      }
  };

  const handleExportExcel = () => {
      const success = exportMasterData();
      if (!success) alert('ไม่มีข้อมูลให้ส่งออก');
  };

  // --- Individual CRUD ---

  const handleDelete = (barcode: string) => {
    setDeleteId(barcode);
  };

  const confirmDelete = async () => {
    if (deleteId) {
        // Since we are now "Offline First", we primarily update local state.
        // If user wants to delete from cloud, they should Sync afterwards, OR we keep deleteProduct API call if desired.
        // For consistency with the new bulk flow, let's update local and ask to sync, OR just delete locally.
        // However, existing service deleteProduct calls API. Let's keep it mixed for single item edits.
        
        await deleteProduct(deleteId); // Delete from API
        
        // Update Local State
        const updated = products.filter(p => p.barcode !== deleteId);
        setProducts(updated);
        setDeleteId(null);
    }
  };

  const handleEdit = (product: ProductMaster) => {
    setIsEditMode(true);
    setEditingProduct({ ...product }); 
    setOriginalProduct({ ...product }); 
    setShowModal(true);
  };

  const handleCreate = () => {
    setIsEditMode(false);
    setEditingProduct({});
    setOriginalProduct(null);
    setShowModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct.barcode || !editingProduct.productName) {
        alert('กรุณาระบุบาร์โค้ดและชื่อสินค้า');
        return;
    }
    
    // Save to API (Single item)
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

    // Update Local State manually to reflect changes immediately
    const newItem = editingProduct as ProductMaster;
    let newProducts = [...products];
    const index = newProducts.findIndex(p => p.barcode === newItem.barcode);
    if (index >= 0) {
        newProducts[index] = newItem;
    } else {
        newProducts.push(newItem);
    }
    setProducts(newProducts);
    
    // Update Cache
    localStorage.setItem('qc_cache_master', JSON.stringify(newProducts));
    
    setShowModal(false);
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
              <p className="text-gray-500 mb-6 max-w-md">กรุณาไปที่เมนู "ตั้งค่า" เพื่อระบุ Web App URL</p>
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
      
      {/* Header Section */}
      <div className="flex flex-col gap-4 bg-gradient-to-r from-pastel-blue to-white dark:from-gray-800 dark:to-gray-900 p-6 -mx-4 md:-mx-8 md:rounded-b-3xl shadow-sm border-b border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-start">
            <div>
            <h1 className="text-3xl font-display font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <Box className="text-pastel-blueDark" />
                คลังสินค้า (Scrap Crossborder)
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                จัดการรายการสินค้าทั้งหมด {products.length} รายการ (Local)
            </p>
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
            
            {/* Import Button */}
            <label className={`flex-shrink-0 flex items-center justify-center gap-2 bg-white dark:bg-gray-700 border border-pastel-green/50 text-green-700 dark:text-green-300 px-4 py-2 rounded-xl text-sm font-medium cursor-pointer transition-all shadow-sm active:scale-95 hover:bg-green-50 dark:hover:bg-green-900/20 ${isImporting ? 'opacity-75 cursor-not-allowed' : ''}`}>
                {isImporting ? <Loader2 size={16} className="animate-spin"/> : <Upload size={16} />}
                <span>นำเข้า Excel</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} disabled={isImporting} />
            </label>

            {/* Sync Cloud Button */}
             <button 
                onClick={handleSyncToCloud}
                disabled={isSyncing || products.length === 0}
                className="flex-shrink-0 flex items-center justify-center gap-2 bg-white dark:bg-gray-700 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm active:scale-95 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
                <span>บันทึกขึ้น Cloud</span>
            </button>

            {/* Export Button */}
            <button 
                onClick={handleExportExcel}
                disabled={products.length === 0}
                className="flex-shrink-0 flex items-center justify-center gap-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm active:scale-95 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
            >
                <FileDown size={16} />
                <span>Export</span>
            </button>

            {/* Clear Button */}
            <button 
                onClick={handleClearAll}
                disabled={products.length === 0}
                className="flex-shrink-0 flex items-center justify-center gap-2 bg-white dark:bg-gray-700 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm active:scale-95 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
            >
                <Archive size={16} />
                <span>เคลียร์รายการ</span>
            </button>
        </div>

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
      {isLoading ? (
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
                {products.length === 0 ? 'กรุณานำเข้าไฟล์ Excel สินค้าเพื่อเริ่มใช้งาน' : 'ไม่พบข้อมูลที่ค้นหา'}
            </p>
             {products.length === 0 && (
                <label className="flex items-center gap-2 bg-pastel-blueDark hover:bg-sky-800 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95 cursor-pointer">
                    <Upload size={20} />
                    <span>นำเข้าไฟล์ Excel</span>
                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} disabled={isImporting} />
                </label>
             )}
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
                        <th className="p-4 font-medium">ราคาขาย</th>
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
                            <td className="p-4 text-gray-600 dark:text-gray-300 font-mono">
                                {product.costPrice ? product.costPrice.toLocaleString() : '-'}
                            </td>
                            <td className="p-4 text-gray-600 dark:text-gray-300 font-mono">
                                {product.unitPrice ? product.unitPrice.toLocaleString() : '-'}
                            </td>
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
                    </div>
                    <div className="flex gap-2">
                            <button onClick={() => handleEdit(product)} className="text-blue-500"><Edit2 size={16} /></button>
                            <button onClick={() => handleDelete(product.barcode)} className="text-red-500"><Trash2 size={16} /></button>
                    </div>
                </div>
                
                <h3 className="font-bold text-gray-800 dark:text-white mb-2">{product.productName}</h3>
                
                <div className="flex flex-wrap items-center gap-2 mt-2">
                    {product.lotNo && (
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">
                            Lot: {product.lotNo}
                        </span>
                    )}
                    {product.productType && (
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">
                            Type: {product.productType}
                        </span>
                    )}
                </div>
                <div className="flex justify-between mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <div className="text-xs text-gray-500">ต้นทุน: {product.costPrice || '-'}</div>
                    <div className="text-xs text-gray-500">ราคา: {product.unitPrice || '-'}</div>
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
                        className="w-full bg-gradient-to-r from-pastel-blueDark to-blue-600 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/30 transform active:scale-95 transition-all mt-4"
                    >
                        {isEditMode ? 'บันทึกการแก้ไข' : 'สร้างสินค้า'}
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
                     คุณแน่ใจหรือไม่ที่จะลบสินค้านี้
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
