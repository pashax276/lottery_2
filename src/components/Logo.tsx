import React from 'react';
import { Activity } from 'lucide-react';

interface LogoProps {
  size?: number;
}

const Logo: React.FC<LogoProps> = ({ size = 40 }) => {
  return (
    <div className="relative inline-flex items-center justify-center">
      <div className="absolute inset-0 bg-blue-500 rounded-full opacity-20 animate-pulse" />
      <Activity 
        size={size} 
        className="text-blue-600 relative z-10 transform transition-transform hover:scale-110" 
      />
    </div>
  );
};

export default Logo;