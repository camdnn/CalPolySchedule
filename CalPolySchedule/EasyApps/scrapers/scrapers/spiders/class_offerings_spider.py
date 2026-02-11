import scrapy
from urllib.parse import urlencode

class ClassOfferingsSpider(scrapy.Spider):
    name = "class_offerings"
    
    #starter url
    API_URL = "https://cmsweb.pscs.calpoly.edu/psc/CSLOPRD/EMPLOYEE/SA/s/WEBLIB_HCX_CM.H_CLASS_SEARCH.FieldFormula.IScript_ClassSearch"

    def start_requests(self):
        # Start with page 1 only. We learn term + pageCount from its JSON.
        params = {
            "institution": "SLCMP",
            "term": "2262",          # TEMP bootstrap (see parse_first_page to make it dynamic)
            "enrl_stat": "O",
            "crse_attr": "",
            "crse_attr_value": "",
            "page": 1,
        }
        url = f"{self.API_URL}?{urlencode(params)}"
        yield scrapy.Request(url=url, callback=self.parse_first_page, cb_kwargs={"params_base": params})

    def parse_first_page(self, response, params_base):
        data = response.json()

        # 1) Extract the list of classes from the JSON.
        # You will set this to the correct key path once you confirm it.
        classes = data.get("classes") or data.get("result", {}).get("data") or []

        if not classes:
            self.logger.warning("No classes found on page 1; check JSON key path.")
            return

        # 2) Term becomes dynamic: read from the first class object.
        term = classes[0].get("strm")

        # 3) Page count becomes dynamic.
        page_count = data.get("pageCount") or data.get("totalPages") or 1

        # 4) Parse page 1 items.
        yield from self.parse_classes(classes, term)

        # 5) Schedule remaining pages.
        for page in range(2, int(page_count) + 1):
            params = dict(params_base)
            params["term"] = term
            params["page"] = page
            url = f"{self.API_URL}?{urlencode(params)}"
            yield scrapy.Request(url=url, callback=self.parse_page, cb_kwargs={"term": term})

    def parse_page(self, response, term):
        data = response.json()
        classes = data.get("classes") or data.get("result", {}).get("data") or []
        yield from self.parse_classes(classes, term)

    def parse_classes(self, classes, term):
        # This function flattens each class’s meetings into one-row-per-meeting.
        for cls in classes:
            # pick the instructor name: sometimes it's in instructors[], sometimes in each meeting
            instructor_name = None
            if cls.get("instructors"):
                instructor_name = cls["instructors"][0].get("name")

            for mtg in cls.get("meetings", []) or []:
                yield {
                    "term": term,
                    "subject": cls.get("subject"),
                    "catalog_nbr": cls.get("catalog_nbr"),
                    "descr": cls.get("descr"),
                    "component": cls.get("component"),
                    "class_section": cls.get("class_section"),
                    "class_nbr": cls.get("class_nbr"),
                    "units": cls.get("units"),
                    "instruction_mode_descr": cls.get("instruction_mode_descr"),

                    "days": mtg.get("days"),
                    "start_time": mtg.get("start_time"),
                    "end_time": mtg.get("end_time"),
                    "facility_descr": mtg.get("facility_descr"),
                    "instructor_name": mtg.get("instructor") or instructor_name,
                }

