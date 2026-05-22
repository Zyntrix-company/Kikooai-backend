import { resetAllStaleEnergy } from '../utils/energyReset.js';

function msUntilMidnightUTC() {
  const now = new Date();
  const midnight = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  ));
  return midnight - now;
}

async function runReset() {
  try {
    const rowCount = await resetAllStaleEnergy();
    console.log(`[energyResetJob] Reset ${rowCount} profiles at ${new Date().toISOString()} (UTC midnight batch)`);
  } catch (err) {
    console.error('[energyResetJob] Failed:', err.message);
  }
}

/** Schedule bulk energy reset at 00:00 UTC daily for all users. */
export function startEnergyResetJob() {
  const delay = msUntilMidnightUTC();
  console.log(`[energyResetJob] First run in ${Math.round(delay / 60000)}m (at next 00:00 UTC)`);

  setTimeout(function tick() {
    runReset();
    setTimeout(tick, 24 * 60 * 60 * 1000);
  }, delay);
}
