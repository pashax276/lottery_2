// src/components/ui/tabs.tsx
// Basic tabs component implementation (shadcn/ui-inspired)

import * as React from 'react';

const TabsContext = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
} | null>(null);

const Tabs = ({ 
  children, 
  defaultValue, 
  onValueChange, 
  className = "" 
}: { 
  children: React.ReactNode; 
  defaultValue: string;
  onValueChange?: (value: string) => void;
  className?: string;
}) => {
  const [value, setValue] = React.useState(defaultValue);

  const handleValueChange = React.useCallback((newValue: string) => {
    setValue(newValue);
    onValueChange?.(newValue);
  }, [onValueChange]);

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
};

const TabsList = ({ 
  children, 
  className = "" 
}: { 
  children: React.ReactNode; 
  className?: string;
}) => {
  return (
    <div role="tablist" className={`flex p-1 bg-gray-100 rounded-lg ${className}`}>
      {children}
    </div>
  );
};

const TabsTrigger = ({ 
  children, 
  value, 
  className = "" 
}: { 
  children: React.ReactNode; 
  value: string;
  className?: string;
}) => {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsTrigger must be used within Tabs");

  const { value: selectedValue, onValueChange } = context;
  const isSelected = selectedValue === value;

  return (
    <button
      role="tab"
      aria-selected={isSelected}
      data-state={isSelected ? "active" : "inactive"}
      onClick={() => onValueChange(value)}
      className={`px-3 py-2 text-sm font-medium rounded-md transition-all ${
        isSelected 
          ? "bg-white text-blue-600 shadow-sm" 
          : "text-gray-600 hover:text-gray-900"
      } ${className}`}
    >
      {children}
    </button>
  );
};

const TabsContent = ({ 
  children, 
  value, 
  className = "" 
}: { 
  children: React.ReactNode; 
  value: string;
  className?: string;
}) => {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsContent must be used within Tabs");

  const { value: selectedValue } = context;
  const isSelected = selectedValue === value;

  if (!isSelected) return null;

  return (
    <div
      role="tabpanel"
      data-state={isSelected ? "active" : "inactive"}
      className={className}
    >
      {children}
    </div>
  );
};

export { Tabs, TabsList, TabsTrigger, TabsContent };

// src/components/Navigation.tsx (Updated)
import React from 'react';
import { Activity, BarChart3, Brain, ClockIcon, Home, Settings as SettingsIcon, Database } from 'lucide-react';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  includeDrawManagement?: boolean;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange, includeDrawManagement = false }) => {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'predictions', label: 'Predictions', icon: Brain },
    { id: 'analysis', label: 'Analysis', icon: BarChart3 },
    { id: 'history', label: 'History', icon: ClockIcon },
  ];

  // Add Draw Management tab if requested
  if (includeDrawManagement) {
    tabs.push({ id: 'draw-management', label: 'Draw Management', icon: Database });
  }

  // Always add Settings tab at the end
  tabs.push({ id: 'settings', label: 'Settings', icon: SettingsIcon });

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-8 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 text-sm font-medium whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default Navigation;