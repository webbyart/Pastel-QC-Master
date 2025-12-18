
import React, { useState, useRef, useEffect } from 'react';
import { fetchMasterData, saveQCRecord, compressImage } from '../services/db';
import { ProductMaster, QCStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { Scan, Camera, X, CheckCircle2, AlertTriangle, Loader2, Sparkles, Zap, AlertCircle, Trash2, Maximize2, Cpu, RefreshCw, Search } from 'lucide-react';
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
    fetchMasterData(true).then(setCachedProducts);
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
                  fps: 25, 
                  qrbox: { width: 300, height: 200 },
                  aspectRatio: 1.0 
                }, 
                (decodedText) => {
                    // When scanned successfully, try direct process
                    processBarcode(decodedText);
                },
                () => {}
            );
        } catch (err) {
            alert("ไม่สามารถเปิดกล้องได้ กรุณาตรวจสอบสิทธิ์การใช้งานกล้อง");
            setShowScanner(false);
        }
    }, 150);
  };

  const analyzeWithAi = async () => {
    const video = document.querySelector('#reader video') as HTMLVideoElement;
    if (!video) return;

    setIsAiProcessing(true);
    try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        if (!blob) throw new Error("Canvas to Blob failed");

        const base64 = await compressImage(blob);
        const base64Data = base64.split(',')[1];
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `Identify any product identification from this image. 
        Look for Barcodes, QR codes, RMS IDs, SKU, or Product Name labels.
        Output MUST be in JSON format: {"barcode": "found_code_or_null", "product_name": "detected_name_or_null"}`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: base64Data } }, { text: prompt }] },
            config: { responseMimeType: 'application/json', temperature: 0.1 }
        });

        const result = JSON.parse(response.text || '{}');
        
        if (result.barcode) {
            // Re-attempt search with AI-found barcode
            const foundByAiBarcode = cachedProducts.find(p => p.barcode.trim().toLowerCase() === String(result.barcode).trim().toLowerCase());
            if (foundByAiBarcode) {
                stopScanner();
                applyProduct(foundByAiBarcode);
                return;
            }
        }

        if (result.product_name) {
            const detectedName = String(result.product_name).toLowerCase();
            const foundByName = cachedProducts.find(p => 
                p.productName.toLowerCase().includes(detectedName) || 
                detectedName.includes(p.productName.toLowerCase())
            );
            if (foundByName) {
                stopScanner();
                applyProduct(foundByName);
                return;
            }
        }
        
        setErrors({ scan: "AI ไม่พบข้อมูลสินค้าที่ตรงกับในคลัง กรุณาขยับกล้องหรือพิมพ์ค้นหาเอง" });
    } catch (e) {
        console.error("AI Analysis failed", e);
        setErrors({ scan: "การวิเคราะห์ด้วย AI ล้มเหลว กรุณาลองใหม่" });
    } finally {
        setIsAiProcessing(false);
    }
  };

  const applyProduct = (found: ProductMaster) => {
    setProduct(found);
    setSellingPrice(found.unitPrice?.toString() || '');
    setStatus(QCStatus.PASS);
    setReason('');
    setImages([]);
    setStep('form');
    setErrors({});
  };

  const processBarcode = async (code: string) => {
    const cleanCode = String(code).trim();
    if (!cleanCode) return;

    const found = cachedProducts.find(p => p.barcode.trim().toLowerCase() === cleanCode.toLowerCase());
    
    if (found) {
      stopScanner();
      applyProduct(found);
    } else {
      // Fallback to AI Analysis automatically if scanner is active
      if (showScanner) {
        setErrors({ scan: "รหัสไม่พบในระบบ กำลังเรียกใช้ AI Vision ช่วยวิเคราะห์..." });
        await analyzeWithAi();
      } else {
        setErrors({ scan: `ไม่พบรหัสบาร์โค้ด "${cleanCode}" ในคลังสินค้า` });
        setTimeout(() => setErrors({}), 5000);
      }
    }
  };

  const handleSubmit = async () => {
    if (!product || !user) return;
    const price = parseFloat(sellingPrice);
    const newErrors: any = {};
    if (isNaN(price)) newErrors.price = 'กรุณาระบุราคาขาย';
    if ((status === QCStatus.DAMAGE || price === 0) && !reason) newErrors.reason = 'กรุณาระบุสาเหตุ';
    if ((status === QCStatus.DAMAGE || price === 0) && images.length === 0) newErrors.images = 'กรุณาแนบรูปหลักฐานอย่างน้อย 1 รูป';

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
        alert('✅ บันทึกผล QC สำเร็จ!');
    } catch (e: any) { 
        alert(`❌ เกิดข้อผิดพลาด: ${e.message}`); 
    } finally { setIsSaving(false); }
  };

  return (
    <div className="max-w-2xl mx-auto pb-24 px-4">
      {/* AI Processing Overlay */}
      {isAiProcessing && (
        <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] shadow-2xl flex flex-col items-center gap-6 animate-slide-up">
                <div className="relative">
                    <Loader2 size={64} className="animate-spin text-pastel-blueDark" />
                    <Cpu size={24} className="absolute inset-0 m-auto text-pastel-blueDark" />
                </div>
                <div className="text-center">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">AI Analyzing Image...</h3>
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">กำลังใช้ AI ค้นหาสินค้าจากภาพ</p>
                </div>
            </div>
        </div>
      )}

      {step === 'scan' ? (
        <div className="flex flex-col items-center justify-center min-h-[75vh] gap-8 animate-fade-in py-8">
          <div className="relative p-14 bg-gradient-to-br from-pastel-blueDark to-blue-900 rounded-[4rem] shadow-2xl shadow-blue-500/40 text-white transition-transform hover:scale-105 duration-500">
            <Scan size={80} strokeWidth={1} className="animate-pulse" />
          </div>

          <div className="text-center space-y-2">
            <h2 className="text-2xl font-display font-bold text-gray-800 dark:text-white">QC SCANNER</h2>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em] opacity-60">Smart Quality Analysis System</p>
          </div>
          
          <div className="w-full max-w-sm space-y-5">
            <div className="relative group">
                <input
                  type="text" autoFocus value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && processBarcode(barcode)}
                  placeholder="สแกน หรือพิมพ์รหัสบาร์โค้ด..."
                  className="w-full pl-6 pr-16 py-5 text-lg rounded-3xl bg-white dark:bg-gray-800 shadow-xl border-2 border-transparent focus:border-pastel-blueDark focus:ring-0 transition-all font-mono"
                />
                <button onClick={startScanner} className="absolute right-3 top-1/2 -translate-y-1/2 bg-pastel-blueDark text-white p-3 rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-all">
                  <Camera size={24} />
                </button>
            </div>

            <div className="flex flex-col gap-2">
                <button 
                  onClick={() => fetchMasterData(true).then(setCachedProducts)}
                  className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-pastel-blueDark transition-colors"
                >
                  <RefreshCw size={12} /> Sync Cloud ({cachedProducts.length} items)
                </button>
            </div>

            {errors.scan && (
              <div className="bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 p-4 rounded-2xl text-[11px] font-bold flex items-center gap-3 border border-amber-100 dark:border-amber-900/20 animate-slide-up">
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
                        <span className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-lg text-[9px] font-black border border-blue-500/30 uppercase tracking-wider">ID: {product?.barcode}</span>
                      </div>
                  </div>
                  <button onClick={() => setStep('scan')} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"><X size={18}/></button>
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
                        className={`w-full pl-14 pr-8 py-6 bg-gray-50 dark:bg-gray-900 rounded-[2.5rem] text-4xl font-mono font-bold outline-none border-2 transition-all ${errors.price ? 'border-red-400' : 'border-transparent focus:border-pastel-blueDark shadow-sm'}`}
                        placeholder="0.00"
                      />
                  </div>
              </div>

              {(status === QCStatus.DAMAGE || (sellingPrice !== '' && parseFloat(sellingPrice) === 0)) && (
                  <div className="space-y-6 p-6 bg-gray-50 dark:bg-gray-900/50 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 animate-slide-up">
                      <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase text-gray-500 ml-2 tracking-widest">สาเหตุ (Reason) <span className="text-red-500">*</span></label>
                          <select value={reason} onChange={e => setReason(e.target.value)} className="w-full p-4 rounded-2xl bg-white dark:bg-gray-800 outline-none text-sm font-medium shadow-sm border-none">
                              <option value="">-- กรุณาเลือกสาเหตุ --</option>
                              {REASON_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                      </div>

                      <div className="space-y-4">
                          <label className="text-[10px] font-black uppercase text-gray-500 ml-2 tracking-widest">รูปถ่ายหลักฐาน ({images.length}/5) <span className="text-red-500">*</span></label>
                          <div className="flex flex-wrap gap-3">
                              {images.length < 5 && (
                                <label className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-300 bg-white dark:bg-gray-800 flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:border-pastel-blueDark transition-all active:scale-95">
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
                                  <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-lg border-2 border-white dark:border-gray-700 group">
                                      <img src={img} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage(img)} />
                                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button onClick={() => setPreviewImage(img)} className="p-1.5 bg-white/20 rounded-lg mr-1"><Maximize2 size={12} /></button>
                                          <button onClick={() => setImages(images.filter((_, i) => i !== idx))} className="p-1.5 bg-red-500/80 rounded-lg"><Trash2 size={12}/></button>
                                      </div>
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
                  {isSaving ? <Loader2 className="animate-spin" /> : <>บันทึกข้อมูล QC <Zap size={20} fill="currentColor" /></>}
              </button>
          </div>
        </div>
      )}

      {showScanner && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black animate-fade-in">
          <div className="p-6 flex justify-between items-center text-white bg-gradient-to-b from-black/80 to-transparent">
            <h3 className="font-bold flex items-center gap-3 tracking-widest uppercase text-xs"><Scan size={20} className="text-pastel-blue" /> Smart QC Scanner</h3>
            <button onClick={stopScanner} className="p-3 bg-white/10 rounded-full active:scale-90 transition-all"><X size={24} /></button>
          </div>
          <div id="reader" className="flex-1 w-full bg-black relative">
             <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-72 h-52 border-2 border-white/20 rounded-[2.5rem] relative">
                   <div className="absolute -top-1 -left-1 w-10 h-10 border-t-4 border-l-4 border-pastel-blue rounded-tl-3xl"></div>
                   <div className="absolute -top-1 -right-1 w-10 h-10 border-t-4 border-r-4 border-pastel-blue rounded-tr-3xl"></div>
                   <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-pastel-blue/50 animate-pulse shadow-[0_0_15px_rgba(3,105,161,0.5)]"></div>
                </div>
             </div>
          </div>
          <div className="p-8 flex flex-col items-center gap-5 bg-gradient-to-t from-black/80 to-transparent">
            <button 
                onClick={analyzeWithAi} 
                disabled={isAiProcessing}
                className="bg-white/10 hover:bg-white/20 text-white px-8 py-3.5 rounded-full flex items-center gap-3 transition-all border border-white/20 disabled:opacity-50 shadow-xl backdrop-blur-md"
            >
                {isAiProcessing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} className="text-pastel-blue" />}
                <span className="text-xs font-black uppercase tracking-[0.2em]">{isAiProcessing ? 'AI Analysing...' : 'AI VISION SCAN'}</span>
            </button>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center px-6 leading-relaxed">หากสแกนปกติไม่ติด หรือสินค้าไม่มีบาร์โค้ด <br/>กรุณากด AI Vision เพื่อค้นหาจากภาพสินค้า</p>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 animate-fade-in">
            <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={() => setPreviewImage(null)} />
            <div className="relative max-w-full max-h-full">
                <img src={previewImage} className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl border-4 border-white/10" />
                <button onClick={() => setPreviewImage(null)} className="absolute -top-12 right-0 p-3 bg-white text-black rounded-full shadow-xl hover:scale-110 active:scale-95 transition-all"><X size={20}/></button>
            </div>
        </div>
      )}
    </div>
  );
};
