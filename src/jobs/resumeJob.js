import pool from '../db/pool.js';
import * as geminiService from '../services/geminiService.js';

/**
 * Resume analysis job handler — runs inside the JobQueue worker.
 *
 * @param {{ reportId: string, resumeId: string, resumeText: string, jdText: string, coverLetter: string|null, analysisType: 'analyze'|'roast' }} payload
 * @param {(pct: number) => Promise<void>} onProgress
 */
export async function resumeJobHandler(payload, onProgress) {
  const { reportId, resumeText, jdText, coverLetter, analysisType } = payload;

  try {
    await onProgress(10);

    const result = await geminiService.analyzeResume(resumeText, jdText, coverLetter, analysisType);

    await onProgress(80);

    await pool.query(
      `UPDATE resume_reports
       SET report_json = $1, score = $2, status = 'done'
       WHERE id = $3`,
      [JSON.stringify(result), result.score ?? null, reportId]
    );

    await onProgress(100);
  } catch (err) {
    await pool.query(
      "UPDATE resume_reports SET status = 'failed' WHERE id = $1",
      [reportId]
    ).catch(() => {});

    throw err;
  }
}
