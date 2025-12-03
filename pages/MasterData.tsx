
import React, { useState, useEffect } from 'react';
import { getMasterData, importMasterData, deleteProduct, saveProduct, seedMasterData, compressImage } from '../services/db';
import { ProductMaster } from '../types';
import { Upload, Trash2, Search, Plus, Edit2, X, Loader2, Database, Package, Sparkles, Box, Camera, ImageIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const MasterData: React.FC = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<ProductMaster>>({});

  useEffect(() => {
    // Simulate slight loading for effect
    setTimeout(() => {
        loadData();
        setIsLoading(false);
    }, 300);
  }, []);

  const loadData = () => {
    setProducts(getMasterData());
  };

  const handleSeed = () => {
    if (products.length > 0 && !confirm('ข้อมูลเดิมจะถูกลบและแทนที่ด้วยข้อมูลตัวอย่าง 20 รายการ ยืนยันหรือไม่?')) {
        return;
    }
    setIsLoading(true);
    setTimeout(() => {
        seedMasterData();
        loadData();
        setIsLoading(false);
    }, 600);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsImporting(true);
      try {
        const count = await importMasterData(e.target.files[0]);
        // Small delay for UI feedback
        setTimeout(() => {
            loadData();
            setIsImporting(false);
            alert(`✨ นำเข้าข้อมูลสำเร็จ ${count} รายการ!`);
        }, 800);
      } catch (err) {
        setIsImporting(false);
        alert('เกิดข้อผิดพลาด กรุณาตรวจสอบไฟล์ .xlsx');
        console.error(err);
      }
    }
  };

  const handleDelete = (barcode: string) => {
    if (confirm('ยืนยันการลบสินค้านี้?')) {
      deleteProduct(barcode);
      loadData();
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

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const base64 = await compressImage(e.target.files[0]);
        setEditingProduct({ ...editingProduct, image: base64 });
    }
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct.barcode || !editingProduct.productName) {
        alert('กรุณาระบุบาร์โค้ดและชื่อสินค้า');
        return;
    }
    saveProduct({
        barcode: editingProduct.barcode,
        productName: editingProduct.productName,
        costPrice: Number(editingProduct.costPrice) || 0,
        stock: Number(editingProduct.stock) || 0,
        image: editingProduct.image
    });
    setShowModal(false);
    loadData();
  };

  const filtered = products.filter(p => 
    p.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.barcode.includes(searchTerm)
  );

  return (
    <div className="space-y-6 pb-24 md:pb-0 animate-fade-in relative">
      {/* Header Section */}
      <div className="flex flex-col gap-4 bg-gradient-to-r from-pastel-blue to-white dark:from-gray-800 dark:to-gray-900 p-6 -mx-4 md:-mx-8 md:rounded-b-3xl shadow-sm border-b border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-start">
            <div>
            <h1 className="text-3xl font-display font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <Box className="text-pastel-blueDark" />
                คลังสินค้า (Inventory)
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
            <button 
                onClick={handleSeed}
                className="flex-shrink-0 flex items-center justify-center gap-2 bg-white dark:bg-gray-700 border border-pastel-purple/50 text-pastel-purpleDark dark:text-purple-300 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm active:scale-95"
            >
                <Sparkles size={16} />
                สร้างข้อมูลตัวอย่าง
            </button>

            <label className={`flex-shrink-0 flex items-center justify-center gap-2 bg-white dark:bg-gray-700 border border-pastel-green/50 text-green-700 dark:text-green-300 px-4 py-2 rounded-xl text-sm font-medium cursor-pointer transition-all shadow-sm active:scale-95 ${isImporting ? 'opacity-75 cursor-not-allowed' : ''}`}>
                {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                <span>{isImporting ? 'กำลังนำเข้า...' : 'นำเข้า Excel'}</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} disabled={isImporting} />
            </label>
        </div>

        {/* Search */}
        <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input 
                type="text" 
                placeholder="ค้นหา ชื่อสินค้า หรือ บาร์โค้ด..." 
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
                {searchTerm ? 'ลองเปลี่ยนคำค้นหา' : 'เริ่มต้นโดยการเพิ่มสินค้าใหม่ หรือ สร้างข้อมูลตัวอย่าง'}
            </p>
            {!searchTerm && (
                <button 
                    onClick={handleSeed} 
                    className="flex items-center gap-2 bg-gradient-to-r from-pastel-purple to-pastel-blue text-pastel-blueDark font-bold px-8 py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1"
                >
                    <Sparkles size={20} />
                    สร้างสินค้าตัวอย่าง 20 รายการ
                </button>
            )}
        </div>
      ) : (
        // Desktop Table View
        <div className="hidden md:block bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-sm">
                    <tr>
                        <th className="p-4 pl-6 font-medium">รูปภาพ</th>
                        <th className="p-4 font-medium">บาร์โค้ด</th>
                        <th className="p-4 font-medium">ชื่อสินค้า</th>
                        <th className="p-4 font-medium">คงเหลือ</th>
                        <th className="p-4 font-medium">ต้นทุน</th>
                        <th className="p-4 font-medium text-right pr-6">จัดการ</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filtered.map(product => (
                        <tr key={product.barcode} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                            <td className="p-4 pl-6">
                                <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden border border-gray-200 dark:border-gray-600 flex items-center justify-center">
                                    {product.image ? (
                                        <img src={product.image} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <Package size={20} className="text-gray-400" />
                                    )}
                                </div>
                            </td>
                            <td className="p-4 font-mono text-gray-600 dark:text-gray-300">{product.barcode}</td>
                            <td className="p-4 font-bold text-gray-800 dark:text-white">{product.productName}</td>
                            <td className="p-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${product.stock && product.stock < 10 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                    {product.stock || 0}
                                </span>
                            </td>
                            <td className="p-4 font-medium text-gray-600 dark:text-gray-300">฿{product.costPrice.toFixed(2)}</td>
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

      {/* Mobile Grid View (Only visible on small screens) */}
      <div className="md:hidden grid grid-cols-1 gap-4">
        {filtered.map((product) => (
             <div 
                key={product.barcode} 
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 flex gap-4"
             >
                <div className="w-20 h-20 flex-shrink-0 bg-gray-50 dark:bg-gray-700 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-600 flex items-center justify-center">
                    {product.image ? (
                        <img src={product.image} alt={product.productName} className="w-full h-full object-cover" />
                    ) : (
                        <Package className="text-gray-300 dark:text-gray-500" size={32} />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <span className="text-xs font-mono text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{product.barcode}</span>
                        <div className="flex gap-2">
                             <button onClick={() => handleEdit(product)} className="text-blue-500"><Edit2 size={16} /></button>
                             <button onClick={() => handleDelete(product.barcode)} className="text-red-500"><Trash2 size={16} /></button>
                        </div>
                    </div>
                    <h3 className="font-bold text-gray-800 dark:text-white mt-1 mb-2 truncate">{product.productName}</h3>
                    <div className="flex justify-between items-center text-sm">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${product.stock && product.stock < 10 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                           คงเหลือ: {product.stock || 0}
                        </span>
                        <span className="font-bold text-gray-700 dark:text-gray-300">฿{product.costPrice.toFixed(2)}</span>
                    </div>
                </div>
             </div>
        ))}
      </div>

      {/* Modal */}
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
                    {/* Image Upload Area */}
                    <div className="flex justify-center">
                        <label className="relative cursor-pointer group">
                             <div className="w-32 h-32 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center overflow-hidden hover:border-pastel-blue transition-colors">
                                {editingProduct.image ? (
                                    <img src={editingProduct.image} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex flex-col items-center text-gray-400">
                                        <Camera size={24} className="mb-1" />
                                        <span className="text-xs">เพิ่มรูปภาพ</span>
                                    </div>
                                )}
                             </div>
                             <div className="absolute -bottom-2 -right-2 bg-pastel-blueDark text-white p-2 rounded-full shadow-md group-hover:scale-110 transition-transform">
                                <ImageIcon size={14} />
                             </div>
                             <input type="file" accept="image/*" className="hidden" onChange={handleProductImageUpload} />
                        </label>
                        {editingProduct.image && (
                            <button 
                                type="button"
                                onClick={() => setEditingProduct({...editingProduct, image: ''})}
                                className="absolute top-24 ml-24 bg-red-500 text-white p-1 rounded-full shadow-md hover:bg-red-600 transition-colors"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">บาร์โค้ด</label>
                        <input 
                            type="text" 
                            required
                            disabled={isEditMode}
                            value={editingProduct.barcode || ''}
                            onChange={e => setEditingProduct({...editingProduct, barcode: e.target.value})}
                            className={`w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blue focus:bg-white dark:focus:bg-gray-800 transition-all outline-none ${isEditMode ? 'opacity-60 cursor-not-allowed' : ''}`}
                            placeholder="สแกน หรือ พิมพ์..."
                        />
                    </div>
                    
                    <div className="space-y-1">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">ชื่อสินค้า</label>
                        <input 
                            type="text" 
                            required
                            value={editingProduct.productName || ''}
                            onChange={e => setEditingProduct({...editingProduct, productName: e.target.value})}
                            className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blue focus:bg-white dark:focus:bg-gray-800 transition-all outline-none"
                            placeholder="เช่น ปากกา, สมุด..."
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
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">คงเหลือ (Stock)</label>
                            <input 
                                type="number" 
                                min="0"
                                value={editingProduct.stock || ''}
                                onChange={e => setEditingProduct({...editingProduct, stock: Number(e.target.value)})}
                                className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-pastel-blue focus:bg-white dark:focus:bg-gray-800 transition-all outline-none font-mono"
                                placeholder="0"
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
    </div>
  );
};
