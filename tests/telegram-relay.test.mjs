import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_TELEGRAM_TEXT_LENGTH,
  buildTelegramMessages,
  handleSubmission,
  handleTelegramQueue,
} from "../workers/telegram-relay/index.mjs";

const allowedOrigin = "https://alex-fintore.github.io";
const silentLogger = { error() {}, info() {} };

function createEnv({ rateLimitSuccess = true, sendBatch } = {}) {
  return {
    ALLOWED_ORIGIN: allowedOrigin,
    EXPECTED_SOURCE: "GitHub Pages — AI-квалификатор",
    FORMSPREE_ENDPOINT: "https://formspree.io/f/test-endpoint",
    TELEGRAM_BOT_TOKEN: "test-only-token",
    TELEGRAM_CHAT_ID: "123456789",
    TELEGRAM_QUEUE: {
      async sendBatch(messages) {
        if (sendBatch) return sendBatch(messages);
      },
    },
    RATE_LIMITER: {
      async limit({ key }) {
        assert.match(key, /^submission:/);
        return { success: rateLimitSuccess };
      },
    },
  };
}

function validFields(overrides = {}) {
  return {
    _subject: "Первичный бриф AI-квалификатора — Тест",
    submission_type: "Короткий первичный бриф",
    company: "Тестовая компания",
    contact_name: "Тестовый контакт",
    contact_channel: "test@example.com",
    _replyto: "test@example.com",
    source: "GitHub Pages — AI-квалификатор",
    submitted_at: "2026-07-15T08:00:00.000Z",
    brief: "1. Что происходит сейчас?\nТестовый ответ",
    ...overrides,
  };
}

function submissionRequest(fields = validFields(), options = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);

  return new Request(
    options.url ?? "https://ai-qualifier-telegram-relay.example.workers.dev/submit",
    {
      method: options.method ?? "POST",
      headers: {
        Origin: options.origin ?? allowedOrigin,
        "CF-Connecting-IP": options.ip ?? "203.0.113.7",
        ...options.headers,
      },
      body: options.method === "GET" ? undefined : body,
    },
  );
}

test("splits a long plain-text notification without losing the final answer", () => {
  const messages = buildTelegramMessages(
    validFields({
      brief: `Очень длинный ответ ${"д".repeat(8000)}\n\nКОНЕЦ ОТВЕТА`,
    }),
  );

  assert.ok(messages.length >= 3);
  assert.match(messages[0], /Новая заявка — AI-квалификатор/);
  assert.match(messages[0], /Тестовая компания/);
  assert.match(messages[0], /Тестовый контакт/);
  assert.match(messages.at(-1), /КОНЕЦ ОТВЕТА/);
  assert.doesNotMatch(messages.join("\n"), /Ответ сокращён/);
  messages.forEach((message, index) => {
    assert.match(message, new RegExp(`часть ${index + 1}/${messages.length}`, "i"));
    assert.ok(message.length <= MAX_TELEGRAM_TEXT_LENGTH);
  });
  assert.ok(MAX_TELEGRAM_TEXT_LENGTH <= 4096);
});

test("accepts preflight only for the configured site", async () => {
  const response = await handleSubmission(
    new Request(
      "https://ai-qualifier-telegram-relay.example.workers.dev/submit",
      {
        method: "OPTIONS",
        headers: { Origin: allowedOrigin },
      },
    ),
    createEnv(),
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), allowedOrigin);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("rejects unknown origins, methods, paths, and oversized bodies", async () => {
  const env = createEnv();

  const wrongOrigin = await handleSubmission(
    submissionRequest(validFields(), { origin: "https://example.com" }),
    env,
  );
  assert.equal(wrongOrigin.status, 403);
  assert.equal(wrongOrigin.headers.get("Access-Control-Allow-Origin"), null);

  const wrongMethod = await handleSubmission(
    submissionRequest(validFields(), { method: "GET" }),
    env,
  );
  assert.equal(wrongMethod.status, 405);

  const wrongPath = await handleSubmission(
    submissionRequest(validFields(), {
      url: "https://ai-qualifier-telegram-relay.example.workers.dev/other",
    }),
    env,
  );
  assert.equal(wrongPath.status, 404);

  const oversized = await handleSubmission(
    submissionRequest(validFields(), {
      headers: { "Content-Length": "70000" },
    }),
    env,
  );
  assert.equal(oversized.status, 413);
});

test("validates the submission and applies the rate limit before forwarding", async () => {
  let upstreamCalls = 0;
  const fetchImpl = async () => {
    upstreamCalls += 1;
    return Response.json({ ok: true });
  };

  const malformed = await handleSubmission(
    submissionRequest(validFields({ submission_type: "Неизвестный тип" })),
    createEnv(),
    fetchImpl,
  );
  assert.equal(malformed.status, 422);

  const limited = await handleSubmission(
    submissionRequest(),
    createEnv({ rateLimitSuccess: false }),
    fetchImpl,
  );
  assert.equal(limited.status, 429);
  assert.equal(upstreamCalls, 0);
});

test("stores the original submission before sending the Telegram copy", async () => {
  const calls = [];
  const queuedBatches = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ ok: true });
  };

  const response = await handleSubmission(
    submissionRequest(),
    createEnv({
      async sendBatch(messages) {
        queuedBatches.push(messages);
      },
    }),
    fetchImpl,
  );
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.queued, true);
  assert.match(result.delivery_id, /^[0-9a-f-]{36}$/i);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://formspree.io/f/test-endpoint");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(
    calls[0].init.body.get("brief").replace(/\r\n/g, "\n"),
    validFields().brief,
  );
  assert.equal(queuedBatches.length, 1);
  assert.equal(queuedBatches[0].length, 1);
  assert.equal(queuedBatches[0][0].delaySeconds, 0);
  assert.equal(queuedBatches[0][0].body.delivery_id, result.delivery_id);
  assert.match(queuedBatches[0][0].body.text, /Тестовая компания/);
});

test("does not notify Telegram when Formspree rejects the submission", async () => {
  let upstreamCalls = 0;
  const response = await handleSubmission(
    submissionRequest(),
    createEnv(),
    async () => {
      upstreamCalls += 1;
      return Response.json({ error: "invalid" }, { status: 422 });
    },
  );

  assert.equal(response.status, 422);
  assert.equal(upstreamCalls, 1);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "submission_rejected",
  });
});

test("keeps a saved submission successful if queueing is temporarily unavailable", async () => {
  const response = await handleSubmission(
    submissionRequest(),
    createEnv({
      async sendBatch() {
        throw new Error("queue unavailable");
      },
    }),
    async () => Response.json({ ok: true }),
    silentLogger,
  );

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.queued, false);
  assert.match(result.delivery_id, /^[0-9a-f-]{36}$/i);
});

test("queue consumer acknowledges successful Telegram delivery", async () => {
  const events = [];
  const message = {
    body: {
      delivery_id: "c7cf34da-a2d8-43e4-90e7-8598d28cc5de",
      part: 1,
      total_parts: 1,
      text: "Тестовое уведомление",
    },
    ack() {
      events.push("ack");
    },
    retry() {
      events.push("retry");
    },
  };

  await handleTelegramQueue(
    { messages: [message] },
    createEnv(),
    async (url, init) => {
      assert.match(
        String(url),
        /^https:\/\/api\.telegram\.org\/bottest-only-token\/sendMessage$/,
      );
      const body = JSON.parse(init.body);
      assert.equal(body.chat_id, "123456789");
      assert.equal(body.parse_mode, undefined);
      assert.equal(body.text, "Тестовое уведомление");
      return Response.json({ ok: true, result: { message_id: 42 } });
    },
    silentLogger,
  );

  assert.deepEqual(events, ["ack"]);
});

test("queue consumer retries a temporary Telegram failure", async () => {
  const events = [];
  const message = {
    attempts: 1,
    body: {
      delivery_id: "c7cf34da-a2d8-43e4-90e7-8598d28cc5de",
      part: 1,
      total_parts: 1,
      text: "Тестовое уведомление",
    },
    ack() {
      events.push("ack");
    },
    retry(options) {
      events.push(["retry", options]);
    },
  };

  await handleTelegramQueue(
    { messages: [message] },
    createEnv(),
    async () => Response.json({ ok: false }, { status: 502 }),
    silentLogger,
  );

  assert.deepEqual(events, [["retry", { delaySeconds: 60 }]]);
});
