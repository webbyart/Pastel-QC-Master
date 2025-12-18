
import React, { useState, useRef, useEffect } from 'react';
import { fetchMasterDataBatch, submitQCAndRemoveProduct, compressImage, updateLocalMasterDataCache, fetchCloudStats } from '../services/db';
import { ProductMaster, QCStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { Scan, Camera, X, CheckCircle2, AlertTriangle, Loader2, Sparkles, Zap, AlertCircle, Box, ClipboardCheck, Timer, RefreshCw, Server, Database } from 'lucide-react';
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
  const [cloudStats, setCloudStats] = useState({ remaining: 0, checked: 0, total: 0 });
  const [isSyncing, setIsSyncing] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [status, setStatus] = useState<QCStatus>(QCStatus.PASS);
  const [reason, setReason] = useState('');
  const [remark, setRemark] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [errors, setErrors] = useState<{[key:string]: string}>({});

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    initData();
  }, []);

  const initData = async (force = false) => {
    setIsSyncing(true);
    try {
        const stats = await fetchCloudStats();
        setCloudStats(stats);
        
        // ดึงข้อมูลสินค้าเพียง 500 รายการสำหรับระบบตรวจเช็ค เพื่อลดความช้า
        const data = await fetchMasterDataBatch(force);
        setCachedProducts(data);
    } catch (e) {
        console.error(e);
    } finally {
        setIsSyncing(false);
    }
  };

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
                { fps: 30, qrbox: { width: 300, height: 200 } }, 
                (decodedText) => processBarcode(decodedText),
                () => {}
            );
        } catch (err) {
            alert("ไม่สามารถเปิดกล้องได้");
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
        if (!blob) throw new Error("Canvas failed");

        const base64 = await compressImage(blob);
        const base64Data = base64.split(',')[1];
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: base64Data } }, { text: 'Extract product barcode from image. JSON output: {"barcode": "string"}' }] },
            config: { responseMimeType: 'application/json' }
        });

        const result = JSON.parse(response.text || '{}');
        if (result.barcode) processBarcode(result.barcode);
        else setErrors({ scan: "AI Vision ไม่สามารถระบุรหัสได้" });
    } catch (e) {
        setErrors({ scan: "AI วิเคราะห์ล้มเหลว" });
    } finally {
        setIsAiProcessing(false);
    }
  };

  const processBarcode = async (code: string) => {
    const cleanCode = String(code).trim();
    if (!cleanCode) return;
    const found = cachedProducts.find(p => p.barcode.toLowerCase() === cleanCode.toLowerCase());
    if (found) {
      stopScanner();
      setProduct(found);
      setSellingPrice(found.unitPrice?.toString() || '');
      setStatus(QCStatus.PASS);
      setReason('');
      setImages([]);
      setStep('form');
      setErrors({});
    } else {
      setErrors({ scan: `ไม่พบรหัส "${cleanCode}" ในคิว 500 รายการนี้` });
    }
  };

  const handleSubmit = async () => {
    if (!product || !user) return;
    const price = parseFloat(sellingPrice);
    if (isNaN(price)) { setErrors({ price: 'ระบุราคา' }); return; }

    setIsSaving(true);
    try {
        await submitQCAndRemoveProduct({
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

        const updatedList = cachedProducts.filter(p => p.barcode !== product.barcode);
        setCachedProducts(updatedList);
        setCloudStats(prev => ({ ...prev, remaining: prev.remaining - 1, checked: prev.checked + 1 }));
        await updateLocalMasterDataCache(updatedList);

        setStep('scan');
        setBarcode('');
        setProduct(null);
        
        // ถ้าคิวใกล้หมด ให้โหลด Batch ใหม่มาเติมอัตโนมัติ
        if (updatedList.length < 5) {
            initData(true);
        }
    } catch (e: any) { 
        alert(`ผิดพลาด: ${e.message}`); 
    } finally { setIsSaving(false); }
  };

  return (
    <div className="max-w-4xl mx-auto pb-24 px-4 animate-fade-in space-y-8">
      
      {/* Batch Loading Overlay */}
      {isSyncing && (
          <div className="fixed inset-0 z-[300] bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center animate-fade-in">
              <div className="bg-white dark:bg-gray-800 p-12 rounded-[4rem] shadow-2xl border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-8 max-w-sm w-full animate-slide-up">
                  <div className="w-24 h-24 rounded-full border-4 border-gray-100 dark:border-gray-700 border-t-pastel-blueDark animate-spin" />
                  <div className="space-y-2">
                      <h3 className="text-2xl font-black text-gray-800 dark:text-white uppercase">Syncing Batch</h3>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">กำลังดึงสินค้า 500 รายการล่าสุด...</p>
                  </div>
              </div>
          </div>
      )}

      {step === 'scan' ? (
        <div className="space-y-8">
          {/* Enhanced Live Stats Panel */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-6 group transition-all hover:shadow-xl hover:-translate-y-1">
                  <div className="p-5 bg-blue-50 dark:bg-blue-900/30 rounded-[2rem] text-blue-500 group-hover:scale-110 transition-transform">
                      <Database size={28} />
                  </div>
                  <div>
                      <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">คลังสินค้า (Cloud)</p>
                      <p className="text-3xl font-black text-gray-800 dark:text-white">{cloudStats.total.toLocaleString()} <span className="text-xs font-normal text-gray-400">Items</span></p>
                  </div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-6 group transition-all hover:shadow-xl hover:-translate-y-1">
                  <div className="p-5 bg-purple-50 dark:bg-purple-900/30 rounded-[2rem] text-purple-500 group-hover:scale-110 transition-transform">
                      <Box size={28} />
                  </div>
                  <div>
                      <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Batch System</p>
                      <p className="text-3xl font-black text-gray-800 dark:text-white">500 <span className="text-xs font-normal text-gray-400">Items/Batch</span></p>
                  </div>
              </div>
              <div className="bg-pastel-blueDark p-8 rounded-[3rem] shadow-2xl shadow-blue-500/20 flex items-center gap-6 group transition-all hover:-translate-y-1 text-white">
                  <div className="p-5 bg-white/20 rounded-[2rem] group-hover:scale-110 transition-transform">
                      <Timer size={28} />
                  </div>
                  <div>
                      <p className="text-[11px] font-black text-blue-100 uppercase tracking-widest mb-1">คิวในเครื่อง (Queue)</p>
                      <p className="text-3xl font-black">{cachedProducts.length.toLocaleString()} <span className="text-xs font-normal text-blue-200 opacity-60">Wait List</span></p>
                  </div>
              </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-10 py-10 bg-white dark:bg-gray-800 rounded-[4rem] shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="relative p-16 bg-gradient-to-br from-pastel-blueDark to-blue-800 rounded-[6rem] shadow-2xl shadow-blue-500/30 text-white active:scale-95 transition-all">
                <Scan size={100} strokeWidth={1.5} />
                <div className="absolute -top-3 -right-3 bg-red-500 w-8 h-8 rounded-full animate-ping opacity-75" />
            </div>

            <div className="text-center space-y-3">
                <h2 className="text-4xl font-display font-bold text-gray-800 dark:text-white tracking-tight">QC MASTER PROCESS</h2>
                <div className="flex items-center justify-center gap-4">
                    <div className="h-[2px] w-12 bg-gray-100 dark:bg-gray-700" />
                    <p className="text-[12px] text-gray-400 font-black uppercase tracking-[0.4em]">500 Items Batch Logic</p>
                    <div className="h-[2px] w-12 bg-gray-100 dark:bg-gray-700" />
                </div>
            </div>
            
            <div className="w-full max-w-md px-10 space-y-6">
                <div className="relative group">
                    <input
                      type="text" autoFocus value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && processBarcode(barcode)}
                      placeholder="สแกน หรือ พิมพ์รหัส..."
                      className="w-full pl-10 pr-20 py-8 text-2xl rounded-[2.5rem] bg-gray-50 dark:bg-gray-900 shadow-inner border-none focus:ring-4 focus:ring-pastel-blueDark/10 transition-all font-mono placeholder:text-gray-300 dark:text-white"
                    />
                    <button onClick={startScanner} className="absolute right-4 top-1/2 -translate-y-1/2 bg-pastel-blueDark text-white p-5 rounded-[2rem] shadow-xl hover:bg-blue-600 transition-all">
                        <Camera size={28} />
                    </button>
                </div>

                <div className="flex justify-center">
                    <button onClick={() => initData(true)} className="flex items-center gap-3 text-[11px] font-black text-gray-400 uppercase tracking-widest hover:text-pastel-blueDark transition-all bg-gray-50 dark:bg-gray-900 px-8 py-3 rounded-full border border-gray-100 dark:border-gray-700 shadow-sm">
                        <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} /> Force Cloud Sync
                    </button>
                </div>

                {errors.scan && (
                <div className="bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 p-6 rounded-[2.5rem] text-xs font-bold flex items-center gap-4 border border-red-100 dark:border-red-900/20 animate-bounce-soft">
                    <AlertCircle size={28} className="flex-shrink-0" />
                    <span>{errors.scan}</span>
                </div>
                )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-[4rem] shadow-2xl overflow-hidden animate-slide-up border border-gray-100 dark:border-gray-700">
          <div className="bg-gray-900 p-12 text-white relative">
              <div className="flex justify-between items-start">
                  <div className="space-y-3">
                      <p className="text-[12px] font-black uppercase tracking-[0.3em] text-pastel-blue">Detected Item</p>
                      <h2 className="text-4xl font-bold leading-tight max-w-[400px]">{product?.productName}</h2>
                      <div className="flex items-center gap-4 mt-6">
                        <span className="px-4 py-1.5 bg-white/10 rounded-full text-[12px] font-mono text-gray-300">ID: {product?.barcode}</span>
                        <span className="px-4 py-1.5 bg-pastel-blueDark rounded-full text-[12px] font-bold">COST: ฿{product?.costPrice}</span>
                      </div>
                  </div>
                  <button onClick={() => setStep('scan')} className="p-4 bg-white/10 rounded-3xl hover:bg-white/20 transition-all"><X size={28}/></button>
              </div>
          </div>

          <div className="p-12 space-y-12">
              <div className="grid grid-cols-2 gap-8">
                  <button onClick={() => setStatus(QCStatus.PASS)} className={`p-12 rounded-[3.5rem] border-4 flex flex-col items-center gap-6 transition-all ${status === QCStatus.PASS ? 'border-green-500 bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400 scale-[1.05] shadow-2xl' : 'border-gray-50 dark:border-gray-700 opacity-30 grayscale'}`}>
                      <CheckCircle2 size={64} />
                      <span className="text-sm font-black uppercase tracking-widest">ผ่าน (Pass)</span>
                  </button>
                  <button onClick={() => setStatus(QCStatus.DAMAGE)} className={`p-12 rounded-[3.5rem] border-4 flex flex-col items-center gap-6 transition-all ${status === QCStatus.DAMAGE ? 'border-red-500 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400 scale-[1.05] shadow-2xl' : 'border-gray-50 dark:border-gray-700 opacity-30 grayscale'}`}>
                      <AlertTriangle size={64} />
                      <span className="text-sm font-black uppercase tracking-widest">ชำรุด (Damage)</span>
                  </button>
              </div>

              <div className="space-y-4">
                  <label className="text-[12px] font-black uppercase text-gray-400 ml-6 tracking-[0.4em]">ราคาขายที่พบ (Selling Price)</label>
                  <div className="relative">
                      <span className="absolute left-10 top-1/2 -translate-y-1/2 text-5xl font-bold text-gray-300 transition-colors">฿</span>
                      <input 
                        type="number" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)}
                        className="w-full pl-24 pr-10 py-10 bg-gray-50 dark:bg-gray-900 rounded-[3.5rem] text-6xl font-mono font-black outline-none border-none focus:ring-4 focus:ring-pastel-blueDark/10 text-gray-800 dark:text-white"
                        placeholder="0.00"
                      />
                  </div>
              </div>

              {status === QCStatus.DAMAGE && (
                  <div className="space-y-8 p-10 bg-gray-50 dark:bg-gray-900 rounded-[3.5rem] border border-red-50 dark:border-red-900/10">
                      <div className="space-y-3">
                        <label className="text-[11px] font-black uppercase text-red-500/70 ml-2 tracking-widest">สาเหตุความชำรุด</label>
                        <select value={reason} onChange={e => setReason(e.target.value)} className="w-full p-6 rounded-[2rem] bg-white dark:bg-gray-800 outline-none text-base font-bold border-none shadow-sm">
                            <option value="">-- เลือกสาเหตุที่พบ --</option>
                            {REASON_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[11px] font-black uppercase text-gray-400 ml-2 tracking-widest">รูปถ่ายหลักฐาน ({images.length}/5)</label>
                        <div className="flex flex-wrap gap-5">
                            {images.length < 5 && (
                              <label className="w-28 h-28 rounded-[2rem] border-4 border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center text-gray-300 cursor-pointer hover:border-pastel-blueDark hover:text-pastel-blueDark transition-all">
                                  <Camera size={40} />
                                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                      if (e.target.files?.[0]) {
                                          const img = await compressImage(e.target.files[0]);
                                          setImages([...images, img]);
                                      }
                                  }} />
                              </label>
                            )}
                            {images.map((img, idx) => (
                                <div key={idx} className="relative w-28 h-28 rounded-[2rem] overflow-hidden shadow-xl border-4 border-white dark:border-gray-700">
                                    <img src={img} className="w-full h-full object-cover" />
                                    <button onClick={() => setImages(images.filter((_, i) => i !== idx))} className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-2xl shadow-lg hover:scale-110 transition-all"><X size={16}/></button>
                                </div>
                            ))}
                        </div>
                      </div>
                  </div>
              )}

              <button 
                onClick={handleSubmit} disabled={isSaving} 
                className="w-full py-10 rounded-[4rem] bg-gradient-to-r from-pastel-blueDark to-blue-600 text-white font-black text-2xl shadow-2xl shadow-blue-500/40 active:scale-95 transition-all flex items-center justify-center gap-6 disabled:opacity-50"
              >
                  {isSaving ? <Loader2 className="animate-spin" size={32} /> : <>บันทึกผลตรวจสอบ <Zap size={28} fill="currentColor" /></>}
              </button>
          </div>
        </div>
      )}

      {showScanner && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black animate-fade-in">
          <div className="p-10 flex justify-between items-center text-white bg-gradient-to-b from-black to-transparent">
            <div>
                <h3 className="font-black tracking-[0.3em] uppercase text-sm flex items-center gap-3"><Scan size={24} className="text-pastel-blueDark" /> Vision AI Scan</h3>
            </div>
            <button onClick={stopScanner} className="p-5 bg-white/10 rounded-[2rem] hover:bg-white/20 transition-all"><X size={32} /></button>
          </div>
          <div id="reader" className="flex-1 w-full bg-black"></div>
          <div className="p-12 flex flex-col items-center gap-10 bg-gradient-to-t from-black to-transparent">
            <button 
                onClick={analyzeWithAi} 
                disabled={isAiProcessing}
                className="bg-white text-black px-16 py-6 rounded-[3rem] flex items-center gap-4 font-black transition-all active:scale-95 shadow-[0_0_50px_rgba(255,255,255,0.3)]"
            >
                {isAiProcessing ? <Loader2 size={28} className="animate-spin" /> : <Sparkles size={28} className="text-pastel-blueDark" />}
                <span className="text-base uppercase tracking-widest">{isAiProcessing ? 'Identifying...' : 'AI Vision Assistance'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
