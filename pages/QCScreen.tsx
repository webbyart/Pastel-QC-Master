
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { fetchMasterDataBatch, submitQCAndRemoveProduct, compressImage, fetchCloudStats } from '../services/db';
import { ProductMaster, QCStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { 
  Scan, Camera, X, CheckCircle2, AlertTriangle, Loader2, 
  Sparkles, Zap, AlertCircle, Timer, RefreshCw, Database, 
  ClipboardCheck, Layers, ListChecks, Box, 
  ChevronRight, CameraIcon, Image as ImageIcon, Focus
} from 'lucide-react';
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
  const [step, setStep] = useState<'scan' | 'form' | 'batch_list'>('scan');
  
  const [cachedProducts, setCachedProducts] = useState<ProductMaster[]>([]);
  const [cloudStats, setCloudStats] = useState({ remaining: 0, checked: 0, total: 0 });
  
  const [isSyncing, setIsSyncing] = useState(false);
  const hasLoaded = useRef(false);
  const loadingRef = useRef(false);

  // Batch Mode States
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchQueue, setBatchQueue] = useState<ProductMaster[]>([]);
  
  // UI States
  const [isSaving, setIsSaving] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  
  // Form States
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [status, setStatus] = useState<QCStatus>(QCStatus.PASS);
  const [reason, setReason] = useState('');
  const [remark, setRemark] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [errors, setErrors] = useState<{[key:string]: string}>({});

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // ฟังก์ชันโหลดข้อมูล - ป้องกัน Infinite Loop อย่างเข้มงวด
  const initData = useCallback(async (force = false) => {
    if ((hasLoaded.current || loadingRef.current) && !force) return;
    
    loadingRef.current = true;
    setIsSyncing(true);
    try {
        const stats = await fetchCloudStats();
        setCloudStats(stats);
        const data = await fetchMasterDataBatch(force);
        setCachedProducts(data || []);
        hasLoaded.current = true;
    } catch (e) {
        console.error("QC Init Failed:", e);
    } finally {
        setIsSyncing(false);
        loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    initData();
  }, [initData]);

  const stopScanner = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        try { await html5QrCodeRef.current.stop(); } catch (e) {}
    }
    setShowScanner(false);
    setScannerStatus('idle');
  };

  const startScanner = async () => {
    setErrors({});
    setShowScanner(true);
    setScannerStatus('scanning');
    
    setTimeout(async () => {
        try {
            const html5QrCode = new Html5Qrcode("reader");
            html5QrCodeRef.current = html5QrCode;
            await html5QrCode.start(
                { facingMode: "environment" }, 
                { fps: 24, qrbox: { width: 280, height: 180 } },
                (decodedText) => {
                    setScannerStatus('success');
                    processBarcode(decodedText);
                    if (!isBatchMode) stopScanner();
                },
                () => {} // Silent scan
            );
        } catch (err) {
            alert("กล้องขัดข้อง: กรุณาเปิดใน Chrome/Edge และอนุญาตสิทธิ์กล้อง");
            setShowScanner(false);
        }
    }, 400);
  };

  // AI OCR Precision Scan - ดึงข้อมูลบาร์โค้ดด้วยความแม่นยำสูงสุด
  const scanWithAiPrecision = async (file?: File) => {
    setIsAiProcessing(true);
    try {
        let base64Data = "";
        if (file) {
            const compressed = await compressImage(file);
            base64Data = compressed.split(',')[1];
        } else {
            // จับภาพจาก Video Stream ทันที
            const video = document.querySelector('#reader video') as HTMLVideoElement;
            if (!video) throw new Error("Video not ready");
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d')?.drawImage(video, 0, 0);
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
            if (!blob) throw new Error("Capture error");
            const compressed = await compressImage(blob);
            base64Data = compressed.split(',')[1];
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { 
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Data } }, 
                    { text: 'Extract ONLY the barcode numerical value from this image. If there are multiple, choose the one in focus. Output as JSON: {"barcode": "string"}' }
                ] 
            },
            config: { 
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: { barcode: { type: Type.STRING } },
                    required: ['barcode']
                }
            }
        });

        const result = JSON.parse(response.text || '{}');
        if (result.barcode) {
            setScannerStatus('success');
            processBarcode(result.barcode);
            if (!file) {
                // ให้เวลาผู้ใช้ดูผลนิดนึงก่อนปิด
                setTimeout(() => stopScanner(), 800);
            }
        } else {
            alert("AI ไม่สามารถระบุรหัสได้ กรุณาขยับกล้องให้ใกล้ขึ้น");
            setScannerStatus('error');
        }
    } catch (e) {
        alert("AI Processing Error: " + (e instanceof Error ? e.message : "Network error"));
    } finally {
        setIsAiProcessing(false);
    }
  };

  const processBarcode = (code: string) => {
    const cleanCode = String(code).trim();
    if (!cleanCode) return;
    
    const found = cachedProducts.find(p => p.barcode.toLowerCase() === cleanCode.toLowerCase());
    
    if (found) {
        if (isBatchMode) {
            if (!batchQueue.find(p => p.barcode === found.barcode)) {
                setBatchQueue(prev => [found, ...prev]);
            }
        } else {
            setProduct(found);
            setSellingPrice(found.unitPrice?.toString() || '');
            setStatus(QCStatus.PASS);
            setReason('');
            setRemark('');
            setImages([]);
            setStep('form');
        }
    } else {
        if (!isBatchMode) {
            setErrors({ scan: `ไม่พบสินค้า: ${cleanCode}` });
            setScannerStatus('error');
        }
    }
  };

  // Fix: Defined handleBatchItemSubmit to resolve the "Cannot find name 'handleBatchItemSubmit'" error
  const handleBatchItemSubmit = (item: ProductMaster) => {
    setProduct(item);
    setSellingPrice(item.unitPrice?.toString() || '');
    setStatus(QCStatus.PASS);
    setReason('');
    setRemark('');
    setImages([]);
    setStep('form');
  };

  const handleSubmit = async () => {
    if (!product || !user) return;
    setIsSaving(true);
    try {
        await submitQCAndRemoveProduct({
            barcode: product.barcode,
            productName: product.productName,
            costPrice: product.costPrice,
            sellingPrice: parseFloat(sellingPrice),
            status,
            reason,
            remark,
            imageUrls: images,
            inspectorId: user.username,
            lotNo: product.lotNo || '',
            productType: product.productType || '',
        });

        setCachedProducts(prev => prev.filter(p => p.barcode !== product.barcode));
        if (isBatchMode) {
            const updatedBatch = batchQueue.filter(p => p.barcode !== product.barcode);
            setBatchQueue(updatedBatch);
            setStep(updatedBatch.length > 0 ? 'batch_list' : 'scan');
        } else {
            setStep('scan');
        }

        setCloudStats(prev => ({ ...prev, total: prev.total - 1, checked: prev.checked + 1 }));
        setProduct(null);
    } catch (e: any) { 
        alert(`❌ Error: ${e.message}`); 
    } finally { setIsSaving(false); }
  };

  return (
    <div className="max-w-4xl mx-auto pb-24 px-4 animate-fade-in space-y-6">
      
      {isSyncing && (
          <div className="fixed inset-0 z-[500] bg-white/90 dark:bg-gray-900/95 backdrop-blur-sm flex flex-col items-center justify-center">
              <div className="relative">
                  <div className="w-20 h-20 rounded-full border-4 border-pastel-blueDark/20 border-t-pastel-blueDark animate-spin" />
                  <Database className="absolute inset-0 m-auto text-pastel-blueDark" size={24} />
              </div>
              <p className="mt-6 text-sm font-black text-gray-800 dark:text-white uppercase tracking-[0.2em] animate-pulse">Syncing Inventory...</p>
          </div>
      )}

      {step === 'scan' ? (
        <div className="space-y-6">
          {/* Main Dashboard Stats */}
          <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-2">
                  <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-500"><Database size={20} /></div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">สินค้าคงเหลือ</p>
                  <p className="text-2xl font-black text-gray-800 dark:text-white">{cloudStats.total.toLocaleString()}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-2">
                  <div className="w-10 h-10 bg-green-50 dark:bg-green-900/30 rounded-2xl flex items-center justify-center text-green-500"><ClipboardCheck size={20} /></div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">ตรวจแล้ววันนี้</p>
                  <p className="text-2xl font-black text-gray-800 dark:text-white">{cloudStats.checked.toLocaleString()}</p>
              </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-[3.5rem] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col">
            <div className="p-12 flex flex-col items-center justify-center gap-10">
                {/* Central Scan Pulse */}
                <div className="relative" onClick={startScanner}>
                    <div className="p-14 md:p-16 bg-gradient-to-br from-pastel-blueDark to-blue-900 rounded-[4.5rem] shadow-2xl text-white active:scale-95 transition-all cursor-pointer relative z-10 border-4 border-white dark:border-gray-700">
                        <Focus size={80} strokeWidth={1} />
                    </div>
                    <div className="absolute inset-0 bg-blue-400 rounded-[4.5rem] animate-ping opacity-20" />
                    <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-700 px-6 py-2 rounded-full shadow-lg border border-gray-100 z-20">
                        <span className="text-[10px] font-black text-pastel-blueDark uppercase tracking-widest">TAP TO SCAN</span>
                    </div>
                </div>

                <div className="w-full max-w-sm space-y-6">
                    <div className="flex gap-2 justify-center">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsBatchMode(!isBatchMode); }}
                            className={`px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${isBatchMode ? 'bg-pastel-blueDark text-white shadow-xl shadow-blue-500/20' : 'bg-gray-100 dark:bg-gray-900 text-gray-400'}`}
                        >
                            <Layers size={14} /> โหมดสแกนต่อเนื่อง: {isBatchMode ? 'เปิด' : 'ปิด'}
                        </button>
                    </div>

                    <div className="relative">
                        <input
                          type="text" value={barcode}
                          onChange={(e) => setBarcode(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && processBarcode(barcode)}
                          placeholder="พิมพ์รหัสบาร์โค้ด..."
                          className="w-full pl-6 pr-16 py-6 text-xl rounded-[2.5rem] bg-gray-50 dark:bg-gray-900 shadow-inner border-none focus:ring-4 focus:ring-pastel-blueDark/10 transition-all font-mono dark:text-white"
                        />
                        <button onClick={startScanner} className="absolute right-3 top-1/2 -translate-y-1/2 bg-pastel-blueDark text-white p-4 rounded-[1.5rem] shadow-lg">
                            <Camera size={22} />
                        </button>
                    </div>

                    {batchQueue.length > 0 && (
                        <button onClick={() => setStep('batch_list')} className="w-full py-5 bg-green-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-3 animate-bounce-soft">
                            <ListChecks size={22} /> จัดการคิว ({batchQueue.length})
                        </button>
                    )}

                    {errors.scan && (
                        <div className="bg-red-50 text-red-600 p-5 rounded-2xl text-[11px] font-bold flex items-center gap-3 border border-red-100 animate-slide-up">
                            <AlertCircle size={20} /> {errors.scan}
                        </div>
                    )}
                </div>
            </div>
            
            {/* AI Vision Support Section */}
            <div className="bg-gray-50 dark:bg-gray-900/40 p-10 border-t border-gray-100 dark:border-gray-700 flex flex-col items-center gap-6">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                    <Sparkles size={16} className="text-amber-500" /> AI-Powered Accuracy
                </div>
                
                <div className="flex gap-4 w-full max-w-sm">
                    <label className="flex-1 bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 p-8 rounded-[2.5rem] flex flex-col items-center gap-3 cursor-pointer hover:border-pastel-blueDark transition-all group active:scale-95">
                        <div className="w-14 h-14 bg-amber-50 dark:bg-amber-900/20 rounded-2xl flex items-center justify-center text-amber-500">
                             <CameraIcon size={32} />
                        </div>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">AI SNAPSHOT</span>
                        <input type="file" capture="environment" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && scanWithAiPrecision(e.target.files[0])} />
                    </label>
                    
                    <label className="flex-1 bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 p-8 rounded-[2.5rem] flex flex-col items-center gap-3 cursor-pointer hover:border-pastel-blueDark transition-all group active:scale-95">
                        <div className="w-14 h-14 bg-pastel-blue/50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-pastel-blueDark">
                             <ImageIcon size={32} />
                        </div>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">FROM GALLERY</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && scanWithAiPrecision(e.target.files[0])} />
                    </label>
                </div>

                {isAiProcessing && (
                    <div className="flex items-center gap-4 text-pastel-blueDark">
                        <Loader2 size={20} className="animate-spin" />
                        <span className="text-[11px] font-black uppercase tracking-[0.2em] animate-pulse">Gemini กำลังสกัดเลขบาร์โค้ด...</span>
                    </div>
                )}
            </div>
          </div>
        </div>
      ) : step === 'batch_list' ? (
        <div className="space-y-6 animate-slide-up">
            <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm">
                <div>
                    <h2 className="text-xl font-bold dark:text-white">Batch Queue</h2>
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{batchQueue.length} รายการสแกนค้างไว้</p>
                </div>
                <button onClick={() => setStep('scan')} className="bg-gray-100 dark:bg-gray-900 text-gray-500 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm">Back to Scan</button>
            </div>

            <div className="grid gap-4">
                {batchQueue.map((item) => (
                    <div key={item.barcode} onClick={() => handleBatchItemSubmit(item)} className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 flex items-center justify-between group active:scale-95 transition-all cursor-pointer hover:border-pastel-blueDark">
                        <div className="flex items-center gap-6">
                            <div className="w-16 h-16 bg-gray-50 dark:bg-gray-900 rounded-[1.5rem] flex items-center justify-center text-gray-300">
                                <Box size={32} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold dark:text-white group-hover:text-pastel-blueDark transition-colors line-clamp-1">{item.productName}</h3>
                                <p className="text-[10px] font-mono text-gray-400 mt-1">Barcode: {item.barcode}</p>
                            </div>
                        </div>
                        <ChevronRight className="text-gray-200" size={24} />
                    </div>
                ))}
            </div>
        </div>
      ) : (
        /* Form Step - Unchanged but ensure no loop */
        <div className="bg-white dark:bg-gray-800 rounded-[3.5rem] shadow-2xl overflow-hidden animate-slide-up border border-gray-100 dark:border-gray-700">
          <div className="bg-gray-900 p-10 text-white">
              <div className="flex justify-between items-start">
                  <div className="space-y-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-pastel-blue">Processing Quality Control</p>
                      <h2 className="text-2xl font-bold leading-tight max-w-[300px]">{product?.productName}</h2>
                      <div className="flex items-center gap-3 mt-6">
                        <span className="px-4 py-2 bg-white/10 rounded-full text-[11px] font-mono text-gray-300 border border-white/5">{product?.barcode}</span>
                        <span className="px-4 py-2 bg-pastel-blueDark rounded-full text-[11px] font-black">COST: ฿{product?.costPrice}</span>
                      </div>
                  </div>
                  <button onClick={() => setStep(isBatchMode ? 'batch_list' : 'scan')} className="p-4 bg-white/10 rounded-2xl"><X size={24}/></button>
              </div>
          </div>

          <div className="p-10 space-y-12">
              <div className="grid grid-cols-2 gap-6">
                  <button onClick={() => setStatus(QCStatus.PASS)} className={`p-10 rounded-[3rem] border-4 flex flex-col items-center gap-4 transition-all ${status === QCStatus.PASS ? 'border-green-500 bg-green-50 text-green-700 scale-[1.03] shadow-xl' : 'border-gray-50 opacity-20'}`}>
                      <CheckCircle2 size={50} />
                      <span className="text-xs font-black uppercase tracking-widest">ผ่าน (Pass)</span>
                  </button>
                  <button onClick={() => setStatus(QCStatus.DAMAGE)} className={`p-10 rounded-[3rem] border-4 flex flex-col items-center gap-4 transition-all ${status === QCStatus.DAMAGE ? 'border-red-500 bg-red-50 text-red-700 scale-[1.03] shadow-xl' : 'border-gray-50 opacity-20'}`}>
                      <AlertTriangle size={50} />
                      <span className="text-xs font-black uppercase tracking-widest">ชำรุด (Damage)</span>
                  </button>
              </div>

              <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-6">ราคาขายที่พบ (Selling Price)</label>
                  <div className="relative">
                      <span className="absolute left-8 top-1/2 -translate-y-1/2 text-3xl font-bold text-gray-300">฿</span>
                      <input 
                        type="number" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)}
                        className="w-full pl-18 pr-10 py-8 bg-gray-50 dark:bg-gray-900 rounded-[2.5rem] text-4xl font-mono font-black outline-none border-none dark:text-white"
                        placeholder="0.00"
                      />
                  </div>
              </div>

              {status === QCStatus.DAMAGE && (
                  <div className="space-y-8 p-10 bg-gray-50 dark:bg-gray-900 rounded-[3rem] animate-fade-in shadow-inner">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-red-500/70 ml-2">ระบุสาเหตุความชำรุด *</label>
                        <select 
                            value={reason} 
                            onChange={e => setReason(e.target.value)} 
                            className="w-full p-6 rounded-2xl bg-white dark:bg-gray-800 outline-none text-sm font-bold shadow-sm"
                        >
                            <option value="">-- เลือกสาเหตุ --</option>
                            {REASON_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase text-gray-400 ml-2">แนบรูปถ่ายหลักฐาน ({images.length}/5)</label>
                        <div className="flex flex-wrap gap-4">
                            {images.length < 5 && (
                              <label className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-200 bg-white dark:bg-gray-800 flex items-center justify-center text-gray-300 cursor-pointer active:scale-90 transition-all">
                                  <Camera size={32} />
                                  <input type="file" capture="environment" accept="image/*" className="hidden" onChange={async (e) => {
                                      if (e.target.files?.[0]) {
                                          const img = await compressImage(e.target.files[0]);
                                          setImages([...images, img]);
                                      }
                                  }} />
                              </label>
                            )}
                            {images.map((img, idx) => (
                                <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-white shadow-lg">
                                    <img src={img} className="w-full h-full object-cover" />
                                    <button onClick={() => setImages(images.filter((_, i) => i !== idx))} className="absolute top-1 right-1 p-1.5 bg-red-500 text-white rounded-xl shadow-lg"><X size={12}/></button>
                                </div>
                            ))}
                        </div>
                      </div>
                  </div>
              )}

              <button 
                onClick={handleSubmit} disabled={isSaving} 
                className="w-full py-8 rounded-[3rem] bg-gradient-to-r from-pastel-blueDark to-blue-600 text-white font-black text-xl shadow-2xl shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-4"
              >
                  {isSaving ? <Loader2 className="animate-spin" size={28} /> : <>บันทึกผลตรวจสอบ <Zap size={24} fill="currentColor" /></>}
              </button>
          </div>
        </div>
      )}

      {/* Futuristic Scanner UI */}
      {showScanner && (
        <div className="fixed inset-0 z-[1000] flex flex-col bg-black overflow-hidden animate-fade-in">
          <div className="p-8 flex justify-between items-center text-white bg-gradient-to-b from-black/90 to-transparent z-20">
            <div className="flex flex-col">
                <h3 className="font-black tracking-widest uppercase text-[10px] flex items-center gap-2"><Scan size={16} className="text-pastel-blue" /> AI Vision Engine</h3>
                <p className="text-[9px] text-gray-500 font-bold tracking-widest">{isBatchMode ? 'CONTINUOUS SCAN ENABLED' : 'PRECISION MODE'}</p>
            </div>
            <button onClick={stopScanner} className="p-4 bg-white/10 rounded-2xl active:scale-90 transition-all"><X size={28} /></button>
          </div>

          <div className="flex-1 w-full bg-black relative flex items-center justify-center">
              <div id="reader" className="w-full h-full"></div>
              
              {/* Vision Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                  <div className={`w-80 h-56 border-2 rounded-[3rem] transition-all duration-500 relative ${
                      scannerStatus === 'success' ? 'border-green-500 scale-110 shadow-[0_0_50px_rgba(34,197,94,0.3)]' : 
                      scannerStatus === 'error' ? 'border-red-500 animate-shake' : 
                      'border-pastel-blue/30 shadow-[0_0_30px_rgba(14,165,233,0.1)]'
                  }`}>
                      {/* Corner Accents */}
                      <div className="absolute -top-1 -left-1 w-12 h-12 border-t-4 border-l-4 border-pastel-blue rounded-tl-[3rem]" />
                      <div className="absolute -top-1 -right-1 w-12 h-12 border-t-4 border-r-4 border-pastel-blue rounded-tr-[3rem]" />
                      <div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-4 border-l-4 border-pastel-blue rounded-bl-[3rem]" />
                      <div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-4 border-r-4 border-pastel-blue rounded-br-[3rem]" />
                      
                      {/* High-Tech Scan Line */}
                      <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-pastel-blue/50 shadow-[0_0_15px_rgba(14,165,233,1)] animate-pulse" />
                      
                      {scannerStatus === 'scanning' && (
                          <div className="w-full h-1 bg-gradient-to-r from-transparent via-pastel-blue to-transparent absolute top-0 left-0 animate-[laserScan_2s_infinite]" />
                      )}
                  </div>
              </div>

              {/* Status Indicator */}
              <div className="absolute bottom-44 left-1/2 -translate-x-1/2 z-20">
                  <div className={`px-8 py-3 rounded-full text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl flex items-center gap-3 border backdrop-blur-md transition-all ${
                      scannerStatus === 'scanning' ? 'bg-black/60 text-white border-white/10' :
                      scannerStatus === 'success' ? 'bg-green-500 text-white border-green-400' :
                      'bg-red-600 text-white border-red-400'
                  }`}>
                      {scannerStatus === 'scanning' ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} fill="currentColor" />}
                      {scannerStatus === 'scanning' ? 'Scanning...' : scannerStatus === 'success' ? 'Identified' : 'Invalid Code'}
                  </div>
              </div>
          </div>

          <div className="p-10 flex flex-col items-center gap-6 bg-gradient-to-t from-black to-transparent z-20 pb-safe">
            <div className="flex gap-4 w-full max-w-sm">
                <button 
                    onClick={(e) => { e.stopPropagation(); scanWithAiPrecision(); }} 
                    disabled={isAiProcessing}
                    className="flex-1 bg-white text-black py-7 rounded-[2.5rem] flex flex-col items-center justify-center font-black transition-all active:scale-95 shadow-2xl relative overflow-hidden"
                >
                    {isAiProcessing ? (
                        <Loader2 size={32} className="animate-spin text-pastel-blueDark" />
                    ) : (
                        <>
                            <div className="flex items-center gap-3 mb-1">
                                <Sparkles size={24} className="text-amber-500" />
                                <span className="text-xs uppercase tracking-widest">AI SNAPSHOT</span>
                            </div>
                            <span className="text-[8px] text-gray-400 uppercase tracking-widest">Precision extraction</span>
                        </>
                    )}
                </button>
            </div>
            
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.3em] opacity-60">High-Precision Neural Recognition</p>
          </div>
          
          <style>{`
            @keyframes laserScan {
                0% { top: 0%; opacity: 0; }
                20% { opacity: 1; }
                80% { opacity: 1; }
                100% { top: 100%; opacity: 0; }
            }
            #reader video {
                object-fit: cover !important;
                width: 100% !important;
                height: 100% !important;
            }
            .animate-shake {
                animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
            }
            @keyframes shake {
                10%, 90% { transform: translate3d(-1px, 0, 0); }
                20%, 80% { transform: translate3d(2px, 0, 0); }
                30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
                40%, 60% { transform: translate3d(4px, 0, 0); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
};
