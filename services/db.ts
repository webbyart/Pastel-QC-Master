
import { ProductMaster, QCRecord, QCStatus, User } from '../types';
import * as XLSX from 'xlsx';

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
    url: (localStorage.getItem(KEYS.SUPABASE_URL) || DEFAULT_SUPABASE_URL).trim(),
    key: (localStorage.getItem(KEYS.SUPABASE_KEY) || DEFAULT_SUPABASE_KEY).trim()
});

const callSupabase = async (table: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', body?: any, query: string = '') => {
    const { url, key } = getSupabaseConfig();
    const endpoint = `${url}/rest/v1/${table}${query}`;
    
    const headers: HeadersInit = {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    };

    const res = await fetch(endpoint, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(await res.text());
    if (res.status === 204) return true;
    return await res.json();
};

export const loginUser = async (username: string): Promise<User | null> => {
    try {
        const users = await callSupabase('users', 'GET', null, `?username=eq.${username.toLowerCase()}&limit=1`);
        if (users && users.length > 0) {
            const user = users[0];
            if (user.status !== 'active') throw new Error('บัญชีนี้ถูกระงับการใช้งาน');
            await callSupabase('users', 'PATCH', { is_online: true, last_login: new Date().toISOString() }, `?id=eq.${user.id}`);
            return user;
        }
    } catch (e: any) {
        throw new Error(e.message || 'ไม่พบชื่อผู้ใช้หรือรหัสผ่าน');
    }
    return null;
};

export const logoutUser = async (userId: string) => {
    try {
        await callSupabase('users', 'PATCH', { is_online: false }, `?id=eq.${userId}`);
    } catch (e) {}
};

export const fetchAllUsers = async (): Promise<User[]> => {
    return await callSupabase('users', 'GET', null, '?order=is_online.desc,username.asc');
};

export const saveUserData = async (userData: Partial<User>) => {
    if (userData.id) {
        return await callSupabase('users', 'PATCH', userData, `?id=eq.${userData.id}`);
    } else {
        return await callSupabase('users', 'POST', { ...userData, status: 'active', is_online: false });
    }
};

export const deleteUserData = async (id: string) => {
    return await callSupabase('users', 'DELETE', null, `?id=eq.${id}`);
};

export const fetchMasterData = async (force = false): Promise<ProductMaster[]> => {
    const data = await callSupabase('products', 'GET', null, '?order=barcode.asc');
    const mapped = data.map((item: any) => ({
        barcode: item.barcode,
        productName: item.product_name,
        costPrice: Number(item.cost_price || 0),
        unitPrice: Number(item.unit_price || 0),
        lotNo: item.lot_no,
        product_type: item.product_type
    }));
    localStorage.setItem(KEYS.CACHE_MASTER, JSON.stringify(mapped));
    return mapped;
};

export const fetchMasterDataBatch = async (force = false) => fetchMasterData(force);

export const fetchQCLogs = async (force = false, filterByInspector?: string): Promise<QCRecord[]> => {
    let query = '?order=timestamp.desc';
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
        product_type: item.product_type
    }));
    localStorage.setItem(KEYS.CACHE_LOGS, JSON.stringify(mapped));
    return mapped;
};

export const submitQCAndRemoveProduct = async (record: any) => {
    await callSupabase('qc_logs', 'POST', record);
    await callSupabase('products', 'DELETE', null, `?barcode=eq.${encodeURIComponent(record.barcode)}`);
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
};

export const clearProductsCloud = async () => callSupabase('products', 'DELETE', null, '?barcode=not.is.null');
export const clearQCLogsCloud = async () => callSupabase('qc_logs', 'DELETE', null, '?id=not.is.null');

export const clearAllCloudData = async () => {
    await clearProductsCloud();
    await clearQCLogsCloud();
};

export const testApiConnection = async (url: string, key: string) => {
    try {
        const res = await fetch(`${url}/rest/v1/users?limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
        return { success: res.ok };
    } catch (e) { return { success: false }; }
};

export const exportQCLogs = async (logs: QCRecord[]) => {
    const worksheet = XLSX.utils.json_to_sheet(logs);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "QC_Logs");
    XLSX.writeFile(workbook, `QC_Report_${new Date().getTime()}.xlsx`);
};

export const exportMasterData = async (products: ProductMaster[]) => {
    const worksheet = XLSX.utils.json_to_sheet(products);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Master_Data");
    XLSX.writeFile(workbook, `Master_Data_${new Date().getTime()}.xlsx`);
};

export const setSupabaseConfig = (url: string, key: string) => {
    localStorage.setItem(KEYS.SUPABASE_URL, url);
    localStorage.setItem(KEYS.SUPABASE_KEY, key);
};

export const dbGet = async (key: string) => {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
};

export const fetchCloudStats = async () => {
    try {
        const productsRes = await callSupabase('products', 'GET', null, '?select=barcode');
        const logsRes = await callSupabase('qc_logs', 'GET', null, '?select=id');
        return {
            total: Array.isArray(productsRes) ? productsRes.length : 0,
            checked: Array.isArray(logsRes) ? logsRes.length : 0,
            remaining: Array.isArray(productsRes) ? productsRes.length : 0
        };
    } catch (e) {
        return { total: 0, checked: 0, remaining: 0 };
    }
};

/**
 * Robust Excel Import Logic
 * Maps messy Excel headers to required ProductMaster fields.
 */
export const importMasterData = async (file: File): Promise<ProductMaster[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                
                if (json.length === 0) {
                    console.warn("Excel file is empty or could not be parsed.");
                    resolve([]);
                    return;
                }

                // Header synonyms mapping for high-accuracy detection
                const SYNONYMS = {
                    barcode: ['barcode', 'บาร์โค้ด', 'รหัสสินค้า', 'รหัสบาร์โค้ด', 'barcode_id', 'code', 'id', 'sku', 'รหัส', 'bar code', 'item code'],
                    productName: ['productName', 'product_name', 'ชื่อสินค้า', 'รายการสินค้า', 'ชื่อ', 'name', 'item', 'product', 'รายการ', 'ชื่อรายการ', 'item name', 'description'],
                    costPrice: ['costPrice', 'cost_price', 'ต้นทุน', 'ราคาทุน', 'ราคาซื้อ', 'ทุน', 'cost', 'unit cost', 'purchase price'],
                    unitPrice: ['unitPrice', 'unit_price', 'ราคาขาย', 'ราคา', 'price', 'ขาย', 'หน่วยละ', 'ราคาขายปลีก', 'selling price', 'retail price'],
                    lotNo: ['lotNo', 'lot_no', 'ล๊อต', 'ล็อต', 'lot', 'batch'],
                    productType: ['productType', 'product_type', 'ประเภท', 'หมวดหมู่', 'category', 'group', 'type']
                };

                const getValue = (obj: any, keys: string[]) => {
                    const objKeys = Object.keys(obj);
                    // Try exact matches first (normalized)
                    const foundKey = objKeys.find(k => {
                        const nk = k.toString().toLowerCase().trim().replace(/[\s_\-]/g, '');
                        return keys.some(pk => nk === pk.toLowerCase().replace(/[\s_\-]/g, ''));
                    });

                    // Fallback to partial matches if exact fails
                    const finalKey = foundKey || objKeys.find(k => {
                        const nk = k.toString().toLowerCase().trim();
                        return keys.some(pk => nk.includes(pk.toLowerCase()) || pk.toLowerCase().includes(nk));
                    });

                    return finalKey !== undefined ? obj[finalKey] : undefined;
                };

                const products: ProductMaster[] = json.map((item: any, index: number) => {
                    const barcodeRaw = getValue(item, SYNONYMS.barcode);
                    const nameRaw = getValue(item, SYNONYMS.productName);
                    
                    // Handle Excel reading numeric barcodes as numbers or scientific notation
                    const barcode = (barcodeRaw !== undefined && barcodeRaw !== null) ? String(barcodeRaw).trim() : "";
                    const productName = (nameRaw !== undefined && nameRaw !== null) ? String(nameRaw).trim() : "";
                    
                    const costPriceRaw = getValue(item, SYNONYMS.costPrice);
                    const unitPriceRaw = getValue(item, SYNONYMS.unitPrice);
                    
                    const costPrice = isNaN(parseFloat(String(costPriceRaw))) ? 0 : parseFloat(String(costPriceRaw));
                    const unitPrice = isNaN(parseFloat(String(unitPriceRaw))) ? 0 : parseFloat(String(unitPriceRaw));
                    
                    const lotNo = String(getValue(item, SYNONYMS.lotNo) || '').trim();
                    const productType = String(getValue(item, SYNONYMS.productType) || '').trim();

                    return { barcode, productName, costPrice, unitPrice, lotNo, productType };
                }).filter(p => {
                    const isValid = p.barcode !== "" && p.productName !== "";
                    return isValid;
                });
                
                if (products.length === 0 && json.length > 0) {
                    console.warn("Headers detected in Excel:", Object.keys(json[0]));
                }
                
                resolve(products);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
};

export const bulkSaveProducts = async (products: ProductMaster[], onProgress?: (pct: number) => void) => {
    const total = products.length;
    if (total === 0) return;
    
    const batchSize = 50;
    for (let i = 0; i < total; i += batchSize) {
        const batch = products.slice(i, i + batchSize).map(p => ({
            barcode: String(p.barcode).trim(),
            product_name: String(p.productName).trim(),
            cost_price: isNaN(Number(p.costPrice)) ? 0 : Number(p.costPrice),
            unit_price: isNaN(Number(p.unitPrice)) ? 0 : Number(p.unitPrice),
            lot_no: String(p.lotNo || '').trim(),
            product_type: String(p.productType || '').trim()
        }));
        
        await callSupabase('products', 'POST', batch);
        if (onProgress) onProgress(Math.min(100, Math.round(((i + batchSize) / total) * 100)));
    }
};

export const compressImage = async (file: File | Blob): Promise<string> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200;
                const MAX_HEIGHT = 1200;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
        };
    });
};
