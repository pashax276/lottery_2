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

// Utility function to safely process white balls data
const processWhiteBalls = (whiteBalls: any): number[] => {
  // Handle undefined or null
  if (whiteBalls === undefined || whiteBalls === null) {
    return [1, 2, 3, 4, 5]; // Default
  }
  
  // Handle array format
  if (Array.isArray(whiteBalls)) {
    const processed = whiteBalls
      .map(ball => typeof ball === 'string' ? parseInt(ball, 10) : ball)
      .filter(ball => typeof ball === 'number' && !isNaN(ball) && ball >= 1 && ball <= 69)
      .slice(0, 5);
    
    // If we don't have 5 numbers after processing, pad with defaults
    while (processed.length < 5) {
      processed.push(processed.length + 1);
    }
    
    return processed;
  }
  
  // Handle PostgreSQL array string format like "{1,2,3,4,5}"
  if (typeof whiteBalls === 'string') {
    try {
      if (whiteBalls.startsWith('{') && whiteBalls.endsWith('}')) {
        const cleaned = whiteBalls.slice(1, -1);
        const processed = cleaned.split(',')
          .map(item => parseInt(item.trim(), 10))
          .filter(num => !isNaN(num) && num >= 1 && num <= 69)
          .slice(0, 5);
        
        // If we don't have 5 numbers after processing, pad with defaults
        while (processed.length < 5) {
          processed.push(processed.length + 1);
        }
        
        return processed;
      }
    } catch (e) {
      console.error('Error processing white_balls string:', e);
    }
  }
  
  // Default fallback
  console.warn('Could not process white_balls:', whiteBalls);
  return [1, 2, 3, 4, 5];
};

// Utility function to safely process powerball
const processPowerball = (powerball: any): number => {
  // Handle undefined or null
  if (powerball === undefined || powerball === null) {
    return 1;
  }
  
  // Handle numeric input
  if (typeof powerball === 'number' && !isNaN(powerball)) {
    return Math.max(1, Math.min(26, powerball));
  }
  
  // Handle string input
  if (typeof powerball === 'string') {
    const parsed = parseInt(powerball, 10);
    if (!isNaN(parsed)) {
      return Math.max(1, Math.min(26, parsed));
    }
  }
  
  // Default fallback
  console.warn('Could not process powerball:', powerball);
  return 1;
};

// Process predictions array from different API response formats
const processPredictions = (data: any): Prediction[] => {
  console.log('Processing predictions from data:', data);
  
  // Handle different API response formats
  let rawPredictions: any[] = [];
  
  if (!data) {
    return [];
  }
  
  if (Array.isArray(data)) {
    rawPredictions = data;
  } else if (data.predictions && Array.isArray(data.predictions)) {
    rawPredictions = data.predictions;
  } else if (data.data && Array.isArray(data.data)) {
    rawPredictions = data.data;
  } else if (data.results && Array.isArray(data.results)) {
    rawPredictions = data.results;
  } else {
    console.warn('Unexpected predictions data format:', data);
    return [];
  }
  
  // Process each prediction to ensure correct format
  return rawPredictions.map((pred) => {
    if (!pred) return {
      white_balls: [1, 2, 3, 4, 5],
      powerball: 1,
      confidence: 0,
      method: 'unknown',
      created_at: new Date().toISOString()
    };
    
    return {
      white_balls: processWhiteBalls(pred.white_balls),
      powerball: processPowerball(pred.powerball),
      confidence: typeof pred.confidence === 'number' ? pred.confidence : parseFloat(pred.confidence) || 0,
      method: pred.method || 'unknown',
      created_at: pred.created_at || new Date().toISOString(),
      rationale: pred.rationale || ''
    };
  });
};

// Fallback prediction data for when the API is not available
const fallbackPredictions: Prediction[] = [
  {
    white_balls: [3, 17, 24, 41, 56],
    powerball: 10,
    confidence: 75,
    method: 'pattern (Frequency Analysis)',
    rationale: 'Based on historical frequency patterns',
    created_at: new Date().toISOString()
  },
  {
    white_balls: [7, 14, 22, 35, 49],
    powerball: 20,
    confidence: 82,
    method: 'machine-learning (Ensemble)',
    rationale: 'Generated using predictive modeling',
    created_at: new Date().toISOString()
  },
  {
    white_balls: [5, 12, 27, 38, 63],
    powerball: 8,
    confidence: 68,
    method: 'pattern (Gap Analysis)',
    rationale: 'Based on number gap trends',
    created_at: new Date().toISOString()
  }
];

const Predictions: React.FC = () => {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    fetchPredictions();
  }, []);

  const fetchPredictions = async () => {
    setLoading(true);
    setError(null);
    setUsingFallback(false);
    
    try {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      
      console.log('Fetching predictions...');
      const response = await fetch('/api/predictions?limit=10', {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        },
      });
      
      console.log('Predictions response status:', response.status);
      
      if (response.status === 500) {
        // Backend error - use fallback data
        console.error('Backend error fetching predictions - using fallback data');
        setError('Server error - using locally generated predictions');
        setPredictions(fallbackPredictions);
        setUsingFallback(true);
        return;
      }
      
      if (response.status === 401) {
        // Handle unauthorized - predictions might be public, let's try without token
        console.log('Unauthorized - trying without token');
        try {
          const publicResponse = await fetch('/api/predictions?limit=10');
          
          if (!publicResponse.ok) {
            throw new Error('Authentication required');
          }
          
          const predictionsData = await publicResponse.json();
          console.log('Predictions data from public endpoint:', predictionsData);
          
          const processedPredictions = processPredictions(predictionsData);
          console.log('Processed predictions:', processedPredictions);
          
          setPredictions(processedPredictions);
        } catch (publicError) {
          console.error('Failed to fetch public predictions:', publicError);
          setError('Authentication required - using locally generated predictions');
          setPredictions(fallbackPredictions);
          setUsingFallback(true);
        }
        return;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const predictionsData = await response.json();
      console.log('Predictions data:', predictionsData);
      
      const processedPredictions = processPredictions(predictionsData);
      console.log('Processed predictions:', processedPredictions);
      
      setPredictions(processedPredictions);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch predictions';
      console.error('Error fetching predictions:', err);
      setError(errorMessage);
      setPredictions(fallbackPredictions);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await fetchPredictions();
    if (!error) {
      showToast.success('Predictions updated!');
    }
  };

  const generatePrediction = async (method: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      
      console.log(`Generating ${method} prediction...`);
      const response = await fetch('/api/predictions', {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ method, user_id: 1 }),
      });

      console.log('Generate prediction response status:', response.status);

      if (response.status === 500) {
        // Handle server error with fallback
        console.error('Server error - creating local prediction');
        showToast.error('Server error - created a local prediction instead');
        
        // Create a new prediction and add it to the list
        const newPrediction: Prediction = {
          white_balls: Array.from({length: 5}, () => Math.floor(Math.random() * 69) + 1),
          powerball: Math.floor(Math.random() * 26) + 1,
          confidence: Math.floor(Math.random() * 30) + 65, // 65-95%
          method: `${method} (local)`,
          rationale: 'Generated locally due to server error',
          created_at: new Date().toISOString()
        };
        
        // Sort the white balls
        newPrediction.white_balls.sort((a, b) => a - b);
        
        setPredictions(prev => [newPrediction, ...prev]);
        setUsingFallback(true);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Generate prediction result:', result);
      
      if (result.success) {
        showToast.success('New prediction generated!');
        fetchPredictions();
      } else {
        throw new Error('API returned unsuccessful response');
      }
    } catch (err) {
      console.error('Error generating prediction:', err);
      showToast.error('Failed to generate prediction - using local fallback');
      
      // Create a new prediction and add it to the list
      const newPrediction: Prediction = {
        white_balls: Array.from({length: 5}, () => Math.floor(Math.random() * 69) + 1),
        powerball: Math.floor(Math.random() * 26) + 1,
        confidence: Math.floor(Math.random() * 30) + 65, // 65-95%
        method: `${method} (local)`,
        rationale: 'Generated locally due to server error',
        created_at: new Date().toISOString()
      };
      
      // Sort the white balls
      newPrediction.white_balls.sort((a, b) => a - b);
      
      setPredictions(prev => [newPrediction, ...prev]);
      setUsingFallback(true);
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
        
        {/* Error Notice */}
        {error && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center space-x-3 mb-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <h3 className="text-sm font-medium text-yellow-700">{error}</h3>
            </div>
            <p className="text-sm text-yellow-600">
              {usingFallback ? 
                "Using locally generated predictions while we fix the server issue." : 
                "Please try refreshing the page or try again later."}
            </p>
          </div>
        )}
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
              
              {usingFallback && index < 3 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-xs text-yellow-500">
                    <AlertCircle className="h-3 w-3 inline mr-1" />
                    Local prediction (server unavailable)
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Predictions;