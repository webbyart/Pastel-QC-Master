
export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

export interface ProductMaster {
  barcode: string;
  productName: string;
  costPrice: number;
  image?: string; // Base64 or URL
  stock?: number;
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
  imageUrls: string[]; // Base64 strings for this demo
  timestamp: string; // ISO string
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