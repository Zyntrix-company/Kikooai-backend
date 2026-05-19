import pool from '../db/pool.js';

function msUntilMidnightUTC() {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return midnight - now;
}

async function runReset() {
  try {
    const { rowCount } = await pool.query(
      `UPDATE profiles SET daily_energy_count = 0, energy_reset_date = CURRENT_DATE
       WHERE energy_reset_date < CURRENT_DATE`
    );
    console.log(`[energyResetJob] Reset ${rowCount} profiles at ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[energyResetJob] Failed:', err.message);
  }
}

export function startEnergyResetJob() {
  const delay = msUntilMidnightUTC();
  console.log(`[energyResetJob] First run in ${Math.round(delay / 60000)}m (at next midnight UTC)`);

  setTimeout(function tick() {
    runReset();
    // Schedule next run exactly 24 h later
    setTimeout(tick, 24 * 60 * 60 * 1000);
  }, delay);
}
