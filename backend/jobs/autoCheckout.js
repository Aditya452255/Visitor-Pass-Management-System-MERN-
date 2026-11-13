require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const prisma = require('../config/prisma');
const { logger } = require('../utils/logger');

/**
 * Execute automatic check-out for visitors whose duration exceeded MAX_DURATION_MIN
 * Designed to be idempotent and safe across multiple concurrent invocations
 * @param {Object} options
 * @param {number} [options.maxDurationMinutes]
 * @returns {Promise<{ processedCount: number }>}
 */
async function processAutoCheckout(options = {}) {
  const maxDurationMinutes = Number(options.maxDurationMinutes || process.env.AUTO_CHECKOUT_AFTER_MIN || 60);
  const cutoffTime = new Date(Date.now() - maxDurationMinutes * 60000);

  logger.info(`[AutoCheckout] Checking for open check-ins prior to cutoff: ${cutoffTime.toISOString()}`);

  try {
    // 1. Find candidates (open check-ins older than cutoff)
    const openLogs = await prisma.checkLog.findMany({
      where: {
        checkOutTime: null,
        checkInTime: { lte: cutoffTime }
      },
      take: 500
    });

    if (!openLogs || openLogs.length === 0) {
      logger.info('[AutoCheckout] No pending auto-checkouts found.');
      return { processedCount: 0 };
    }

    logger.info(`[AutoCheckout] Found ${openLogs.length} records to auto-checkout.`);
    let processedCount = 0;

    for (const log of openLogs) {
      const autoOutTime = new Date(log.checkInTime.getTime() + maxDurationMinutes * 60000);
      const noteSuffix = `[auto-checkout after ${maxDurationMinutes} min]`;
      const updatedNotes = log.notes ? `${log.notes} ${noteSuffix}` : noteSuffix;

      // Atomic update ensuring checkOutTime is still null
      const updated = await prisma.checkLog.updateMany({
        where: {
          id: log.id,
          checkOutTime: null // Concurrency guard
        },
        data: {
          checkOutTime: autoOutTime,
          notes: updatedNotes
        }
      });

      if (updated.count > 0) {
        processedCount++;
      }
    }

    logger.info(`✓ [AutoCheckout] Successfully auto-checked out ${processedCount} visitors.`);
    return { processedCount };
  } catch (err) {
    logger.error('[AutoCheckout] Error executing auto-checkout job:', err);
    throw err;
  }
}

/**
 * AWS Lambda handler wrapper for EventBridge scheduled rules
 */
const handler = async (event, context) => {
  logger.info('[AutoCheckout Lambda] Triggered by EventBridge', { event });
  try {
    const result = await processAutoCheckout();
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Auto-checkout executed successfully',
        ...result
      })
    };
  } catch (err) {
    logger.error('[AutoCheckout Lambda] Failed:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  } finally {
    // In serverless environments, disconnect Prisma connection pool
    await prisma.$disconnect();
  }
};

// CLI execution runner: node backend/jobs/autoCheckout.js
if (require.main === module) {
  processAutoCheckout()
    .then((res) => {
      console.log(`Auto-checkout completed. Processed: ${res.processedCount}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Auto-checkout CLI error:', err);
      process.exit(1);
    });
}

module.exports = { processAutoCheckout, handler };

