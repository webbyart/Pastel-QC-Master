
import { ProductMaster, QCRecord, QCStatus, User } from '../types';
import * as XLSX from 'xlsx';

// Storage Keys
const KEYS = {
  USERS: 'qc_users',
  MASTER: 'qc_master',
  LOGS: 'qc_logs',
  SESSION: 'qc_session'
};

// --- CONFIGURATION ---
// ⚠️ นำ Web App URL ที่ได้จากการ Deploy Google Apps Script มาวางที่นี่
export const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxrQBPExzqiQc0j6OFXtkxRyK0iCwSBs6CEqdeK7pVF277p19ctBoRHoV_LJaQn1ON0/exec'; 

// Sample Data with Real Images (Unsplash)
const SAMPLE_PRODUCTS: ProductMaster[] = [
  { barcode: '8850001', productName: 'สมุดโน้ตพาสเทล A5', costPrice: 45, image: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=300&q=80', stock: 50 },
  { barcode: '8850002', productName: 'ปากกาเจลสีน้ำเงิน 0.5', costPrice: 12, image: 'https://images.unsplash.com/photo-1585336261022-680e295ce3fe?auto=format&fit=crop&w=300&q=80', stock: 120 },
  { barcode: '8850003', productName: 'ชุดปากกาไฮไลท์ 5 สี', costPrice: 89, image: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=300&q=80', stock: 30 },
  { barcode: '8850004', productName: 'เทปลบคำผิด', costPrice: 35, image: 'https://images.unsplash.com/photo-1599691653806-03f1912a7620?auto=format&fit=crop&w=300&q=80', stock: 8 },
  { barcode: '8850005', productName: 'โพสต์อิท 3x3 นิ้ว', costPrice: 25, image: 'https://images.unsplash.com/photo-1586165368502-1bad197a6461?auto=format&fit=crop&w=300&q=80', stock: 200 },
  { barcode: '8850006', productName: 'แฟ้มเอกสาร A4', costPrice: 120, image: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=300&q=80', stock: 15 },
  { barcode: '8850007', productName: 'กรรไกรสแตนเลส 6 นิ้ว', costPrice: 55, image: 'https://images.unsplash.com/photo-1598535806659-45037d00bc0b?auto=format&fit=crop&w=300&q=80', stock: 45 },
  { barcode: '8850008', productName: 'เครื่องเย็บกระดาษ เบอร์ 10', costPrice: 60, image: 'https://images.unsplash.com/photo-1624516949069-b3287383796f?auto=format&fit=crop&w=300&q=80', stock: 60 },
  { barcode: '8850009', productName: 'ลวดเย็บกระดาษ (กล่อง)', costPrice: 10, image: 'https://images.unsplash.com/photo-1616053351980-877478065094?auto=format&fit=crop&w=300&q=80', stock: 500 },
  { barcode: '8850010', productName: 'คลิปหนีบกระดาษสี', costPrice: 15, image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=300&q=80', stock: 150 },
  { barcode: '8850011', productName: 'ไม้บรรทัดเหล็ก 30 ซม.', costPrice: 18, image: 'https://images.unsplash.com/photo-1588863683050-48e2c4cf2c8e?auto=format&fit=crop&w=300&q=80', stock: 80 },
  { barcode: '8850012', productName: 'ยางลบก้อนขาว', costPrice: 8, image: 'https://images.unsplash.com/photo-1627252238059-7d8857470656?auto=format&fit=crop&w=300&q=80', stock: 300 },
  { barcode: '8850013', productName: 'ดินสอไม้ 2B (แพ็ค)', costPrice: 40, image: 'https://images.unsplash.com/photo-1598462058348-185c9dc537df?auto=format&fit=crop&w=300&q=80', stock: 25 },
  { barcode: '8850014', productName: 'ดินสอกด 0.5', costPrice: 25, image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=300&q=80', stock: 90 },
  { barcode: '8850015', productName: 'ไส้ดินสอกด 0.5', costPrice: 10, image: 'https://images.unsplash.com/photo-1598462058348-185c9dc537df?auto=format&fit=crop&w=300&q=80', stock: 200 },
  { barcode: '8850016', productName: 'กาวแท่ง', costPrice: 22, image: 'https://images.unsplash.com/photo-1592305881475-4721d7b00346?auto=format&fit=crop&w=300&q=80', stock: 75 },
  { barcode: '8850017', productName: 'คัตเตอร์เล็ก', costPrice: 30, image: 'https://images.unsplash.com/photo-1590425717326-788ee5c74238?auto=format&fit=crop&w=300&q=80', stock: 40 },
  { barcode: '8850018', productName: 'แท่นตัดเทป', costPrice: 150, image: 'https://images.unsplash.com/photo-1616400619175-5beda3a17896?auto=format&fit=crop&w=300&q=80', stock: 12 },
  { barcode: '8850019', productName: 'เทปใส 1/2 นิ้ว', costPrice: 12, image: 'https://images.unsplash.com/photo-1616400619175-5beda3a17896?auto=format&fit=crop&w=300&q=80', stock: 180 },
  { barcode: '8850020', productName: 'กาวสองหน้าบาง', costPrice: 20, image: 'https://images.unsplash.com/photo-1582234032644-3d077c57022c?auto=format&fit=crop&w=300&q=80', stock: 100 },
];

// --- Mock Data Initialization ---
const initDB = () => {
  if (!localStorage.getItem(KEYS.USERS)) {
    const defaultUsers: User[] = [
      { id: '1', username: 'admin', role: 'admin' },
      { id: '2', username: 'user', role: 'user' },
    ];
    localStorage.setItem(KEYS.USERS, JSON.stringify(defaultUsers));
  }
  if (!localStorage.getItem(KEYS.MASTER)) {
    localStorage.setItem(KEYS.MASTER, JSON.stringify(SAMPLE_PRODUCTS));
  }
  if (!localStorage.getItem(KEYS.LOGS)) {
    localStorage.setItem(KEYS.LOGS, JSON.stringify([]));
  }
};

initDB();

// --- Google Sheet Helper ---
const syncToGoogle = async (action: string, data: any) => {
    if (!GOOGLE_SCRIPT_URL) return; // Skip if no URL
    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Important for GAS
            headers: { 'Content-Type': 'text/plain' }, // GAS no-cors prefers text/plain or empty
            body: JSON.stringify({ action, data })
        });
    } catch (e) {
        console.error("Google Sync Error:", e);
    }
}

// --- Auth Services ---
export const loginUser = (username: string): User | null => {
  const usersStr = localStorage.getItem(KEYS.USERS);
  if (!usersStr) return null;
  const users: User[] = JSON.parse(usersStr);
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

// --- Master Data Services ---
export const getMasterData = (): ProductMaster[] => {
  const str = localStorage.getItem(KEYS.MASTER);
  return str ? JSON.parse(str) : [];
};

export const getProductByBarcode = (barcode: string): ProductMaster | undefined => {
  const products = getMasterData();
  return products.find(p => p.barcode === barcode);
};

export const saveProduct = (product: ProductMaster) => {
  const products = getMasterData();
  const index = products.findIndex(p => p.barcode === product.barcode);
  if (index >= 0) {
    products[index] = product;
  } else {
    products.push(product);
  }
  localStorage.setItem(KEYS.MASTER, JSON.stringify(products));
  
  // Sync all products to Google Sheet (Optional - Heavy operation)
  if (GOOGLE_SCRIPT_URL) {
      syncToGoogle('syncProducts', products);
  }
};

export const importMasterData = async (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet);

        // Normalize Data
        const products: ProductMaster[] = json.map((row: any) => ({
          barcode: String(row['Barcode'] || row['barcode'] || ''),
          productName: String(row['ProductName'] || row['productName'] || row['Name'] || ''),
          costPrice: Number(row['CostPrice'] || row['costPrice'] || row['Cost'] || 0),
          stock: Number(row['Stock'] || row['stock'] || row['Qty'] || 0),
          image: String(row['Image'] || row['image'] || row['ImageUrl'] || ''),
        })).filter(p => p.barcode && p.productName);

        // Merge with existing
        const existing = getMasterData();
        const existingMap = new Map(existing.map(p => [p.barcode, p]));
        
        products.forEach(p => existingMap.set(p.barcode, p));
        
        const merged = Array.from(existingMap.values());
        localStorage.setItem(KEYS.MASTER, JSON.stringify(merged));
        
        // Sync to Google
        if (GOOGLE_SCRIPT_URL) {
            syncToGoogle('syncProducts', merged);
        }

        setTimeout(() => resolve(products.length), 800);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};

export const deleteProduct = (barcode: string) => {
  const data = getMasterData().filter(p => p.barcode !== barcode);
  localStorage.setItem(KEYS.MASTER, JSON.stringify(data));
  if (GOOGLE_SCRIPT_URL) syncToGoogle('syncProducts', data);
};

export const seedMasterData = (): ProductMaster[] => {
  localStorage.setItem(KEYS.MASTER, JSON.stringify(SAMPLE_PRODUCTS));
  if (GOOGLE_SCRIPT_URL) syncToGoogle('syncProducts', SAMPLE_PRODUCTS);
  return SAMPLE_PRODUCTS;
};

// --- QC Log Services ---
export const getQCLogs = (): QCRecord[] => {
  const str = localStorage.getItem(KEYS.LOGS);
  return str ? JSON.parse(str) : [];
};

export const saveQCRecord = (record: Omit<QCRecord, 'id' | 'timestamp'>): QCRecord => {
  const logs = getQCLogs();
  const newRecord: QCRecord = {
    ...record,
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
  };
  logs.unshift(newRecord); // Add to top
  localStorage.setItem(KEYS.LOGS, JSON.stringify(logs));

  // Sync Log to Google Sheet
  if (GOOGLE_SCRIPT_URL) {
      syncToGoogle('saveQC', newRecord);
  }

  return newRecord;
};

export const exportQCLogs = async (): Promise<void> => {
  return new Promise((resolve) => {
    // Simulate delay
    setTimeout(() => {
        const logs = getQCLogs();
        const exportData = logs.map(log => ({
            DateTime: new Date(log.timestamp).toLocaleString('th-TH'),
            Barcode: log.barcode,
            ProductName: log.productName,
            CostPrice: log.costPrice,
            SellingPrice: log.sellingPrice,
            Status: log.status,
            Reason: log.reason,
            Inspector: log.inspectorId
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "QC_Logs");
        XLSX.writeFile(wb, `QC_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
        resolve();
    }, 1000);
  });
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
                const MAX_WIDTH = 400; // Resize for LocalStorage limits
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            }
        }
    })
}
