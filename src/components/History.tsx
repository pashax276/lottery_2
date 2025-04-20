import React, { useState, useEffect } from 'react';
import { Calendar, Search, Filter, Trophy, Check, X } from 'lucide-react';
import { getDraws } from '../lib/api';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';
import { showToast } from './Toast';

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
  const [totalPages, setTotalPages] = useState(1);
  const [selectedDraw, setSelectedDraw] = useState<string | null>(null);
  const [isMarkingWinner, setIsMarkingWinner] = useState(false);

  // Items per page
  const itemsPerPage = 10;

  useEffect(() => {
    fetchDraws();
  }, []);

  const fetchDraws = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await getDraws();
      
      if (response && response.success && Array.isArray(response.draws)) {
        setDraws(response.draws);
        setTotalPages(Math.ceil(response.draws.length / itemsPerPage));
      } else {
        // Handle case where response structure is different than expected
        console.error('Unexpected API response structure:', response);
        setError('Failed to fetch draws: Unexpected response format');
        setDraws([]); // Ensure draws is always an array
      }
    } catch (err) {
      console.error('Error fetching draws:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch draws');
      setDraws([]); // Ensure draws is always an array
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
      // Simulating API call to update the winner status
      // In a real implementation, you would make an API call here
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update local state
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

  // Safely filter draws with null checking
  const getFilteredDraws = () => {
    if (!Array.isArray(draws)) {
      return [];
    }
    
    return draws.filter(draw => {
      const matchesSearch = searchTerm === '' || 
        draw.draw_number.toString().includes(searchTerm) ||
        (Array.isArray(draw.white_balls) && draw.white_balls.some(ball => ball?.toString().includes(searchTerm))) ||
        (draw.powerball && draw.powerball.toString().includes(searchTerm));
      
      const matchesDate = dateFilter === '' || draw.draw_date === dateFilter;
      
      return matchesSearch && matchesDate;
    });
  };

  // Get filtered and paginated draws
  const filteredDraws = getFilteredDraws();
  
  // Calculate pagination
  const paginatedDraws = filteredDraws.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );
  
  const totalFilteredPages = Math.ceil(filteredDraws.length / itemsPerPage);

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
          <h2 className="text-lg font-semibold text-gray-900">Draw History</h2>
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
                          {Array.isArray(draw.white_balls) && draw.white_balls.map((number, idx) => (
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
                Showing {Math.min(filteredDraws.length, 1 + (page - 1) * itemsPerPage)} to {Math.min(filteredDraws.length, page * itemsPerPage)} of {filteredDraws.length} results
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                  disabled={page === 1}
                  className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(prev => Math.min(prev + 1, totalFilteredPages))}
                  disabled={page >= totalFilteredPages}
                  className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
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