import scrapy


class PolyRatingsSpider(scrapy.Spider):
    # Spider id used in `scrapy crawl polyratings`
    name = "polyratings"
    # Single JSON endpoint containing all professor records.
    start_urls = ["https://api-prod.polyratings.org/professors.all"]

    custom_settings = {
        # Keep DB writes isolated to the PolyRatings pipeline.
        "ITEM_PIPELINES": {
            "scrapers.pipelines.PolyRatingsPostgresPipeline": 300,
        },
    }

    def parse(self, response):
        # API shape: { result: { data: [...] } }
        payload = response.json()
        professors = payload.get("result", {}).get("data", [])

        # Yield one normalized item per professor.
        # Pipeline handles upsert + tag refresh.
        for prof in professors:
            professor_id = prof.get("id")
            first = prof.get("firstName", "")
            last = prof.get("lastName", "")
            name = f"{last}, {first}".strip(", ").strip()

            yield {
                # Stable external id used as upsert key in DB.
                "professor_id": professor_id,
                "name": name,
                # Core score dimensions surfaced in frontend filters/cards.
                "overallRating": prof.get("overallRating"),
                "studentDifficulties": prof.get("studentDifficulties"),
                "clarity": prof.get("materialClear"),
                "numEvals": prof.get("numEvals"),
                # tags: { "Accessible Outside Class": 12, ... }
                "tags": prof.get("tags", {}),
            }
