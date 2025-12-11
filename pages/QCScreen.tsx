
import React, { useState, useRef, useEffect } from 'react';
import { fetchMasterData, saveQCRecord, compressImage, getApiUrl } from '../services/db';
import { ProductMaster, QCStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { Scan, Camera, X, Check, AlertCircle, Package, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, ZoomIn, Eye, ChevronDown, QrCode, Link, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const REASON_OPTIONS = [
  "Unsaleable : ขายไม่ได้",
  "Unable to be used : ใช้งานไม่ได้",
  "Damage : ชำรุด เสียหาย",
  "Broken : แตก",
  "False advertising : สินค้าไม่ตรงปก",
  "Item defraud : สินค้าหลอกลวง",
  "Missing Accessories : อุปกรณ์ไม่ครบ",
  "Lost Product : ไม่มีสินค้า",
  "Other : ระบุเพิ่มเติม"
];

export const QCScreen: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [barcode, setBarcode] = useState('');
  const [product, setProduct] = useState<ProductMaster | null>(null);
  const [step, setStep] = useState<'scan' | 'form'>('scan');
  
  // Data Cache
  const [cachedProducts, setCachedProducts] = useState<ProductMaster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasApiUrl, setHasApiUrl] = useState(true);
  
  // Form State
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [status, setStatus] = useState<QCStatus>(QCStatus.PASS);
  const [reason, setReason] = useState(''); // Comment
  const [remark, setRemark] = useState(''); // New Remark
  const [isCustomReason, setIsCustomReason] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [errors, setErrors] = useState<{[key:string]: string}>({});
  
  // New Fields
  const [lotNo, setLotNo] = useState('');
  const [productType, setProductType] = useState('');
  const [rmsId, setRmsId] = useState('');
  const [unitPrice, setUnitPrice] = useState<string>(''); // Product unit price (MSRP)
  
  // New Features State
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const rmsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
        if (!getApiUrl()) {
            setHasApiUrl(false);
            setIsLoading(false);
            return;
        }
        
        // 1. Instant Cache Load
        const data = await fetchMasterData(false);
        setCachedProducts(data);
        setIsLoading(false);

        // 2. Background Refresh
        setIsRefreshing(true);
        try {
            const freshData = await fetchMasterData(true);
            setCachedProducts(freshData);
        } catch(e) {
            console.error(e);
        } finally {
            setIsRefreshing(false);
        }
    };
    init();
  }, []);

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
    const found = cachedProducts.find(p => p.barcode === barcode);
    if (found) {
      setProduct(found);
      setSellingPrice(''); 
      setStatus(QCStatus.PASS);
      setReason('');
      setRemark('');
      setIsCustomReason(false);
      setImages([]);
      
      // Auto-fill from Master Data
      setLotNo(found.lotNo || '');
      setProductType(found.productType || '');
      setRmsId(found.barcode); // Assuming Barcode IS the RMS ID
      setUnitPrice(found.unitPrice?.toString() || ''); 
      
      setErrors({});
      setStep('form');
    } else {
      setErrors({ scan: 'ไม่พบสินค้าในระบบ' });
    }
  };

  const handleStatusChange = (newStatus: QCStatus) => {
    setStatus(newStatus);
    setReason('');
    setIsCustomReason(false);
    setErrors({});
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
      if (!reason.trim()) newErrors.reason = 'กรุณาระบุ Comment (สาเหตุ) สำหรับสินค้าชำรุด';
      if (images.length === 0) newErrors.images = 'กรุณาอัปโหลดรูปภาพอย่างน้อย 1 รูปสำหรับสินค้าชำรุด';
    }

    if (price === 0) {
      if (!reason.trim()) newErrors.reason = 'กรุณาระบุ Comment (สาเหตุ) ที่ราคาขายเป็น 0';
      if (images.length === 0) newErrors.images = 'กรุณาอัปโหลดรูปภาพอย่างน้อย 1 รูปที่ราคาขายเป็น 0';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!product || !user) return;
    if (validate()) {
      setIsSaving(true);
      await saveQCRecord({
        barcode: product.barcode,
        productName: product.productName,
        costPrice: product.costPrice,
        sellingPrice: parseFloat(sellingPrice) || 0,
        status,
        reason, // Maps to Comment
        remark, // New Remark
        imageUrls: images,
        inspectorId: user.username,
        // New Fields
        lotNo,
        productType,
        rmsId,
        unitPrice: parseFloat(unitPrice) || 0
      });
      setIsSaving(false);
      setStep('scan');
      setBarcode('');
      setProduct(null);
      setIsCustomReason(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const triggerScan = () => {
      inputRef.current?.focus();
      setErrors({ scan: 'พร้อมสแกน (Ready)' });
      setTimeout(() => setErrors({}), 2000);
  };

  const isCriticalCondition = status === QCStatus.DAMAGE || (parseFloat(sellingPrice) === 0 && sellingPrice !== '');

  if (isLoading && cachedProducts.length === 0) {
      return <div className="flex justify-center items-center h-[60vh]"><Loader2 className="animate-spin text-pastel-blueDark" size={40} /></div>;
  }

  if (!hasApiUrl) {
    return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center p-6">
            <div className="bg-red-50 p-6 rounded-full mb-4">
                <Link size={48} className="text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">ยังไม่ได้เชื่อมต่อ Google Sheet</h2>
            <p className="text-gray-500 mb-6 max-w-md">ไปที่เมนู "ตั้งค่า" แล้วระบุ Web App URL</p>
            <button onClick={() => navigate('/settings')} className="bg-pastel-blueDark text-white px-6 py-3 rounded-xl font-bold shadow-lg">ไปที่ตั้งค่า</button>
        </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto pb-24 md:pb-0">
      {step === 'scan' ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-fade-in relative">
          
          {isRefreshing && (
             <div className="absolute top-0 right-0 p-2 bg-gray-100 rounded-full animate-pulse">
                <RefreshCw size={16} className="animate-spin text-gray-500"/>
             </div>
          )}

          <div className="p-6 bg-pastel-blue rounded-full">
            <Scan size={64} className="text-pastel-blueDark" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">สแกนสินค้า (RMS ID)</h2>
            <p className="text-gray-500">พร้อมใช้งาน ({cachedProducts.length} items)</p>
          </div>
          
          <form onSubmit={handleScan} className="w-full max-w-md relative">
            <div className="relative flex items-center">
                <input
                ref={inputRef}
                type="text"
                autoFocus
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="ระบุ RMS ID หรือ สแกน..."
                className="w-full pl-6 pr-14 py-4 text-lg rounded-2xl bg-white dark:bg-gray-800 shadow-xl border-2 border-transparent focus:border-pastel-blueDark focus:ring-0 transition-all dark:text-white"
                />
                
                {/* Scan Button Icon inside input area */}
                <button 
                    type="button" 
                    onClick={triggerScan}
                    className="absolute right-3 p-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-pastel-blue hover:text-pastel-blueDark transition-colors"
                >
                    <QrCode size={24} />
                </button>
            </div>

            <button type="submit" className="w-full mt-4 bg-pastel-blueDark text-white py-4 rounded-xl font-medium shadow-md hover:bg-sky-800 transition-colors">
              ตกลง (OK)
            </button>
            {errors.scan && <p className={`mt-2 text-center p-2 rounded ${errors.scan === 'พร้อมสแกน (Ready)' ? 'text-green-500 bg-green-50' : 'text-red-500 bg-red-50'}`}>{errors.scan}</p>}
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
                 {product?.productType && (
                    <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg text-blue-700 dark:text-blue-300">
                        <Package size={14} />
                        <span className="font-semibold">{product.productType}</span>
                    </div>
                 )}
                 <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-500 dark:text-gray-400">
                    <span>ต้นทุน:</span>
                    <span className="font-semibold">฿{product?.costPrice}</span>
                 </div>
              </div>
           </div>

           <div className="p-6 space-y-6">
              
              {/* Row 1: RMS ID & Lot No */}
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">RMS Return Item ID</label>
                    <input
                      ref={rmsRef}
                      type="text"
                      value={rmsId}
                      readOnly
                      className="w-full p-3 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-500 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Lot no.</label>
                    <input
                      type="text"
                      value={lotNo}
                      readOnly
                      className="w-full p-3 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-500 cursor-not-allowed"
                    />
                  </div>
              </div>

               {/* Row 2: Type & Unit Price */}
               <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Type</label>
                    <input
                      type="text"
                      value={productType}
                      readOnly
                       className="w-full p-3 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-500 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Product Unit Price</label>
                    <input
                      type="number"
                      value={unitPrice}
                      readOnly
                      className="w-full p-3 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-500 cursor-not-allowed"
                    />
                  </div>
              </div>

              {/* Status Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">สถานะการตรวจสอบ</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => handleStatusChange(QCStatus.PASS)}
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
                    onClick={() => handleStatusChange(QCStatus.DAMAGE)}
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

              {/* Selling Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ราคาขาย (Selling Price)</label>
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

              {/* Reason (Comment) & Photos Section */}
              <div className={`space-y-5 animate-fade-in p-5 rounded-2xl border-2 transition-all duration-300 ${isCriticalCondition ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/50' : 'bg-gray-50 dark:bg-gray-700/30 border-transparent'}`}>
                  {isCriticalCondition && (
                      <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 text-sm font-bold mb-2">
                          <AlertCircle size={16} />
                          <span>จำเป็นต้องระบุข้อมูลเพิ่มเติม</span>
                      </div>
                  )}

                  {/* Comment (Reason) Dropdown */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                       Comment (สาเหตุ) {isCriticalCondition && <span className="text-red-500">*</span>}
                    </label>

                    <div className="relative">
                        <select 
                            className={`w-full p-3 pr-10 rounded-xl border appearance-none ${errors.reason ? 'border-red-500 ring-2 ring-red-100' : 'border-gray-200 dark:border-gray-600'} bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pastel-purple`}
                            value={isCustomReason ? '__OTHER__' : reason}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === '__OTHER__') {
                                    setIsCustomReason(true);
                                    setReason('');
                                    setTimeout(() => reasonRef.current?.focus(), 100);
                                } else {
                                    setIsCustomReason(false);
                                    setReason(val);
                                }
                            }}
                        >
                            <option value="">-- เลือก Comment --</option>
                            {REASON_OPTIONS.map((opt) => (
                                <option key={opt} value={opt === "Other : ระบุเพิ่มเติม" ? "__OTHER__" : opt}>
                                    {opt}
                                </option>
                            ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <ChevronDown size={18} className="text-gray-500" />
                        </div>
                    </div>

                    {isCustomReason && (
                        <textarea
                            ref={reasonRef}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className={`w-full mt-2 p-3 rounded-xl border ${errors.reason ? 'border-red-500 ring-2 ring-red-100' : 'border-gray-200 dark:border-gray-600'} bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pastel-purple animate-fade-in`}
                            rows={2}
                            placeholder="ระบุสาเหตุเพิ่มเติม..."
                        />
                    )}
                    {errors.reason && <p className="text-red-500 text-xs mt-1 font-medium">{errors.reason}</p>}
                  </div>

                  {/* Remark Textarea */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                       Remark (หมายเหตุเพิ่มเติม)
                    </label>
                    <textarea
                      value={remark}
                      onChange={(e) => setRemark(e.target.value)}
                      className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pastel-purple"
                      rows={2}
                      placeholder="บันทึกช่วยจำ..."
                    />
                  </div>

                  {/* Photos */}
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
                   disabled={isSaving}
                   className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-pastel-blueDark to-blue-600 text-white font-bold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-50 flex justify-center items-center"
                 >
                   {isSaving ? <Loader2 className="animate-spin" /> : 'บันทึกผล (Save Record)'}
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
