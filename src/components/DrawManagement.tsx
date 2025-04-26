// src/components/DrawManagement.tsx
import React, { useState } from 'react';
import { Database, FileUp, List, Search, RefreshCw } from 'lucide-react';
import AddDraw from './AddDraw';
import BatchAddDraw from './BatchAddDraw';
import EnhancedFileUpload from './EnhancedFileUpload';
import CheckNumbers from './CheckNumbers';
import { showToast } from './Toast';

// Define API URL directly if environment variable isn't working
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const DrawManagement = () => {
  const [activeTab, setActiveTab] = useState('add-draw');
  
  // State for manual scraper
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleScrape = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      console.log("Using API URL:", API_URL);
      console.log("Scraping API at:", `${API_URL}/api/scrape/latest`);
      
      const response = await fetch(`${API_URL}/api/scrape/latest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to scrape data: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setSuccess('Successfully scraped latest Powerball data');
        showToast.success('Successfully scraped latest Powerball data');
      } else {
        throw new Error(result.error || 'Failed to scrape data');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      showToast.error(errorMessage);
      console.error("Scraping error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Draw Management</h2>
        
        {/* Tabs navigation */}
        <div className="mb-6">
          <div className="flex border-b border-gray-200 overflow-x-auto">
            <button
              onClick={() => setActiveTab('add-draw')}
              className={`flex items-center px-4 py-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'add-draw'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Database className="mr-2 h-4 w-4" />
              Add Draw
            </button>

            <button
              onClick={() => setActiveTab('batch-add')}
              className={`flex items-center px-4 py-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'batch-add'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <List className="mr-2 h-4 w-4" />
              Batch Add
            </button>

            <button
              onClick={() => setActiveTab('file-upload')}
              className={`flex items-center px-4 py-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'file-upload'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileUp className="mr-2 h-4 w-4" />
              File Upload
            </button>

            <button
              onClick={() => setActiveTab('check-numbers')}
              className={`flex items-center px-4 py-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'check-numbers'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Search className="mr-2 h-4 w-4" />
              Check Numbers
            </button>
            
            <button
              onClick={() => setActiveTab('manual-scraper')}
              className={`flex items-center px-4 py-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'manual-scraper'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Manual Scraper
            </button>
          </div>
        </div>
        
        {/* Tab content */}
        {activeTab === 'add-draw' && <AddDraw />}
        {activeTab === 'batch-add' && <BatchAddDraw />}
        {activeTab === 'file-upload' && <EnhancedFileUpload />}
        {activeTab === 'check-numbers' && <CheckNumbers />}
        {activeTab === 'manual-scraper' && (
          <div className="bg-white rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Manual Scraper</h2>
              <RefreshCw className="h-5 w-5 text-blue-600" />
            </div>

            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Manually trigger the scraper to fetch the latest Powerball results.
              </p>

              <button
                onClick={handleScrape}
                disabled={loading}
                className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <RefreshCw className="animate-spin h-4 w-4 mr-2" />
                    Scraping...
                  </span>
                ) : (
                  'Scrape Latest Results'
                )}
              </button>

              {error && (
                <div className="text-red-600 text-sm">{error}</div>
              )}

              {success && (
                <div className="text-green-600 text-sm">{success}</div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default DrawManagement;