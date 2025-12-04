
import React, { useState, useRef, useEffect } from 'react';
import { getProductByBarcode, saveQCRecord, compressImage } from '../services/db';
import { ProductMaster, QCStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { Scan, Camera, X, Check, AlertCircle, Package, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, ZoomIn, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const QCScreen: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [barcode, setBarcode] = useState('');
  const [product, setProduct] = useState<ProductMaster | null>(null);
  const [step, setStep] = useState<'scan' | 'form'>('scan');
  
  // Form State
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [status, setStatus] = useState<QCStatus>(QCStatus.PASS);
  const [reason, setReason] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [errors, setErrors] = useState<{[key:string]: string}>({});
  
  // New Features State
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus logic for Reason when required
  useEffect(() => {
    if (step === 'form') {
        const price = parseFloat(sellingPrice);
        const needsReason = status === QCStatus.DAMAGE || (price === 0 && sellingPrice !== '');
        
        if (needsReason && reasonRef.current) {
            setTimeout(() => reasonRef.current?.focus(), 100);
        }
    }
  }, [status, sellingPrice, step]);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const found = getProductByBarcode(barcode);
    if (found) {
      setProduct(found);
      setSellingPrice(''); 
      setStatus(QCStatus.PASS);
      setReason('');
      setImages([]);
      setErrors({});
      setStep('form');
    } else {
      setErrors({ scan: 'ไม่พบสินค้าในระบบ' });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newImages = [...images];
      for (let i = 0; i < e.target.files.length; i++) {
        if (newImages.length >= 5) break;
        const base64 = await compressImage(e.target.files[i]);
        newImages.push(base64);
      }
      setImages(newImages);
      if (newImages.length > 0) {
          setErrors(prev => ({...prev, images: ''}));
      }
    }
  };

  const moveImage = (index: number, direction: 'left' | 'right') => {
    const newImages = [...images];
    if (direction === 'left' && index > 0) {
      [newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]];
    } else if (direction === 'right' && index < newImages.length - 1) {
      [newImages[index + 1], newImages[index]] = [newImages[index], newImages[index + 1]];
    }
    setImages(newImages);
  };

  const validate = () => {
    const newErrors: any = {};
    const price = parseFloat(sellingPrice);

    if (isNaN(price)) {
        newErrors.price = 'กรุณาระบุราคาขายให้ถูกต้อง';
    } else if (price < 0) {
        newErrors.price = 'ราคาขายต้องไม่ติดลบ';
    }

    if (status === QCStatus.DAMAGE) {
      if (!reason.trim()) newErrors.reason = 'กรุณาระบุสาเหตุสำหรับสินค้าชำรุด';
      if (images.length === 0) newErrors.images = 'กรุณาอัปโหลดรูปภาพอย่างน้อย 1 รูปสำหรับสินค้าชำรุด';
    }

    if (price === 0) {
      if (!reason.trim()) newErrors.reason = 'กรุณาระบุสาเหตุที่ราคาขายเป็น 0';
      if (images.length === 0) newErrors.images = 'กรุณาอัปโหลดรูปภาพอย่างน้อย 1 รูปที่ราคาขายเป็น 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!product || !user) return;
    if (validate()) {
      saveQCRecord({
        barcode: product.barcode,
        productName: product.productName,
        costPrice: product.costPrice,
        sellingPrice: parseFloat(sellingPrice) || 0,
        status,
        reason,
        imageUrls: images,
        inspectorId: user.username
      });
      setStep('scan');
      setBarcode('');
      setProduct(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const isCriticalCondition = status === QCStatus.DAMAGE || (parseFloat(sellingPrice) === 0 && sellingPrice !== '');

  return (
    <div className="max-w-2xl mx-auto pb-24 md:pb-0">
      {step === 'scan' ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-fade-in">
          <div className="p-6 bg-pastel-blue rounded-full">
            <Scan size={64} className="text-pastel-blueDark" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">สแกนสินค้า</h2>
            <p className="text-gray-500">ยิงบาร์โค้ด หรือ พิมพ์รหัสสินค้า</p>
          </div>
          
          <form onSubmit={handleScan} className="w-full max-w-md relative">
            <input
              ref={inputRef}
              type="text"
              autoFocus
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="รหัสสินค้า..."
              className="w-full pl-6 pr-4 py-4 text-lg rounded-2xl bg-white dark:bg-gray-800 shadow-xl border-2 border-transparent focus:border-pastel-blueDark focus:ring-0 transition-all dark:text-white"
            />
            <button type="submit" className="absolute right-2 top-2 bottom-2 bg-pastel-blueDark text-white px-6 rounded-xl font-medium shadow-md">
              ตกลง
            </button>
            {errors.scan && <p className="text-red-500 mt-2 text-center bg-red-50 p-2 rounded">{errors.scan}</p>}
          </form>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl overflow-hidden animate-slide-up border border-gray-100 dark:border-gray-700">
           {/* Header */}
           <div className="bg-gray-50 dark:bg-gray-700/50 p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex justify-between items-start mb-2">
                 <h2 className="text-xl font-bold text-gray-800 dark:text-white flex-1 pr-2">{product?.productName}</h2>
                 <span className="text-xs text-gray-500 font-mono bg-white dark:bg-gray-600 px-2 py-1 rounded border border-gray-200 dark:border-gray-500">{product?.barcode}</span>
              </div>
              <div className="flex gap-4 text-sm mt-2">
                 <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg text-blue-700 dark:text-blue-300">
                    <Package size={14} />
                    <span className="font-semibold">คงเหลือ: {product?.stock || 0}</span>
                 </div>
                 <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-500 dark:text-gray-400">
                    <span>ต้นทุน:</span>
                    <span className="font-semibold">฿{product?.costPrice}</span>
                 </div>
              </div>
           </div>

           <div className="p-6 space-y-6">
              {/* Selling Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ราคาขาย (บาท)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className={`w-full p-4 text-2xl font-bold bg-gray-50 dark:bg-gray-900 border-2 ${errors.price ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'} rounded-2xl focus:ring-4 focus:ring-pastel-blue/20 focus:border-pastel-blueDark focus:outline-none dark:text-white transition-all`}
                  placeholder="0.00"
                />
                {errors.price && <p className="text-red-500 text-xs mt-1 font-medium bg-red-50 inline-block px-2 py-0.5 rounded">{errors.price}</p>}
              </div>

              {/* Status Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">สถานะการตรวจสอบ</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setStatus(QCStatus.PASS)}
                    className={`flex flex-col items-center justify-center gap-1 p-4 rounded-2xl border-2 transition-all duration-200 ${
                      status === QCStatus.PASS 
                      ? 'border-green-500 bg-green-50 text-green-700 shadow-md transform scale-[1.02]' 
                      : 'border-gray-100 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <CheckCircle2 size={32} className={status === QCStatus.PASS ? "text-green-500" : "text-gray-300"} /> 
                    <span className="font-bold">ผ่าน (Pass)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus(QCStatus.DAMAGE)}
                    className={`flex flex-col items-center justify-center gap-1 p-4 rounded-2xl border-2 transition-all duration-200 ${
                      status === QCStatus.DAMAGE 
                      ? 'border-red-500 bg-red-50 text-red-700 shadow-md transform scale-[1.02]' 
                      : 'border-gray-100 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <AlertTriangle size={32} className={status === QCStatus.DAMAGE ? "text-red-500" : "text-gray-300"} /> 
                    <span className="font-bold">ชำรุด (Damage)</span>
                  </button>
                </div>
              </div>

              {/* Reason & Photos Section with Enhanced Visuals */}
              <div className={`space-y-5 animate-fade-in p-5 rounded-2xl border-2 transition-all duration-300 ${isCriticalCondition ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/50' : 'bg-gray-50 dark:bg-gray-700/30 border-transparent'}`}>
                  {isCriticalCondition && (
                      <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 text-sm font-bold mb-2">
                          <AlertCircle size={16} />
                          <span>จำเป็นต้องระบุข้อมูลเพิ่มเติม</span>
                      </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                       หมายเหตุ / สาเหตุ {isCriticalCondition && <span className="text-red-500">*</span>}
                    </label>
                    <textarea
                      ref={reasonRef}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className={`w-full p-3 rounded-xl border ${errors.reason ? 'border-red-500 ring-2 ring-red-100' : 'border-gray-200 dark:border-gray-600'} bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pastel-purple`}
                      rows={3}
                      placeholder={isCriticalCondition ? "ระบุสาเหตุความเสียหาย..." : "เพิ่มบันทึกช่วยจำ (ไม่บังคับ)..."}
                    />
                     {errors.reason && <p className="text-red-500 text-xs mt-1 font-medium">{errors.reason}</p>}
                  </div>

                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                       รูปภาพประกอบ (สูงสุด 5 รูป) {isCriticalCondition && <span className="text-red-500">*</span>}
                    </label>
                    
                    <div className="flex flex-wrap gap-3">
                      {/* Prominent Upload Button */}
                      {images.length < 5 && (
                        <label className={`
                            relative flex flex-col items-center justify-center w-28 h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all bg-white dark:bg-gray-800
                            ${isCriticalCondition && images.length === 0 
                                ? 'border-orange-400 bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 shadow-sm animate-pulse' 
                                : 'border-gray-300 hover:border-pastel-blue dark:border-gray-600 dark:hover:bg-gray-700'}
                            ${errors.images ? 'border-red-400 bg-red-50' : ''}
                        `}>
                           <Camera size={24} className={isCriticalCondition && images.length === 0 ? "text-orange-500" : "text-gray-400"} />
                           <span className={`text-[10px] mt-1 font-medium ${isCriticalCondition && images.length === 0 ? "text-orange-600" : "text-gray-400"}`}>เพิ่มรูป</span>
                           <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                        </label>
                      )}

                      {images.map((img, idx) => (
                        <div key={idx} className="relative w-28 h-28 rounded-xl overflow-hidden border border-gray-200 shadow-sm group bg-gray-100">
                          <img 
                            src={img} 
                            alt="preview" 
                            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" 
                            onClick={() => setPreviewImage(img)}
                          />
                          
                          {/* Controls Overlay */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1">
                              <div className="flex justify-between">
                                  <button onClick={(e) => { e.stopPropagation(); moveImage(idx, 'left'); }} disabled={idx === 0} className="p-1 text-white hover:bg-white/20 rounded disabled:opacity-30">
                                      <ArrowLeft size={14} />
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); setImages(images.filter((_, i) => i !== idx)); }} className="p-1 bg-red-500 text-white rounded hover:bg-red-600">
                                      <X size={14} />
                                  </button>
                              </div>
                              <div className="flex justify-between items-center">
                                  <button onClick={(e) => { e.stopPropagation(); moveImage(idx, 'right'); }} disabled={idx === images.length - 1} className="p-1 text-white hover:bg-white/20 rounded disabled:opacity-30">
                                      <ArrowRight size={14} />
                                  </button>
                                  <div className="bg-black/50 rounded-full p-1 cursor-pointer pointer-events-none">
                                      <Eye size={12} className="text-white" />
                                  </div>
                              </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {errors.images && <p className="text-red-500 text-xs mt-1 font-medium">{errors.images}</p>}
                  </div>
              </div>

              {/* Actions - High Visibility */}
              <div className="pt-2 flex gap-4">
                 <button 
                   onClick={() => setStep('scan')}
                   className="flex-1 py-4 rounded-2xl border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                 >
                   ยกเลิก (Cancel)
                 </button>
                 <button 
                   onClick={handleSubmit}
                   className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-pastel-blueDark to-blue-600 text-white font-bold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:scale-[1.02] transition-all active:scale-95"
                 >
                   บันทึกผล (Save Record)
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
            <div className="relative max-w-4xl w-full max-h-screen">
                <button 
                    onClick={() => setPreviewImage(null)}
                    className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
                >
                    <X size={32} />
                </button>
                <img src={previewImage} alt="Full size" className="w-full h-auto max-h-[85vh] object-contain rounded-lg shadow-2xl" />
            </div>
        </div>
      )}
    </div>
  );
};
