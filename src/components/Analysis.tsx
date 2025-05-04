import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { BarChart3, PieChart, TrendingUp, Activity, Grid as GridIcon, Save, Filter, RefreshCw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import NumberBall from './NumberBall';
import useLocalStorage from '../hooks/useLocalStorage';
import { getFrequencyAnalysis, getHotNumbers, getDueNumbers, getPairs, getPositions, getPredictions } from '../lib/api';

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
}

const Analysis = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useLocalStorage<string>('analysis_tab', 'frequency');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useLocalStorage<'tiles' | 'charts'>('analysis_viewMode', 'tiles');
  const [lookback, setLookback] = useLocalStorage<number>('analysis_lookback', 50);
  const [selectedPosition, setSelectedPosition] = useLocalStorage<number>('analysis_position', 1);
  const [darkMode, setDarkMode] = useLocalStorage<boolean>('analysis_darkMode', false);
  const [customCombination, setCustomCombination] = useState<string>('');

  // React Query hooks with proper data handling
  const { data: frequencyData = [], refetch: refetchFrequency } = useQuery({
    queryKey: ['frequency', lookback],
    queryFn: async () => {
      try {
        const result = await getFrequencyAnalysis();
        if (!result || !result.white_balls) return [];
        
        return Object.entries(result.white_balls)
          .map(([num, freq]) => ({ number: num, frequency: Number(freq) }))
          .sort((a, b) => parseInt(a.number) - parseInt(b.number));
      } catch (error) {
        console.error('Error fetching frequency data:', error);
        return [];
      }
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: hotNumbers = { white_balls: {}, powerballs: {} } } = useQuery({
    queryKey: ['hotNumbers'],
    queryFn: async () => {
      try {
        const result = await getHotNumbers();
        return result || { white_balls: {}, powerballs: {} };
      } catch (error) {
        console.error('Error fetching hot numbers:', error);
        return { white_balls: {}, powerballs: {} };
      }
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: dueNumbers = { white_balls: {}, powerballs: {} } } = useQuery({
    queryKey: ['dueNumbers'],
    queryFn: async () => {
      try {
        const result = await getDueNumbers();
        return result || { white_balls: {}, powerballs: {} };
      } catch (error) {
        console.error('Error fetching due numbers:', error);
        return { white_balls: {}, powerballs: {} };
      }
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: pairData = { common_pairs: [] } } = useQuery({
    queryKey: ['pairs'],
    queryFn: async () => {
      try {
        const result = await getPairs();
        return result || { common_pairs: [] };
      } catch (error) {
        console.error('Error fetching pair data:', error);
        return { common_pairs: [] };
      }
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: positionData = { positions: [] } } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      try {
        const result = await getPositions();
        return result || { positions: [] };
      } catch (error) {
        console.error('Error fetching position data:', error);
        return { positions: [] };
      }
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: predictions = [] } = useQuery({
    queryKey: ['predictions'],
    queryFn: async () => {
      try {
        const result = await getPredictions('all');
        return Array.isArray(result) ? result : [];
      } catch (error) {
        console.error('Error fetching predictions:', error);
        return [];
      }
    },
    staleTime: 1000 * 60 * 5,
  });

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
      
      // Validate ranges
      if (!whiteBalls.every(n => n >= 1 && n <= 69) || powerball < 1 || powerball > 26) {
        alert('White balls must be 1-69 and Powerball must be 1-26');
        return;
      }
      
      // Save combination (you would implement this API call)
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
    queryClient.invalidateQueries(['frequency']);
    queryClient.invalidateQueries(['hotNumbers']);
    queryClient.invalidateQueries(['dueNumbers']);
    queryClient.invalidateQueries(['pairs']);
    queryClient.invalidateQueries(['positions']);
    queryClient.invalidateQueries(['predictions']);
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
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={frequencyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="number" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="frequency" fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
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
            <div className="space-y-4">
              {predictions.map((prediction, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{prediction.method}</span>
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