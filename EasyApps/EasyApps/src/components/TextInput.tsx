import React, { useState } from 'react';

const InputBox = ({ label, type = "text", placeholder = "" }) => {
  const [isFocused, setIsFocused] = useState(false);
  const [hasValue, setHasValue] = useState(false);

  return (
    <div className="relative mb-8">
      <input
        type={type}
        placeholder={placeholder}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          setIsFocused(false);
          setHasValue(e.target.value !== '');
        }}
        onChange={(e) => setHasValue(e.target.value !== '')}
        className={`
          w-full px-5 py-4 bg-emerald-950/30 
          border-2 rounded-xl
          text-lime-50 text-base
          outline-none
          transition-all duration-300 ease-out
          placeholder:text-emerald-400/40
          ${isFocused 
            ? 'border-lime-400 shadow-lg shadow-lime-400/20 bg-emerald-950/50' 
            : hasValue
              ? 'border-emerald-500 bg-emerald-950/40'
              : 'border-emerald-700/50 hover:border-emerald-600'
          }
        `}
      />
      
      <label 
        className={`
          absolute left-5 pointer-events-none
          transition-all duration-300 ease-out
          ${isFocused || hasValue
            ? '-top-3 text-xs px-2 bg-gradient-to-r from-emerald-900 to-emerald-950'
            : 'top-4 text-base'
          }
          ${isFocused 
            ? 'text-lime-400 font-medium' 
            : hasValue 
              ? 'text-emerald-400'
              : 'text-emerald-500/70'
          }
        `}
      >
        {label}
      </label>

      {/* Animated underline */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden rounded-full">
        <div 
          className={`
            h-full bg-gradient-to-r from-lime-400 via-yellow-400 to-lime-400
            transition-transform duration-500 ease-out
            ${isFocused ? 'translate-x-0' : '-translate-x-full'}
          `}
        />
      </div>

      {/* Glow effect */}
      {isFocused && (
        <div className="absolute inset-0 -z-10 blur-xl opacity-30 bg-gradient-to-r from-lime-400 to-yellow-400 rounded-xl animate-pulse" />
      )}
    </div>
  );
};


export default InputBox
