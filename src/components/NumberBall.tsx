import React from 'react';

interface NumberBallProps {
  number: number | string;
  isPowerball?: boolean;
  size?: number;
  highlighted?: boolean;
  matched?: boolean;
}

const NumberBall: React.FC<NumberBallProps> = ({
  number,
  isPowerball = false,
  size = 40,
  highlighted = false,
  matched = false
}) => {
  // Safely parse number
  let numericValue: number;
  if (typeof number === 'number') {
    numericValue = isNaN(number) ? 0 : number;
  } else if (typeof number === 'string') {
    numericValue = isNaN(parseInt(number)) ? 0 : parseInt(number);
  } else {
    numericValue = 0;
  }

  // Define colors for different states
  const getColors = () => {
    if (matched) {
      return {
        outer: '#FFD700',
        inner: '#FFC800',
        shadow: 'rgba(218, 165, 32, 0.6)',
        text: '#ffffff'
      };
    } else if (isPowerball) {
      return {
        outer: '#e74c3c',
        inner: '#c0392b',
        shadow: 'rgba(231, 76, 60, 0.6)',
        text: '#ffffff'
      };
    } else {
      return {
        outer: '#3498db',
        inner: '#2980b9',
        shadow: 'rgba(52, 152, 219, 0.6)',
        text: '#ffffff'
      };
    }
  };

  const colors = getColors();
  
  // Apply more highlight and glow for highlighted balls
  const outerGlow = highlighted 
    ? `0 0 12px ${colors.shadow}` 
    : 'none';
  
  // Enhanced 3D effect settings
  const ballSize = size;
  const borderWidth = Math.max(1, Math.floor(ballSize * 0.05));
  const highlightHeight = Math.floor(ballSize * 0.5); // Top half highlight
  const fontSize = Math.max(ballSize * 0.4, 14); // Larger font size for better readability
  const topGradient = 'rgba(255,255,255,0.7)';
  const bottomShadow = 'rgba(0,0,0,0.3)';

  return (
    <div
      style={{
        position: 'relative',
        width: ballSize,
        height: ballSize,
        borderRadius: '50%',
        backgroundColor: colors.outer,
        color: colors.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${fontSize}px`,
        fontWeight: 'bold',
        boxShadow: `inset 0 -${Math.ceil(ballSize * 0.15)}px ${Math.ceil(ballSize * 0.15)}px ${bottomShadow}, ${outerGlow}`,
        border: `${borderWidth}px solid rgba(255,255,255,0.3)`,
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        cursor: 'default',
        zIndex: 1
      }}
    >
      {/* 3D highlight effect - top part */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: `${highlightHeight}px`,
          borderTopLeftRadius: '50%',
          borderTopRightRadius: '50%',
          background: `linear-gradient(to bottom, ${topGradient} 0%, rgba(255,255,255,0) 100%)`,
          opacity: 0.8,
          pointerEvents: 'none',
          zIndex: 2
        }}
      />
      
      {/* Number display */}
      <div style={{ position: 'relative', zIndex: 3 }}>
        {numericValue > 0 ? numericValue : '--'}
      </div>
      
      {/* 3D shadow effect - bottom part */}
      <div 
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: `${Math.ceil(ballSize * 0.3)}px`,
          borderBottomLeftRadius: '50%',
          borderBottomRightRadius: '50%',
          background: `linear-gradient(to top, ${bottomShadow} 0%, rgba(0,0,0,0) 100%)`,
          opacity: 0.4,
          pointerEvents: 'none',
          zIndex: 2
        }}
      />
    </div>
  );
};

export default NumberBall;