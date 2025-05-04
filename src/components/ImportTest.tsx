// src/components/ImportTest.tsx

import React, { useEffect } from 'react';

const ImportTest = () => {
  useEffect(() => {
    console.log('[ImportTest] Component mounted');
    
    // Test API import
    try {
      const api = require('../lib/api');
      console.log('[ImportTest] API module loaded successfully');
      console.log('[ImportTest] API functions:', Object.keys(api));
      
      // Test specific functions
      console.log('[ImportTest] getDraws exists:', typeof api.getDraws === 'function');
      console.log('[ImportTest] getPredictions exists:', typeof api.getPredictions === 'function');
    } catch (error) {
      console.error('[ImportTest] Failed to import API module:', error);
    }
    
    // Test data utils import
    try {
      const dataUtils = require('../utils/dataUtils');
      console.log('[ImportTest] Data utils loaded successfully');
      console.log('[ImportTest] Data utils functions:', Object.keys(dataUtils));
    } catch (error) {
      console.error('[ImportTest] Failed to import data utils:', error);
    }
    
    // Test direct imports
    try {
      import('../lib/api').then(module => {
        console.log('[ImportTest] Dynamic import of API successful');
        console.log('[ImportTest] Module exports:', Object.keys(module));
      }).catch(error => {
        console.error('[ImportTest] Dynamic import of API failed:', error);
      });
    } catch (error) {
      console.error('[ImportTest] Failed to dynamically import API:', error);
    }
  }, []);
  
  return null;
};

export default ImportTest;