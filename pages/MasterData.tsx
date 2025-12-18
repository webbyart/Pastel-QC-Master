
import React, { useState, useEffect } from 'react';
import { fetchMasterData, importMasterData, deleteProduct, saveProduct, bulkSaveProducts, clearLocalMasterData, exportMasterData, updateLocalMasterDataCache, getApiUrl } from '../services/db';
import { ProductMaster } from '../types';
import { Upload, Trash2, Search, Plus, Edit2, X, Loader2, Box, FileDown, CloudUpload, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const MasterData: React.FC = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);

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
        alert(`✅ นำเข้าข้อมูลสำเร็จ ${newProducts.length} รายการ!\nกรุณากด "บันทึกขึ้น Cloud" เพื่อยืนยัน`);
      } catch (err) { alert('เกิดข้อผิดพลาดในการนำเข้าไฟล์ Excel'); } 
      finally { setIsImporting(false); e.target.value = ''; }
    }
  };

  const handleSyncToCloud = async () => {
      if (products.length === 0) return;
      if (!confirm(`บันทึกสินค้า ${products.length} รายการลงฐานข้อมูล?`)) return;
      setIsSyncing(true);
      try {
          await bulkSaveProducts(products);
          alert('✅ บันทึกข้อมูลขึ้น Cloud สำเร็จ');
      } catch (e: any) { alert(`Error: ${e.message}`); } 
      finally { setIsSyncing(false); }
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

  const filtered = products.filter(p => 
    p.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.barcode.includes(searchTerm)
  );

  return (
    <div className="space-y-4 pb-24 md:pb-0 animate-fade-in relative min-h-screen">
      <div className="bg-white dark:bg-gray-800 p-5 -mx-4 md:mx-0 md:rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-4">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-xl md:text-2xl font-display font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Box className="text-pastel-blueDark" size={24} />
                    คลังสินค้า
                </h1>
                <p className="text-gray-400 text-[10px] md:text-xs font-bold uppercase tracking-tight">Manage Inventory</p>
            </div>
            <button onClick={() => { setIsEditMode(false); setEditingProduct({}); setShowModal(true); }} className="bg-gray-100 dark:bg-gray-700 p-2 rounded-xl text-gray-600 dark:text-gray-300"><Plus size={20}/></button>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-100 dark:border-gray-700">
            <label className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-pastel-green text-green-700 dark:text-green-400 px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer active:scale-95 transition-all">
                {isImporting ? <Loader2 size={14} className="animate-spin"/> : <FileSpreadsheet size={14} />}
                <span>Import Excel</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} disabled={isImporting} />
            </label>
            <button onClick={handleSyncToCloud} disabled={isSyncing || products.length === 0} className="flex items-center gap-2 bg-pastel-blueDark text-white px-3 py-1.5 rounded-xl text-[11px] font-bold active:scale-95 transition-all disabled:opacity-50">
                {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
                <span>Save to Cloud</span>
            </button>
            <div className="flex-1" />
            <button onClick={() => exportMasterData()} disabled={products.length === 0} className="p-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-gray-500"><FileDown size={14}/></button>
        </div>

        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="ค้นหาบาร์โค้ด หรือชื่อสินค้า..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs focus:ring-2 focus:ring-pastel-blueDark focus:outline-none dark:text-white" />
        </div>
      </div>

      {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Loader2 size={32} className="animate-spin text-pastel-blueDark mb-3" />
              <p className="text-[10px] font-bold tracking-widest uppercase">Fetching Data...</p>
          </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400 text-[10px] uppercase font-bold tracking-widest border-b border-gray-100 dark:border-gray-700">
                    <tr>
                        <th className="p-3 pl-6">ID / Barcode</th>
                        <th className="p-3">Product Name</th>
                        <th className="p-3">Cost / Sell</th>
                        <th className="p-3 text-right pr-6">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {filtered.map(product => (
                        <tr key={product.barcode} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                            <td className="p-2.5 pl-6"><span className="font-mono text-[11px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded">{product.barcode}</span></td>
                            <td className="p-2.5"><p className="text-xs font-bold text-gray-800 dark:text-white truncate max-w-[150px] md:max-w-xs">{product.productName}</p></td>
                            <td className="p-2.5">
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-gray-400">Cost: <span className="font-bold">฿{product.costPrice}</span></span>
                                    <span className="text-[11px] text-pastel-blueDark font-black">Sale: ฿{product.unitPrice || 0}</span>
                                </div>
                            </td>
                            <td className="p-2.5 text-right pr-6">
                                <div className="flex justify-end gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setIsEditMode(true); setEditingProduct(product); setShowModal(true); }} className="text-blue-500"><Edit2 size={12}/></button>
                                    <button onClick={() => { setDeleteId(product.barcode); }} className="text-red-500"><Trash2 size={12}/></button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      )}

      {/* Modal - Improved Typography */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm shadow-2xl relative animate-slide-up overflow-hidden">
                <div className="p-6 space-y-4">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        {isEditMode ? <Edit2 size={18} /> : <Plus size={18} />} {isEditMode ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}
                    </h2>
                    <form onSubmit={handleSaveProduct} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-gray-400">RMS ID / Barcode</label>
                            <input type="text" required disabled={isEditMode} value={editingProduct.barcode || ''} onChange={e => setEditingProduct({...editingProduct, barcode: e.target.value})} className="w-full p-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm font-mono focus:ring-2 focus:ring-pastel-blueDark" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-gray-400">Product Name</label>
                            <textarea required rows={2} value={editingProduct.productName || ''} onChange={e => setEditingProduct({...editingProduct, productName: e.target.value})} className="w-full p-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm focus:ring-2 focus:ring-pastel-blueDark resize-none" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-gray-400">ต้นทุน (฿)</label>
                                <input type="number" required step="0.01" value={editingProduct.costPrice || ''} onChange={e => setEditingProduct({...editingProduct, costPrice: Number(e.target.value)})} className="w-full p-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-gray-400">ราคาขาย (฿)</label>
                                <input type="number" step="0.01" value={editingProduct.unitPrice || ''} onChange={e => setEditingProduct({...editingProduct, unitPrice: Number(e.target.value)})} className="w-full p-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none text-sm" />
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-pastel-blueDark text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-all text-sm">ยืนยันบันทึกข้อมูล</button>
                    </form>
                </div>
            </div>
        </div>
      )}

      {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
             <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-2xl relative animate-slide-up max-w-sm w-full text-center">
                 <AlertTriangle className="text-red-500 mx-auto mb-4" size={40} />
                 <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">ยืนยันการลบ?</h3>
                 <p className="text-gray-500 text-xs mb-6">คุณต้องการลบสินค้ารหัส {deleteId} ออกจากระบบ?</p>
                 <div className="flex gap-3">
                     <button onClick={() => setDeleteId(null)} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-xs">ยกเลิก</button>
                     <button onClick={() => {
                        const updated = products.filter(p => p.barcode !== deleteId);
                        setProducts(updated);
                        updateLocalMasterDataCache(updated);
                        deleteProduct(deleteId);
                        setDeleteId(null);
                     }} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold text-xs">ลบทิ้ง</button>
                 </div>
             </div>
          </div>
      )}
    </div>
  );
};
