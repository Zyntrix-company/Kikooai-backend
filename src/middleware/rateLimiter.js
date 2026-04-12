import rateLimit from 'express-rate-limit';

/**
 * Auth endpoints: 10 attempts per 15 minutes per IP.
 * Protects signup and login against brute-force.
 */
export const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: { success: false, error: 'Too many auth attempts, please try again later', code: 'RATE_LIMITED' },
});

/**
 * Upload endpoints: 20 requests per 15 minutes per IP.
 * Protects audio and resume upload-init from abuse.
 */
export const uploadLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              20,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: { success: false, error: 'Too many upload requests', code: 'RATE_LIMITED' },
});

/**
 * Scoring endpoints: 30 requests per minute per IP.
 * Protects exercise submit and game score from spam.
 */
export const scoringLimiter = rateLimit({
  windowMs:         60 * 1000,
  max:              30,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: { success: false, error: 'Too many scoring requests', code: 'RATE_LIMITED' },
});
