import assert from "node:assert/strict";
import test from "node:test";
import { postCodepointCount, renderPost, unpublishedAyat } from "../src/index.ts";
import type { Ayat } from "../src/ayat.ts";

const ayat: Ayat = {
  id: "002-286",
  surah: 2,
  ayah: 286,
  surahName: "Al-Baqarah",
  arabic: "Arabic text",
  translation: "Translation text",
  translationCredit: "Example translator",
  approvedBy: "Reviewer",
  approvedAt: "2026-08-31T00:00:00.000Z",
};

test("renders only the required public post fields in the required order", () => {
  assert.equal(
    renderPost(ayat),
    "Ayat of The Day\n\nArabic text\n\nTranslation text\n\nSurah Al-Baqarah (2:286)",
  );
});

test("counts Unicode code points without splitting Arabic characters", () => {
  assert.equal(postCodepointCount("آية"), 3);
});

test("excludes every reserved or published verse from the random candidate pool", () => {
  const anotherAyat: Ayat = { ...ayat, id: "001-001", surah: 1, ayah: 1, surahName: "Al-Fatihah" };
  assert.deepEqual(unpublishedAyat([ayat, anotherAyat], new Set([ayat.id])), [anotherAyat]);
});
