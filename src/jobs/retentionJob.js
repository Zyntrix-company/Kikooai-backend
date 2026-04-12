import { v2 as cloudinary } from 'cloudinary';
import pool from '../db/pool.js';

/**
 * Archive audio files older than AUDIO_RETENTION_DAYS (default 90).
 *
 * For each eligible audio file:
 *  1. Move the Cloudinary asset to the kikoo/archive/ prefix via rename.
 *  2. Mark the DB row status = 'archived' and set archived_at.
 *
 * Errors on individual files are logged and skipped — a single bad file
 * should never halt the entire retention run.
 */
export async function archiveOldAudio() {
  const retentionDays = parseInt(process.env.AUDIO_RETENTION_DAYS || '90', 10);

  const { rows } = await pool.query(
    `SELECT id, cloudinary_public_id
     FROM audio_files
     WHERE created_at < now() - ($1 || ' days')::INTERVAL
       AND status != 'archived'
       AND cloudinary_public_id NOT IN ('pending')`,
    [retentionDays]
  );

  if (rows.length === 0) {
    console.log('[retention] No audio files to archive.');
    return;
  }

  console.log(`[retention] Archiving ${rows.length} audio file(s) older than ${retentionDays} days…`);

  let archived = 0;
  let failed   = 0;

  for (const row of rows) {
    try {
      const archivedPublicId = `kikoo/archive/${row.cloudinary_public_id}`;

      await cloudinary.uploader.rename(
        row.cloudinary_public_id,
        archivedPublicId,
        { resource_type: 'video', overwrite: true }
      );

      await pool.query(
        `UPDATE audio_files
         SET status = 'archived', archived_at = now()
         WHERE id = $1`,
        [row.id]
      );

      archived++;
    } catch (err) {
      console.error(`[retention] Failed to archive audio ${row.id}:`, err?.message);
      failed++;
    }
  }

  console.log(`[retention] Done — archived: ${archived}, failed: ${failed}.`);
}
