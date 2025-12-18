
import React, { useState, useRef, useEffect } from 'react';
import { fetchMasterData, saveQCRecord, compressImage, getApiUrl } from '../services/db';
import { ProductMaster, QCStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { Scan, Camera, X, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, Eye, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Html5QrcodeScanner } from "html5-qrcode";

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
  
  const [cachedProducts, setCachedProducts] = useState<ProductMaster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  
  // Form States
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [status, setStatus] = useState<QCStatus>(QCStatus.PASS);
  const [reason, setReason] = useState('');
  const [remark, setRemark] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [isCustomReason, setIsCustomReason] = useState(false);
  const [errors, setErrors] = useState<{[key:string]: string}>({});

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
        try {
            const data = await fetchMasterData(false);
            setCachedProducts(data);
        } catch (e) { console.error(e); }
        finally { setIsLoading(false); }
    };
    init();
  }, []);

  const processBarcode = (code: string) => {
    const cleanCode = code.trim();
    const found = cachedProducts.find(p => p.barcode === cleanCode);
    if (found) {
      setProduct(found);
      setSellingPrice('');
      setStatus(QCStatus.PASS);
      setReason('');
      setImages([]);
      setStep('form');
    } else {
      setErrors({ scan: 'ไม่พบรหัสสินค้านี้ในระบบ' });
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
    }
  };

  const handleSubmit = async () => {
    if (!product || !user) return;
    const price = parseFloat(sellingPrice);
    
    // Validation
    const newErrors: any = {};
    if (isNaN(price)) newErrors.price = 'ระบุราคาขาย';
    if ((status === QCStatus.DAMAGE || price === 0) && !reason) newErrors.reason = 'ระบุสาเหตุ';
    if ((status === QCStatus.DAMAGE || price === 0) && images.length === 0) newErrors.images = 'แนบรูปหลักฐาน';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSaving(true);
    try {
        await saveQCRecord({
            barcode: product.barcode,
            productName: product.productName,
            costPrice: product.costPrice,
            sellingPrice: price,
            status,
            reason,
            remark,
            imageUrls: images,
            inspectorId: user.username,
            lotNo: product.lotNo,
            productType: product.productType,
            unitPrice: product.unitPrice,
            rmsId: product.barcode
        });
        setStep('scan');
        setBarcode('');
        setProduct(null);
    } catch (e) { alert("เกิดข้อผิดพลาดในการบันทึก"); }
    finally { setIsSaving(false); }
  };

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {step === 'scan' ? (
        <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 animate-fade-in">
          <div className="p-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full shadow-2xl shadow-blue-500/40 text-white animate-bounce-soft">
            <Scan size={64} />
          </div>
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-800 dark:text-white">พร้อมตรวจสอบสินค้า</h2>
            <p className="text-gray-500">สแกนบาร์โค้ด หรือกรอก RMS ID</p>
          </div>
          
          <div className="w-full max-w-md relative px-4">
            <input
              ref={inputRef}
              type="text" autoFocus value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && processBarcode(barcode)}
              placeholder="กรอก RMS ID..."
              className="w-full pl-6 pr-14 py-5 text-xl rounded-2xl bg-white dark:bg-gray-800 shadow-xl border-none focus:ring-4 focus:ring-blue-500/20 transition-all"
            />
            <button onClick={() => setShowScanner(true)} className="absolute right-7 top-1/2 -translate-y-1/2 text-blue-500 p-2 hover:bg-blue-50 rounded-xl"><Camera size={24} /></button>
            {errors.scan && <p className="text-red-500 text-center mt-3 bg-red-50 p-2 rounded-lg text-sm">{errors.scan}</p>}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl overflow-hidden animate-slide-up border border-gray-100 dark:border-gray-700">
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-8 text-white">
              <div className="flex justify-between items-start mb-4">
                  <h2 className="text-2xl font-bold leading-tight">{product?.productName}</h2>
                  <button onClick={() => setStep('scan')} className="p-2 bg-white/10 rounded-full"><X size={20}/></button>
              </div>
              <div className="flex flex-wrap gap-3">
                  <span className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-lg text-xs font-bold border border-blue-500/30">RMS: {product?.barcode}</span>
                  <span className="bg-purple-500/20 text-purple-300 px-3 py-1 rounded-lg text-xs font-bold border border-purple-500/30">Fuse Lot: {product?.lotNo}</span>
              </div>
          </div>

          <div className="p-8 space-y-8">
              {/* Status Section */}
              <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => setStatus(QCStatus.PASS)} className={`p-6 rounded-3xl border-2 flex flex-col items-center gap-2 transition-all ${status === QCStatus.PASS ? 'border-green-500 bg-green-50 text-green-700 shadow-lg shadow-green-500/10' : 'border-gray-100 dark:border-gray-700 grayscale opacity-40'}`}>
                      <CheckCircle2 size={40} />
                      <span className="font-bold">ผ่าน (Pass)</span>
                  </button>
                  <button onClick={() => setStatus(QCStatus.DAMAGE)} className={`p-6 rounded-3xl border-2 flex flex-col items-center gap-2 transition-all ${status === QCStatus.DAMAGE ? 'border-red-500 bg-red-50 text-red-700 shadow-lg shadow-red-500/10' : 'border-gray-100 dark:border-gray-700 grayscale opacity-40'}`}>
                      <AlertTriangle size={40} />
                      <span className="font-bold">ชำรุด (Damage)</span>
                  </button>
              </div>

              {/* Price Input */}
              <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-500 dark:text-gray-400 ml-1">ราคาขาย (Sale Price) <span className="text-red-500">*</span></label>
                  <div className="relative">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-300">฿</span>
                      <input 
                        type="number" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)}
                        className={`w-full pl-12 pr-6 py-6 bg-gray-50 dark:bg-gray-900 rounded-3xl text-3xl font-bold outline-none border-2 transition-all ${errors.price ? 'border-red-300' : 'border-transparent focus:border-blue-500'}`}
                        placeholder="0.00"
                      />
                  </div>
              </div>

              {/* Advanced Fields for Damage/Zero Price */}
              {(status === QCStatus.DAMAGE || parseFloat(sellingPrice) === 0) && (
                  <div className="space-y-6 p-6 bg-orange-50 dark:bg-orange-900/10 rounded-3xl border border-orange-100 dark:border-orange-900/30 animate-fade-in">
                      <div className="space-y-2">
                          <label className="text-sm font-bold text-orange-800 dark:text-orange-400 ml-1">Comment (สาเหตุ) <span className="text-red-500">*</span></label>
                          <select 
                            value={reason} onChange={e => setReason(e.target.value)}
                            className="w-full p-4 rounded-2xl bg-white dark:bg-gray-800 border-none shadow-sm outline-none focus:ring-2 focus:ring-orange-500"
                          >
                              <option value="">-- เลือกสาเหตุ --</option>
                              {REASON_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                      </div>
                      <div className="space-y-2">
                          <label className="text-sm font-bold text-orange-800 dark:text-orange-400 ml-1">รูปถ่ายหลักฐาน <span className="text-red-500">*</span></label>
                          <div className="flex flex-wrap gap-4">
                              <label className="w-24 h-24 rounded-2xl border-2 border-dashed border-orange-300 bg-white flex flex-col items-center justify-center text-orange-400 cursor-pointer hover:bg-orange-50 transition-colors">
                                  <Camera size={24} />
                                  <span className="text-[10px] font-bold mt-1">เพิ่มรูป</span>
                                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                              </label>
                              {images.map((img, idx) => (
                                  <div key={idx} className="relative w-24 h-24 rounded-2xl overflow-hidden shadow-sm border border-white">
                                      <img src={img} className="w-full h-full object-cover" />
                                      <button onClick={() => setImages(images.filter((_, i) => i !== idx))} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"><X size={12}/></button>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
              )}

              {/* Final Submit */}
              <button 
                onClick={handleSubmit} disabled={isSaving}
                className="w-full py-6 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-bold text-xl shadow-xl shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                  {isSaving ? <Loader2 className="animate-spin" /> : <>บันทึกผลตรวจสอบ <ArrowRight /></>}
              </button>
          </div>
        </div>
      )}
    </div>
  );
};
