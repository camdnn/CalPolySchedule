import { useState, useEffect, useRef, useCallback } from "react";
import type { Term } from "../utils/termHelper.ts";
import type {
  ScheduleRowProps,
  CourseProps,
  ApiTermRowProps,
  GeneratedSchedule,
  BlockedSlot,
  LockedSection,
} from "../props/CaldendarProps.ts";
import ClassResultsPanel from "./ClassResultsPanel.tsx";
import GeneratedSchedulesPanel from "./GeneratedSchedulesPanel.tsx";
import WeekBlockGrid from "./WeekBlockGrid.tsx";

// ── Constants / helpers ───────────────────────────────────────────────────────
const DAY_TO_CODE: Record<string, string> = {
  Monday: "M", Tuesday: "T", Wednesday: "W", Thursday: "R", Friday: "F",
};
const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const DEFAULTS = {
  minRating:      3.5,
  timeStart:      "08:00",
  timeEnd:        "17:00",
  preferredDays:  [] as string[],
  gapPreference:  0,   // minutes; 0 = no preference / compact
  daysMode:       "balanced" as "balanced" | "minimize",
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// "08:30" → "8:30 AM"
function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

type ViewMode = "sections" | "schedules";

// ── Filter chip helpers ───────────────────────────────────────────────────────
interface Chip { label: string; onRemove: () => void }

// ── Component ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  // ── Term + courses ───────────────────────────────────────────────────────
  const [terms, setTerms]           = useState<Term[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<Term | null>(null);
  const [courses, setCourses]       = useState<CourseProps[]>([]);
  const [currentCourse, setCurrentCourse] = useState("");

  // ── Filter sliders / toggles ─────────────────────────────────────────────
  const [minRating, setMinRating]           = useState(DEFAULTS.minRating);
  const [timeStart, setTimeStart]           = useState(DEFAULTS.timeStart);
  const [timeEnd, setTimeEnd]               = useState(DEFAULTS.timeEnd);
  const [preferredDays, setPreferredDays]   = useState<string[]>(DEFAULTS.preferredDays);
  const [gapPreference, setGapPreference]   = useState(DEFAULTS.gapPreference);
  const [daysMode, setDaysMode]             = useState<"balanced" | "minimize">(DEFAULTS.daysMode);

  // ── Block grid ───────────────────────────────────────────────────────────
  const [blockedSlots, setBlockedSlots]     = useState<BlockedSlot[]>([]);
  const [showBlockGrid, setShowBlockGrid]   = useState(false);

  // ── Locked sections ──────────────────────────────────────────────────────
  const [lockedSections, setLockedSections] = useState<LockedSection[]>([]);

  // ── Results state ────────────────────────────────────────────────────────
  const [sections, setSections]             = useState<ScheduleRowProps[]>([]);
  const [hasSearched, setHasSearched]       = useState(false);
  const [isSearching, setIsSearching]       = useState(false);

  const [generatedSchedules, setGeneratedSchedules] = useState<GeneratedSchedule[]>([]);
  const [hasGenerated, setHasGenerated]             = useState(false);
  const [isGenerating, setIsGenerating]             = useState(false);
  const [progressCount, setProgressCount]           = useState(0);

  const [viewMode, setViewMode] = useState<ViewMode>("sections");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load terms on mount
  useEffect(() => {
    fetchJson<ApiTermRowProps[]>("/api/terms")
      .then((rows) => {
        const mapped = rows.map((r) => ({ code: r.term_code, display: r.term_name }));
        setTerms(mapped);
        setSelectedTerm(mapped[0] ?? null);
      })
      .catch((e) => console.error("Failed to load terms:", e));
  }, []);

  // ── Progress simulation while generating ─────────────────────────────────
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isGenerating) {
      setProgressCount(0);
      progressRef.current = setInterval(() => {
        setProgressCount((p) => p + Math.floor(Math.random() * 45 + 15));
      }, 120);
    } else {
      if (progressRef.current) clearInterval(progressRef.current);
    }
    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, [isGenerating]);

  // ── Shared URL params ────────────────────────────────────────────────────
  const buildParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams({
      term:      selectedTerm!.code,
      courses:   courses.map((c) => c.number).join(","),
      minRating: String(minRating),
      startTime: timeStart,
      endTime:   timeEnd,
    });
    if (preferredDays.length > 0) {
      const codes = preferredDays.map((d) => DAY_TO_CODE[d]).filter(Boolean).join(",");
      if (codes) params.set("days", codes);
    }
    if (blockedSlots.length > 0) {
      params.set("blockedTimes", JSON.stringify(blockedSlots));
    }
    if (lockedSections.length > 0) {
      params.set("lockedClassNbrs", lockedSections.map((s) => s.class_nbr).join(","));
    }
    return params;
  }, [selectedTerm, courses, minRating, timeStart, timeEnd, preferredDays, blockedSlots, lockedSections]);

  // ── Find Sections ─────────────────────────────────────────────────────────
  const handleFindSections = async () => {
    if (!selectedTerm || courses.length === 0) return;
    setIsSearching(true);
    setViewMode("sections");
    try {
      const rows = await fetchJson<ScheduleRowProps[]>(`/api/schedule?${buildParams()}`);
      setSections(rows);
      setHasSearched(true);
    } catch (e) {
      console.error("Find sections failed:", e);
    } finally {
      setIsSearching(false);
    }
  };

  // ── Generate Schedules ────────────────────────────────────────────────────
  const handleGenerateSchedules = async () => {
    if (!selectedTerm || courses.length === 0) return;
    setIsGenerating(true);
    setViewMode("schedules");
    try {
      const scheds = await fetchJson<GeneratedSchedule[]>(`/api/generate?${buildParams()}`);
      setGeneratedSchedules(scheds);
      setHasGenerated(true);
    } catch (e) {
      console.error("Generate failed:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Lock / unlock a section ───────────────────────────────────────────────
  const handleLock = useCallback((section: ScheduleRowProps) => {
    const nbr = String(section.class_nbr);
    setLockedSections((prev) => {
      const exists = prev.some((s) => s.class_nbr === nbr);
      if (exists) return prev.filter((s) => s.class_nbr !== nbr); // unlock
      return [
        ...prev,
        {
          class_nbr: nbr,
          label: `${section.subject} ${section.catalog_nbr} ${section.component} §${section.class_section}`,
        },
      ];
    });
  }, []);

  const lockedClassNbrs = new Set(lockedSections.map((s) => s.class_nbr));

  // ── Course input helpers ──────────────────────────────────────────────────
  const addCourse = (raw: string) => {
    const number = raw.toUpperCase().trim();
    if (!number) return;
    setCourses((prev) => {
      const existing = new Set(prev.map((c) => c.number));
      if (existing.has(number)) return prev;
      return [...prev, { id: Date.now().toString() + Math.random(), number }];
    });
  };

  const handleCourseAdd = () => {
    addCourse(currentCourse);
    setCurrentCourse("");
  };

  // Multi-paste: "CSC 101, MATH 142\nCPE 202" → multiple courses
  const handleCoursePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text.includes(",") || text.includes("\n")) {
      e.preventDefault();
      text
        .split(/[,\n]+/)
        .map((t) => t.trim().toUpperCase())
        .filter((t) => /^[A-Z]+\s+\d+/.test(t))
        .forEach(addCourse);
      setCurrentCourse("");
    }
  };

  const removeCourse = (id: string) => setCourses((prev) => prev.filter((c) => c.id !== id));

  const toggleDay = (day: string) =>
    setPreferredDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );

  // ── Reset filters ─────────────────────────────────────────────────────────
  const resetFilters = () => {
    setMinRating(DEFAULTS.minRating);
    setTimeStart(DEFAULTS.timeStart);
    setTimeEnd(DEFAULTS.timeEnd);
    setPreferredDays([]);
    setGapPreference(DEFAULTS.gapPreference);
    setDaysMode(DEFAULTS.daysMode);
    setBlockedSlots([]);
    setLockedSections([]);
  };

  // ── Active filter chips ───────────────────────────────────────────────────
  const activeChips: Chip[] = [
    minRating !== DEFAULTS.minRating && {
      label: `★ min ${minRating.toFixed(1)}`,
      onRemove: () => setMinRating(DEFAULTS.minRating),
    },
    timeStart !== DEFAULTS.timeStart && {
      label: `from ${fmtTime(timeStart)}`,
      onRemove: () => setTimeStart(DEFAULTS.timeStart),
    },
    timeEnd !== DEFAULTS.timeEnd && {
      label: `until ${fmtTime(timeEnd)}`,
      onRemove: () => setTimeEnd(DEFAULTS.timeEnd),
    },
    preferredDays.length > 0 && {
      label: preferredDays.map((d) => d.slice(0, 3)).join(" · "),
      onRemove: () => setPreferredDays([]),
    },
    gapPreference > 0 && {
      label: `~${gapPreference}min gap`,
      onRemove: () => setGapPreference(0),
    },
    daysMode !== DEFAULTS.daysMode && {
      label: "Minimize days",
      onRemove: () => setDaysMode("balanced"),
    },
    lockedSections.length > 0 && {
      label: `${lockedSections.length} locked`,
      onRemove: () => setLockedSections([]),
    },
    blockedSlots.length > 0 && {
      label: "Times blocked",
      onRemove: () => setBlockedSlots([]),
    },
  ].filter(Boolean) as Chip[];

  const canSearch    = !!selectedTerm && courses.length > 0;
  const sliderPct    = ((minRating - 1) / 4) * 100;
  const gapSliderPct = (gapPreference / 60) * 100;
  const defaultSort  = daysMode === "minimize" ? "fewest-days" as const : "rating" as const;

  return (
    <div className="min-h-screen bg-white flex flex-col overflow-x-hidden">

      {/* ── Mobile header ────────────────────────────────────────────── */}
      <header className="md:hidden flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200 sticky top-0 z-30 flex-shrink-0">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 cursor-pointer"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-green-600 rounded-md" />
          <span className="text-sm font-bold text-gray-950 tracking-tight">Mustang Scheduler</span>
        </div>
      </header>

      <div className="flex flex-1">

      {/* ── Sidebar backdrop ─────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className={`fixed md:sticky top-0 inset-y-0 left-0 z-40 w-80 flex-shrink-0 border-r border-gray-200 h-screen overflow-y-auto bg-white transform transition-transform duration-300 ease-in-out md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="p-6">
          {/* Wordmark */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-green-600 rounded-md" />
              <span className="text-base font-bold text-gray-950 tracking-tight">Mustang Scheduler</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1 text-gray-400 hover:text-gray-700 text-lg leading-none cursor-pointer"
              aria-label="Close menu"
            >✕</button>
          </div>

          {/* ── Term ──────────────────────────────────────────────── */}
          <section className="mb-5">
            <label className="sidebar-label">Term</label>
            <div className="flex flex-col gap-1">
              {terms.map((term) => (
                <button
                  key={term.code}
                  onClick={() => setSelectedTerm(term)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    selectedTerm?.code === term.code
                      ? "bg-green-600 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {term.display}
                </button>
              ))}
              {terms.length === 0 && <p className="text-gray-400 text-xs">Loading terms…</p>}
            </div>
          </section>

          <hr className="border-gray-100 my-4" />

          {/* ── Courses ───────────────────────────────────────────── */}
          <section className="mb-5">
            <label className="sidebar-label">Courses</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={currentCourse}
                onChange={(e) => setCurrentCourse(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCourseAdd()}
                onPaste={handleCoursePaste}
                placeholder='e.g. "CSC 101" or paste a list'
                className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-950 outline-none
                  placeholder:text-gray-400 focus:border-green-600 focus:ring-2 focus:ring-green-600/10 focus:bg-white"
              />
              <button
                onClick={handleCourseAdd}
                className="px-3 py-2 bg-gray-950 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                Add
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mb-2">
              Tip: paste "CSC 101, MATH 142, CPE 202" to add multiple at once
            </p>
            <div className="flex flex-col gap-1">
              {courses.map((course) => (
                <div key={course.id} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className="text-sm font-medium text-gray-800">{course.number}</span>
                  <button onClick={() => removeCourse(course.id)} className="text-gray-400 hover:text-red-500 text-xs cursor-pointer">✕</button>
                </div>
              ))}
              {courses.length === 0 && <p className="text-gray-400 text-xs mt-1">No courses added yet</p>}
            </div>
          </section>

          {/* ── Locked sections ───────────────────────────────────── */}
          {lockedSections.length > 0 && (
            <>
              <hr className="border-gray-100 my-4" />
              <section className="mb-5">
                <label className="sidebar-label">Locked Sections</label>
                <div className="flex flex-col gap-1">
                  {lockedSections.map((s) => (
                    <div key={s.class_nbr} className="flex items-center justify-between px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                      <span className="text-xs font-medium text-green-800">📌 {s.label}</span>
                      <button
                        onClick={() => setLockedSections((prev) => prev.filter((l) => l.class_nbr !== s.class_nbr))}
                        className="text-green-500 hover:text-red-500 text-xs ml-2 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          <hr className="border-gray-100 my-4" />

          {/* ── Min Rating ────────────────────────────────────────── */}
          <section className="mb-5">
            <div className="flex justify-between items-center mb-2">
              <label className="sidebar-label mb-0">Min Rating</label>
              <span className="text-sm font-bold text-gray-950">
                {minRating.toFixed(1)}
                <span className="text-gray-400 font-normal"> / 5.0</span>
              </span>
            </div>
            <input
              type="range" min="1" max="5" step="0.1" value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              className="w-full h-1.5 appearance-none rounded-full outline-none cursor-pointer slider"
              style={{ background: `linear-gradient(to right, #16a34a ${sliderPct}%, #e5e7eb ${sliderPct}%)` }}
            />
            <div className="flex justify-between mt-1 text-[10px] text-gray-400">
              <span>Any</span><span>Excellent</span>
            </div>
          </section>

          <hr className="border-gray-100 my-4" />

          {/* ── Time Range ────────────────────────────────────────── */}
          <section className="mb-5">
            <label className="sidebar-label">Time Range</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <span className="text-[10px] text-gray-400 mb-1 block">Start</span>
                <input type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-950 outline-none focus:border-green-600" />
              </div>
              <div className="flex-1">
                <span className="text-[10px] text-gray-400 mb-1 block">End</span>
                <input type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-950 outline-none focus:border-green-600" />
              </div>
            </div>
          </section>

          <hr className="border-gray-100 my-4" />

          {/* ── Days preference ───────────────────────────────────── */}
          <section className="mb-5">
            <label className="sidebar-label">Preferred Days</label>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {DAYS_OF_WEEK.map((day) => (
                <button key={day} onClick={() => toggleDay(day)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    preferredDays.includes(day)
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>

            {/* Days on campus mode */}
            <label className="sidebar-label">Days on Campus</label>
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              {(["balanced", "minimize"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setDaysMode(mode)}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    daysMode === mode ? "bg-gray-950 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {mode === "balanced" ? "Balanced" : "Minimize"}
                </button>
              ))}
            </div>
          </section>

          <hr className="border-gray-100 my-4" />

          {/* ── Gap preference ────────────────────────────────────── */}
          <section className="mb-5">
            <div className="flex justify-between items-center mb-2">
              <label className="sidebar-label mb-0">Gap Preference</label>
              <span className="text-xs text-gray-500">
                {gapPreference === 0 ? "Compact" : `~${gapPreference}min`}
              </span>
            </div>
            <input
              type="range" min="0" max="60" step="15" value={gapPreference}
              onChange={(e) => setGapPreference(Number(e.target.value))}
              className="w-full h-1.5 appearance-none rounded-full outline-none cursor-pointer slider"
              style={{ background: `linear-gradient(to right, #16a34a ${gapSliderPct}%, #e5e7eb ${gapSliderPct}%)` }}
            />
            <div className="flex justify-between mt-1 text-[10px] text-gray-400">
              <span>Compact</span><span>Spread out</span>
            </div>
          </section>

          <hr className="border-gray-100 my-4" />

          {/* ── Blocked times ─────────────────────────────────────── */}
          <section className="mb-5">
            <button
              onClick={() => setShowBlockGrid((v) => !v)}
              className="sidebar-label flex items-center justify-between w-full cursor-pointer hover:text-gray-700"
            >
              <span>Blocked Times {blockedSlots.length > 0 ? `(${blockedSlots.length})` : ""}</span>
              <span className="text-gray-300 text-xs">{showBlockGrid ? "▲" : "▼"}</span>
            </button>
            {showBlockGrid && (
              <div className="mt-2">
                <WeekBlockGrid value={blockedSlots} onChange={setBlockedSlots} />
              </div>
            )}
          </section>

          <hr className="border-gray-100 my-4" />

          {/* ── Action buttons ────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleFindSections}
              disabled={!canSearch || isSearching}
              className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-all cursor-pointer
                bg-gray-100 hover:bg-gray-200 text-gray-800
                disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-100
                ${viewMode === "sections" && hasSearched ? "ring-2 ring-green-600 ring-offset-1" : ""}
              `}
            >
              {isSearching
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-gray-400/30 border-t-gray-500 rounded-full animate-spin" />
                    Searching…
                  </span>
                : "Find Sections"
              }
            </button>

            <button
              onClick={handleGenerateSchedules}
              disabled={!canSearch || isGenerating}
              className={`w-full py-2.5 bg-gray-950 hover:bg-green-600 text-white text-sm font-semibold rounded-xl
                transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]
                disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-gray-950
                ${viewMode === "schedules" && hasGenerated ? "ring-2 ring-green-600 ring-offset-1" : ""}
              `}
            >
              {isGenerating
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Building…
                  </span>
                : "Generate Schedules ✦"
              }
            </button>

            {!canSearch && (
              <p className="text-gray-400 text-[10px] text-center mt-1">
                Select a term and add a course first
              </p>
            )}

            {/* Reset */}
            <button
              onClick={resetFilters}
              className="text-[10px] text-gray-400 hover:text-gray-600 underline underline-offset-2 text-center mt-1 cursor-pointer"
            >
              ↺ Reset filters
            </button>
          </div>
        </div>

        {/* Slider thumb styles */}
        <style>{`
          .sidebar-label {
            display: block;
            font-size: 0.65rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #6b7280;
            margin-bottom: 0.5rem;
          }
          .slider::-webkit-slider-thumb {
            appearance: none;
            width: 14px; height: 14px; border-radius: 50%;
            background: #16a34a; cursor: pointer;
            border: 2px solid white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          }
          .slider::-moz-range-thumb {
            width: 14px; height: 14px; border-radius: 50%;
            background: #16a34a; cursor: pointer;
            border: 2px solid white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          }
        `}</style>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────── */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-gray-50 min-h-screen">
        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {activeChips.map((chip, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-medium
                  bg-gray-100 text-gray-700 border border-gray-200"
              >
                {chip.label}
                <button
                  onClick={chip.onRemove}
                  className="text-gray-400 hover:text-gray-700 leading-none cursor-pointer"
                  aria-label={`Remove filter: ${chip.label}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Progress overlay for schedule generation */}
        {isGenerating && viewMode === "schedules" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-green-600 rounded-full animate-spin mb-5" />
            <p className="text-gray-950 font-semibold text-base mb-1">Building schedules…</p>
            <p className="text-gray-400 text-sm">
              Checking ~{progressCount.toLocaleString()} combinations
            </p>
          </div>
        )}

        {/* Section results */}
        {!isGenerating && viewMode === "sections" && (
          <ClassResultsPanel
            results={sections}
            hasSearched={hasSearched}
            lockedClassNbrs={lockedClassNbrs}
            onLock={handleLock}
          />
        )}

        {/* Generated schedule results */}
        {!isGenerating && viewMode === "schedules" && (
          <GeneratedSchedulesPanel
            schedules={generatedSchedules}
            hasGenerated={hasGenerated}
            defaultSort={defaultSort}
            onLock={handleLock}
            lockedClassNbrs={lockedClassNbrs}
          />
        )}
      </main>
      </div>
    </div>
  );
}
