-- Terms table
CREATE TABLE terms (
  id SERIAL PRIMARY KEY,
  term_code VARCHAR(10) UNIQUE NOT NULL,      -- e.g. 2262
  term_name VARCHAR(50) NOT NULL,             -- "Winter 2026"
  term_start DATE,
  term_end DATE,
  academic_year INTEGER NOT NULL,             -- e.g. 2025 for AY 2025-26 (pick a convention)
  is_active BOOLEAN NOT NULL DEFAULT false,
  last_scraped TIMESTAMP NOT NULL DEFAULT NOW()
);

-- EXAMPLE
--           subject catalog_nbg
--           descr
--           ---------------------------
--           class_section-component class_nbr     instructor name 
--           dates    
--           location 
--           time                                      rating 
--           -----------------------------
--
--           AERO 200
--           Aerospace Gas Dyanmics and Heat Transfer
--
--           01-LEC(3513] units: 3
  --         MWF                       ROBERT 
  --         Library                       5*
  --         10 am 5 pm
  --        
  --



CREATE TABLE class_offerings (
  id SERIAL PRIMARY KEY,
  term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  class_nbr INTEGER NOT NULL,          -- from JSON
  subject VARCHAR(10) NOT NULL,        -- e.g., CSC
  catalog_nbr VARCHAR(10) NOT NULL,    -- e.g., 214
  class_section VARCHAR(10) NOT NULL,  -- e.g., 06
  component VARCHAR(10) NOT NULL,      -- LEC/LAB/ACT
  descr TEXT,                          -- course title/desc

  instruction_mode_descr VARCHAR(50),

  days VARCHAR(20),                    -- "MoWe" etc (from meetings)
  start_time TIME,
  end_time TIME,
  facility_descr TEXT,

  instructor_name VARCHAR(120),

  units DECIMAL(4,2),                  -- safer than INT
  enrollment_available INTEGER,

  last_scraped TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (term_id, class_nbr, days, start_time, end_time, facility_descr)
);



-- Professor ratings (from PolyRatings)
CREATE TABLE professor_ratings (
  id SERIAL PRIMARY KEY,                -- id
  professor_name VARCHAR(100),          -- firstName + lastName
  overall_rating DECIMAL(3,2),          -- overallRating
  student_difficulties DECIMAL(3,2),    -- studentDifficulties
  clarity   DECIMAL(3,2),
  num_evals INTEGER,                    -- numEvals
  last_scraped TIMESTAMP NOT NULL DEFAULT NOW(),
  professor_key UUID UNIQUE NOT NULL
);

-- Professor tags
CREATE TABLE professor_tags (
  professor_id INTEGER NOT NULL REFERENCES professor_ratings(id) ON DELETE CASCADE,
  tag VARCHAR(100) NOT NULL,
  vote_count INTEGER NOT NULL,
  PRIMARY KEY (professor_id, tag)
);


