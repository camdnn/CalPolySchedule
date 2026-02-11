import React, { useState } from 'react'

const StarRating = ({ label, value, onChange }) => {
  const [hoveredValue, setHoveredValue] = useState(null);

  const stars = [1, 2, 3, 4, 5];

  return (
    <div className="mb-8">
      <label className="block text-lime-400 font-medium mb-4 text-lg">
        {label}
      </label>
      
      <div className="flex gap-2">
        {stars.map((star) => {
          const isActive = star <= (hoveredValue !== null ? hoveredValue : value);
          return (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              onMouseEnter={() => setHoveredValue(star)}
              onMouseLeave={() => setHoveredValue(null)}
              className="group transition-transform duration-200 hover:scale-125 active:scale-95"
            >
              <svg
                className={`w-12 h-12 transition-all duration-300 ${
                  isActive
                    ? 'fill-yellow-400 stroke-yellow-500 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]'
                    : 'fill-emerald-950/30 stroke-emerald-600 group-hover:fill-emerald-900/50'
                }`}
                strokeWidth="2"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </button>
          );
        })}
      </div>

      {value > 0 && (
        <p className="mt-3 text-lime-300 font-medium animate-fade-in">
          {value} star{value !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
};

export default StarRating
