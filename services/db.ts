

import { ProductMaster, QCRecord, QCStatus, User } from '../types';
import * as XLSX from 'xlsx';

// Storage Keys
const KEYS = {
  USERS: 'qc_users',
  API_URL: 'qc_api_url',
  CACHE_MASTER: 'qc_cache_master',
  CACHE_LOGS: 'qc_cache_logs',
  CACHE_TIMESTAMP: 'qc_cache_time',
  CACHE_LOGS_TIMESTAMP: 'qc_cache_logs_time'
};

// --- CONFIGURATION ---
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwQnrHQ4FL6bWpABG-416FJeUVvCpEQtYQCB41CF8Avbk5hqxPB255EHBtuNg9W95kH6Q/exec';

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
            // Include action in body for robust parsing in new script
            options.body = JSON.stringify({ ...body, action }); 
        }
        
        let lastError: any;
        const RETRIES = 2;

        for (let i = 0; i < RETRIES; i++) {
            try {
                const res = await fetch(fetchUrl, options);
                
                if (res.status === 429) {
                    throw new Error("The quota has been exceeded. Please wait a minute.");
                }

                if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
                
                const text = await res.text();
                
                if (text.trim().startsWith('<')) {
                    if (text.includes('quota') || text.includes('exceeded')) {
                         throw new Error("The quota has been exceeded. Please wait a minute.");
                    }
                    if (text.includes('Google Drive') || text.includes('script.google.com')) {
                        throw new Error("Script Permission Error: Set 'Who has access' to 'Anyone'.");
                    }
                    throw new Error("Connection Blocked: The server returned HTML instead of JSON.");
                }

                try {
                    const json = JSON.parse(text);
                    if (json.error) throw new Error(json.error);
                    return json;
                } catch (e) {
                    console.error("JSON Parse Error:", text.substring(0, 100));
                    throw new Error(`Invalid response format: ${text.substring(0, 50)}...`);
                }
            } catch (e: any) {
                console.warn(`API Attempt ${i + 1} failed: ${e.message}`);
                lastError = e;
                if (e.message.includes('quota') || e.message.includes('exceeded')) break;
                if (i < RETRIES - 1) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
            }
        }
        throw lastError;
    };

    const promise = executeRequest();
    pendingRequests[requestKey] = promise;
    try { return await promise; } finally { delete pendingRequests[requestKey]; }
};

export const testApiConnection = async () => {
    try {
      const url = getApiUrl().trim();
      if (!url) return { success: false, error: "URL is empty" };
      await callApi('testConnection', 'GET');
      return { success: true, message: `Server is reachable` };
    } catch (e: any) {
      return { success: false, error: e.message || "Network error" };
    }
};

export const testMasterDataAccess = async () => {
    try {
        const rawData = await callApi('getProducts', 'GET');
        if (Array.isArray(rawData)) return { success: true, message: `Found ${rawData.length} products`, count: rawData.length };
        return { success: false, error: `Invalid data: Expected Array, got ${typeof rawData}` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export const testQCLogAccess = async () => {
    try {
        const rawData = await callApi('getQCLogs', 'GET');
        if (Array.isArray(rawData)) return { success: true, message: `Found ${rawData.length} logs`, count: rawData.length };
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
      if (Date.now() - new Date(lastFetch).getTime() < 60000) return JSON.parse(cached);
  }

  try {
      if (!getApiUrl()) return [];
      const rawData = await callApi('getProducts', 'GET');
      
      if (Array.isArray(rawData)) {
          const mappedData: ProductMaster[] = rawData.map((item: any) => ({
              // New script uses standardized keys ('barcode', 'productName')
              // But keep fallbacks just in case
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
      if (cached) return JSON.parse(cached);
      throw e;
  }
};

export const saveProduct = async (product: ProductMaster) => {
  // New script expects direct keys matching config or headers
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
  localStorage.removeItem(KEYS.CACHE_MASTER); 
  localStorage.removeItem(KEYS.CACHE_TIMESTAMP);
  return result;
};

export const deleteProduct = async (barcode: string) => {
  await callApi('deleteProduct', 'POST', { barcode });
  localStorage.removeItem(KEYS.CACHE_MASTER);
  localStorage.removeItem(KEYS.CACHE_TIMESTAMP);
};

export const fetchQCLogs = async (forceUpdate = false, skipThrottle = false): Promise<QCRecord[]> => {
    const cached = localStorage.getItem(KEYS.CACHE_LOGS);
    const lastFetch = localStorage.getItem(KEYS.CACHE_LOGS_TIMESTAMP);

    if (cached && !forceUpdate) {
        const parsed = JSON.parse(cached);
        return parsed.sort((a: any,b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    if (forceUpdate && !skipThrottle && lastFetch && cached) {
        if (Date.now() - new Date(lastFetch).getTime() < 60000) {
            const parsed = JSON.parse(cached);
            return parsed.sort((a: any,b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        }
    }

    try {
        if (!getApiUrl()) return [];
        const rawData = await callApi('getQCLogs', 'GET');
        
        if (Array.isArray(rawData)) {
            const processedData = rawData.map((item: any) => {
                 const rawImages = item.imageUrls || item['Images'] || []; 
                 let imageUrls: string[] = [];
                 if (Array.isArray(rawImages)) {
                     imageUrls = rawImages;
                 } else if (typeof rawImages === 'string' && rawImages.trim() !== '') {
                     try {
                        imageUrls = rawImages.startsWith('[') ? JSON.parse(rawImages) : rawImages.split(',').map(s => s.trim());
                     } catch { imageUrls = []; }
                 }

                 let inferredStatus = QCStatus.PASS;
                 // Check logical status if strict status field is missing
                 const rReason = item.reason || item['Comment'];
                 if ((rReason && rReason !== '-' && rReason !== '') || (item.sellingPrice === 0)) {
                    inferredStatus = QCStatus.DAMAGE;
                 }
                 // If status field exists from new script, use it (though new script might not store explicit status if column missing)
                 // We rely on logic mostly for now unless we add 'Status' column to Sheet
                 
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

            const sorted = processedData.filter((i: any) => i.barcode).sort((a: any,b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            localStorage.setItem(KEYS.CACHE_LOGS, JSON.stringify(sorted));
            localStorage.setItem(KEYS.CACHE_LOGS_TIMESTAMP, new Date().toISOString());
            return sorted;
        }
        return [];
    } catch (e: any) {
        if (cached) return JSON.parse(cached).sort((a: any,b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        throw e;
    }
};

export const saveQCRecord = async (record: Omit<QCRecord, 'id' | 'timestamp'>) => {
  const timestamp = new Date().toISOString();
  // Compatible with New GAS Script (Standard Keys)
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
    // Send a dummy record to trigger header creation in the new script
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

export const importMasterData = async (file: File): Promise<number> => {
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
          barcode: String(row['RMS Return Item ID'] || row['Barcode'] || row['barcode'] || ''),
          productName: String(row['Product Name'] || row['ProductName'] || row['Name'] || ''),
          costPrice: parseNum(row['ต้นทุน'] || row['CostPrice'] || row['Cost']),
          unitPrice: parseNum(row['Product unit price'] || row['UnitPrice'] || row['Price']),
          lotNo: String(row['Lot no.'] || row['Lot'] || row['LotNo'] || ''),
          productType: String(row['Type'] || row['ProductType'] || ''),
          stock: parseNum(row['Stock'] || row['Qty']),
          image: String(row['Image'] || ''),
        })).filter(p => p.barcode && p.productName);

        // With new script, we can save parallel better or just loop
        for (const p of products) {
            await saveProduct(p);
        }
        localStorage.removeItem(KEYS.CACHE_MASTER);
        localStorage.removeItem(KEYS.CACHE_TIMESTAMP);
        resolve(products.length);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};
