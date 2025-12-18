
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { fetchMasterDataBatch, submitQCAndRemoveProduct, compressImage, fetchCloudStats } from '../services/db';
import { ProductMaster, QCStatus } from '../types';
import { useAuth } from '../context/AuthContext';
// Added Box to the imported icons from lucide-react
import { Scan, Camera, X, CheckCircle2, AlertTriangle, Loader2, Sparkles, Zap, AlertCircle, Timer, RefreshCw, Database, ClipboardCheck, Layers, ListChecks, Search, Box } from 'lucide-react';
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
  const [hasInitialized, setHasInitialized] = useState(false);

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

  const initData = useCallback(async (force = false) => {
    if (hasInitialized && !force) return;
    setIsSyncing(true);
    try {
        const stats = await fetchCloudStats();
        setCloudStats(stats);
        const data = await fetchMasterDataBatch(force);
        setCachedProducts(data);
        setHasInitialized(true);
    } catch (e) {
        console.error("Init Data Failed:", e);
    } finally {
        setIsSyncing(false);
    }
  }, [hasInitialized]);

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
    setShowScanner(true);
    setScannerStatus('scanning');
    setTimeout(async () => {
        try {
            const html5QrCode = new Html5Qrcode("reader");
            html5QrCodeRef.current = html5QrCode;
            await html5QrCode.start(
                { facingMode: "environment" }, 
                { fps: 20, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    setScannerStatus('success');
                    processBarcode(decodedText);
                    // Reset status after a short delay in batch mode
                    if (isBatchMode) {
                        setTimeout(() => setScannerStatus('scanning'), 1500);
                    }
                },
                () => {
                    // This is called constantly when no code is found
                }
            );
        } catch (err) {
            alert("ไม่สามารถเปิดกล้องได้ กรุณาตรวจสอบสิทธิ์การเข้าถึง");
            setShowScanner(false);
        }
    }, 200);
  };

  const analyzeWithAi = async (file?: File) => {
    let base64Data = "";
    
    setIsAiProcessing(true);
    try {
        if (file) {
            // Case: Upload from file
            const compressed = await compressImage(file);
            base64Data = compressed.split(',')[1];
        } else {
            // Case: Direct from scanner video
            const video = document.querySelector('#reader video') as HTMLVideoElement;
            if (!video) throw new Error("No video stream");
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d')?.drawImage(video, 0, 0);
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
            if (!blob) throw new Error("Canvas failed");
            const base64 = await compressImage(blob);
            base64Data = base64.split(',')[1];
        }
        
        // Correct implementation of GoogleGenAI client initialization and usage
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { 
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Data } }, 
                    { text: 'Identify the product barcode and name from this image. Return JSON format with barcode and name keys.' }
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
            setErrors({ scan: "AI ไม่พบรหัสบาร์โค้ด" });
        }
    } catch (e) {
        setErrors({ scan: "AI ผิดพลาด กรุณาลองใหม่อีกครั้ง" });
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
            // Check if already in queue to avoid duplicates
            if (!batchQueue.find(p => p.barcode === found.barcode)) {
                setBatchQueue(prev => [found, ...prev]);
                // Visual feedback could be added here
            }
        } else {
            stopScanner();
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
            setErrors({ scan: `ไม่พบรหัส "${cleanCode}" ในคลังสินค้า` });
        }
        setScannerStatus('error');
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
        window.scrollTo({ top: 0, behavior: 'smooth' });
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

        // Remove from local cache and batch queue if exists
        const updatedCache = cachedProducts.filter(p => p.barcode !== product.barcode);
        setCachedProducts(updatedCache);
        
        if (isBatchMode) {
            const updatedBatch = batchQueue.filter(p => p.barcode !== product.barcode);
            setBatchQueue(updatedBatch);
            if (updatedBatch.length > 0) {
                setStep('batch_list');
            } else {
                setStep('scan');
            }
        } else {
            setStep('scan');
        }

        setCloudStats(prev => ({ ...prev, total: prev.total - 1, checked: prev.checked + 1 }));
        setProduct(null);
        setErrors({});
    } catch (e: any) { 
        alert(`❌ ผิดพลาด: ${e.message}`); 
    } finally { setIsSaving(false); }
  };

  return (
    <div className="max-w-4xl mx-auto pb-24 px-4 animate-fade-in space-y-6">
      
      {isSyncing && (
          <div className="fixed inset-0 z-[300] bg-white/95 dark:bg-gray-900/95 flex flex-col items-center justify-center p-8 text-center">
              <div className="bg-white dark:bg-gray-800 p-12 rounded-[4rem] shadow-2xl border border-gray-100 flex flex-col items-center gap-8 max-w-sm w-full animate-slide-up">
                  <div className="w-16 h-16 rounded-full border-4 border-pastel-blueDark border-t-transparent animate-spin" />
                  <div className="space-y-2">
                      <h3 className="text-xl font-black text-gray-800 dark:text-white uppercase">Syncing Cloud</h3>
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">กำลังดึงคลังสินค้า...</p>
                  </div>
              </div>
          </div>
      )}

      {step === 'scan' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-500">
                      <Database size={20} />
                  </div>
                  <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Inventory</p>
                      <p className="text-lg font-black text-gray-800 dark:text-white">{cloudStats.total.toLocaleString()}</p>
                  </div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-xl text-green-500">
                      <ClipboardCheck size={20} />
                  </div>
                  <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Checked</p>
                      <p className="text-lg font-black text-gray-800 dark:text-white">{cloudStats.checked.toLocaleString()}</p>
                  </div>
              </div>
              <div className="hidden md:flex bg-pastel-blueDark p-5 rounded-[2rem] shadow-lg text-white items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-xl">
                      <Timer size={20} />
                  </div>
                  <div>
                      <p className="text-[9px] font-black text-blue-100 uppercase tracking-widest">Queue</p>
                      <p className="text-lg font-black">{cachedProducts.length.toLocaleString()}</p>
                  </div>
              </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-[3.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            <div className="p-10 flex flex-col items-center justify-center gap-8">
                <div className="relative group" onClick={startScanner}>
                    <div className="p-12 md:p-14 bg-gradient-to-br from-pastel-blueDark to-blue-800 rounded-[4.5rem] shadow-2xl text-white active:scale-95 transition-all cursor-pointer relative z-10">
                        <Scan size={70} strokeWidth={1.5} />
                    </div>
                    {/* Ripple animation */}
                    <div className="absolute inset-0 bg-blue-400 rounded-[4.5rem] animate-ping opacity-20" />
                </div>

                <div className="text-center space-y-2">
                    <h2 className="text-2xl font-display font-bold text-gray-800 dark:text-white uppercase tracking-tight">Scanner Mode</h2>
                    <div className="flex gap-2 justify-center">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsBatchMode(!isBatchMode); }}
                            className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${isBatchMode ? 'bg-pastel-blueDark text-white shadow-lg' : 'bg-gray-100 text-gray-400'}`}
                        >
                            <Layers size={14} /> Batch Mode {isBatchMode ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>

                <div className="w-full max-w-sm space-y-4">
                    <div className="relative">
                        <input
                          type="text" value={barcode}
                          onChange={(e) => setBarcode(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && processBarcode(barcode)}
                          placeholder="สแกน หรือ พิมพ์รหัส..."
                          className="w-full pl-6 pr-14 py-5 text-lg rounded-[2rem] bg-gray-50 dark:bg-gray-900 shadow-inner border-none focus:ring-4 focus:ring-pastel-blueDark/10 transition-all font-mono dark:text-white"
                        />
                        <button onClick={startScanner} className="absolute right-2 top-1/2 -translate-y-1/2 bg-pastel-blueDark text-white p-3.5 rounded-2xl">
                            <Camera size={20} />
                        </button>
                    </div>

                    {batchQueue.length > 0 && (
                        <button onClick={() => setStep('batch_list')} className="w-full py-4 bg-green-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 animate-bounce-soft">
                            <ListChecks size={18} /> จัดการคิว ({batchQueue.length})
                        </button>
                    )}

                    <div className="flex justify-center pt-2">
                        <button onClick={() => initData(true)} className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase tracking-widest hover:text-pastel-blueDark transition-all">
                            <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} /> Force Update List
                        </button>
                    </div>

                    {errors.scan && (
                        <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-[11px] font-bold flex items-center gap-3 border border-red-100">
                            <AlertCircle size={18} /> {errors.scan}
                        </div>
                    )}
                </div>
            </div>
            
            {/* AI Image Analysis Support */}
            <div className="bg-gray-50 dark:bg-gray-900/50 p-8 border-t border-gray-100 flex flex-col items-center gap-4">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">
                    <Sparkles size={14} className="text-pastel-blueDark" /> AI Image Helper
                </div>
                <div className="flex gap-3 w-full max-w-sm">
                    <label className="flex-1 bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 p-4 rounded-3xl flex flex-col items-center gap-2 cursor-pointer hover:border-pastel-blueDark transition-all">
                        <Camera size={24} className="text-gray-300" />
                        <span className="text-[9px] font-bold text-gray-400 uppercase">Analysis Photo</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && analyzeWithAi(e.target.files[0])} />
                    </label>
                </div>
                {isAiProcessing && (
                    <div className="flex items-center gap-2 text-pastel-blueDark animate-pulse">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-[10px] font-black uppercase">Gemini is thinking...</span>
                    </div>
                )}
            </div>
          </div>
        </div>
      ) : step === 'batch_list' ? (
        <div className="space-y-6 animate-slide-up">
            <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm">
                <div>
                    <h2 className="text-xl font-bold dark:text-white">Batch Queue</h2>
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{batchQueue.length} items waiting</p>
                </div>
                <button onClick={() => setStep('scan')} className="bg-pastel-blueDark text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg">Back to Scan</button>
            </div>

            <div className="grid gap-3">
                {batchQueue.map((item) => (
                    <div key={item.barcode} onClick={() => handleBatchItemSubmit(item)} className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] border border-gray-100 flex items-center justify-between group active:scale-95 transition-all cursor-pointer hover:border-pastel-blueDark">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-gray-300">
                                <Box size={24} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold dark:text-white group-hover:text-pastel-blueDark transition-colors">{item.productName}</h3>
                                <p className="text-[10px] font-mono text-gray-400">{item.barcode}</p>
                            </div>
                        </div>
                        <Zap size={20} className="text-gray-100 group-hover:text-yellow-400" />
                    </div>
                ))}
            </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-[3.5rem] shadow-2xl overflow-hidden animate-slide-up border border-gray-100">
          <div className="bg-gray-900 p-10 text-white relative">
              <div className="flex justify-between items-start">
                  <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-pastel-blue">Processing Details</p>
                      <h2 className="text-2xl font-bold leading-tight max-w-[280px]">{product?.productName}</h2>
                      <div className="flex items-center gap-2 mt-4">
                        <span className="px-3 py-1 bg-white/10 rounded-full text-[9px] font-mono text-gray-300">{product?.barcode}</span>
                        <span className="px-3 py-1 bg-pastel-blueDark rounded-full text-[9px] font-bold">COST: ฿{product?.costPrice}</span>
                      </div>
                  </div>
                  <button onClick={() => setStep(isBatchMode ? 'batch_list' : 'scan')} className="p-3 bg-white/10 rounded-2xl hover:bg-white/20 transition-all"><X size={20}/></button>
              </div>
          </div>

          <div className="p-8 space-y-10">
              {(errors.price || errors.reason) && (
                  <div className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 text-xs font-bold space-y-1">
                      {errors.price && <p className="flex items-center gap-2"><AlertCircle size={14}/> {errors.price}</p>}
                      {errors.reason && <p className="flex items-center gap-2"><AlertCircle size={14}/> {errors.reason}</p>}
                  </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => { setStatus(QCStatus.PASS); setErrors({}); }} className={`p-8 rounded-[2.5rem] border-4 flex flex-col items-center gap-3 transition-all ${status === QCStatus.PASS ? 'border-green-500 bg-green-50 text-green-700 scale-[1.03]' : 'border-gray-50 opacity-30 grayscale'}`}>
                      <CheckCircle2 size={40} />
                      <span className="text-[10px] font-black uppercase tracking-widest">ผ่าน (Pass)</span>
                  </button>
                  <button onClick={() => { setStatus(QCStatus.DAMAGE); setErrors({}); }} className={`p-8 rounded-[2.5rem] border-4 flex flex-col items-center gap-3 transition-all ${status === QCStatus.DAMAGE ? 'border-red-500 bg-red-50 text-red-700 scale-[1.03]' : 'border-gray-50 opacity-30 grayscale'}`}>
                      <AlertTriangle size={40} />
                      <span className="text-[10px] font-black uppercase tracking-widest">ชำรุด (Damage)</span>
                  </button>
              </div>

              <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-4">ราคาขายที่พบ (Selling Price)</label>
                  <div className="relative">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-300">฿</span>
                      <input 
                        type="number" step="0.01" value={sellingPrice} onChange={e => { setSellingPrice(e.target.value); setErrors(prev => ({...prev, price: ''})); }}
                        className={`w-full pl-14 pr-8 py-7 bg-gray-50 dark:bg-gray-900 rounded-[2.5rem] text-3xl font-mono font-black outline-none border-none focus:ring-4 focus:ring-pastel-blueDark/10 dark:text-white ${errors.price ? 'ring-2 ring-red-300' : ''}`}
                        placeholder="0.00"
                      />
                  </div>
              </div>

              {status === QCStatus.DAMAGE && (
                  <div className="space-y-6 p-8 bg-gray-50 dark:bg-gray-900 rounded-[2.5rem] border border-red-50 animate-fade-in">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase text-red-500/70 ml-2">สาเหตุความชำรุด *</label>
                        <select 
                            value={reason} 
                            onChange={e => { setReason(e.target.value); setErrors(prev => ({...prev, reason: ''})); }} 
                            className="w-full p-4 rounded-xl bg-white dark:bg-gray-800 outline-none text-xs font-bold shadow-sm"
                        >
                            <option value="">-- เลือกสาเหตุ --</option>
                            {REASON_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[9px] font-black uppercase text-gray-400 ml-2">รูปถ่าย ({images.length}/5)</label>
                        <div className="flex flex-wrap gap-3">
                            {images.length < 5 && (
                              <label className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 bg-white flex items-center justify-center text-gray-300 cursor-pointer">
                                  <Camera size={24} />
                                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                      if (e.target.files?.[0]) {
                                          const img = await compressImage(e.target.files[0]);
                                          setImages([...images, img]);
                                      }
                                  }} />
                              </label>
                            )}
                            {images.map((img, idx) => (
                                <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border-2 border-white shadow-sm">
                                    <img src={img} className="w-full h-full object-cover" />
                                    <button onClick={() => setImages(images.filter((_, i) => i !== idx))} className="absolute top-0.5 right-0.5 p-1 bg-red-500 text-white rounded-lg"><X size={10}/></button>
                                </div>
                            ))}
                        </div>
                      </div>
                  </div>
              )}

              <button 
                onClick={handleSubmit} disabled={isSaving} 
                className="w-full py-7 rounded-[3rem] bg-gradient-to-r from-pastel-blueDark to-blue-600 text-white font-black text-lg shadow-xl shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
              >
                  {isSaving ? <Loader2 className="animate-spin" size={24} /> : <>บันทึกผลตรวจสอบ <Zap size={20} fill="currentColor" /></>}
              </button>
          </div>
        </div>
      )}

      {showScanner && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black overflow-hidden animate-fade-in">
          <div className="p-8 flex justify-between items-center text-white bg-gradient-to-b from-black/80 to-transparent z-20">
            <div className="flex flex-col">
                <h3 className="font-black tracking-widest uppercase text-[10px] flex items-center gap-2"><Scan size={16} className="text-pastel-blueDark" /> Vision Scanner</h3>
                <p className="text-[9px] text-gray-400 font-bold">{isBatchMode ? 'BATCH MODE ACTIVE' : 'SINGLE MODE'}</p>
            </div>
            <button onClick={stopScanner} className="p-4 bg-white/10 rounded-2xl active:scale-90 transition-all"><X size={24} /></button>
          </div>

          <div className="flex-1 w-full bg-black relative flex items-center justify-center">
              <div id="reader" className="w-full h-full"></div>
              
              {/* Enhanced UI Overlays */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                  {/* Viewfinder Border */}
                  <div className={`w-64 h-64 border-2 rounded-[2rem] transition-all duration-300 ${scannerStatus === 'success' ? 'border-green-500 scale-110' : scannerStatus === 'error' ? 'border-red-500 animate-shake' : 'border-white/40'}`}>
                      {/* Scan Line Animation */}
                      {scannerStatus === 'scanning' && (
                          <div className="w-full h-1 bg-gradient-to-r from-transparent via-pastel-blue to-transparent shadow-[0_0_15px_rgba(3,105,161,0.8)] absolute top-0 left-0 animate-[scan_2s_infinite]" style={{
                              animation: 'scan 2.5s ease-in-out infinite'
                          }} />
                      )}
                  </div>
              </div>

              {/* Status Indicator Bubble */}
              <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20">
                  <div className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-2xl flex items-center gap-2 border transition-all ${
                      scannerStatus === 'scanning' ? 'bg-black/60 text-white border-white/20' :
                      scannerStatus === 'success' ? 'bg-green-500 text-white border-green-400' :
                      'bg-red-500 text-white border-red-400'
                  }`}>
                      {scannerStatus === 'scanning' ? <><Loader2 size={12} className="animate-spin" /> Scanning...</> :
                       scannerStatus === 'success' ? <><CheckCircle2 size={12} /> Code Found!</> :
                       <><AlertCircle size={12} /> Invalid Code</>}
                  </div>
              </div>
          </div>

          <div className="p-10 flex flex-col items-center gap-4 bg-gradient-to-t from-black/80 to-transparent z-20 pb-safe">
            {isBatchMode && batchQueue.length > 0 && (
                <div className="bg-green-500/20 text-green-400 px-4 py-1.5 rounded-full text-[9px] font-black uppercase mb-2">
                    Queue: {batchQueue.length} items
                </div>
            )}
            <button 
                onClick={(e) => { e.stopPropagation(); analyzeWithAi(); }} 
                disabled={isAiProcessing}
                className="bg-white text-black px-12 py-5 rounded-[2.5rem] flex items-center gap-3 font-black transition-all active:scale-95 shadow-2xl"
            >
                {isAiProcessing ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} className="text-pastel-blueDark" />}
                <span className="text-xs uppercase tracking-widest">AI Extraction</span>
            </button>
          </div>
          
          <style>{`
            @keyframes scan {
                0% { top: 0; opacity: 0; }
                10% { opacity: 1; }
                90% { opacity: 1; }
                100% { top: 100%; opacity: 0; }
            }
            #reader video {
                object-fit: cover !important;
            }
          `}</style>
        </div>
      )}
    </div>
  );
};
