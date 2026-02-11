import scrapy


class ClassOfferingsSpider(scrapy.Spider):
    """
    Scrapes all class offerings for the current term from schedules.calpoly.edu.

    Flow:
      1. Homepage  → extract term code (e.g. "2262") and term name
      2. 7 college subject-listing pages → collect subject page links
      3. Each subject page (e.g. subject_CSC_curr.htm) has every section
         for that subject in one HTML table → parse rows → yield items
    """

    name = "class_offerings"

    BASE_URL = "https://schedules.calpoly.edu/"

    # One subject-listing page per college, plus the catch-all
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
        "ITEM_PIPELINES": {
            "scrapers.pipelines.ClassOfferingsPostgresPipeline": 300,
        },
    }

    # ── Step 1: Start at the homepage ──────────────────────────────────

    def start_requests(self):
        yield scrapy.Request(
            url=self.BASE_URL + "index_curr.htm",
            callback=self.parse_homepage,
        )

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
            self.logger.error("Could not extract term code from homepage.")
            return

        self.logger.info(f"Term {term_code}: {term_name} ({term_date_text})")

        # Carry term metadata through all subsequent requests
        meta = {
            "term_code": term_code,
            "term_name": term_name,
            "term_date_text": term_date_text,
        }

        # ── Step 2: follow each college's subject-listing page ─────────
        for page in self.COLLEGE_SUBJECT_PAGES:
            yield scrapy.Request(
                url=self.BASE_URL + page,
                callback=self.parse_college_subjects,
                meta=meta,
            )

    # ── Step 2: Collect subject page links ─────────────────────────────

    def parse_college_subjects(self, response):
        """
        Each college page has rows like:
          <td class="subjectCode"><a href="subject_CSC_curr.htm">CSC</a></td>
        Follow every subject_*_curr.htm link.
        Scrapy's dupe filter prevents re-fetching a subject that appears
        under multiple colleges.
        """
        for link in response.css("td.subjectCode a"):
            href = link.attrib.get("href", "")
            if href.startswith("subject_") and href.endswith("_curr.htm"):
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
            days = row.css("td.courseDays span::text").get("").strip() or None
            start_time = row.css("td.startTime::text").get("").strip() or None
            end_time = row.css("td.endTime::text").get("").strip() or None

            # Full instructor name from <a title="Hisham H. Assal">
            instructor_name = (
                row.css("td.personName a::attr(title)").get("").strip() or None
            )

            # Full location from <a title="Pilling Building Room 0247">
            facility_descr = (
                row.css("td.location a::attr(title)").get("").strip() or None
            )

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
                "term": term_code,
                "term_name": term_name,
                "term_date_text": term_date_text,
                "subject": subject,
                "catalog_nbr": catalog_nbr,
                "descr": descr,
                "class_section": class_section,
                "class_nbr": class_nbr,
                "component": component,
                "days": days,
                "start_time": start_time,
                "end_time": end_time,
                "instructor_name": instructor_name,
                "facility_descr": facility_descr,
                "enrollment_available": enrollment_available,
            }
