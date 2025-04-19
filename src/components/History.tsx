import React, { useState, useEffect } from 'react';
import { Calendar, RefreshCw } from 'lucide-react';
import { getDraws } from '../lib/api';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';

interface Draw {
  id: string;
  draw_number: number;
  draw_date: string;
  white_balls: number[];
  powerball: number;
  jackpot_amount: number | undefined;
  winners: number;
}

const History = () => {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDraws();
  }, []);

  const fetchDraws = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await getDraws();
      if (result && result.draws) {
        setDraws(result.draws);
      } else {
        setDraws([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch draw history');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size={50} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 p-6 rounded-lg shadow-sm">
        <h2 className="text-red-800 text-lg font-medium mb-2">Error loading history</h2>
        <p className="text-red-600">{error}</p>
        <button 
          onClick={fetchDraws}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Calendar className="h-6 w-6 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Draw History</h2>
        </div>
        <button
          onClick={fetchDraws}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </button>
      </div>

      {draws.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No draw history available</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Draw #
                </th>
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
            <tbody className="divide-y divide-gray-200">
              {draws.map((draw) => (
                <tr key={draw.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    #{draw.draw_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {draw.draw_date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex space-x-2">
                      {draw.white_balls.map((number, index) => (
                        <NumberBall
                          key={index}
                          number={number}
                          isPowerball={false}
                          size={30}
                        />
                      ))}
                      <NumberBall
                        number={draw.powerball}
                        isPowerball={true}
                        size={30}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {draw.jackpot_amount 
                      ? `$${draw.jackpot_amount.toLocaleString()}` 
                      : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {draw.winners}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default History;