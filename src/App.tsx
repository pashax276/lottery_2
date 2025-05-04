import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toast } from './components/Toast';
import { showToast } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import Predictions from './components/Predictions';
import Analysis from './components/Analysis';
import History from './components/History';
import Settings from './components/Settings';
import DrawManagement from './components/DrawManagement';
import Login from './components/Login';
import Logo from './components/Logo';
import { getCurrentUser, isAuthenticated, logout } from './lib/api';
import { User, LogOut } from 'lucide-react';

// Debug check
console.log('[App] Starting application...');
console.log('[App] Current URL:', window.location.href);
console.log('[App] API_URL from env:', import.meta.env.VITE_API_URL);

// Create a debug component to test imports
const DebugImports = () => {
  useEffect(() => {
    console.log('[DebugImports] Testing imports...');
    
    // Test API module
    try {
      // Using require instead of ES6 import to see if it makes a difference
      const api = require('./lib/api');
      console.log('[DebugImports] API module loaded:', api);
      console.log('[DebugImports] API functions:', Object.keys(api));
      
      // Check if specific functions exist
      console.log('[DebugImports] getDraws exists:', typeof api.getDraws);
      console.log('[DebugImports] getPredictions exists:', typeof api.getPredictions);
      
      // Try calling a function
      if (typeof api.getDraws === 'function') {
        console.log('[DebugImports] Attempting to call getDraws...');
        api.getDraws(1, 0).then(result => {
          console.log('[DebugImports] getDraws successful:', result);
        }).catch(error => {
          console.error('[DebugImports] getDraws failed:', error);
        });
      } else {
        console.error('[DebugImports] getDraws is not a function');
      }
    } catch (error) {
      console.error('[DebugImports] Failed to load API module:', error);
    }
    
    // Test data utils
    try {
      const dataUtils = require('./utils/dataUtils');
      console.log('[DebugImports] Data utils loaded:', dataUtils);
      console.log('[DebugImports] Data utils functions:', Object.keys(dataUtils));
    } catch (error) {
      console.error('[DebugImports] Failed to load data utils:', error);
    }
    
    // Test direct fetch
    console.log('[DebugImports] Testing direct fetch...');
    fetch('/api/health')
      .then(response => {
        console.log('[DebugImports] Direct fetch /api/health status:', response.status);
        return response.json();
      })
      .then(data => {
        console.log('[DebugImports] Direct fetch /api/health data:', data);
      })
      .catch(error => {
        console.error('[DebugImports] Direct fetch failed:', error);
      });
      
    // Test draws endpoint
    fetch('/api/draws?limit=1')
      .then(response => {
        console.log('[DebugImports] Direct fetch /api/draws status:', response.status);
        return response.json();
      })
      .then(data => {
        console.log('[DebugImports] Direct fetch /api/draws data:', data);
      })
      .catch(error => {
        console.error('[DebugImports] Direct fetch /api/draws failed:', error);
      });
  }, []);
  
  return null;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  
  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return <>{children}</>;
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<{ id: number; username: string } | null>(null);

  useEffect(() => {
    console.log('[AppContent] Location changed:', location.pathname);
    if (isAuthenticated()) {
      const currentUser = getCurrentUser();
      console.log('[AppContent] Current user:', currentUser);
      setUser(currentUser);
    }
  }, [location]);

  const handleLogin = (token: string, userId: number, username: string) => {
    console.log('[AppContent] handleLogin called with:', { token, userId, username });
    setUser({ id: userId, username });
    const from = location.state?.from?.pathname || '/';
    console.log('[AppContent] Navigating to:', from);
    navigate(from);
    showToast.success('Logged in successfully');
  };

  const handleLogout = () => {
    console.log('[AppContent] handleLogout called');
    logout();
    setUser(null);
    navigate('/login');
    showToast.success('Logged out successfully');
  };

  const handleTabChange = (tab: string) => {
    console.log('[AppContent] Tab change to:', tab);
    switch (tab) {
      case 'dashboard':
        navigate('/');
        break;
      case 'predictions':
        navigate('/predictions');
        break;
      case 'analysis':
        navigate('/analysis');
        break;
      case 'history':
        navigate('/history');
        break;
      case 'draw-management':
        navigate('/draw-management');
        break;
      case 'settings':
        navigate('/settings');
        break;
      default:
        navigate('/');
    }
  };

  const getActiveTab = () => {
    const path = location.pathname;
    console.log('[AppContent] Getting active tab for path:', path);
    switch (path) {
      case '/':
        return 'dashboard';
      case '/predictions':
        return 'predictions';
      case '/analysis':
        return 'analysis';
      case '/history':
        return 'history';
      case '/draw-management':
        return 'draw-management';
      case '/settings':
        return 'settings';
      default:
        return 'dashboard';
    }
  };

  console.log('[AppContent] Rendering with user:', user);

  return (
    <div className="min-h-screen bg-gray-50">
      <DebugImports />
      {user && (
        <>
          <header className="bg-white shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Logo size={32} />
                  <h1 className="text-2xl font-bold text-gray-900">Powerball Analyzer</h1>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2 px-3 py-2">
                    <User className="h-5 w-5 text-gray-600" />
                    <span className="text-sm font-medium">{user.username}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-2 px-3 py-2 rounded-md text-red-600 hover:bg-red-50"
                    title="Sign out"
                  >
                    <LogOut className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </header>

          <Navigation 
            activeTab={getActiveTab()} 
            onTabChange={handleTabChange} 
            includeDrawManagement={true}
          />
        </>
      )}

      <main className={user ? "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" : ""}>
        <Routes>
          <Route path="/login" element={
            isAuthenticated() ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />
          } />
          
          <Route path="/" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/predictions" element={
            <ProtectedRoute>
              <Predictions />
            </ProtectedRoute>
          } />
          
          <Route path="/analysis" element={
            <ProtectedRoute>
              <Analysis />
            </ProtectedRoute>
          } />
          
          <Route path="/history" element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          } />
          
          <Route path="/draw-management" element={
            <ProtectedRoute>
              <DrawManagement />
            </ProtectedRoute>
          } />
          
          <Route path="/settings" element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          } />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  console.log('[App] Rendering main App component');
  
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <BrowserRouter>
          <AppContent />
          <Toast />
        </BrowserRouter>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;