
import React, { useState, useRef, useEffect } from 'react';
import { fetchMasterData, saveQCRecord, compressImage } from '../services/db';
import { ProductMaster, QCStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { Scan, Camera, X, CheckCircle2, AlertTriangle, Loader2, Sparkles, Zap, AlertCircle, Trash2, Maximize2, Cpu } from 'lucide-react';
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
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
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
            await html5QrCode.start(
                { facingMode: "environment" }, 
                { 
                  fps: 20, 
                  qrbox: { width: 280, height: 200 },
                  aspectRatio: 1.0 
                }, 
                (decodedText) => {
                    stopScanner();
                    processBarcode(decodedText);
                },
                () => {}
            );
        } catch (err) {
            alert("ไม่สามารถเปิดกล้องได้");
            setShowScanner(false);
        }
    }, 150);
  };

  // AI-Powered: Capture frame from live video and identify
  const captureAndIdentifyWithAi = async () => {
    const video = document.querySelector('#reader video') as HTMLVideoElement;
    if (!video) return;

    setIsAiProcessing(true);
    try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const base64 = await compressImage(blob);
            const base64Data = base64.split(',')[1];
            
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `Identify the product barcode or product name from this image. 
            Especially focus on barcodes (EAN-13, EAN-8, Code 128, etc.). 
            Return JSON: {"barcode": "string_or_null", "product_name": "string_or_null"}`;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: base64Data } }, { text: prompt }] },
                config: { responseMimeType: 'application/json' }
            });

            const result = JSON.parse(response.text || '{}');
            if (result.barcode) {
                stopScanner();
                processBarcode(result.barcode);
            } else if (result.product_name) {
                const found = cachedProducts.find(p => p.productName.toLowerCase().includes(result.product_name.toLowerCase()));
                if (found) {
                    stopScanner();
                    setProduct(found);
                    setStep('form');
                } else {
                    alert(`AI พบสินค้าชื่อ "${result.product_name}" แต่ไม่มีในคลัง`);
                }
            } else {
                alert("AI ไม่สามารถระบุบาร์โค้ดจากภาพนี้ได้ กรุณาลองใหม่");
            }
            setIsAiProcessing(false);
        }, 'image/jpeg', 0.8);
    } catch (e) {
        setIsAiProcessing(false);
        alert("AI Processing Error");
    }
  };

  const processBarcode = (code: string) => {
    const cleanCode = String(code).trim();
    const found = cachedProducts.find(p => p.barcode.trim().toLowerCase() === cleanCode.toLowerCase());
    if (found) {
      setProduct(found);
      setSellingPrice(found.unitPrice?.toString() || '');
      setStatus(QCStatus.PASS);
      setReason('');
      setImages([]);
      setStep('form');
      setErrors({});
    } else {
      setErrors({ scan: `ไม่พบรหัสบาร์โค้ด "${cleanCode}" ในคลังสินค้า` });
      setTimeout(() => setErrors({}), 4000);
    }
  };

  const handleManualSmartIdentify = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    setIsAiProcessing(true);
    setErrors({});
    try {
      const file = e.target.files[0];
      const base64 = await compressImage(file);
      const base64Data = base64.split(',')[1];
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: base64Data } }, { text: 'Extract barcode JSON: {"barcode": "string"}' }] },
        config: { responseMimeType: 'application/json' }
      });
      const result = JSON.parse(response.text || '{}');
      if (result.barcode) processBarcode(result.barcode);
      else setErrors({ scan: "AI ไม่สามารถอ่านข้อมูลบาร์โค้ดจากภาพนี้ได้" });
    } catch (err) {
      setErrors({ scan: "AI Error: เกิดข้อผิดพลาด" });
    } finally { setIsAiProcessing(false); e.target.value = ''; }
  };

  const handleSubmit = async () => {
    if (!product || !user) return;
    const price = parseFloat(sellingPrice);
    const newErrors: any = {};
    if (isNaN(price)) newErrors.price = 'ระบุราคาขาย';
    if ((status === QCStatus.DAMAGE || price === 0) && !reason) newErrors.reason = 'ระบุสาเหตุ';
    if ((status === QCStatus.DAMAGE || price === 0) && images.length === 0) newErrors.images = 'แนบรูปหลักฐานอย่างน้อย 1 รูป';

    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

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
        alert('✅ บันทึกข้อมูลสำเร็จ');
    } catch (e: any) { alert(`❌ บันทึกไม่สำเร็จ: ${e.message}`); } finally { setIsSaving(false); }
  };

  return (
    <div className="max-w-2xl mx-auto pb-24 px-4">
      {step === 'scan' ? (
        <div className="flex flex-col items-center justify-center min-h-[75vh] gap-8 animate-fade-in py-8">
          <div className="relative p-14 bg-gradient-to-br from-pastel-blueDark to-blue-900 rounded-[4rem] shadow-2xl shadow-blue-500/40 text-white transition-transform hover:rotate-3 duration-500">
            <Scan size={80} strokeWidth={1} className="animate-pulse" />
          </div>

          <div className="text-center space-y-2">
            <h2 className="text-2xl font-display font-bold text-gray-800 dark:text-white">เครื่องสแกนอัจฉริยะ</h2>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] opacity-60">Ready to Quality Control</p>
          </div>
          
          <div className="w-full max-w-sm space-y-5">
            <div className="relative group">
                <input
                  type="text" autoFocus value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && processBarcode(barcode)}
                  placeholder="สแกน หรือกรอกรหัสบาร์โค้ด..."
                  className="w-full pl-6 pr-14 py-5 text-lg rounded-3xl bg-white dark:bg-gray-800 shadow-xl border-2 border-transparent focus:border-pastel-blueDark focus:ring-0 transition-all font-mono"
                />
                <button onClick={startScanner} className="absolute right-3 top-1/2 -translate-y-1/2 bg-pastel-blueDark text-white p-3 rounded-2xl shadow-lg">
                  <Camera size={24} />
                </button>
            </div>

            <label className={`flex items-center justify-center gap-3 w-full py-5 rounded-3xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-pastel-blueDark hover:bg-blue-50/50 transition-all cursor-pointer text-xs font-bold ${isAiProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                {isAiProcessing ? <Loader2 size={18} className="animate-spin text-pastel-blueDark"/> : <Sparkles size={18} className="text-amber-500" />}
                <span>{isAiProcessing ? 'AI กำลังประมวลผล...' : 'AI Smart Identify (อัปโหลดรูป)'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleManualSmartIdentify} disabled={isAiProcessing} />
            </label>

            {errors.scan && (
              <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-[11px] font-bold flex items-center gap-3 border border-red-100 animate-shake">
                  <AlertCircle size={20} className="flex-shrink-0" />
                  <span>{errors.scan}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl overflow-hidden animate-slide-up border border-gray-100 dark:border-gray-700">
          <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 p-6 text-white relative">
              <div className="flex justify-between items-start">
                  <div className="max-w-[80%]">
                      <h2 className="text-xl font-bold leading-tight line-clamp-2">{product?.productName}</h2>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <span className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-lg text-[9px] font-black border border-blue-500/30 uppercase tracking-wider">RMS: {product?.barcode}</span>
                      </div>
                  </div>
                  <button onClick={() => setStep('scan')} className="p-2 bg-white/10 rounded-full"><X size={18}/></button>
              </div>
          </div>

          <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => setStatus(QCStatus.PASS)} className={`p-6 rounded-[2rem] border-2 flex flex-col items-center gap-3 transition-all ${status === QCStatus.PASS ? 'border-green-500 bg-green-50/50 dark:bg-green-900/10 text-green-700 dark:text-green-400 shadow-lg scale-[1.02]' : 'border-gray-50 dark:border-gray-700 grayscale opacity-40 hover:grayscale-0'}`}>
                      <CheckCircle2 size={40} strokeWidth={1.5} />
                      <span className="text-[10px] font-black uppercase tracking-widest">ผ่าน (Pass)</span>
                  </button>
                  <button onClick={() => setStatus(QCStatus.DAMAGE)} className={`p-6 rounded-[2rem] border-2 flex flex-col items-center gap-3 transition-all ${status === QCStatus.DAMAGE ? 'border-red-500 bg-red-50/50 dark:bg-red-900/10 text-red-700 dark:text-red-400 shadow-lg scale-[1.02]' : 'border-gray-50 dark:border-gray-700 grayscale opacity-40 hover:grayscale-0'}`}>
                      <AlertTriangle size={40} strokeWidth={1.5} />
                      <span className="text-[10px] font-black uppercase tracking-widest">ชำรุด (Damage)</span>
                  </button>
              </div>

              <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-[0.2em]">ราคาขายหน้าสาขา <span className="text-red-500">*</span></label>
                  <div className="relative">
                      <span className="absolute left-7 top-1/2 -translate-y-1/2 text-3xl font-bold text-gray-300">฿</span>
                      <input 
                        type="number" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)}
                        className={`w-full pl-14 pr-8 py-6 bg-gray-50 dark:bg-gray-900 rounded-[2.5rem] text-4xl font-mono font-bold outline-none border-2 transition-all ${errors.price ? 'border-red-400' : 'border-transparent focus:border-pastel-blueDark'}`}
                        placeholder="0.00"
                      />
                  </div>
              </div>

              {(status === QCStatus.DAMAGE || (sellingPrice !== '' && parseFloat(sellingPrice) === 0)) && (
                  <div className="space-y-6 p-6 bg-gray-50 dark:bg-gray-900/50 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 animate-slide-up">
                      <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase text-gray-500 ml-2 tracking-widest">สาเหตุ (Reason) <span className="text-red-500">*</span></label>
                          <select value={reason} onChange={e => setReason(e.target.value)} className="w-full p-4 rounded-2xl bg-white dark:bg-gray-800 outline-none text-sm font-medium shadow-sm">
                              <option value="">-- กรุณาเลือกสาเหตุ --</option>
                              {REASON_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                      </div>

                      <div className="space-y-4">
                          <label className="text-[10px] font-black uppercase text-gray-500 ml-2 tracking-widest">รูปถ่ายหลักฐาน ({images.length}/5) <span className="text-red-500">*</span></label>
                          <div className="flex flex-wrap gap-3">
                              {images.length < 5 && (
                                <label className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-300 bg-white dark:bg-gray-800 flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:border-pastel-blueDark transition-all">
                                    <Camera size={24} />
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
                                  <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-lg border border-white">
                                      <img src={img} className="w-full h-full object-cover" onClick={() => setPreviewImage(img)} />
                                      <button onClick={() => setImages(images.filter((_, i) => i !== idx))} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"><Trash2 size={12}/></button>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
              )}

              <button 
                onClick={handleSubmit} disabled={isSaving} 
                className="w-full py-6 rounded-[2.5rem] bg-gradient-to-r from-pastel-blueDark to-blue-900 text-white font-bold text-lg shadow-xl shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
              >
                  {isSaving ? <Loader2 className="animate-spin" /> : <>ยืนยันการบันทึก <Zap size={20} fill="currentColor" /></>}
              </button>
          </div>
        </div>
      )}

      {showScanner && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black animate-fade-in">
          <div className="p-6 flex justify-between items-center text-white bg-gradient-to-b from-black/80 to-transparent">
            <h3 className="font-bold flex items-center gap-3"><Scan size={24} className="text-pastel-blue" /> สแกนบาร์โค้ด</h3>
            <button onClick={stopScanner} className="p-3 bg-white/10 rounded-full"><X size={24} /></button>
          </div>
          <div id="reader" className="flex-1 w-full bg-black relative">
             <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-72 h-52 border-2 border-pastel-blue/40 rounded-3xl relative">
                   <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-pastel-blue rounded-tl-lg"></div>
                   <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-pastel-blue rounded-tr-lg"></div>
                   <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500/50 animate-pulse"></div>
                </div>
             </div>
          </div>
          <div className="p-8 flex flex-col items-center gap-4 bg-gradient-to-t from-black/80 to-transparent">
            <button 
                onClick={captureAndIdentifyWithAi} 
                disabled={isAiProcessing}
                className="bg-white/10 hover:bg-white/20 text-white px-8 py-3 rounded-full flex items-center gap-3 transition-all border border-white/20 disabled:opacity-50"
            >
                {isAiProcessing ? <Loader2 size={18} className="animate-spin" /> : <Cpu size={18} className="text-pastel-blue" />}
                <span className="text-xs font-bold uppercase tracking-widest">{isAiProcessing ? 'AI กำลังวิเคราะห์ภาพ...' : 'AI Vision Capture'}</span>
            </button>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest">หันกล้องหลังไปที่บาร์โค้ดสินค้าให้ชัดเจน</p>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 animate-fade-in">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setPreviewImage(null)} />
            <div className="relative max-w-full max-h-full">
                <img src={previewImage} className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl" />
                <button onClick={() => setPreviewImage(null)} className="absolute -top-4 -right-4 p-3 bg-white text-black rounded-full shadow-xl"><X size={20}/></button>
            </div>
        </div>
      )}
    </div>
  );
};
