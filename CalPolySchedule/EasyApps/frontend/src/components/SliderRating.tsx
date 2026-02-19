import { useState } from 'react'

const SliderRating = ({ label, min = 0, max = 100, value, onChange }: {
  label: string;
  min?: number;
  max?: number;
  value: number;
  onChange: (val: number) => void;
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const getGradientColor = () => {
    const percent = (value / max) * 100;
    if (percent < 33) return 'from-emerald-500 to-lime-500';
    if (percent < 66) return 'from-lime-500 to-yellow-400';
    return 'from-yellow-400 to-yellow-500';
  };

  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-4">
        <label className="text-lime-400 font-medium text-lg">
          {label}
        </label>
        <span className="text-yellow-400 font-bold text-2xl">
          {value}
        </span>
      </div>

      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          className="w-full h-3 appearance-none bg-emerald-950/50 rounded-full outline-none cursor-pointer slider"
          style={{
            background: `linear-gradient(to right,
              rgb(16 185 129) 0%,
              rgb(132 204 22) ${(value/max)*50}%,
              rgb(250 204 21) ${(value/max)*100}%,
              rgb(15 41 30 / 0.5) ${(value/max)*100}%)`
          }}
        />

        {isDragging && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 animate-bounce">
            <div className={`px-4 py-2 rounded-lg bg-gradient-to-r ${getGradientColor()} text-emerald-950 font-bold shadow-lg`}>
              {value}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between mt-2 text-emerald-500 text-sm">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
};

export default SliderRating
