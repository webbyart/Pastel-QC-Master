
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getUsers, saveUser, deleteUser, getApiUrl, setApiUrl, testApiConnection, testMasterDataAccess, testQCLogAccess, clearCache, setupGoogleSheet } from '../services/db';
import { User } from '../types';
import { LogOut, Moon, Sun, User as UserIcon, Plus, Trash2, Edit2, X, Box, Link, Check, AlertCircle, CheckCircle, RefreshCw, HelpCircle, AlertTriangle, Database, Server, FileText, TableProperties, Play, Code, Copy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const GOOGLE_SCRIPT_CODE = `
// --- CONFIGURATION ---
const CONFIG = {
  sheet_master: 'Scrap Crossborder', 
  sheet_logs: 'QC_Logs'
};

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(30000);

  try {
    var action = e.parameter.action;
    var payload = {};
    
    if (e.postData && e.postData.contents) {
      try {
        var body = JSON.parse(e.postData.contents);
        if (body.action) action = body.action;
        payload = body;
      } catch (parseError) { }
    }

    if (!action) return response({ error: 'Missing action parameter' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'getProducts') {
      return response(readSheetRobust(ss, CONFIG.sheet_master, 'product'));
    }

    if (action === 'getQCLogs') {
      return response(readSheetRobust(ss, CONFIG.sheet_logs, 'log'));
    }

    if (action === 'saveQC') {
      var flatData = {
        'RMS Return Item ID': payload.barcode,
        'Product Name': payload.productName,
        'ต้นทุน': payload.costPrice,
        'ราคาขาย': payload.sellingPrice,
        'Product unit price': payload.unitPrice,
        'Comment': payload.reason,
        'Remark': payload.remark,
        'Inspector': payload.inspectorId,
        'Lot no.': payload.lotNo,
        'Type': payload.productType,
        'Timestamp': payload.timestamp,
        'Images': Array.isArray(payload.imageUrls) ? JSON.stringify(payload.imageUrls) : payload.imageUrls
      };
      saveRow(ss, CONFIG.sheet_logs, flatData);
      return response({ success: true });
    }

    if (action === 'saveProduct') {
      var flatData = {
        'RMS Return Item ID': payload.barcode,
        'Product Name': payload.productName,
        'ต้นทุน': payload.costPrice,
        'Product unit price': payload.unitPrice,
        'Lot no.': payload.lotNo,
        'Type': payload.productType,
        'Stock': payload.stock,
        'Image': payload.image
      };
      saveRow(ss, CONFIG.sheet_master, flatData, 'RMS Return Item ID'); 
      return response({ success: true });
    }
    
    if (action === 'replaceProducts') {
      // Bulk replacement for master data
      var products = payload.products;
      if (!Array.isArray(products)) return response({ error: 'Invalid products array' });
      
      var sheet = ss.getSheetByName(CONFIG.sheet_master);
      if (!sheet) sheet = ss.insertSheet(CONFIG.sheet_master);
      
      sheet.clearContents();
      
      // Headers
      var headers = ['RMS Return Item ID', 'Lot no.', 'Type', 'Product Name', 'ต้นทุน', 'Product unit price', 'Stock'];
      sheet.appendRow(headers);
      
      if (products.length > 0) {
        var rows = products.map(function(p) {
          return [
             p.barcode || '',
             p.lotNo || '',
             p.productType || '',
             p.productName || '',
             p.costPrice || 0,
             p.unitPrice || 0,
             p.stock || 0
          ];
        });
        
        // Write in batch
        sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      }
      
      return response({ success: true, count: products.length });
    }

    if (action === 'deleteProduct') {
      var barcode = e.parameter.barcode || payload.barcode;
      deleteRow(ss, CONFIG.sheet_master, 'RMS Return Item ID', barcode);
      return response({ success: true });
    }

    if (action === 'testConnection') {
      return response({ success: true, message: 'Connection OK', time: new Date() });
    }

    return response({ error: 'Unknown action: ' + action });

  } catch (err) {
    return response({ error: 'Exception: ' + err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function response(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function readSheetRobust(ss, sheetName, type) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  
  var range = sheet.getDataRange();
  if (range.isBlank()) return [];

  var data = range.getDisplayValues();
  if (data.length < 2) return []; 
  
  var headers = data[0];
  var rows = data.slice(1);
  
  var headerMap = {};
  for (var h = 0; h < headers.length; h++) {
    var cleanHeader = String(headers[h]).trim().toLowerCase();
    headerMap[cleanHeader] = h;
  }
  
  function getColIdx(possibleNames) {
    for (var i = 0; i < possibleNames.length; i++) {
      var name = possibleNames[i].toLowerCase();
      if (headerMap.hasOwnProperty(name)) return headerMap[name];
    }
    return -1;
  }

  return rows.map(function(row, i) {
    var getValue = function(keys) {
      var idx = getColIdx(keys);
      return idx !== -1 ? row[idx] : "";
    };

    if (type === 'product') {
      return {
        id: String(i + 2),
        barcode: getValue(['RMS Return Item ID', 'Barcode', 'RMS ID', 'barcode', 'id']),
        productName: getValue(['Product Name', 'Name', 'productName', 'Title']),
        costPrice: getValue(['ต้นทุน', 'Cost', 'Cost Price', 'costPrice']),
        unitPrice: getValue(['Product unit price', 'Unit Price', 'Price', 'unitPrice']),
        lotNo: getValue(['Lot no.', 'Lot', 'LotNo', 'lotNo']),
        productType: getValue(['Type', 'Product Type', 'productType']),
        stock: getValue(['Stock', 'Qty', 'Quantity']),
        image: getValue(['Image', 'Images', 'Img'])
      };
    } else {
      return {
        id: String(i + 2),
        barcode: getValue(['RMS Return Item ID', 'Barcode', 'RMS ID', 'barcode']),
        productName: getValue(['Product Name', 'Name', 'productName']),
        costPrice: getValue(['ต้นทุน', 'Cost', 'Cost Price']),
        sellingPrice: getValue(['ราคาขาย', 'Selling Price', 'sellingPrice', 'Price']),
        unitPrice: getValue(['Product unit price', 'Unit Price']),
        reason: getValue(['Comment', 'Reason', 'Note']),
        remark: getValue(['Remark', 'remark']),
        inspectorId: getValue(['Inspector', 'User', 'inspectorId']),
        timestamp: getValue(['Timestamp', 'Date', 'Time']),
        imageUrls: getValue(['Images', 'Image', 'imageUrls']),
        lotNo: getValue(['Lot no.', 'Lot', 'LotNo']),
        productType: getValue(['Type', 'Product Type'])
      };
    }
  });
}

function saveRow(ss, sheetName, dataObj, uniqueKeyHeader) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  var lastRow = sheet.getLastRow();
  var headers = [];
  
  if (lastRow === 0) {
    headers = Object.keys(dataObj);
    sheet.appendRow(headers);
  } else {
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  }

  var rowValues = headers.map(function(header) {
    var val = dataObj[header];
    if (val === undefined) {
       var key = Object.keys(dataObj).find(k => k.toLowerCase() === String(header).toLowerCase());
       val = key ? dataObj[key] : "";
    }
    return String(val); 
  });

  if (uniqueKeyHeader) {
    var allData = sheet.getDataRange().getValues();
    var headerIdx = headers.indexOf(uniqueKeyHeader);
    var updateTarget = String(dataObj[uniqueKeyHeader]);
    
    if (headerIdx > -1 && allData.length > 1) {
      for (var i = 1; i < allData.length; i++) {
        if (String(allData[i][headerIdx]) === updateTarget) {
          sheet.getRange(i + 1, 1, 1, rowValues.length).setValues([rowValues]);
          return;
        }
      }
    }
  }

  sheet.appendRow(rowValues);
}

function deleteRow(ss, sheetName, keyHeader, value) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  
  var data = sheet.getDataRange().getValues();
  if (data.length === 0) return;
  
  var headers = data[0];
  var colIdx = headers.indexOf(keyHeader);
  if (colIdx === -1) {
     colIdx = headers.findIndex(h => String(h).toLowerCase() === String(keyHeader).toLowerCase());
  }
  
  if (colIdx === -1) return; 

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colIdx]) === String(value)) {
      sheet.deleteRow(i + 1);
      return; 
    }
  }
}
`;

export const Settings: React.FC = () => {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // User Management State
  const [users, setUsers] = useState<User[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});
  
  // Script Modal
  const [showScriptModal, setShowScriptModal] = useState(false);
  
  // API URL State
  const [url, setUrl] = useState('');
  
  // Detailed Test State
  const [testingStatus, setTestingStatus] = useState({
      server: { status: 'idle', message: '' },
      master: { status: 'idle', message: '' },
      logs: { status: 'idle', message: '' }
  });
  const [isSettingUp, setIsSettingUp] = useState(false);

  useEffect(() => {
    if (user?.role === 'admin') {
      setUsers(getUsers());
    }
    const current = getApiUrl();
    setUrl(current);
  }, [user, showUserModal]);

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser.username) return;
    
    saveUser({
        id: editingUser.id || Date.now().toString(),
        username: editingUser.username,
        role: editingUser.role || 'user'
    });
    setShowUserModal(false);
    setUsers(getUsers());
  };

  const handleDeleteUser = (id: string) => {
    if (confirm('ยืนยันการลบผู้ใช้งานนี้?')) {
        deleteUser(id);
        setUsers(getUsers());
    }
  };

  const handleSaveUrl = () => {
      setApiUrl(url);
      alert('บันทึก URL เรียบร้อยแล้ว');
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(GOOGLE_SCRIPT_CODE);
    alert("คัดลอกโค้ดแล้ว! นำไปวางใน Google Apps Script Editor");
  };

  const runDiagnostics = async () => {
      if (!url) {
          alert("กรุณาระบุ URL ก่อนเริ่มการทดสอบ");
          return;
      }
      setApiUrl(url); 

      setTestingStatus({
          server: { status: 'loading', message: 'Pinging...' },
          master: { status: 'loading', message: 'Checking...' },
          logs: { status: 'loading', message: 'Checking...' }
      });

      // 1. Server Ping
      const serverRes = await testApiConnection();
      setTestingStatus(prev => ({
          ...prev,
          server: { status: serverRes.success ? 'success' : 'error', message: serverRes.success ? 'Connected' : serverRes.error || 'Failed' }
      }));

      // 2. Master Data & Logs
      if (serverRes.success) {
          testMasterDataAccess().then(res => {
               setTestingStatus(prev => ({
                  ...prev,
                  master: { status: res.success ? 'success' : 'error', message: res.success ? `${res.count} Items` : res.error || 'Failed' }
               }));
          });

          testQCLogAccess().then(res => {
               setTestingStatus(prev => ({
                  ...prev,
                  logs: { status: res.success ? 'success' : 'error', message: res.success ? `${res.count} Logs` : res.error || 'Failed' }
               }));
          });
      } else {
          setTestingStatus(prev => ({
              ...prev,
              master: { status: 'error', message: 'Skipped' },
              logs: { status: 'error', message: 'Skipped' }
          }));
      }
  };

  const handleSetupSheet = async () => {
      if (!confirm('ระบบจะส่งข้อมูลทดสอบ 1 รายการเพื่อสร้าง Headers ใน Sheet "QC_Logs" หากยังไม่มีอยู่\n\nต้องการดำเนินการต่อหรือไม่?')) return;
      
      setIsSettingUp(true);
      try {
          await setupGoogleSheet();
          alert('ส่งข้อมูลทดสอบสำเร็จ! กรุณาตรวจสอบ Google Sheet ของคุณว่ามี Header ขึ้นหรือไม่');
          runDiagnostics(); // Re-run tests
      } catch (e: any) {
          alert(`เกิดข้อผิดพลาด: ${e.message}`);
      } finally {
          setIsSettingUp(false);
      }
  };
  
  const handleClearCache = () => {
      if(confirm('คุณต้องการล้างแคชข้อมูลทั้งหมดหรือไม่? (ข้อมูลจะถูกโหลดใหม่จาก Google Sheet)')) {
          clearCache();
          alert('ล้างแคชเรียบร้อยแล้ว');
          window.location.reload();
      }
  };

  const getStatusIcon = (status: string) => {
      if (status === 'loading') return <RefreshCw className="animate-spin text-blue-500" size={20} />;
      if (status === 'success') return <CheckCircle className="text-green-500" size={20} />;
      if (status === 'error') return <AlertCircle className="text-red-500" size={20} />;
      return <div className="w-5 h-5 rounded-full border-2 border-gray-200" />;
  };

  return (
    <div className="space-y-6 pb-24 md:pb-0 animate-fade-in">
      <h1 className="text-3xl font-display font-bold text-gray-800 dark:text-white ml-2">ตั้งค่าระบบ (Settings)</h1>

      <div className="space-y-4">
        {/* User Profile Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-5">
          <div className="bg-gradient-to-br from-pastel-purple to-pastel-blue p-4 rounded-2xl shadow-inner">
            <UserIcon className="w-8 h-8 text-pastel-purpleDark" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white capitalize">{user?.username}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${user?.role === 'admin' ? 'bg-purple-500' : 'bg-green-500'}`}></span>
                สิทธิ์: {user?.role}
            </p>
          </div>
        </div>

        {/* API Connection & System Health */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
             <div className="p-4 border-b border-gray-100 dark:border-gray-700 font-semibold text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider flex items-center gap-2">
                <Link size={16} />
                เชื่อมต่อ Google Sheets (Connection)
            </div>
            
            <div className="p-6 space-y-6">
                
                {/* URL Input */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Google Script Web App URL</label>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://script.google.com/macros/s/.../exec"
                            className="flex-1 p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-pastel-blue outline-none dark:text-white font-mono text-sm"
                        />
                        <button 
                            onClick={handleSaveUrl}
                            className="bg-pastel-blueDark text-white px-4 py-3 rounded-xl font-bold hover:bg-sky-800 transition-colors shadow-sm"
                        >
                            <Check size={20} />
                        </button>
                    </div>
                </div>

                {/* System Health Dashboard */}
                <div>
                    <div className="flex justify-between items-end mb-3">
                        <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            <Server size={18} className="text-gray-500"/>
                            สถานะการเชื่อมต่อ (System Health)
                        </h3>
                        <button 
                            onClick={runDiagnostics}
                            className="text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors"
                        >
                            <RefreshCw size={12} className={testingStatus.server.status === 'loading' ? 'animate-spin' : ''} />
                            ทดสอบทั้งหมด
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Server Status */}
                        <div className={`p-4 rounded-xl border transition-all ${testingStatus.server.status === 'error' ? 'bg-red-50 border-red-200' : 'bg-gray-50 dark:bg-gray-700/50 border-gray-100 dark:border-gray-600'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-bold text-gray-500 uppercase">Server Status</span>
                                {getStatusIcon(testingStatus.server.status)}
                            </div>
                            <p className="font-semibold text-gray-800 dark:text-white text-sm">Ping Google Script</p>
                            <p className="text-xs text-gray-500 mt-1 truncate">{testingStatus.server.message || 'Ready'}</p>
                        </div>

                        {/* Product Sheet Status */}
                        <div className={`p-4 rounded-xl border transition-all ${testingStatus.master.status === 'error' ? 'bg-red-50 border-red-200' : 'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-bold text-blue-500 uppercase">Product Sheet</span>
                                {getStatusIcon(testingStatus.master.status)}
                            </div>
                            <p className="font-semibold text-gray-800 dark:text-white text-sm">Scrap Crossborder</p>
                            <p className="text-xs text-gray-500 mt-1 truncate">{testingStatus.master.message || 'Ready'}</p>
                        </div>

                        {/* Logs Sheet Status */}
                        <div className={`p-4 rounded-xl border transition-all ${testingStatus.logs.status === 'error' ? 'bg-red-50 border-red-200' : 'bg-purple-50 dark:bg-purple-900/10 border-purple-100 dark:border-purple-900/30'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-bold text-purple-500 uppercase">QC Logs Sheet</span>
                                {getStatusIcon(testingStatus.logs.status)}
                            </div>
                            <p className="font-semibold text-gray-800 dark:text-white text-sm">QC_Logs</p>
                            <p className="text-xs text-gray-500 mt-1 truncate">{testingStatus.logs.message || 'Ready'}</p>
                        </div>
                    </div>
                </div>
                
                {/* Setup Helper & Script View */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 p-4 rounded-xl flex flex-col justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <TableProperties className="text-yellow-600 dark:text-yellow-500 mt-1 flex-shrink-0" size={20} />
                            <div>
                                <h4 className="font-bold text-yellow-800 dark:text-yellow-500 text-sm">Setup Google Sheet</h4>
                                <p className="text-xs text-yellow-700 dark:text-yellow-600 mt-1">
                                    สร้าง Headers ใน Sheet "QC_Logs" อัตโนมัติ (ส่งข้อมูลทดสอบ 1 แถว)
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={handleSetupSheet}
                            disabled={isSettingUp}
                            className="w-full bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-2"
                        >
                            {isSettingUp ? <RefreshCw size={14} className="animate-spin"/> : <Play size={14} />}
                            Initialize Columns
                        </button>
                    </div>

                    <div className="bg-gray-100 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 p-4 rounded-xl flex flex-col justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <Code className="text-gray-600 dark:text-gray-400 mt-1 flex-shrink-0" size={20} />
                            <div>
                                <h4 className="font-bold text-gray-800 dark:text-white text-sm">Google Apps Script</h4>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                    รับโค้ด Script ล่าสุดเพื่อแก้ไขปัญหา "Invalid Format" และรองรับ Bulk Upload
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setShowScriptModal(true)}
                            className="w-full bg-gray-700 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-2"
                        >
                            <FileText size={14} />
                            View Google Script Code
                        </button>
                    </div>
                </div>

            </div>
        </div>

        {/* Maintenance */}
         <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
             <div className="p-4 border-b border-gray-100 dark:border-gray-700 font-semibold text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider">
                การจัดการข้อมูล
             </div>
             <button 
               onClick={handleClearCache}
               className="w-full text-left p-4 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/10 flex items-center gap-3 transition-colors font-medium"
             >
                <Database size={20} />
                ล้างแคชข้อมูล (Clear Local Data)
             </button>
         </div>

        {/* Admin Section: Data Management */}
        {user?.role === 'admin' && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 font-semibold text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider">
                    ผู้ดูแลระบบ (Admin)
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    <button 
                        onClick={() => navigate('/products')}
                        className="w-full text-left flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-500">
                                <Box size={20} />
                            </div>
                            <span className="text-gray-700 dark:text-gray-200 font-medium">จัดการสินค้า / คลังสินค้า</span>
                        </div>
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-3 py-1 rounded-full">Products</span>
                    </button>
                </div>
            </div>
        )}

        {/* Admin Section: User Management */}
        {user?.role === 'admin' && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <span className="font-semibold text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider">จัดการผู้ใช้งาน</span>
                    <button 
                        onClick={() => { setEditingUser({role: 'user'}); setShowUserModal(true); }}
                        className="flex items-center gap-1 text-xs bg-pastel-blue text-pastel-blueDark px-3 py-1.5 rounded-xl font-bold hover:bg-pastel-blueDark hover:text-white transition-all active:scale-95"
                    >
                        <Plus size={14} /> เพิ่มผู้ใช้
                    </button>
                </div>
                <div className="p-4">
                    <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="text-gray-400 border-b border-gray-100 dark:border-gray-700">
                                    <th className="pb-3 pl-2 font-medium">ชื่อผู้ใช้</th>
                                    <th className="pb-3 font-medium">สิทธิ์</th>
                                    <th className="pb-3 text-right pr-2 font-medium">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {users.map(u => (
                                    <tr key={u.id} className="group">
                                        <td className="py-3 pl-2 text-gray-800 dark:text-gray-200 font-medium">{u.username}</td>
                                        <td className="py-3">
                                            <span className={`px-2 py-1 rounded-lg text-xs font-bold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="py-3 text-right pr-2">
                                            {u.username !== user.username && (
                                                <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => { setEditingUser(u); setShowUserModal(true); }} className="p-1.5 bg-blue-50 text-blue-500 rounded-lg hover:bg-blue-100">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDeleteUser(u.id)} className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {/* Preferences */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 font-semibold text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider">
            การแสดงผล
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            <div className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer" onClick={toggleTheme}>
              <div className="flex items-center gap-3">
                 <div className={`p-2 rounded-xl ${isDark ? 'bg-purple-900/20' : 'bg-orange-50'}`}>
                    {isDark ? <Moon className="text-purple-400" size={20} /> : <Sun className="text-orange-400" size={20} />}
                 </div>
                 <span className="text-gray-700 dark:text-gray-200 font-medium">โหมดกลางคืน (Dark Mode)</span>
              </div>
              <button 
                className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ease-in-out ${isDark ? 'bg-pastel-purpleDark' : 'bg-gray-300'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-300 ${isDark ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>

         {/* Actions */}
         <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
             <button 
               onClick={logout}
               className="w-full text-left p-4 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-3 transition-colors font-medium"
             >
                <LogOut size={20} />
                ออกจากระบบ (Sign Out)
             </button>
         </div>
      </div>

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowUserModal(false)} />
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm shadow-2xl animate-slide-up overflow-hidden relative">
                <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-700/50">
                    <h3 className="font-bold text-lg text-gray-800 dark:text-white">{editingUser.id ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}</h3>
                    <button onClick={() => setShowUserModal(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full transition-colors"><X size={20} className="text-gray-400" /></button>
                </div>
                <form onSubmit={handleSaveUser} className="p-6 space-y-4">
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">ชื่อผู้ใช้</label>
                        <input 
                            type="text" 
                            required
                            value={editingUser.username || ''}
                            onChange={e => setEditingUser({...editingUser, username: e.target.value})}
                            className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:ring-2 focus:ring-pastel-blue outline-none transition-all"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">สิทธิ์การใช้งาน</label>
                        <select 
                            value={editingUser.role}
                            onChange={e => setEditingUser({...editingUser, role: e.target.value as any})}
                            className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:ring-2 focus:ring-pastel-blue outline-none transition-all"
                        >
                            <option value="user">User (ทั่วไป)</option>
                            <option value="admin">Admin (ผู้ดูแล)</option>
                        </select>
                    </div>
                    <button type="submit" className="w-full bg-pastel-blueDark hover:bg-blue-800 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all mt-2">
                        บันทึกข้อมูล
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* Script Code Modal */}
      {showScriptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowScriptModal(false)} />
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl shadow-2xl animate-slide-up flex flex-col h-[80vh]">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800 rounded-t-2xl">
                    <div>
                        <h3 className="font-bold text-lg text-gray-800 dark:text-white flex items-center gap-2">
                            <Code className="text-blue-500" /> 
                            Google Apps Script Code
                        </h3>
                        <p className="text-xs text-gray-500">Copy this code to your Google Apps Script project</p>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleCopyCode}
                            className="px-3 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1"
                        >
                            <Copy size={12} /> Copy Code
                        </button>
                        <button onClick={() => setShowScriptModal(false)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-500"><X size={20} /></button>
                    </div>
                </div>
                
                <div className="flex-1 overflow-auto p-0 bg-[#1e1e1e]">
                    <pre className="p-4 text-xs font-mono text-gray-300 leading-relaxed whitespace-pre-wrap select-all">
                        {GOOGLE_SCRIPT_CODE}
                    </pre>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
