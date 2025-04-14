import React, { useState, useEffect } from 'react';
import { Search, Award, Check, X } from 'lucide-react';
import { getDraws, getLatestDraw, checkNumbers } from '../lib/api';
import { showToast } from './Toast';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';

interface Draw {
  draw_number: number;
  draw_date: string;
  white_balls: number[];
  powerball: number;
  jackpot_amount: number;
  winners: number;
}

interface CheckResult {
  matches: {
    white_balls: number[];
    powerball: number | null;
    is_winner: boolean;
  };
  message: string;
}

const CheckNumbers = () => {
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [selectedDraw, setSelectedDraw] = useState<number | null>(null);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [loadingDraws, setLoadingDraws] = useState(false);

  useEffect(() => {
    fetchDraws();
  }, []);

  const fetchDraws = async () => {
    setLoadingDraws(true);
    try {
      const result = await getDraws();
      if (result && result.draws) {
        setDraws(result.draws);
        
        // Select the latest draw by default
        if (result.draws.length > 0) {
          setSelectedDraw(result.draws[0].draw_number);
        }
      }
    } catch (error) {
      console.error('Error fetching draws:', error);
      showToast.error('Failed to fetch draw history');
    } finally {
      setLoadingDraws(false);
    }
  };

  const handleNumberChange = (index: number, value: string) => {
    const newValue = parseInt(value, 10) || 0;
    const newNumbers = [...selectedNumbers];
    newNumbers[index] = newValue;
    setSelectedNumbers(newNumbers);
  };

  const handleDrawChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDraw(parseInt(e.target.value, 10));
  };

  const validateNumbers = () => {
    // Check that all numbers are selected
    if (selectedNumbers.some(num => num === 0)) {
      showToast.error('Please select all numbers');
      return false;
    }

    // Check white ball ranges (1-69)
    for (let i = 0; i < 5; i++) {
      if (selectedNumbers[i] < 1 || selectedNumbers[i] > 69) {
        showToast.error('White balls must be between 1 and 69');
        return false;
      }
    }

    // Check powerball range (1-26)
    if (selectedNumbers[5] < 1 || selectedNumbers[5] > 26) {
      showToast.error('Powerball must be between 1 and 26');
      return false;
    }

    // Check for duplicates in white balls
    const whiteBalls = selectedNumbers.slice(0, 5);
    const uniqueWhiteBalls = new Set(whiteBalls);
    if (uniqueWhiteBalls.size !== 5) {
      showToast.error('White balls must be unique');
      return false;
    }

    return true;
  };

  const handleRandomSelect = () => {
    // Generate 5 unique random white balls (1-69)
    const whiteBalls: number[] = [];
    while (whiteBalls.length < 5) {
      const num = Math.floor(Math.random() * 69) + 1;
      if (!whiteBalls.includes(num)) {
        whiteBalls.push(num);
      }
    }

    // Generate random powerball (1-26)
    const powerball = Math.floor(Math.random() * 26) + 1;

    setSelectedNumbers([...whiteBalls, powerball]);
  };

  const handleCheck = async () => {
    if (!selectedDraw) {
      showToast.error('Please select a draw');
      return;
    }

    if (!validateNumbers()) {
      return;
    }

    setLoading(true);
    setCheckResult(null);

    try {
      const result = await checkNumbers('anonymous', selectedDraw, selectedNumbers);
      
      if (result && result.success && result.result) {
        setCheckResult(result.result);
        
        if (result.result.matches.is_winner) {
          showToast.success('Congratulations! You\'re a winner!');
        } else {
          showToast.error('Sorry, not a winner. Try again!');
        }
      }
    } catch (error) {
      console.error('Error checking numbers:', error);
      showToast.error('Failed to check your numbers');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setSelectedNumbers([0, 0, 0, 0, 0, 0]);
    setCheckResult(null);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Search className="h-6 w-6 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Check Your Numbers</h2>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Draw
          </label>
          {loadingDraws ? (
            <div className="flex items-center space-x-2">
              <LoadingSpinner size={20} />
              <span className="text-sm text-gray-500">Loading draws...</span>
            </div>
          ) : (
            <select
              value={selectedDraw || ''}
              onChange={handleDrawChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Select a draw</option>
              {draws.map((draw) => (
                <option key={draw.draw_number} value={draw.draw_number}>
                  #{draw.draw_number} - {draw.draw_date} 
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Your Numbers
            </label>
            <button
              type="button"
              onClick={handleRandomSelect}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Random Select
            </button>
          </div>

          <div className="grid grid-cols-6 gap-2 sm:gap-4">
            {selectedNumbers.slice(0, 5).map((number, index) => (
              <div key={index}>
                <input
                  type="number"
                  min="1"
                  max="69"
                  value={number === 0 ? '' : number}
                  onChange={(e) => handleNumberChange(index, e.target.value)}
                  placeholder={`Ball ${index + 1}`}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-center"
                />
              </div>
            ))}
            <div>
              <input
                type="number"
                min="1"
                max="26"
                value={selectedNumbers[5] === 0 ? '' : selectedNumbers[5]}
                onChange={(e) => handleNumberChange(5, e.target.value)}
                placeholder="Powerball"
                className="block w-full rounded-md border-red-300 shadow-sm focus:border-red-500 focus:ring-red-500 text-center"
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        {!selectedNumbers.includes(0) && (
          <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Your Selected Numbers</h3>
            <div className="flex space-x-2">
              {selectedNumbers.slice(0, 5).map((number, index) => (
                <NumberBall
                  key={index}
                  number={number}
                  isPowerball={false}
                />
              ))}
              <NumberBall
                number={selectedNumbers[5]}
                isPowerball={true}
              />
            </div>
          </div>
        )}

        <div className="flex space-x-4">
          <button
            type="button"
            onClick={handleCheck}
            disabled={loading || !selectedDraw || selectedNumbers.includes(0)}
            className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <LoadingSpinner size={20} color="#ffffff" />
                <span className="ml-2">Checking...</span>
              </span>
            ) : (
              'Check Numbers'
            )}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Clear
          </button>
        </div>

        {checkResult && (
          <div className={`p-4 rounded-lg ${checkResult.matches.is_winner ? 'bg-green-50' : 'bg-gray-50'}`}>
            <div className="flex items-center space-x-2 mb-4">
              {checkResult.matches.is_winner ? (
                <>
                  <Award className="h-6 w-6 text-green-600" />
                  <h3 className="text-lg font-medium text-green-800">You're a Winner!</h3>
                </>
              ) : (
                <>
                  <X className="h-6 w-6 text-gray-600" />
                  <h3 className="text-lg font-medium text-gray-800">Not a Winner</h3>
                </>
              )}
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-700 mb-2">
                {checkResult.message}
              </p>
            </div>

            <div className="space-y-3">
              {checkResult.matches.white_balls.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1">
                    Matching White Balls:
                  </h4>
                  <div className="flex space-x-2">
                    {checkResult.matches.white_balls.map((number, index) => (
                      <NumberBall
                        key={index}
                        number={number}
                        isPowerball={false}
                        matched={true}
                      />
                    ))}
                  </div>
                </div>
              )}

              {checkResult.matches.powerball && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1">
                    Matching Powerball:
                  </h4>
                  <NumberBall
                    number={checkResult.matches.powerball}
                    isPowerball={true}
                    matched={true}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckNumbers;