
import React, { useState, useRef, useEffect } from 'react';
import { fetchMasterData, saveQCRecord, compressImage } from '../services/db';
import { ProductMaster, QCStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { Scan, Camera, X, CheckCircle2, AlertTriangle, Loader2, RefreshCw, Sparkles, Zap, AlertCircle, Trash2 } from 'lucide-react';
import { Html5Qrcode } from "html5-qrcode";
import { GoogleGenAI } from "@google/genai";

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
  const [barcode, setBarcode] = useState('');
  const [product, setProduct] = useState<ProductMaster | null>(null);
  const [step, setStep] = useState<'scan' | 'form'>('scan');
  
  const [cachedProducts, setCachedProducts] = useState<ProductMaster[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  
  // Form States
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [status, setStatus] = useState<QCStatus>(QCStatus.PASS);
  const [reason, setReason] = useState('');
  const [remark, setRemark] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [errors, setErrors] = useState<{[key:string]: string}>({});

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    fetchMasterData(false).then(setCachedProducts);
  }, []);

  const stopScanner = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        try { await html5QrCodeRef.current.stop(); } catch (e) {}
    }
    setShowScanner(false);
  };

  const startScanner = async () => {
    setShowScanner(true);
    setTimeout(async () => {
        try {
            const html5QrCode = new Html5Qrcode("reader");
            html5QrCodeRef.current = html5QrCode;
            // Force Back Camera (Environment)
            await html5QrCode.start(
                { facingMode: "environment" }, 
                { fps: 15, qrbox: { width: 250, height: 180 } }, 
                (decodedText) => {
                    stopScanner();
                    processBarcode(decodedText);
                },
                () => {}
            );
        } catch (err) {
            alert("ไม่สามารถเปิดกล้องหลังได้");
            setShowScanner(false);
        }
    }, 100);
  };

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
      setErrors({});
    } else {
      setErrors({ scan: `ไม่พบรหัสบาร์โค้ด "${cleanCode}" ในคลังสินค้า` });
    }
  };

  const handleSmartIdentify = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    setIsAiProcessing(true);
    setErrors({});
    
    try {
      const base64 = await compressImage(e.target.files[0]);
      const base64Data = base64.split(',')[1];
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
            { text: 'Extract the product barcode and name from this image. Return JSON: {"barcode": "string", "product_name": "string"}' }
          ]
        },
        config: { responseMimeType: 'application/json' }
      });

      const result = JSON.parse(response.text || '{}');
      if (result.barcode) {
          setBarcode(result.barcode);
          processBarcode(result.barcode);
      } else if (result.product_name) {
          const found = cachedProducts.find(p => p.productName.toLowerCase().includes(result.product_name.toLowerCase()));
          if (found) { setProduct(found); setStep('form'); }
          else { setErrors({ scan: "AI ระบุชื่อสินค้าได้ แต่ไม่พบในคลัง" }); }
      } else {
          setErrors({ scan: "AI ไม่สามารถระบุบาร์โค้ดได้จากภาพนี้" });
      }
    } catch (err) {
      setErrors({ scan: "AI Error: เกิดข้อผิดพลาดในการประมวลผลภาพ" });
    } finally {
      setIsAiProcessing(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!product || !user) return;
    const price = parseFloat(sellingPrice);
    
    if (isNaN(price)) { setErrors({ price: 'ระบุราคาขาย' }); return; }
    if ((status === QCStatus.DAMAGE || price === 0) && !reason) { setErrors({ reason: 'ระบุสาเหตุ' }); return; }
    if ((status === QCStatus.DAMAGE || price === 0) && images.length === 0) { setErrors({ images: 'แนบรูปหลักฐาน' }); return; }

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
        });
        setStep('scan');
        setBarcode('');
        setProduct(null);
        setErrors({});
    } catch (e: any) { 
        alert(`บันทึกไม่สำเร็จ: ${e.message}`); 
    } finally { setIsSaving(false); }
  };

  return (
    <div className="max-w-2xl mx-auto pb-24 px-4">
      {step === 'scan' ? (
        <div className="flex flex-col items-center justify-center min-h-[75vh] gap-8 animate-fade-in py-8">
          <div className="relative p-12 bg-gradient-to-br from-pastel-blueDark to-blue-800 rounded-[3.5rem] shadow-2xl shadow-blue-500/30 text-white transition-transform hover:scale-105 duration-500">
            <Scan size={80} strokeWidth={1.2} />
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-display font-bold text-gray-800 dark:text-white">เครื่องสแกน QC</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1 opacity-60">Ready to Quality Control</p>
          </div>
          
          <div className="w-full max-w-sm space-y-4">
            <div className="relative">
                <input
                  type="text" autoFocus value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && processBarcode(barcode)}
                  placeholder="สแกน หรือกรอกรหัสบาร์โค้ด..."
                  className="w-full pl-6 pr-14 py-5 text-lg rounded-3xl bg-white dark:bg-gray-800 shadow-xl border-none focus:ring-4 focus:ring-blue-500/10 transition-all font-mono"
                />
                <button onClick={startScanner} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 p-3 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-2xl">
                  <Camera size={26} />
                </button>
            </div>

            <label className={`flex items-center justify-center gap-2 w-full py-4 rounded-3xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-pastel-blueDark transition-all cursor-pointer text-xs font-bold ${isAiProcessing ? 'opacity-50' : ''}`}>
                {isAiProcessing ? <Loader2 size={18} className="animate-spin text-pastel-blueDark"/> : <Sparkles size={18} className="text-amber-500" />}
                <span>{isAiProcessing ? 'AI กำลังแกะรหัส...' : 'AI Smart Refinement (ใช้ภาพถ่าย)'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleSmartIdentify} disabled={isAiProcessing} />
            </label>

            {errors.scan && <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-[11px] font-bold flex items-center gap-2 animate-shake"><AlertCircle size={16} />{errors.scan}</div>}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl overflow-hidden animate-slide-up border border-gray-100 dark:border-gray-700">
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-6 text-white">
              <div className="flex justify-between items-start mb-4">
                  <div>
                      <h2 className="text-xl font-bold leading-tight">{product?.productName}</h2>
                      <div className="flex gap-2 mt-2">
                        <span className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-lg text-[10px] font-black border border-blue-500/30 uppercase tracking-tighter">ID: {product?.barcode}</span>
                      </div>
                  </div>
                  <button onClick={() => setStep('scan')} className="p-2 bg-white/10 rounded-full"><X size={18}/></button>
              </div>
          </div>

          <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setStatus(QCStatus.PASS)} className={`p-5 rounded-3xl border-2 flex flex-col items-center gap-1.5 transition-all ${status === QCStatus.PASS ? 'border-green-500 bg-green-50 text-green-700 shadow-lg' : 'border-gray-50 dark:border-gray-700 grayscale opacity-40'}`}>
                      <CheckCircle2 size={32} />
                      <span className="text-xs font-black uppercase">ผ่าน (Pass)</span>
                  </button>
                  <button onClick={() => setStatus(QCStatus.DAMAGE)} className={`p-5 rounded-3xl border-2 flex flex-col items-center gap-1.5 transition-all ${status === QCStatus.DAMAGE ? 'border-red-500 bg-red-50 text-red-700 shadow-lg' : 'border-gray-50 dark:border-gray-700 grayscale opacity-40'}`}>
                      <AlertTriangle size={32} />
                      <span className="text-xs font-black uppercase">ชำรุด (Damage)</span>
                  </button>
              </div>

              <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-1 tracking-widest">ราคาขายหน้าสาขา <span className="text-red-500">*</span></label>
                  <div className="relative">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-300">฿</span>
                      <input 
                        type="number" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)}
                        className="w-full pl-12 pr-6 py-5 bg-gray-50 dark:bg-gray-900 rounded-[2rem] text-3xl font-mono font-bold outline-none border-2 border-transparent focus:border-pastel-blueDark transition-all"
                        placeholder="0.00"
                      />
                  </div>
              </div>

              {(status === QCStatus.DAMAGE || parseFloat(sellingPrice) === 0) && (
                  <div className="space-y-5 p-5 bg-orange-50 dark:bg-orange-900/10 rounded-3xl border border-orange-100 dark:border-orange-900/30 animate-fade-in">
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-orange-800 dark:text-orange-400 ml-1 tracking-widest">สาเหตุ (Reason) <span className="text-red-500">*</span></label>
                          <select value={reason} onChange={e => setReason(e.target.value)} className="w-full p-4 rounded-2xl bg-white dark:bg-gray-800 border-none shadow-sm outline-none focus:ring-2 focus:ring-orange-500 text-sm font-medium">
                              <option value="">-- เลือกสาเหตุ --</option>
                              {REASON_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                      </div>
                      <div className="space-y-3">
                          <label className="text-[10px] font-black uppercase text-orange-800 dark:text-orange-400 ml-1 tracking-widest">รูปถ่ายหลักฐาน ({images.length}/5) <span className="text-red-500">*</span></label>
                          <div className="flex flex-wrap gap-3">
                              {images.length < 5 && (
                                <label className="w-20 h-20 rounded-2xl border-2 border-dashed border-orange-200 bg-white dark:bg-gray-700 flex flex-col items-center justify-center text-orange-400 cursor-pointer hover:bg-orange-50">
                                    <Camera size={20} />
                                    <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                                        if (e.target.files) {
                                            const newImages = [...images];
                                            for (let i = 0; i < e.target.files.length; i++) {
                                                if (newImages.length >= 5) break;
                                                newImages.push(await compressImage(e.target.files[i]));
                                            }
                                            setImages(newImages);
                                        }
                                    }} />
                                </label>
                              )}
                              {images.map((img, idx) => (
                                  <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-md group">
                                      <img src={img} className="w-full h-full object-cover" />
                                      <button onClick={() => setImages(images.filter((_, i) => i !== idx))} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-100"><X size={10}/></button>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
              )}

              <button onClick={handleSubmit} disabled={isSaving} className="w-full py-5 rounded-[2rem] bg-gradient-to-r from-pastel-blueDark to-blue-800 text-white font-bold text-lg shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                  {isSaving ? <Loader2 className="animate-spin" /> : <>บันทึกข้อมูล <Zap size={18} fill="currentColor" /></>}
              </button>
          </div>
        </div>
      )}

      {showScanner && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black">
          <div className="p-6 flex justify-between items-center text-white">
            <h3 className="font-bold flex items-center gap-2"><Scan size={20} /> สแกนบาร์โค้ดสินค้า</h3>
            <button onClick={stopScanner} className="p-2 bg-white/10 rounded-full"><X size={20} /></button>
          </div>
          <div id="reader" className="flex-1 w-full bg-black"></div>
          <div className="p-8 text-white text-center text-xs opacity-60">หันกล้องหลังไปที่บาร์โค้ดให้ชัดเจน</div>
        </div>
      )}
    </div>
  );
};
