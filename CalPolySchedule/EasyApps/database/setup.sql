-- Terms table
CREATE TABLE terms (
  id SERIAL PRIMARY KEY,
  term_code VARCHAR(20) UNIQUE, -- "2025-fall"
  term_name VARCHAR(50),        -- "Fall 2025"
  registration_start DATE,
  term_start DATE,
  term_end DATE,
  is_active BOOLEAN DEFAULT true,
  last_scraped TIMESTAMP
);

-- Courses table (static course info)
CREATE TABLE courses (
  id SERIAL PRIMARY KEY,
  course_code VARCHAR(20) UNIQUE, -- "CSC 101"
  department VARCHAR(10),          -- "CSC"
  course_number VARCHAR(10),       -- "101"
  course_name TEXT,                -- "Fundamentals of Computer Science"
  units INTEGER,
  description TEXT
);

-- Sections table (term-specific)
CREATE TABLE sections (
  id SERIAL PRIMARY KEY,
  term_id INTEGER REFERENCES terms(id),
  course_id INTEGER REFERENCES courses(id),
  section_number VARCHAR(10),    -- "01", "02"
  professor_name VARCHAR(100),
  days VARCHAR(20),              -- "MWF", "TR"
  start_time TIME,
  end_time TIME,
  location VARCHAR(50),
  total_seats INTEGER,
  available_seats INTEGER,
  waitlist INTEGER,
  last_updated TIMESTAMP,
  UNIQUE(term_id, course_id, section_number)
);

-- Professor ratings (from PolyRatings)
CREATE TABLE professor_ratings (
  id SERIAL PRIMARY KEY,
  professor_name VARCHAR(100) UNIQUE,
  overall_rating DECIMAL(3,2),   -- 4.25
  helpfulness DECIMAL(3,2),
  clarity DECIMAL(3,2),
  easiness DECIMAL(3,2),
  total_reviews INTEGER,
  last_scraped TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_sections_term ON sections(term_id);
CREATE INDEX idx_sections_course ON sections(course_id);
CREATE INDEX idx_sections_professor ON sections(professor_name);
CREATE INDEX idx_professor_rating ON professor_ratings(overall_rating);
