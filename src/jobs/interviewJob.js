import pool from '../db/pool.js';
import * as cloudinaryService from '../services/cloudinaryService.js';
import * as geminiService from '../services/geminiService.js';

const FORMAT_MIME = {
  webm: 'audio/webm',
  mp4:  'video/mp4',
  mp3:  'audio/mpeg',
  wav:  'audio/wav',
  ogg:  'audio/ogg',
  m4a:  'audio/mp4',
};

/**
 * Interview processing job handler — runs inside the JobQueue worker.
 *
 * @param {{ roomId: string, audioId: string, userId: string, questions: Array<{ question_text: string }>, jobRole: string }} payload
 * @param {(pct: number) => Promise<void>} onProgress
 */
export async function interviewJobHandler(payload, onProgress) {
  const { roomId, audioId, questions, jobRole } = payload;

  try {
    await onProgress(10);

    // Fetch audio file metadata
    const { rows: audioRows } = await pool.query(
      'SELECT cloudinary_public_id, format FROM audio_files WHERE id = $1',
      [audioId]
    );
    if (!audioRows[0]) {
      throw Object.assign(new Error('Audio file not found'), { code: 'AUDIO_NOT_FOUND' });
    }
    const { cloudinary_public_id, format } = audioRows[0];

    await onProgress(20);

    const { buffer } = await cloudinaryService.downloadAsBuffer(cloudinary_public_id);
    const mimeType   = FORMAT_MIME[format] || 'audio/webm';

    await onProgress(35);

    const { text: transcript } = await geminiService.transcribeAudio(buffer, mimeType);

    await onProgress(55);

    const questionResults = [];
    for (const q of (questions || [])) {
      const feedback = await geminiService.generateInterviewFeedback(
        transcript,
        q.question_text,
        jobRole || 'General'
      );
      questionResults.push({ question: q.question_text, feedback });
    }

    await onProgress(85);

    const scores = questionResults.map((r) => r.feedback?.overall_score ?? 0);
    const overallScore = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    const resultJson = {
      transcript,
      question_results: questionResults,
      overall_score:    overallScore,
      summary: `Interview completed. ${questionResults.length} question(s) evaluated. Overall score: ${overallScore}/100.`,
    };

    await pool.query(
      `UPDATE interview_rooms
       SET status = 'done', result_json = $1
       WHERE id = $2`,
      [JSON.stringify(resultJson), roomId]
    );

    await onProgress(100);
  } catch (err) {
    await pool.query(
      "UPDATE interview_rooms SET status = 'failed' WHERE id = $1",
      [roomId]
    ).catch(() => {});

    throw err;
  }
}
