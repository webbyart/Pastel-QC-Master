
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { fetchMasterDataBatch, submitQCAndRemoveProduct, compressImage, fetchCloudStats } from '../services/db';
import { ProductMaster, QCStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { 
  Scan, Camera, X, CheckCircle2, AlertTriangle, Loader2, 
  Sparkles, Zap, AlertCircle, Timer, RefreshCw, Database, 
  ClipboardCheck, Layers, ListChecks, Search, Box, 
  ChevronRight, CameraIcon, Image as ImageIcon
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
  const isMounted = useRef(false);
  const hasLoadedData = useRef(false);

  // Batch Mode States
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchQueue, setBatchQueue] = useState<ProductMaster[]>([]);
  
  // UI States
  const [isSaving, setIsSaving] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [scannerMsg, setScannerMsg] = useState('กำลังเตรียมกล้อง...');
  
  // Form States
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [status, setStatus] = useState<QCStatus>(QCStatus.PASS);
  const [reason, setReason] = useState('');
  const [remark, setRemark] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [errors, setErrors] = useState<{[key:string]: string}>({});

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // ฟังก์ชันโหลดข้อมูล - แก้ไข Infinite Loop โดยใช้ useRef ควบคุม
  const initData = useCallback(async (force = false) => {
    if (hasLoadedData.current && !force) return;
    
    setIsSyncing(true);
    try {
        const stats = await fetchCloudStats();
        setCloudStats(stats);
        const data = await fetchMasterDataBatch(force);
        setCachedProducts(data || []);
        hasLoadedData.current = true;
    } catch (e) {
        console.error("Init Data Failed:", e);
    } finally {
        setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (!isMounted.current) {
        initData();
        isMounted.current = true;
    }
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
    setScannerMsg('กำลังค้นหาบาร์โค้ด...');
    
    // หน่วงเวลาเล็กน้อยเพื่อให้ Element พร้อม
    setTimeout(async () => {
        try {
            const html5QrCode = new Html5Qrcode("reader");
            html5QrCodeRef.current = html5QrCode;
            await html5QrCode.start(
                { facingMode: "environment" }, 
                { fps: 20, qrbox: { width: 250, height: 200 } },
                (decodedText) => {
                    setScannerStatus('success');
                    setScannerMsg('พบรหัสสินค้าแล้ว!');
                    processBarcode(decodedText);
                    
                    if (isBatchMode) {
                        // ถ้าเป็นโหมด Batch ให้สแกนต่อหลังจากดีเลย์ 1.5 วิ
                        setTimeout(() => {
                            if (showScanner) {
                                setScannerStatus('scanning');
                                setScannerMsg('สแกนรายการถัดไป...');
                            }
                        }, 1500);
                    } else {
                        stopScanner();
                    }
                },
                () => {
                    // Scanning...
                }
            );
        } catch (err) {
            alert("ไม่สามารถเปิดกล้องได้ กรุณาใช้ Chrome หรือ Edge และอนุญาตสิทธิ์กล้อง");
            setShowScanner(false);
        }
    }, 300);
  };

  // AI Extraction ฟังก์ชัน
  const analyzeWithAi = async (file?: File) => {
    let base64Data = "";
    setIsAiProcessing(true);
    try {
        if (file) {
            // ถ่ายรูปหรือเลือกไฟล์
            const compressed = await compressImage(file);
            base64Data = compressed.split(',')[1];
        } else {
            // จับภาพจากสแกนเนอร์ปัจจุบัน
            const video = document.querySelector('#reader video') as HTMLVideoElement;
            if (!video) throw new Error("Video stream missing");
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d')?.drawImage(video, 0, 0);
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
            if (!blob) throw new Error("Capture failed");
            const base64 = await compressImage(blob);
            base64Data = base64.split(',')[1];
        }
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { 
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Data } }, 
                    { text: 'Identify the product barcode and name from this image. Return strictly JSON format with barcode and name keys.' }
                ] 
            },
            config: { 
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        barcode: { type: Type.STRING },
                        name: { type: Type.STRING }
                    },
                    required: ['barcode']
                }
            }
        });

        const result = JSON.parse(response.text || '{}');
        if (result.barcode) {
            processBarcode(result.barcode);
            if (!file) stopScanner();
        } else {
            alert("AI ไม่พบรหัสบาร์โค้ดในภาพ กรุณาลองใหม่");
        }
    } catch (e) {
        alert("AI ผิดพลาด: " + (e instanceof Error ? e.message : "ไม่ทราบสาเหตุ"));
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
            setErrors({});
        }
    } else {
        if (!isBatchMode) {
            setErrors({ scan: `ไม่พบสินค้าบาร์โค้ด: ${cleanCode}` });
            setScannerStatus('error');
            setScannerMsg('ไม่พบรหัสสินค้าในคลัง');
        }
    }
  };

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
    
    const newErrors: {[key:string]: string} = {};
    const price = parseFloat(sellingPrice);
    
    if (isNaN(price)) newErrors.price = 'กรุณาระบุราคาขาย';
    if (status === QCStatus.DAMAGE && !reason) newErrors.reason = 'กรุณาระบุสาเหตุ';

    if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
    }

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
            lotNo: product.lotNo || '',
            productType: product.productType || '',
        });

        // Update lists
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
      
      {/* Syncing Overlay */}
      {isSyncing && (
          <div className="fixed inset-0 z-[300] bg-white/95 dark:bg-gray-900/95 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-full border-4 border-pastel-blueDark border-t-transparent animate-spin mb-6" />
              <h3 className="text-xl font-black text-gray-800 dark:text-white uppercase">Syncing Cloud</h3>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-2">กรุณารอสักครู่ รายการสินค้ากำลังโหลด...</p>
          </div>
      )}

      {step === 'scan' ? (
        <div className="space-y-6">
          {/* Dashboard Stats Small */}
          <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-500"><Database size={20} /></div>
                  <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Inventory</p>
                      <p className="text-lg font-black text-gray-800 dark:text-white">{cloudStats.total.toLocaleString()}</p>
                  </div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-xl text-green-500"><ClipboardCheck size={20} /></div>
                  <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Checked</p>
                      <p className="text-lg font-black text-gray-800 dark:text-white">{cloudStats.checked.toLocaleString()}</p>
                  </div>
              </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-[3.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            <div className="p-10 flex flex-col items-center justify-center gap-8">
                {/* Main Scan Button */}
                <div className="relative group" onClick={startScanner}>
                    <div className="p-12 md:p-14 bg-gradient-to-br from-pastel-blueDark to-blue-800 rounded-[4.5rem] shadow-2xl text-white active:scale-95 transition-all cursor-pointer relative z-10">
                        <Scan size={70} strokeWidth={1.5} />
                    </div>
                    <div className="absolute inset-0 bg-blue-400 rounded-[4.5rem] animate-ping opacity-20" />
                </div>

                <div className="text-center space-y-4">
                    <h2 className="text-2xl font-display font-bold text-gray-800 dark:text-white uppercase tracking-tight">เลือกวิธีการสแกน</h2>
                    
                    <div className="flex gap-3 justify-center">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsBatchMode(!isBatchMode); }}
                            className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${isBatchMode ? 'bg-pastel-blueDark text-white shadow-lg shadow-blue-500/30' : 'bg-gray-100 text-gray-400'}`}
                        >
                            <Layers size={14} /> สแกนต่อเนื่อง (Batch): {isBatchMode ? 'เปิด' : 'ปิด'}
                        </button>
                    </div>
                </div>

                <div className="w-full max-w-sm space-y-4">
                    {/* Manual Input Area */}
                    <div className="relative">
                        <input
                          type="text" value={barcode}
                          onChange={(e) => setBarcode(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && processBarcode(barcode)}
                          placeholder="พิมพ์บาร์โค้ดสินค้า..."
                          className="w-full pl-6 pr-14 py-5 text-lg rounded-[2rem] bg-gray-50 dark:bg-gray-900 shadow-inner border-none focus:ring-4 focus:ring-pastel-blueDark/10 transition-all font-mono dark:text-white"
                        />
                        <button onClick={startScanner} className="absolute right-2 top-1/2 -translate-y-1/2 bg-pastel-blueDark text-white p-3.5 rounded-2xl shadow-lg">
                            <Camera size={20} />
                        </button>
                    </div>

                    {/* Batch Queue Button */}
                    {batchQueue.length > 0 && (
                        <button onClick={() => setStep('batch_list')} className="w-full py-5 bg-green-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 animate-bounce-soft">
                            <ListChecks size={20} /> จัดการคิวรอตรวจ ({batchQueue.length})
                        </button>
                    )}

                    {errors.scan && (
                        <div className="bg-red-50 text-red-600 p-5 rounded-2xl text-[11px] font-bold flex items-center gap-3 border border-red-100 animate-slide-up">
                            <AlertCircle size={18} /> {errors.scan}
                        </div>
                    )}
                </div>
            </div>
            
            {/* AI Photo Section */}
            <div className="bg-gray-50 dark:bg-gray-900/50 p-10 border-t border-gray-100 flex flex-col items-center gap-4">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">
                    <Sparkles size={14} className="text-amber-500" /> AI Vision Extraction
                </div>
                
                <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                    <label className="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 p-6 rounded-[2rem] flex flex-col items-center gap-3 cursor-pointer hover:border-pastel-blueDark transition-all group">
                        <CameraIcon size={28} className="text-gray-300 group-hover:text-pastel-blueDark" />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">ถ่ายรูป AI</span>
                        <input type="file" capture="environment" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && analyzeWithAi(e.target.files[0])} />
                    </label>
                    <label className="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 p-6 rounded-[2rem] flex flex-col items-center gap-3 cursor-pointer hover:border-pastel-blueDark transition-all group">
                        <ImageIcon size={28} className="text-gray-300 group-hover:text-pastel-blueDark" />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">เลือกจากคลัง</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && analyzeWithAi(e.target.files[0])} />
                    </label>
                </div>

                {isAiProcessing && (
                    <div className="flex items-center gap-3 text-pastel-blueDark mt-4">
                        <Loader2 size={18} className="animate-spin" />
                        <span className="text-[11px] font-black uppercase tracking-widest animate-pulse">Gemini กำลังวิเคราะห์ข้อมูล...</span>
                    </div>
                )}
            </div>
          </div>
          
          {/* Browser Recommendation */}
          <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-[2rem] border border-blue-100 flex gap-4 items-center">
             <AlertCircle className="text-blue-500 shrink-0" size={24} />
             <div>
                <p className="text-xs font-bold text-blue-800 dark:text-blue-300">เปิดแอปใน Chrome หรือ Edge เพื่อประสิทธิภาพสูงสุด</p>
                <p className="text-[10px] text-blue-600 dark:text-blue-400 opacity-80">หากเปิดจาก LINE/FB กรุณากดปุ่ม 3 จุด แล้วเลือก "เปิดในเบราว์เซอร์ปกติ"</p>
             </div>
          </div>
        </div>
      ) : step === 'batch_list' ? (
        <div className="space-y-6 animate-slide-up">
            <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm">
                <div>
                    <h2 className="text-xl font-bold dark:text-white">คิวสินค้าที่สแกนแล้ว</h2>
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{batchQueue.length} รายการรอตรวจสอบ</p>
                </div>
                <button onClick={() => setStep('scan')} className="bg-pastel-blueDark text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg">กลับไปสแกนต่อ</button>
            </div>

            <div className="grid gap-4">
                {batchQueue.map((item) => (
                    <div key={item.barcode} onClick={() => handleBatchItemSubmit(item)} className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] border border-gray-100 flex items-center justify-between group active:scale-95 transition-all cursor-pointer hover:border-pastel-blueDark">
                        <div className="flex items-center gap-5">
                            <div className="w-14 h-14 bg-gray-50 dark:bg-gray-900 rounded-2xl flex items-center justify-center text-gray-300">
                                <Box size={28} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold dark:text-white group-hover:text-pastel-blueDark transition-colors">{item.productName}</h3>
                                <p className="text-[10px] font-mono text-gray-400 mt-1">Barcode: {item.barcode}</p>
                            </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-full text-gray-300 group-hover:text-pastel-blueDark transition-colors">
                            <ChevronRight size={20} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-[3.5rem] shadow-2xl overflow-hidden animate-slide-up border border-gray-100">
          <div className="bg-gray-900 p-10 text-white relative">
              <div className="flex justify-between items-start">
                  <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-pastel-blue">QC Processing</p>
                      <h2 className="text-2xl font-bold leading-tight max-w-[280px]">{product?.productName}</h2>
                      <div className="flex items-center gap-3 mt-5">
                        <span className="px-4 py-1.5 bg-white/10 rounded-full text-[10px] font-mono text-gray-300">{product?.barcode}</span>
                        <span className="px-4 py-1.5 bg-pastel-blueDark rounded-full text-[10px] font-bold">COST: ฿{product?.costPrice}</span>
                      </div>
                  </div>
                  <button onClick={() => setStep(isBatchMode ? 'batch_list' : 'scan')} className="p-4 bg-white/10 rounded-2xl hover:bg-white/20 transition-all"><X size={24}/></button>
              </div>
          </div>

          <div className="p-10 space-y-12">
              <div className="grid grid-cols-2 gap-5">
                  <button onClick={() => { setStatus(QCStatus.PASS); setErrors({}); }} className={`p-10 rounded-[3rem] border-4 flex flex-col items-center gap-4 transition-all ${status === QCStatus.PASS ? 'border-green-500 bg-green-50 text-green-700 scale-[1.03] shadow-xl shadow-green-200' : 'border-gray-50 opacity-30 grayscale'}`}>
                      <CheckCircle2 size={48} />
                      <span className="text-xs font-black uppercase tracking-widest">ผ่าน (Pass)</span>
                  </button>
                  <button onClick={() => { setStatus(QCStatus.DAMAGE); setErrors({}); }} className={`p-10 rounded-[3rem] border-4 flex flex-col items-center gap-4 transition-all ${status === QCStatus.DAMAGE ? 'border-red-500 bg-red-50 text-red-700 scale-[1.03] shadow-xl shadow-red-200' : 'border-gray-50 opacity-30 grayscale'}`}>
                      <AlertTriangle size={48} />
                      <span className="text-xs font-black uppercase tracking-widest">ชำรุด (Damage)</span>
                  </button>
              </div>

              <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-6">ราคาขายที่พบ (Selling Price)</label>
                  <div className="relative">
                      <span className="absolute left-8 top-1/2 -translate-y-1/2 text-3xl font-bold text-gray-300">฿</span>
                      <input 
                        type="number" step="0.01" value={sellingPrice} onChange={e => { setSellingPrice(e.target.value); setErrors(prev => ({...prev, price: ''})); }}
                        className={`w-full pl-16 pr-10 py-8 bg-gray-50 dark:bg-gray-900 rounded-[2.5rem] text-4xl font-mono font-black outline-none border-none focus:ring-4 focus:ring-pastel-blueDark/10 dark:text-white ${errors.price ? 'ring-2 ring-red-300' : ''}`}
                        placeholder="0.00"
                      />
                  </div>
              </div>

              {status === QCStatus.DAMAGE && (
                  <div className="space-y-8 p-10 bg-gray-50 dark:bg-gray-900 rounded-[3rem] border border-red-50 animate-fade-in shadow-inner">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-red-500/70 ml-2">ระบุสาเหตุความชำรุด *</label>
                        <select 
                            value={reason} 
                            onChange={e => { setReason(e.target.value); setErrors(prev => ({...prev, reason: ''})); }} 
                            className="w-full p-5 rounded-2xl bg-white dark:bg-gray-800 outline-none text-sm font-bold shadow-sm"
                        >
                            <option value="">-- เลือกสาเหตุ --</option>
                            {REASON_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase text-gray-400 ml-2">แนบรูปถ่าย (สูงสุด 5 รูป)</label>
                        <div className="flex flex-wrap gap-4">
                            {images.length < 5 && (
                              <label className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-200 bg-white dark:bg-gray-800 flex items-center justify-center text-gray-300 cursor-pointer active:scale-95 transition-all">
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
                className="w-full py-8 rounded-[3rem] bg-gradient-to-r from-pastel-blueDark to-blue-600 text-white font-black text-xl shadow-2xl shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
              >
                  {isSaving ? <Loader2 className="animate-spin" size={28} /> : <>บันทึกผลตรวจสอบ <Zap size={24} fill="currentColor" /></>}
              </button>
          </div>
        </div>
      )}

      {/* Enhanced Scanner UI */}
      {showScanner && (
        <div className="fixed inset-0 z-[400] flex flex-col bg-black overflow-hidden animate-fade-in">
          {/* Top Control Bar */}
          <div className="p-8 flex justify-between items-center text-white bg-gradient-to-b from-black/80 to-transparent z-20">
            <div className="flex flex-col">
                <h3 className="font-black tracking-widest uppercase text-[10px] flex items-center gap-2"><Scan size={16} className="text-pastel-blue" /> Smart Vision Scan</h3>
                <p className="text-[9px] text-gray-400 font-bold">{isBatchMode ? 'โหมดสแกนรัว (BATCH ACTIVE)' : 'โหมดสแกนทีละชิ้น'}</p>
            </div>
            <button onClick={stopScanner} className="p-4 bg-white/10 rounded-2xl active:scale-90 transition-all"><X size={28} /></button>
          </div>

          {/* Scanner Viewfinder Area */}
          <div className="flex-1 w-full bg-black relative flex items-center justify-center">
              <div id="reader" className="w-full h-full"></div>
              
              {/* Target Overlays */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                  <div className={`w-72 h-48 border-2 rounded-[2.5rem] transition-all duration-300 relative ${
                      scannerStatus === 'success' ? 'border-green-500 scale-110' : 
                      scannerStatus === 'error' ? 'border-red-500 animate-shake' : 
                      'border-white/40'
                  }`}>
                      {/* Corner Accents */}
                      <div className="absolute -top-1 -left-1 w-10 h-10 border-t-4 border-l-4 border-pastel-blue rounded-tl-[2.5rem]" />
                      <div className="absolute -top-1 -right-1 w-10 h-10 border-t-4 border-r-4 border-pastel-blue rounded-tr-[2.5rem]" />
                      <div className="absolute -bottom-1 -left-1 w-10 h-10 border-b-4 border-l-4 border-pastel-blue rounded-bl-[2.5rem]" />
                      <div className="absolute -bottom-1 -right-1 w-10 h-10 border-b-4 border-r-4 border-pastel-blue rounded-br-[2.5rem]" />
                      
                      {/* Scanning Line Animation */}
                      {scannerStatus === 'scanning' && (
                          <div className="w-full h-1.5 bg-gradient-to-r from-transparent via-pastel-blue to-transparent shadow-[0_0_20px_rgba(14,165,233,0.8)] absolute top-0 left-0 animate-[scan_2s_infinite]" style={{
                              animation: 'scan 2s ease-in-out infinite'
                          }} />
                      )}
                  </div>
              </div>

              {/* Status Message Overlay */}
              <div className="absolute bottom-40 left-1/2 -translate-x-1/2 z-20 w-full max-w-[280px] text-center">
                  <div className={`px-8 py-3 rounded-full text-[11px] font-black uppercase tracking-widest shadow-2xl inline-flex items-center gap-3 border transition-all ${
                      scannerStatus === 'scanning' ? 'bg-black/60 text-white border-white/20' :
                      scannerStatus === 'success' ? 'bg-green-500 text-white border-green-400' :
                      'bg-red-500 text-white border-red-400'
                  }`}>
                      {scannerStatus === 'scanning' ? <Loader2 size={14} className="animate-spin" /> :
                       scannerStatus === 'success' ? <CheckCircle2 size={14} /> :
                       <AlertCircle size={14} />}
                      {scannerMsg}
                  </div>
              </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="p-12 flex flex-col items-center gap-6 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-20 pb-safe">
            {isBatchMode && batchQueue.length > 0 && (
                <div className="bg-green-500/20 text-green-400 px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest mb-2 border border-green-500/30">
                    Queue: {batchQueue.length} items
                </div>
            )}
            
            <div className="flex gap-4 w-full max-w-sm">
                <button 
                    onClick={(e) => { e.stopPropagation(); analyzeWithAi(); }} 
                    disabled={isAiProcessing}
                    className="flex-1 bg-white text-black py-6 rounded-[2.5rem] flex items-center justify-center gap-4 font-black transition-all active:scale-95 shadow-2xl shadow-white/10"
                >
                    {isAiProcessing ? <Loader2 size={24} className="animate-spin" /> : <Sparkles size={24} className="text-amber-500" />}
                    <div className="text-left">
                        <p className="text-[11px] uppercase tracking-wider">AI Scan</p>
                        <p className="text-[8px] text-gray-500 uppercase">วิเคราะห์ภาพ</p>
                    </div>
                </button>
                
                <button 
                    onClick={stopScanner}
                    className="flex-1 bg-white/10 text-white py-6 rounded-[2.5rem] flex items-center justify-center gap-4 font-black transition-all active:scale-95 border border-white/10"
                >
                    <X size={24} />
                    <div className="text-left">
                        <p className="text-[11px] uppercase tracking-wider">Cancel</p>
                        <p className="text-[8px] text-gray-400 uppercase">ปิดหน้าจอ</p>
                    </div>
                </button>
            </div>
          </div>
          
          <style>{`
            @keyframes scan {
                0% { top: 0%; opacity: 0; }
                15% { opacity: 1; }
                85% { opacity: 1; }
                100% { top: 100%; opacity: 0; }
            }
            #reader video {
                object-fit: cover !important;
                width: 100% !important;
                height: 100% !important;
            }
          `}</style>
        </div>
      )}
    </div>
  );
};
