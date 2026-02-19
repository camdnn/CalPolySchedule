import type { ScheduleRowProps } from "../props/CaldendarProps.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

// "08:00:00" → "8:00 AM"
function formatTime(t: string | null): string {
  if (!t) return "TBD";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour   = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

// Day code string → "Mon · Wed · Fri"
const DAY_LABEL: Record<string, string> = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri" };
function formatDays(d: string | null): string {
  if (!d) return "TBD";
  return d.split("").map((ch) => DAY_LABEL[ch] ?? ch).join(" · ");
}

// Rating → color class (text)
function ratingColor(r: number | string | null): string {
  if (r === null) return "text-gray-400";
  const n = Number(r);
  if (n >= 4.0) return "text-green-600";
  if (n >= 3.0) return "text-yellow-500";
  return "text-red-500";
}

// Component badge
function componentBadge(comp: string): string {
  switch (comp.toUpperCase()) {
    case "LEC": return "bg-blue-50 text-blue-700 border border-blue-200";
    case "LAB": return "bg-purple-50 text-purple-700 border border-purple-200";
    case "ACT": return "bg-orange-50 text-orange-700 border border-orange-200";
    default:    return "bg-gray-100 text-gray-600 border border-gray-200";
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface ClassResultsPanelProps {
  // Flat section list returned from /api/schedule
  results: ScheduleRowProps[];
  // Used to differentiate "empty because not searched yet" vs "empty results"
  hasSearched: boolean;
  // Section ids currently pinned by user
  lockedClassNbrs: Set<string>;
  // Toggle pin action delegated to parent state
  onLock: (section: ScheduleRowProps) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ClassResultsPanel({
  results,
  hasSearched,
  lockedClassNbrs,
  onLock,
}: ClassResultsPanelProps) {
  // Initial onboarding state before first query.
  if (!hasSearched) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mb-4">
          <div className="w-7 h-7 bg-green-600 rounded-md" />
        </div>
        <p className="text-gray-950 font-semibold text-lg mb-1">Ready to build your schedule</p>
        <p className="text-gray-400 text-sm max-w-xs">
          Add your courses and click "Find Sections" to see available sections with professor ratings.
        </p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-gray-950 font-semibold text-lg mb-1">No sections found</p>
        <p className="text-gray-400 text-sm max-w-xs">
          Try widening the time range, removing a day filter, or lowering the minimum rating.
        </p>
      </div>
    );
  }

  // Group by "SUBJ CATALOG_NBR"
  // This lets us render one course card with multiple section rows inside it.
  const grouped = results.reduce<Record<string, ScheduleRowProps[]>>((acc, row) => {
    const key = `${row.subject} ${row.catalog_nbr}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  const courseKeys = Object.keys(grouped);

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Summary */}
      <p className="text-gray-500 text-sm mb-6">
        Found{" "}
        <span className="font-semibold text-gray-950">
          {results.length} section{results.length !== 1 ? "s" : ""}
        </span>{" "}
        across{" "}
        <span className="font-semibold text-gray-950">
          {courseKeys.length} course{courseKeys.length !== 1 ? "s" : ""}
        </span>
        {lockedClassNbrs.size > 0 && (
          <span className="ml-2 text-green-600 text-xs font-medium">
            · {lockedClassNbrs.size} locked
          </span>
        )}
      </p>

      {courseKeys.map((courseKey) => {
        const sections  = grouped[courseKey];
        const courseName = sections[0].descr;

        return (
          <div
            key={courseKey}
            className="bg-white border border-gray-200 rounded-2xl mb-5 overflow-hidden shadow-sm"
          >
            {/* Course header */}
            <div className="px-4 md:px-6 py-4 border-b border-gray-100">
              <div className="flex items-baseline gap-3">
                <h3 className="text-base font-bold text-gray-950">{courseKey}</h3>
                {courseName && <span className="text-gray-500 text-sm">{courseName}</span>}
              </div>
              <p className="text-gray-400 text-xs mt-0.5">
                {sections.length} section{sections.length !== 1 ? "s" : ""} available
              </p>
            </div>

            {/* Sections sorted best rating first, unrated last */}
            {/* We convert null ratings to -1 so unrated sections sink to the bottom. */}
            <div className="divide-y divide-gray-100">
              {[...sections]
                .sort((a, b) => {
                  const ra = a.overall_rating !== null ? Number(a.overall_rating) : -1;
                  const rb = b.overall_rating !== null ? Number(b.overall_rating) : -1;
                  return rb - ra;
                })
                .map((section) => {
                  const isLocked = lockedClassNbrs.has(String(section.class_nbr));
                  const rating   = section.overall_rating !== null ? Number(section.overall_rating) : null;
                  const seats    = section.enrollment_available;

                  return (
                    <div
                      key={`${section.class_nbr}-${section.days}-${section.start_time}-${section.class_section}`}
                      className={`group px-4 md:px-6 py-4 transition-colors duration-100 ${
                        isLocked ? "bg-green-50/50" : "hover:bg-gray-50"
                      }`}
                    >
                      {/* ── Row 1: Time · Days · [lock] · Seats ───────────── */}
                      <div className="flex items-center gap-2 mb-1.5">
                        {/* Days + time — primary info, always first */}
                        <span className="font-semibold text-gray-950 text-sm">
                          {formatDays(section.days)}
                        </span>
                        {section.start_time && section.end_time && (
                          <span className="text-gray-600 text-sm">
                            · {formatTime(section.start_time)}–{formatTime(section.end_time)}
                          </span>
                        )}

                        {/* Lock button — hidden until hover (or always visible if locked) */}
                        {/* This calls parent handler so lock state is shared across
                            both section and generated-schedule views. */}
                        <button
                          onClick={() => onLock(section)}
                          title={isLocked ? "Unlock this section" : "Lock and regenerate around this section"}
                          aria-pressed={isLocked}
                          className={`
                            text-xs px-2 py-0.5 rounded-full border transition-all duration-150 cursor-pointer
                            ${isLocked
                              ? "bg-green-100 border-green-300 text-green-700 font-medium"
                              : "bg-gray-100 border-gray-200 text-gray-500 hover:border-green-300 hover:text-green-700 md:opacity-0 md:group-hover:opacity-100"
                            }
                          `}
                        >
                          {isLocked ? "📌 Locked" : "📌 Pin"}
                        </button>

                        {/* Seats — pushed right, accessible with text + dot */}
                        {/* Dot color and text both encode seat status for clarity. */}
                        <div className="ml-auto flex items-center gap-1.5 text-xs">
                          <span
                            className={`w-1.5 h-1.5 rounded-full inline-block flex-shrink-0 ${
                              seats === null ? "bg-gray-300"
                                : seats > 10 ? "bg-green-500"
                                : seats > 0  ? "bg-yellow-500"
                                : "bg-red-500"
                            }`}
                            aria-hidden="true"
                          />
                          <span className={`font-medium ${
                            seats === null ? "text-gray-400"
                              : seats > 10 ? "text-green-700"
                              : seats > 0  ? "text-yellow-700"
                              : "text-red-600"
                          }`}>
                            {seats === null ? "Seats unknown"
                              : seats > 0  ? `${seats} open`
                              : "Full"}
                          </span>
                        </div>
                      </div>

                      {/* ── Row 2: Type badge · Section · Instructor · Rating · Location ── */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {/* LEC / LAB / ACT */}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${componentBadge(section.component)}`}>
                          {section.component}
                        </span>

                        {/* Section number */}
                        <span className="text-gray-400 text-xs">§{section.class_section}</span>

                        {/* Instructor + rating + eval count */}
                        {/* Rating is optional; we keep "no rating" explicit so users
                            can distinguish unrated from low-rated instructors. */}
                        <span className="text-gray-700 text-sm">
                          👤 {section.instructor_name ?? "Staff"}
                        </span>
                        {rating !== null ? (
                          <span className={`text-xs font-bold ${ratingColor(rating)}`}>
                            ★ {rating.toFixed(1)}
                            {section.num_evals ? (
                              <span className="font-normal text-gray-400"> ({section.num_evals})</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">no rating</span>
                        )}

                        {/* Location */}
                        {section.location && (
                          <span className="text-gray-400 text-xs">
                            📍 {section.location}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
