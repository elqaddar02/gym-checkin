-- AlterTable
ALTER TABLE "owners" ADD COLUMN "username" TEXT;

-- Existing accounts have to keep working, so the identifiant starts out as the
-- part of the email before the "@", cut down to the characters sign-in allows.
UPDATE "owners"
SET "username" = coalesce(
  nullif(regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]', '', 'g'), ''),
  'proprietaire'
);

-- Two owners can share that prefix (a@x.ma and a@y.ma); oldest keeps it.
UPDATE "owners" AS o
SET "username" = o."username" || d."rn"
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "username" ORDER BY "created_at", "id") AS "rn"
  FROM "owners"
) AS d
WHERE d."id" = o."id" AND d."rn" > 1;

ALTER TABLE "owners" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "owners_username_key" ON "owners"("username");
