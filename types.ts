
export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  first_name?: string;
  last_name?: string;
  phone?: string;
  status: 'active' | 'inactive' | 'suspended';
  is_online: boolean;
  last_login?: string;
}

export interface ProductMaster {
  barcode: string; 
  productName: string;
  costPrice: number; 
  unitPrice?: number; 
  image?: string; 
  stock?: number;
  lotNo?: string; 
  productType?: string; 
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
