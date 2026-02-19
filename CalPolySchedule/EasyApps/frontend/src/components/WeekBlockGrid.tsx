import { useState, useRef, useEffect, useCallback } from "react";
import type { BlockedSlot } from "../props/CaldendarProps.ts";

// ── Grid constants ────────────────────────────────────────────────────────────
const GRID_START_HOUR = 7;   // 7 AM
const GRID_END_HOUR   = 22;  // 10 PM
const SLOTS_PER_HOUR  = 2;   // 30-min cells
const SLOT_COUNT      = (GRID_END_HOUR - GRID_START_HOUR) * SLOTS_PER_HOUR; // 30 slots

const DAYS      = ["M", "T", "W", "R", "F"] as const;
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function slotToMin(slotIdx: number): number {
  return (GRID_START_HOUR + slotIdx / SLOTS_PER_HOUR) * 60;
}

function slotKey(dayIdx: number, slotIdx: number): string {
  return `${dayIdx}-${slotIdx}`;
}

function hourLabel(slotIdx: number): string {
  if (slotIdx % 2 !== 0) return ""; // only label the hour (not half-hour)
  const hour = GRID_START_HOUR + slotIdx / SLOTS_PER_HOUR;
  if (hour === 12) return "12p";
  if (hour > 12) return `${hour - 12}p`;
  return `${hour}a`;
}

// Convert blocked cell Set → BlockedSlot[]
function cellsToSlots(cells: Set<string>): BlockedSlot[] {
  const slots: BlockedSlot[] = [];
  cells.forEach((key) => {
    const [dayIdx, slotIdx] = key.split("-").map(Number);
    slots.push({
      day:      DAYS[dayIdx],
      startMin: slotToMin(slotIdx),
      endMin:   slotToMin(slotIdx) + 30,
    });
  });
  return slots;
}

// Convert BlockedSlot[] → blocked cell Set
function slotsToCells(slots: BlockedSlot[]): Set<string> {
  const cells = new Set<string>();
  for (const slot of slots) {
    const dayIdx  = DAYS.indexOf(slot.day as typeof DAYS[number]);
    if (dayIdx === -1) continue;
    const slotIdx = Math.round(((slot.startMin / 60) - GRID_START_HOUR) * SLOTS_PER_HOUR);
    if (slotIdx >= 0 && slotIdx < SLOT_COUNT) {
      cells.add(slotKey(dayIdx, slotIdx));
    }
  }
  return cells;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface WeekBlockGridProps {
  value: BlockedSlot[];
  onChange: (slots: BlockedSlot[]) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function WeekBlockGrid({ value, onChange }: WeekBlockGridProps) {
  const [cells, setCells] = useState<Set<string>>(() => slotsToCells(value));

  // Drag state in refs so event handlers always see current values
  const isDragging   = useRef(false);
  const dragStart    = useRef<{ dayIdx: number; slotIdx: number } | null>(null);
  const dragMode     = useRef<"block" | "unblock">("block");
  // Track which cells were in the drag selection to avoid repainting on re-entry
  const dragSnapshot = useRef<Set<string>>(new Set());

  // Sync external `value` prop → internal cells (e.g. "Reset filters")
  useEffect(() => {
    setCells(slotsToCells(value));
  }, [value]);

  // Debounced propagation to parent
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const t = setTimeout(() => onChangeRef.current(cellsToSlots(cells)), 60);
    return () => clearTimeout(t);
  }, [cells]);

  // Release drag on pointerup anywhere in the window (covers mouse + touch)
  useEffect(() => {
    const up = () => {
      isDragging.current   = false;
      dragStart.current    = null;
      dragSnapshot.current = new Set();
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  // Apply the drag rectangle to cells
  const paintDragRect = useCallback(
    (toDay: number, toSlot: number) => {
      if (!dragStart.current) return;
      const { dayIdx: fd, slotIdx: fs } = dragStart.current;
      const minDay  = Math.min(fd, toDay);
      const maxDay  = Math.max(fd, toDay);
      const minSlot = Math.min(fs, toSlot);
      const maxSlot = Math.max(fs, toSlot);

      setCells((prev) => {
        const next = new Set(prev);
        // Undo previously-painted drag cells
        dragSnapshot.current.forEach((k) => {
          if (dragMode.current === "block") next.delete(k);
          else next.add(k);
        });
        dragSnapshot.current = new Set();
        // Re-paint the new rectangle
        for (let d = minDay; d <= maxDay; d++) {
          for (let s = minSlot; s <= maxSlot; s++) {
            const k = slotKey(d, s);
            dragSnapshot.current.add(k);
            if (dragMode.current === "block") next.add(k);
            else next.delete(k);
          }
        }
        return next;
      });
    },
    []
  );

  function handlePointerDown(e: React.PointerEvent, dayIdx: number, slotIdx: number) {
    e.preventDefault(); // prevent text selection and scroll on touch
    const key = slotKey(dayIdx, slotIdx);
    isDragging.current   = true;
    dragStart.current    = { dayIdx, slotIdx };
    dragMode.current     = cells.has(key) ? "unblock" : "block";
    dragSnapshot.current = new Set([key]);

    setCells((prev) => {
      const next = new Set(prev);
      if (dragMode.current === "block") next.add(key);
      else next.delete(key);
      return next;
    });
  }

  // Handle pointer move on the grid container — works for both mouse drag and touch drag.
  // Uses elementFromPoint to find which cell is under the pointer/finger.
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current) return;
    e.preventDefault();
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (!el) return;
    const day  = el.dataset.day;
    const slot = el.dataset.slot;
    if (day !== undefined && slot !== undefined) {
      paintDragRect(Number(day), Number(slot));
    }
  }

  const hasBlocked = cells.size > 0;

  return (
    <div className="select-none">
      {/* Day header row */}
      <div className="flex mb-0.5" style={{ paddingLeft: 22 }}>
        {DAY_SHORT.map((d) => (
          <div key={d} className="flex-1 text-center text-[9px] text-gray-400 font-medium">
            {d}
          </div>
        ))}
      </div>

      {/* Grid: time label + 5 day columns — touch-action:none prevents page scroll during drag */}
      <div
        className="flex gap-0.5"
        style={{ touchAction: "none" }}
        onPointerMove={handlePointerMove}
      >
        {/* Time labels */}
        <div className="flex flex-col gap-0.5" style={{ width: 20 }}>
          {Array.from({ length: SLOT_COUNT }, (_, i) => (
            <div
              key={i}
              className="flex items-center justify-end text-[9px] text-gray-300 leading-none h-3.5 md:h-[10px]"
            >
              {hourLabel(i)}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {DAYS.map((_, dayIdx) => (
          <div key={dayIdx} className="flex-1 flex flex-col gap-0.5">
            {Array.from({ length: SLOT_COUNT }, (_, slotIdx) => {
              const blocked = cells.has(slotKey(dayIdx, slotIdx));
              return (
                <div
                  key={slotIdx}
                  data-day={dayIdx}
                  data-slot={slotIdx}
                  className={`rounded-[2px] cursor-crosshair transition-colors duration-75 h-3.5 md:h-[10px] ${
                    blocked
                      ? "bg-red-300 border border-red-400"
                      : "bg-gray-100 hover:bg-gray-200"
                  }`}
                  onPointerDown={(e) => handlePointerDown(e, dayIdx, slotIdx)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend + clear */}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[9px] text-gray-400">
          Tap or drag to block times
        </span>
        {hasBlocked && (
          <button
            onClick={() => setCells(new Set())}
            className="text-[9px] text-red-400 hover:text-red-600 transition-colors cursor-pointer"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
