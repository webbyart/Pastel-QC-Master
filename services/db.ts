
import { ProductMaster, QCRecord, QCStatus, User, DataSourceType } from '../types';
import * as XLSX from 'xlsx';

const KEYS = {
  USERS: 'qc_users',
  SUPABASE_URL: 'qc_supabase_url',
  SUPABASE_KEY: 'qc_supabase_key',
  DATA_SOURCE: 'qc_data_source',
  CACHE_MASTER: 'qc_cache_master',
  CACHE_LOGS: 'qc_cache_logs',
};

const DEFAULT_SUPABASE_URL = 'https://qxqcimcauwvrwafltzfg.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4cWNpbWNhdXd2cndhZmx0emZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMDcxMjYsImV4cCI6MjA4MTU4MzEyNn0.N_EJbZNHnL0HL5luJOo0QJJruV_U47RNOr0qdzM-pno';

const DB_NAME = 'QC_App_DB';
const STORE_NAME = 'keyval';

const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        };
    });
};

export const dbSet = async (key: string, value: any) => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
};

export const dbGet = async (key: string): Promise<any> => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    return new Promise(r => req.onsuccess = () => r(req.result));
};

export const dbDel = async (key: string) => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
};

export const getSupabaseConfig = () => ({
    url: (localStorage.getItem(KEYS.SUPABASE_URL) || DEFAULT_SUPABASE_URL).trim(),
    key: (localStorage.getItem(KEYS.SUPABASE_KEY) || DEFAULT_SUPABASE_KEY).trim()
});

export const setSupabaseConfig = (url: string, key: string) => {
    localStorage.setItem(KEYS.SUPABASE_URL, url.trim());
    localStorage.setItem(KEYS.SUPABASE_KEY, key.trim());
};

const callSupabase = async (table: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', body?: any, query: string = '') => {
    const { url, key } = getSupabaseConfig();
    if (!url || !key) throw new Error("Missing Supabase configuration.");

    const endpoint = `${url}/rest/v1/${table}${query}`;
    const headers: HeadersInit = {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'resolution=merge-duplicates, return=minimal' : 'return=representation'
    };

    try {
        const options: RequestInit = { method, headers };
        if (body) options.body = JSON.stringify(body);

        const res = await fetch(endpoint, options);
        if (!res.ok) {
            const errText = await res.text();
            let errData: any = {};
            try { errData = JSON.parse(errText); } catch(e) {}
            throw new Error(errData.message || `Supabase Error ${res.status}`);
        }
        
        if (res.status === 204 || res.status === 201) return true;
        const responseText = await res.text();
        return responseText ? JSON.parse(responseText) : true;
    } catch (e: any) {
        console.error(`Supabase failure [${table}]:`, e);
        throw e;
    }
};

export const loginUser = (username: string): User | null => {
  const normalized = username.toLowerCase();
  if (normalized === 'admin') return { id: 'admin-1', username: 'admin', role: 'admin' };
  if (normalized === 'user') return { id: 'user-1', username: 'user', role: 'user' };
  return null;
};

export const testApiConnection = async (url: string, key: string): Promise<{success: boolean, message?: string, error?: string}> => {
    try {
        const endpoint = `${url}/rest/v1/products?select=barcode&limit=1`;
        const res = await fetch(endpoint, {
            headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
        });
        if (res.ok) return { success: true, message: 'Connected successfully' };
        const errText = await res.text();
        return { success: false, error: errText };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const fetchMasterData = async (forceUpdate = false): Promise<ProductMaster[]> => {
    const cached = await dbGet(KEYS.CACHE_MASTER);
    if (cached && !forceUpdate) return cached;
    
    try {
        let allData: any[] = [];
        let offset = 0;
        const limit = 1000;
        let hasMore = true;

        // Fetch loop to handle large datasets (like 23,000+ items)
        while (hasMore) {
            const data = await callSupabase('products', 'GET', null, `?select=*&order=barcode.asc&limit=${limit}&offset=${offset}`);
            if (Array.isArray(data)) {
                allData = [...allData, ...data];
                if (data.length < limit) {
                    hasMore = false;
                } else {
                    offset += limit;
                }
            } else {
                hasMore = false;
            }
        }

        if (allData.length > 0) {
            const mapped = allData.map(item => ({
                barcode: String(item.barcode).trim(),
                productName: item.product_name,
                costPrice: Number(item.cost_price),
                unitPrice: Number(item.unit_price),
                lotNo: item.lot_no,
                productType: item.product_type
            }));
            await dbSet(KEYS.CACHE_MASTER, mapped);
            return mapped;
        }
    } catch (e) {
        console.error("Full fetchMasterData failed:", e);
    }
    return cached || [];
};

export const deleteProduct = async (barcode: string) => {
    const result = await callSupabase('products', 'DELETE', null, `?barcode=eq.${barcode}`);
    return result;
};

export const saveQCRecord = async (record: any) => {
    const payload = {
        barcode: String(record.barcode).trim(),
        product_name: record.productName,
        cost_price: record.costPrice,
        selling_price: record.sellingPrice,
        status: record.status,
        reason: record.reason,
        remark: record.remark,
        inspector_id: record.inspectorId,
        image_urls: record.imageUrls || [],
        timestamp: new Date().toISOString()
    };
    const result = await callSupabase('qc_logs', 'POST', payload);
    return result;
};

/**
 * บันทึกผล QC และลบสินค้าออกจาก Master Table ทันที
 */
export const submitQCAndRemoveProduct = async (record: any) => {
    // 1. Save Log
    await saveQCRecord(record);
    // 2. Delete from Product Table
    await deleteProduct(record.barcode);
    // 3. Optional: Sync local cache for logs but NOT for master (master needs to be updated by UI or force)
    await fetchQCLogs(true);
};

export const fetchQCLogs = async (forceUpdate = false): Promise<QCRecord[]> => {
    const cached = await dbGet(KEYS.CACHE_LOGS);
    if (cached && !forceUpdate) return cached;
    try {
        let allLogs: any[] = [];
        let offset = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
            const data = await callSupabase('qc_logs', 'GET', null, `?select=*&order=timestamp.desc&limit=${limit}&offset=${offset}`);
            if (Array.isArray(data)) {
                allLogs = [...allLogs, ...data];
                if (data.length < limit || allLogs.length >= 5000) { 
                    hasMore = false;
                } else {
                    offset += limit;
                }
            } else {
                hasMore = false;
            }
        }

        if (allLogs.length > 0) {
            const mapped: QCRecord[] = allLogs.map(item => ({
                id: String(item.id),
                barcode: item.barcode,
                productName: item.product_name,
                costPrice: Number(item.cost_price),
                sellingPrice: Number(item.selling_price),
                status: item.status as QCStatus,
                reason: item.reason,
                remark: item.remark,
                inspectorId: item.inspector_id,
                imageUrls: Array.isArray(item.image_urls) ? item.image_urls : [],
                timestamp: item.timestamp
            }));
            await dbSet(KEYS.CACHE_LOGS, mapped);
            return mapped;
        }
    } catch (e) {}
    return cached || [];
};

export const saveProduct = async (p: ProductMaster) => {
    const payload = {
        barcode: String(p.barcode).trim(),
        product_name: p.productName,
        cost_price: p.costPrice,
        unit_price: p.unitPrice,
        lot_no: p.lotNo,
        product_type: p.productType
    };
    const result = await callSupabase('products', 'POST', payload);
    await fetchMasterData(true);
    return result;
};

export const bulkSaveProducts = async (products: ProductMaster[], onProgress?: (pct: number) => void) => {
    if (!products.length) return true;
    const CHUNK_SIZE = 50;
    const total = products.length;
    let processed = 0;

    for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = products.slice(i, i + CHUNK_SIZE);
        const payloads = chunk.map(p => ({
            barcode: String(p.barcode).trim(),
            product_name: p.productName,
            cost_price: p.costPrice || 0,
            unit_price: p.unitPrice || 0,
            lot_no: p.lotNo || '',
            product_type: p.productType || ''
        }));
        
        await callSupabase('products', 'POST', payloads);
        processed += chunk.length;
        if (onProgress) onProgress(Math.floor((processed / total) * 100));
    }
    
    await fetchMasterData(true);
    return true;
};

export const clearAllCloudData = async (onProgress?: (pct: number) => void) => {
    try {
        if (onProgress) onProgress(10);
        await callSupabase('qc_logs', 'DELETE', null, '?id=neq.-1');
        
        if (onProgress) onProgress(50);
        await callSupabase('products', 'DELETE', null, '?barcode=neq.EXECUTE_TRUNCATE');
        
        if (onProgress) onProgress(80);
        await dbDel(KEYS.CACHE_MASTER);
        await dbDel(KEYS.CACHE_LOGS);
        
        if (onProgress) onProgress(100);
        return true;
    } catch (e: any) {
        console.error("Cloud clear failed:", e);
        throw new Error("ลบข้อมูลบน Cloud ไม่สำเร็จ กรุณาตรวจสอบสิทธิ์การเข้าถึง");
    }
};

export const compressImage = (file: File | Blob): Promise<string> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1000; 
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * (MAX_WIDTH / img.width);
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.75));
                }
            }
        }
    });
};

export const importMasterData = async (file: File, onProgress?: (pct: number) => void): Promise<ProductMaster[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        if (onProgress) onProgress(10);
        reader.onload = (e) => {
            try {
                if (onProgress) onProgress(40);
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                if (onProgress) onProgress(60);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(worksheet) as any[];
                if (onProgress) onProgress(80);

                const mapped: ProductMaster[] = json.map(row => ({
                    barcode: String(row['RMS Return Item ID'] || row['Barcode'] || row['barcode'] || '').trim(),
                    productName: String(row['Product Name'] || row['ProductName'] || row['name'] || '').trim(),
                    costPrice: Number(row['Cost Price'] || row['Cost'] || row['cost'] || 0),
                    unitPrice: Number(row['Unit Price'] || row['Price'] || row['price'] || 0),
                    lotNo: String(row['Lot No'] || row['lot'] || ''),
                    productType: String(row['Type'] || row['type'] || ''),
                })).filter(p => p.barcode && p.productName);

                if (onProgress) onProgress(100);
                resolve(mapped);
            } catch (err) { reject(err); }
        };
        reader.readAsBinaryString(file);
    });
};

export const clearLocalMasterData = async () => dbDel(KEYS.CACHE_MASTER);
export const updateLocalMasterDataCache = async (p: ProductMaster[]) => dbSet(KEYS.CACHE_MASTER, p);

export const exportQCLogs = async () => {
    const logs = await fetchQCLogs(false);
    if (logs.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(logs);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "QC_Report");
    XLSX.writeFile(workbook, `QC_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportMasterData = async () => {
    const products = await fetchMasterData(false);
    if (products.length === 0) return false;
    const worksheet = XLSX.utils.json_to_sheet(products);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
    XLSX.writeFile(workbook, "MasterData_Export.xlsx");
    return true;
};
