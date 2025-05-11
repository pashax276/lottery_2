import React, { useState, useEffect } from 'react';
import { ArrowUpRight, TrendingUp, Users, DollarSign, Trophy, RefreshCw, X } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { Navigate } from 'react-router-dom';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';
import { showToast } from './Toast';
import { useUser } from '../App';

interface Draw {
  id: number;
  draw_number: number;
  draw_date: string;
  white_balls: number[];
  powerball: number;
  jackpot_amount: number;
  winners: number;
  created_at: string;
}

interface UserStat {
  user_id: number;
  username: string;
  total_checks: number;
  total_matches: number;
  total_wins: number;
  total_prize: number;
}

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [userStats, setUserStats] = useState<UserStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const { user } = useUser();

  useEffect(() => {
    if (!user || !user.is_admin) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchData = async () => {
      console.log('[Dashboard] Starting fetch...');
      try {
        const token = localStorage.getItem('token');
        const [drawsResponse, statsResponse] = await Promise.all([
          fetch('/api/draws?limit=10', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }),
          fetch('/api/user_stats', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }),
        ]);

        if (!drawsResponse.ok) {
          if (drawsResponse.status === 401) {
            throw new Error('Unauthorized: Admin access required');
          }
          throw new Error(`Draws HTTP error! status: ${drawsResponse.status}`);
        }
        if (!statsResponse.ok) {
          if (statsResponse.status === 401) {
            throw new Error('Unauthorized: Admin access required');
          }
          throw new Error(`Stats HTTP error! status: ${statsResponse.status}`);
        }

        const drawsData = await drawsResponse.json();
        const statsData = await statsResponse.json();

        console.log('[Dashboard] Draws Data:', drawsData);
        console.log('[Dashboard] Stats Data:', statsData);

        if (isMounted) {
          if (drawsData && drawsData.draws) {
            setDraws(drawsData.draws);
          }
          if (statsData) {
            setUserStats(statsData);
          }
        }
      } catch (err) {
        console.error('[Dashboard] Error:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch data');
          showToast.error(err instanceof Error ? err.message : 'Failed to fetch data');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    const newSocket = io('http://localhost:5001');
    setSocket(newSocket);

    newSocket.on('new_check', () => {
      console.log('[Dashboard] New check received, refreshing stats');
      fetchUserStats();
    });

    newSocket.on('connect', () => {
      console.log('[Dashboard] Connected to WebSocket');
    });

    newSocket.on('disconnect', () => {
      console.log('[Dashboard] Disconnected from WebSocket');
    });

    return () => {
      isMounted = false;
      newSocket.close();
    };
  }, [user]);

  const fetchUserStats = async () => {
    setLoadingStats(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user_stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized: Admin access required');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setUserStats(data);
    } catch (error) {
      console.error('Error fetching user stats:', error);
      showToast.error(error instanceof Error ? error.message : 'Failed to fetch user stats');
    } finally {
      setLoadingStats(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size={50} />
      </div>
    );
  }

  if (!user || !user.is_admin) {
    return <Navigate to="/check-numbers" replace />;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 text-red-700 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Error: {error}</h2>
        <p>Check console for details</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const latestDraw = draws[0];
  const totalJackpot = draws.reduce((sum, draw) => sum + draw.jackpot_amount, 0);
  const averageJackpot = draws.length > 0 ? totalJackpot / draws.length : 0;
  const totalWinners = draws.reduce((sum, draw) => sum + draw.winners, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Latest Draw</p>
              <p className="text-2xl font-semibold text-gray-900">
                #{latestDraw?.draw_number || 'N/A'}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {latestDraw?.draw_date || 'No date'}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Current Jackpot</p>
              <p className="text-2xl font-semibold text-gray-900">
                ${latestDraw?.jackpot_amount?.toLocaleString() || '0'}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <p className="text-sm text-green-600 mt-2">
            Next draw soon
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Winners</p>
              <p className="text-2xl font-semibold text-gray-900">{totalWinners}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <Users className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Across {draws.length} draws
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Average Jackpot</p>
              <p className="text-2xl font-semibold text-gray-900">
                ${averageJackpot.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <ArrowUpRight className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Per draw
          </p>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Trophy className="h-6 w-6 text-yellow-600" />
            <h2 className="text-lg font-semibold text-gray-900">Leaderboard</h2>
          </div>
          <button
            onClick={fetchUserStats}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="h-5 w-5" />
            <span>Refresh</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          {loadingStats ? (
            <div className="flex items-center space-x-2">
              <LoadingSpinner size={20} />
              <span className="text-sm text-gray-500">Loading leaderboard...</span>
            </div>
          ) : userStats.length === 0 ? (
            <p className="text-sm text-gray-500">No stats available</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Place
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Username
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Checks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Matches
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Wins
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Prize
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {userStats.map((stat, index) => (
                  <tr key={stat.user_id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {index + 1}
                      {index === 0 && <span className="ml-2 text-yellow-600">🥇</span>}
                      {index === 1 && <span className="ml-2 text-gray-400">🥈</span>}
                      {index === 2 && <span className="ml-2 text-yellow-700">🥉</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {stat.username}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {stat.total_checks}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {stat.total_matches}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {stat.total_wins}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${stat.total_prize.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {latestDraw && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Latest Draw Result</h2>
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="mb-4 md:mb-0">
              <p className="text-sm text-gray-600 mb-2">
                Draw #{latestDraw.draw_number} • {latestDraw.draw_date}
              </p>
              <div className="flex space-x-2">
                {latestDraw.white_balls.map((number, index) => (
                  <NumberBall key={index} number={number} />
                ))}
                <NumberBall number={latestDraw.powerball} isPowerball />
              </div>
            </div>
            <div className="text-center md:text-right">
              <p className="text-sm text-gray-600">Jackpot</p>
              <p className="text-2xl font-bold text-gray-900">
                ${latestDraw.jackpot_amount.toLocaleString()}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {latestDraw.winners > 0 ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <Trophy className="h-3 w-3 mr-1" />
                    {latestDraw.winners} winner{latestDraw.winners !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    <X className="h-3 w-3 mr-1" />
                    0 winners
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Draws</h2>
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
            <tbody className="bg-white divide-y divide-gray-200">
              {draws.slice(1).map((draw) => (
                <tr key={draw.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    #{draw.draw_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {draw.draw_date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex space-x-2">
                      {draw.white_balls.map((number, index) => (
                        <NumberBall key={index} number={number} size={30} />
                      ))}
                      <NumberBall number={draw.powerball} isPowerball size={30} />
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${draw.jackpot_amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {draw.winners > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <Trophy className="h-3 w-3 mr-1" />
                        {draw.winners}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <X className="h-3 w-3 mr-1" />
                        0
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;