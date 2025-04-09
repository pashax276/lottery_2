import React from 'react';
import { ArrowUpRight, TrendingUp, Users, DollarSign } from 'lucide-react';

const Dashboard = () => {
  // Mock data - replace with actual API calls
  const latestDraw = {
    numbers: [7, 13, 24, 47, 53],
    powerball: 4,
    date: '2024-03-15',
    jackpot: '1.5B',
  };

  const stats = [
    { label: 'Total Draws', value: '1,274', icon: TrendingUp, trend: '+12%' },
    { label: 'Active Users', value: '2.4k', icon: Users, trend: '+8%' },
    { label: 'Next Jackpot', value: '$1.7B', icon: DollarSign, trend: '+15%' },
  ];

  return (
    <div className="space-y-6">
      {/* Latest Draw */}
      <section className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Latest Draw Results</h2>
        <div className="flex items-center space-x-4">
          {latestDraw.numbers.map((number, index) => (
            <div
              key={index}
              className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold"
            >
              {number}
            </div>
          ))}
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold">
            {latestDraw.powerball}
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-600">Draw Date: {latestDraw.date}</p>
        <p className="text-sm text-gray-600">Jackpot: ${latestDraw.jackpot}</p>
      </section>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Icon className="h-6 w-6 text-blue-600" />
                  <h3 className="text-sm font-medium text-gray-900">{stat.label}</h3>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                  {stat.trend}
                </span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-gray-900">{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <section className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            Check My Numbers
          </button>
          <button className="w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            View Predictions
          </button>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;