import React from 'react';
import { BarChart3, Brain, ClockIcon, Home, Settings as SettingsIcon, Database } from 'lucide-react';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  includeDrawManagement?: boolean;
}

const Navigation: React.FC<NavigationProps> = ({ 
  activeTab, 
  onTabChange, 
  includeDrawManagement = false 
}) => {
  // Define the standard tabs
  const baseTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'predictions', label: 'Predictions', icon: Brain },
    { id: 'analysis', label: 'Analysis', icon: BarChart3 },
    { id: 'history', label: 'History', icon: ClockIcon },
  ];
  
  // Conditionally add Draw Management tab
  let tabs = [...baseTabs];
  
  if (includeDrawManagement) {
    tabs.push({ id: 'draw-management', label: 'Draw Management', icon: Database });
  }
  
  // Always add Settings tab at the end
  tabs.push({ id: 'settings', label: 'Settings', icon: SettingsIcon });

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-4 md:space-x-8 overflow-x-auto">
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