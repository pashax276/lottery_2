import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { scrapePowerball } from '../lib/api';

const ManualScraper = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleScrape = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await scrapePowerball();
      if (result.success) {
        setSuccess('Successfully scraped latest Powerball data');
      } else {
        throw new Error(result.error || 'Failed to scrape data');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
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
  );
};

export default ManualScraper;