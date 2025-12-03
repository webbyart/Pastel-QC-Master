
import { ProductMaster, QCRecord, QCStatus, User } from '../types';
import * as XLSX from 'xlsx';

// Storage Keys
const KEYS = {
  USERS: 'qc_users',
  MASTER: 'qc_master',
  LOGS: 'qc_logs',
  SESSION: 'qc_session'
};

const SAMPLE_PRODUCTS: ProductMaster[] = [
  { barcode: '8850001', productName: 'สมุดโน้ตพาสเทล A5', costPrice: 45, image: 'https://placehold.co/200/e0f2fe/0369a1?text=Notebook', stock: 50 },
  { barcode: '8850002', productName: 'ปากกาเจลสีน้ำเงิน 0.5', costPrice: 12, image: 'https://placehold.co/200/dcfce7/15803d?text=Pen', stock: 120 },
  { barcode: '8850003', productName: 'ชุดปากกาไฮไลท์ 5 สี', costPrice: 89, image: 'https://placehold.co/200/f3e8ff/7e22ce?text=Highlight', stock: 30 },
  { barcode: '8850004', productName: 'เทปลบคำผิด', costPrice: 35, stock: 8 },
  { barcode: '8850005', productName: 'โพสต์อิท 3x3 นิ้ว', costPrice: 25, image: 'https://placehold.co/200/ffedd5/c2410c?text=Sticky', stock: 200 },
  { barcode: '8850006', productName: 'แฟ้มเอกสาร A4', costPrice: 120, stock: 15 },
  { barcode: '8850007', productName: 'กรรไกรสแตนเลส 6 นิ้ว', costPrice: 55, image: 'https://placehold.co/200/fce7f3/be185d?text=Scissors', stock: 45 },
  { barcode: '8850008', productName: 'เครื่องเย็บกระดาษ เบอร์ 10', costPrice: 60, stock: 60 },
  { barcode: '8850009', productName: 'ลวดเย็บกระดาษ (กล่อง)', costPrice: 10, stock: 500 },
  { barcode: '8850010', productName: 'คลิปหนีบกระดาษสี', costPrice: 15, stock: 150 },
  { barcode: '8850011', productName: 'ไม้บรรทัดเหล็ก 30 ซม.', costPrice: 18, stock: 80 },
  { barcode: '8850012', productName: 'ยางลบก้อนขาว', costPrice: 8, stock: 300 },
  { barcode: '8850013', productName: 'ดินสอไม้ 2B (แพ็ค)', costPrice: 40, stock: 25 },
  { barcode: '8850014', productName: 'ดินสอกด 0.5', costPrice: 25, stock: 90 },
  { barcode: '8850015', productName: 'ไส้ดินสอกด 0.5', costPrice: 10, stock: 200 },
  { barcode: '8850016', productName: 'กาวแท่ง', costPrice: 22, stock: 75 },
  { barcode: '8850017', productName: 'คัตเตอร์เล็ก', costPrice: 30, stock: 40 },
  { barcode: '8850018', productName: 'แท่นตัดเทป', costPrice: 150, stock: 12 },
  { barcode: '8850019', productName: 'เทปใส 1/2 นิ้ว', costPrice: 12, stock: 180 },
  { barcode: '8850020', productName: 'กาวสองหน้าบาง', costPrice: 20, stock: 100 },
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
    // Auto-seed with sample data if empty
    localStorage.setItem(KEYS.MASTER, JSON.stringify(SAMPLE_PRODUCTS));
  }
  if (!localStorage.getItem(KEYS.LOGS)) {
    localStorage.setItem(KEYS.LOGS, JSON.stringify([]));
  }
};

initDB();

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

        // Merge with existing (Overwrite duplicates based on barcode)
        const existing = getMasterData();
        const existingMap = new Map(existing.map(p => [p.barcode, p]));
        
        products.forEach(p => existingMap.set(p.barcode, p));
        
        const merged = Array.from(existingMap.values());
        localStorage.setItem(KEYS.MASTER, JSON.stringify(merged));
        // Simulate network delay
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
};

export const seedMasterData = (): ProductMaster[] => {
  localStorage.setItem(KEYS.MASTER, JSON.stringify(SAMPLE_PRODUCTS));
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
