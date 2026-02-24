import { useState, useEffect, useRef } from "react";
import type {
  GeneratedSchedule,
  ScheduleRowProps,
} from "../props/CaldendarProps.ts";

// ── Constants ─────────────────────────────────────────────────────────────────
const GRID_START = 7; // 7 AM
const GRID_END = 21; // 9 PM
const TOTAL_MIN = (GRID_END - GRID_START) * 60;
const GRID_H = 260; // px

const DAYS = ["M", "T", "W", "R", "F"] as const;
const DAY_LABEL: Record<string, string> = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  R: "Thu",
  F: "Fri",
};

const COURSE_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-orange-400",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
];

// ── Sort types ────────────────────────────────────────────────────────────────
type SortMode =
  | "rating"
  | "compact"
  | "fewest-days"
  | "earliest-start"
  | "latest-end";

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "rating", label: "★ Best rating" },
  { key: "compact", label: "Compact day" },
  { key: "fewest-days", label: "Fewest days" },
  { key: "earliest-start", label: "Early start" },
  { key: "latest-end", label: "Late end" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
// Convert "HH:MM:SS" to absolute minutes (used for vertical placement in grid).
function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Format API time for user-facing labels.
function formatTime(t: string | null): string {
  if (!t) return "TBD";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// Translate compact day codes from API (`MWF`) into readable labels.
function formatDays(d: string | null): string {
  if (!d) return "TBD";
  return d
    .split("")
    .map((ch) => DAY_LABEL[ch] ?? ch)
    .join(" · ");
}

// Shared color system for ratings (used in list text).
function ratingColor(r: number | null): string {
  if (r === null) return "text-gray-400";
  if (r >= 3.0) return "text-green-600";
  if (r >= 2.0) return "text-yellow-500";
  return "text-red-500";
}

// Shared badge style system for avg-rating pills.
function ratingBadge(r: number | null): string {
  if (r === null) return "bg-gray-50 text-gray-400 border border-gray-200";
  if (r >= 3.0) return "bg-green-50 text-green-700 border border-green-200";
  if (r >= 2.0) return "bg-yellow-50 text-yellow-700 border border-yellow-200";
  return "bg-red-50 text-red-600 border border-red-200";
}

// Schedule-level metrics used for sorting controls.
function getEarliestStart(s: GeneratedSchedule): string {
  return s.sections.reduce(
    (min, sec) =>
      sec.start_time && (!min || sec.start_time < min) ? sec.start_time : min,
    "",
  );
}

function getLatestEnd(s: GeneratedSchedule): string {
  return s.sections.reduce(
    (max, sec) =>
      sec.end_time && (!max || sec.end_time > max) ? sec.end_time : max,
    "",
  );
}

// Non-mutating sort helper; we always copy before sorting so caller data
// remains untouched and React state remains predictable.
function sortSchedules(
  list: GeneratedSchedule[],
  mode: SortMode,
): GeneratedSchedule[] {
  const copy = [...list];
  switch (mode) {
    case "rating":
      return copy.sort((a, b) => {
        if (a.avgRating === null) return 1;
        if (b.avgRating === null) return -1;
        return b.avgRating - a.avgRating;
      });
    case "compact":
      return copy.sort((a, b) => a.totalGap - b.totalGap);
    case "fewest-days":
      return copy.sort((a, b) => {
        if (a.daysOnCampus !== b.daysOnCampus)
          return a.daysOnCampus - b.daysOnCampus;
        if (a.avgRating === null) return 1;
        if (b.avgRating === null) return -1;
        return b.avgRating - a.avgRating;
      });
    case "earliest-start":
      return copy.sort((a, b) =>
        getEarliestStart(a).localeCompare(getEarliestStart(b)),
      );
    case "latest-end":
      return copy.sort((a, b) =>
        getLatestEnd(b).localeCompare(getLatestEnd(a)),
      );
  }
}

// Assign stable colors by course key so all schedule cards/grid blocks match.
function courseColorMap(sections: ScheduleRowProps[]): Map<string, string> {
  const keys = [
    ...new Set(sections.map((s) => `${s.subject} ${s.catalog_nbr}`)),
  ];
  return new Map(
    keys.map((k, i) => [k, COURSE_COLORS[i % COURSE_COLORS.length]]),
  );
}

// ── Mini week grid ─────────────────────────────────────────────────────────────
function WeekGrid({
  sections,
  colorMap,
  height = GRID_H,
}: {
  sections: ScheduleRowProps[];
  colorMap: Map<string, string>;
  height?: number;
}) {
  const hourCount = GRID_END - GRID_START;
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Day headers */}
      <div className="flex bg-gray-100 border-b border-gray-200">
        <div className="w-8 flex-shrink-0" />
        {DAYS.map((d) => (
          <div
            key={d}
            className="flex-1 text-center text-[9px] font-semibold text-gray-500 py-1.5 tracking-wide uppercase"
          >
            {DAY_LABEL[d]}
          </div>
        ))}
      </div>

      {/* Grid body */}
      <div className="flex" style={{ height }}>
        {/* Time labels */}
        <div className="w-8 flex-shrink-0 relative bg-gray-50 border-r border-gray-200">
          {Array.from({ length: hourCount }, (_, i) => {
            const hour = GRID_START + i;
            return (
              <div
                key={i}
                className="absolute right-1.5 text-[9px] font-medium text-gray-500 leading-none"
                style={{
                  top: `${(i / hourCount) * 100}%`,
                  transform: "translateY(-50%)",
                }}
              >
                {hour % 12 || 12}
                {hour < 12 ? "a" : "p"}
              </div>
            );
          })}
        </div>

        {/* Day columns */}
        {DAYS.map((day) => (
          <div
            key={day}
            className="flex-1 relative border-l border-gray-200 bg-white"
          >
            {Array.from({ length: hourCount + 1 }, (_, i) => (
              <div
                key={i}
                className={`absolute w-full border-t ${i % 2 === 0 ? "border-gray-200" : "border-gray-100"}`}
                style={{ top: `${(i / hourCount) * 100}%` }}
              />
            ))}
            {sections
              .filter(
                (s) => s.days?.includes(day) && s.start_time && s.end_time,
              )
              .map((s) => {
                // Convert real clock times into percentages of display window
                // so each block can be absolutely positioned in the column.
                const startMin = toMin(s.start_time!) - GRID_START * 60;
                const endMin = toMin(s.end_time!) - GRID_START * 60;
                const topPct = Math.max(0, (startMin / TOTAL_MIN) * 100);
                const heightPct = Math.max(
                  1,
                  ((endMin - startMin) / TOTAL_MIN) * 100,
                );
                const color =
                  colorMap.get(`${s.subject} ${s.catalog_nbr}`) ??
                  "bg-gray-400";
                return (
                  <div
                    key={`${s.class_nbr}-${day}`}
                    className={`absolute rounded-md text-white text-[9px] font-bold px-1 overflow-hidden flex flex-col justify-start pt-0.5 leading-tight ${color}`}
                    style={{
                      top: `${topPct}%`,
                      height: `${heightPct}%`,
                      left: "3px",
                      right: "3px",
                      boxShadow:
                        "0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.2)",
                    }}
                  >
                    <span>{s.subject}</span>
                    <span>{s.catalog_nbr}</span>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Compare Drawer ─────────────────────────────────────────────────────────────
function CompareDrawer({
  scheduleA,
  scheduleB,
  idxA,
  idxB,
  onClose,
}: {
  scheduleA: GeneratedSchedule;
  scheduleB: GeneratedSchedule;
  idxA: number;
  idxB: number;
  onClose: () => void;
}) {
  // Each schedule gets its own course->color map.
  const cmA = courseColorMap(scheduleA.sections);
  const cmB = courseColorMap(scheduleB.sections);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-gray-200 shadow-2xl flex flex-col"
      style={{ height: "62vh" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-950">
          Comparing Schedules
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 text-lg leading-none cursor-pointer"
          aria-label="Close comparison"
        >
          ✕
        </button>
      </div>

      {/* Side-by-side on desktop, stacked on mobile */}
      <div className="flex flex-col md:flex-row flex-1 overflow-y-auto md:overflow-hidden divide-y md:divide-y-0 md:divide-x divide-gray-100">
        {(
          [
            { sched: scheduleA, cm: cmA, idx: idxA },
            { sched: scheduleB, cm: cmB, idx: idxB },
          ] as const
        ).map(({ sched, cm, idx }) => (
          <div key={idx} className="flex-1 flex flex-col overflow-y-auto p-4">
            {/* Card header */}
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <div>
                <p className="text-sm font-bold text-gray-950">
                  Schedule {idx + 1}
                </p>
                <p className="text-xs text-gray-400">
                  {sched.daysOnCampus} day{sched.daysOnCampus !== 1 ? "s" : ""}{" "}
                  on campus
                  {" · "}
                  {sched.totalGap === 0
                    ? "no gaps"
                    : `${Math.round((sched.totalGap / 60) * 10) / 10}h gaps`}
                </p>
              </div>
              {sched.avgRating !== null ? (
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full ${ratingBadge(sched.avgRating)}`}
                >
                  {sched.avgRating.toFixed(2)} ★
                </span>
              ) : (
                <span className="text-xs text-gray-300 bg-gray-50 px-2.5 py-1 rounded-full">
                  no ratings
                </span>
              )}
            </div>

            {/* Week grid */}
            <WeekGrid sections={sched.sections} colorMap={cm} height={170} />

            {/* Section list */}
            <div className="mt-3 flex flex-col gap-1 flex-shrink-0">
              {sched.sections.map((s) => {
                const r =
                  s.overall_rating !== null ? Number(s.overall_rating) : null;
                const dot =
                  cm.get(`${s.subject} ${s.catalog_nbr}`) ?? "bg-gray-400";
                return (
                  <div
                    key={`${s.class_nbr}-${s.class_section}`}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`}
                    />
                    <span className="font-medium text-gray-800 w-16 flex-shrink-0">
                      {s.subject} {s.catalog_nbr}
                    </span>
                    <span className="text-gray-500">
                      {formatDays(s.days)}
                      {s.start_time && s.end_time && (
                        <>
                          {" "}
                          · {formatTime(s.start_time)}–{formatTime(s.end_time)}
                        </>
                      )}
                    </span>
                    {r !== null && (
                      <span
                        className={`ml-auto font-semibold ${ratingColor(r)}`}
                      >
                        {r.toFixed(1)}★
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface GeneratedSchedulesPanelProps {
  schedules: GeneratedSchedule[];
  hasGenerated: boolean;
  defaultSort?: SortMode;
  onLock: (section: ScheduleRowProps) => void;
  lockedClassNbrs: Set<string>;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function GeneratedSchedulesPanel({
  schedules,
  hasGenerated,
  defaultSort = "rating",
  onLock,
  lockedClassNbrs,
}: GeneratedSchedulesPanelProps) {
  // `sortMode`: active ordering strategy for cards.
  // `compareMode`: whether checkboxes + drawer flow is active.
  // `compareSelected`: schedule indexes currently selected for comparison.
  const [sortMode, setSortMode] = useState<SortMode>(defaultSort);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelected, setCompare] = useState<number[]>([]); // indices into sorted list
  // Tracks which schedule cards have their class-number panel expanded.
  const [openNbrCards, setOpenNbrCards] = useState<Set<number>>(new Set());
  // Stores the most recently copied card index for temporary success feedback.
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Reset compare + sort when new schedules arrive
  // This prevents stale compare selections referencing old result sets.
  const prevSchedulesRef = useRef(schedules);
  useEffect(() => {
    if (prevSchedulesRef.current !== schedules) {
      prevSchedulesRef.current = schedules;
      setSortMode(defaultSort);
      setCompareMode(false);
      setCompare([]);
    }
  }, [schedules, defaultSort]);

  if (!hasGenerated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mb-4">
          <div className="w-7 h-7 bg-green-600 rounded-md" />
        </div>
        <p className="text-gray-950 font-semibold text-lg mb-1">
          Generate conflict-free schedules
        </p>
        <p className="text-gray-400 text-sm max-w-xs">
          Add your courses and click "Generate Schedules" — we'll find every
          valid combination sorted by professor rating.
        </p>
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-gray-950 font-semibold text-lg mb-1">
          No valid schedules found
        </p>
        <p className="text-gray-400 text-sm max-w-xs">
          All combinations have conflicts. Try widening filters, removing
          blocked times, or adding different courses.
        </p>
      </div>
    );
  }

  const sorted = sortSchedules(schedules, sortMode);

  // Toggle visibility of the per-card class-number quick panel.
  function toggleNbrs(idx: number) {
    setOpenNbrCards((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  // Copies one class number per line for easy pasting into registration tools.
  function copyNbrs(idx: number, sections: ScheduleRowProps[]) {
    const text = sections.map((s) => s.class_nbr).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  }

  // Keep a rolling selection of at most 2 schedules.
  function toggleCompare(idx: number) {
    setCompare((prev) => {
      if (prev.includes(idx)) return prev.filter((i) => i !== idx);
      if (prev.length >= 2) return [prev[1], idx]; // drop oldest
      return [...prev, idx];
    });
  }

  // Drawer opens only after compare mode is enabled and exactly two cards picked.
  const compareOpen = compareMode && compareSelected.length === 2;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* ── Sort bar + Compare toggle ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        {/* Summary */}
        <p className="text-gray-500 text-sm">
          <span className="font-semibold text-gray-950">
            {sorted.length} schedule{sorted.length !== 1 ? "s" : ""}
          </span>{" "}
          found
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Sort pills */}
          <div className="overflow-x-auto max-w-full md:max-w-none">
            <div
              className="flex rounded-lg overflow-hidden border border-gray-200 min-w-max"
              role="radiogroup"
              aria-label="Sort schedules by"
            >
              {SORT_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  role="radio"
                  aria-checked={sortMode === key}
                  onClick={() => setSortMode(key)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    sortMode === key
                      ? "bg-gray-950 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Compare toggle */}
          {/* Turning compare off also clears selected schedule indexes. */}
          <button
            onClick={() => {
              setCompareMode((m) => !m);
              setCompare([]);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              compareMode
                ? "bg-gray-950 text-white border-gray-950"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {compareMode ? "✕ Cancel compare" : "⊞ Compare"}
          </button>
        </div>
      </div>

      {compareMode && compareSelected.length < 2 && (
        <p className="text-gray-400 text-xs mb-4 text-center">
          Select {2 - compareSelected.length} more schedule
          {2 - compareSelected.length !== 1 ? "s" : ""} to compare
        </p>
      )}

      {/* ── Schedule cards ─────────────────────────────────────────────── */}
      {sorted.map((sched, idx) => {
        const cm = courseColorMap(sched.sections);
        const courseKeys = [...cm.keys()];
        const isSelected = compareSelected.includes(idx);

        return (
          <div
            key={idx}
            className={`bg-white border rounded-2xl mb-5 overflow-hidden shadow-sm transition-all duration-150 ${
              compareMode && isSelected
                ? "border-green-400 ring-2 ring-green-300"
                : "border-gray-200"
            }`}
          >
            {/* Card header */}
            <div className="px-4 md:px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              {/* Compare checkbox */}
              {compareMode && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleCompare(idx)}
                  className="w-4 h-4 accent-green-600 cursor-pointer flex-shrink-0"
                  aria-label={`Select schedule ${idx + 1} for comparison`}
                />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-gray-950">
                    Schedule {idx + 1}
                  </h3>
                  {/* Metadata — inline on desktop, hidden on mobile (shown as subtitle below) */}
                  <span className="hidden md:inline text-xs text-gray-400">
                    {sched.daysOnCampus} day
                    {sched.daysOnCampus !== 1 ? "s" : ""}
                  </span>
                  {sched.totalGap > 0 && (
                    <span className="hidden md:inline text-xs text-gray-400">
                      · {Math.round(sched.totalGap / 6) / 10}h gaps
                    </span>
                  )}
                  {sched.totalGap === 0 && (
                    <span className="hidden md:inline text-xs text-green-600">
                      · no gaps
                    </span>
                  )}
                </div>
                {/* Mobile-only subtitle: days · gaps on their own line */}
                <p className="md:hidden text-xs text-gray-400 mt-0.5">
                  {sched.daysOnCampus} day{sched.daysOnCampus !== 1 ? "s" : ""}
                  {sched.totalGap > 0 &&
                    ` · ${Math.round(sched.totalGap / 6) / 10}h gaps`}
                  {sched.totalGap === 0 && (
                    <span className="text-green-600"> · no gaps</span>
                  )}
                </p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {sched.sections.length} section
                  {sched.sections.length !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Avg rating badge */}
              {sched.avgRating !== null ? (
                <span
                  className={`text-xs md:text-sm font-bold px-2 md:px-3 py-0.5 md:py-1 rounded-full flex-shrink-0 ${ratingBadge(sched.avgRating)}`}
                >
                  {sched.avgRating.toFixed(2)} ★ avg
                </span>
              ) : (
                <span className="text-xs text-gray-300 bg-gray-50 px-2 md:px-3 py-0.5 md:py-1 rounded-full flex-shrink-0">
                  no ratings
                </span>
              )}

              {/* Class numbers toggle */}
              <button
                onClick={() => toggleNbrs(idx)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer flex-shrink-0 ${
                  openNbrCards.has(idx)
                    ? "bg-gray-950 text-white border-gray-950"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
                title="Show class numbers"
              >
                # Class Nbrs
              </button>
            </div>

            {/* Class numbers panel */}
            {openNbrCards.has(idx) && (
              <div className="px-4 md:px-6 py-3 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                    Class Numbers
                  </span>
                  <button
                    onClick={() => copyNbrs(idx, sched.sections)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                      copiedIdx === idx
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {copiedIdx === idx ? "✓ Copied!" : "Copy all"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sched.sections.map((s) => (
                    <div
                      key={s.class_nbr}
                      className="flex flex-col items-center bg-white border border-gray-200 rounded-lg px-3 py-1.5 min-w-[64px]"
                    >
                      <span className="text-[10px] text-gray-400 leading-none mb-0.5">
                        {s.subject} {s.catalog_nbr}
                      </span>
                      <span className="text-sm font-bold text-gray-950 font-mono leading-none">
                        {s.class_nbr}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Course color legend */}
            <div className="px-4 md:px-6 pt-4 flex flex-wrap gap-2">
              {courseKeys.map((k) => (
                <span
                  key={k}
                  className={`text-xs text-white font-semibold px-2.5 py-1 rounded-md ${cm.get(k)}`}
                >
                  {k}
                </span>
              ))}
            </div>

            {/* Compact section list */}
            {/* This is a quick textual summary; the week grid below gives
                the true collision/shape visualization. */}
            <div className="px-4 md:px-6 pt-3 pb-1 flex flex-col gap-2">
              {sched.sections.map((s) => {
                const r =
                  s.overall_rating !== null ? Number(s.overall_rating) : null;
                const dot =
                  cm.get(`${s.subject} ${s.catalog_nbr}`) ?? "bg-gray-400";
                const isLocked = lockedClassNbrs.has(String(s.class_nbr));
                return (
                  <div
                    key={`${s.class_nbr}-${s.class_section}`}
                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm"
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`}
                    />
                    <span className="font-medium text-gray-800 flex-shrink-0">
                      {s.subject} {s.catalog_nbr}
                    </span>
                    <span className="text-gray-400 text-xs flex-shrink-0">
                      {s.component} §{s.class_section}
                    </span>
                    <span className="text-gray-600 text-xs">
                      {formatDays(s.days)}
                      {s.start_time && s.end_time && (
                        <span className="text-gray-400">
                          {" · "}
                          {formatTime(s.start_time)}–{formatTime(s.end_time)}
                        </span>
                      )}
                    </span>
                    {s.instructor_name && (
                      <span className="text-gray-400 text-xs flex items-center gap-1.5 w-full md:w-auto md:ml-auto">
                        {s.instructor_name}
                        {r !== null && (
                          <span className={`font-semibold ${ratingColor(r)}`}>
                            {r.toFixed(1)}★
                            {s.num_evals ? (
                              <span className="text-gray-300 font-normal">
                                {" "}
                                ({s.num_evals})
                              </span>
                            ) : null}
                          </span>
                        )}
                        <button
                          // Lock/unlock section globally (parent owns the state).
                          onClick={() => onLock(s)}
                          title={isLocked ? "Unlock" : "Lock this section"}
                          className={`text-[10px] px-1.5 py-0.5 rounded-full border cursor-pointer transition-colors ${
                            isLocked
                              ? "bg-green-100 border-green-300 text-green-700"
                              : "border-gray-200 text-gray-400 hover:border-green-300 hover:text-green-600"
                          }`}
                        >
                          📌
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Week grid */}
            <div className="px-4 md:px-6 pb-5 mt-3 overflow-x-auto">
              <div style={{ minWidth: 260 }}>
                <WeekGrid sections={sched.sections} colorMap={cm} />
              </div>
            </div>
          </div>
        );
      })}

      {/* ── Compare drawer ─────────────────────────────────────────────── */}
      {compareOpen && (
        <CompareDrawer
          // Selected indexes refer to the already-sorted list shown on screen.
          scheduleA={sorted[compareSelected[0]]}
          scheduleB={sorted[compareSelected[1]]}
          idxA={compareSelected[0]}
          idxB={compareSelected[1]}
          onClose={() => {
            setCompare([]);
            setCompareMode(false);
          }}
        />
      )}
    </div>
  );
}
