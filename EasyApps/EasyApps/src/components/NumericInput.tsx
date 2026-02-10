import React, { useState } from 'react';

const NumericRating = ({ label, min = 1, max = 10, value, onChange }) => {
  const [hoveredValue, setHoveredValue] = useState(null);
  const [isFocused, setIsFocused] = useState(false);

  const numbers = Array.from({ length: max - min + 1 }, (_, i) => i + min);

  const getButtonColor = (num) => {
    const activeValue = hoveredValue !== null ? hoveredValue : value;
    
    if (num <= activeValue) {
      // Gradient from green to yellow based on rating
      const intensity = (num / max) * 100;
      if (intensity < 33) return 'bg-emerald-500 border-emerald-400';
      if (intensity < 66) return 'bg-lime-500 border-lime-400';
      return 'bg-yellow-500 border-yellow-400';
    }
    return 'bg-emerald-950/30 border-emerald-700/50';
  };

  const getButtonGlow = (num) => {
    const activeValue = hoveredValue !== null ? hoveredValue : value;
    if (num <= activeValue) {
      const intensity = (num / max) * 100;
      if (intensity < 33) return 'shadow-lg shadow-emerald-500/50';
      if (intensity < 66) return 'shadow-lg shadow-lime-500/50';
      return 'shadow-lg shadow-yellow-500/50';
    }
    return '';
  };

  return (
    <div className="mb-8">
      <label className="block text-lime-400 font-medium mb-4 text-lg">
        {label}
      </label>
      
      <div className="flex gap-2 flex-wrap">
        {numbers.map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => onChange(num)}
            onMouseEnter={() => setHoveredValue(num)}
            onMouseLeave={() => setHoveredValue(null)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={`
              w-12 h-12 rounded-xl border-2
              font-semibold text-lg
              transition-all duration-300 ease-out
              hover:scale-110 active:scale-95
              ${getButtonColor(num)}
              ${getButtonGlow(num)}
              ${num <= (hoveredValue !== null ? hoveredValue : value) 
                ? 'text-emerald-950' 
                : 'text-emerald-400 hover:text-emerald-300 hover:border-emerald-600'
              }
            `}
          >
            {num}
          </button>
        ))}
      </div>

      {value && (
        <div className="mt-4 flex items-center gap-3 animate-fade-in">
          <div className="h-2 flex-1 bg-emerald-950/50 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 via-lime-500 to-yellow-500 transition-all duration-500 ease-out rounded-full"
              style={{ width: `${(value / max) * 100}%` }}
            />
          </div>
          <span className="text-lime-400 font-bold text-xl min-w-[3rem] text-right">
            {value}/{max}
          </span>
        </div>
      )}
    </div>
  );
};

export default NumericRating
