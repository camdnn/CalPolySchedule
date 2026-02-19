import scrapy
from datetime import datetime


def _parse_time(raw: str | None) -> str | None:
    """
    Convert schedule page time strings to "HH:MM:SS" for PostgreSQL TIME.

    The page uses 12-hour AM/PM format and often puts a non-breaking space
    (\xa0) between the digits and AM/PM, e.g. "12:10\xa0PM" or "08:10 AM".
    strptime would fail without normalising that first.
    """
    if not raw:
        return None
    # Replace non-breaking space (\xa0) and strip normal whitespace
    text = raw.replace("\xa0", " ").strip()
    if not text:
        return None
    for fmt in ("%I:%M %p", "%H:%M", "%I:%M:%S %p", "%H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).strftime("%H:%M:%S")
        except ValueError:
            continue
    return None


class ClassOfferingsSpider(scrapy.Spider):
    """
    Scrapes class offerings from schedules.calpoly.edu and emits normalized
    item dictionaries for DB ingestion by ClassOfferingsPostgresPipeline.

    Flow:
      1. Home/term page: extract term metadata (code/name/date range)
      2. College subject-list pages: collect subject page links
      3. Subject pages: parse one table row per section and yield item
    """

    name = "class_offerings"

    BASE_URL = "https://schedules.calpoly.edu/"

    # One subject-listing page per college, plus the catch-all.
    # Used as fallback if term homepages do not expose the links directly.
    COLLEGE_SUBJECT_PAGES = [
        "all_subject_10-CAGR_curr.htm",  # Ag, Food & Envr Sci
        "all_subject_20-CAED_curr.htm",  # Arch & Envr Design
        "all_subject_40-OCOB_curr.htm",  # Business
        "all_subject_48-CLA_curr.htm",   # Liberal Arts
        "all_subject_52-CENG_curr.htm",  # Engineering
        "all_subject_76-CSM_curr.htm",   # Science & Math
        "all_subject_99-ALL_curr.htm",   # Honors, athletics, etc.
    ]

    # Each spider activates only its own pipeline
    custom_settings = {
        # This spider should only run class-offerings DB writes.
        # Keeping pipelines spider-local prevents accidental cross-writes.
        "ITEM_PIPELINES": {
            "scrapers.pipelines.ClassOfferingsPostgresPipeline": 300,
        },
    }

    # ── Start at the homepage ──────────────────────────────────
    def start_requests(self):
        # Entry point for this spider. We start from the current-term index
        # and then follow term-specific subject links found there.
        yield scrapy.Request(url=self.BASE_URL + "index_curr.htm", callback=self.parse_homepage)

    def parse_homepage(self, response):
        # Term code lives in <span class="term">2262 </span>
        term_code = response.css("span.term::text").get("").strip()

        # Term name is in a season-specific span class
        term_name = ""
        for season in ("termWinter", "termSpring", "termSummer", "termFall"):
            text = response.css(f"span.{season}::text").get("")
            if text.strip():
                term_name = text.strip()
                break

        # Date range, e.g. "January 5, 2026 to March 13, 2026"
        term_date_text = response.css("span.termDate::text").get("").strip()

        if not term_code:
            # If term extraction fails, downstream rows cannot be keyed by term.
            self.logger.error("Could not extract term code from homepage.")
            return

        self.logger.info(f"Term {term_code}: {term_name} ({term_date_text})")

        # Carry term metadata through all requests
        meta = {
            "term_code": term_code,
            "term_name": term_name,
            "term_date_text": term_date_text,
        }

        # Prefer term-specific subject pages linked on the current term homepage.
        subject_pages = {
            href.strip()
            for href in response.css("a[href^='all_subject_'][href$='.htm']::attr(href)").getall()
            if href.strip()
        }

        # Fallback to legacy "_curr" pages if term page does not expose links.
        if not subject_pages:
            # Site occasionally only exposes legacy *_curr links.
            subject_pages = set(self.COLLEGE_SUBJECT_PAGES)

        # ── follow each college's subject-listing page ─────────
        for page in sorted(subject_pages):
            yield scrapy.Request(
                url=response.urljoin(page),
                callback=self.parse_college_subjects,
                meta=meta,
            )

    # ── Step 2: Collect subject page links ─────────────────────────────

    def parse_college_subjects(self, response):
        """
        Each college page has rows like:
          <td class="subjectCode"><a href="subject_CSC_curr.htm">CSC</a></td>
        Follow every subject_*.htm link.
        Scrapy's duplicate filter prevents re-fetching a subject that appears
        under multiple colleges.
        """
        for link in response.css("td.subjectCode a"):
            href = link.attrib.get("href", "")
            if href.startswith("subject_") and href.endswith(".htm"):
                yield scrapy.Request(
                    url=response.urljoin(href),
                    callback=self.parse_subject_page,
                    meta=response.meta,
                )

    # ── Step 3: Parse the class table on a subject page ────────────────

    def parse_subject_page(self, response):
        """
        The table on e.g. subject_CSC_curr.htm contains one <tr> per section:

        Columns (css classes):
          courseName | courseSection | courseClass | courseType |
          courseRequirement | courseRequisites |
          courseDays | startTime | endTime |
          personName | location |
          count (×5: LCap, ECap, Enrl, Wait, Drop) | calendarICS
        """
        term_code = response.meta["term_code"]
        term_name = response.meta["term_name"]
        term_date_text = response.meta["term_date_text"]
        # Term metadata is carried through meta so each yielded section row
        # can be tied to the right term in the DB layer.

        for row in response.css("table#listing tbody tr"):
            # Skip cancelled sections (class="entry1 cancelled")
            if "cancelled" in row.attrib.get("class", ""):
                continue

            # ── Course name (e.g. "CSC 101") ──
            course_text = row.css("td.courseName a::text").get("").strip()
            if not course_text:
                continue
            parts = course_text.split(None, 1)
            if len(parts) < 2:
                continue
            subject, catalog_nbr = parts

            # Course title from the <a title="..."> attribute
            # Format: "Computer Science 101 Fundamentals of Computer Science"
            # We strip the subject-description + catalog_nbr prefix.
            title_attr = row.css("td.courseName a::attr(title)").get("")
            descr = ""
            if title_attr and catalog_nbr in title_attr:
                idx = title_attr.index(catalog_nbr) + len(catalog_nbr)
                descr = title_attr[idx:].strip()

            # ── Class number (unique per section) ──
            # This is the core section identifier used by downstream logic.
            class_nbr_text = row.css("td.courseClass::text").get("").strip()
            if not class_nbr_text or class_nbr_text.startswith("*"):
                continue
            try:
                class_nbr = int(class_nbr_text)
            except ValueError:
                continue

            # ── Other fields ──
            class_section = row.css("td.courseSection::text").get("").strip()
            component = row.css("td.courseType span::text").get("").strip()

            # Days: try inside a <span> first, fall back to direct td text
            # Some rows differ in markup; fallback avoids dropping valid data.
            days = (
                row.css("td.courseDays span::text").get("")
                or row.css("td.courseDays::text").get("")
            ).replace("\xa0", " ").strip() or None

            # Times: normalize \xa0 → space then convert to 24-hour HH:MM:SS
            start_time = _parse_time(row.css("td.startTime::text").get(""))
            end_time   = _parse_time(row.css("td.endTime::text").get(""))

            # Instructor: prefer <a title="Full Name">, fall back to link text
            # then bare td text (personName only present on the first row of
            # each rowspan group; later rows yield None, which is correct)
            instructor_name = (
                row.css("td.personName a::attr(title)").get("")
                or row.css("td.personName a::text").get("")
                or row.css("td.personName::text").get("")
            ).strip() or None

            # Location: prefer <a title="Full Room Name">, fall back to text
            facility_descr = (
                row.css("td.location a::attr(title)").get("")
                or row.css("td.location a::text").get("")
                or row.css("td.location::text").get("")
            ).replace("\xa0", " ").strip() or None

            # ── Enrollment availability ──
            # Count cells in order: LCap, ECap, Enrl, Wait, Drop
            counts = row.css("td.count::text").getall()
            enrollment_available = None
            if len(counts) >= 3:
                try:
                    ecap = int(counts[1].strip())
                    enrl = int(counts[2].strip())
                    enrollment_available = max(0, ecap - enrl)
                except (ValueError, IndexError):
                    pass

            yield {
                # Term context
                "term": term_code,
                "term_name": term_name,
                "term_date_text": term_date_text,
                # Course identity
                "subject": subject,
                "catalog_nbr": catalog_nbr,
                "descr": descr,
                "class_section": class_section,
                "class_nbr": class_nbr,
                "component": component,
                # Meeting details
                "days": days,
                "start_time": start_time,
                "end_time": end_time,
                "instructor_name": instructor_name,
                "facility_descr": facility_descr,
                # Capacity signal used by UI for "open/full"
                "enrollment_available": enrollment_available,
            }
