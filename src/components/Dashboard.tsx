import React, { useState, useEffect } from 'react';
import { ArrowUpRight, TrendingUp, Users, DollarSign, Calendar, RefreshCw } from 'lucide-react';
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

const Dashboard = () => {
  const [latestDraws, setLatestDraws] = useState<Draw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const stats = [
    { label: 'Total Draws', value: '0', icon: TrendingUp, trend: '+0%' },
    { label: 'Winners', value: '0', icon: Users, trend: '+0%' },
    { label: 'Latest Jackpot', value: '$0', icon: DollarSign, trend: '+0%' },
  ];

  useEffect(() => {
    fetchDraws();
  }, []);

  const fetchDraws = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await getDraws();
      
      if (result && result.draws && result.draws.length > 0) {
        const latestEight = result.draws.slice(0, 8);
        setLatestDraws(latestEight);
        
        const totalDraws = result.draws.length;
        const winners = result.draws.filter(draw => draw.winners > 0).length;
        const latestJackpot = result.draws[0]?.jackpot_amount || 0;
        
        stats[0].value = totalDraws.toString();
        stats[1].value = winners.toString();
        stats[2].value = `$${latestJackpot.toLocaleString()}`;
      } else {
        setLatestDraws([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch draws');
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
        <h2 className="text-red-800 text-lg font-medium mb-2">Error loading dashboard</h2>
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
    <div className="space-y-6">
      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          onClick={fetchDraws}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Data
        </button>
      </div>

      {/* Latest Draw */}
      {latestDraws.length > 0 ? (
        <section className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Latest Draw Results</h2>
          <div className="flex items-center space-x-4">
            {latestDraws[0]?.white_balls?.map((number, index) => (
              <NumberBall
                key={index}
                number={number}
                isPowerball={false}
                size={40}
              />
            ))}
            {latestDraws[0]?.powerball && (
              <NumberBall
                number={latestDraws[0].powerball}
                isPowerball={true}
                size={40}
              />
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500">Draw Number</p>
              <p className="text-lg font-medium text-gray-900">#{latestDraws[0]?.draw_number || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Draw Date</p>
              <p className="text-lg font-medium text-gray-900">{latestDraws[0]?.draw_date || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Jackpot</p>
              <p className="text-lg font-medium text-gray-900">
                {latestDraws[0]?.jackpot_amount 
                  ? `$${latestDraws[0].jackpot_amount.toLocaleString()}` 
                  : 'N/A'}
              </p>
            </div>
          </div>
          
          {latestDraws[0]?.winners > 0 && (
            <div className="mt-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Winner
            </div>
          )}
        </section>
      ) : (
        <section className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Latest Draw Results</h2>
          <p className="text-gray-500">No draws available</p>
        </section>
      )}

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

      {/* Recent Draws */}
      <section className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Recent Draws</h2>
          <div className="flex items-center space-x-2 text-sm text-blue-600">
            <Calendar className="h-4 w-4" />
            <span>Last 8 Draws</span>
          </div>
        </div>
        
        {latestDraws.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No recent draws available</p>
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
                {latestDraws.map((draw) => (
                  <tr key={draw.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{draw.draw_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {draw.draw_date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        {draw.white_balls?.map((number, index) => (
                          <NumberBall
                            key={index}
                            number={number}
                            isPowerball={false}
                            size={30}
                          />
                        ))}
                        {draw.powerball && (
                          <NumberBall
                            number={draw.powerball}
                            isPowerball={true}
                            size={30}
                          />
                        )}
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
      </section>
    </div>
  );
};

export default Dashboard;