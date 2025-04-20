import React from 'react';

interface NumberBallProps {
  number: number;
  isPowerball?: boolean;
  size?: number;
  highlighted?: boolean;
  matched?: boolean;
  sx?: React.CSSProperties;
}

const NumberBall: React.FC<NumberBallProps> = ({ 
  number, 
  isPowerball = false, 
  size = 40,
  highlighted = false,
  matched = false,
  sx = {}
}) => {
  // Check if number is valid (not undefined, null, NaN, etc.)
  const isValidNumber = number !== undefined && number !== null && !isNaN(number) && number > 0;
  
  const baseStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: `${size * 0.4}px`,
    fontWeight: 'bold',
    color: '#fff',
    transition: 'all 0.2s ease',
    ...sx
  };

  const getBackgroundColor = () => {
    if (!isValidNumber) return '#ccc'; // Gray color for invalid numbers
    if (matched) return '#FFD700';
    if (highlighted) return '#4CAF50';
    return isPowerball ? '#e74c3c' : '#3498db';
  };

  return (
    <div
      style={{
        ...baseStyle,
        backgroundColor: getBackgroundColor(),
        boxShadow: highlighted ? '0 0 10px rgba(76, 175, 80, 0.5)' : 'none'
      }}
    >
      {isValidNumber ? number : '?'}
    </div>
  );
};

export default NumberBall;