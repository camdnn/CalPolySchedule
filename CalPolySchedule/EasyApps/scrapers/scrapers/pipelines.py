import re
from datetime import datetime

import psycopg


class PolyRatingsPostgresPipeline:

    def open_spider(self, spider):
        # want to create a pipeline that grabs spider data and inserts values into db
        # connect to the db
        self.conn = psycopg.connect(
            "host=localhost dbname=postgres"
        )
        # creates a cursor obj to do SQL queries
        self.cur = self.conn.cursor()

    def process_item(self, item, spider):
        print("IN:", item["professor_id"])


        #insert data into db if new, or updates if exists
        # UPSERT operation that automically inserts a new row or updates
        UPSERT_PROF = """
        INSERT INTO professor_ratings (
        professor_name,
        overall_rating,
        student_difficulties,
        clarity,
        num_evals,
        last_scraped,
        professor_key
        )
        VALUES (%s, %s, %s, %s, %s, NOW(), %s)
        ON CONFLICT (professor_key)
        DO UPDATE SET
        professor_name = EXCLUDED.professor_name,
        overall_rating = EXCLUDED.overall_rating,
        student_difficulties = EXCLUDED.student_difficulties,
        clarity = EXCLUDED.clarity,
        num_evals = EXCLUDED.num_evals,
        last_scraped = NOW()
        RETURNING id;
        """

        #for inserts in professor tags
        INSERT_TAG = """
        INSERT INTO professor_tags (professor_id, tag, vote_count)
        VALUES(%s, %s, %s)
        ON CONFLICT DO NOTHING;
        """

        #refresh the tags
        DELETE_TAGS = "DELETE FROM professor_tags WHERE professor_id = %s;"

        #execute -- auto commit and rollback
        with self.conn.transaction():
            self.cur.execute(UPSERT_PROF, (
                item["name"],
                item["overallRating"],
                item["studentDifficulties"],
                item["clarity"],
                item["numEvals"],
                item["professor_id"],
            ))

            # get returned internal id (row = (id,))
            row = self.cur.fetchone()
            if row is None:
                # handle error: upsert didn't return id
                raise RuntimeError("Upsert did not return id")

            professor_db_id = row[0]

            self.cur.execute(DELETE_TAGS, (professor_db_id,))

            tags_list = item["tags"] or {}
            for key, value in tags_list.items():
                self.cur.execute(INSERT_TAG, (professor_db_id, key, value))

        return item

    # close cursor connection
    def close_spider(self, spider):
        self.cur.close()
        self.conn.close()


class ClassOfferingsPostgresPipeline:
    """
    Receives items from ClassOfferingsSpider and UPSERTs them into
    the class_offerings table.  Auto-creates the term row if needed.
    """

    def open_spider(self, spider):
        self.conn = psycopg.connect("host=localhost dbname=postgres")
        self.cur = self.conn.cursor()
        self._term_id_cache = {}   # term_code → term_id

    # ── term helper ────────────────────────────────────────────────────

    def _get_or_create_term(self, item):
        term_code = item["term"]
        if term_code in self._term_id_cache:
            return self._term_id_cache[term_code]

        # parse start / end dates from e.g. "January 5, 2026 to March 13, 2026"
        term_start = None
        term_end = None
        term_date_text = item.get("term_date_text", "")
        if " to " in term_date_text:
            try:
                parts = term_date_text.split(" to ")
                term_start = datetime.strptime(parts[0].strip(), "%B %d, %Y").date()
                term_end = datetime.strptime(parts[1].strip(), "%B %d, %Y").date()
            except (ValueError, IndexError):
                pass

        # derive academic_year: Fall → same year, else year-1
        term_name = item.get("term_name", "")
        academic_year = 2025  # fallback
        year_match = re.search(r"(\d{4})", term_name)
        if year_match:
            year = int(year_match.group(1))
            academic_year = year if "Fall" in term_name else year - 1

        with self.conn.transaction():
            self.cur.execute("""
                INSERT INTO terms
                    (term_code, term_name, term_start, term_end,
                     academic_year, is_active, last_scraped)
                VALUES (%s, %s, %s, %s, %s, true, NOW())
                ON CONFLICT (term_code) DO UPDATE SET
                    term_name   = EXCLUDED.term_name,
                    term_start  = EXCLUDED.term_start,
                    term_end    = EXCLUDED.term_end,
                    is_active   = true,
                    last_scraped = NOW()
                RETURNING id;
            """, (term_code, term_name, term_start, term_end, academic_year))
            row = self.cur.fetchone()

        self._term_id_cache[term_code] = row[0]
        return row[0]

    # ── main insert ────────────────────────────────────────────────────

    def process_item(self, item, spider):
        term_id = self._get_or_create_term(item)

        UPSERT = """
        INSERT INTO class_offerings (
            term_id, class_nbr, subject, catalog_nbr, class_section,
            component, descr, days, start_time, end_time,
            facility_descr, instructor_name,
            enrollment_available, last_scraped
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                %s::time, %s::time,
                %s, %s, %s, NOW())
        ON CONFLICT (term_id, class_nbr, days, start_time, end_time, facility_descr)
        DO UPDATE SET
            subject              = EXCLUDED.subject,
            catalog_nbr          = EXCLUDED.catalog_nbr,
            class_section        = EXCLUDED.class_section,
            component            = EXCLUDED.component,
            descr                = EXCLUDED.descr,
            instructor_name      = EXCLUDED.instructor_name,
            enrollment_available = EXCLUDED.enrollment_available,
            last_scraped         = NOW();
        """

        with self.conn.transaction():
            self.cur.execute(UPSERT, (
                term_id,
                item["class_nbr"],
                item["subject"],
                item["catalog_nbr"],
                item["class_section"],
                item["component"],
                item.get("descr"),
                item.get("days"),
                item.get("start_time"),   # e.g. "08:10 AM" or None
                item.get("end_time"),
                item.get("facility_descr"),
                item.get("instructor_name"),
                item.get("enrollment_available"),
            ))

        return item

    def close_spider(self, spider):
        self.cur.close()
        self.conn.close()

