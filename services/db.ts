
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
// Set the default URL provided by the user
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwQnrHQ4FL6bWpABG-416FJeUVvCpEQtYQCB41CF8Avbk5hqxPB255EHBtuNg9W95kH6Q/exec';

export const getApiUrl = () => {
    const stored = localStorage.getItem(KEYS.API_URL);
    // Return stored URL if exists, otherwise return the hardcoded default
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

// --- Helper for API Calls ---
const callApi = async (action: string, method: 'GET' | 'POST' = 'GET', body?: any) => {
    const url = getApiUrl().trim();
    if (!url) throw new Error("Google Script URL not configured");

    // Add timestamp to prevent browser caching
    const timestamp = `_t=${Date.now()}`;
    const queryParams = `action=${action}&${timestamp}`;
    
    const fetchUrl = `${url}${url.includes('?') ? '&' : '?'}${queryParams}`;

    const options: RequestInit = {
        method,
        mode: 'cors',
        credentials: 'omit',
        redirect: 'follow',
        headers: {
             "Content-Type": "text/plain",
        },
    };

    if (method === 'POST') {
        options.body = JSON.stringify(body);
    }
    
    try {
        const res = await fetch(fetchUrl, options);
        if (!res.ok) {
             throw new Error(`HTTP Error: ${res.status}`);
        }
        const text = await res.text();
        try {
            const json = JSON.parse(text);
            if (json.error) throw new Error(json.error);
            return json;
        } catch (e) {
            if (text.trim().startsWith('<')) {
                throw new Error("Connection Blocked: Please set 'Who has access' to 'Anyone' in your Script deployment.");
            }
            throw e;
        }
    } catch (e: any) {
        console.error("API Error:", e);
        if (e.message === 'Failed to fetch' || e.message.includes('NetworkError')) {
            throw new Error("Connection Failed: Check internet or Script Permissions (Must be 'Anyone').");
        }
        throw e;
    }
};

export const testApiConnection = async () => {
    try {
      const url = getApiUrl().trim();
      if (!url) return { success: false, error: "URL is empty" };

      const res = await fetch(`${url}?action=getProducts&_t=${Date.now()}`, { 
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          redirect: 'follow',
          headers: { "Content-Type": "text/plain" }
      });
      
      const text = await res.text();
      
      try {
          const json = JSON.parse(text);
          if (json.error) {
              return { success: false, error: json.error };
          }
          const count = Array.isArray(json) ? json.length : 0;
          return { success: true, message: `Connected! Found ${count} products.` };
      } catch (e) {
          return { 
              success: false, 
              error: "Invalid response. Ensure 'Who has access' is 'Anyone' in deployment settings.",
              details: text.substring(0, 100) 
          };
      }
    } catch (e: any) {
      return { success: false, error: e.message || "Network error" };
    }
};

// --- Auth Services (Local) ---
export const loginUser = (username: string): User | null => {
  const usersStr = localStorage.getItem(KEYS.USERS);
  let users: User[] = usersStr ? JSON.parse(usersStr) : [];
  
  if (users.length === 0) {
      users = [
        { id: '1', username: 'admin', role: 'admin' },
        { id: '2', username: 'user', role: 'user' },
      ];
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
  if (index >= 0) {
    users[index] = user;
  } else {
    users.push(user);
  }
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
};

export const deleteUser = (id: string) => {
  const users = getUsers().filter(u => u.id !== id);
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
};

// --- Master Data Services (Async API with Cache) ---
export const fetchMasterData = async (forceUpdate = false, skipThrottle = false): Promise<ProductMaster[]> => {
  const cached = localStorage.getItem(KEYS.CACHE_MASTER);
  const lastFetch = localStorage.getItem(KEYS.CACHE_TIMESTAMP);
  const now = Date.now();
  const THROTTLE_TIME = 60000; // 60 seconds

  // 1. Return cache if not forcing update
  if (cached && !forceUpdate) {
      return JSON.parse(cached);
  }

  // 2. Throttle check: If forcing update (background sync) but within throttle time, return cache
  if (forceUpdate && !skipThrottle && lastFetch && cached) {
      if (now - new Date(lastFetch).getTime() < THROTTLE_TIME) {
          console.log("Throttling Master Data API call");
          return JSON.parse(cached);
      }
  }

  try {
      if (!getApiUrl()) return [];
      const data = await callApi('getProducts', 'GET');
      
      if (Array.isArray(data)) {
          localStorage.setItem(KEYS.CACHE_MASTER, JSON.stringify(data));
          localStorage.setItem(KEYS.CACHE_TIMESTAMP, new Date().toISOString());
          return data;
      }
      return [];
  } catch (e: any) {
      console.error("Failed to fetch products", e);
      
      // 3. Graceful Fallback: If quota exceeded or network error, return cache if available
      if ((e.message.includes('quota') || e.message.includes('exceeded') || e.message.includes('Failed to fetch')) && cached) {
          console.warn("Quota exceeded or Network fail, using cache");
          return JSON.parse(cached);
      }
      
      // If no cache, we must throw
      if (cached) return JSON.parse(cached);
      throw e;
  }
};

export const saveProduct = async (product: ProductMaster) => {
  const result = await callApi('saveProduct', 'POST', product);
  localStorage.removeItem(KEYS.CACHE_MASTER); 
  localStorage.removeItem(KEYS.CACHE_TIMESTAMP);
  return result;
};

export const deleteProduct = async (barcode: string) => {
  const url = getApiUrl();
  if (!url) return;
  await fetch(`${url}?action=deleteProduct&barcode=${barcode}`, { 
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      headers: { "Content-Type": "text/plain" }
  });
  localStorage.removeItem(KEYS.CACHE_MASTER);
  localStorage.removeItem(KEYS.CACHE_TIMESTAMP);
};

// --- QC Log Services (Async API with Cache) ---
export const fetchQCLogs = async (forceUpdate = false, skipThrottle = false): Promise<QCRecord[]> => {
    const cached = localStorage.getItem(KEYS.CACHE_LOGS);
    const lastFetch = localStorage.getItem(KEYS.CACHE_LOGS_TIMESTAMP);
    const now = Date.now();
    const THROTTLE_TIME = 60000; // 60 seconds

    if (cached && !forceUpdate) {
        const parsed = JSON.parse(cached);
        return parsed.sort((a: any,b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    // Throttle check
    if (forceUpdate && !skipThrottle && lastFetch && cached) {
        if (now - new Date(lastFetch).getTime() < THROTTLE_TIME) {
            console.log("Throttling QC Logs API call");
            const parsed = JSON.parse(cached);
            return parsed.sort((a: any,b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        }
    }

    try {
        if (!getApiUrl()) return [];
        const rawData = await callApi('getQCLogs', 'GET');
        
        if (Array.isArray(rawData)) {
            // Robust mapping to handle missing 'status' field from script
            const processedData = rawData.map((item: any) => {
                 // Logic to infer Status if missing or ambiguous
                 // If comment (reason) is present -> Damage (or Issue)
                 // If no comment -> Pass
                 let inferredStatus = item.status;
                 if (!inferredStatus || (inferredStatus !== 'Pass' && inferredStatus !== 'Damage')) {
                     const hasReason = item.reason && String(item.reason).trim().length > 0;
                     inferredStatus = hasReason ? QCStatus.DAMAGE : QCStatus.PASS;
                 }
                 
                 return {
                     ...item,
                     status: inferredStatus,
                     // Ensure numeric values
                     sellingPrice: Number(item.sellingPrice) || 0,
                     costPrice: Number(item.costPrice) || 0,
                     unitPrice: Number(item.unitPrice) || 0
                 };
            });

            const sorted = processedData.sort((a: any,b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            
            localStorage.setItem(KEYS.CACHE_LOGS, JSON.stringify(sorted));
            localStorage.setItem(KEYS.CACHE_LOGS_TIMESTAMP, new Date().toISOString());
            return sorted;
        }
        return [];
    } catch (e: any) {
        console.error("Failed to fetch logs", e);
        // Graceful Fallback
        if ((e.message.includes('quota') || e.message.includes('exceeded') || e.message.includes('Failed to fetch')) && cached) {
            const parsed = JSON.parse(cached);
            return parsed.sort((a: any,b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        }

        if (cached) return JSON.parse(cached);
        throw e;
    }
};

export const saveQCRecord = async (record: Omit<QCRecord, 'id' | 'timestamp'>) => {
  const newRecord = {
    ...record,
    timestamp: new Date().toISOString(),
  };
  const result = await callApi('saveQC', 'POST', newRecord);
  // Clear logs cache to ensure fresh data on next view
  localStorage.removeItem(KEYS.CACHE_LOGS);
  localStorage.removeItem(KEYS.CACHE_LOGS_TIMESTAMP);
  return result;
};

export const exportQCLogs = async (): Promise<void> => {
    const logs = await fetchQCLogs(true, true); // Force export to be fresh (skip throttle if possible, or user accepts wait)
    const exportData = logs.map(log => ({
        'Lot no.': log.lotNo || '',
        'Type': log.productType || '',
        'RMS Return Item ID': log.rmsId || log.barcode || '',
        'Product Name': log.productName,
        'Product unit price': log.unitPrice || 0,
        'ต้นทุน (Cost)': log.costPrice,
        'ราคาขาย (Selling Price)': log.sellingPrice,
        'Comment': log.reason,
        'Remark': log.remark || '',
        'Inspector': log.inspectorId,
        'Date/Time': new Date(log.timestamp).toLocaleString('th-TH'),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "QC_Logs");
    XLSX.writeFile(wb, `QC_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
};

// --- Image Helper ---
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

// --- Import Helper ---
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

        // Normalize Data using user specific columns
        const products: ProductMaster[] = json.map((row: any) => ({
          // Map 'RMS Return Item ID' OR 'Barcode'
          barcode: String(row['RMS Return Item ID'] || row['Barcode'] || row['barcode'] || ''),
          // Map 'Product Name'
          productName: String(row['Product Name'] || row['ProductName'] || row['Name'] || ''),
          // Map 'ต้นทุน' OR 'CostPrice'
          costPrice: Number(row['ต้นทุน'] || row['CostPrice'] || row['Cost'] || 0),
          // Map 'Product unit price' OR 'UnitPrice'
          unitPrice: Number(row['Product unit price'] || row['UnitPrice'] || row['Price'] || 0),
          // New: Map 'Lot no.'
          lotNo: String(row['Lot no.'] || row['Lot'] || row['LotNo'] || ''),
          // New: Map 'Type'
          productType: String(row['Type'] || row['ProductType'] || ''),
          stock: Number(row['Stock'] || row['stock'] || row['Qty'] || 0),
          image: String(row['Image'] || row['image'] || row['ImageUrl'] || ''),
        })).filter(p => p.barcode && p.productName);

        // Upload one by one
        let count = 0;
        for (const p of products) {
            await saveProduct(p);
            count++;
        }
        localStorage.removeItem(KEYS.CACHE_MASTER);
        localStorage.removeItem(KEYS.CACHE_TIMESTAMP);
        resolve(count);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};
