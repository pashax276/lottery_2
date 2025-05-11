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
import CheckNumbers from './components/CheckNumbers'; 
import Login from './components/Login';
import Logo from './components/Logo';
import { getCurrentUser, isAuthenticated, logout } from './lib/api';
import { User, LogOut } from 'lucide-react';

console.log('[App] Starting application...');
console.log('[App] Current URL:', window.location.href);
console.log('[App] API_URL from env:', import.meta.env.VITE_API_URL);

// Safe toString utility to prevent "Cannot read properties of undefined (toString)" errors
const safeToString = (value: any): string => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
};

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
    
    const loadUserData = async () => {
      if (isAuthenticated()) {
        try {
          // Get basic user info from localStorage
          let userFromStorage = null;
          try {
            const currentUser = getCurrentUser();
            console.log('[AppContent] Current user from getCurrentUser:', currentUser);
            if (currentUser) {
              userFromStorage = {
                id: currentUser.id || 0,
                username: currentUser.username || 'anonymous',
                is_admin: false // Will be updated from API
              };
            }
          } catch (localStorageError) {
            console.error('[AppContent] Error reading from localStorage:', localStorageError);
          }
          
          // Get full user details from API
          const token = localStorage.getItem('token');
          if (!token) {
            throw new Error('No auth token found');
          }
          
          try {
            const response = await fetch('/api/auth/me', {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });
            
            if (!response.ok) {
              throw new Error(`Failed to fetch user data: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Set user with data from API, falling back to localStorage data if needed
            setUser({ 
              id: data.id || userFromStorage?.id || 0, 
              username: data.username || userFromStorage?.username || 'anonymous', 
              is_admin: !!data.is_admin
            });
          } catch (apiError) {
            console.error('[AppContent] Error fetching user data from API:', apiError);
            
            // If API fails but we have localStorage data, use that
            if (userFromStorage) {
              setUser(userFromStorage);
            } else {
              throw apiError; // Re-throw if we don't have fallback data
            }
          }
        } catch (error) {
          console.error('[AppContent] Error getting current user:', error);
          
          // Clear auth data and redirect to login
          logout();
          setUser(null);
          navigate('/login');
        }
      } else {
        setUser(null);
      }
    };
    
    loadUserData();
  }, [location.pathname, navigate]);

  const handleLogin = (token: string, userId: number | string, username: string, isAdmin: boolean) => {
    console.log('[AppContent] handleLogin called with:', { token, userId, username, isAdmin });
    
    // Store auth data safely
    try {
      // Ensure userId is properly stored as a string
      const userIdString = userId !== undefined && userId !== null ? safeToString(userId) : '0';
      
      localStorage.setItem('token', token || '');
      localStorage.setItem('user_id', userIdString);
      localStorage.setItem('username', username || 'anonymous');
      localStorage.setItem('is_admin', safeToString(isAdmin));
      
      // Update state
      setUser({ 
        id: typeof userId === 'string' ? parseInt(userId, 10) : (userId || 0), 
        username: username || 'anonymous', 
        is_admin: !!isAdmin 
      });
      
      // Navigate
      const from = location.state?.from?.pathname || (isAdmin ? '/' : '/check-numbers');
      console.log('[AppContent] Navigating to:', from);
      navigate(from);
      showToast.success('Logged in successfully');
    } catch (error) {
      console.error('[AppContent] Error in handleLogin:', error);
      showToast.error('Login failed: Could not store credentials');
    }
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
                      <span className="text-sm font-medium">{user.username || 'Anonymous'}</span>
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