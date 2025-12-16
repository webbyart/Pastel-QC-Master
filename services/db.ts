import { ProductMaster, QCRecord, QCStatus, User, ProductEditLog } from '../types';
import * as XLSX from 'xlsx';

// Storage Keys
const KEYS = {
  USERS: 'qc_users',
  API_URL: 'qc_api_url',
  CACHE_MASTER: 'qc_cache_master',
  CACHE_LOGS: 'qc_cache_logs',
  CACHE_TIMESTAMP: 'qc_cache_time',
  CACHE_LOGS_TIMESTAMP: 'qc_cache_logs_time',
  EDIT_LOGS: 'qc_edit_logs_mock', // Stores the history of edits
};

// --- CONFIGURATION ---
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwQnrHQ4FL6bWpABG-416FJeUVvCpEQtYQCB41CF8Avbk5hqxPB255EHBtuNg9W95kH6Q/exec';
const CACHE_DURATION_MASTER = 5 * 60 * 1000; // 5 Minutes
const CACHE_DURATION_LOGS = 2 * 60 * 1000;   // 2 Minutes

export const getApiUrl = () => {
    const stored = localStorage.getItem(KEYS.API_URL);
    if (stored) return stored;
    return DEFAULT_API_URL;
};

export const setApiUrl = (url: string) => {
    localStorage.setItem(KEYS.API_URL, url.trim());
};

export const clearCache = () => {
    localStorage.removeItem(KEYS.CACHE_MASTER);
    localStorage.removeItem(KEYS.CACHE_LOGS);
    localStorage.removeItem(KEYS.CACHE_TIMESTAMP);
    localStorage.removeItem(KEYS.CACHE_LOGS_TIMESTAMP);
    localStorage.removeItem('qc_api_cooldown'); 
};

// Helper: Normalize API response to Array
const normalizeResponse = (data: any): any[] | null => {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
        if (Array.isArray(data.data)) return data.data; 
        if (Object.keys(data).length === 0) return []; 
    }
    return null;
};

const pendingRequests: Record<string, Promise<any>> = {};

const callApi = async (action: string, method: 'GET' | 'POST' = 'GET', body?: any) => {
    const url = getApiUrl().trim();
    if (!url) throw new Error("Google Script URL not configured");

    const requestKey = `${action}-${method}-${JSON.stringify(body || {})}`;
    if (pendingRequests[requestKey]) return pendingRequests[requestKey];

    const executeRequest = async () => {
        const timestamp = `_t=${Date.now()}`;
        const queryParams = `action=${action}&${timestamp}`;
        const fetchUrl = `${url}${url.includes('?') ? '&' : '?'}${queryParams}`;

        const options: RequestInit = {
            method,
            mode: 'cors',
            credentials: 'omit',
            redirect: 'follow',
            headers: { "Content-Type": "text/plain" },
        };

        if (method === 'POST') {
            options.body = JSON.stringify({ ...body, action }); 
        }
        
        // Infinite Retry Loop for Resilience
        while (true) {
            try {
                const res = await fetch(fetchUrl, options);
                
                // Fatal Configuration Errors (Do not retry)
                if (res.status === 404) throw new Error("API URL not found (404). Check Settings.");
                if (res.status === 401 || res.status === 403) throw new Error("Permission Denied (401/403). Check script access.");

                // Retryable HTTP Errors (Quota 429, Server Error 5xx)
                if (!res.ok) {
                     console.warn(`HTTP ${res.status}. Retrying in 2s...`);
                     await new Promise(r => setTimeout(r, 2000));
                     continue;
                }
                
                const text = await res.text();
                
                // Check for HTML Errors (Quota / Timeout often returns HTML)
                if (text.trim().startsWith('<')) {
                    // Check if it's a permanent permission error page
                    if ((text.includes('Google Drive') || text.includes('script.google.com')) && 
                        !text.includes('quota') && !text.includes('exceeded')) {
                         throw new Error("Script Permission Error: Set 'Who has access' to 'Anyone'.");
                    }
                    
                    // Otherwise assume Quota/Timeout/Service Unavailable -> Retry
                    console.warn("Received HTML error (likely Quota/Timeout). Retrying in 3s...");
                    await new Promise(r => setTimeout(r, 3000));
                    continue;
                }

                try {
                    const json = JSON.parse(text);
                    if (json.error) {
                        // Logic error from script (e.g., Missing action) -> Throw
                        throw new Error(json.error);
                    }
                    return json;
                } catch (parseError: any) {
                    // JSON Parse Error (Partial response/Network glitch) -> Retry
                    console.warn("JSON Parse Error. Retrying...", text.substring(0, 50));
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
            } catch (e: any) {
                // Network Fetch Failures (Offline)
                // If specific fatal error, rethrow
                if (e.message.includes("API URL") || e.message.includes("Permission") || e.message.includes("Missing action")) {
                    throw e;
                }
                // Otherwise retry indefinitely
                console.warn(`Network Error: ${e.message}. Retrying in 3s...`);
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    };

    const promise = executeRequest();
    pendingRequests[requestKey] = promise;
    try { return await promise; } finally { delete pendingRequests[requestKey]; }
};

export const testApiConnection = async () => {
    try {
      const url = getApiUrl().trim();
      if (!url) return { success: false, error: "URL is empty" };
      // Use a simple fetch with timeout for testing connection to avoid infinite loop
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 10000);
      try {
          await fetch(`${url}?action=testConnection`, { signal: controller.signal, mode: 'cors' });
          clearTimeout(id);
          return { success: true, message: `Server is reachable` };
      } catch (e) {
          clearTimeout(id);
          throw e;
      }
    } catch (e: any) {
      return { success: false, error: e.message || "Network error" };
    }
};

export const testMasterDataAccess = async () => {
    try {
        const rawData = await callApi('getProducts', 'GET');
        const data = normalizeResponse(rawData);
        if (data) return { success: true, message: `Found ${data.length} products`, count: data.length };
        return { success: false, error: `Invalid data: Expected Array, got ${typeof rawData}` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export const testQCLogAccess = async () => {
    try {
        const rawData = await callApi('getQCLogs', 'GET');
        const data = normalizeResponse(rawData);
        if (data) return { success: true, message: `Found ${data.length} logs`, count: data.length };
        return { success: false, error: `Invalid Format (${typeof rawData}): ${JSON.stringify(rawData).slice(0, 50)}` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export const loginUser = (username: string): User | null => {
  const usersStr = localStorage.getItem(KEYS.USERS);
  let users: User[] = usersStr ? JSON.parse(usersStr) : [];
  if (users.length === 0) {
      users = [{ id: '1', username: 'admin', role: 'admin' }, { id: '2', username: 'user', role: 'user' }];
      localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  }
  return users.find(u => u.username === username) || null;
};

export const getUsers = (): User[] => {
  const str = localStorage.getItem(KEYS.USERS);
  return str ? JSON.parse(str) : [];
};

export const saveUser = (user: User) => {
  const users = getUsers();
  const index = users.findIndex(u => u.id === user.id);
  if (index >= 0) users[index] = user; else users.push(user);
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
};

export const deleteUser = (id: string) => {
  const users = getUsers().filter(u => u.id !== id);
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
};

const parseNum = (val: any) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const num = Number(String(val).replace(/,/g, '').trim());
    return isNaN(num) ? 0 : num;
};

export const fetchMasterData = async (forceUpdate = false, skipThrottle = false): Promise<ProductMaster[]> => {
  const cached = localStorage.getItem(KEYS.CACHE_MASTER);
  const lastFetch = localStorage.getItem(KEYS.CACHE_TIMESTAMP);
  
  if (cached && !forceUpdate) return JSON.parse(cached);

  if (forceUpdate && !skipThrottle && lastFetch && cached) {
      if (Date.now() - new Date(lastFetch).getTime() < CACHE_DURATION_MASTER) return JSON.parse(cached);
  }

  try {
      if (!getApiUrl()) return [];
      const rawData = await callApi('getProducts', 'GET');
      const data = normalizeResponse(rawData);
      
      if (data) {
          const mappedData: ProductMaster[] = data.map((item: any) => ({
              barcode: String(item.barcode || item['RMS Return Item ID'] || ''),
              productName: String(item.productName || item['Product Name'] || ''),
              costPrice: parseNum(item.costPrice || item['ต้นทุน']),
              unitPrice: parseNum(item.unitPrice || item['Product unit price']),
              image: String(item.image || ''),
              stock: parseNum(item.stock),
              lotNo: String(item.lotNo || item['Lot no.'] || ''),
              productType: String(item.productType || item['Type'] || '')
          })).filter(p => p.barcode);

          localStorage.setItem(KEYS.CACHE_MASTER, JSON.stringify(mappedData));
          localStorage.setItem(KEYS.CACHE_TIMESTAMP, new Date().toISOString());
          return mappedData;
      }
      return [];
  } catch (e: any) {
      if (cached) {
          console.warn("Fetch failed, returning cache:", e.message);
          return JSON.parse(cached);
      }
      throw e;
  }
};

export const saveProduct = async (product: ProductMaster) => {
  const payload = {
      barcode: product.barcode,
      productName: product.productName,
      costPrice: product.costPrice,
      unitPrice: product.unitPrice,
      stock: product.stock,
      image: product.image,
      lotNo: product.lotNo,
      productType: product.productType
  };
  const result = await callApi('saveProduct', 'POST', payload);
  // Do NOT clear cache here if we want to maintain local state until sync
  return result;
};

export const bulkSaveProducts = async (products: ProductMaster[]) => {
    // Transform to simple array for API to reduce payload size complexity if needed,
    // but the script expects objects.
    const payload = {
        products: products.map(p => ({
            barcode: p.barcode,
            productName: p.productName,
            costPrice: p.costPrice,
            unitPrice: p.unitPrice,
            lotNo: p.lotNo,
            productType: p.productType,
            stock: p.stock,
            image: p.image
        }))
    };
    return await callApi('replaceProducts', 'POST', payload);
};

export const deleteProduct = async (barcode: string) => {
  await callApi('deleteProduct', 'POST', { barcode });
  // Update Local Cache
  const current = JSON.parse(localStorage.getItem(KEYS.CACHE_MASTER) || '[]');
  const updated = current.filter((p: ProductMaster) => p.barcode !== barcode);
  localStorage.setItem(KEYS.CACHE_MASTER, JSON.stringify(updated));
};

// --- EDIT LOGGING SYSTEM ---

export const getEditLogs = (): ProductEditLog[] => {
    const str = localStorage.getItem(KEYS.EDIT_LOGS);
    return str ? JSON.parse(str) : [];
};

export const saveEditLogs = (newLogs: ProductEditLog[]) => {
    const existing = getEditLogs();
    const updated = [...existing, ...newLogs];
    localStorage.setItem(KEYS.EDIT_LOGS, JSON.stringify(updated));
};

export const clearEditLogs = () => {
    localStorage.removeItem(KEYS.EDIT_LOGS);
};

export const exportEditLogs = (): boolean => {
    const logs = getEditLogs();
    if (logs.length === 0) return false;

    const exportData = logs.map(log => ({
        'Timestamp': new Date(log.timestamp).toLocaleString('th-TH'),
        'Modified By': log.editedBy,
        'RMS ID (Barcode)': log.barcode,
        'Product Name': log.productName,
        'Field Changed': log.field,
        'Old Value': log.oldValue,
        'New Value': log.newValue
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Edit_History_Mock_Data");
    XLSX.writeFile(wb, `QC_Product_Edit_History_${new Date().toISOString().slice(0,10)}.xlsx`);
    return true;
};

// --- END EDIT LOGGING SYSTEM ---

export const fetchQCLogs = async (forceUpdate = false, skipThrottle = false): Promise<QCRecord[]> => {
    const cached = localStorage.getItem(KEYS.CACHE_LOGS);
    const lastFetch = localStorage.getItem(KEYS.CACHE_LOGS_TIMESTAMP);

    if (cached && !forceUpdate) {
        const parsed = JSON.parse(cached);
        return parsed.sort((a: any,b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    if (forceUpdate && !skipThrottle && lastFetch && cached) {
        if (Date.now() - new Date(lastFetch).getTime() < CACHE_DURATION_LOGS) {
            const parsed = JSON.parse(cached);
            return parsed.sort((a: any,b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        }
    }

    try {
        if (!getApiUrl()) return [];
        const rawData = await callApi('getQCLogs', 'GET');
        const data = normalizeResponse(rawData);
        
        if (data) {
            const processedData = data.map((item: any) => {
                 const rawImages = item.imageUrls || item['Images'] || []; 
                 let imageUrls: string[] = [];
                 if (Array.isArray(rawImages)) {
                     imageUrls = rawImages;
                 } else if (typeof rawImages === 'string' && rawImages.trim() !== '') {
                     try {
                        // Handle both JSON array string and comma separated
                        imageUrls = rawImages.startsWith('[') ? JSON.parse(rawImages) : rawImages.split(',').map(s => s.trim());
                     } catch { imageUrls = []; }
                 }

                 let inferredStatus = QCStatus.PASS;
                 const rReason = item.reason || item['Comment'];
                 if ((rReason && rReason !== '-' && rReason !== '') || (item.sellingPrice === 0)) {
                    inferredStatus = QCStatus.DAMAGE;
                 }
                 
                 return {
                     id: item.id || Math.random().toString(36),
                     barcode: String(item.barcode || item['RMS Return Item ID'] || ''),
                     rmsId: String(item.barcode || item['RMS Return Item ID'] || ''),
                     productName: String(item.productName || item['Product Name'] || ''),
                     costPrice: parseNum(item.costPrice || item['ต้นทุน']),
                     sellingPrice: parseNum(item.sellingPrice || item['ราคาขาย']),
                     unitPrice: parseNum(item.unitPrice || item['Product unit price']),
                     status: inferredStatus,
                     reason: String(item.reason || item['Comment'] || ''),
                     remark: String(item.remark || item['Remark'] || ''),
                     lotNo: String(item.lotNo || item['Lot no.'] || ''),
                     productType: String(item.productType || item['Type'] || ''),
                     imageUrls: imageUrls,
                     timestamp: item.timestamp || item['Timestamp'] || new Date().toISOString(),
                     inspectorId: String(item.inspectorId || item['Inspector'] || '')
                 };
            });

            // Filter out empty rows but be permissive about barcode if product name exists
            const sorted = processedData
                .filter((i: any) => i.barcode || i.productName) 
                .sort((a: any,b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                
            localStorage.setItem(KEYS.CACHE_LOGS, JSON.stringify(sorted));
            localStorage.setItem(KEYS.CACHE_LOGS_TIMESTAMP, new Date().toISOString());
            return sorted;
        }
        return [];
    } catch (e: any) {
        if (cached) {
            console.warn("Fetch failed, returning cache:", e.message);
            return JSON.parse(cached).sort((a: any,b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        }
        throw e;
    }
};

export const saveQCRecord = async (record: Omit<QCRecord, 'id' | 'timestamp'>) => {
  const timestamp = record['timestamp'] || new Date().toISOString(); // Use existing timestamp if provided (for import)
  const payload = {
    lotNo: record.lotNo || '',
    productType: record.productType || '',
    barcode: record.barcode, 
    productName: record.productName,
    unitPrice: record.unitPrice || 0,
    costPrice: record.costPrice,
    sellingPrice: record.sellingPrice,
    reason: record.reason,
    remark: record.remark || '',
    inspectorId: record.inspectorId,
    timestamp: timestamp,
    imageUrls: record.imageUrls
  };

  const result = await callApi('saveQC', 'POST', payload);
  localStorage.removeItem(KEYS.CACHE_LOGS);
  localStorage.removeItem(KEYS.CACHE_LOGS_TIMESTAMP);
  return result;
};

export const setupGoogleSheet = async () => {
    const dummyPayload = {
        lotNo: 'SYSTEM_TEST',
        productType: 'TEST',
        barcode: 'TEST_CONNECTION',
        productName: 'Test Connection Record',
        unitPrice: 0,
        costPrice: 0,
        sellingPrice: 0,
        reason: 'Test Connection',
        remark: 'Can be deleted',
        inspectorId: 'System',
        timestamp: new Date().toISOString(),
        imageUrls: []
    };
    return await callApi('saveQC', 'POST', dummyPayload);
};

export const exportQCLogs = async (): Promise<void> => {
    let logs;
    try { logs = await fetchQCLogs(true, true); } catch { logs = await fetchQCLogs(false); }
    
    const exportData = logs.map(log => ({
        'Lot no.': log.lotNo,
        'Type': log.productType,
        'RMS Return Item ID': log.rmsId,
        'Product Name': log.productName,
        'Product unit price': log.unitPrice,
        'ต้นทุน': log.costPrice,
        'ราคาขาย': log.sellingPrice,
        'Comment': log.reason,
        'Remark': log.remark,
        'Inspector': log.inspectorId,
        'Timestamp': new Date(log.timestamp).toLocaleString('th-TH'),
        'Images': log.imageUrls.join(', ')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "QC_Logs");
    XLSX.writeFile(wb, `QC_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
};

export const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 600; 
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            }
        }
    })
}

// FAST IMPORT: Just parses and returns data. Does NOT call API.
export const importMasterData = async (file: File): Promise<ProductMaster[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet);

        const products: ProductMaster[] = json.map((row: any) => ({
          barcode: String(row['RMS Return Item ID'] || row['Barcode'] || row['barcode'] || row['RMS ID'] || ''),
          productName: String(row['Product Name'] || row['ProductName'] || row['Name'] || ''),
          costPrice: parseNum(row['ต้นทุน'] || row['CostPrice'] || row['Cost']),
          unitPrice: parseNum(row['Product unit price'] || row['UnitPrice'] || row['Price'] || row['Unit Price']),
          lotNo: String(row['Lot no.'] || row['Lot'] || row['LotNo'] || ''),
          productType: String(row['Type'] || row['ProductType'] || ''),
          stock: parseNum(row['Stock'] || row['Qty']),
          image: String(row['Image'] || ''),
        })).filter(p => p.barcode && p.productName);

        // Update Local Cache immediately
        localStorage.setItem(KEYS.CACHE_MASTER, JSON.stringify(products));
        localStorage.setItem(KEYS.CACHE_TIMESTAMP, new Date().toISOString());

        resolve(products);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};

export const clearLocalMasterData = () => {
    localStorage.removeItem(KEYS.CACHE_MASTER);
    localStorage.removeItem(KEYS.CACHE_TIMESTAMP);
};

export const exportMasterData = () => {
    const dataStr = localStorage.getItem(KEYS.CACHE_MASTER);
    const data: ProductMaster[] = dataStr ? JSON.parse(dataStr) : [];
    
    if (data.length === 0) return false;

    const exportData = data.map(p => ({
        'RMS Return Item ID': p.barcode,
        'Product Name': p.productName,
        'Lot no.': p.lotNo,
        'Type': p.productType,
        'ต้นทุน': p.costPrice,
        'Product unit price': p.unitPrice,
        'Stock': p.stock || 0
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Scrap Crossborder");
    XLSX.writeFile(wb, `Products_Master_${new Date().toISOString().slice(0,10)}.xlsx`);
    return true;
};

export const importQCLogs = async (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet);
  
          // Map Excel rows to QCRecord objects
          const records: any[] = json.map((row: any) => ({
             barcode: String(row['RMS Return Item ID'] || row['Barcode'] || row['RMS ID'] || row['barcode'] || ''),
             productName: String(row['Product Name'] || row['ProductName'] || row['Name'] || ''),
             costPrice: parseNum(row['ต้นทุน'] || row['Cost'] || row['CostPrice']),
             sellingPrice: parseNum(row['ราคาขาย'] || row['Selling Price'] || row['Price']),
             unitPrice: parseNum(row['Product unit price'] || row['Unit Price'] || row['UnitPrice']),
             reason: String(row['Comment'] || row['Reason'] || row['Note'] || ''),
             remark: String(row['Remark'] || row['remark'] || ''),
             inspectorId: String(row['Inspector'] || row['User'] || 'Imported'),
             timestamp: row['Timestamp'] || row['Date'] || new Date().toISOString(),
             lotNo: String(row['Lot no.'] || row['Lot'] || row['LotNo'] || ''),
             productType: String(row['Type'] || row['Product Type'] || row['ProductType'] || ''),
             imageUrls: row['Images'] ? (String(row['Images']).startsWith('[') ? JSON.parse(String(row['Images'])) : [String(row['Images'])]) : [],
             status: QCStatus.PASS // Default, will be derived logic in saveQCRecord implies status
          })).filter(r => r.barcode || r.productName);
  
          for (const r of records) {
              await saveQCRecord(r);
          }
          
          localStorage.removeItem(KEYS.CACHE_LOGS);
          localStorage.removeItem(KEYS.CACHE_LOGS_TIMESTAMP);
          resolve(records.length);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsBinaryString(file);
    });
};