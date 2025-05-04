// src/components/History.tsx
import React, { useState, useEffect } from 'react';
import { Calendar, Search, Filter, Trophy, X, AlertCircle } from 'lucide-react';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';
import { showToast } from './Toast';
import { getDraws } from '../lib/api';
import { processWhiteBalls, processPowerball, safelyParseNumber, formatCurrency } from '../utils/dataUtils';

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
  const itemsPerPage = 20;

  useEffect(() => {
    fetchDraws();
  }, []);

  const fetchDraws = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await getDraws(1000, 0);
      
      if (!response || !response.draws) {
        throw new Error('No draws data returned');
      }

      // Process the draws to ensure proper data format
      const processedDraws: Draw[] = response.draws.map((draw: any) => ({
        id: draw.id?.toString() || '',
        draw_number: safelyParseNumber(draw.draw_number, 0),
        draw_date: draw.draw_date || 'Unknown',
        white_balls: processWhiteBalls(draw.white_balls),
        powerball: processPowerball(draw.powerball),
        jackpot_amount: safelyParseNumber(draw.jackpot_amount, 0),
        winners: safelyParseNumber(draw.winners, 0),
      }));

      setDraws(processedDraws);
      setTotalDraws(processedDraws.length);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error fetching draws';
      setError(errorMessage);
      showToast.error(errorMessage);
      console.error('Error fetching draws:', err);
    } finally {
      setLoading(false);
    }
  };

  // Apply filters
  const filtered = draws.filter(draw => {
    const matchesSearch = !searchTerm ||
      draw.draw_number.toString().includes(searchTerm) ||
      draw.white_balls.some(ball => ball.toString().includes(searchTerm)) ||
      draw.powerball.toString().includes(searchTerm);

    const matchesDate = !dateFilter || draw.draw_date.includes(dateFilter);
    return matchesSearch && matchesDate;
  });

  // Client-side pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageItems = filtered.slice(startIndex, endIndex);

  // Handlers
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
        <div className="flex items-center space-x-3 mb-4">
          <AlertCircle className="h-6 w-6 text-red-600" />
          <h2 className="text-red-800 text-lg font-medium">Error</h2>
        </div>
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchDraws}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
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

        {/* Table */}
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

            {/* Pagination */}
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