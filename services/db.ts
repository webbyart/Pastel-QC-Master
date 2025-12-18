
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

const callSupabase = async (table: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', body?: any, query: string = '', countOnly = false) => {
    const { url, key } = getSupabaseConfig();
    const endpoint = `${url}/rest/v1/${table}${query}`;
    const headers: HeadersInit = {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': countOnly ? 'count=exact' : (method === 'POST' ? 'resolution=merge-duplicates, return=minimal' : 'return=representation')
    };

    const options: RequestInit = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(endpoint, options);
    if (!res.ok) throw new Error(`Supabase Error ${res.status}`);

    if (countOnly) {
        const range = res.headers.get('content-range');
        if (range) return parseInt(range.split('/')[1]);
        return 0;
    }

    if (res.status === 204 || res.status === 201) return true;
    const responseText = await res.text();
    return responseText ? JSON.parse(responseText) : true;
};

// ดึงตัวเลขสรุปจาก Cloud
export const fetchCloudStats = async () => {
    const [totalProducts, totalLogs] = await Promise.all([
        callSupabase('products', 'GET', null, '?select=barcode&limit=1', true),
        callSupabase('qc_logs', 'GET', null, '?select=id&limit=1', true)
    ]);
    return { 
        totalInStore: Number(totalProducts), 
        totalChecked: Number(totalLogs) 
    };
};

export const fetchMasterData = async (forceUpdate = false, onProgress?: (current: number, total: number) => void): Promise<ProductMaster[]> => {
    const cached = await dbGet(KEYS.CACHE_MASTER);
    if (cached && !forceUpdate) return cached;
    
    try {
        const totalCount = await callSupabase('products', 'GET', null, '?select=barcode&limit=1', true) as number;
        let allData: any[] = [];
        let offset = 0;
        const limit = 500; // ดึงรอบละ 500 รายการตามสั่ง

        while (offset < totalCount) {
            const data = await callSupabase('products', 'GET', null, `?select=*&order=barcode.asc&limit=${limit}&offset=${offset}`);
            if (Array.isArray(data)) {
                allData = [...allData, ...data];
                offset += limit;
                if (onProgress) onProgress(Math.min(offset, totalCount), totalCount);
            } else {
                break;
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
        console.error("FetchMasterData failed:", e);
    }
    return cached || [];
};

export const submitQCAndRemoveProduct = async (record: any) => {
    await callSupabase('qc_logs', 'POST', {
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
    });
    await callSupabase('products', 'DELETE', null, `?barcode=eq.${record.barcode}`);
};

export const fetchQCLogs = async (forceUpdate = false): Promise<QCRecord[]> => {
    const cached = await dbGet(KEYS.CACHE_LOGS);
    if (cached && !forceUpdate) return cached;
    try {
        const data = await callSupabase('qc_logs', 'GET', null, '?select=*&order=timestamp.desc&limit=1000');
        if (Array.isArray(data)) {
            const mapped: QCRecord[] = data.map(item => ({
                id: String(item.id),
                barcode: item.barcode,
                productName: item.product_name,
                costPrice: Number(item.cost_price),
                sellingPrice: Number(item.selling_price),
                status: item.status as QCStatus,
                reason: item.reason,
                remark: item.remark,
                inspectorId: item.inspector_id,
                imageUrls: item.image_urls || [],
                timestamp: item.timestamp
            }));
            await dbSet(KEYS.CACHE_LOGS, mapped);
            return mapped;
        }
    } catch (e) {}
    return cached || [];
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
        return { success: false, error: 'Connection failed' };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
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
    await callSupabase('products', 'POST', payload);
    await fetchMasterData(true);
};

export const bulkSaveProducts = async (products: ProductMaster[], onProgress?: (pct: number) => void) => {
    if (!products.length) return;
    const CHUNK_SIZE = 100;
    for (let i = 0; i < products.length; i += CHUNK_SIZE) {
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
        if (onProgress) onProgress(Math.floor((i / products.length) * 100));
    }
    await fetchMasterData(true);
};

export const deleteProduct = async (barcode: string) => {
    await callSupabase('products', 'DELETE', null, `?barcode=eq.${barcode}`);
    await fetchMasterData(true);
};

export const clearAllCloudData = async (onProgress?: (pct: number) => void) => {
    await callSupabase('qc_logs', 'DELETE', null, '?id=neq.-1');
    await callSupabase('products', 'DELETE', null, '?barcode=neq.EXECUTE_TRUNCATE');
    await dbDel(KEYS.CACHE_MASTER);
    await dbDel(KEYS.CACHE_LOGS);
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
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(worksheet) as any[];
                const mapped: ProductMaster[] = json.map(row => ({
                    barcode: String(row['RMS Return Item ID'] || row['Barcode'] || row['barcode'] || '').trim(),
                    productName: String(row['Product Name'] || row['ProductName'] || row['name'] || '').trim(),
                    costPrice: Number(row['Cost Price'] || row['Cost'] || row['cost'] || 0),
                    unitPrice: Number(row['Unit Price'] || row['Price'] || row['price'] || 0),
                    lotNo: String(row['Lot No'] || row['lot'] || ''),
                    productType: String(row['Type'] || row['type'] || ''),
                })).filter(p => p.barcode && p.productName);
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
    const worksheet = XLSX.utils.json_to_sheet(logs);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "QC_Report");
    XLSX.writeFile(workbook, `QC_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportMasterData = async () => {
    const products = await fetchMasterData(false);
    const worksheet = XLSX.utils.json_to_sheet(products);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
    XLSX.writeFile(workbook, "MasterData_Export.xlsx");
};
