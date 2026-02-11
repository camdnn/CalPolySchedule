export interface CourseProps {
  id: string;
  number: string;
}

export interface DashboardProps {
  isVisible: boolean;
}

export interface ApiTermRowProps { term_code: string; term_name: string };

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
};