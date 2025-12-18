
import React, { useState, useRef, useEffect } from 'react';
import { fetchMasterDataBatch, submitQCAndRemoveProduct, compressImage, updateLocalMasterDataCache, fetchCloudStats } from '../services/db';
import { ProductMaster, QCStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { Scan, Camera, X, CheckCircle2, AlertTriangle, Loader2, Sparkles, Zap, AlertCircle, Timer, RefreshCw, Database, ClipboardCheck } from 'lucide-react';
import { Html5Qrcode } from "html5-qrcode";
import { GoogleGenAI, Type } from "@google/genai";

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
    // โหลดครั้งเดียวตอนเข้าหน้าจอ ถ้ามี Cache จะแสดงทันที ข้อมูลไม่หายเมื่อสลับหน้า
    initData(false);
  }, []);

  const initData = async (force = false) => {
    if (cachedProducts.length > 0 && !force) return;
    setIsSyncing(true);
    try {
        const stats = await fetchCloudStats();
        setCloudStats(stats);
        
        // ดึงสินค้าสูงสุด 1000 รายการ เก็บไว้ในเครื่องเพื่อความเร็ว
        const data = await fetchMasterDataBatch(force);
        setCachedProducts(data);
    } catch (e) {
        console.error("Init Data Failed:", e);
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
                { fps: 20, qrbox: { width: 260, height: 180 } }, // ปรับขนาดให้เหมาะกับมือถือ
                (decodedText) => processBarcode(decodedText),
                () => {}
            );
        } catch (err) {
            alert("ไม่สามารถเปิดกล้องได้ กรุณาตรวจสอบสิทธิ์การเข้าถึง");
            setShowScanner(false);
        }
    }, 200);
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
        
        // Fix: Created a new instance and used responseSchema for structured data as per guidelines
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { 
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Data } }, 
                    { text: 'Identify the product barcode from this image.' }
                ] 
            },
            config: { 
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        barcode: {
                            type: Type.STRING,
                            description: 'The extracted barcode alphanumeric string'
                        }
                    },
                    required: ['barcode']
                }
            }
        });

        const result = JSON.parse(response.text || '{}');
        if (result.barcode) processBarcode(result.barcode);
        else setErrors({ scan: "AI ไม่พบรหัสบาร์โค้ด" });
    } catch (e) {
        setErrors({ scan: "AI ผิดพลาด กรุณาสแกนใหม่" });
    } finally {
        setIsAiProcessing(false);
    }
  };

  const processBarcode = async (code: string) => {
    const cleanCode = String(code).trim();
    if (!cleanCode) return;
    
    // ค้นหาจากรายการ 1000 รายการที่โหลดไว้ในเครื่อง
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
      setErrors({ scan: `ไม่พบรหัส "${cleanCode}" ในคิวสินค้า 1,000 รายการปัจจุบัน` });
    }
  };

  const handleSubmit = async () => {
    if (!product || !user) return;
    const price = parseFloat(sellingPrice);
    if (isNaN(price)) { setErrors({ price: 'กรุณาระบุราคาขาย' }); return; }

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

        // อัปเดตรายการในเครื่องทันที
        const updatedList = cachedProducts.filter(p => p.barcode !== product.barcode);
        setCachedProducts(updatedList);
        setCloudStats(prev => ({ ...prev, total: prev.total - 1, checked: prev.checked + 1 }));

        setStep('scan');
        setBarcode('');
        setProduct(null);
    } catch (e: any) { 
        alert(`ผิดพลาด: ${e.message}`); 
    } finally { setIsSaving(false); }
  };

  return (
    <div className="max-w-4xl mx-auto pb-24 px-4 animate-fade-in space-y-8">
      
      {/* Syncing Overlay */}
      {isSyncing && (
          <div className="fixed inset-0 z-[300] bg-white/95 dark:bg-gray-900/95 flex flex-col items-center justify-center p-8 text-center animate-fade-in">
              <div className="bg-white dark:bg-gray-800 p-12 rounded-[4rem] shadow-2xl border border-gray-100 flex flex-col items-center gap-8 max-w-sm w-full animate-slide-up">
                  <div className="w-16 h-16 rounded-full border-4 border-pastel-blueDark border-t-transparent animate-spin" />
                  <div className="space-y-2">
                      <h3 className="text-xl font-black text-gray-800 dark:text-white uppercase">Syncing Cloud</h3>
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">กำลังดึงสินค้า 1,000 รายการ...</p>
                  </div>
              </div>
          </div>
      )}

      {step === 'scan' ? (
        <div className="space-y-8">
          {/* Live Stats Panel */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-2xl text-blue-500">
                      <Database size={24} />
                  </div>
                  <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">สินค้า Cloud</p>
                      <p className="text-xl font-black text-gray-800 dark:text-white">{cloudStats.total.toLocaleString()}</p>
                  </div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="p-4 bg-green-50 dark:bg-green-900/30 rounded-2xl text-green-500">
                      <ClipboardCheck size={24} />
                  </div>
                  <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">ตรวจแล้ว</p>
                      <p className="text-xl font-black text-gray-800 dark:text-white">{cloudStats.checked.toLocaleString()}</p>
                  </div>
              </div>
              <div className="col-span-2 md:col-span-1 bg-pastel-blueDark p-6 rounded-[2.5rem] shadow-xl text-white flex items-center gap-4">
                  <div className="p-4 bg-white/20 rounded-2xl">
                      <Timer size={24} />
                  </div>
                  <div>
                      <p className="text-[10px] font-black text-blue-100 uppercase tracking-widest">คิวในเครื่อง (Max 1000)</p>
                      <p className="text-xl font-black">{cachedProducts.length.toLocaleString()}</p>
                  </div>
              </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-10 py-10 bg-white dark:bg-gray-800 rounded-[4rem] shadow-sm border border-gray-100">
            <div className="relative p-12 md:p-16 bg-gradient-to-br from-pastel-blueDark to-blue-800 rounded-[5rem] shadow-2xl text-white active:scale-95 transition-all">
                <Scan size={80} strokeWidth={1.5} />
                <div className="absolute -top-2 -right-2 bg-red-500 w-6 h-6 rounded-full animate-ping opacity-75" />
            </div>

            <div className="text-center space-y-2 px-6">
                <h2 className="text-3xl font-display font-bold text-gray-800 dark:text-white">QC MASTER PROCESS</h2>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.4em]">Local Queue Sync Enabled</p>
            </div>
            
            <div className="w-full max-w-md px-8 space-y-6">
                <div className="relative group">
                    <input
                      type="text" autoFocus value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && processBarcode(barcode)}
                      placeholder="สแกน หรือ พิมพ์รหัส..."
                      className="w-full pl-8 pr-16 py-6 text-xl rounded-[2rem] bg-gray-50 dark:bg-gray-900 shadow-inner border-none focus:ring-4 focus:ring-pastel-blueDark/10 transition-all font-mono"
                    />
                    <button onClick={startScanner} className="absolute right-3 top-1/2 -translate-y-1/2 bg-pastel-blueDark text-white p-4 rounded-2xl shadow-lg">
                        <Camera size={24} />
                    </button>
                </div>

                <div className="flex justify-center">
                    <button onClick={() => initData(true)} className="flex items-center gap-3 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-pastel-blueDark transition-all">
                        <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} /> Force Update Queue
                    </button>
                </div>

                {errors.scan && (
                <div className="bg-red-50 dark:bg-red-900/10 text-red-600 p-4 rounded-2xl text-[11px] font-bold flex items-center gap-3 border border-red-100">
                    <AlertCircle size={20} className="flex-shrink-0" />
                    <span>{errors.scan}</span>
                </div>
                )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-[4rem] shadow-2xl overflow-hidden animate-slide-up border border-gray-100">
          <div className="bg-gray-900 p-10 text-white relative">
              <div className="flex justify-between items-start">
                  <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-pastel-blue">Detected Item</p>
                      <h2 className="text-3xl font-bold leading-tight max-w-[300px]">{product?.productName}</h2>
                      <div className="flex items-center gap-3 mt-4">
                        <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-mono text-gray-300">ID: {product?.barcode}</span>
                        <span className="px-3 py-1 bg-pastel-blueDark rounded-full text-[10px] font-bold">COST: ฿{product?.costPrice}</span>
                      </div>
                  </div>
                  <button onClick={() => setStep('scan')} className="p-3 bg-white/10 rounded-2xl hover:bg-white/20"><X size={24}/></button>
              </div>
          </div>

          <div className="p-8 md:p-12 space-y-10">
              <div className="grid grid-cols-2 gap-4 md:gap-8">
                  <button onClick={() => setStatus(QCStatus.PASS)} className={`p-8 md:p-12 rounded-[3rem] border-4 flex flex-col items-center gap-4 transition-all ${status === QCStatus.PASS ? 'border-green-500 bg-green-50 text-green-700 scale-[1.05]' : 'border-gray-50 opacity-30 grayscale'}`}>
                      <CheckCircle2 size={48} />
                      <span className="text-xs font-black uppercase tracking-widest">ผ่าน (Pass)</span>
                  </button>
                  <button onClick={() => setStatus(QCStatus.DAMAGE)} className={`p-8 md:p-12 rounded-[3rem] border-4 flex flex-col items-center gap-4 transition-all ${status === QCStatus.DAMAGE ? 'border-red-500 bg-red-50 text-red-700 scale-[1.05]' : 'border-gray-50 opacity-30 grayscale'}`}>
                      <AlertTriangle size={48} />
                      <span className="text-xs font-black uppercase tracking-widest">ชำรุด (Damage)</span>
                  </button>
              </div>

              <div className="space-y-4">
                  <label className="text-[11px] font-black uppercase text-gray-400 ml-4">ราคาขายที่พบ (Selling Price)</label>
                  <div className="relative">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-3xl font-bold text-gray-300">฿</span>
                      <input 
                        type="number" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)}
                        className="w-full pl-16 pr-8 py-8 bg-gray-50 dark:bg-gray-900 rounded-[3rem] text-4xl font-mono font-black outline-none border-none focus:ring-4 focus:ring-pastel-blueDark/10"
                        placeholder="0.00"
                      />
                  </div>
              </div>

              {status === QCStatus.DAMAGE && (
                  <div className="space-y-6 p-8 bg-gray-50 dark:bg-gray-900 rounded-[3rem] border border-red-50">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-red-500/70 ml-2">สาเหตุความชำรุด</label>
                        <select value={reason} onChange={e => setReason(e.target.value)} className="w-full p-5 rounded-2xl bg-white dark:bg-gray-800 outline-none text-sm font-bold border-none shadow-sm">
                            <option value="">-- เลือกสาเหตุ --</option>
                            {REASON_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase text-gray-400 ml-2">รูปถ่าย ({images.length}/5)</label>
                        <div className="flex flex-wrap gap-4">
                            {images.length < 5 && (
                              <label className="w-20 h-20 rounded-2xl border-4 border-dashed border-gray-200 bg-white flex items-center justify-center text-gray-300 cursor-pointer">
                                  <Camera size={28} />
                                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                      if (e.target.files?.[0]) {
                                          const img = await compressImage(e.target.files[0]);
                                          setImages([...images, img]);
                                      }
                                  }} />
                              </label>
                            )}
                            {images.map((img, idx) => (
                                <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-white">
                                    <img src={img} className="w-full h-full object-cover" />
                                    <button onClick={() => setImages(images.filter((_, i) => i !== idx))} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-lg"><X size={12}/></button>
                                </div>
                            ))}
                        </div>
                      </div>
                  </div>
              )}

              <button 
                onClick={handleSubmit} disabled={isSaving} 
                className="w-full py-8 rounded-[3.5rem] bg-gradient-to-r from-pastel-blueDark to-blue-600 text-white font-black text-xl shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
              >
                  {isSaving ? <Loader2 className="animate-spin" size={28} /> : <>บันทึกผลตรวจสอบ <Zap size={24} fill="currentColor" /></>}
              </button>
          </div>
        </div>
      )}

      {showScanner && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black">
          <div className="p-8 flex justify-between items-center text-white bg-gradient-to-b from-black to-transparent">
            <h3 className="font-black tracking-widest uppercase text-xs flex items-center gap-2"><Scan size={20} className="text-pastel-blueDark" /> Vision Scan</h3>
            <button onClick={stopScanner} className="p-4 bg-white/10 rounded-2xl"><X size={28} /></button>
          </div>
          <div id="reader" className="flex-1 w-full bg-black"></div>
          <div className="p-10 flex flex-col items-center gap-8 bg-gradient-to-t from-black to-transparent">
            <button 
                onClick={analyzeWithAi} 
                disabled={isAiProcessing}
                className="bg-white text-black px-12 py-5 rounded-[2.5rem] flex items-center gap-3 font-black transition-all active:scale-95"
            >
                {isAiProcessing ? <Loader2 size={24} className="animate-spin" /> : <Sparkles size={24} className="text-pastel-blueDark" />}
                <span className="text-sm uppercase tracking-widest">{isAiProcessing ? 'Thinking...' : 'AI Vision Helper'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
