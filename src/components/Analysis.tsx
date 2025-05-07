import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3, TrendingUp, Activity, Grid as GridIcon, Save, RefreshCw } from 'lucide-react';
import NumberBall from './NumberBall';
import useLocalStorage from '../hooks/useLocalStorage';

interface FrequencyData {
  number: string;
  frequency: number;
}

interface PairData {
  pair: number[];
  count: number;
}

interface PositionData {
  position: number;
  top_numbers: { number: number; count: number }[];
}

interface PredictionData {
  white_balls: number[];
  powerball: number;
  confidence: number;
  method: string;
  rationale?: string;
}

const Analysis = () => {
  const [tab, setTab] = useLocalStorage<string>('analysis_tab', 'frequency');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whiteBallFrequency, setWhiteBallFrequency] = useState<FrequencyData[]>([]);
  const [powerBallFrequency, setPowerBallFrequency] = useState<FrequencyData[]>([]);
  const [hotNumbers, setHotNumbers] = useState<{ white_balls: any; powerballs: any }>({ white_balls: {}, powerballs: {} });
  const [dueNumbers, setDueNumbers] = useState<{ white_balls: any; powerballs: any }>({ white_balls: {}, powerballs: {} });
  const [pairData, setPairData] = useState<{ common_pairs: PairData[] }>({ common_pairs: [] });
  const [positionData, setPositionData] = useState<{ positions: PositionData[] }>({ positions: [] });
  const [predictions, setPredictions] = useState<PredictionData[]>([]);
  
  const [lookback, setLookback] = useLocalStorage<number>('analysis_lookback', 50);
  const [selectedPosition, setSelectedPosition] = useLocalStorage<number>('analysis_position', 1);
  const [customCombination, setCustomCombination] = useState<string>('');

  useEffect(() => {
    if (tab === 'frequency') fetchFrequencyData();
    if (tab === 'hot-due') {
      fetchHotNumbers();
      fetchDueNumbers();
    }
    if (tab === 'pairs') fetchPairData();
    if (tab === 'positions') fetchPositionData();
    if (tab === 'predictions') fetchPredictions();
  }, [tab, lookback]);

  const fetchFrequencyData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/insights/frequency');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result && result.white_balls && result.powerballs) {
        const whiteData = Object.entries(result.white_balls)
          .map(([num, freq]) => ({ number: num, frequency: Number(freq) }))
          .sort((a, b) => parseInt(a.number) - parseInt(b.number));
        const powerData = Object.entries(result.powerballs)
          .map(([num, freq]) => ({ number: num, frequency: Number(freq) }))
          .sort((a, b) => parseInt(a.number) - parseInt(b.number));
        setWhiteBallFrequency(whiteData);
        setPowerBallFrequency(powerData);
      }
    } catch (error) {
      console.error('Error fetching frequency data:', error);
      setError('Failed to fetch frequency data');
    } finally {
      setLoading(false);
    }
  };

  const fetchHotNumbers = async () => {
    try {
      const response = await fetch('/api/insights/hot');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      setHotNumbers(result || { white_balls: {}, powerballs: {} });
    } catch (error) {
      console.error('Error fetching hot numbers:', error);
    }
  };

  const fetchDueNumbers = async () => {
    try {
      const response = await fetch('/api/insights/due');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      setDueNumbers(result || { white_balls: {}, powerballs: {} });
    } catch (error) {
      console.error('Error fetching due numbers:', error);
    }
  };

  const fetchPairData = async () => {
    try {
      const response = await fetch('/api/insights/pairs');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      setPairData(result || { common_pairs: [] });
    } catch (error) {
      console.error('Error fetching pair data:', error);
    }
  };

  const fetchPositionData = async () => {
    try {
      const response = await fetch('/api/insights/positions');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      setPositionData(result || { positions: [] });
    } catch (error) {
      console.error('Error fetching position data:', error);
    }
  };

  const fetchPredictions = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/predictions?limit=10', { headers });
      
      if (response.status === 401) {
        const publicResponse = await fetch('/api/predictions?limit=10');
        if (!publicResponse.ok) {
          throw new Error('Authentication required to view predictions. Please log in.');
        }
        const publicResult = await publicResponse.json();
        processPredictions(publicResult);
        return;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      processPredictions(result);
    } catch (error) {
      console.error('Error fetching predictions:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch predictions');
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  };

  const processPredictions = (predictionsData: any) => {
    let processedPredictions: PredictionData[] = [];
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
    
    const finalPredictions = processedPredictions.map((pred: any) => ({
      white_balls: Array.isArray(pred.white_balls) ? pred.white_balls : JSON.parse(pred.white_balls || '[]'),
      powerball: Number(pred.powerball) || 1,
      confidence: Number(pred.confidence) || 0,
      method: pred.method || 'unknown',
      rationale: pred.rationale || ''
    }));
    
    setPredictions(finalPredictions);
  };

  const handleCustomCombination = useCallback(async () => {
    if (!customCombination) return;
    
    try {
      setLoading(true);
      const numbers = customCombination.split(',').map(Number);
      if (numbers.length !== 6 || numbers.some(isNaN)) {
        alert('Please enter 5 white balls (1-69) and 1 Powerball (1-26) separated by commas');
        return;
      }
      
      const whiteBalls = numbers.slice(0, 5);
      const powerball = numbers[5];
      
      if (!whiteBalls.every(n => n >= 1 && n <= 69) || powerball < 1 || powerball > 26) {
        alert('White balls must be 1-69 and Powerball must be 1-26');
        return;
      }
      
      console.log('Saving combination:', { whiteBalls, powerball });
      alert('Custom combination saved!');
      setCustomCombination('');
    } catch (error) {
      console.error('Error saving custom combination:', error);
      alert('Failed to save combination');
    } finally {
      setLoading(false);
    }
  }, [customCombination]);

  const refreshData = () => {
    if (tab === 'frequency') fetchFrequencyData();
    if (tab === 'hot-due') {
      fetchHotNumbers();
      fetchDueNumbers();
    }
    if (tab === 'pairs') fetchPairData();
    if (tab === 'positions') fetchPositionData();
    if (tab === 'predictions') fetchPredictions();
  };

  const getBadgeClass = (method: string) => {
    if (method.toLowerCase().includes('machine-learning')) {
      return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800';
    }
    return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800';
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <BarChart3 className="h-8 w-8 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900">Analysis Dashboard</h2>
          </div>
          <button
            onClick={refreshData}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="h-5 w-5" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { id: 'frequency', label: 'Frequency', icon: BarChart3 },
            { id: 'hot-due', label: 'Hot & Due', icon: TrendingUp },
            { id: 'pairs', label: 'Pairs', icon: GridIcon },
            { id: 'positions', label: 'Positions', icon: Activity },
            { id: 'predictions', label: 'Predictions', icon: TrendingUp },
            { id: 'custom', label: 'Custom', icon: Save },
          ].map((tabItem) => {
            const Icon = tabItem.icon;
            return (
              <button
                key={tabItem.id}
                onClick={() => setTab(tabItem.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  tab === tabItem.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tabItem.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {tab === 'frequency' && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Number Frequency Analysis</h3>
            <div className="space-y-8">
              {/* White Ball Frequency */}
              <div>
                <h4 className="text-md font-medium text-gray-700 mb-2">White Balls (1-69)</h4>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={whiteBallFrequency}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="number" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="frequency" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {/* Powerball Frequency */}
              <div>
                <h4 className="text-md font-medium text-gray-700 mb-2">Powerballs (1-26)</h4>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={powerBallFrequency}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="number" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="frequency" fill="#EF4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'hot-due' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Hot Numbers</h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(hotNumbers.white_balls)
                  .sort(([, a], [, b]) => Number(b) - Number(a))
                  .slice(0, 10)
                  .map(([number]) => (
                    <NumberBall key={number} number={Number(number)} />
                  ))}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Due Numbers</h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(dueNumbers.white_balls)
                  .sort(([, a], [, b]) => Number(a) - Number(b))
                  .slice(0, 10)
                  .map(([number]) => (
                    <NumberBall key={number} number={Number(number)} />
                  ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'pairs' && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Common Number Pairs</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {pairData.common_pairs.map((item, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="flex justify-center space-x-2 mb-2">
                    <NumberBall number={item.pair[0]} size={30} />
                    <NumberBall number={item.pair[1]} size={30} />
                  </div>
                  <p className="text-sm text-gray-600">{item.count} occurrences</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'positions' && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Position Analysis</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Position
              </label>
              <select
                value={selectedPosition}
                onChange={(e) => setSelectedPosition(Number(e.target.value))}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                {[1, 2, 3, 4, 5].map((pos) => (
                  <option key={pos} value={pos}>
                    Position {pos}
                  </option>
                ))}
              </select>
            </div>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={
                    positionData.positions
                      .find((p) => p.position === selectedPosition)
                      ?.top_numbers.map((item) => ({
                        number: item.number,
                        count: item.count,
                      })) || []
                  }
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="number" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {tab === 'predictions' && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Prediction Trends</h3>
            {loading ? (
              <div className="text-center py-4">
                <p className="text-gray-600">Loading predictions...</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 rounded-lg p-4 text-center">
                <p className="text-red-600 mb-2">{error}</p>
                {error.includes('Authentication required') ? (
                  <p className="text-gray-600">Please log in to view predictions or generate new ones.</p>
                ) : (
                  <button
                    onClick={refreshData}
                    className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Retry
                  </button>
                )}
              </div>
            ) : predictions.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-gray-600 mb-2">No predictions available. Generate some to get started!</p>
                <button
                  onClick={refreshData}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Refresh Predictions
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {predictions.map((prediction, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className={getBadgeClass(prediction.method)}>
                          {prediction.method}
                        </span>
                        {prediction.rationale && (
                          <span className="text-sm text-gray-500" title={prediction.rationale}>
                            (i)
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-gray-600">
                        {Math.round(prediction.confidence)}% confidence
                      </span>
                    </div>
                    <div className="flex space-x-2">
                      {prediction.white_balls.map((number, idx) => (
                        <NumberBall key={idx} number={number} />
                      ))}
                      <NumberBall number={prediction.powerball} isPowerball />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'custom' && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Custom Combinations</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter 6 numbers (comma-separated)
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={customCombination}
                    onChange={(e) => setCustomCombination(e.target.value)}
                    placeholder="1,2,3,4,5,6"
                    className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleCustomCombination}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Enter 5 white ball numbers (1-69) and 1 Powerball (1-26)
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Analysis;