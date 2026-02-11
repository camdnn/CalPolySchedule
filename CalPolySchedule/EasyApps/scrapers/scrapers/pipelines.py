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




