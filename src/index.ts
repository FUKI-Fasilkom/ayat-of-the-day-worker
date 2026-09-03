import { AYAT, type Ayat } from "./ayat.ts";

export interface Env {
  DB: D1Database;
  X_ACCESS_TOKEN: string;
  ADMIN_TOKEN: string;
  X_API_BASE_URL?: string;
}

type PublicationStatus = "reserved" | "posted" | "failed";

type Publication = {
  ayat_id: string;
  status: PublicationStatus;
  rendered_text: string;
  x_post_id: string | null;
};

const TITLE = "Ayat of The Day";
const MAX_POST_CODEPOINTS = 280;
const X_CREATE_POST_PATH = "/2/tweets";

export function renderPost(ayat: Ayat): string {
  return [
    TITLE,
    "",
    ayat.arabic.trim(),
    "",
    ayat.translation.trim(),
    "",
    `Surah ${ayat.surahName.trim()} (${ayat.surah}:${ayat.ayah})`,
  ].join("\n");
}

export function postCodepointCount(text: string): number {
  return Array.from(text).length;
}

function validateAyat(ayat: Ayat): string {
  if (!/^[0-9]{3}-[0-9]{3}$/.test(ayat.id)) {
    throw new Error(`Invalid ayat ID: ${ayat.id}`);
  }
  if (!ayat.arabic.trim() || !ayat.translation.trim() || !ayat.surahName.trim()) {
    throw new Error(`Ayat ${ayat.id} is missing required post content.`);
  }
  if (!Number.isInteger(ayat.surah) || ayat.surah < 1 || ayat.surah > 114) {
    throw new Error(`Ayat ${ayat.id} has an invalid surah number.`);
  }
  if (!Number.isInteger(ayat.ayah) || ayat.ayah < 1) {
    throw new Error(`Ayat ${ayat.id} has an invalid ayah number.`);
  }

  const rendered = renderPost(ayat);
  if (postCodepointCount(rendered) > MAX_POST_CODEPOINTS) {
    throw new Error(`Ayat ${ayat.id} exceeds the ${MAX_POST_CODEPOINTS}-character post limit.`);
  }
  return rendered;
}

function randomIndex(length: number): number {
  if (length < 1) throw new Error("Cannot choose from an empty list.");
  return crypto.getRandomValues(new Uint32Array(1))[0] % length;
}

function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function unpublishedAyat(ayat: readonly Ayat[], unavailable: ReadonlySet<string>): Ayat[] {
  return ayat.filter((entry) => !unavailable.has(entry.id));
}

async function alreadyReservedOrPublished(env: Env): Promise<Set<string>> {
  const result = await env.DB.prepare("SELECT ayat_id FROM published_ayat").all<{ ayat_id: string }>();
  return new Set(result.results.map((row) => row.ayat_id));
}

async function reserve(env: Env, ayat: Ayat, rendered: string): Promise<boolean> {
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO published_ayat
      (ayat_id, status, reserved_at, rendered_text)
     VALUES (?, 'reserved', ?, ?)`,
  )
    .bind(ayat.id, new Date().toISOString(), rendered)
    .run();
  return result.meta.changes === 1;
}

async function markFailed(env: Env, ayatId: string, detail: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE published_ayat SET status = 'failed', failure_detail = ? WHERE ayat_id = ?",
  )
    .bind(detail.slice(0, 1_000), ayatId)
    .run();
}

async function markPosted(env: Env, ayatId: string, postId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE published_ayat
     SET status = 'posted', published_at = ?, x_post_id = ?, failure_detail = NULL
     WHERE ayat_id = ?`,
  )
    .bind(new Date().toISOString(), postId, ayatId)
    .run();
}

async function createXPost(env: Env, text: string): Promise<string> {
  const baseUrl = (env.X_API_BASE_URL ?? "https://api.x.com").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${X_CREATE_POST_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.X_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`X create-post request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const parsed = JSON.parse(body) as { data?: { id?: string } };
  if (!parsed.data?.id) {
    throw new Error("X create-post response did not include a post ID.");
  }
  return parsed.data.id;
}

async function selectAndReserve(env: Env): Promise<{ ayat: Ayat; rendered: string } | null> {
  const unavailable = await alreadyReservedOrPublished(env);
  const candidates = unpublishedAyat(AYAT, unavailable);

  for (const ayat of shuffled(candidates)) {
    const rendered = validateAyat(ayat);
    if (await reserve(env, ayat, rendered)) return { ayat, rendered };
  }
  return null;
}

export async function publishNextAyat(env: Env): Promise<{ status: string; ayatId?: string; postId?: string }> {
  const selected = await selectAndReserve(env);
  if (!selected) return { status: "no-unpublished-ayat" };

  let postId: string;
  try {
    postId = await createXPost(env, selected.rendered);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown publishing error.";
    await markFailed(env, selected.ayat.id, detail);
    throw error;
  }

  // If this write fails, leave the reservation in place. X may already have
  // published the post, so automatically retrying could create a duplicate.
  await markPosted(env, selected.ayat.id, postId);
  return { status: "posted", ayatId: selected.ayat.id, postId };
}

async function previewNextAyat(env: Env): Promise<Response> {
  const unavailable = await alreadyReservedOrPublished(env);
  const candidates = unpublishedAyat(AYAT, unavailable);
  if (candidates.length === 0) {
    return Response.json({ error: "No unpublished ayat are available." }, { status: 404 });
  }

  const ayat = candidates[randomIndex(candidates.length)];
  const rendered = validateAyat(ayat);
  return Response.json({ ayatId: ayat.id, text: rendered, codepoints: postCodepointCount(rendered) });
}

function isAuthorized(request: Request, env: Env): boolean {
  return Boolean(env.ADMIN_TOKEN) && request.headers.get("Authorization") === `Bearer ${env.ADMIN_TOKEN}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, availableAyat: AYAT.length });
    }
    if (request.method === "POST" && url.pathname === "/dry-run") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return previewNextAyat(env);
    }
    return new Response("Not Found", { status: 404 });
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      publishNextAyat(env).catch((error: unknown) => {
        console.error("Ayat publishing failed", error);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
