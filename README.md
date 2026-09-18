# Gym Check-In

Reception check-in (offline-first) + owner member management and dashboard.
Next.js 16 · Prisma 7 / Postgres · NextAuth (credentials) · shadcn/ui.

| URL | Who | Auth |
| --- | --- | --- |
| `/checkin` | Receptionist (tablet) | none — works offline |
| `/members` | Owner | login |
| `/dashboard` | Owner | login |

## Setup

```bash
npm install
cp .env.example .env        # then fill DATABASE_URL and NEXTAUTH_SECRET
npm run db:migrate          # creates tables (and the database if missing)
npm run owner -- mouad owner@example.com "a-long-password"
npm run dev
```

Import existing members (optional; try `--dry-run` first):

```bash
npm run import:members -- members.csv --dry-run
```

CSV columns: `name, phone, notes, start_date, end_date, amount, payment_method, receipt_number, status`.
Only `name` and `phone` are required. Dates `YYYY-MM-DD` or `DD/MM/YYYY`. Comma or semicolon separated.

## How it works

**Status** is computed from the most recently started subscription:
active and `end_date >= today` → 🟢 paid · `paused` → 🟡 (end date = return date) ·
otherwise → 🔴 expired · no subscription → ⚫ blocked.
Expired and paused members can be let in with an override reason.

**Offline.** Every check-in is written to IndexedDB *first*, then sent to
`POST /api/checkins/batch`. Ids are generated on the tablet, so retries are idempotent.
The queue is flushed on reconnect, every 15 s, and via Background Sync (Chromium).
The member list is cached in IndexedDB and refreshed every 2 minutes.

The service worker (`public/sw.js`) is only registered in production builds.
To test offline locally: `npm run build && npm start`, open `/checkin` once online,
then go offline in DevTools and reload.

**Owner sign-in** uses the identifiant (3-32 characters, lowercase) set by
`npm run owner`. The email on the account still works as a sign-in, and is there
so the owner can be reached if they forget the identifiant.

**Revenue** on the dashboard = subscriptions whose period *starts* in the current month.

## Deploy (Vercel)

1. Create a Postgres database (Neon / Vercel Postgres); set `DATABASE_URL`,
   `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_GYM_TZ` in the project.
2. Run migrations against it: `npm run db:deploy`.
3. Create the owner: `npm run owner -- <identifiant> <email> "<password>"` (with production `DATABASE_URL`).
4. On the reception tablet, open `/checkin` once while online and "Add to Home Screen".
