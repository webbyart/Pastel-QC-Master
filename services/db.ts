
import { ProductMaster, QCRecord, QCStatus, User } from '../types';
import * as XLSX from 'xlsx';

// Global memory cache for current session
declare global {
  interface Window {
    _cachedMaster?: ProductMaster[];
  }
}

const KEYS = {
  USERS: 'qc_users',
  SUPABASE_URL: 'qc_supabase_url',
  SUPABASE_KEY: 'qc_supabase_key',
  CACHE_MASTER: 'qc_cache_master',
  CACHE_LOGS: 'qc_cache_logs',
};

const DEFAULT_SUPABASE_URL = 'https://qxqcimcauwvrwafltzfg.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4cWNpbWNhdXd2cndhZmx0emZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMDcxMjYsImV4cCI6MjA4MTU4MzEyNn0.N_EJbZNHnL0HL5luJOo0QJJruV_U47RNOr0qdzM-pno';

export const getSupabaseConfig = () => ({
    url: (localStorage.getItem(KEYS.SUPABASE_URL) || DEFAULT_SUPABASE_URL).trim().replace(/\/$/, ''),
    key: (localStorage.getItem(KEYS.SUPABASE_KEY) || DEFAULT_SUPABASE_KEY).trim()
});

const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, backoff = 500): Promise<Response> => {
    try {
        const response = await fetch(url, options);
        return response;
    } catch (error) {
        if (retries > 0 && (error instanceof TypeError || (error as any).message === 'Failed to fetch')) {
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw error;
    }
};

const callSupabase = async (table: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', body?: any, query: string = '') => {
    const { url, key } = getSupabaseConfig();
    if (!url.startsWith('http')) throw new Error('Supabase URL ไม่ถูกต้อง');

    const endpoint = `${url}/rest/v1/${table}${query}`;
    const headers: HeadersInit = {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    };

    try {
        const res = await fetchWithRetry(endpoint, { method, headers, body: body ? JSON.stringify(body) : undefined });
        if (!res.ok) {
            const errorText = await res.text();
            let msg = `API Error (${res.status})`;
            try { msg = JSON.parse(errorText).message || msg; } catch (e) {}
            throw new Error(msg);
        }
        return res.status === 204 ? true : await res.json();
    } catch (e: any) {
        throw new Error(e.message === 'Failed to fetch' ? 'เชื่อมต่อฐานข้อมูลล้มเหลว' : e.message);
    }
};

export const loginUser = async (username: string): Promise<User | null> => {
    const users = await callSupabase('users', 'GET', null, `?username=eq.${username.toLowerCase()}&limit=1`);
    if (users?.length > 0) {
        const user = users[0];
        if (user.status !== 'active') throw new Error('บัญชีนี้ถูกระงับการใช้งาน');
        await callSupabase('users', 'PATCH', { is_online: true, last_login: new Date().toISOString() }, `?id=eq.${user.id}`);
        return user;
    }
    return null;
};

export const logoutUser = async (userId: string) => {
    try { await callSupabase('users', 'PATCH', { is_online: false }, `?id=eq.${userId}`); } catch (e) {}
};

export const fetchAllUsers = async (): Promise<User[]> => callSupabase('users', 'GET', null, '?order=is_online.desc,username.asc');

export const saveUserData = async (userData: Partial<User>) => {
    if (userData.id) return callSupabase('users', 'PATCH', userData, `?id=eq.${userData.id}`);
    return callSupabase('users', 'POST', { ...userData, status: 'active', is_online: false });
};

export const deleteUserData = async (id: string) => callSupabase('users', 'DELETE', null, `?id=eq.${id}`);

/**
 * ดึงข้อมูลสินค้าทั้งหมด "ทุกรายการ" โดยใช้ Range Headers เพื่อประสิทธิภาพสูงสุด
 */
export const fetchMasterData = async (force = false, onProgress?: (current: number) => void): Promise<ProductMaster[]> => {
    // Return memory cache if available and not forced
    if (!force && window._cachedMaster && window._cachedMaster.length > 0) {
        return window._cachedMaster;
    }

    const { url, key } = getSupabaseConfig();
    let allData: any[] = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    try {
        while (hasMore) {
            const to = from + step - 1;
            const res = await fetchWithRetry(`${url}/rest/v1/products?order=barcode.asc`, {
                headers: {
                    'apikey': key,
                    'Authorization': `Bearer ${key}`,
                    'Range': `${from}-${to}`,
                    'Prefer': 'count=exact'
                }
            });

            if (!res.ok) throw new Error("Cloud Sync Failed");

            const data = await res.json();
            if (data && data.length > 0) {
                allData = [...allData, ...data];
                from += data.length;
                if (onProgress) onProgress(from);
                
                // ตรวจสอบ Content-Range header เพื่อดูจำนวนทั้งหมด
                const contentRange = res.headers.get('content-range');
                if (contentRange) {
                    const total = parseInt(contentRange.split('/')[1]);
                    if (from >= total) hasMore = false;
                } else {
                    if (data.length < step) hasMore = false;
                }
            } else {
                hasMore = false;
            }
            
            // ป้องกันการวนลูปไม่สิ้นสุด
            if (from > 200000) break;
        }

        const mapped = allData.map((item: any) => ({
            barcode: item.barcode,
            productName: item.product_name,
            costPrice: Number(item.cost_price || 0),
            unitPrice: Number(item.unit_price || 0),
            lotNo: item.lot_no,
            productType: item.product_type
        }));
        
        // บันทึกใส่ Memory Cache สำหรับการใช้งานใน Session นี้
        window._cachedMaster = mapped;
        
        // พยายามบันทึกลง LocalStorage (ถ้าข้อมูลไม่ใหญ่เกิน 5MB)
        try {
            localStorage.setItem(KEYS.CACHE_MASTER, JSON.stringify(mapped));
        } catch (e) {
            console.warn("LocalStorage full, keeping master data in memory only.");
        }
        
        return mapped;
    } catch (e) {
        console.error("Fetch Master Data failed:", e);
        // If failed, return what we have in memory or empty
        return window._cachedMaster || [];
    }
};

export const fetchMasterDataBatch = async (force = false) => fetchMasterData(force);

export const fetchQCLogs = async (force = false, filterByInspector?: string): Promise<QCRecord[]> => {
    let query = '?order=timestamp.desc&limit=2000';
    if (filterByInspector) query += `&inspector_id=eq.${filterByInspector}`;
    
    const data = await callSupabase('qc_logs', 'GET', null, query);
    const mapped = data.map((item: any) => ({
        id: String(item.id),
        barcode: item.barcode,
        productName: item.product_name,
        costPrice: Number(item.cost_price || 0),
        sellingPrice: Number(item.selling_price || 0),
        status: item.status as QCStatus,
        reason: item.reason,
        remark: item.remark,
        inspectorId: item.inspector_id,
        imageUrls: item.image_urls || [],
        timestamp: item.timestamp,
        lotNo: item.lot_no,
        productType: item.product_type
    }));
    localStorage.setItem(KEYS.CACHE_LOGS, JSON.stringify(mapped));
    return mapped;
};

export const submitQCAndRemoveProduct = async (record: any) => {
    await callSupabase('qc_logs', 'POST', record);
    await callSupabase('products', 'DELETE', null, `?barcode=eq.${encodeURIComponent(record.barcode)}`);
    
    // อัปเดต Memory Cache ทันทีหลังลบ
    if (window._cachedMaster) {
        window._cachedMaster = window._cachedMaster.filter(p => p.barcode !== record.barcode);
    }
};

export const saveProduct = async (p: ProductMaster) => {
    await callSupabase('products', 'POST', {
        barcode: String(p.barcode).trim(),
        product_name: String(p.productName).trim(),
        cost_price: isNaN(Number(p.costPrice)) ? 0 : Number(p.costPrice),
        unit_price: isNaN(Number(p.unitPrice)) ? 0 : Number(p.unitPrice),
        lot_no: p.lotNo,
        product_type: p.productType
    });
};

export const deleteProduct = async (barcode: string) => {
    await callSupabase('products', 'DELETE', null, `?barcode=eq.${encodeURIComponent(barcode)}`);
    if (window._cachedMaster) {
        window._cachedMaster = window._cachedMaster.filter(p => p.barcode !== barcode);
    }
};

export const clearProductsCloud = async () => {
    await callSupabase('products', 'DELETE', null, '?barcode=not.is.null');
    window._cachedMaster = [];
};

export const clearQCLogsCloud = async () => callSupabase('qc_logs', 'DELETE', null, '?id=not.is.null');

export const testApiConnection = async (url: string, key: string) => {
    try {
        const res = await fetchWithRetry(`${url}/rest/v1/users?limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
        return { success: res.ok };
    } catch (e) { return { success: false }; }
};

export const exportQCLogs = async (logs: QCRecord[]) => {
    const ws = XLSX.utils.json_to_sheet(logs);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "QC_Logs");
    XLSX.writeFile(wb, `QC_Report_${Date.now()}.xlsx`);
};

export const setSupabaseConfig = (url: string, key: string) => {
    localStorage.setItem(KEYS.SUPABASE_URL, url);
    localStorage.setItem(KEYS.SUPABASE_KEY, key);
};

export const dbGet = async (key: string) => {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
};

/**
 * นับจำนวนข้อมูลสินค้าทั้งหมดแบบ Real-time Efficiency
 */
export const fetchCloudStats = async () => {
    const { url, key } = getSupabaseConfig();
    try {
        const getCount = async (table: string) => {
            const res = await fetchWithRetry(`${url}/rest/v1/${table}`, {
                method: 'HEAD',
                headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Prefer': 'count=exact' }
            });
            if (!res.ok) return 0;
            const range = res.headers.get('content-range');
            return range ? parseInt(range.split('/')[1]) : 0;
        };

        const [totalCount, logsCount] = await Promise.all([
            getCount('products'),
            getCount('qc_logs')
        ]);

        return { total: totalCount, checked: logsCount, remaining: totalCount };
    } catch (e) {
        return { total: 0, checked: 0, remaining: 0 };
    }
};

export const importMasterData = async (file: File): Promise<ProductMaster[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const wb = XLSX.read(data, { type: 'array' });
                const json: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
                
                const SYNONYMS = {
                    barcode: ['barcode', 'บาร์โค้ด', 'รหัสสินค้า'],
                    productName: ['productName', 'product_name', 'ชื่อสินค้า'],
                    costPrice: ['costPrice', 'cost_price', 'ต้นทุน'],
                    unitPrice: ['unitPrice', 'unit_price', 'ราคาขาย'],
                    lotNo: ['lotNo', 'lot_no', 'ล๊อต'],
                    productType: ['productType', 'product_type', 'ประเภท']
                };

                const findVal = (obj: any, keys: string[]) => {
                    const found = Object.keys(obj).find(k => keys.some(pk => k.toLowerCase().includes(pk.toLowerCase())));
                    return found ? obj[found] : undefined;
                };

                const products: ProductMaster[] = json.map(item => ({
                    barcode: String(findVal(item, SYNONYMS.barcode) || '').trim(),
                    productName: String(findVal(item, SYNONYMS.productName) || '').trim(),
                    costPrice: Number(findVal(item, SYNONYMS.costPrice) || 0),
                    unitPrice: Number(findVal(item, SYNONYMS.unitPrice) || 0),
                    lotNo: String(findVal(item, SYNONYMS.lotNo) || '').trim(),
                    productType: String(findVal(item, SYNONYMS.productType) || '').trim()
                })).filter(p => p.barcode && p.productName);
                
                resolve(products);
            } catch (err) { reject(err); }
        };
        reader.readAsArrayBuffer(file);
    });
};

export const bulkSaveProducts = async (products: ProductMaster[], onProgress?: (pct: number) => void) => {
    const batchSize = 100;
    for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize).map(p => ({
            barcode: p.barcode,
            product_name: p.productName,
            cost_price: p.costPrice,
            unit_price: p.unitPrice,
            lot_no: p.lotNo,
            product_type: p.productType
        }));
        await callSupabase('products', 'POST', batch);
        if (onProgress) onProgress(Math.min(100, Math.round(((i + batchSize) / products.length) * 100)));
    }
};

export const compressImage = async (file: File | Blob): Promise<string> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX = 1200;
                let w = img.width, h = img.height;
                if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
                else { if (h > MAX) { w *= MAX / h; h = MAX; } }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
        };
    });
};
