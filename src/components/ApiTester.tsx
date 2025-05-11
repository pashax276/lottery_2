import React, { useState } from 'react';

/**
 * Component to test API connectivity
 * Add this to your app for debugging network issues
 */
const ApiTester: React.FC = () => {
  const [results, setResults] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [apiUrl, setApiUrl] = useState<string>('/api/health');

  const testConnection = async () => {
    setLoading(true);
    setResults('Testing connection...\n');
    
    try {
      // Test the API directly
      const startTime = Date.now();
      const response = await fetch(apiUrl);
      const endTime = Date.now();
      
      let responseText = '';
      try {
        responseText = await response.text();
      } catch (e) {
        responseText = 'Could not read response text';
      }
      
      setResults(prev => prev + `
Status: ${response.status} ${response.statusText}
Time: ${endTime - startTime}ms
Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}
Response: ${responseText}
`);

      // Try with explicit auth header
      const token = localStorage.getItem('token');
      if (token) {
        setResults(prev => prev + `\nTesting with explicit auth token...\n`);
        const authResponse = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        let authResponseText = '';
        try {
          authResponseText = await authResponse.text();
        } catch (e) {
          authResponseText = 'Could not read response text';
        }
        
        setResults(prev => prev + `
Auth Status: ${authResponse.status} ${authResponse.statusText}
Auth Headers: ${JSON.stringify(Object.fromEntries(authResponse.headers.entries()), null, 2)}
Auth Response: ${authResponseText}
`);
      } else {
        setResults(prev => prev + '\nNo token in localStorage\n');
      }
    } catch (error) {
      setResults(prev => prev + `Error: ${error instanceof Error ? error.message : String(error)}\n`);
    } finally {
      setLoading(false);
    }
  };

  const clearLocalStorage = () => {
    localStorage.clear();
    setResults('localStorage cleared');
  };

  return (
    <div className="border rounded-md p-4 bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-4">API Connection Tester</h2>
      
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          API URL
        </label>
        <div className="flex space-x-2">
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
          <button
            onClick={testConnection}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test'}
          </button>
        </div>
      </div>
      
      <div className="mb-4">
        <button
          onClick={clearLocalStorage}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Clear localStorage
        </button>
      </div>
      
      <div className="mt-4">
        <h3 className="text-md font-medium mb-2">Connection Information</h3>
        <pre className="bg-gray-100 p-4 rounded-md text-sm h-60 overflow-auto whitespace-pre-wrap">
          {results || 'Click "Test" to check API connection'}
        </pre>
      </div>
      
      <div className="mt-4 text-xs text-gray-500">
        <p>Debug Info:</p>
        <ul className="list-disc pl-4">
          <li>App URL: {window.location.href}</li>
          <li>API Endpoint: {apiUrl}</li>
          <li>Environment: {process.env.NODE_ENV}</li>
          <li>Has Token: {localStorage.getItem('token') ? 'Yes' : 'No'}</li>
          <li>Username: {localStorage.getItem('username') || 'None'}</li>
        </ul>
      </div>
    </div>
  );
};

export default ApiTester;