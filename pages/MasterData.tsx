
import React, { useState, useEffect } from 'react';
import { fetchMasterData, importMasterData, deleteProduct, saveProduct, bulkSaveProducts, clearLocalMasterData, clearRemoteMasterData, exportMasterData, updateLocalMasterDataCache, getApiUrl } from '../services/db';
import { ProductMaster } from '../types';
import { Upload, Trash2, Search, Plus, Edit2, X, Loader2, Database, Package, Sparkles, Box, Camera, ImageIcon, AlertTriangle, Link, RefreshCw, AlertCircle, Settings, Clock, FileDown, History, CloudUpload, Archive, FileSpreadsheet, Check } from 'lucide-react';
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
  const [isClearing, setIsClearing] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<ProductMaster>>({});

  // Delete Confirm State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadSessionData();
  }, []);

  const loadSessionData = async () => {
    if (!getApiUrl()) setHasApiUrl(false);
    
    setIsLoading(true);
    try {
        // Only load what is in the local IndexedDB. 
        // We do NOT fetch from Google Sheets to avoid overwriting the "Import First" flow.
        const cached = await fetchMasterData(false); 
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
        // Fast Import: Reads Excel and updates IndexedDB directly. No API calls per row.
        const newProducts = await importMasterData(e.target.files[0]);
        
        // Basic Validation check on the first few rows
        if (newProducts.length === 0) {
            alert("⚠️ ไฟล์ไม่ถูกต้อง: ไม่พบข้อมูลสินค้า");
            setProducts([]);
        } else {
             // Check required columns logic based on parsed result
             const sample = newProducts[0];
             if (!sample.barcode || !sample.productName) {
                 alert("⚠️ โครงสร้างไฟล์ไม่ถูกต้อง: ต้องมีคอลัมน์ 'RMS Return Item ID' และ 'Product Name'");
             } else {
                 setProducts(newProducts);
                 alert(`✅ นำเข้าข้อมูลสำเร็จ ${newProducts.length} รายการ!\n\nขั้นตอนต่อไป: ตรวจสอบข้อมูลและกด "บันทึกขึ้น Cloud"`);
             }
        }
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการนำเข้าไฟล์: กรุณาตรวจสอบรูปแบบไฟล์ Excel');
        console.error(err);
      } finally {
          setIsImporting(false);
          e.target.value = '';
      }
    }
  };

  const handleSyncToCloud = async () => {
      if (products.length === 0) {
          alert('ไม่มีข้อมูลให้บันทึก');
          return;
      }
      if (!confirm(`ยืนยันการบันทึกสินค้า ${products.length} รายการไปยัง Google Sheet?\n\n(ข้อมูลเก่าใน Sheet "Scrap Crossborder" จะถูกล้างและแทนที่ด้วยข้อมูลชุดนี้)`)) return;

      setIsSyncing(true);
      try {
          await bulkSaveProducts(products);
          alert('✅ บันทึกข้อมูลไปยัง Google Sheet เรียบร้อยแล้ว');
      } catch (e: any) {
          alert(`เกิดข้อผิดพลาดในการบันทึก: ${e.message}`);
      } finally {
          setIsSyncing(false);
      }
  };

  const handleClearAll = async () => {
      const confirmed = confirm('⚠️ คำเตือน: คุณต้องการลบข้อมูลสินค้าทั้งหมดใช่หรือไม่?\n\n1. ข้อมูลในหน้าเว็บจะหายไป\n2. ข้อมูลใน Google Sheets จะถูกลบทั้งหมด\n\nการกระทำนี้ไม่สามารถกู้คืนได้');
      if (confirmed) {
          setIsClearing(true);
          try {
             // 1. Clear Local
             await clearLocalMasterData();
             setProducts([]);
             
             // 2. Clear Remote
             await clearRemoteMasterData();
             
             alert('ล้างข้อมูลเรียบร้อยแล้ว');
          } catch (e: any) {
             alert(`เกิดข้อผิดพลาดในการล้างข้อมูลบน Cloud: ${e.message}`);
             // Still clear local to be responsive
             setProducts([]);
          } finally {
             setIsClearing(false);
          }
      }
  };

  const handleExportExcel = async () => {
      const success = await exportMasterData();
      if (!success) alert('ไม่มีข้อมูลให้ส่งออก');
  };

  // --- Individual CRUD ---

  const handleDelete = (barcode: string) => {
    setDeleteId(barcode);
  };

  const confirmDelete = async () => {
    if (deleteId) {
        // Offline First logic: Delete local first
        const updated = products.filter(p => p.barcode !== deleteId);
        setProducts(updated);
        await updateLocalMasterDataCache(updated);
        
        // Try deleting from cloud if possible, but don't block UI
        deleteProduct(deleteId).catch(e => console.warn("Cloud delete failed", e));
        
        setDeleteId(null);
    }
  };

  const handleEdit = (product: ProductMaster) => {
    setIsEditMode(true);
    setEditingProduct({ ...product }); 
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
    
    const newItem = editingProduct as ProductMaster;
    
    // Logic: Update local list -> Update Cache -> Try Cloud
    let newProducts = [...products];
    const index = newProducts.findIndex(p => p.barcode === newItem.barcode);
    if (index >= 0) {
        newProducts[index] = newItem;
    } else {
        newProducts.push(newItem);
    }
    setProducts(newProducts);
    
    // Async operations
    try {
        await updateLocalMasterDataCache(newProducts);
        // Try save to cloud
        saveProduct(newItem).catch(console.warn);
    } catch(e) {
        console.error("Save error", e);
    }
    
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
      <div className="bg-white dark:bg-gray-800 p-6 -mx-4 md:mx-0 md:rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h1 className="text-3xl font-display font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Box className="text-pastel-blueDark" />
                    คลังสินค้า (Scrap Crossborder)
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                    จัดการข้อมูลด้วยไฟล์ Excel (Import -> Validate -> Save to Cloud)
                </p>
            </div>
             <button 
                onClick={handleCreate}
                className="self-end md:self-auto flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-xl text-sm font-bold transition-all"
            >
                <Plus size={16} /> เพิ่มรายการเดียว
            </button>
        </div>

        {/* Workflow Action Bar */}
        <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-100 dark:border-gray-700">
            
            {/* Step 1: Import */}
            <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-pastel-blueDark text-white text-xs font-bold">1</span>
                <label className={`
                    flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-pastel-green text-green-700 dark:text-green-400 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-all shadow-sm active:scale-95 hover:bg-green-50 dark:hover:bg-green-900/20
                    ${isImporting ? 'opacity-75 cursor-not-allowed' : ''}
                `}>
                    {isImporting ? <Loader2 size={18} className="animate-spin"/> : <FileSpreadsheet size={18} />}
                    <span>อัปโหลด Excel</span>
                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} disabled={isImporting} />
                </label>
            </div>

            <div className="h-8 w-px bg-gray-300 dark:bg-gray-600 hidden md:block" />

            {/* Step 2: Save to Cloud */}
            <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-400 text-white text-xs font-bold">2</span>
                 <button 
                    onClick={handleSyncToCloud}
                    disabled={isSyncing || products.length === 0}
                    className="flex items-center justify-center gap-2 bg-pastel-blueDark text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md shadow-blue-500/20 active:scale-95 hover:bg-sky-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                    {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <CloudUpload size={18} />}
                    <span>บันทึกขึ้น Cloud</span>
                </button>
            </div>

            <div className="flex-1" />

            {/* Utility Buttons */}
            <div className="flex gap-2">
                 <button 
                    onClick={handleExportExcel}
                    disabled={products.length === 0}
                    className="flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2.5 rounded-xl text-xs font-bold transition-all hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                    title="Export to Excel"
                >
                    <FileDown size={16} /> Export
                </button>
                <button 
                    onClick={handleClearAll}
                    disabled={products.length === 0 || isClearing}
                    className="flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-3 py-2.5 rounded-xl text-xs font-bold transition-all hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                    title="Clear All Data"
                >
                    {isClearing ? <Loader2 size={16} className="animate-spin"/> : <Trash2 size={16} />} 
                    Clear All
                </button>
            </div>
        </div>

        {/* Search */}
        <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input 
                type="text" 
                placeholder="ค้นหาในรายการที่อัปโหลด..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-pastel-blue focus:outline-none dark:text-white shadow-inner"
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
                <FileSpreadsheet size={64} className="text-pastel-greenDark opacity-50" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">ยังไม่มีข้อมูลสินค้า</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto">
                เริ่มต้นใช้งานโดยการอัปโหลดไฟล์ Excel เพื่อเตรียมข้อมูลเข้าสู่ระบบ
            </p>
             <label className="flex items-center gap-2 bg-pastel-blueDark hover:bg-sky-800 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95 cursor-pointer">
                <Upload size={20} />
                <span>เลือกไฟล์ Excel</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} disabled={isImporting} />
            </label>
        </div>
      ) : (
        // Desktop Table View
        <div className="hidden md:block bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
             <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-800/30 flex justify-between items-center px-6">
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Preview Data ({filtered.length} items)</span>
                <span className="text-[10px] text-gray-400">Local Session Data</span>
             </div>
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
