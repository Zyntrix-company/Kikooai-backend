import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool.js';

const TICK_INTERVAL_MS = 2000;
const DEFAULT_MAX_ATTEMPTS = 3;

class JobQueue {
  constructor() {
    /** @type {Array<{id: string, type: string, handler: Function, payload: object, status: string, attempts: number, maxAttempts: number}>} */
    this.queue = [];

    // Start the processing loop
    this._interval = setInterval(() => this._tick(), TICK_INTERVAL_MS);
    // Allow the process to exit even if the interval is still running
    if (this._interval.unref) this._interval.unref();
  }

  /**
   * Enqueue a new job.
   * @param {string} type
   * @param {object} payload
   * @param {Function} handler  async (payload, onProgress) => void
   * @param {{ maxAttempts?: number, userId?: string }} options
   * @returns {string} jobId
   */
  async enqueue(type, payload, handler, options = {}) {
    const id          = options.jobId ?? uuidv4();
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const userId      = options.userId ?? payload.userId ?? null;

    // Skip INSERT if caller already created the DB row (options.jobId provided)
    if (!options.jobId) {
      await pool.query(
        `INSERT INTO jobs (id, type, status, progress_pct, user_id, payload_ref, attempts)
         VALUES ($1, $2, 'pending', 0, $3, $4, 0)`,
        [id, type, userId, JSON.stringify(payload)]
      );
    }

    this.queue.push({ id, type, handler, payload, status: 'pending', attempts: 0, maxAttempts });
    return id;
  }

  /**
   * Get job status from the DB.
   * @param {string} jobId
   */
  async getStatus(jobId) {
    const { rows } = await pool.query(
      'SELECT id, status, progress_pct, error_message, updated_at, user_id FROM jobs WHERE id = $1',
      [jobId]
    );
    return rows[0] || null;
  }

  /**
   * Update job status in the DB.
   * @param {string} jobId
   * @param {string} status
   * @param {number} progressPct
   * @param {string|null} errorMessage
   */
  async updateJobStatus(jobId, status, progressPct = 0, errorMessage = null) {
    await pool.query(
      `UPDATE jobs
       SET status = $1, progress_pct = $2, error_message = $3, updated_at = now()
       WHERE id = $4`,
      [status, progressPct, errorMessage, jobId]
    );
  }

  /** Internal: process one pending job per tick. */
  async _tick() {
    const job = this.queue.find((j) => j.status === 'pending');
    if (!job) return;

    job.status = 'processing';
    await this.updateJobStatus(job.id, 'processing', 0, null);

    const onProgress = async (pct) => {
      await this.updateJobStatus(job.id, 'processing', pct, null);
    };

    try {
      await job.handler(job.payload, onProgress);

      job.status = 'done';
      await this.updateJobStatus(job.id, 'done', 100, null);
      // Remove from in-memory queue once done
      this._removeFromQueue(job.id);
    } catch (err) {
      job.attempts += 1;
      await pool.query('UPDATE jobs SET attempts = $1 WHERE id = $2', [job.attempts, job.id]);

      if (job.attempts < job.maxAttempts) {
        // Exponential backoff before re-queuing
        const delayMs = Math.pow(2, job.attempts) * 1000;
        job.status = 'pending_retry';
        await this.updateJobStatus(job.id, 'pending', 0, null);
        setTimeout(() => {
          job.status = 'pending';
        }, delayMs);
      } else {
        job.status = 'failed';
        const errorMessage = err?.message || 'Unknown error';
        await this.updateJobStatus(job.id, 'failed', 0, errorMessage);
        this._removeFromQueue(job.id);
      }
    }
  }

  _removeFromQueue(jobId) {
    const idx = this.queue.findIndex((j) => j.id === jobId);
    if (idx !== -1) this.queue.splice(idx, 1);
  }
}

export const jobQueue = new JobQueue();
