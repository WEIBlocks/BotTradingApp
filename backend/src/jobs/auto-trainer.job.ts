/**
 * Auto-Trainer Job
 *
 * Runs every 30 minutes, checks all active bots for performance drift,
 * triggers the trainer agent when thresholds are breached.
 *
 * Feature 4: Auto training and strategy fixing, automated
 */

import { db } from '../config/database.js';
import { bots } from '../db/schema/bots.js';
import { eq } from 'drizzle-orm';
import { runAutoTrainerCheck, DEFAULT_TRAINER_CONFIG, type TrainerConfig } from '../modules/trainer/trainer.service.js';

let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function runTrainerChecks() {
  try {
    const allBots = await db.select({ id: bots.id, trainerConfig: bots.trainerConfig })
      .from(bots)
      .where(eq(bots.status, 'approved'));

    let checked = 0;
    for (const bot of allBots) {
      const config = ((bot.trainerConfig as any) ?? DEFAULT_TRAINER_CONFIG) as TrainerConfig;
      // trainingMode is source of truth; fall back to legacy autoRetrain bool
      const mode = config.trainingMode ?? (config.autoRetrain ? 'suggestions' : 'off');
      if (mode === 'off') continue;
      try {
        await runAutoTrainerCheck(bot.id);
        checked++;
      } catch (err) {
        console.error(`[AutoTrainer] Check failed for bot ${bot.id}:`, (err as Error).message);
      }
    }

    if (checked > 0) {
      console.log(`[AutoTrainer] Checked ${checked} bots`);
    }
  } catch (err) {
    console.error('[AutoTrainer] Batch check error:', (err as Error).message);
  }
}

export async function startAutoTrainerJob() {
  // Run once after a short delay (let other jobs + DB settle)
  setTimeout(runTrainerChecks, 15_000);

  // Then every 30 minutes
  intervalHandle = setInterval(runTrainerChecks, 30 * 60 * 1000);

  console.log('[AutoTrainer] Auto-trainer job started (30min interval)');
}

export async function stopAutoTrainerJob() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
