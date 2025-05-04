// src/components/Dashboard.tsx
import React, { useState, useEffect } from 'react';
import { ArrowUpRight, TrendingUp, Users, DollarSign, AlertCircle } from 'lucide-react';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';
import ApiDebug from './ApiDebug';


const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draws, setDraws] = useState<any[]>([]);

  useEffect(() => {
    const fetchDraws = async () => {
      console.log('[Dashboard] Starting fetch...');
      try {
        // Direct fetch instead of using API module
        const response = await fetch('/api/draws?limit=10');
        console.log('[Dashboard] Response:', response);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('[Dashboard] Data:', data);
        
        if (data && data.draws) {
          setDraws(data.draws);
        }
      } catch (err) {
        console.error('[Dashboard] Error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDraws();
  }, []);

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 text-red-700 rounded">
        <h2>Error: {error}</h2>
        <p>Check console for details</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1>Dashboard</h1>
      <p>Draws loaded: {draws.length}</p>
      <pre>{JSON.stringify(draws, null, 2)}</pre>
    </div>
  );


  console.log('[Dashboard] Component rendering');
  
  // Add ApiDebug component here for debugging
  return (
    <div className="space-y-6">
      <ApiDebug />
      
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner size={50} />
        </div>
      ) : error ? (
        <div className="bg-red-50 p-6 rounded-lg shadow-sm">
          {/* ... existing error UI ... */}
        </div>
      ) : (
        <div className="space-y-6">
          {/* ... rest of dashboard UI ... */}
        </div>
      )}
    </div>
  );
};

export default Dashboard;