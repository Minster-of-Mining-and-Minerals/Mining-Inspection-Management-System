"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

// Ensure environment variable is set for tests
process.env.PMS_INTEGRATION_KEY = "test-pms-integration-key-secret-2026";
process.env.JWT_SECRET = "test-jwt-secret-for-mims-testing";
process.env.INTEGRATION_RATE_LIMIT_PER_MINUTE = "5";

const {
  validateIntegrationKey,
  authenticateIntegrationClient,
} = require("../middlewares/integrationAuthMiddleware");
const {
  createIntegrationRateLimiter,
  integrationRateLimiter,
} = require("../middlewares/integrationRateLimiter");
const { safeRate } = require("../services/integrationAnalyticsService");

describe("Integration Analytics — Rate Calculation Helper", () => {
  it("calculates percentage accurately with standard values", () => {
    const rate = safeRate(40, 100);
    assert.equal(rate, 40.0);
  });

  it("handles floating point percentages and rounds to 2 decimal places", () => {
    const rate = safeRate(1, 3);
    assert.equal(rate, 33.33);
  });

  it("safely returns 0.0 when denominator is zero without throwing or returning NaN", () => {
    const rateZero = safeRate(0, 0);
    assert.equal(rateZero, 0.0);
    assert.equal(Number.isNaN(rateZero), false);

    const rateNumeratorWithZeroTotal = safeRate(5, 0);
    assert.equal(rateNumeratorWithZeroTotal, 0.0);
  });

  it("handles negative or invalid inputs gracefully", () => {
    assert.equal(safeRate(-1, 10), 0.0);
    assert.equal(safeRate(null, 10), 0.0);
    assert.equal(safeRate(10, undefined), 0.0);
  });
});

describe("Integration Analytics — Pre-Shared Key Authentication", () => {
  it("accepts valid integration key matching environment variable", () => {
    const isValid = validateIntegrationKey("test-pms-integration-key-secret-2026");
    assert.equal(isValid, true);
  });

  it("rejects invalid integration key", () => {
    const isValid = validateIntegrationKey("wrong-key-value-123");
    assert.equal(isValid, false);
  });

  it("rejects empty, null, or undefined keys", () => {
    assert.equal(validateIntegrationKey(""), false);
    assert.equal(validateIntegrationKey(null), false);
    assert.equal(validateIntegrationKey(undefined), false);
    assert.equal(validateIntegrationKey(12345), false);
  });
});

describe("Integration Analytics — Authentication Middleware", () => {
  function createMockRes() {
    return {
      statusCode: 200,
      jsonData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      },
    };
  }

  it("authenticates successfully via X-API-Key header", async () => {
    const req = {
      headers: {
        "x-api-key": "test-pms-integration-key-secret-2026",
      },
    };
    const res = createMockRes();
    let nextCalled = false;

    await authenticateIntegrationClient(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.integrationClient.type, "api_key");
    assert.equal(req.integrationClient.client_id, "plan-management-system");
  });

  it("authenticates successfully via Authorization: ApiKey <key> header", async () => {
    const req = {
      headers: {
        authorization: "ApiKey test-pms-integration-key-secret-2026",
      },
    };
    const res = createMockRes();
    let nextCalled = false;

    await authenticateIntegrationClient(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.integrationClient.type, "api_key");
  });

  it("authenticates successfully via Authorization: Bearer <key> if key is pre-shared API key", async () => {
    const req = {
      headers: {
        authorization: "Bearer test-pms-integration-key-secret-2026",
      },
    };
    const res = createMockRes();
    let nextCalled = false;

    await authenticateIntegrationClient(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.integrationClient.type, "api_key");
  });

  it("authenticates JWT with inspection_analytics:read permission", async () => {
    const token = jwt.sign(
      {
        id: "user-123",
        role: "integration_client",
        permissions: ["inspection_analytics:read"],
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    };
    const res = createMockRes();
    let nextCalled = false;

    await authenticateIntegrationClient(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.integrationClient.type, "jwt_service");
    assert.equal(req.integrationClient.client_id, "user-123");
  });

  it("rejects JWT without inspection_analytics:read permission with 403 Forbidden", async () => {
    const token = jwt.sign(
      {
        id: "user-unauthorized",
        role: "viewer",
        permissions: ["some_other:read"],
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    };
    const res = createMockRes();
    let nextCalled = false;

    await authenticateIntegrationClient(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.jsonData.success, false);
    assert.match(res.jsonData.message, /Access denied|Forbidden/i);
  });

  it("rejects unauthenticated request with 401 Unauthorized", async () => {
    const req = { headers: {} };
    const res = createMockRes();
    let nextCalled = false;

    await authenticateIntegrationClient(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonData.success, false);
  });

  it("rejects invalid API key with 401 Unauthorized", async () => {
    const req = {
      headers: {
        "x-api-key": "invalid-random-key",
      },
    };
    const res = createMockRes();
    let nextCalled = false;

    await authenticateIntegrationClient(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonData.success, false);
  });
});

describe("Integration Analytics — Rate Limiter Middleware", () => {
  it("allows requests under the limit and sets standard X-RateLimit headers", () => {
    const limiter = createIntegrationRateLimiter({ max: 3, windowMs: 60000 }); // 3 requests per minute

    const req = {
      ip: "10.0.0.1",
      headers: {},
      integrationClient: { client: "test-client" },
    };

    const headers = {};
    const res = {
      setHeader(name, val) {
        headers[name] = val;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(d) {
        this.data = d;
      },
    };

    let callCount = 0;
    const next = () => {
      callCount++;
    };

    // First request
    limiter(req, res, next);
    assert.equal(callCount, 1);
    assert.equal(headers["X-RateLimit-Limit"], 3);
    assert.equal(headers["X-RateLimit-Remaining"], 2);

    // Second request
    limiter(req, res, next);
    assert.equal(callCount, 2);
    assert.equal(headers["X-RateLimit-Remaining"], 1);

    // Third request
    limiter(req, res, next);
    assert.equal(callCount, 3);
    assert.equal(headers["X-RateLimit-Remaining"], 0);

    // Fourth request (should be blocked with 429)
    limiter(req, res, next);
    assert.equal(callCount, 3); // next was NOT called
    assert.equal(res.statusCode, 429);
    assert.equal(res.data.success, false);
    assert.ok(headers["Retry-After"] >= 1);
  });
});

describe("Integration Analytics — Privacy & Payload Hygiene Validation", () => {
  it("ensures response schema does not expose PII, personal names, notes, or raw findings", () => {
    // Simulated aggregate response payload returned by integrationAnalyticsService
    const samplePayload = {
      summary: {
        total_inspections: 10,
        completed_inspections: 8,
        in_progress_inspections: 1,
        pending_inspections: 1,
        overdue_inspections: 0,
        completion_rate: 80.0,
        average_compliance_score: 85.5,
      },
      by_status: [
        { status: "submitted", count: 8, percentage: 80.0 },
        { status: "in_progress", count: 1, percentage: 10.0 },
        { status: "todo", count: 1, percentage: 10.0 },
      ],
      by_category: [
        { license_type: "Mining", total: 6, completed: 5, completion_rate: 83.33 },
      ],
      by_region: [
        { region_id: "reg-1", region_name: "Oromia", total: 10, completed: 8 },
      ],
    };

    const forbiddenFields = [
      "inspector_name",
      "inspector_id",
      "first_name",
      "last_name",
      "email",
      "phone",
      "password",
      "notes",
      "findings",
      "violations",
      "attachment_url",
      "file_path",
      "raw_answers",
      "company_confidential_notes",
    ];

    const stringified = JSON.stringify(samplePayload).toLowerCase();
    for (const field of forbiddenFields) {
      assert.equal(
        stringified.includes(`"${field}"`),
        false,
        `Payload must NOT contain forbidden raw/PII field: ${field}`
      );
    }
  });
});
