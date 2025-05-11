import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Calendar, Search, Filter, Trophy, X, AlertCircle } from 'lucide-react';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';
import { showToast } from './Toast';
import { getCurrentUser } from '../lib/api';

interface Draw {
  id: string;
  draw_number: number;
  draw_date: string;
  white_balls: number[];
  powerball: number;
  jackpot_amount: number;
  winners: number;
}

const processWhiteBalls = (whiteBalls: any): number[] => {
  if (Array.isArray(whiteBalls)) {
    return whiteBalls
      .map(ball => typeof ball === 'string' ? parseInt(ball, 10) : ball)
      .filter(ball => typeof ball === 'number' && !isNaN(ball) && ball >= 1 && ball <= 69)
      .slice(0, 5);
  }
  
  if (typeof whiteBalls === 'string' && whiteBalls.startsWith('{') && whiteBalls.endsWith('}')) {
    const cleaned = whiteBalls.slice(1, -1);
    return cleaned.split(',')
      .map(item => parseInt(item.trim(), 10))
      .filter(num => !isNaN(num) && num >= 1 && num <= 69)
      .slice(0, 5);
  }
  
  console.warn('Could not process white_balls:', whiteBalls);
  return [1, 2, 3, 4, 5];
};

const processPowerball = (powerball: any): number => {
  if (typeof powerball === 'number' && !isNaN(powerball)) {
    return Math.max(1, Math.min(26, powerball));
  }
  
  if (typeof powerball === 'string') {
    const parsed = parseInt(powerball, 10);
    if (!isNaN(parsed)) {
      return Math.max(1, Math.min(26, parsed));
    }
  }
  
  console.warn('Could not process powerball:', powerball);
  return 1;
};

const formatCurrency = (amount: number | string): string => {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numericAmount || 0);
};

const History: React.FC = () => {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [winFilter, setWinFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalDraws, setTotalDraws] = useState(0);
  const [currentUser, setCurrentUser] = useState<{ id: number; username: string; is_admin: boolean } | null>(null);
  const itemsPerPage = 20;

  useEffect(() => {
    const fetchCurrentUser = async () => {
      console.log('[History] Starting fetchCurrentUser');
      try {
        const token = localStorage.getItem('token');
        console.log('[History] Token in localStorage:', token ? 'Present' : 'Missing');
        if (!token) {
          console.log('[History] No token, redirecting to /login');
          setError('Please log in to access draw history');
          return;
        }
        const user = getCurrentUser();
        console.log('[History] getCurrentUser result:', user);
        if (!user) {
          throw new Error('No user data in localStorage');
        }
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        console.log('[History] /api/auth/me response status:', response.status);
        if (!response.ok) {
          throw new Error(`Failed to fetch user data: ${response.status}`);
        }
        const data = await response.json();
        console.log('[History] /api/auth/me data:', data);
        setCurrentUser({ id: data.id, username: data.username, is_admin: data.is_admin });
      } catch (err) {
        console.error('[History] Error fetching current user:', err);
        setError(err instanceof Error ? err.message : 'Failed to authenticate user');
        showToast.error(err instanceof Error ? err.message : 'Failed to authenticate user');
      } finally {
        setLoading(false);
        console.log('[History] fetchCurrentUser completed, loading:', false);
      }
    };

    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (!currentUser || !currentUser.is_admin) {
      console.log('[History] Skipping fetchDraws: user=', currentUser, 'is_admin=', currentUser?.is_admin);
      return;
    }

    const fetchDraws = async () => {
      console.log('[History] Starting fetchDraws');
      setLoading(true);
      setError(null);
      
      try {
        const token = localStorage.getItem('token');
        console.log('[History] Token for /api/draws:', token ? 'Present' : 'Missing');
        if (!token) {
          throw new Error('No authentication token found');
        }
        const response = await fetch(`/api/draws?limit=1000&offset=0`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        console.log('[History] /api/draws response status:', response.status);
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Unauthorized: Admin access required');
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('[History] /api/draws data:', data);
        
        if (!data || !data.draws) {
          throw new Error('No draws data returned');
        }

        const processedDraws: Draw[] = data.draws.map((draw: any) => ({
          id: draw.id?.toString() || '',
          draw_number: draw.draw_number || 0,
          draw_date: draw.draw_date || 'Unknown',
          white_balls: processWhiteBalls(draw.white_balls),
          powerball: processPowerball(draw.powerball),
          jackpot_amount: draw.jackpot_amount || 0,
          winners: draw.winners || 0,
        }));

        setDraws(processedDraws);
        setTotalDraws(processedDraws.length);
        console.log('[History] Draws processed:', processedDraws.length);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Error fetching draws';
        console.error('[History] Error fetching draws:', err);
        setError(errorMessage);
        showToast.error(errorMessage);
      } finally {
        setLoading(false);
        console.log('[History] fetchDraws completed, loading:', false);
      }
    };

    fetchDraws();
  }, [currentUser]);

  const filtered = draws.filter(draw => {
    const matchesSearch = !searchTerm ||
      draw.draw_number.toString().includes(searchTerm) ||
      draw.white_balls.some(ball => ball.toString().includes(searchTerm)) ||
      draw.powerball.toString().includes(searchTerm);

    const matchesDate = !dateFilter || draw.draw_date.includes(dateFilter);
    
    const matchesWinFilter = 
      winFilter === 'all' ||
      (winFilter === 'win' && draw.winners > 0) ||
      (winFilter === 'lose' && draw.winners === 0);
      
    return matchesSearch && matchesDate && matchesWinFilter;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageItems = filtered.slice(startIndex, endIndex);

  const onSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  const onDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateFilter(e.target.value);
    setPage(1);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDateFilter('');
    setWinFilter('all');
    setPage(1);
  };

  if (!localStorage.getItem('token')) {
    console.log('[History] No token, redirecting to /login');
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    console.log('[History] Rendering loading state');
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size={50} />
      </div>
    );
  }

  if (error) {
    console.log('[History] Rendering error state:', error);
    return (
      <div className="bg-red-50 p-6 rounded-lg shadow-sm">
        <div className="flex items-center space-x-3 mb-4">
          <AlertCircle className="h-6 w-6 text-red-600" />
          <h2 className="text-red-800 text-lg font-medium">Error</h2>
        </div>
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => {
            localStorage.clear();
            window.location.href = '/login';
          }}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Log In Again
        </button>
      </div>
    );
  }

  if (!currentUser || !currentUser.is_admin) {
    console.log('[History] Redirecting to /check-numbers: user=', currentUser, 'is_admin=', currentUser?.is_admin);
    return <Navigate to="/check-numbers" replace />;
  }

  console.log('[History] Rendering draw history, draws:', draws.length);
  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-semibold text-gray-900">Draw History</h2>
            <span className="text-sm text-gray-500">({totalDraws} total)</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search draws..."
                value={searchTerm}
                onChange={onSearch}
                className="pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
              <Search className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            <div className="relative">
              <input
                type="date"
                value={dateFilter}
                onChange={onDate}
                className="pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
              <Calendar className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            <select
              value={winFilter}
              onChange={(e) => {
                setWinFilter(e.target.value);
                setPage(1);
              }}
              className="py-2 px-4 border rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Draws</option>
              <option value="win">Winners Only</option>
              <option value="lose">No Winners</option>
            </select>
            {(searchTerm || dateFilter || winFilter !== 'all') && (
              <button
                onClick={clearFilters}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Filter className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-500">No draws found</h3>
            <p className="text-gray-400 mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <>
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
                      Winner
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pageItems.map((draw) => (
                    <tr key={draw.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {draw.draw_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {draw.draw_date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {draw.white_balls.map((number, idx) => (
                            <NumberBall key={idx} number={number} size={30} />
                          ))}
                          <NumberBall number={draw.powerball} isPowerball size={30} />
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(draw.jackpot_amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {draw.winners > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <Trophy className="h-3 w-3 mr-1" />Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            <X className="h-3 w-3 mr-1" />No
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Showing {startIndex + 1}–{Math.min(endIndex, filtered.length)} of {filtered.length}
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="px-2 py-1 border rounded-md text-sm disabled:opacity-50"
                >
                  First
                </button>
                <button
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="px-4 py-2 border rounded-md text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-700">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                  disabled={page === totalPages}
                  className="px-4 py-2 border rounded-md text-sm disabled:opacity-50"
                >
                  Next
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="px-2 py-1 border rounded-md text-sm disabled:opacity-50"
                >
                  Last
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default History;