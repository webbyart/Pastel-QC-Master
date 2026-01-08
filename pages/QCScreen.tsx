
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { fetchMasterDataBatch, submitQCAndRemoveProduct, compressImage, fetchCloudStats } from '../services/db';
import { ProductMaster, QCStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { 
  Scan, Camera, X, CheckCircle2, AlertTriangle, Loader2, 
  Sparkles, Zap, AlertCircle, RefreshCw, Database, 
  Layers, ListChecks, Box, 
  ChevronRight, Image as ImageIcon,
  Cpu, QrCode, ArrowRight, History
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
                { fps: 24, qrbox: { width: 250, height: 250 } }, 
                (decodedText) => {
                    setScannerStatus('success');
                    // Play subtle sound or haptic feedback if possible
                    if (window.navigator.vibrate) window.navigator.vibrate(50);
                    processBarcode(decodedText);
                    if (!isBatchMode) {
                      setTimeout(() => stopScanner(), 500);
                    }
                },
                () => {} 
            );
        } catch (err) {
            console.error("Scanner Error:", err);
            setScannerStatus('error');
            alert("ไม่สามารถเข้าถึงกล้องได้: โปรดตรวจสอบการอนุญาตสิทธิ์");
            setShowScanner(false);
        }
    }, 400);
  };

  const scanWithAiNeural = async (file?: File) => {
    setIsAiProcessing(true);
    setScannerStatus('scanning');
    
    try {
        let base64Data = "";
        if (file) {
            const compressed = await compressImage(file);
            base64Data = compressed.split(',')[1];
        } else {
            const video = document.querySelector('#reader video') as HTMLVideoElement;
            if (!video) throw new Error("Camera not active");
            
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Canvas context failure");
            ctx.drawImage(video, 0, 0);
            
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
            if (!blob) throw new Error("Capture failure");
            const compressed = await compressImage(blob);
            base64Data = compressed.split(',')[1];
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { 
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Data } }, 
                    { text: 'Look closely at the product labels, QR codes, and barcodes in this image. Identify the unique product identifier or SKU number. Be precise. Return JSON only: {"id": "EXTRACTED_ID"}' }
                ] 
            },
            config: { 
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: { id: { type: Type.STRING } },
                    required: ['id']
                }
            }
        });

        const result = JSON.parse(response.text || '{}');
        const detectedCode = String(result.id || '').trim();

        if (detectedCode) {
            setScannerStatus('success');
            if (window.navigator.vibrate) window.navigator.vibrate([100, 50, 100]);
            processBarcode(detectedCode);
            if (!file) {
                setTimeout(() => stopScanner(), 800);
            }
        } else {
            setScannerStatus('error');
            alert("AI Neural ไม่สามารถระบุรหัสได้ชัดเจน โปรดขยับกล้องเข้าใกล้ฉลาก");
        }
    } catch (e) {
        setScannerStatus('error');
        alert("AI Processing Failed: " + (e instanceof Error ? e.message : "Network error"));
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
            setErrors({ scan: `ไม่พบข้อมูล: ${cleanCode}` });
            setScannerStatus('error');
            setBarcode(cleanCode);
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
    
    const parsedPrice = parseFloat(sellingPrice);
    if (isNaN(parsedPrice)) {
        alert("กรุณาระบุราคาขายที่ถูกต้อง");
        return;
    }

    setIsSaving(true);
    try {
        const record = {
            barcode: product.barcode,
            product_name: product.productName,
            cost_price: product.costPrice,
            selling_price: parsedPrice,
            status: status,
            reason: reason,
            remark: remark,
            image_urls: images,
            inspector_id: user.username,
            lot_no: product.lotNo || '',
            product_type: product.productType || '',
            timestamp: new Date().toISOString()
        };

        await submitQCAndRemoveProduct(record);
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
        setBarcode('');
    } catch (e: any) { 
        console.error("Submit Error:", e);
        alert(`เกิดข้อผิดพลาด: ${e.message}`); 
    } finally { setIsSaving(false); }
  };

  return (
    <div className="max-w-4xl mx-auto pb-32 px-4 animate-fade-in space-y-6">
      
      {isSyncing && (
          <div className="fixed inset-0 z-[500] bg-white/95 dark:bg-gray-900/98 backdrop-blur-md flex flex-col items-center justify-center">
              <div className="relative">
                  <div className="w-24 h-24 rounded-full border-4 border-pastel-blueDark/10 border-t-pastel-blueDark animate-spin" />
                  <Database className="absolute inset-0 m-auto text-pastel-blueDark animate-pulse" size={32} />
              </div>
              <p className="mt-8 text-sm font-black text-gray-800 dark:text-white uppercase tracking-[0.25em]">Syncing Master Ledger...</p>
          </div>
      )}

      {step === 'scan' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Stock</p>
                  <p className="text-2xl font-black text-gray-800 dark:text-white">{cloudStats.total.toLocaleString()}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Done</p>
                  <p className="text-2xl font-black text-gray-800 dark:text-white">{cloudStats.checked.toLocaleString()}</p>
              </div>
              <div className="hidden md:block bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Efficiency</p>
                  <p className="text-2xl font-black text-pastel-blueDark">98%</p>
              </div>
              <div className="hidden md:block bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Status</p>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-sm font-bold">ONLINE</span>
                  </div>
              </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-[3.5rem] shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden relative">
            <div className="p-10 md:p-16 flex flex-col items-center justify-center gap-10">
                <div className="relative group" onClick={startScanner}>
                    <div className="p-20 md:p-24 bg-gradient-to-tr from-pastel-blueDark to-blue-800 rounded-[6rem] shadow-2xl text-white active:scale-95 transition-all cursor-pointer relative z-10 border-8 border-white/20 dark:border-gray-700/50 flex flex-col items-center gap-4 group-hover:shadow-blue-500/40">
                        <Scan size={100} strokeWidth={1} className="group-hover:scale-110 transition-transform" />
                        <div className="flex gap-2">
                          <QrCode size={20} className="opacity-40" />
                          <div className="h-4 w-px bg-white/20" />
                          <Box size={20} className="opacity-40" />
                        </div>
                    </div>
                    <div className="absolute inset-0 bg-blue-500 rounded-[6rem] animate-ping opacity-10 pointer-events-none" />
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-700 px-10 py-4 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-600 z-20 whitespace-nowrap">
                        <span className="text-xs font-black text-pastel-blueDark dark:text-blue-300 uppercase tracking-[0.2em]">Launch Smart Scanner</span>
                    </div>
                </div>

                <div className="w-full max-w-md space-y-6 pt-6">
                    <div className="flex gap-3 justify-center">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsBatchMode(!isBatchMode); }}
                            className={`px-8 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-3 transition-all ${isBatchMode ? 'bg-pastel-blueDark text-white shadow-xl shadow-blue-500/30' : 'bg-gray-100 dark:bg-gray-900 text-gray-400 border border-gray-200 dark:border-gray-700'}`}
                        >
                            <Layers size={16} /> Batch Mode: {isBatchMode ? 'ACTIVE' : 'OFF'}
                        </button>
                    </div>

                    <div className="relative">
                        <input
                          type="text" value={barcode}
                          onChange={(e) => setBarcode(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && processBarcode(barcode)}
                          placeholder="SCAN OR TYPE SERIAL..."
                          className="w-full pl-8 pr-20 py-7 text-2xl rounded-[3rem] bg-gray-50 dark:bg-gray-900 shadow-inner border-2 border-transparent focus:border-pastel-blueDark/30 focus:ring-0 transition-all font-mono font-bold dark:text-white uppercase placeholder:opacity-30"
                        />
                        <button onClick={startScanner} className="absolute right-3 top-1/2 -translate-y-1/2 bg-pastel-blueDark text-white p-4 rounded-[1.5rem] shadow-xl hover:bg-blue-800 active:scale-90 transition-all">
                            <Camera size={28} />
                        </button>
                    </div>

                    {batchQueue.length > 0 && (
                        <button onClick={() => setStep('batch_list')} className="w-full py-6 bg-green-500 hover:bg-green-600 text-white rounded-[2.5rem] font-black text-sm uppercase tracking-[0.25em] shadow-xl shadow-green-500/20 flex items-center justify-center gap-4 transition-all">
                            <ListChecks size={24} /> Manage Queue ({batchQueue.length})
                        </button>
                    )}

                    {errors.scan && (
                        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-6 rounded-[2rem] text-xs font-bold flex flex-col gap-2 border border-red-100 dark:border-red-900/30 animate-slide-up">
                            <div className="flex items-center gap-3"><AlertCircle size={24} /> {errors.scan}</div>
                            <p className="text-[10px] opacity-60 uppercase tracking-widest pl-9">Serial not found in master database</p>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-900/60 p-12 border-t border-gray-100 dark:border-gray-700 flex flex-col items-center gap-10">
                <div className="flex items-center gap-4 text-xs font-black uppercase text-gray-400 tracking-[0.4em]">
                    <div className="h-px w-8 bg-gray-200 dark:bg-gray-700" />
                    <div className="flex items-center gap-2 text-amber-500">
                      <Cpu size={18} /> Neural Vision API
                    </div>
                    <div className="h-px w-8 bg-gray-200 dark:bg-gray-700" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-lg">
                    <button 
                        onClick={() => { setShowScanner(true); setTimeout(() => scanWithAiNeural(), 1000); }}
                        className="flex items-center gap-5 bg-white dark:bg-gray-800 border-2 border-amber-300 dark:border-amber-900/50 p-6 rounded-[2.5rem] transition-all active:scale-95 shadow-lg group"
                    >
                        <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center text-amber-500 group-hover:rotate-12 transition-transform">
                             <Sparkles size={32} />
                        </div>
                        <div className="text-left">
                            <span className="block text-xs font-black text-gray-800 dark:text-white uppercase tracking-wider">AI Neural Scan</span>
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Precision Identity</span>
                        </div>
                    </button>
                    
                    <label className="flex items-center gap-5 bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 p-6 rounded-[2.5rem] cursor-pointer active:scale-95 transition-all shadow-sm group">
                        <div className="w-16 h-16 bg-pastel-blue/50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-pastel-blueDark group-hover:-rotate-12 transition-transform">
                             <ImageIcon size={32} />
                        </div>
                        <div className="text-left">
                            <span className="block text-xs font-black text-gray-800 dark:text-white uppercase tracking-wider">Upload File</span>
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">OCR Extraction</span>
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && scanWithAiNeural(e.target.files[0])} />
                    </label>
                </div>

                {isAiProcessing && (
                    <div className="flex flex-col items-center gap-3 animate-fade-in">
                        <Loader2 size={32} className="animate-spin text-amber-500" />
                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] animate-pulse">Consulting Neural Engine...</span>
                    </div>
                )}
            </div>
          </div>
        </div>
      ) : step === 'batch_list' ? (
        <div className="space-y-6 animate-slide-up">
            <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-10 rounded-[3rem] shadow-xl border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-5">
                    <div className="p-4 bg-pastel-green/40 rounded-3xl text-pastel-greenDark">
                      <History size={32} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-800 dark:text-white uppercase tracking-tight">Pending Batch</h2>
                        <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">{batchQueue.length} items ready for verification</p>
                    </div>
                </div>
                <button onClick={() => setStep('scan')} className="bg-gray-100 dark:bg-gray-900 text-gray-500 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-colors">Close</button>
            </div>

            <div className="grid gap-4">
                {batchQueue.map((item, index) => (
                    <div 
                      key={item.barcode} 
                      onClick={() => handleBatchItemSubmit(item)} 
                      className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] border border-gray-100 dark:border-gray-700 flex items-center justify-between group active:scale-[0.98] transition-all cursor-pointer hover:border-pastel-blueDark/30"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                        <div className="flex items-center gap-8">
                            <div className="w-20 h-20 bg-gray-50 dark:bg-gray-900 rounded-[2rem] flex items-center justify-center text-gray-300 group-hover:bg-pastel-blue/30 group-hover:text-pastel-blueDark transition-colors">
                                <Box size={40} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-gray-800 dark:text-white group-hover:text-pastel-blueDark transition-colors">{item.productName}</h3>
                                <div className="flex items-center gap-3 mt-1.5">
                                  <span className="text-[11px] font-mono text-gray-400 bg-gray-50 dark:bg-gray-900/50 px-2 py-0.5 rounded">ID: {item.barcode}</span>
                                  <span className="text-[11px] font-black text-pastel-blueDark uppercase tracking-widest">฿{item.unitPrice?.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl group-hover:translate-x-1 transition-transform">
                          <ArrowRight className="text-gray-300 group-hover:text-pastel-blueDark" size={24} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-[4rem] shadow-2xl overflow-hidden animate-slide-up border border-gray-100 dark:border-gray-700">
          <div className="bg-gray-900 p-12 text-white relative">
              <div className="absolute top-0 right-0 p-20 bg-blue-500/10 blur-[100px] rounded-full" />
              <div className="flex justify-between items-start relative z-10">
                  <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full bg-pastel-blueDark animate-pulse" />
                        <p className="text-[11px] font-black uppercase tracking-[0.4em] text-blue-400">Inventory Verification</p>
                      </div>
                      <h2 className="text-3xl font-black leading-tight max-w-md tracking-tight">{product?.productName}</h2>
                      <div className="flex flex-wrap items-center gap-3 mt-8">
                        <span className="px-6 py-3 bg-white/10 rounded-2xl text-[12px] font-mono text-gray-300 border border-white/5 uppercase tracking-widest">{product?.barcode}</span>
                        <div className="h-10 w-px bg-white/10" />
                        <span className="px-6 py-3 bg-pastel-blueDark/80 rounded-2xl text-[12px] font-black tracking-widest">COST: ฿{product?.costPrice?.toLocaleString()}</span>
                      </div>
                  </div>
                  <button onClick={() => setStep(isBatchMode ? 'batch_list' : 'scan')} className="p-5 bg-white/10 hover:bg-white/20 rounded-3xl active:scale-90 transition-all backdrop-blur-md"><X size={32}/></button>
              </div>
          </div>

          <div className="p-12 space-y-16">
              <div className="grid grid-cols-2 gap-8">
                  <button onClick={() => setStatus(QCStatus.PASS)} className={`group relative p-16 rounded-[4rem] border-4 flex flex-col items-center gap-6 transition-all ${status === QCStatus.PASS ? 'border-green-500 bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400 scale-[1.02] shadow-2xl shadow-green-500/20' : 'border-gray-50 dark:border-gray-800 opacity-30 hover:opacity-100'}`}>
                      <div className="p-6 bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-lg group-hover:scale-110 transition-transform">
                        <CheckCircle2 size={64} strokeWidth={1.5} />
                      </div>
                      <span className="text-sm font-black uppercase tracking-[0.3em]">PASS : ผ่าน</span>
                      {status === QCStatus.PASS && <div className="absolute -top-3 -right-3 bg-green-500 text-white p-2 rounded-full shadow-lg"><CheckCircle2 size={24}/></div>}
                  </button>
                  <button onClick={() => setStatus(QCStatus.DAMAGE)} className={`group relative p-16 rounded-[4rem] border-4 flex flex-col items-center gap-6 transition-all ${status === QCStatus.DAMAGE ? 'border-red-500 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400 scale-[1.02] shadow-2xl shadow-red-500/20' : 'border-gray-50 dark:border-gray-800 opacity-30 hover:opacity-100'}`}>
                      <div className="p-6 bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-lg group-hover:scale-110 transition-transform">
                        <AlertTriangle size={64} strokeWidth={1.5} />
                      </div>
                      <span className="text-sm font-black uppercase tracking-[0.3em]">DAMAGE : ชำรุด</span>
                      {status === QCStatus.DAMAGE && <div className="absolute -top-3 -right-3 bg-red-500 text-white p-2 rounded-full shadow-lg"><AlertCircle size={24}/></div>}
                  </button>
              </div>

              <div className="space-y-6">
                  <label className="text-[12px] font-black uppercase text-gray-400 ml-8 tracking-[0.2em]">Current Selling Price Verification</label>
                  <div className="relative">
                      <span className="absolute left-10 top-1/2 -translate-y-1/2 text-5xl font-black text-gray-300 dark:text-gray-700 select-none">฿</span>
                      <input 
                        type="number" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)}
                        className="w-full pl-24 pr-12 py-12 bg-gray-50 dark:bg-gray-900 rounded-[3.5rem] text-6xl font-mono font-black outline-none border-4 border-transparent focus:border-pastel-blueDark/10 transition-all dark:text-white placeholder:text-gray-200"
                        placeholder="0.00"
                      />
                  </div>
              </div>

              {status === QCStatus.DAMAGE && (
                  <div className="space-y-10 p-12 bg-gray-50 dark:bg-gray-900/50 rounded-[4rem] animate-fade-in border border-gray-100 dark:border-gray-800 shadow-inner">
                      <div className="space-y-4">
                        <label className="text-xs font-black uppercase text-red-500/80 ml-4 tracking-widest">Select Damage Reason *</label>
                        <select 
                            value={reason} 
                            onChange={e => setReason(e.target.value)} 
                            className="w-full p-7 rounded-[2.5rem] bg-white dark:bg-gray-800 outline-none text-lg font-bold shadow-xl border-none appearance-none cursor-pointer"
                        >
                            <option value="">-- CHOOSE REASON --</option>
                            {REASON_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                      <div className="space-y-6">
                        <div className="flex justify-between items-center ml-4">
                          <label className="text-xs font-black uppercase text-gray-400 tracking-widest">Evidence Documentation ({images.length}/5)</label>
                          <span className="text-[10px] font-bold text-pastel-blueDark uppercase bg-pastel-blue/50 px-3 py-1 rounded-full">HQ Capture</span>
                        </div>
                        <div className="flex flex-wrap gap-6">
                            {images.length < 5 && (
                              <label className="w-28 h-28 rounded-[2.5rem] border-4 border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center text-gray-300 hover:text-pastel-blueDark hover:border-pastel-blueDark transition-all cursor-pointer active:scale-90 shadow-lg">
                                  <Camera size={44} />
                                  <input type="file" capture="environment" accept="image/*" className="hidden" onChange={async (e) => {
                                      if (e.target.files?.[0]) {
                                          const img = await compressImage(e.target.files[0]);
                                          setImages([...images, img]);
                                      }
                                  }} />
                              </label>
                            )}
                            {images.map((img, idx) => (
                                <div key={idx} className="relative w-28 h-28 rounded-[2.5rem] overflow-hidden border-4 border-white dark:border-gray-700 shadow-2xl animate-fade-in">
                                    <img src={img} className="w-full h-full object-cover" />
                                    <button onClick={() => setImages(images.filter((_, i) => i !== idx))} className="absolute top-2 right-2 p-2.5 bg-red-500/90 text-white rounded-2xl shadow-xl backdrop-blur-sm active:scale-75 transition-all"><X size={16}/></button>
                                </div>
                            ))}
                        </div>
                      </div>
                  </div>
              )}

              <button 
                onClick={handleSubmit} disabled={isSaving} 
                className="w-full py-12 rounded-[3.5rem] bg-gradient-to-r from-pastel-blueDark to-blue-700 text-white font-black text-2xl shadow-3xl shadow-blue-500/40 active:scale-95 transition-all flex items-center justify-center gap-6 disabled:opacity-50"
              >
                  {isSaving ? <Loader2 className="animate-spin" size={40} /> : <>SUBMIT INSPECTION <Zap size={32} fill="currentColor" /></>}
              </button>
          </div>
        </div>
      )}

      {showScanner && (
        <div className="fixed inset-0 z-[1000] flex flex-col bg-black overflow-hidden animate-fade-in">
          <div className="p-10 flex justify-between items-center text-white bg-gradient-to-b from-black/100 via-black/50 to-transparent z-20">
            <div className="flex flex-col">
                <h3 className="font-black tracking-[0.3em] uppercase text-sm flex items-center gap-4"><div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Neural Optics V2.5</h3>
                <p className="text-[10px] text-gray-500 font-bold tracking-[0.4em] mt-1">REAL-TIME SERIAL ACQUISITION</p>
            </div>
            <button onClick={stopScanner} className="p-5 bg-white/10 hover:bg-white/20 rounded-3xl active:scale-90 transition-all backdrop-blur-md"><X size={36} /></button>
          </div>

          <div className="flex-1 w-full bg-black relative flex items-center justify-center overflow-hidden">
              <div id="reader" className="w-full h-full"></div>
              
              {/* Modern HUD Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                  <div className={`w-80 h-80 transition-all duration-700 relative ${
                      scannerStatus === 'success' ? 'scale-110' : 'scale-100'
                  }`}>
                      {/* Corners */}
                      <div className={`absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 rounded-tl-[3rem] transition-colors duration-500 ${scannerStatus === 'success' ? 'border-green-400' : 'border-pastel-blueDark'}`} />
                      <div className={`absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 rounded-tr-[3rem] transition-colors duration-500 ${scannerStatus === 'success' ? 'border-green-400' : 'border-pastel-blueDark'}`} />
                      <div className={`absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 rounded-bl-[3rem] transition-colors duration-500 ${scannerStatus === 'success' ? 'border-green-400' : 'border-pastel-blueDark'}`} />
                      <div className={`absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 rounded-br-[3rem] transition-colors duration-500 ${scannerStatus === 'success' ? 'border-green-400' : 'border-pastel-blueDark'}`} />
                      
                      {/* Scan Line */}
                      <div className="absolute inset-x-10 top-0 h-1 bg-gradient-to-r from-transparent via-pastel-blueDark to-transparent animate-scan-line shadow-[0_0_20px_rgba(3,105,161,0.8)]" />
                      
                      {/* Status Indicator */}
                      <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/60 backdrop-blur-md px-8 py-3 rounded-full border border-white/10">
                         <span className={`text-[11px] font-black uppercase tracking-[0.3em] ${scannerStatus === 'success' ? 'text-green-400' : 'text-blue-400'}`}>
                            {scannerStatus === 'success' ? 'TARGET ACQUIRED' : 'ALIGN BARCODE / QR'}
                         </span>
                      </div>
                  </div>
              </div>
          </div>
          
          <div className="p-12 pb-16 bg-gradient-to-t from-black via-black/80 to-transparent flex justify-center gap-6 z-20">
              <button 
                onClick={() => scanWithAiNeural()} 
                disabled={isAiProcessing}
                className="flex items-center gap-4 bg-amber-500 text-black px-10 py-5 rounded-[2.5rem] font-black text-xs uppercase tracking-widest shadow-2xl shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50"
              >
                  {isAiProcessing ? <Loader2 className="animate-spin" size={24} /> : <><Sparkles size={24} /> AI Capture</>}
              </button>
          </div>
          
          <style>{`
            #reader video {
                object-fit: cover !important;
                width: 100% !important;
                height: 100% !important;
                filter: brightness(1.1) contrast(1.1);
            }
          `}</style>
        </div>
      )}
    </div>
  );
};
