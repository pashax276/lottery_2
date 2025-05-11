import React, { useState, useEffect, createContext, useContext } from 'react';
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
import CheckNumbers from './components/CheckNumbers'; // Added import
import Login from './components/Login';
import Logo from './components/Logo';
import { getCurrentUser, isAuthenticated, logout } from './lib/api';
import { User, LogOut } from 'lucide-react';

console.log('[App] Starting application...');
console.log('[App] Current URL:', window.location.href);
console.log('[App] API_URL from env:', import.meta.env.VITE_API_URL);

interface UserContextType {
  user: { id: number; username: string; is_admin: boolean } | null;
  setUser: React.Dispatch<React.SetStateAction<{ id: number; username: string; is_admin: boolean } | null>>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

function ProtectedRoute({ children, adminOnly }: { children: React.ReactNode; adminOnly?: boolean }) {
  const location = useLocation();
  const { user } = useUser();
  
  if (!isAuthenticated()) {
    console.log('[ProtectedRoute] Not authenticated, redirecting to /login');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  if (adminOnly && (!user || !user.is_admin)) {
    console.log('[ProtectedRoute] Not admin, redirecting to /check-numbers');
    return <Navigate to="/check-numbers" replace />;
  }
  
  return <>{children}</>;
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<{ id: number; username: string; is_admin: boolean } | null>(null);

  useEffect(() => {
    console.log('[AppContent] Location changed:', location.pathname);
    if (isAuthenticated()) {
      try {
        const currentUser = getCurrentUser();
        console.log('[AppContent] Current user from getCurrentUser:', currentUser);
        if (currentUser) {
          fetch('/api/auth/me', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
              'Content-Type': 'application/json',
            },
          })
            .then(response => {
              if (!response.ok) {
                throw new Error('Failed to fetch user data');
              }
              return response.json();
            })
            .then(data => {
              setUser({ id: data.id, username: data.username, is_admin: data.is_admin });
            })
            .catch(error => {
              console.error('[AppContent] Error fetching user data:', error);
              logout();
              setUser(null);
              navigate('/login');
            });
        }
      } catch (error) {
        console.error('[AppContent] Error getting current user:', error);
        logout();
        setUser(null);
        navigate('/login');
      }
    } else {
      setUser(null);
    }
  }, [location.pathname, navigate]);

  const handleLogin = (token: string, userId: number, username: string, isAdmin: boolean) => {
    console.log('[AppContent] handleLogin called with:', { token, userId, username, isAdmin });
    localStorage.setItem('token', token);
    localStorage.setItem('user_id', userId.toString());
    localStorage.setItem('username', username);
    localStorage.setItem('is_admin', isAdmin.toString());
    setUser({ id: userId, username, is_admin: isAdmin });
    const from = location.state?.from?.pathname || (isAdmin ? '/' : '/check-numbers');
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
      case 'check-numbers':
        navigate('/check-numbers');
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
      case '/check-numbers':
        return 'check-numbers';
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
    <UserContext.Provider value={{ user, setUser }}>
      <div className="min-h-screen bg-gray-50">
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
              includeDrawManagement={user.is_admin}
            />
          </>
        )}
        <main className={user ? "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" : ""}>
          <Routes>
            <Route path="/login" element={
              isAuthenticated() ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />
            } />
            <Route path="/" element={
              <ProtectedRoute adminOnly>
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
              <ProtectedRoute adminOnly>
                <History />
              </ProtectedRoute>
            } />
            <Route path="/draw-management" element={
              <ProtectedRoute adminOnly>
                <DrawManagement />
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } />
            <Route path="/check-numbers" element={
              <ProtectedRoute>
                <CheckNumbers />
              </ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </UserContext.Provider>
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