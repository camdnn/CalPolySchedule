import scrapy

class PolyRatingsSpider(scrapy.Spider):
    name = "polyratings"
    start_urls = ["https://api-prod.polyratings.org/professors.all"]  # URL to profs

    custom_settings = {
        "ITEM_PIPELINES": {
            "scrapers.pipelines.PolyRatingsPostgresPipeline": 300,
        },
    }

    def parse(self, response):
        payload = response.json()
        professors = payload.get("result", {}).get("data", [])

        for prof in professors:  # first 20 for testing
            professor_id = prof.get("id")
            first = prof.get("firstName", "")
            last = prof.get("lastName", "")
            name = f"{last}, {first}".strip(", ").strip()

            yield {
                "professor_id": professor_id,
                "name": name,
                "overallRating": prof.get("overallRating"),
                "studentDifficulties": prof.get("studentDifficulties"),
                "clarity": prof.get("materialClear"),
                "numEvals": prof.get("numEvals"),
                "tags": prof.get("tags", {}),
            }

