# P2-13 — Move package photos (and label PDFs) off base64-in-Postgres to AWS S3

**Status:** Design / runbook — **not yet implemented**. Review before executing.
**Owner decision captured:** target store = **AWS S3** (fits existing RDS/IAM AWS footprint).

---

## 1. Why

`PackagePhoto.imageBase64` and `ShipmentLabel.labelPdfBase64` store binary blobs **inline in
Postgres** as base64 text. Problems:

- A single 10 MB JPEG becomes ~13.3 MB of base64 in a `text` column. Every query that
  touches the row (even `SELECT *` for a list) drags the blob across the wire.
- Bloats table size, backups, RDS storage cost, and replication.
- Blocks `next/image` optimization (image is served by an auth-gated API route that decodes
  base64 in the function, not a real CDN-cacheable URL).

The good news: **the storage layer is already abstracted.** `lib/storage.ts` exposes
`putObject` / `getObject` / `deleteObject` over two drivers (`blob` = Vercel Blob, `inline` =
base64), and both `PackagePhoto` and `ShipmentLabel` already have a `*BlobUrl`/`blobUrl`
column alongside the base64 fallback. So this is **additive (an S3 driver) + a backfill**, not
a schema rewrite.

## 2. Scope

1. Add an `s3` driver to `lib/storage.ts`.
2. Configure write paths to prefer S3 when configured (already true structurally — they call
   `putObject` and persist whatever ref comes back).
3. Backfill existing inline rows → S3, then null out the base64 columns.
4. (Follow-up, optional) Serve images via signed/CDN URLs so `next/image` can optimize them.

## 3. Infra prerequisites (you / ops)

- **Bucket**: `peptsci-media-prod` (+ `-staging`), Block Public Access **ON** (we serve via
  signed URLs or an auth-gated proxy, never public).
- **IAM**: a policy granting `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on
  `arn:aws:s3:::peptsci-media-prod/*`. Prefer the existing instance/task role (same pattern as
  RDS IAM) over static keys. If static keys are unavoidable, store as env secrets.
- **Env** (Vercel + local `.env`):
  - `S3_BUCKET=peptsci-media-prod`
  - `S3_REGION=us-east-1` (match RDS region)
  - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` **only if not using a role**
  - (optional) `S3_PUBLIC_BASE_URL` if fronted by CloudFront
- **Dependency**: `@aws-sdk/client-s3` (+ `@aws-sdk/s3-request-presigner` for signed reads).
  Lazy-`import()` inside the driver (same pattern as the `@vercel/blob` import) so it's only
  pulled into functions that actually store media.

## 4. Code changes (additive)

### 4.1 `lib/storage.ts` — add the `s3` driver

```ts
export type StorageDriver = 'blob' | 's3' | 'inline'

function s3Enabled(): boolean {
  return !!process.env.S3_BUCKET
}

export function storageDriver(): StorageDriver {
  if (s3Enabled()) return 's3'
  if (blobEnabled()) return 'blob'
  return 'inline'
}

// in putObject(), before the blob branch:
if (s3Enabled()) {
  try {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
    const client = new S3Client({ region: process.env.S3_REGION })
    const Key = `${key}-${crypto.randomUUID()}` // mirror addRandomSuffix
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key,
        Body: data,
        ContentType: contentType,
      })
    )
    // Persist the KEY (not a presigned URL — those expire). Resolve to a
    // signed URL at read time.
    return { driver: 's3', url: `s3://${process.env.S3_BUCKET}/${Key}`, contentType }
  } catch (err) {
    logger.warn('[storage] S3 upload failed, falling back', { key, error: String(err) })
  }
}
```

`getObject()` gains an S3 branch: if `ref.url` starts with `s3://`, parse bucket/key and
`GetObjectCommand` → stream to Buffer. `deleteObject()` gains a `DeleteObjectCommand` branch.

> **Decision point — how we serve images:**
> - **Option A (smallest change):** keep the existing auth-gated proxy route
>   (`/api/package-photos/[id]/image`); it just calls `getObject` which now pulls from S3.
>   Simple, still private, but not CDN-optimized.
> - **Option B (best perf):** add a `getSignedUrl()` helper and return a short-lived
>   (e.g. 15 min) presigned URL to the client, then use `next/image` with a remotePattern for
>   the bucket/CloudFront host. Enables CDN + image optimization. Slightly more work + auth
>   nuance (signed URL leaks if shared, but expires).
>
> Recommend **A for the migration**, **B as the follow-up** once URLs are S3-backed.

### 4.2 Write paths — no change needed

`app/api/admin/package-photos/route.ts` and the FedEx label route already call `putObject` and
persist `result.url ?? base64`. Once `S3_BUCKET` is set, new uploads land in S3 automatically.

## 5. Backfill (existing inline rows)

Add `scripts/backfill-media-to-s3.ts` (run **once**, after the S3 driver ships and
`S3_BUCKET` is set). Idempotent + resumable:

```
for each PackagePhoto where imageBase64 is not null and blobUrl is null:
  buf = Buffer.from(imageBase64, 'base64')
  ref = putObject(`package-photos/${id}`, buf, contentType)   // -> s3://...
  if ref.driver === 's3':
    update row: { blobUrl: ref.url, imageBase64: null }
  else: log + skip (don't lose data if S3 write failed)
repeat for ShipmentLabel.labelPdfBase64 -> labelBlobUrl
```

Run in **batches of ~50** with `take`/cursor to bound memory (these are big rows). Log a
running count. Safe to re-run: it only touches rows still holding base64.

### Rollback
- The S3 driver falls back to inline on any failure, so **new writes never break**.
- Backfill only nulls `imageBase64` *after* a confirmed S3 write, and S3 objects are retained,
  so a row can be re-pointed. Keep a DB snapshot before the first backfill run.
- To fully revert: stop setting `S3_BUCKET` (driver returns to `blob`/`inline`); already-migrated
  rows keep working via the S3 `getObject` branch as long as the driver code remains deployed.

## 6. Verification checklist

- [ ] Upload a new package photo with `S3_BUCKET` set → row has `blobUrl: s3://…`, `imageBase64: null`.
- [ ] Client order page renders the photo (proxy or signed URL).
- [ ] Backfill dry-run (log-only) reports expected row counts.
- [ ] Backfill on staging; spot-check 5 migrated photos render; confirm base64 columns nulled.
- [ ] `VACUUM (ANALYZE)` / check table size drop after backfill.
- [ ] Prod run during low traffic; monitor S3 4xx/5xx + app logs.

## 7. Estimate
~0.5 day driver + tests, ~0.5 day backfill script + staging validation, ~0.5 day prod rollout
& monitoring. **~1.5 days.** Option B (signed URLs + next/image) adds ~0.5 day.
