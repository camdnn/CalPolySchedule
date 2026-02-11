import { useState, useEffect } from "react";
import type { Term } from "../utils/termHelper.ts";
import type { ScheduleRowProps, DashboardProps, CourseProps, ApiTermRowProps  } from "../props/CaldendarProps.ts";

// conversions for weekdays to singe characters
// (what database expects)
const DAY_TO_CODE: Record<string, string> = {
  Monday: "M",
  Tuesday: "T",
  Wednesday: "W",
  Thursday: "R",
  Friday: "F",
};


async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}


export default function Dashboard({ isVisible }: DashboardProps) {
  const [selectedTerm, setSelectedTerm] = useState<Term | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [courses, setCourses] = useState<CourseProps[]>([]);
  const [currentCourse, setCurrentCourse] = useState("");
  const [minRating, setMinRating] = useState(3.5);
  const [timeRangeStart, setTimeRangeStart] = useState("08:00");
  const [timeRangeEnd, setTimeRangeEnd] = useState("17:00");
  const [preferredDays, setPreferredDays] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  useEffect(() => {
    const loadTerms = async () => {
      try {
        // Load ONLY terms that exist in DB
        const rows = await fetchJson<ApiTermRowProps[]>("/api/terms");

        // maps the term code and name in a terms array
        const mapped: Term[] = rows.map((r) => ({
          code: r.term_code,
          display: r.term_name,
        }));

        setTerms(mapped);
        setSelectedTerm(mapped[0] ?? null);
      } catch (e) {
        console.error("Failed to load terms:", e);
        setTerms([]);
        setSelectedTerm(null);
      }
    };
    loadTerms();
  }, []);

  const handleGenerateSchedule = async () => {
    if (!selectedTerm || courses.length === 0) return;

    setIsGenerating(true);

    try {
      const coursesParam = courses.map((c) => c.number).join(",");

      const params = new URLSearchParams({
        term: selectedTerm.code,
        courses: coursesParam,
        minRating: String(minRating),
        startTime: timeRangeStart,
        endTime: timeRangeEnd,
      });

      // Only include `days` if user chose some
      if (preferredDays.length > 0) {
        const dayCodes = preferredDays
          .map((d) => DAY_TO_CODE[d])
          .filter(Boolean)
          .join(",");
        if (dayCodes) params.set("days", dayCodes);
      }

      const url = `/api/schedule?${params.toString()}`;

      const scheduleRows = await fetchJson<ScheduleRowProps[]>(url);

      console.log("Schedule results:", scheduleRows);

      // TODO: store in state + render results
      // setSchedule(scheduleRows);
    } catch (e) {
      console.error("Failed to generate schedule:", e);
    } finally {
      setIsGenerating(false);
    }
  };


  const addCourse = () => {
    if (currentCourse.trim()) {
      setCourses([
        ...courses,
        {
          id: Date.now().toString(),
          number: currentCourse.toUpperCase().trim(),
        },
      ]);
      setCurrentCourse("");
    }
  };

  const removeCourse = (id: string) => {
    setCourses(courses.filter((course) => course.id !== id));
  };

  const toggleDay = (day: string) => {
    setPreferredDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  

  return (
    <div
      className={`
        w-full max-w-4xl
        transition-all duration-500 ease-in-out delay-300
        ${isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95 absolute pointer-events-none"}
      `}
    >
      <div className="bg-emerald-900/20 backdrop-blur-sm p-8 rounded-2xl border border-emerald-700/30 shadow-2xl">
        <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-lime-400 to-yellow-400 mb-2 text-center">
          Schedule Builder
        </h2>
        <p className="text-lime-300/80 text-center mb-8 text-sm">
          Powered by PolyRatings data
        </p>

        {/* Term Selection */}
        <div className="mb-8">
          <label className="block text-lime-400 font-medium mb-3 text-lg">
            Select Term
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {terms.map((term) => (
              <button
                key={term.code}
                onClick={() => setSelectedTerm(term)}
                className={`
                  px-4 py-3 rounded-xl font-medium
                  transition-all duration-300
                  cursor-pointer
                  ${
                    selectedTerm === term
                      ? "bg-gradient-to-r from-lime-500 to-yellow-500 text-emerald-950 shadow-lg shadow-lime-400/30"
                      : "bg-emerald-950/30 text-emerald-400 border-2 border-emerald-700/50 hover:border-emerald-600"
                  }
                `}
              >
                {term.display}
              </button>
            ))}
          </div>
        </div>

        {/* Course Input */}
        <div className="mb-8">
          <label className="block text-lime-400 font-medium mb-3 text-lg">
            Course Numbers
          </label>
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              value={currentCourse}
              onChange={(e) => setCurrentCourse(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addCourse()}
              placeholder="e.g., CSC 101, MATH 141"
              className="
                flex-1 px-5 py-3 bg-emerald-950/30 
                border-2 border-emerald-700/50 rounded-xl
                text-lime-50 text-base
                outline-none
                transition-all duration-300
                focus:border-lime-400 focus:shadow-lg focus:shadow-lime-400/20
                placeholder:text-emerald-400/40
              "
            />
            <button
              onClick={addCourse}
              className="
                px-6 py-3 bg-gradient-to-r from-lime-500 to-yellow-500
                hover:from-lime-400 hover:to-yellow-400
                text-emerald-950 font-semibold
                rounded-xl transition-all duration-300
                hover:shadow-lg hover:shadow-lime-400/30
              "
            >
              Add
            </button>
          </div>

          {/* Course List */}
          <div className="flex flex-wrap gap-2">
            {courses.map((course) => (
              <div
                key={course.id}
                className="
                  flex items-center gap-2 px-4 py-2 
                  bg-emerald-800/40 border border-emerald-600/50
                  rounded-lg text-lime-300
                "
              >
                <span className="font-medium">{course.number}</span>
                <button
                  onClick={() => removeCourse(course.id)}
                  className="
                    text-red-400 hover:text-red-300 
                    transition-colors ml-1
                  "
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          {courses.length === 0 && (
            <p className="text-emerald-500/60 text-sm mt-2">
              No courses added yet. Add courses like "CSC 101" or "MATH 141"
            </p>
          )}
        </div>

        {/* Rating Filter */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-3">
            <label className="text-lime-400 font-medium text-lg">
              Minimum Teacher Rating
            </label>
            <span className="text-yellow-400 font-bold text-xl">
              {minRating.toFixed(1)} / 5.0
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            step="0.1"
            value={minRating}
            onChange={(e) => setMinRating(Number(e.target.value))}
            className="w-full h-3 appearance-none bg-emerald-950/50 rounded-full outline-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, 
                rgb(239 68 68) 0%, 
                rgb(250 204 21) ${((minRating - 1) / 4) * 50}%, 
                rgb(132 204 22) ${((minRating - 1) / 4) * 100}%, 
                rgb(15 41 30 / 0.5) ${((minRating - 1) / 4) * 100}%)`,
            }}
          />
          <div className="flex justify-between mt-2 text-emerald-500 text-sm">
            <span>1.0 (Any)</span>
            <span>5.0 (Excellent)</span>
          </div>
          <p className="text-emerald-400/70 text-sm mt-2">
            Only use professors around the ratings of {minRating.toFixed(1)} or
            higher
          </p>
        </div>

        {/* Time Range */}
        <div className="mb-8">
          <label className="block text-lime-400 font-medium mb-3 text-lg">
            Preferred Time Range
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-emerald-400 text-sm mb-2">
                Start Time
              </label>
              <input
                type="time"
                value={timeRangeStart}
                onChange={(e) => setTimeRangeStart(e.target.value)}
                className="
                  w-full px-4 py-3 bg-emerald-950/30 
                  border-2 border-emerald-700/50 rounded-xl
                  text-lime-50 text-base
                  outline-none
                  transition-all duration-300
                  focus:border-lime-400
                "
              />
            </div>
            <div>
              <label className="block text-emerald-400 text-sm mb-2">
                End Time
              </label>
              <input
                type="time"
                value={timeRangeEnd}
                onChange={(e) => setTimeRangeEnd(e.target.value)}
                className="
                  w-full px-4 py-3 bg-emerald-950/30 
                  border-2 border-emerald-700/50 rounded-xl
                  text-lime-50 text-base
                  outline-none
                  transition-all duration-300
                  focus:border-lime-400
                "
              />
            </div>
          </div>
        </div>

        {/* Preferred Days */}
        <div className="mb-8">
          <label className="block text-lime-400 font-medium mb-3 text-lg">
            Preferred Days (Optional)
          </label>
          <div className="flex flex-wrap gap-3">
            {days.map((day) => (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                className={`
                  cursor-pointer
                  px-5 py-2.5 rounded-xl font-medium
                  transition-all duration-300
                  ${
                    preferredDays.includes(day)
                      ? "bg-gradient-to-r from-lime-500 to-yellow-500 text-emerald-950"
                      : "bg-emerald-950/30 text-emerald-400 border-2 border-emerald-700/50 hover:border-emerald-600"
                  }
                `}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
          {preferredDays.length === 0 && (
            <p className="text-emerald-500/60 text-sm mt-2">
              No preference selected - will show all available days
            </p>
          )}
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerateSchedule}
          disabled={!selectedTerm || courses.length === 0 || isGenerating}
          className={`
            w-full px-6 py-4 
            font-semibold text-lg rounded-xl
            transition-all duration-300
            ${
              !selectedTerm || courses.length === 0 || isGenerating
                ? "bg-emerald-800/30 text-emerald-600 cursor-not-allowed"
                : "bg-gradient-to-r from-lime-500 to-yellow-500 hover:from-lime-400 hover:to-yellow-400 cursor-pointer text-emerald-950 hover:shadow-xl hover:shadow-lime-400/30 hover:scale-[1.02] active:scale-[0.98]"
            }
          `}
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-emerald-950/30 border-t-emerald-950 rounded-full animate-spin"></div>
              Generating Schedules...
            </span>
          ) : (
            "Generate Optimal Schedules"
          )}
        </button>

        {(!selectedTerm || courses.length === 0) && (
          <p className="text-yellow-400/80 text-sm text-center mt-3">
            Please select a term and add at least one course
          </p>
        )}
      </div>

      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #facc15, #84cc16);
          cursor: pointer;
          box-shadow: 0 0 20px rgba(250, 204, 21, 0.6);
          transition: all 0.3s ease;
        }

        .slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 30px rgba(250, 204, 21, 0.8);
        }

        .slider::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #facc15, #84cc16);
          cursor: pointer;
          border: none;
          box-shadow: 0 0 20px rgba(250, 204, 21, 0.6);
          transition: all 0.3s ease;
        }

        .slider::-moz-range-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 30px rgba(250, 204, 21, 0.8);
        }
      `}</style>
    </div>
  );
}
