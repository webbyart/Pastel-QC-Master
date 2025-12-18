
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

// Default credentials for immediate connection
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

export const getDataSource = (): DataSourceType => {
    const stored = localStorage.getItem(KEYS.DATA_SOURCE);
    return (stored as DataSourceType) || DataSourceType.SUPABASE;
};

export const setDataSource = (type: DataSourceType) => localStorage.setItem(KEYS.DATA_SOURCE, type);

export const getSupabaseConfig = () => ({
    url: (localStorage.getItem(KEYS.SUPABASE_URL) || DEFAULT_SUPABASE_URL).trim(),
    key: (localStorage.getItem(KEYS.SUPABASE_KEY) || DEFAULT_SUPABASE_KEY).trim()
});

export const setSupabaseConfig = (url: string, key: string) => {
    localStorage.setItem(KEYS.SUPABASE_URL, url.trim());
    localStorage.setItem(KEYS.SUPABASE_KEY, key.trim());
};

export const getApiUrl = (): string => getSupabaseConfig().url;

/**
 * Validates Supabase connection and checks for required tables.
 */
export const testApiConnection = async (url: string, key: string): Promise<{success: boolean, message?: string, error?: string}> => {
    try {
        const endpoint = `${url}/rest/v1/products?select=barcode&limit=1`;
        const headers: HeadersInit = {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
        };
        const res = await fetch(endpoint, { method: 'GET', headers });
        
        if (!res.ok) {
            const errText = await res.text();
            if (res.status === 404 || errText.includes("Could not find the table") || errText.includes("schema cache")) {
                return { success: false, error: "CONNECTED_BUT_TABLES_MISSING" };
            }
            return { success: false, error: errText || `Error ${res.status}` };
        }
        return { success: true, message: "Connected successfully!" };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

/**
 * Handles user login logic.
 */
export const loginUser = (username: string): User | null => {
  const normalized = username.toLowerCase().trim();
  if (normalized === 'admin' || normalized === 'user') {
    return {
      id: normalized === 'admin' ? '1' : '2',
      username: normalized,
      role: normalized === 'admin' ? 'admin' : 'user'
    };
  }
  return null;
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
            
            let msg = errData.message || `Supabase Error ${res.status}`;
            
            if (msg.includes("Could not find the table") || msg.includes("schema cache")) {
                const error: any = new Error(`TABLE_NOT_FOUND:${table}`);
                error.tableName = table;
                throw error;
            }
            throw new Error(msg);
        }
        
        // Fix: Properly handle 201 Created or 204 No Content (Empty Responses)
        if (res.status === 204 || res.status === 201) {
            const text = await res.text();
            if (!text) return true;
            try { return JSON.parse(text); } catch(e) { return true; }
        }
        
        const responseText = await res.text();
        if (!responseText) return true;
        
        try {
            return JSON.parse(responseText);
        } catch (jsonErr) {
            console.warn("Response was not JSON but request was successful:", responseText);
            return true;
        }
    } catch (e: any) {
        console.error(`Supabase call failed [${table}]:`, e);
        if (e.message.startsWith('TABLE_NOT_FOUND')) throw e;
        if (e.message.includes('fetch')) {
            const err: any = new Error("MIXED_CONTENT_BLOCKED");
            err.isMixedContent = true;
            throw err;
        }
        throw e;
    }
};

export const fetchMasterData = async (forceUpdate = false): Promise<ProductMaster[]> => {
    const cached = await dbGet(KEYS.CACHE_MASTER);
    if (cached && !forceUpdate) return cached;
    try {
        const data = await callSupabase('products', 'GET', null, '?select=*&order=barcode.asc');
        if (Array.isArray(data)) {
            const mapped = data.map(item => ({
                barcode: item.barcode,
                productName: item.product_name,
                costPrice: Number(item.cost_price),
                unitPrice: Number(item.unit_price),
                lotNo: item.lot_no,
                productType: item.product_type
            }));
            await dbSet(KEYS.CACHE_MASTER, mapped);
            return mapped;
        }
    } catch (e: any) {
        if (e.message?.includes('TABLE_NOT_FOUND')) throw e;
    }
    return cached || [];
};

export const saveQCRecord = async (record: any) => {
    const payload = {
        barcode: record.barcode,
        product_name: record.productName,
        cost_price: record.costPrice,
        selling_price: record.sellingPrice,
        status: record.status,
        reason: record.reason,
        remark: record.remark,
        inspector_id: record.inspectorId,
        image_urls: record.imageUrls,
        timestamp: new Date().toISOString()
    };
    return await callSupabase('qc_logs', 'POST', payload);
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
                imageUrls: Array.isArray(item.image_urls) ? item.image_urls : [],
                timestamp: item.timestamp
            }));
            await dbSet(KEYS.CACHE_LOGS, mapped);
            return mapped;
        }
    } catch (e: any) {
        if (forceUpdate) throw e; 
    }
    return cached || [];
};

export const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800; 
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * (MAX_WIDTH / img.width);
                canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            }
        }
    });
};

export const importMasterData = async (file: File): Promise<ProductMaster[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet) as any[];

                const mappedProducts: ProductMaster[] = json.map(row => ({
                    barcode: String(row['RMS Return Item ID'] || row['Barcode'] || row['barcode'] || '').trim(),
                    productName: String(row['Product Name'] || row['ProductName'] || row['name'] || '').trim(),
                    costPrice: Number(row['Cost Price'] || row['Cost'] || row['cost'] || 0),
                    unitPrice: Number(row['Unit Price'] || row['Price'] || row['price'] || 0),
                    lotNo: String(row['Lot No'] || row['lot'] || ''),
                    productType: String(row['Type'] || row['type'] || ''),
                })).filter(p => p.barcode && p.productName);

                dbSet(KEYS.CACHE_MASTER, mappedProducts);
                resolve(mappedProducts);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsBinaryString(file);
    });
};

export const saveProduct = async (p: ProductMaster) => {
    const payload = {
        barcode: p.barcode,
        product_name: p.productName,
        cost_price: p.costPrice,
        unit_price: p.unitPrice,
        lot_no: p.lotNo,
        product_type: p.productType
    };
    return await callSupabase('products', 'POST', payload);
};

// Fixed bulkSaveProducts to use correct ProductMaster property names
export const bulkSaveProducts = async (products: ProductMaster[]) => {
    const payloads = products.map(p => ({
        barcode: p.barcode,
        product_name: p.productName,
        cost_price: p.costPrice,
        unit_price: p.unitPrice,
        lot_no: p.lotNo,
        product_type: p.productType
    }));
    await callSupabase('products', 'POST', payloads);
    await dbSet(KEYS.CACHE_MASTER, products);
    return true;
};

export const clearLocalMasterData = async () => dbDel(KEYS.CACHE_MASTER);

// Added missing clearRemoteMasterData function
export const clearRemoteMasterData = async () => {
    return await callSupabase('products', 'DELETE', null, '?barcode=neq.EMPTY_VAL_888');
};

export const updateLocalMasterDataCache = async (p: ProductMaster[]) => dbSet(KEYS.CACHE_MASTER, p);
export const deleteProduct = async (barcode: string) => callSupabase('products', 'DELETE', null, `?barcode=eq.${barcode}`);

export const exportQCLogs = async () => {
    const logs = await fetchQCLogs(false);
    if (logs.length === 0) return;
    const data = logs.map(l => ({
        'Date/Time': new Date(l.timestamp).toLocaleString('th-TH'),
        'Barcode': l.barcode,
        'Product Name': l.productName,
        'Status': l.status,
        'Reason': l.reason,
        'Cost Price': l.costPrice,
        'Selling Price': l.sellingPrice,
        'Inspector': l.inspectorId,
        'Remark': l.remark || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "QC_Reports");
    XLSX.writeFile(workbook, `QC_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportMasterData = async () => {
    const products = await fetchMasterData(false);
    if (products.length === 0) return false;
    const worksheet = XLSX.utils.json_to_sheet(products);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MasterData");
    XLSX.writeFile(workbook, "MasterData_Export.xlsx");
    return true;
};
