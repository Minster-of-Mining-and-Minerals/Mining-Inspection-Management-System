"use strict";

/**
 * In-memory sliding-window rate limiter for the integration API.
 * Configurable via INTEGRATION_RATE_LIMIT_PER_MINUTE (default 60 req/min).
 */
const createIntegrationRateLimiter = (options = {}) => {
  const windowMs = options.windowMs || 60 * 1000; // 1 minute
  const maxRequests = options.max || parseInt(process.env.INTEGRATION_RATE_LIMIT_PER_MINUTE, 10) || 60;
  const requests = new Map();

  // Periodically clean up stale records every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of requests.entries()) {
      const recent = timestamps.filter((t) => now - t < windowMs);
      if (recent.length === 0) {
        requests.delete(key);
      } else {
        requests.set(key, recent);
      }
    }
  }, 5 * 60 * 1000).unref();

  return (req, res, next) => {
    // Key by integration client ID if authenticated, else IP address
    const key = req.integrationClient?.client_id || req.ip || req.socket.remoteAddress || "anonymous";
    const now = Date.now();

    const clientTimestamps = requests.get(key) || [];
    const validTimestamps = clientTimestamps.filter((t) => now - t < windowMs);

    if (validTimestamps.length >= maxRequests) {
      const resetTimeSeconds = Math.ceil(
        (validTimestamps[0] + windowMs - now) / 1000
      );
      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", 0);
      res.setHeader("X-RateLimit-Reset", resetTimeSeconds);
      res.setHeader("Retry-After", resetTimeSeconds);
      return res.status(429).json({
        success: false,
        message: "Too many integration requests. Please retry later.",
        retry_after_seconds: resetTimeSeconds,
      });
    }

    validTimestamps.push(now);
    requests.set(key, validTimestamps);

    const remaining = Math.max(0, maxRequests - validTimestamps.length);
    const resetTimeSeconds = Math.ceil((validTimestamps[0] + windowMs - now) / 1000);

    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", resetTimeSeconds);

    next();
  };
};

module.exports = {
  createIntegrationRateLimiter,
  integrationRateLimiter: createIntegrationRateLimiter(),
};

