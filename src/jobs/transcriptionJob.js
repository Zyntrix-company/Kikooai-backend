import pool from '../db/pool.js';
import * as cloudinaryService from '../services/cloudinaryService.js';
import * as geminiService from '../services/geminiService.js';

// Map from file format to MIME type
const FORMAT_MIME = {
  webm: 'audio/webm',
  mp4:  'video/mp4',
  mp3:  'audio/mpeg',
  wav:  'audio/wav',
  ogg:  'audio/ogg',
  m4a:  'audio/mp4',
};

/**
 * Transcription job handler — runs inside the JobQueue worker.
 *
 * @param {{ audioId: string, userId: string, publicId: string, mimeType: string, contextType: string, promptText?: string }} payload
 * @param {(pct: number) => Promise<void>} onProgress
 */
export async function transcriptionJobHandler(payload, onProgress) {
  const { audioId, userId, publicId, mimeType, contextType, promptText } = payload;

  try {
    // 1. Mark start
    await onProgress(10);

    // 2. Download audio from Cloudinary
    const { buffer } = await cloudinaryService.downloadAsBuffer(publicId);
    await onProgress(30);

    // 3. Transcribe with Gemini
    const { text, confidence } = await geminiService.transcribeAudio(buffer, mimeType);
    await onProgress(60);

    // 4. Analyse transcript for feedback
    const feedbackJson = await geminiService.analyzeTranscript(text, promptText || null, contextType);
    await onProgress(80);

    // 5. Persist transcript row
    await pool.query(
      `INSERT INTO transcripts
         (audio_id, user_id, raw_text, segments, asr_confidence, feedback_json, schema_version)
       VALUES ($1, $2, $3, '[]', $4, $5, '1.0')`,
      [audioId, userId, text, confidence, JSON.stringify(feedbackJson)]
    );

    // 6. Mark audio as done
    await pool.query(
      "UPDATE audio_files SET status = 'done' WHERE id = $1",
      [audioId]
    );

    // 7. Done
    await onProgress(100);
  } catch (err) {
    // Mark audio as failed so the client knows something went wrong
    await pool.query(
      "UPDATE audio_files SET status = 'failed' WHERE id = $1",
      [audioId]
    ).catch(() => {}); // don't mask the original error

    throw err;
  }
}
