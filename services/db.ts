
import { ProductMaster, QCRecord, QCStatus, User } from '../types';
import * as XLSX from 'xlsx';

// Storage Keys
const KEYS = {
  USERS: 'qc_users',
  API_URL: 'qc_api_url'
};

// --- CONFIGURATION ---
export const getApiUrl = () => localStorage.getItem(KEYS.API_URL) || '';
export const setApiUrl = (url: string) => {
    localStorage.setItem(KEYS.API_URL, url.trim());
};

// --- Helper for API Calls ---
const callApi = async (action: string, method: 'GET' | 'POST' = 'GET', body?: any) => {
    const url = getApiUrl().trim();
    if (!url) throw new Error("Google Script URL not configured");

    const fullUrl = method === 'GET' ? `${url}?action=${action}` : url;
    
    // For POST requests to Google Apps Script, we append the action to the URL parameters
    // and send the body as stringified JSON in text/plain mode to avoid CORS preflight issues.
    const fetchUrl = method === 'POST' ? `${url}${url.includes('?') ? '&' : '?'}action=${action}` : fullUrl;

    const options: RequestInit = {
        method,
        mode: 'cors', // Essential for reading the response
        credentials: 'omit', // CRITICAL: Prevents auth headers that confuse GAS
        redirect: 'follow', // Follow GAS redirects
        headers: {
             "Content-Type": "text/plain;charset=utf-8", 
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
            // If response is HTML (Google Login or Error page), it means permission issue
            if (text.trim().startsWith('<')) {
                throw new Error("Connection Blocked: Please set 'Who has access' to 'Anyone' in your Script deployment.");
            }
            throw e;
        }
    } catch (e: any) {
        console.error("API Error:", e);
        if (e.message === 'Failed to fetch') {
            throw new Error("Connection Failed: Check your internet or Google Script URL permissions.");
        }
        throw e;
    }
};

export const testApiConnection = async () => {
    try {
      const url = getApiUrl().trim();
      if (!url) return { success: false, error: "URL is empty" };

      // Use a simple GET request
      const res = await fetch(`${url}?action=getProducts`, { 
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          redirect: 'follow'
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
          console.error("Test parse error:", e);
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

// --- Master Data Services (Async API) ---
export const fetchMasterData = async (): Promise<ProductMaster[]> => {
  try {
      if (!getApiUrl()) return [];
      const data = await callApi('getProducts', 'GET');
      return Array.isArray(data) ? data : [];
  } catch (e) {
      console.error("Failed to fetch products", e);
      return [];
  }
};

export const saveProduct = async (product: ProductMaster) => {
  return await callApi('saveProduct', 'POST', product);
};

export const deleteProduct = async (barcode: string) => {
  const url = getApiUrl();
  if (!url) return;
  // Use callApi wrapper for consistency instead of raw fetch
  await callApi('deleteProduct', 'GET', null); // Currently using GET with params is easier for delete in some GAS setups, but let's stick to standard if possible.
  // Actually, for delete via POST:
  await fetch(`${url}?action=deleteProduct&barcode=${barcode}`, { 
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow'
  });
};

// --- QC Log Services (Async API) ---
export const fetchQCLogs = async (): Promise<QCRecord[]> => {
    try {
        if (!getApiUrl()) return [];
        const data = await callApi('getQCLogs', 'GET');
        return Array.isArray(data) ? data.sort((a: any,b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) : [];
    } catch (e) {
        return [];
    }
};

export const saveQCRecord = async (record: Omit<QCRecord, 'id' | 'timestamp'>) => {
  const newRecord = {
    ...record,
    timestamp: new Date().toISOString(),
  };
  return await callApi('saveQC', 'POST', newRecord);
};

export const exportQCLogs = async (): Promise<void> => {
    const logs = await fetchQCLogs();
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
        resolve(count);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};
