
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
        const newProducts = await importMasterData(e.target.files[0]);
        if (newProducts.length === 0) {
            alert("⚠️ ไฟล์ไม่ถูกต้อง: ไม่พบข้อมูลสินค้า");
            setProducts([]);
        } else {
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
      if (!confirm(`ยืนยันการบันทึกสินค้า ${products.length} รายการไปยังฐานข้อมูล?\n\n(ข้อมูลจะถูก Upsert ตาม Barcode)`)) return;

      setIsSyncing(true);
      try {
          await bulkSaveProducts(products);
          alert('✅ บันทึกข้อมูลเรียบร้อยแล้ว');
      } catch (e: any) {
          alert(`เกิดข้อผิดพลาดในการบันทึก: ${e.message}`);
      } finally {
          setIsSyncing(false);
      }
  };

  const handleClearAll = async () => {
      const confirmed = confirm('⚠️ คำเตือน: ลบข้อมูลสินค้าทั้งหมดในหน้านี้ (Local Cache)?');
      if (confirmed) {
          setIsClearing(true);
          try {
             await clearLocalMasterData();
             setProducts([]);
             alert('ล้างข้อมูลเรียบร้อยแล้ว');
          } catch (e: any) {
             alert(`เกิดข้อผิดพลาด: ${e.message}`);
          } finally {
             setIsClearing(false);
          }
      }
  };

  const handleExportExcel = async () => {
      const success = await exportMasterData();
      if (!success) alert('ไม่มีข้อมูลให้ส่งออก');
  };

  const handleDelete = (barcode: string) => {
    setDeleteId(barcode);
  };

  const confirmDelete = async () => {
    if (deleteId) {
        const updated = products.filter(p => p.barcode !== deleteId);
        setProducts(updated);
        await updateLocalMasterDataCache(updated);
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
    let newProducts = [...products];
    const index = newProducts.findIndex(p => p.barcode === newItem.barcode);
    if (index >= 0) {
        newProducts[index] = newItem;
    } else {
        newProducts.push(newItem);
    }
    setProducts(newProducts);
    
    try {
        await updateLocalMasterDataCache(newProducts);
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
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">ยังไม่ได้เชื่อมต่อระบบ Cloud</h2>
              <p className="text-sm text-gray-500 mb-6 max-w-md">กรุณาไปที่เมนู "ตั้งค่า" เพื่อระบุรายละเอียด Supabase</p>
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
    <div className="space-y-4 pb-24 md:pb-0 animate-fade-in relative min-h-screen">
      
      {/* Header Section - Refined sizes */}
      <div className="bg-white dark:bg-gray-800 p-5 -mx-4 md:mx-0 md:rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
                <h1 className="text-xl md:text-2xl font-display font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Box className="text-pastel-blueDark" size={24} />
                    สินค้าในคลัง
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-[10px] md:text-xs mt-0.5 font-medium">
                    จัดการข้อมูลสินค้าด้วย Excel (Import &rarr; Validate &rarr; Save to Cloud)
                </p>
            </div>
             <button 
                onClick={handleCreate}
                className="self-end md:self-auto flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-xl text-xs font-bold transition-all"
            >
                <Plus size={14} /> เพิ่มรายการเดียว
            </button>
        </div>

        {/* Action Bar - Refined */}
        <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-pastel-blueDark text-white text-[10px] font-bold">1</span>
                <label className={`
                    flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-pastel-green text-green-700 dark:text-green-400 px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer transition-all shadow-sm active:scale-95 hover:bg-green-50 dark:hover:bg-green-900/20
                    ${isImporting ? 'opacity-75 cursor-not-allowed' : ''}
                `}>
                    {isImporting ? <Loader2 size={14} className="animate-spin"/> : <FileSpreadsheet size={14} />}
                    <span>อัปโหลด Excel</span>
                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} disabled={isImporting} />
                </label>
            </div>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 hidden md:block" />
            <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-400 text-white text-[10px] font-bold">2</span>
                 <button 
                    onClick={handleSyncToCloud}
                    disabled={isSyncing || products.length === 0}
                    className="flex items-center justify-center gap-2 bg-pastel-blueDark text-white px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all shadow-md shadow-blue-500/20 active:scale-95 hover:bg-sky-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                    {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
                    <span>บันทึกขึ้น Cloud</span>
                </button>
            </div>
            <div className="flex-1" />
            <div className="flex gap-1">
                 <button 
                    onClick={handleExportExcel}
                    disabled={products.length === 0}
                    className="flex items-center justify-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-2 py-1.5 rounded-xl text-[10px] font-bold transition-all hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                    <FileDown size={12} /> Export
                </button>
                <button 
                    onClick={handleClearAll}
                    disabled={products.length === 0 || isClearing}
                    className="flex items-center justify-center gap-1 bg-white dark:bg-gray-800 border border-red-100 dark:border-red-900/30 text-red-500 dark:text-red-400 px-2 py-1.5 rounded-xl text-[10px] font-bold transition-all hover:bg-red-50 dark:hover:bg-red-900/10 disabled:opacity-50"
                >
                    {isClearing ? <Loader2 size={12} className="animate-spin"/> : <Trash2 size={12} />} 
                    Clear
                </button>
            </div>
        </div>

        {/* Search - Refined */}
        <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
            <input 
                type="text" 
                placeholder="ค้นหาบาร์โค้ด หรือชื่อสินค้า..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs focus:ring-2 focus:ring-pastel-blue focus:outline-none dark:text-white shadow-inner"
            />
        </div>
      </div>

      {/* Content Area - Compact Typography */}
      {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Loader2 size={32} className="animate-spin text-pastel-blueDark mb-3" />
              <p className="text-[10px] font-bold tracking-widest uppercase">Loading Inventory...</p>
          </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-slide-up">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-full shadow-lg mb-5 animate-bounce-soft">
                <FileSpreadsheet size={48} className="text-pastel-greenDark opacity-50" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1">ยังไม่มีข้อมูลสินค้า</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 max-w-xs mx-auto">
                เริ่มต้นใช้งานโดยการอัปโหลดไฟล์ Excel เพื่อเตรียมข้อมูลเข้าสู่ระบบ
            </p>
             <label className="flex items-center gap-2 bg-pastel-blueDark hover:bg-sky-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95 cursor-pointer">
                <Upload size={16} />
                <span>เลือกไฟล์ Excel</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} disabled={isImporting} />
            </label>
        </div>
      ) : (
        <div className="hidden md:block bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
             <div className="p-2 bg-blue-50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-800/30 flex justify-between items-center px-5">
                <span className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 tracking-wider">Preview ({filtered.length} items)</span>
             </div>
            <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400 text-[10px] uppercase font-bold tracking-widest border-b border-gray-100 dark:border-gray-700">
                    <tr>
                        <th className="p-3 pl-6">RMS ID / Barcode</th>
                        <th className="p-3">Lot / Type</th>
                        <th className="p-3">ชื่อสินค้า</th>
                        <th className="p-3">ราคาต้นทุน / ขาย</th>
                        <th className="p-3 text-right pr-6">จัดการ</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {filtered.map(product => (
                        <tr key={product.barcode} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                            <td className="p-2.5 pl-6">
                                <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded">{product.barcode}</span>
                            </td>
                            <td className="p-2.5">
                                <div className="flex flex-col">
                                    <span className="text-[11px] text-gray-600 dark:text-gray-300 font-bold">Lot: {product.lotNo || '-'}</span>
                                    <span className="text-[9px] text-gray-400 uppercase font-black tracking-tight">{product.productType || 'N/A'}</span>
                                </div>
                            </td>
                            <td className="p-2.5">
                                <p className="text-xs font-bold text-gray-800 dark:text-white line-clamp-1 max-w-xs">{product.productName}</p>
                            </td>
                            <td className="p-2.5">
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-500">ทุน: <span className="font-mono font-bold">฿{product.costPrice?.toLocaleString() || '0'}</span></span>
                                    <span className="text-[11px] text-pastel-blueDark font-black">ขาย: ฿{product.unitPrice?.toLocaleString() || '0'}</span>
                                </div>
                            </td>
                            <td className="p-2.5 text-right pr-6">
                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleEdit(product)} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
                                        <Edit2 size={12} />
                                    </button>
                                    <button onClick={() => handleDelete(product.barcode)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      )}

      {/* Mobile Grid View - Typography refinements */}
      <div className="md:hidden grid grid-cols-1 gap-2">
        {filtered.map((product) => (
             <div 
                key={product.barcode} 
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-3"
             >
                <div className="flex justify-between items-start mb-1.5">
                    <span className="text-[9px] font-black text-pastel-blueDark bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded tracking-tighter">ID: {product.barcode}</span>
                    <div className="flex gap-2">
                            <button onClick={() => handleEdit(product)} className="text-blue-500 p-1"><Edit2 size={12} /></button>
                            <button onClick={() => handleDelete(product.barcode)} className="text-red-500 p-1"><Trash2 size={12} /></button>
                    </div>
                </div>
                
                <h3 className="text-xs font-bold text-gray-800 dark:text-white mb-1.5 leading-tight line-clamp-2">{product.productName}</h3>
                
                <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[9px] bg-gray-50 dark:bg-gray-900 px-1.5 py-0.5 rounded text-gray-500 border border-gray-100 dark:border-gray-700 font-bold">L: {product.lotNo || '-'}</span>
                    <span className="text-[9px] bg-gray-50 dark:bg-gray-900 px-1.5 py-0.5 rounded text-gray-400 border border-gray-100 dark:border-gray-700 uppercase font-black">{product.productType || 'N/A'}</span>
                </div>
                <div className="flex justify-between mt-2 pt-1.5 border-t border-gray-50 dark:border-gray-700/50">
                    <div className="text-[10px] text-gray-400 font-medium">ทุน: <span className="font-mono text-gray-600 dark:text-gray-300 font-bold">฿{product.costPrice || '0'}</span></div>
                    <div className="text-[10px] text-gray-400 font-medium">ขาย: <span className="font-mono text-pastel-blueDark font-bold">฿{product.unitPrice || '0'}</span></div>
                </div>
             </div>
        ))}
      </div>

      {/* Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm shadow-2xl relative animate-slide-up overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-gradient-to-r from-pastel-blue/30 to-pastel-purple/30 p-5 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        {isEditMode ? <Edit2 size={18} /> : <Plus size={18} />}
                        {isEditMode ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}
                    </h2>
                    <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-white/50 rounded-full transition-colors">
                        <X size={18} className="text-gray-500" />
                    </button>
                </div>
                
                <form onSubmit={handleSaveProduct} className="p-5 space-y-4 overflow-y-auto no-scrollbar">
                    <div className="space-y-1">
                        <label className="text-[11px] font-black uppercase text-gray-400 ml-1 tracking-wider">RMS ID / Barcode</label>
                        <input 
                            type="text" 
                            required
                            disabled={isEditMode}
                            value={editingProduct.barcode || ''}
                            onChange={e => setEditingProduct({...editingProduct, barcode: e.target.value})}
                            className={`w-full p-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blue focus:bg-white dark:focus:bg-gray-800 transition-all outline-none text-sm font-mono ${isEditMode ? 'opacity-60' : ''}`}
                            placeholder="ระบุรหัสบาร์โค้ด..."
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                         <div className="space-y-1">
                            <label className="text-[11px] font-black uppercase text-gray-400 ml-1 tracking-wider">Lot No.</label>
                            <input 
                                type="text" 
                                value={editingProduct.lotNo || ''}
                                onChange={e => setEditingProduct({...editingProduct, lotNo: e.target.value})}
                                className="w-full p-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blue focus:bg-white dark:focus:bg-gray-800 transition-all outline-none text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-black uppercase text-gray-400 ml-1 tracking-wider">Type</label>
                            <input 
                                type="text" 
                                value={editingProduct.productType || ''}
                                onChange={e => setEditingProduct({...editingProduct, productType: e.target.value})}
                                className="w-full p-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blue focus:bg-white dark:focus:bg-gray-800 transition-all outline-none text-sm"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[11px] font-black uppercase text-gray-400 ml-1 tracking-wider">Product Name</label>
                        <textarea 
                            required
                            rows={2}
                            value={editingProduct.productName || ''}
                            onChange={e => setEditingProduct({...editingProduct, productName: e.target.value})}
                            className="w-full p-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blue focus:bg-white dark:focus:bg-gray-800 transition-all outline-none text-sm resize-none"
                            placeholder="ชื่อสินค้า..."
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[11px] font-black uppercase text-gray-400 ml-1 tracking-wider">ทุน (฿)</label>
                            <input 
                                type="number" 
                                required
                                min="0"
                                step="0.01"
                                value={editingProduct.costPrice || ''}
                                onChange={e => setEditingProduct({...editingProduct, costPrice: Number(e.target.value)})}
                                className="w-full p-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blue focus:bg-white dark:focus:bg-gray-800 transition-all outline-none font-mono text-sm"
                            />
                        </div>
                         <div className="space-y-1">
                            <label className="text-[11px] font-black uppercase text-gray-400 ml-1 tracking-wider">ราคาขาย (฿)</label>
                            <input 
                                type="number" 
                                min="0"
                                step="0.01"
                                value={editingProduct.unitPrice || ''}
                                onChange={e => setEditingProduct({...editingProduct, unitPrice: Number(e.target.value)})}
                                className="w-full p-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blue focus:bg-white dark:focus:bg-gray-800 transition-all outline-none font-mono text-sm"
                            />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        className="w-full bg-pastel-blueDark text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all mt-2 text-sm"
                    >
                        {isEditMode ? 'บันทึกการแก้ไข' : 'สร้างรายการสินค้า'}
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
                 <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                     <AlertTriangle className="text-red-500" size={24} />
                 </div>
                 <h3 className="text-md font-bold text-gray-800 dark:text-white mb-1.5">ลบสินค้านี้?</h3>
                 <p className="text-gray-500 dark:text-gray-400 text-xs mb-6">
                     คุณแน่ใจหรือไม่ที่จะลบรายการบาร์โค้ดนี้ออกจากระบบชั่วคราว
                 </p>
                 <div className="flex gap-3">
                     <button 
                         onClick={() => setDeleteId(null)}
                         className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-bold text-xs"
                     >
                         ยกเลิก
                     </button>
                     <button 
                         onClick={confirmDelete}
                         className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/30 text-xs"
                     >
                         ยืนยันการลบ
                     </button>
                 </div>
             </div>
          </div>
      )}
    </div>
  );
};
