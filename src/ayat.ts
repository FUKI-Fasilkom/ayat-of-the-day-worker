/**
 * Add verified entries here. This array is intentionally empty until approved
 * Arabic text, a permitted translation, and source metadata are available.
 * Tafsir metadata is retained privately and is never included in an X post.
 */
export type Ayat = {
  /** Stable unique identifier. Use zero-padded "surah-ayah", e.g. "002-286". */
  id: string;
  surah: number;
  ayah: number;
  surahName: string;
  arabic: string;
  translation: string;
  translationCredit: string;
  tafsirNote?: string;
  tafsirSources?: ReadonlyArray<{
    work: string;
    editionOrUrl: string;
    locator: string;
  }>;
  approvedBy: string;
  approvedAt: string;
};

export const AYAT: readonly Ayat[] = [];
