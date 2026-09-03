# Ayat of The Day

A minimal Cloudflare Worker that posts one randomly selected, previously unpublished Qur'an verse to X every day at 9 PM Asia/Bangkok (14:00 UTC).

The published post always has this exact structure:

```text
Ayat of The Day

[Arabic verse]

[Translation]

Surah [Name] ([surah]:[ayah])
```

The worker never adds tafsir, commentary, labels, links, hashtags, images, or threads. Tafsir and source fields in the verse array are private metadata only.

## Project layout

- `src/ayat.ts` — the source-controlled `AYAT` constant. Add only approved entries.
- `src/index.ts` — rendering, random selection, D1 reservation, X publishing, health check, and dry-run endpoint.
- `migrations/` — D1 publication-history schema.
- `PLAN.md` — product and operations plan.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a D1 database and copy its returned `database_id` into `wrangler.jsonc`:

   ```bash
   npm run db:create
   ```

3. Apply the migration locally during development, then remotely before deployment:

   ```bash
   npm run db:migrate:local
   npm run db:migrate:remote
   ```

4. Copy `.dev.vars.example` to `.dev.vars` for local use and set the production secrets. `X_ACCESS_TOKEN` must be an X OAuth user access token that is authorized to create posts.

   ```bash
   npx wrangler secret put X_ACCESS_TOKEN
   npx wrangler secret put ADMIN_TOKEN
   ```

5. Add verified entries to `src/ayat.ts`, then check and deploy:

   ```bash
   npm run check
   npm test
   npm run deploy
   ```

## Operations

- `GET /health` returns a small public health response.
- `POST /dry-run` returns one randomly selected *unpublished* post without reserving or publishing it. Send `Authorization: Bearer <ADMIN_TOKEN>`.
- The Cron Trigger in `wrangler.jsonc` is `0 14 * * *`, which is 9 PM in Bangkok all year.
- D1 reserves an `ayat_id` before the X request, and its primary key blocks duplicate selection by overlapping runs. An explicit X failure is marked `failed` and is not randomly replaced. If X succeeds but recording the success fails, the record remains `reserved`; investigate it before any retry because X may already have published it.

Do not commit `.dev.vars` or X credentials. The initial `AYAT` array is empty by design: add only text and translations that have been verified and are permitted for reuse.
