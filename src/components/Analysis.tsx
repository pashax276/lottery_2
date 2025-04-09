import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3, PieChart, TrendingUp } from 'lucide-react';

const Analysis = () => {
  // Mock data - replace with actual API calls
  const frequencyData = [
    { number: '1-10', frequency: 157 },
    { number: '11-20', frequency: 203 },
    { number: '21-30', frequency: 189 },
    { number: '31-40', frequency: 167 },
    { number: '41-50', frequency: 145 },
    { number: '51-60', frequency: 134 },
  ];

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Number Frequency Analysis</h2>
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            <span className="text-sm text-gray-600">Historical Data</span>
          </div>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={frequencyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="number" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="frequency" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Hot Numbers</h3>
            <TrendingUp className="h-5 w-5 text-green-500" />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[12, 24, 35, 47, 58].map((number) => (
              <div
                key={number}
                className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold"
              >
                {number}
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Due Numbers</h3>
            <PieChart className="h-5 w-5 text-orange-500" />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[7, 19, 28, 41, 53].map((number) => (
              <div
                key={number}
                className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold"
              >
                {number}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Analysis;