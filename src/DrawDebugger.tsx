import React, { useState, useEffect } from 'react';
import { Bug, CheckCircle, AlertTriangle, Send, RefreshCw } from 'lucide-react';

// Define API URL directly instead of using import.meta
const API_URL = 'http://localhost:5001';

const DrawDebugger = () => {
  const [drawNumber, setDrawNumber] = useState('');
  const [drawDate, setDrawDate] = useState('');
  const [whiteBalls, setWhiteBalls] = useState(['', '', '', '', '']);
  const [powerball, setPowerball] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dbResponse, setDbResponse] = useState(null);
  
  // Set today's date as default
  useEffect(() => {
    const today = new Date();
    const formattedDate = today.toISOString().slice(0, 10);
    setDrawDate(formattedDate);
  }, []);
  
  const handleWhiteBallChange = (index, value) => {
    const newWhiteBalls = [...whiteBalls];
    newWhiteBalls[index] = value;
    setWhiteBalls(newWhiteBalls);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    setDbResponse(null);
    
    try {
      // Convert inputs to proper format
      const numDrawNumber = parseInt(drawNumber, 10);
      const numWhiteBalls = whiteBalls.map(ball => parseInt(ball, 10));
      const numPowerball = parseInt(powerball, 10);
      
      // Basic validation
      if (isNaN(numDrawNumber) || numDrawNumber <= 0) {
        throw new Error('Draw number must be a positive number');
      }
      
      if (!drawDate) {
        throw new Error('Draw date is required');
      }
      
      if (numWhiteBalls.some(ball => isNaN(ball) || ball < 1 || ball > 69)) {
        throw new Error('White balls must be between 1 and 69');
      }
      
      if (isNaN(numPowerball) || numPowerball < 1 || numPowerball > 26) {
        throw new Error('Powerball must be between 1 and 26');
      }
      
      // Check for duplicates in white balls
      const uniqueWhiteBalls = new Set(numWhiteBalls);
      if (uniqueWhiteBalls.size !== 5) {
        throw new Error('White balls must be unique');
      }
      
      // Make direct API call to avoid any middleware issues
      const response = await fetch(`${API_URL}/api/draws/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draw_number: numDrawNumber,
          draw_date: drawDate,
          white_balls: numWhiteBalls,
          powerball: numPowerball,
          jackpot_amount: 0,
          winners: 0,
        }),
      });
      
      // Check if the response is ok
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }
      
      // Parse the response
      const data = await response.json();
      setResult(data);
      
      // Wait a moment then check if it's in the database
      setTimeout(checkDatabase, 1000, numDrawNumber);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const checkDatabase = async (drawNumber) => {
    try {
      const response = await fetch(`${API_URL}/api/draws/${drawNumber}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Database check failed with status ${response.status}`);
      }
      
      const data = await response.json();
      setDbResponse(data);
    } catch (err) {
      console.error("Database check error:", err);
      setDbResponse({ error: err.message });
    }
  };
  
  const generateRandomDraw = () => {
    // Generate a random draw number
    const randomDrawNumber = Math.floor(Math.random() * 9000) + 1000;
    setDrawNumber(randomDrawNumber.toString());
    
    // Keep current date
    
    // Generate 5 unique random white balls (1-69)
    const randomWhiteBalls = [];
    while (randomWhiteBalls.length < 5) {
      const num = Math.floor(Math.random() * 69) + 1;
      if (!randomWhiteBalls.includes(num)) {
        randomWhiteBalls.push(num);
      }
    }
    setWhiteBalls(randomWhiteBalls.map(num => num.toString()));
    
    // Generate random powerball (1-26)
    const randomPowerball = Math.floor(Math.random() * 26) + 1;
    setPowerball(randomPowerball.toString());
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center space-x-2 mb-6">
        <Bug className="h-6 w-6 text-purple-600" />
        <h2 className="text-xl font-semibold text-gray-900">Draw Debugger</h2>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Draw Number</label>
            <input
              type="number"
              value={drawNumber}
              onChange={(e) => setDrawNumber(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="e.g., 1234"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Draw Date</label>
            <input
              type="date"
              value={drawDate}
              onChange={(e) => setDrawDate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              required
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">White Balls (1-69)</label>
          <div className="grid grid-cols-5 gap-2 mt-1">
            {whiteBalls.map((ball, index) => (
              <input
                key={index}
                type="number"
                min="1"
                max="69"
                value={ball}
                onChange={(e) => handleWhiteBallChange(index, e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder={`Ball ${index + 1}`}
                required
              />
            ))}
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Powerball (1-26)</label>
          <input
            type="number"
            min="1"
            max="26"
            value={powerball}
            onChange={(e) => setPowerball(e.target.value)}
            className="mt-1 block w-full rounded-md border-red-300 shadow-sm focus:border-red-500 focus:ring-red-500"
            placeholder="Powerball"
            required
          />
        </div>
        
        <div className="flex space-x-4">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="animate-spin h-4 w-4 mr-2" />
                Processing...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Test Adding Draw
              </>
            )}
          </button>
          
          <button
            type="button"
            onClick={generateRandomDraw}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Generate Random Draw
          </button>
        </div>
      </form>
      
      {error && (
        <div className="mt-6 p-4 bg-red-50 rounded-md">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <h3 className="ml-2 text-sm font-medium text-red-800">Error</h3>
          </div>
          <div className="mt-2 text-sm text-red-700">
            {error}
          </div>
        </div>
      )}
      
      {result && (
        <div className="mt-6 p-4 bg-green-50 rounded-md">
          <div className="flex">
            <CheckCircle className="h-5 w-5 text-green-400" />
            <h3 className="ml-2 text-sm font-medium text-green-800">API Response Success</h3>
          </div>
          <div className="mt-2 text-sm text-green-700">
            <pre className="bg-white p-2 rounded overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}
      
      {dbResponse && (
        <div className="mt-6 p-4 bg-blue-50 rounded-md">
          <div className="flex">
            <h3 className="ml-2 text-sm font-medium text-blue-800">Database Check Result</h3>
          </div>
          <div className="mt-2 text-sm text-blue-700">
            {dbResponse.error ? (
              <div className="text-red-500">
                {dbResponse.error}
                <p className="mt-2">Draw not found in database after API call returned success.</p>
              </div>
            ) : (
              <div>
                <p className="font-medium">Draw found in database!</p>
                <pre className="bg-white p-2 rounded overflow-auto mt-2">
                  {JSON.stringify(dbResponse, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DrawDebugger;