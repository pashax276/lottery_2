import React, { useState, useEffect } from 'react';
import { Search, Award, Check, X, Plus, Trash2 } from 'lucide-react';
import { showToast } from './Toast';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';
import { useUser } from '../App';

interface Draw {
  id: number;
  draw_number: number;
  draw_date: string;
  white_balls: number[];
  powerball: number;
  jackpot_amount: number;
  winners: number;
}

interface CheckResult {
  user_id: number;
  username: string;
  draw_number: number;
  draw_date: string;
  numbers: number[];
  matches: {
    white_balls: number[];
    powerball: number | null;
    is_winner: boolean;
  };
  message: string;
  timestamp: string;
}

interface NumberSet {
  id: number;
  numbers: number[];
}

interface UserStat {
  user_id: number;
  username: string;
  total_checks: number;
  total_matches: number;
  total_wins: number;
  total_prize: number;
}

interface User {
  id: number;
  username: string;
}

const CheckNumbers = () => {
  const [numberSets, setNumberSets] = useState<NumberSet[]>([{ id: Date.now(), numbers: [0, 0, 0, 0, 0, 0] }]);
  const [selectedDraw, setSelectedDraw] = useState<number | null>(null);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkResults, setCheckResults] = useState<(CheckResult | null)[]>([]);
  const [loadingDraws, setLoadingDraws] = useState(false);
  const [userStats, setUserStats] = useState<UserStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const { user } = useUser();

  useEffect(() => {
    let isMounted = true;

    const fetchDraws = async () => {
      setLoadingDraws(true);
      try {
        const response = await fetch('/api/draws?limit=100');
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Unauthorized: Admin access required');
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (isMounted && data && data.draws) {
          setDraws(data.draws);
          if (data.draws.length > 0) {
            setSelectedDraw(data.draws[0].draw_number);
          }
        }
      } catch (error) {
        console.error('Error fetching draws:', error);
        showToast.error(error instanceof Error ? error.message : 'Failed to fetch draw history');
      } finally {
        if (isMounted) {
          setLoadingDraws(false);
        }
      }
    };

    const fetchUserStats = async () => {
      setLoadingStats(true);
      try {
        const response = await fetch('/api/user_stats');
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Unauthorized: Admin access required');
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (isMounted) {
          setUserStats(data);
        }
      } catch (error) {
        console.error('Error fetching user stats:', error);
        showToast.error(error instanceof Error ? error.message : 'Failed to fetch user stats');
      } finally {
        if (isMounted) {
          setLoadingStats(false);
        }
      }
    };

    fetchDraws();
    fetchUserStats();

    if (user?.is_admin) {
      fetchUsers();
    }

    return () => {
      isMounted = false;
    };
  }, [user]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized: Admin access required');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      showToast.error(error instanceof Error ? error.message : 'Failed to fetch users');
    }
  };

  const addNumberSet = () => {
    if (numberSets.length >= 6) {
      showToast.error('Maximum 6 number sets allowed');
      return;
    }
    setNumberSets([...numberSets, { id: Date.now(), numbers: [0, 0, 0, 0, 0, 0] }]);
    setCheckResults([...checkResults, null]);
  };

  const removeNumberSet = (id: number) => {
    if (numberSets.length === 1) {
      showToast.error('At least one number set is required');
      return;
    }
    const index = numberSets.findIndex(set => set.id === id);
    setNumberSets(numberSets.filter(set => set.id !== id));
    setCheckResults(checkResults.filter((_, i) => i !== index));
  };

  const handleNumberChange = (setId: number, index: number, value: string) => {
    const newValue = parseInt(value, 10) || 0;
    setNumberSets(prevSets =>
      prevSets.map(set =>
        set.id === setId ? { ...set, numbers: set.numbers.map((n, i) => (i === index ? newValue : n)) } : set
      )
    );
  };

  const handleDrawChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDraw(parseInt(e.target.value, 10));
    setCheckResults(numberSets.map(() => null));
  };

  const validateNumberSet = (numbers: number[]) => {
    if (numbers.some(num => num === 0)) {
      return 'Please select all numbers';
    }
    for (let i = 0; i < 5; i++) {
      if (numbers[i] < 1 || numbers[i] > 69) {
        return 'White balls must be between 1 and 69';
      }
    }
    if (numbers[5] < 1 || numbers[5] > 26) {
      return 'Powerball must be between 1 and 26';
    }
    const whiteBalls = numbers.slice(0, 5);
    const uniqueWhiteBalls = new Set(whiteBalls);
    if (uniqueWhiteBalls.size !== 5) {
      return 'White balls must be unique';
    }
    return null;
  };

  const handleRandomSelect = (setId: number) => {
    const whiteBalls: number[] = [];
    while (whiteBalls.length < 5) {
      const num = Math.floor(Math.random() * 69) + 1;
      if (!whiteBalls.includes(num)) {
        whiteBalls.push(num);
      }
    }
    const powerball = Math.floor(Math.random() * 26) + 1;
    setNumberSets(prevSets =>
      prevSets.map(set =>
        set.id === setId ? { ...set, numbers: [...whiteBalls, powerball] } : set
      )
    );
  };

  const handleCheck = async () => {
    if (!selectedDraw) {
      showToast.error('Please select a draw');
      return;
    }

    const validationErrors = numberSets.map(set => validateNumberSet(set.numbers));
    if (validationErrors.some(error => error)) {
      validationErrors.forEach(error => error && showToast.error(error));
      return;
    }

    setLoading(true);
    setCheckResults(numberSets.map(() => null));

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/check_numbers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          user_id: user?.is_admin && selectedUserId ? selectedUserId : undefined,
          draw_number: selectedDraw,
          numbers: numberSets.map(set => set.numbers),
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized: Please log in');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.results) {
        setCheckResults(data.results);
        data.results.forEach((result: CheckResult, index: number) => {
          if (result.matches.is_winner) {
            showToast.success(`Set ${index + 1}: Congratulations! You're a winner!`);
          } else {
            showToast.error(`Set ${index + 1}: Sorry, not a winner. Try again!`);
          }
        });
        fetchUserStats();
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error checking numbers:', error);
      showToast.error('Failed to check your numbers, using client-side check');
      const selectedDrawData = draws.find(d => d.draw_number === selectedDraw);
      if (!selectedDrawData) {
        showToast.error('Draw not found');
        setLoading(false);
        return;
      }
      const newCheckResults: (CheckResult | null)[] = [];
      for (let i = 0; i < numberSets.length; i++) {
        const numbers = numberSets[i].numbers;
        const whiteBallsToCheck = numbers.slice(0, 5);
        const powerballToCheck = numbers[5];
        const whiteMatches = whiteBallsToCheck.filter(ball => selectedDrawData.white_balls.includes(ball));
        const powerballMatch = powerballToCheck === selectedDrawData.powerball;
        let prize = "No Prize";
        let isWinner = false;
        if (powerballMatch && whiteMatches.length === 5) {
          prize = "JACKPOT WINNER!";
          isWinner = true;
        } else if (whiteMatches.length === 5) {
          prize = "$1,000,000";
          isWinner = true;
        } else if (whiteMatches.length === 4 && powerballMatch) {
          prize = "$50,000";
          isWinner = true;
        } else if (whiteMatches.length === 4 || (whiteMatches.length === 3 && powerballMatch)) {
          prize = "$100";
          isWinner = true;
        } else if (whiteMatches.length === 3 || (whiteMatches.length === 2 && powerballMatch)) {
          prize = "$7";
          isWinner = true;
        } else if (whiteMatches.length === 1 && powerballMatch) {
          prize = "$4";
          isWinner = true;
        } else if (powerballMatch) {
          prize = "$4";
          isWinner = true;
        }
        const result = {
          user_id: user?.is_admin && selectedUserId ? selectedUserId : (user?.id || 1),
          username: user?.is_admin && selectedUserId ? users.find(u => u.id === selectedUserId)?.username || 'unknown' : (user?.username || 'anonymous'),
          draw_number: selectedDraw,
          draw_date: selectedDrawData.draw_date,
          numbers,
          matches: {
            white_balls: whiteMatches,
            powerball: powerballMatch ? powerballToCheck : null,
            is_winner: isWinner
          },
          message: `Matched ${whiteMatches.length} white ball${whiteMatches.length !== 1 ? 's' : ''}` +
                   (powerballMatch ? ' and the Powerball' : '') +
                   ` - ${prize}`,
          timestamp: new Date().toISOString()
        };
        newCheckResults.push(result);
        if (isWinner) {
          showToast.success(`Set ${i + 1}: Congratulations! You're a winner!`);
        } else {
          showToast.error(`Set ${i + 1}: Sorry, not a winner. Try again!`);
        }
      }
      setCheckResults(newCheckResults);
      fetchUserStats();
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setNumberSets([{ id: Date.now(), numbers: [0, 0, 0, 0, 0, 0] }]);
    setCheckResults([null]);
    setSelectedUserId(null);
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
        {user?.is_admin && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Check for User
            </label>
            <select
              value={selectedUserId || ''}
              onChange={(e) => setSelectedUserId(e.target.value ? parseInt(e.target.value) : null)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Select a user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Your Number Sets
            </label>
            <button
              type="button"
              onClick={addNumberSet}
              className="flex items-center text-sm text-blue-600 hover:text-blue-800"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Set
            </button>
          </div>
          {numberSets.map((set, setIndex) => (
            <div key={set.id} className="mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Set {setIndex + 1}</span>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => handleRandomSelect(set.id)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Random
                  </button>
                  <button
                    type="button"
                    onClick={() => removeNumberSet(set.id)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-2 sm:gap-4">
                {set.numbers.slice(0, 5).map((number, index) => (
                  <div key={index}>
                    <input
                      type="number"
                      min="1"
                      max="69"
                      value={number === 0 ? '' : number}
                      onChange={(e) => handleNumberChange(set.id, index, e.target.value)}
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
                    value={set.numbers[5] === 0 ? '' : set.numbers[5]}
                    onChange={(e) => handleNumberChange(set.id, 5, e.target.value)}
                    placeholder="Powerball"
                    className="block w-full rounded-md border-red-300 shadow-sm focus:border-red-500 focus:ring-red-500 text-center"
                  />
                </div>
              </div>
              {!set.numbers.includes(0) && (
                <div className="flex flex-col items-center mt-3">
                  <div className="flex space-x-2">
                    {set.numbers.slice(0, 5).map((number, index) => (
                      <NumberBall key={index} number={number} isPowerball={false} />
                    ))}
                    <NumberBall number={set.numbers[5]} isPowerball={true} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex space-x-4">
          <button
            type="button"
            onClick={handleCheck}
            disabled={loading || !selectedDraw || numberSets.some(set => set.numbers.includes(0))}
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
        {checkResults.some(result => result) && (
          <div className="space-y-4">
            {checkResults.map((result, index) => result && (
              <div
                key={index}
                className={`p-4 rounded-lg ${result.matches.is_winner ? 'bg-green-50' : 'bg-gray-50'}`}
              >
                <div className="flex items-center space-x-2 mb-4">
                  {result.matches.is_winner ? (
                    <>
                      <Award className="h-6 w-6 text-green-600" />
                      <h3 className="text-lg font-medium text-green-800">Set {index + 1}: You're a Winner!</h3>
                    </>
                  ) : (
                    <>
                      <X className="h-6 w-6 text-gray-600" />
                      <h3 className="text-lg font-medium text-gray-800">Set {index + 1}: Not a Winner</h3>
                    </>
                  )}
                </div>
                <div className="mb-4">
                  <p className="text-sm text-gray-700 mb-2">User: {result.username}</p>
                  <p className="text-sm text-gray-700 mb-2">{result.message}</p>
                </div>
                <div className="space-y-3">
                  {result.matches.white_balls.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Matching White Balls:</h4>
                      <div className="flex space-x-2">
                        {result.matches.white_balls.map((number, idx) => (
                          <NumberBall key={idx} number={number} isPowerball={false} matched={true} />
                        ))}
                      </div>
                    </div>
                  )}
                  {result.matches.powerball && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Matching Powerball:</h4>
                      <NumberBall number={result.matches.powerball} isPowerball={true} matched={true} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Member Leaderboard</h3>
          {loadingStats ? (
            <div className="flex items-center space-x-2">
              <LoadingSpinner size={20} />
              <span className="text-sm text-gray-500">Loading stats...</span>
            </div>
          ) : userStats.length === 0 ? (
            <p className="text-sm text-gray-500">No stats available</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Username
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Checks
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Matches
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Wins
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Prize
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {userStats.map((stat) => (
                    <tr key={stat.user_id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {stat.username}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {stat.total_checks}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {stat.total_matches}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {stat.total_wins}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${stat.total_prize.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CheckNumbers;