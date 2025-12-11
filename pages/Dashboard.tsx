
import React, { useMemo, useState, useEffect } from 'react';
import { fetchQCLogs } from '../services/db';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { CheckCircle2, AlertTriangle, Package, DollarSign, Activity, Loader2 } from 'lucide-react';
import { QCStatus, QCRecord } from '../types';

export const Dashboard: React.FC = () => {
  const [logs, setLogs] = useState<QCRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
        const data = await fetchQCLogs();
        setLogs(data);
        setIsLoading(false);
    };
    init();
  }, []);

  const stats = useMemo(() => {
    return {
      total: logs.length,
      passed: logs.filter(l => l.status === QCStatus.PASS).length,
      damaged: logs.filter(l => l.status === QCStatus.DAMAGE).length,
      value: logs.reduce((acc, curr) => acc + (curr.sellingPrice || 0), 0)
    };
  }, [logs]);

  const pieData = [
    { name: 'ผ่าน (Pass)', value: stats.passed, color: '#4ADE80' }, // Green
    { name: 'ชำรุด (Damage)', value: stats.damaged, color: '#F87171' }, // Red
  ];

  const recentLogs = logs.slice(0, 5);

  if (isLoading) {
      return (
          <div className="flex justify-center items-center h-[60vh]">
              <Loader2 className="animate-spin text-pastel-blueDark" size={40} />
          </div>
      )
  }

  return (
    <div className="space-y-6 pb-20">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white">ภาพรวมระบบ (Dashboard)</h1>
        <p className="text-gray-500 dark:text-gray-400">สรุปผลการตรวจสอบคุณภาพสินค้า</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
            <div className="flex justify-between items-start mb-2">
                <span className="text-gray-400 text-xs uppercase font-bold">ตรวจสอบแล้ว</span>
                <Package className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-3xl font-bold text-gray-800 dark:text-white">{stats.total}</span>
            <span className="text-xs text-gray-400 mt-1">รายการ</span>
        </div>
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
            <div className="flex justify-between items-start mb-2">
                <span className="text-gray-400 text-xs uppercase font-bold">ผ่านเกณฑ์</span>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <span className="text-3xl font-bold text-green-600">{stats.passed}</span>
            <span className="text-xs text-gray-400 mt-1">รายการ</span>
        </div>
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
            <div className="flex justify-between items-start mb-2">
                <span className="text-gray-400 text-xs uppercase font-bold">ชำรุด/เสียหาย</span>
                <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <span className="text-3xl font-bold text-red-600">{stats.damaged}</span>
            <span className="text-xs text-gray-400 mt-1">รายการ</span>
        </div>
         <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
            <div className="flex justify-between items-start mb-2">
                <span className="text-gray-400 text-xs uppercase font-bold">มูลค่ารวม</span>
                <Activity className="w-5 h-5 text-purple-500" />
            </div>
            <span className="text-3xl font-bold text-gray-800 dark:text-white">฿{stats.value.toLocaleString()}</span>
            <span className="text-xs text-gray-400 mt-1">บาท</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 h-80">
          <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">สัดส่วนการตรวจสอบ</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">กิจกรรมล่าสุด</h3>
            <div className="space-y-4">
                {recentLogs.length === 0 && <p className="text-gray-400 text-sm">ยังไม่มีรายการตรวจสอบ</p>}
                {recentLogs.map(log => (
                    <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${log.status === 'Pass' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                {log.status === 'Pass' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                            </div>
                            <div>
                                <p className="font-medium text-sm text-gray-800 dark:text-gray-200">{log.productName}</p>
                                <p className="text-xs text-gray-400">{new Date(log.timestamp).toLocaleTimeString('th-TH')}</p>
                            </div>
                        </div>
                        <span className="font-bold text-sm text-gray-700 dark:text-gray-300">฿{log.sellingPrice}</span>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};
