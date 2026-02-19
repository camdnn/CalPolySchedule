import os
import re
import json
from urllib.request import urlopen
from datetime import datetime
from pathlib import Path

import psycopg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

POLYRATINGS_URL = "https://api-prod.polyratings.org/professors.all"


def _normalize_professor_item(raw):
    professor_id = raw.get("professor_id", raw.get("id"))
    first = raw.get("firstName", "")
    last = raw.get("lastName", "")
    name = raw.get("name")
    if not name:
        name = f"{last}, {first}".strip(", ").strip()

    return {
        "professor_id": professor_id,
        "name": name,
        "overallRating": raw.get("overallRating"),
        "studentDifficulties": raw.get("studentDifficulties"),
        "clarity": raw.get("clarity", raw.get("materialClear")),
        "numEvals": raw.get("numEvals"),
        "tags": raw.get("tags", {}),
    }


def _fetch_polyratings_professors(timeout=30):
    with urlopen(POLYRATINGS_URL, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return payload.get("result", {}).get("data", [])


def _apply_professor_snapshot(conn, cur, professors):
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
    professor_name          = EXCLUDED.professor_name,
    overall_rating          = EXCLUDED.overall_rating,
    student_difficulties    = EXCLUDED.student_difficulties,
    clarity                 = EXCLUDED.clarity,
    num_evals               = EXCLUDED.num_evals,
    last_scraped            = NOW()
    RETURNING id;
    """

    INSERT_TAG = """
    INSERT INTO professor_tags (professor_id, tag, vote_count)
    VALUES(%s, %s, %s)
    ON CONFLICT DO NOTHING;
    """

    DELETE_TAGS = "DELETE FROM professor_tags WHERE professor_id = %s;"

    with conn.transaction():
        for prof in professors:
            item = _normalize_professor_item(prof)
            if not item["professor_id"]:
                continue

            cur.execute(UPSERT_PROF, (
                item["name"],
                item["overallRating"],
                item["studentDifficulties"],
                item["clarity"],
                item["numEvals"],
                item["professor_id"],
            ))

            row = cur.fetchone()
            if row is None:
                raise RuntimeError("Upsert did not return id")

            professor_db_id = row[0]
            cur.execute(DELETE_TAGS, (professor_db_id,))

            tags_list = item["tags"] or {}
            for key, value in tags_list.items():
                cur.execute(INSERT_TAG, (professor_db_id, key, value))


class PolyRatingsPostgresPipeline:

    def open_spider(self, spider):
        self.conn = psycopg.connect(os.environ["DATABASE_URL"])
        self.cur = self.conn.cursor()
        self._items = []

    def process_item(self, item, spider):
        self._items.append(dict(item))
        return item

    # close cursor connection
    def close_spider(self, spider):
        if self._items:
            try:
                _apply_professor_snapshot(self.conn, self.cur, self._items)
            except Exception as exc:
                spider.logger.error(
                    "Professor refresh failed, preserving previous professor data: %s",
                    exc,
                )
        self.cur.close()
        self.conn.close()


class ClassOfferingsPostgresPipeline:
    """
    Receives items from ClassOfferingsSpider and UPSERTs them into
    the class_offerings table.  Auto-creates the term row if needed.
    """

    def open_spider(self, spider):
        self.conn = psycopg.connect(os.environ["DATABASE_URL"])
        self.cur = self.conn.cursor()
        self._term_id_cache = {}    # term_code → term_id
        self._cleared_terms = set() # term_ids already wiped this run
        self._saw_new_term = False

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
            self.cur.execute(
                "SELECT id FROM terms WHERE term_code = %s;",
                (term_code,),
            )
            existing_row = self.cur.fetchone()

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

        term_id = row[0]
        if existing_row is None:
            self._saw_new_term = True
        self._term_id_cache[term_code] = term_id

        # First time we see this term in the run: delete all existing offerings
        # so stale / null-value rows from previous scrapes don't linger.
        if term_id not in self._cleared_terms:
            with self.conn.transaction():
                self.cur.execute(
                    "DELETE FROM class_offerings WHERE term_id = %s;",
                    (term_id,),
                )
            self._cleared_terms.add(term_id)

        return term_id

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
                item.get("start_time"),   # "HH:MM:SS" 24-hour from _parse_time
                item.get("end_time"),
                item.get("facility_descr"),
                item.get("instructor_name"),
                item.get("enrollment_available"),
            ))

        return item

    def close_spider(self, spider):
        if self._saw_new_term:
            try:
                professors = _fetch_polyratings_professors()
                _apply_professor_snapshot(self.conn, self.cur, professors)
                spider.logger.info(
                    "Detected a new term; refreshed professor ratings from PolyRatings."
                )
            except Exception as exc:
                spider.logger.error(
                    "New term detected, but professor refresh failed. Keeping previous data: %s",
                    exc,
                )

        self.cur.close()
        self.conn.close()
