import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Brain, Sparkles, TrendingUp, RefreshCw, Filter, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';
import { showToast } from './Toast';
import useLocalStorage from '../hooks/useLocalStorage';

interface Prediction {
  white_balls: number[];
  powerball: number;
  confidence: number;
  method: string;
  timestamp: string;
  reason?: string;
}

const predictionMethods = [
  { id: 'all', label: 'All Methods' },
  { id: 'frequency', label: 'Frequency Analysis' },
  { id: 'pattern', label: 'Pattern Recognition' },
  { id: 'historical', label: 'Historical Trends' },
  { id: 'machine-learning', label: 'Machine Learning' },
];

// Updated API URL handling with better error messaging
const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) {
  console.error('VITE_API_URL is not defined in environment variables');
}

function Predictions() {
  const [selectedMethod, setSelectedMethod] = useLocalStorage('selectedPredictionMethod', 'all');
  const [sortOrder, setSortOrder] = useLocalStorage('predictionSortOrder', 'confidence');

  const { data: predictions = [], isLoading, error, refetch } = useQuery<Prediction[]>({
    queryKey: ['predictions', selectedMethod],
    queryFn: async () => {
      try {
        if (!API_URL) {
          throw new Error('Backend API URL is not configured. Please check your .env file.');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(`${API_URL}/api/predictions?method=${selectedMethod}`, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
          }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Server error (${response.status}): ${errorData}`);
        }

        const data = await response.json();
        return data;
      } catch (err) {
        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            throw new Error('Request timed out. Please check if the backend server is running on port 5001.');
          }
          if (err.message.includes('Failed to fetch')) {
            throw new Error('Could not connect to the backend server. Please ensure it is running on port 5001 and accessible.');
          }
          throw err;
        }
        throw new Error('Failed to fetch predictions');
      }
    },
    retry: 1,
    retryDelay: 1000,
  });

  const handleRefresh = async () => {
    showToast.loading('Refreshing predictions...');
    try {
      await refetch();
      showToast.success('Predictions updated!');
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Failed to refresh predictions');
    }
  };

  if (error) {
    return (
      <div className="bg-red-50 p-6 rounded-lg shadow-sm">
        <div className="flex items-center space-x-3 mb-4">
          <AlertCircle className="h-6 w-6 text-red-600" />
          <h3 className="text-lg font-medium text-red-900">Connection Error</h3>
        </div>
        <p className="text-red-600 mb-4">{error instanceof Error ? error.message : 'Unknown error'}</p>
        <div className="bg-white p-4 rounded-md text-sm text-gray-600 mb-4">
          <p className="font-medium mb-2">Troubleshooting steps:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Verify that the backend server is running (python backend/main.py)</li>
            <li>Check if the server is running on port 5001</li>
            <li>Ensure there are no firewall restrictions blocking the connection</li>
            <li>Verify that the VITE_API_URL is set correctly in the .env file</li>
          </ol>
        </div>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  const sortedPredictions = [...predictions].sort((a, b) => {
    if (sortOrder === 'confidence') {
      return b.confidence - a.confidence;
    }
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Brain className="h-8 w-8 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900">Top Predictions</h2>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            disabled={isLoading}
          >
            <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Filter className="h-4 w-4 inline-block mr-1" />
              Prediction Method
            </label>
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value)}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              {predictionMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <TrendingUp className="h-4 w-4 inline-block mr-1" />
              Sort By
            </label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="confidence">Confidence (High to Low)</option>
              <option value="timestamp">Latest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Predictions Grid */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size={60} />
        </div>
      ) : sortedPredictions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No predictions available</h3>
          <p className="text-gray-500">Try changing the filters or refreshing the predictions.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedPredictions.map((prediction, index) => (
            <div
              key={index}
              className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Sparkles className="h-5 w-5 text-yellow-500" />
                  <span className="font-medium text-gray-900">{prediction.method}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <TrendingUp className={`h-4 w-4 ${prediction.confidence >= 70 ? 'text-green-500' : 'text-orange-500'}`} />
                  <span className={`text-sm ${prediction.confidence >= 70 ? 'text-green-600' : 'text-orange-600'}`}>
                    {Math.round(prediction.confidence)}% confidence
                  </span>
                </div>
              </div>

              <div className="flex justify-center space-x-2 mb-4">
                {prediction.white_balls.map((number, idx) => (
                  <NumberBall
                    key={idx}
                    number={number}
                    isPowerball={false}
                    highlighted={prediction.confidence >= 80}
                  />
                ))}
                <NumberBall
                  number={prediction.powerball}
                  isPowerball={true}
                  highlighted={prediction.confidence >= 80}
                />
              </div>

              {prediction.reason && (
                <p className="text-sm text-gray-600 mt-2">{prediction.reason}</p>
              )}

              <div className="text-xs text-gray-500 mt-4">
                Generated: {format(new Date(prediction.timestamp), 'MMM d, yyyy HH:mm')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Predictions;