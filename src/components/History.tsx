import React from 'react';
import { Calendar, Search } from 'lucide-react';

const History = () => {
  // Mock data - replace with actual API calls
  const draws = [
    {
      date: '2024-03-15',
      numbers: [7, 13, 24, 47, 53],
      powerball: 4,
      jackpot: '1.5B',
      winners: 0,
    },
    {
      date: '2024-03-12',
      numbers: [9, 16, 29, 43, 56],
      powerball: 7,
      jackpot: '1.4B',
      winners: 1,
    },
    {
      date: '2024-03-08',
      numbers: [3, 12, 25, 38, 52],
      powerball: 11,
      jackpot: '800M',
      winners: 0,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Draw History</h2>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search draws..."
                className="pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <Search className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            </div>
            <button className="flex items-center space-x-2 px-4 py-2 border rounded-md hover:bg-gray-50">
              <Calendar className="h-5 w-5 text-gray-600" />
              <span>Filter by Date</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Numbers
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Jackpot
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Winners
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {draws.map((draw, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {draw.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {draw.numbers.map((number, idx) => (
                        <div
                          key={idx}
                          className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-medium"
                        >
                          {number}
                        </div>
                      ))}
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-sm font-medium">
                        {draw.powerball}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${draw.jackpot}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {draw.winners}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing 1 to 3 of 1,274 results
          </div>
          <div className="flex items-center space-x-2">
            <button className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
              Previous
            </button>
            <button className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default History;