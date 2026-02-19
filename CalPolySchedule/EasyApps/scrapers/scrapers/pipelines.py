import os
import re
import json
from urllib.request import urlopen
from datetime import datetime
from pathlib import Path

import psycopg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

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
    Collects all scraped items in memory, then bulk-replaces each term's
    class_offerings in a single transaction at close_spider.

    This is much faster than per-row inserts (one DB round-trip instead of
    ~5,000) and is safer: if the spider crashes mid-scrape, the old data
    remains untouched because nothing is written until close_spider.
    """

    def open_spider(self, spider):
        self.conn = psycopg.connect(os.environ["DATABASE_URL"])
        self.cur = self.conn.cursor()
        self._items = []          # all yielded items, collected in memory
        self._term_meta = {}      # term_code → first item seen (carries metadata)

    # ── term helper ────────────────────────────────────────────────────

    def _get_or_create_term(self, item):
        """Upsert the term row and return (term_id, is_new)."""
        term_code = item["term"]

        term_start = None
        term_end = None
        term_date_text = item.get("term_date_text", "")
        if " to " in term_date_text:
            try:
                parts = term_date_text.split(" to ")
                term_start = datetime.strptime(parts[0].strip(), "%B %d, %Y").date()
                term_end   = datetime.strptime(parts[1].strip(), "%B %d, %Y").date()
            except (ValueError, IndexError):
                pass

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
                    term_name    = EXCLUDED.term_name,
                    term_start   = EXCLUDED.term_start,
                    term_end     = EXCLUDED.term_end,
                    is_active    = true,
                    last_scraped = NOW()
                RETURNING id;
            """, (term_code, term_name, term_start, term_end, academic_year))
            row = self.cur.fetchone()

        term_id = row[0]
        is_new  = existing_row is None
        return term_id, is_new

    # ── collect only — no DB writes here ───────────────────────────────

    def process_item(self, item, spider):
        term_code = item["term"]
        if term_code not in self._term_meta:
            self._term_meta[term_code] = dict(item)
        self._items.append(dict(item))
        return item

    # ── bulk write at the end ───────────────────────────────────────────

    def close_spider(self, spider):
        if not self._items:
            self.cur.close()
            self.conn.close()
            return

        # Group items by term so we can replace each term atomically.
        from collections import defaultdict
        by_term: dict[str, list] = defaultdict(list)
        for item in self._items:
            by_term[item["term"]].append(item)

        INSERT = """
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

        saw_new_term = False

        for term_code, items in by_term.items():
            term_id, is_new = self._get_or_create_term(self._term_meta[term_code])
            if is_new:
                saw_new_term = True

            rows = [
                (
                    term_id,
                    item["class_nbr"],
                    item["subject"],
                    item["catalog_nbr"],
                    item["class_section"],
                    item["component"],
                    item.get("descr"),
                    item.get("days"),
                    item.get("start_time"),
                    item.get("end_time"),
                    item.get("facility_descr"),
                    item.get("instructor_name"),
                    item.get("enrollment_available"),
                )
                for item in items
            ]

            # Single transaction per term: delete stale rows then bulk insert.
            with self.conn.transaction():
                self.cur.execute(
                    "DELETE FROM class_offerings WHERE term_id = %s;",
                    (term_id,),
                )
                self.cur.executemany(INSERT, rows)

            spider.logger.info(
                "Term %s: wrote %d class offerings.", term_code, len(rows)
            )

        if saw_new_term:
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
