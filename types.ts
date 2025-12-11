
export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

export interface ProductMaster {
  barcode: string; // Maps to RMS Return Item ID
  productName: string;
  costPrice: number; // Maps to ต้นทุน
  unitPrice?: number; // Maps to Product unit price
  image?: string; 
  stock?: number;
  lotNo?: string; // New: Maps to Lot no.
  productType?: string; // New: Maps to Type
}

export enum QCStatus {
  PASS = 'Pass',
  DAMAGE = 'Damage',
}

export interface QCRecord {
  id: string;
  barcode: string;
  productName: string;
  costPrice: number;
  sellingPrice: number;
  status: QCStatus;
  reason: string; 
  remark?: string; 
  
  // Fields
  lotNo?: string;
  productType?: string;
  rmsId?: string;
  unitPrice?: number;

  imageUrls: string[]; 
  timestamp: string; 
  inspectorId: string;
}

export interface StatSummary {
  totalQC: number;
  passCount: number;
  damageCount: number;
  totalValue: number;
}

export interface FilterOptions {
  startDate: string;
  endDate: string;
  status: QCStatus | 'All';
  search: string;
}
