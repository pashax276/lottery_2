import React, { useState, useEffect } from 'react';
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<{ id: number; username: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [authRedirectRequired, setAuthRedirectRequired] = useState(false);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = () => {
      const isAuth = isAuthenticated();
      setAuthenticated(isAuth);
      
      if (isAuth) {
        setUser(getCurrentUser());
      }
      
      setLoading(false);
    };
    
    checkAuth();
  }, []);

  // Handle tab change
  const handleTabChange = (tab: string) => {
    // If we got redirected to login due to auth error, remember the tab
    if (authRedirectRequired) {
      localStorage.setItem('lastActiveTab', tab);
    }
    setActiveTab(tab);
  };

  const handleLogin = (token: string, userId: number, username: string) => {
    setAuthenticated(true);
    setUser({ id: userId, username });
    setAuthRedirectRequired(false);
    
    // Check if we have a stored tab to navigate back to
    const lastTab = localStorage.getItem('lastActiveTab');
    if (lastTab) {
      setActiveTab(lastTab);
      localStorage.removeItem('lastActiveTab');
    } else {
      setActiveTab('dashboard'); // Default to dashboard
    }
    
    showToast.success('Logged in successfully');
  };

  const handleLogout = () => {
    logout();
    setAuthenticated(false);
    setUser(null);
    setActiveTab('dashboard');
    showToast.success('Logged out successfully');
  };

  // Handle auth errors
  const handleAuthError = () => {
    // Remember current tab for after login
    localStorage.setItem('lastActiveTab', activeTab);
    setAuthRedirectRequired(true);
    setAuthenticated(false);
    setUser(null);
    showToast.error('Your session has expired. Please log in again.');
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      );
    }

    if (!authenticated) {
      return <Login onLogin={handleLogin} />;
    }

    // Provide the handleAuthError function to all components
    const commonProps = { onAuthError: handleAuthError };

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard {...commonProps} />;
      case 'predictions':
        return <Predictions {...commonProps} />;
      case 'analysis':
        return <Analysis {...commonProps} />;
      case 'history':
        return <History {...commonProps} />;
      case 'settings':
        return <Settings {...commonProps} />;
      case 'draw-management':
        return <DrawManagement {...commonProps} />;
      default:
        return <Dashboard {...commonProps} />;
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <div className="min-h-screen bg-gray-50">
          {authenticated && (
            <>
              <header className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Logo size={32} />
                      <h1 className="text-2xl font-bold text-gray-900">Powerball Analyzer</h1>
                    </div>
                    
                    {user && (
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
                    )}
                  </div>
                </div>
              </header>

              <Navigation 
                activeTab={activeTab} 
                onTabChange={handleTabChange} 
                includeDrawManagement={true}
              />
            </>
          )}

          <main className={authenticated ? "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" : ""}>
            {renderContent()}
          </main>
        </div>
        <Toast />
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;