import pool from '../db/pool.js';

const CYCLE_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export async function getLearningPathStatus(userId) {
  let row = (await pool.query(
    'SELECT user_id, cycle_start, is_locked FROM learning_path_progress WHERE user_id = $1',
    [userId]
  )).rows[0];

  if (!row) {
    row = (await pool.query(
      'INSERT INTO learning_path_progress (user_id) VALUES ($1) RETURNING user_id, cycle_start, is_locked',
      [userId]
    )).rows[0];
  } else {
    const daysSinceStart = Math.floor((Date.now() - new Date(row.cycle_start)) / MS_PER_DAY);
    if (daysSinceStart >= CYCLE_DAYS) {
      await pool.query('DELETE FROM learning_path_completed_tasks WHERE user_id = $1', [userId]);
      row = (await pool.query(
        `UPDATE learning_path_progress
            SET cycle_start = now(), updated_at = now()
          WHERE user_id = $1
          RETURNING user_id, cycle_start, is_locked`,
        [userId]
      )).rows[0];
    }
  }

  const daysSinceStart = Math.floor((Date.now() - new Date(row.cycle_start)) / MS_PER_DAY);
  const current_day = Math.min(daysSinceStart + 1, CYCLE_DAYS);
  const days_remaining = CYCLE_DAYS - current_day;

  const completed_tasks = (await pool.query(
    'SELECT task_id FROM learning_path_completed_tasks WHERE user_id = $1',
    [userId]
  )).rows.map((r) => r.task_id);

  return { current_day, days_remaining, completed_tasks, is_locked: row.is_locked };
}

export async function completeTask(userId, taskId, day) {
  await pool.query(
    `INSERT INTO learning_path_completed_tasks (user_id, task_id, day)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, task_id) DO NOTHING`,
    [userId, taskId, day]
  );
  return { task_id: taskId, day };
}
