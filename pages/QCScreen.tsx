
import React, { useState, useRef, useEffect } from 'react';
import { fetchMasterData, submitQCAndRemoveProduct, compressImage, updateLocalMasterDataCache, fetchCloudStats } from '../services/db';
import { ProductMaster, QCStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { Scan, Camera, X, CheckCircle2, AlertTriangle, Loader2, Sparkles, Zap, AlertCircle, Trash2, Maximize2, Cpu, RefreshCw, Box, ClipboardCheck, Timer } from 'lucide-react';
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
  const [cloudStats, setCloudStats] = useState({ totalInStore: 0, totalChecked: 0 });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });

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
    initData();
  }, []);

  const initData = async (force = false) => {
    setIsSyncing(true);
    try {
        const stats = await fetchCloudStats();
        setCloudStats(stats);
        
        const data = await fetchMasterData(force, (current, total) => {
            setSyncProgress({ current, total });
        });
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
                { 
                  fps: 30, 
                  qrbox: { width: 300, height: 200 },
                  aspectRatio: 1.0 
                }, 
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
        if (!blob) throw new Error("Canvas to Blob failed");

        const base64 = await compressImage(blob);
        const base64Data = base64.split(',')[1];
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `Identify product from image. Output JSON: {"barcode": "found_id", "product_name": "name"}`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: base64Data } }, { text: prompt }] },
            config: { responseMimeType: 'application/json' }
        });

        const result = JSON.parse(response.text || '{}');
        let found: ProductMaster | undefined;

        if (result.barcode) found = cachedProducts.find(p => p.barcode.trim() === String(result.barcode).trim());
        if (!found && result.product_name) {
            const searchName = String(result.product_name).toLowerCase();
            found = cachedProducts.find(p => p.productName.toLowerCase().includes(searchName));
        }
        
        if (found) {
            stopScanner();
            applyProduct(found);
            return;
        }
        setErrors({ scan: "AI ไม่พบรหัสสินค้าที่ตรงกับฐานข้อมูล" });
    } catch (e) {
        setErrors({ scan: "AI วิเคราะห์ล้มเหลว" });
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
    const found = cachedProducts.find(p => p.barcode.toLowerCase() === cleanCode.toLowerCase());
    if (found) {
      stopScanner();
      applyProduct(found);
    } else {
      if (showScanner) await analyzeWithAi();
      else setErrors({ scan: `ไม่พบรหัส "${cleanCode}" ในคลัง` });
    }
  };

  const handleSubmit = async () => {
    if (!product || !user) return;
    const price = parseFloat(sellingPrice);
    if (isNaN(price)) { setErrors({ price: 'กรุณาระบุราคา' }); return; }

    setIsSaving(true);
    try {
        const record = {
            barcode: product.barcode,
            productName: product.productName,
            costPrice: product.costPrice,
            sellingPrice: price,
            status,
            reason,
            remark,
            imageUrls: images,
            inspectorId: user.username,
        };

        await submitQCAndRemoveProduct(record);

        // Update local state instantly
        const updatedList = cachedProducts.filter(p => p.barcode !== product.barcode);
        setCachedProducts(updatedList);
        setCloudStats(prev => ({
            totalInStore: prev.totalInStore - 1,
            totalChecked: prev.totalChecked + 1
        }));
        await updateLocalMasterDataCache(updatedList);

        setStep('scan');
        setBarcode('');
        setProduct(null);
        alert('✅ บันทึกสำเร็จ!');
    } catch (e: any) { 
        alert(`❌ ผิดพลาด: ${e.message}`); 
    } finally { setIsSaving(false); }
  };

  return (
    <div className="max-w-2xl mx-auto pb-24 px-4 animate-fade-in">
      
      {/* Dynamic Batch Sync Overlay */}
      {isSyncing && (
          <div className="fixed inset-0 z-[300] bg-white/90 dark:bg-gray-900/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center animate-fade-in">
              <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] shadow-2xl border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-6 max-w-sm w-full">
                  <div className="relative">
                      <div className="w-24 h-24 rounded-full border-4 border-gray-100 dark:border-gray-700 border-t-pastel-blueDark animate-spin" />
                      <Box size={32} className="absolute inset-0 m-auto text-pastel-blueDark" />
                  </div>
                  <div className="space-y-1">
                      <h3 className="text-xl font-black text-gray-800 dark:text-white uppercase tracking-tight">Syncing Master Data...</h3>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">Batch Processing (500/Round)</p>
                  </div>
                  <div className="w-full space-y-2">
                      <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-pastel-blueDark transition-all duration-300"
                            style={{ width: `${(syncProgress.current / (syncProgress.total || 1)) * 100}%` }}
                          />
                      </div>
                      <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          <span>{syncProgress.current.toLocaleString()}</span>
                          <span>{syncProgress.total.toLocaleString()} Items</span>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* AI Processing Overlay */}
      {isAiProcessing && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-md animate-fade-in text-center p-8">
            <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] shadow-2xl flex flex-col items-center gap-6 animate-slide-up">
                <Loader2 size={64} className="animate-spin text-pastel-blueDark" />
                <h3 className="text-xl font-black text-gray-800 dark:text-white uppercase tracking-tight">AI Vision Scanning...</h3>
            </div>
        </div>
      )}

      {step === 'scan' ? (
        <div className="space-y-8 py-4">
          
          {/* Live Stats Header Panel */}
          <div className="grid grid-cols-3 gap-3">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-1">
                  <Box size={16} className="text-blue-500 mb-1" />
                  <span className="text-[14px] font-black text-gray-800 dark:text-white">{cloudStats.totalInStore.toLocaleString()}</span>
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider">คลังทั้งหมด</span>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-1">
                  <ClipboardCheck size={16} className="text-green-500 mb-1" />
                  <span className="text-[14px] font-black text-gray-800 dark:text-white">{cloudStats.totalChecked.toLocaleString()}</span>
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider">ตรวจแล้ว</span>
              </div>
              <div className="bg-pastel-blueDark p-4 rounded-3xl shadow-lg flex flex-col items-center gap-1 text-white">
                  <Timer size={16} className="text-blue-100 mb-1" />
                  <span className="text-[14px] font-black">{cloudStats.totalInStore.toLocaleString()}</span>
                  <span className="text-[8px] font-black text-blue-100 uppercase tracking-wider">คงเหลือ</span>
              </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-8 py-8">
            <div className="relative p-12 bg-gradient-to-br from-pastel-blueDark to-blue-900 rounded-[4rem] shadow-2xl shadow-blue-500/40 text-white active:scale-95 transition-all">
                <Scan size={80} strokeWidth={1} />
            </div>

            <div className="text-center">
                <h2 className="text-3xl font-display font-bold text-gray-800 dark:text-white">QC SCANNER</h2>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em] mt-1">Smart Detection System</p>
            </div>
            
            <div className="w-full max-w-sm space-y-4">
                <div className="relative">
                    <input
                      type="text" autoFocus value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && processBarcode(barcode)}
                      placeholder="สแกน หรือ พิมพ์รหัสบาร์โค้ด..."
                      className="w-full pl-6 pr-16 py-5 text-lg rounded-3xl bg-white dark:bg-gray-800 shadow-xl border-none focus:ring-2 focus:ring-pastel-blueDark transition-all font-mono"
                    />
                    <button onClick={startScanner} className="absolute right-3 top-1/2 -translate-y-1/2 bg-pastel-blueDark text-white p-3 rounded-2xl shadow-lg">
                        <Camera size={24} />
                    </button>
                </div>

                <div className="flex justify-center">
                    <button onClick={() => initData(true)} className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-pastel-blueDark transition-colors">
                        <RefreshCw size={12} /> Force Sync Cloud
                    </button>
                </div>

                {errors.scan && (
                <div className="bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 p-4 rounded-2xl text-[11px] font-bold flex items-center gap-3 border border-red-100 dark:border-red-900/20">
                    <AlertCircle size={20} className="flex-shrink-0" />
                    <span>{errors.scan}</span>
                </div>
                )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-[3rem] shadow-2xl overflow-hidden animate-slide-up border border-gray-100 dark:border-gray-700">
          <div className="bg-gray-900 p-8 text-white">
              <div className="flex justify-between items-start">
                  <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-pastel-blue">Detected Product</p>
                      <h2 className="text-2xl font-bold leading-tight">{product?.productName}</h2>
                      <p className="text-xs font-mono text-gray-400 mt-2">ID: {product?.barcode}</p>
                  </div>
                  <button onClick={() => setStep('scan')} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"><X size={20}/></button>
              </div>
          </div>

          <div className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => setStatus(QCStatus.PASS)} className={`p-8 rounded-[2.5rem] border-2 flex flex-col items-center gap-3 transition-all ${status === QCStatus.PASS ? 'border-green-500 bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400 scale-[1.05] shadow-lg' : 'border-gray-50 dark:border-gray-700 opacity-40'}`}>
                      <CheckCircle2 size={48} />
                      <span className="text-xs font-black uppercase tracking-widest">ผ่าน (Pass)</span>
                  </button>
                  <button onClick={() => setStatus(QCStatus.DAMAGE)} className={`p-8 rounded-[2.5rem] border-2 flex flex-col items-center gap-3 transition-all ${status === QCStatus.DAMAGE ? 'border-red-500 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400 scale-[1.05] shadow-lg' : 'border-gray-50 dark:border-gray-700 opacity-40'}`}>
                      <AlertTriangle size={48} />
                      <span className="text-xs font-black uppercase tracking-widest">ชำรุด (Damage)</span>
                  </button>
              </div>

              <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-[0.2em]">ราคาขายหน้าสาขา</label>
                  <div className="relative">
                      <span className="absolute left-7 top-1/2 -translate-y-1/2 text-3xl font-bold text-gray-300">฿</span>
                      <input 
                        type="number" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)}
                        className="w-full pl-14 pr-8 py-6 bg-gray-50 dark:bg-gray-900 rounded-[2.5rem] text-4xl font-mono font-bold outline-none border-none focus:ring-2 focus:ring-pastel-blueDark"
                        placeholder="0.00"
                      />
                  </div>
              </div>

              {status === QCStatus.DAMAGE && (
                  <div className="space-y-6 p-6 bg-gray-50 dark:bg-gray-900 rounded-[2.5rem] animate-slide-up">
                      <select value={reason} onChange={e => setReason(e.target.value)} className="w-full p-4 rounded-2xl bg-white dark:bg-gray-800 outline-none text-sm font-medium border-none shadow-sm">
                          <option value="">-- ระบุสาเหตุที่พบ --</option>
                          {REASON_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                      <div className="flex flex-wrap gap-3">
                          {images.length < 5 && (
                            <label className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-300 bg-white dark:bg-gray-800 flex items-center justify-center text-gray-400 cursor-pointer">
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
                              <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-md">
                                  <img src={img} className="w-full h-full object-cover" />
                                  <button onClick={() => setImages(images.filter((_, i) => i !== idx))} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-md"><X size={12}/></button>
                              </div>
                          ))}
                      </div>
                  </div>
              )}

              <button 
                onClick={handleSubmit} disabled={isSaving} 
                className="w-full py-6 rounded-[2.5rem] bg-pastel-blueDark text-white font-bold text-lg shadow-xl shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
              >
                  {isSaving ? <Loader2 className="animate-spin" /> : <>บันทึกผลตรวจสอบ <Zap size={20} fill="currentColor" /></>}
              </button>
          </div>
        </div>
      )}

      {showScanner && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black animate-fade-in">
          <div className="p-8 flex justify-between items-center text-white bg-gradient-to-b from-black/80 to-transparent">
            <h3 className="font-bold tracking-[0.2em] uppercase text-[10px] flex items-center gap-2"><Scan size={18} /> Smart Scanner</h3>
            <button onClick={stopScanner} className="p-3 bg-white/10 rounded-full"><X size={24} /></button>
          </div>
          <div id="reader" className="flex-1 w-full bg-black"></div>
          <div className="p-10 flex flex-col items-center gap-6 bg-gradient-to-t from-black/80 to-transparent">
            <button 
                onClick={analyzeWithAi} 
                disabled={isAiProcessing}
                className="bg-white text-black px-10 py-4 rounded-full flex items-center gap-3 font-bold transition-all active:scale-95 shadow-2xl"
            >
                {isAiProcessing ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} className="text-pastel-blueDark" />}
                <span className="text-xs uppercase tracking-widest">{isAiProcessing ? 'AI Analysing...' : 'AI Vision Assistant'}</span>
            </button>
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest text-center">หากสแกนปกติไม่ติด กรุณากดปุ่ม AI ด้านบน</p>
          </div>
        </div>
      )}
    </div>
  );
};
