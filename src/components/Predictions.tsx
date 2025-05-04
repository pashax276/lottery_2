// src/components/Predictions.tsx
import React, { useState, useEffect } from 'react';
import { Brain, Sparkles, TrendingUp, RefreshCw, AlertCircle } from 'lucide-react';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';
import { showToast } from './Toast';
import { getPredictions } from '../lib/api';
import { processWhiteBalls, processPowerball } from '../utils/dataUtils';

interface Prediction {
  white_balls: number[];
  powerball: number;
  confidence: number;
  method: string;
  timestamp?: string;
  reason?: string;
}

function Predictions() {
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
      const response = await getPredictions();
      
      // Handle different response formats
      let predictionsData: Prediction[] = [];
      
      if (Array.isArray(response)) {
        predictionsData = response;
      } else if (response && response.predictions) {
        predictionsData = response.predictions;
      } else if (response && response.data) {
        predictionsData = response.data;
      } else {
        console.log('Unexpected response format:', response);
        predictionsData = [];
      }
      
      // Process predictions to ensure proper data format
      const processedPredictions = predictionsData.map((pred: any) => ({
        white_balls: processWhiteBalls(pred.white_balls),
        powerball: processPowerball(pred.powerball),
        confidence: pred.confidence || 0,
        method: pred.method || 'unknown',
        timestamp: pred.timestamp || new Date().toISOString(),
        reason: pred.reason || pred.rationale
      }));
      
      setPredictions(processedPredictions);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch predictions';
      setError(errorMessage);
      console.error('Error fetching predictions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    showToast.loading('Refreshing predictions...');
    await fetchPredictions();
    showToast.success('Predictions updated!');
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

      {/* Predictions Grid */}
      {predictions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No predictions available</h3>
          <p className="text-gray-500">Try refreshing to get the latest predictions.</p>
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

              {prediction.reason && (
                <p className="text-sm text-gray-600 mt-2">{prediction.reason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Predictions;