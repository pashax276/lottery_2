// src/components/Predictions.tsx
import React, { useState, useEffect } from 'react';
import { Brain, Sparkles, TrendingUp, RefreshCw, AlertCircle } from 'lucide-react';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';
import { showToast } from './Toast';

interface Prediction {
  white_balls: number[];
  powerball: number;
  confidence: number;
  method: string;
  created_at?: string;
  rationale?: string;
}

const processWhiteBalls = (whiteBalls: any): number[] => {
  if (Array.isArray(whiteBalls)) {
    return whiteBalls.map(ball => typeof ball === 'string' ? parseInt(ball, 10) : ball);
  }
  if (typeof whiteBalls === 'string' && whiteBalls.startsWith('{') && whiteBalls.endsWith('}')) {
    const cleaned = whiteBalls.slice(1, -1);
    return cleaned.split(',').map(item => parseInt(item.trim(), 10));
  }
  return [1, 2, 3, 4, 5];
};

const processPowerball = (powerball: any): number => {
  if (typeof powerball === 'number') return powerball;
  if (typeof powerball === 'string') return parseInt(powerball, 10) || 1;
  return 1;
};

const Predictions = () => {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPredictions();
  }, []);

  const fetchPredictions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      
      const response = await fetch('/api/predictions?limit=10', {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        },
      });
      
      if (response.status === 500) {
        // If backend has an error, show a message but don't crash
        console.error('Backend error fetching predictions');
        setError('Server error - please try again later');
        setPredictions([]);
        return;
      }
      
      if (response.status === 401) {
        // Handle unauthorized - predictions might be public, let's try without token
        const publicResponse = await fetch('/api/predictions?limit=10');
        
        if (!publicResponse.ok) {
          throw new Error('Authentication required');
        }
        
        const predictionsData = await publicResponse.json();
        processPredictions(predictionsData);
        return;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const predictionsData = await response.json();
      processPredictions(predictionsData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch predictions';
      setError(errorMessage);
      console.error('Error fetching predictions:', err);
      setPredictions([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const processPredictions = (predictionsData: any) => {
    // Handle different response formats
    let processedPredictions: Prediction[] = [];
    
    if (Array.isArray(predictionsData)) {
      processedPredictions = predictionsData;
    } else if (predictionsData && predictionsData.predictions) {
      processedPredictions = predictionsData.predictions;
    } else if (predictionsData && predictionsData.data) {
      processedPredictions = predictionsData.data;
    } else {
      console.log('Unexpected response format:', predictionsData);
      processedPredictions = [];
    }
    
    // Process predictions to ensure proper data format
    const finalPredictions = processedPredictions.map((pred: any) => ({
      white_balls: processWhiteBalls(pred.white_balls),
      powerball: processPowerball(pred.powerball),
      confidence: pred.confidence || 0,
      method: pred.method || 'unknown',
      created_at: pred.created_at || new Date().toISOString(),
      rationale: pred.rationale || ''
    }));
    
    setPredictions(finalPredictions);
  };

  const handleRefresh = async () => {
    await fetchPredictions();
    showToast.success('Predictions updated!');
  };

  const generatePrediction = async (method: string) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const response = await fetch('/api/predictions', {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ method, user_id: 1 }),
      });

      if (response.status === 500) {
        showToast.error('Server error - please try again later');
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        showToast.success('New prediction generated!');
        fetchPredictions();
      }
    } catch (err) {
      showToast.error('Failed to generate prediction');
      console.error('Error generating prediction:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && predictions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size={50} />
      </div>
    );
  }

  if (error && predictions.length === 0) {
    return (
      <div className="bg-red-50 p-6 rounded-lg shadow-sm">
        <div className="flex items-center space-x-3 mb-4">
          <AlertCircle className="h-6 w-6 text-red-600" />
          <h3 className="text-lg font-medium text-red-900">Error Loading Predictions</h3>
        </div>
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchPredictions}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Brain className="h-8 w-8 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900">Predictions</h2>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => generatePrediction('pattern')}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              disabled={loading}
            >
              <Brain className="h-5 w-5" />
              <span>Generate Pattern</span>
            </button>
            <button
              onClick={() => generatePrediction('machine-learning')}
              className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              disabled={loading}
            >
              <Brain className="h-5 w-5" />
              <span>Generate ML</span>
            </button>
            <button
              onClick={handleRefresh}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              disabled={loading}
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Predictions Grid */}
      {predictions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No predictions available</h3>
          <p className="text-gray-500 mb-4">Generate predictions using the buttons above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {predictions.map((prediction, index) => (
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

              {prediction.rationale && (
                <p className="text-sm text-gray-600 mt-2">{prediction.rationale}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                Generated: {new Date(prediction.created_at || '').toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Predictions;