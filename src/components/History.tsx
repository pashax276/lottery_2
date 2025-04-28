// src/components/History.tsx
import React, { useState, useEffect } from 'react';
import { Calendar, Search, Filter, Trophy, X } from 'lucide-react';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';
import { showToast } from './Toast';

// API helper (unchanged)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const getDraws = async (limit: number, offset: number) => {
  try {
    const url = `${API_URL}/api/draws?limit=${limit}&offset=${offset}`;
    console.log('Fetching draws from:', url);
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error('getDraws error:', err);
    throw err;
  }
};

// Utility functions (unchanged)
const safelyParseNumber = (value: any, defaultValue: number): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
};

const isValidArray = (arr: any): boolean =>
  Array.isArray(arr) && arr.every(item => typeof item === 'number');

const processWhiteBalls = (whiteBalls: any): number[] => {
  try {
    if (isValidArray(whiteBalls)) {
      return whiteBalls.slice(0, 5);
    }
    if (typeof whiteBalls === 'string') {
      const cleaned = whiteBalls.replace(/[{}]/g, '');
      const nums = cleaned
        .split(',')
        .map(n => parseInt(n.trim(), 10))
        .filter(n => !isNaN(n));
      if (nums.length === 5) return nums;
    }
    console.warn('Invalid white_balls format:', whiteBalls);
    return [1, 2, 3, 4, 5];
  } catch {
    return [1, 2, 3, 4, 5];
  }
};

const processPowerball = (powerball: any): number => {
  const p = safelyParseNumber(powerball, 1);
  return p >= 1 && p <= 26 ? p : 1;
};

interface Draw {
  id: string;
  draw_number: number;
  draw_date: string;
  white_balls: number[];
  powerball: number;
  jackpot_amount: number;
  winners: number;
}

const History: React.FC = () => {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalDraws, setTotalDraws] = useState(0);
  const [selectedDraw, setSelectedDraw] = useState<string | null>(null);
  const [isMarkingWinner, setIsMarkingWinner] = useState(false);

  // How many rows per page in the table
  const itemsPerPage = 20;

  // On mount, fetch *all* draws (up to 1000)
  useEffect(() => {
    fetchDraws();
  }, []);

  const fetchDraws = async () => {
    setLoading(true);
    setError(null);
    try {
      // **Fetch all** instead of paginating server-side
      const response = await getDraws(1000, 0);
      if (!response || !response.draws) {
        throw new Error('No draws returned');
      }

      const processed: Draw[] = response.draws.map((d: any) => ({
        id: d.id.toString(),
        draw_number: safelyParseNumber(d.draw_number, 1),
        draw_date: d.draw_date || 'Unknown',
        white_balls: processWhiteBalls(d.white_balls),
        powerball: processPowerball(d.powerball),
        jackpot_amount: safelyParseNumber(d.jackpot_amount, 0),
        winners: safelyParseNumber(d.winners, 0),
      }));

      setDraws(processed);
      setTotalDraws(processed.length);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error fetching draws';
      console.error('fetchDraws:', err);
      setError(msg);
      showToast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Mark winner / no-winner (unchanged)
  const handleMarkWinner = async (id: string, num: number, isWinner: boolean) => {
    setIsMarkingWinner(true);
    setSelectedDraw(id);
    try {
      // TODO: call real API
      await new Promise(r => setTimeout(r, 500));
      setDraws(ds =>
        ds.map(d => (d.id === id ? { ...d, winners: isWinner ? 1 : 0 } : d))
      );
      showToast.success(
        isWinner ? `Draw #${num} marked winner` : `Draw #${num} marked no winner`
      );
    } catch {
      showToast.error('Failed to update winner status');
    } finally {
      setIsMarkingWinner(false);
      setSelectedDraw(null);
    }
  };

  // Apply filters
  const filtered = draws.filter(d => {
    const matchesSearch =
      !searchTerm ||
      d.draw_number.toString().includes(searchTerm) ||
      d.white_balls.some(b => b.toString().includes(searchTerm)) ||
      d.powerball.toString().includes(searchTerm);

    const matchesDate = !dateFilter || d.draw_date.includes(dateFilter);
    return matchesSearch && matchesDate;
  });

  // Client-side pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageItems = filtered.slice(startIndex, endIndex);

  // Handlers for filter inputs
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
    setPage(1);
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
        <h2 className="text-red-800 text-lg font-medium mb-2">Error</h2>
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchDraws}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg shadow-sm p-6">
        {/* Header + Filters */}
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
            {(searchTerm || dateFilter) && (
              <button
                onClick={clearFilters}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* No results */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Filter className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-500">No draws found</h3>
            <p className="text-gray-400 mt-1">Try different filters.</p>
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Numbers</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jackpot</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Winner?</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pageItems.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {d.draw_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {d.draw_date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {d.white_balls.map((n, i) => (
                            <NumberBall key={i} number={n} size={30} />
                          ))}
                          <NumberBall number={d.powerball} isPowerball size={30} />
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {d.jackpot_amount
                          ? `$${d.jackpot_amount.toLocaleString()}`
                          : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {d.winners > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <Trophy className="h-3 w-3 mr-1" />Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            <X className="h-3 w-3 mr-1" />No
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isMarkingWinner && selectedDraw === d.id ? (
                          <LoadingSpinner size={20} />
                        ) : (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleMarkWinner(d.id, d.draw_number, true)}
                              disabled={d.winners > 0}
                              className={`inline-flex items-center px-2 py-1 text-xs rounded ${
                                d.winners > 0
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-700 hover:bg-green-100'
                              }`}
                            >
                              <Trophy className="h-3 w-3 mr-1" />Winner
                            </button>
                            <button
                              onClick={() => handleMarkWinner(d.id, d.draw_number, false)}
                              disabled={d.winners === 0}
                              className={`inline-flex items-center px-2 py-1 text-xs rounded ${
                                d.winners === 0
                                  ? 'bg-gray-200 text-gray-700'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              <X className="h-3 w-3 mr-1" />No Winner
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Showing {startIndex + 1}–{Math.min(endIndex, filtered.length)} of{' '}
                {filtered.length}
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
