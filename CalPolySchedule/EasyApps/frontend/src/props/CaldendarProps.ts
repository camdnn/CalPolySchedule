export interface CourseProps {
  id: string;
  number: string;
}

export interface ApiTermRowProps { term_code: string; term_name: string };

export interface BlockedSlot {
  day: string;       // "M" | "T" | "W" | "R" | "F"
  startMin: number;  // minutes from midnight, e.g. 480 = 8:00 AM
  endMin: number;
}

export interface LockedSection {
  class_nbr: string;
  label: string;     // e.g. "CSC 101 LEC §02"
}

export interface ScheduleRowProps {
  subject: string;
  catalog_nbr: string;
  descr: string;
  class_section: string;
  component: string;
  class_nbr: string;
  days: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  instructor_name: string | null;
  enrollment_available: number | null;
  overall_rating: number | null;
  num_evals: number | null;
};

export interface GeneratedSchedule {
  sections: ScheduleRowProps[];
  avgRating: number | null;
  daysOnCampus: number;
  totalGap: number;   // total minutes of gap between consecutive sections
};
