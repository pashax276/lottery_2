// src/components/ApiDebug.tsx

import React, { useEffect, useState } from 'react';

const ApiDebug = () => {
  const [results, setResults] = useState<any>({});
  
  useEffect(() => {
    const runTests = async () => {
      const testResults: any = {};
      
      // Test 1: Direct fetch to health endpoint
      try {
        const healthResponse = await fetch('/api/health');
        testResults.healthFetch = {
          status: healthResponse.status,
          ok: healthResponse.ok,
          data: await healthResponse.json()
        };
      } catch (error) {
        testResults.healthFetch = { error: error.message };
      }
      
      // Test 2: Direct fetch to draws endpoint
      try {
        const drawsResponse = await fetch('/api/draws?limit=1');
        testResults.drawsFetch = {
          status: drawsResponse.status,
          ok: drawsResponse.ok,
          data: await drawsResponse.json()
        };
      } catch (error) {
        testResults.drawsFetch = { error: error.message };
      }
      
      // Test 3: Import API module
      try {
        const { getDraws } = await import('../lib/api');
        testResults.apiImport = { success: true, getDrawsType: typeof getDraws };
        
        // Test 4: Call getDraws
        try {
          const drawsData = await getDraws(1, 0);
          testResults.getDrawsCall = { success: true, data: drawsData };
        } catch (error) {
          testResults.getDrawsCall = { error: error.message, stack: error.stack };
        }
      } catch (error) {
        testResults.apiImport = { error: error.message };
      }
      
      // Test 5: Check data utils
      try {
        const dataUtils = await import('../utils/dataUtils');
        testResults.dataUtils = { 
          success: true, 
          functions: Object.keys(dataUtils) 
        };
      } catch (error) {
        testResults.dataUtils = { error: error.message };
      }
      
      setResults(testResults);
      console.log('API Debug Results:', testResults);
    };
    
    runTests();
  }, []);
  
  return (
    <div className="p-4 bg-gray-100 rounded-lg mb-4">
      <h2 className="text-lg font-bold mb-2">API Debug Results</h2>
      <pre className="bg-white p-4 rounded overflow-auto max-h-96">
        {JSON.stringify(results, null, 2)}
      </pre>
    </div>
  );
};

export default ApiDebug;