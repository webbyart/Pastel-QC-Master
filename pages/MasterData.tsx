
import React, { useState, useEffect } from 'react';
import { fetchMasterData, importMasterData, deleteProduct, saveProduct, bulkSaveProducts, clearLocalMasterData, exportMasterData, updateLocalMasterDataCache } from '../services/db';
import { ProductMaster } from '../types';
import { Trash2, Search, Plus, Edit2, X, Loader2, Box, FileDown, CloudUpload, FileSpreadsheet, AlertTriangle } from 'lucide-react';

export const MasterData: React.FC = () => {
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<ProductMaster>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { loadSessionData(); }, []);

  const loadSessionData = async () => {
    setIsLoading(true);
    try {
        const data = await fetchMasterData(false); 
        setProducts(data);
    } catch (e) {
        console.warn("Load failed", e);
    } finally { setIsLoading(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsImporting(true);
      try {
        const newProducts = await importMasterData(e.target.files[0]);
        setProducts(newProducts);
        // FIX: Persist imported data to IndexedDB immediately so it won't disappear on refresh/navigation
        await updateLocalMasterDataCache(newProducts);
        alert(`✅ นำเข้าข้อมูลสำเร็จ ${newProducts.length} รายการ!\nข้อมูลถูกบันทึกไว้ในเครื่องเรียบร้อยแล้ว`);
      } catch (err) { 
        alert('เกิดข้อผิดพลาดในการนำเข้าไฟล์ Excel'); 
      } finally { 
        setIsImporting(false); 
        e.target.value = ''; 
      }
    }
  };

  const handleSyncToCloud = async () => {
      if (products.length === 0) return;
      if (!confirm(`ต้องการส่งข้อมูลสินค้า ${products.length} รายการขึ้นฐานข้อมูล Cloud หรือไม่?`)) return;
      setIsSyncing(true);
      try {
          await bulkSaveProducts(products);
          alert('✅ บันทึกข้อมูลขึ้น Cloud สำเร็จ!');
      } catch (e: any) { 
          alert(`ไม่สามารถบันทึกข้อมูลได้: ${e.message}`); 
      } finally { 
          setIsSyncing(false); 
      }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct.barcode || !editingProduct.productName) return;
    const newItem = editingProduct as ProductMaster;
    const newProducts = [...products];
    const index = newProducts.findIndex(p => p.barcode === newItem.barcode);
    if (index >= 0) newProducts[index] = newItem; else newProducts.push(newItem);
    setProducts(newProducts);
    await updateLocalMasterDataCache(newProducts);
    saveProduct(newItem).catch(console.error);
    setShowModal(false);
  };

  const handleClearData = async () => {
    if (confirm("คุณต้องการลบข้อมูลคลังสินค้าทั้งหมดในเครื่องใช่หรือไม่?")) {
        await clearLocalMasterData();
        setProducts([]);
        alert("ล้างข้อมูลเรียบร้อย");
    }
  };

  const filtered = products.filter(p => 
    p.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.barcode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4 pb-24 md:pb-0 animate-fade-in relative min-h-screen">
      {/* Header Panel */}
      <div className="bg-white dark:bg-gray-800 p-6 -mx-4 md:mx-0 md:rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-5">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-xl md:text-2xl font-display font-bold text-gray-800 dark:text-white flex items-center gap-3">
                    <Box className="text-pastel-blueDark" size={28} />
                    คลังสินค้า
                </h1>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] ml-1">Inventory Management</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleClearData} 
                className="bg-red-50 dark:bg-red-900/20 p-3 rounded-2xl text-red-500 hover:scale-105 active:scale-95 transition-all"
                title="ล้างข้อมูลในเครื่อง"
              >
                <Trash2 size={20}/>
              </button>
              <button 
                onClick={() => { setIsEditMode(false); setEditingProduct({}); setShowModal(true); }} 
                className="bg-pastel-blue/50 dark:bg-gray-700 p-3 rounded-2xl text-pastel-blueDark dark:text-white hover:scale-105 active:scale-95 transition-all shadow-sm"
              >
                <Plus size={24}/>
              </button>
            </div>
        </div>

        {/* Dynamic Tool Bar */}
        <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-3xl border border-gray-100 dark:border-gray-800">
            <label className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-green-200 dark:border-green-900/30 text-green-700 dark:text-green-400 px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-tight cursor-pointer shadow-sm active:scale-95 transition-all hover:bg-green-50">
                {isImporting ? <Loader2 size={16} className="animate-spin"/> : <FileSpreadsheet size={16} />}
                <span>Import Excel</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} disabled={isImporting} />
            </label>
            <button 
              onClick={handleSyncToCloud} 
              disabled={isSyncing || products.length === 0} 
              className="flex items-center gap-2 bg-pastel-blueDark text-white px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-tight shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
                {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
                <span>Save to Cloud</span>
            </button>
            <div className="flex-1 hidden md:block" />
            <div className="flex gap-2">
                <button onClick={() => exportMasterData()} disabled={products.length === 0} className="p-2.5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-gray-500 hover:text-gray-800 transition-colors shadow-sm">
                  <FileDown size={18}/>
                </button>
            </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="ค้นหาบาร์โค้ด หรือชื่อสินค้า..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-11 pr-5 py-3.5 bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blueDark focus:bg-white rounded-[1.5rem] text-xs font-medium outline-none transition-all dark:text-white" 
            />
        </div>
      </div>

      {/* Main List Area */}
      {isLoading ? (
          <div className="flex flex-col items-center justify-center h-80 text-gray-400 space-y-4">
              <div className="relative">
                <Loader2 size={48} className="animate-spin text-pastel-blueDark" />
                <Box size={20} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-pastel-blue opacity-50" />
              </div>
              <p className="text-[10px] font-black tracking-[0.3em] uppercase animate-pulse">Synchronizing Inventory...</p>
          </div>
      ) : filtered.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-5 animate-fade-in">
              <div className="p-10 bg-gray-50 dark:bg-gray-800 rounded-full">
                  <FileSpreadsheet size={64} className="text-gray-300 dark:text-gray-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">ไม่พบข้อมูลสินค้า</h3>
                <p className="text-xs text-gray-400 max-w-xs mx-auto mt-1">ข้อมูลในเครื่องว่างเปล่า กรุณานำเข้าไฟล์ Excel</p>
              </div>
          </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left table-fixed">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-400 text-[10px] uppercase font-black tracking-widest border-b border-gray-100 dark:border-gray-700">
                        <tr>
                            <th className="p-4 pl-8 w-32 md:w-40">Barcode ID</th>
                            <th className="p-4">Product Name</th>
                            <th className="p-4 w-28 text-center">Cost/Price</th>
                            <th className="p-4 pr-8 w-20 text-right">Edit</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {filtered.map(product => (
                            <tr key={product.barcode} className="hover:bg-gray-50/80 dark:hover:bg-gray-900/30 transition-colors group">
                                <td className="p-3.5 pl-8">
                                    <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded tracking-tighter">
                                        {product.barcode}
                                    </span>
                                </td>
                                <td className="p-3.5">
                                    <p className="text-[11px] font-bold text-gray-800 dark:text-white truncate leading-tight group-hover:text-pastel-blueDark transition-colors" title={product.productName}>
                                        {product.productName}
                                    </p>
                                    <div className="flex gap-2 mt-0.5">
                                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">LOT: {product.lotNo || '-'}</span>
                                      <span className="text-[8px] font-black text-blue-400 uppercase tracking-tighter">{product.productType || 'STK'}</span>
                                    </div>
                                </td>
                                <td className="p-3.5 text-center">
                                    <div className="flex flex-col items-center">
                                        <span className="text-[8px] text-gray-400 font-bold">฿{product.costPrice?.toLocaleString()}</span>
                                        <span className="text-[11px] text-pastel-blueDark font-black">฿{product.unitPrice?.toLocaleString() || '0'}</span>
                                    </div>
                                </td>
                                <td className="p-3.5 pr-8 text-right">
                                    <div className="flex justify-end gap-3 opacity-60 md:opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-[-4px]">
                                        <button onClick={() => { setIsEditMode(true); setEditingProduct(product); setShowModal(true); }} className="text-blue-500 hover:scale-125 transition-transform"><Edit2 size={14}/></button>
                                        <button onClick={() => { setDeleteId(product.barcode); }} className="text-red-500 hover:scale-125 transition-transform"><Trash2 size={14}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-900/20 text-center border-t border-gray-100 dark:border-gray-800">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Showing {filtered.length} products (Local Data)</p>
            </div>
        </div>
      )}

      {/* Modern Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] w-full max-w-md shadow-2xl relative animate-slide-up overflow-hidden">
                <div className="bg-gradient-to-br from-pastel-blueDark to-blue-900 p-8 text-white">
                    <h2 className="text-xl font-display font-bold flex items-center gap-3">
                        {isEditMode ? <Edit2 size={24} /> : <Plus size={24} />} 
                        {isEditMode ? 'แก้ไขรายละเอียดสินค้า' : 'เพิ่มสินค้าใหม่'}
                    </h2>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mt-2">Inventory Management Form</p>
                </div>
                
                <form onSubmit={handleSaveProduct} className="p-8 space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-gray-400 ml-1">RMS Barcode ID</label>
                        <input 
                          type="text" required disabled={isEditMode} 
                          value={editingProduct.barcode || ''} 
                          onChange={e => setEditingProduct({...editingProduct, barcode: e.target.value})} 
                          className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blueDark text-sm font-mono transition-all outline-none" 
                          placeholder="SCAN OR TYPE BARCODE"
                        />
                    </div>
                    
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-gray-400 ml-1">Product Display Name</label>
                        <textarea 
                          required rows={3} 
                          value={editingProduct.productName || ''} 
                          onChange={e => setEditingProduct({...editingProduct, productName: e.target.value})} 
                          className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blueDark text-sm font-medium transition-all outline-none resize-none" 
                          placeholder="ชื่อสินค้าที่ต้องการให้แสดง..."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-gray-400 ml-1">Cost (฿)</label>
                            <input type="number" required step="0.01" value={editingProduct.costPrice || ''} onChange={e => setEditingProduct({...editingProduct, costPrice: Number(e.target.value)})} className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm font-bold" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-gray-400 ml-1">Sale Price (฿)</label>
                            <input type="number" step="0.01" value={editingProduct.unitPrice || ''} onChange={e => setEditingProduct({...editingProduct, unitPrice: Number(e.target.value)})} className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm font-bold text-pastel-blueDark" />
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-pastel-blueDark text-white font-bold py-5 rounded-[2rem] shadow-xl shadow-blue-500/20 active:scale-95 transition-all text-sm mt-3 uppercase tracking-widest">
                        {isEditMode ? 'อัปเดตข้อมูล' : 'สร้างรายการใหม่'}
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-fade-in">
             <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
             <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-10 shadow-2xl relative animate-slide-up max-w-sm w-full text-center">
                 <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle className="text-red-500" size={40} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">ยืนยันการลบ?</h3>
                 <p className="text-gray-500 text-xs mb-8 leading-relaxed">คุณแน่ใจหรือไม่ที่จะลบ <br/><span className="font-mono font-bold text-gray-700 dark:text-gray-200">{deleteId}</span></p>
                 <div className="flex gap-4">
                     <button onClick={() => setDeleteId(null)} className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 rounded-2xl font-bold text-xs text-gray-500 dark:text-gray-300">ยกเลิก</button>
                     <button onClick={() => {
                        const updated = products.filter(p => p.barcode !== deleteId);
                        setProducts(updated);
                        updateLocalMasterDataCache(updated);
                        deleteProduct(deleteId);
                        setDeleteId(null);
                     }} className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-bold text-xs shadow-lg shadow-red-500/20">ลบรายการ</button>
                 </div>
             </div>
          </div>
      )}
    </div>
  );
};
