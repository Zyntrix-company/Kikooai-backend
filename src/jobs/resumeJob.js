import pool from '../db/pool.js';
import * as geminiService from '../services/geminiService.js';
import { getResumeText } from '../services/resumeText.js';

/**
 * Resume analysis job handler — runs inside the JobQueue worker.
 *
 * @param {{ reportId: string, resumeId: string, userId: string, jdText: string, coverLetter: string|null, analysisType: 'analyze'|'roast' }} payload
 * @param {(pct: number) => Promise<void>} onProgress
 */
export async function resumeJobHandler(payload, onProgress) {
  const { reportId, resumeId, userId, jdText, coverLetter, analysisType } = payload;

  try {
    await onProgress(10);

    await pool.query(
      `UPDATE resume_reports SET status = 'processing' WHERE id = $1`,
      [reportId]
    );

    const { text: resumeText } = await getResumeText(resumeId, userId);
    await onProgress(30);

    const result = await geminiService.analyzeResume(resumeText, jdText, coverLetter, analysisType);

    await onProgress(80);

    await pool.query(
      `UPDATE resume_reports
       SET report_json = $1, score = $2, status = 'done', last_error = NULL
       WHERE id = $3`,
      [JSON.stringify(result), result.score ?? null, reportId]
    );

    await onProgress(100);
  } catch (err) {
    const detail = err?.message || String(err);
    await pool
      .query(
        `UPDATE resume_reports
         SET status = 'failed', last_error = $2
         WHERE id = $1`,
        [reportId, detail]
      )
      .catch(() => {});

    throw err;
  }
}
