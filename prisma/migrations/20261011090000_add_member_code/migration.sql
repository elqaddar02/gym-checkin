-- Every member gets a reception code. Existing members are numbered 1, 2, 3…
-- in the order they joined; new ones take the last code + 1.
ALTER TABLE "members" ADD COLUMN "code" INTEGER;

UPDATE "members" AS m
SET "code" = numbered.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS rn
  FROM "members"
) AS numbered
WHERE m."id" = numbered."id";

ALTER TABLE "members" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "members_code_key" ON "members"("code");
