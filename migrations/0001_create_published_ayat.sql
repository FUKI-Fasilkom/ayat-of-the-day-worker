CREATE TABLE IF NOT EXISTS published_ayat (
  ayat_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'posted', 'failed')),
  reserved_at TEXT NOT NULL,
  published_at TEXT,
  x_post_id TEXT,
  rendered_text TEXT NOT NULL,
  failure_detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_published_ayat_status ON published_ayat(status);
