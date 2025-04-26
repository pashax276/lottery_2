// src/components/History.tsx
import React, { useState, useEffect } from 'react';
import { Calendar, Search, Filter, Trophy, Check, X } from 'lucide-react';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';
import { showToast } from './Toast';

// Assume getDraws implementation
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const getDraws = async (limit: number, offset: number) => {
  try {
    console.log("Fetching draws from:", `${API_URL}/api/draws?limit=${limit}&offset=${offset}`);
    const response = await fetch(`${API_URL}/api/draws?limit=${limit}&offset=${offset}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error("getDraws error:", err);
    throw err;
  }
};

// Data utility functions (stubs based on usage)
const safelyParseNumber = (value: any, defaultValue: number): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
};

const isValidArray = (arr: any): boolean => {
  return Array.isArray(arr) && arr.every(item => typeof item === 'number');
};

const processWhiteBalls = (whiteBalls: any): number[] => {
  try {
    if (isValidArray(whiteBalls)) {
      return whiteBalls.slice(0, 5);
    }
    if (typeof whiteBalls === 'string') {
      // Handle PostgreSQL array format, e.g., "{15,44,63,66,69}"
      const cleaned = whiteBalls.replace(/[{}]/g, '');
      const numbers = cleaned.split(',').map(num => parseInt(num.trim(), 10)).filter(num => !isNaN(num));
      if (numbers.length === 5) return numbers;
    }
    console.warn("Invalid white_balls format:", whiteBalls);
    return [1, 2, 3, 4, 5]; // Fallback
  } catch (err) {
    console.error("Error processing white_balls:", err);
    return [1, 2, 3, 4, 5];
  }
};

const processPowerball = (powerball: any): number => {
  try {
    const parsed = safelyParseNumber(powerball, 1);
    return parsed >= 1 && parsed <= 26 ? parsed : 1;
  } catch (err) {
    console.error("Error processing powerball:", err);
    return 1;
  }
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

const History = () => {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalDraws, setTotalDraws] = useState(0);
  const [selectedDraw, setSelectedDraw] = useState<string | null>(null);
  const [isMarkingWinner, setIsMarkingWinner] = useState(false);

  // Items per page
  const itemsPerPage = 20;

  useEffect(() => {
    fetchDraws();
  }, [page]);

  const fetchDraws = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await getDraws(itemsPerPage, (page - 1) * itemsPerPage);
      
      console.log('Raw API response:', response);
      
      if (response && response.draws) {
        if (response.draws.length > 0) {
          const firstDraw = response.draws[0];
          console.log('First draw from API:', firstDraw);
          console.log('white_balls type:', typeof firstDraw.white_balls);
          console.log('white_balls value:', firstDraw.white_balls);
        }
        
        const processedDraws = response.draws.map((draw: any) => {
          const whiteBalls = processWhiteBalls(draw.white_balls);
          const powerball = processPowerball(draw.powerball);
          
          console.log('Processed white balls:', whiteBalls);
          console.log('Processed powerball:', powerball);
          
          return {
            id: draw.id.toString(),
            draw_number: safelyParseNumber(draw.draw_number, 1),
            draw_date: draw.draw_date || 'Unknown',
            white_balls: whiteBalls,
            powerball: powerball,
            jackpot_amount: safelyParseNumber(draw.jackpot_amount, 0),
            winners: safelyParseNumber(draw.winners, 0),
          };
        });
        
        setDraws(processedDraws);
        setTotalDraws(response.count || processedDraws.length);
        console.log('Processed draws total:', processedDraws.length);
        if (processedDraws.length > 0) {
          console.log('First processed draw:', processedDraws[0]);
        }
      } else {
        throw new Error('Failed to fetch draws or no draws found');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch draws';
      console.error('Error fetching draws:', err);
      setError(errorMessage);
      showToast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  const handleDateFilter = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateFilter(e.target.value);
    setPage(1);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDateFilter('');
    setPage(1);
  };

  const handleMarkWinner = async (drawId: string, drawNumber: number, isWinner: boolean) => {
    setIsMarkingWinner(true);
    setSelectedDraw(drawId);
    
    try {
      // Placeholder for API call to update winner status
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setDraws(prevDraws => 
        prevDraws.map(draw => 
          draw.id === drawId 
            ? { ...draw, winners: isWinner ? 1 : 0 } 
            : draw
        )
      );
      
      showToast.success(
        isWinner 
          ? `Draw #${drawNumber} marked as a winner` 
          : `Draw #${drawNumber} marked as not a winner`
      );
    } catch (err) {
      showToast.error('Failed to update winner status');
    } finally {
      setIsMarkingWinner(false);
      setSelectedDraw(null);
    }
  };

  // Filter draws based on search term and date filter
  const filteredDraws = draws.filter(draw => {
    const matchesSearch = searchTerm === '' || 
      draw.draw_number.toString().includes(searchTerm) ||
      draw.white_balls.some((ball: number) => ball.toString().includes(searchTerm)) ||
      draw.powerball.toString().includes(searchTerm);
    
    const matchesDate = dateFilter === '' || draw.draw_date.includes(dateFilter);
    
    return matchesSearch && matchesDate;
  });

  // Calculate pagination
  const totalPages = Math.max(1, Math.ceil(filteredDraws.length / itemsPerPage));
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedDraws = filteredDraws.slice(startIndex, endIndex);

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
        <h2 className="text-red-800 text-lg font-medium mb-2">Error loading draws</h2>
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
      <section className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-semibold text-gray-900">Draw History</h2>
            <span className="text-sm text-gray-500">({totalDraws} total draws)</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={handleSearch}
                placeholder="Search draws..."
                className="pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <Search className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            </div>
            
            <div className="relative">
              <input
                type="date"
                value={dateFilter}
                onChange={handleDateFilter}
                className="pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <Calendar className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
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

        {filteredDraws.length === 0 ? (
          <div className="text-center py-12">
            <Filter className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-500">No draws found</h3>
            <p className="text-gray-400 mt-1">Try changing your filters or add some draws.</p>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedDraws.map((draw) => (
                    <tr key={draw.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {draw.draw_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {draw.draw_date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {draw.white_balls.map((number: number, idx: number) => (
                            <NumberBall
                              key={idx}
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {draw.jackpot_amount ? `$${draw.jackpot_amount.toLocaleString()}` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {draw.winners > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <Check className="h-3 w-3 mr-1" />
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            <X className="h-3 w-3 mr-1" />
                            No
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {isMarkingWinner && selectedDraw === draw.id ? (
                          <LoadingSpinner size={20} />
                        ) : (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleMarkWinner(draw.id, draw.draw_number, true)}
                              className={`inline-flex items-center px-2 py-1 text-xs rounded ${
                                draw.winners > 0 
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-gray-100 text-gray-700 hover:bg-green-100 hover:text-green-700'
                              }`}
                              disabled={draw.winners > 0}
                            >
                              <Trophy className="h-3 w-3 mr-1" />
                              Winner
                            </button>
                            <button
                              onClick={() => handleMarkWinner(draw.id, draw.draw_number, false)}
                              className={`inline-flex items-center px-2 py-1 text-xs rounded ${
                                draw.winners === 0 
                                  ? 'bg-gray-200 text-gray-700' 
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                              disabled={draw.winners === 0}
                            >
                              <X className="h-3 w-3 mr-1" />
                              No Winner
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredDraws.length)} of {filteredDraws.length} results
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                    className="px-2 py-1 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                    disabled={page === 1}
                    className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                </div>
                
                <div className="text-sm text-gray-700">
                  Page {page} of {totalPages || 1}
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPage(prev => Math.min(prev + 1, totalPages || 1))}
                    disabled={page >= totalPages}
                    className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setPage(totalPages || 1)}
                    disabled={page === totalPages || totalPages === 0}
                    className="px-2 py-1 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default History;