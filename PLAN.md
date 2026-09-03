# Ayat of The Day — lean production plan

## Goal

Publish one randomly selected, prewritten Qur'an verse every day to X at **9:00 PM Asia/Bangkok**. The public post contains only the title, Arabic verse, translation, and surah/ayah reference. A verse must never be selected again after it has been published. The project is educational; it must not present itself as a fatwa service or replace qualified scholarship.

## Recommended first release

Build a static content array and a serverless publisher. Do not generate or research religious content automatically at posting time.

1. A human curator prepares and reviews the entries before they are added to the array (start with at least 30).
2. A scheduled Cloudflare Worker randomly selects one unpublished entry and creates its X post.
3. The Worker records the result, preventing accidental duplicate posts and alerting the operator on failures.

This keeps the recurring workload to a short monthly editorial session and makes the only unavoidable recurring cost the X publishing API.

## Cheapest practical stack

| Need                       | Choice                                                             | Cost / reason                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Scheduler + publisher      | Cloudflare Workers Cron Trigger                                    | Free tier is sufficient for one daily request; reliable server-side timing.                                                     |
| Verse content              | A versioned TypeScript/JavaScript constant array in the repository | Free, simple to review, and has no runtime content-management dependency.                                                       |
| Publication history/status | Cloudflare D1                                                      | Free-tier compatible; durable state prevents a random selection from being published twice.                                     |
| Secrets                    | Cloudflare Worker Secrets                                          | Keeps X credentials out of the repository.                                                                                      |
| Source control and review  | Private GitHub repository                                          | Free for a small project; pull requests provide a review trail.                                                                 |
| Social delivery            | X API v2, pay-per-use                                              | Current official documentation lists `Content: Create` at **US$0.015/request**; verify in the Developer Console before funding. |

At one post/day, the X API estimate is about **US$0.45/month** (30 × $0.015), excluding any credit-purchase or tax minimums. Do not include a URL: X currently lists a content-create request with a URL at **US$0.20**, which would make a daily linked post roughly **US$6/month**. Avoid image generation, paid databases, hosted CMS products, and an LLM API in the MVP.

Pricing and tier rules can change, so the X Developer Console is the final source of truth. References: [X API pricing](https://docs.x.com/x-api/getting-started/pricing), [X Developer Console](https://docs.x.com/fundamentals/developer-portal).

## Publishing format

Publish exactly **one post per day**—the lowest-cost mode. It must contain only the following fields, in this order. The text validator must reject a post over X's current character limit before any API call.

Suggested shape:

```text
Ayat of The Day

…Arabic verse…

…translation…

Surah Al-Baqarah (2:286)
```

Do not add labels, hashtags, commentary, tafsir, links, images, or a reply thread to this format. Keep URLs out of the post; X currently charges materially more for a content-create request with a URL. If a verse plus its translation cannot fit, the record is ineligible until its translation is shortened or a permitted shorter translation is selected.

## Editorial workflow and safeguards

Create every entry from recognized, traceable sources. Store the exact edition/translator and a stable verse identifier (surah and ayah); do not rely only on copied text from social media.

For each daily entry, a reviewer checks:

- Arabic text and verse reference against an authoritative Qur'an text source.
- Translation permissions and attribution. Use a translation whose license permits the intended reuse, or obtain permission.
- Any stored tafsir note has accurate attribution, paraphrase, and permitted reuse.
- Character count and the final rendered single post are correct.

AI may assist with a private drafting/checklist step, but it must never be the sole source of Arabic, translation, citation, or tafsir. Human approval is mandatory before an entry can be posted.

## Content model

Keep the available verses in a source-controlled constant such as `src/ayat.ts`. The Worker deploy includes this array; it does not fetch or create content at runtime.

Example:

```ts
export const AYAT = [
  {
  id: "002-286",
    surah: 2,
    ayah: 286,
    arabic: "…",
    translation: "…",
    translation_credit: "Sahih International",
    surah_name: "Al-Baqarah",
    tafsir_note: "…",
    tafsir_sources: [{ work: "…", edition_or_url: "…", locator: "…" }],
    approved_by: "…",
    approved_at: "…",
  },
] as const;
```

The D1 `published_ayat` table contains, at minimum, `ayat_id` (unique), `published_at`, `x_post_id`, `rendered_text`, and `status`. The `ayat_id` unique constraint is the definitive protection against duplicate publication. Preserve immutable source details and published text so corrections have an audit trail.

Entries may exist in the constant array only after they have been checked for source accuracy and permissions. Tafsir fields are private metadata for verification or a future website; they are never rendered in the X post. Their daily selection order is random; the editorial review does not dictate the day on which an entry appears.

## Worker behavior

The Cron Trigger runs at `0 14 * * *` (14:00 UTC = 21:00 in Asia/Bangkok, which has no daylight-saving change).

1. Acquire a short lock so a retried or overlapping run cannot double-post.
2. Query `published_ayat` to identify IDs already published, then randomly choose from the remaining IDs in `AYAT`.
3. If no entries remain, exit safely and alert the operator to add more entries.
4. Render and validate the selected entry against the fixed single-post format and character limit.
5. Reserve the chosen `ayat_id` in D1 using its unique constraint before posting. If another run won the reservation, select again or exit.
6. Call X's create-post endpoint once.
7. Persist the post ID, timestamp, response metadata, and final rendered text, marking the reservation `posted`.
8. On a transient error, retry with bounded backoff; otherwise retain the failure record and send a low-cost alert (email/webhook). A manual retry uses that same reserved verse rather than choosing a new one.

The job must be idempotent: a second invocation after a successful X response must detect the reservation/stored post ID and exit without another API call. No code path may randomly choose from records that already have a publication-history record.

## Security and operations

- Create an X developer app with only the write permissions required for publishing.
- Put OAuth credentials in Worker Secrets; never commit them or paste them in issue trackers.
- Restrict the future admin interface with identity-based access. Until then, edits happen through reviewed commits.
- Add a monthly X-credit budget/alert and a Worker error alert.
- Log only operational metadata; avoid logging secrets or token-bearing API responses.
- Add a manual `dry_run` mode that renders the next post without sending it to X.

## Delivery phases

### Phase 0 — editorial foundation (1–2 days)

Choose permitted Arabic/translation/tafsir sources, write attribution conventions, and prepare/review at least 30 array entries. Agree on the account voice and whether explanatory text is English-only or bilingual.

### Phase 1 — automated pilot (1–2 days)

Implement the Worker, constant-array loader, validator, random-unpublished selector, D1 publication history, dry-run command, and X API client. Publish to a test X account on demand, then use the 9 PM schedule for a seven-day monitored pilot.

### Phase 2 — dependable daily operation (after pilot)

Keep verse content in the source-controlled constant array, add simple failure alerts and a monthly audit report, and maintain at least 30 available entries. Review engagement manually using X's native analytics rather than paid analytics APIs.

### Phase 3 — optional expansion

Add a small static website for complete sources and longer tafsir, an approval UI, accessibility-conscious images, other platforms, or multilingual tracks—only after the daily pipeline is stable and their incremental costs are accepted.

## Definition of done for the MVP

- One approved record can be dry-run and rendered correctly.
- The Worker posts it exactly once at 9 PM Bangkok time to a test account.
- A duplicate Cron invocation does not create a duplicate post.
- A failed API call is recorded and visible to the operator.
- At least 30 reviewed entries exist in the constant array before the public account launches.
- Tests demonstrate that a published/reserved `ayat_id` is excluded from all future random selections, including overlapping Cron runs.
- The X API budget is funded and an alert is configured.

## Decisions needed before implementation

1. Translation language: select the language used after the required Arabic verse.
2. Source policy: permitted Arabic-text and translation source(s); retain tafsir sources only if that private metadata is needed.
3. Translation policy: select a permitted translation that fits the fixed one-post format for each verse.
4. Account owner/reviewer: the person who gives final approval for religious content and handles corrections.
