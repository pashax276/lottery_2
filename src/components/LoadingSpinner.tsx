import React from 'react';

interface LoadingSpinnerProps {
  size?: number;
  color?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 40, 
  color = '#3498db' 
}) => {
  return (
    <div className="relative">
      <div 
        className="absolute animate-ping"
        style={{ 
          width: size, 
          height: size,
          borderRadius: '50%',
          backgroundColor: color,
          opacity: 0.2
        }}
      />
      <div 
        className="relative"
        style={{ 
          width: size, 
          height: size,
          borderRadius: '50%',
          border: `4px solid ${color}`,
          borderTopColor: 'transparent',
          animation: 'spin 1s linear infinite'
        }}
      >
        <style jsx>{`
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    </div>
  );
};

export default LoadingSpinner;