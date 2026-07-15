export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_TELEGRAM_TEXT_LENGTH = 3900;

const ALLOWED_FIELDS = new Set([
  "_subject",
  "submission_type",
  "company",
  "contact_name",
  "contact_channel",
  "_replyto",
  "source",
  "submitted_at",
  "brief",
]);

const FIELD_LIMITS = {
  _subject: 500,
  submission_type: 100,
  company: 500,
  contact_name: 500,
  contact_channel: 500,
  _replyto: 500,
  source: 150,
  submitted_at: 100,
  brief: 60_000,
};

const SUBMISSION_TYPES = new Set([
  "Короткий первичный бриф",
  "Углублённый бриф",
]);

const TELEGRAM_PART_PREFIX_RESERVE = 64;

function responseHeaders(origin, allowedOrigin, extra = {}) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };

  if (origin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
  }

  return headers;
}

function jsonResponse(payload, status, origin, allowedOrigin, extraHeaders) {
  return Response.json(payload, {
    status,
    headers: responseHeaders(origin, allowedOrigin, extraHeaders),
  });
}

function normalizeBrief(value) {
  return value
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatSubmittedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}

function splitAtParagraphs(text, maxLength) {
  const chunks = [];
  let current = "";

  for (const paragraph of text.split(/\n\n/)) {
    if (paragraph.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let offset = 0; offset < paragraph.length; offset += maxLength) {
        chunks.push(paragraph.slice(offset, offset + maxLength));
      }
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxLength) {
      current = candidate;
    } else {
      chunks.push(current);
      current = paragraph;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export function buildTelegramMessages(fields) {
  const text = [
    "Новая заявка — AI-квалификатор",
    "",
    `Тип: ${fields.submission_type}`,
    `Компания: ${fields.company}`,
    `Контакт: ${fields.contact_name}`,
    `Связь: ${fields.contact_channel}`,
    `Отправлено: ${formatSubmittedAt(fields.submitted_at)}`,
    "",
    "Ответы",
    normalizeBrief(fields.brief),
  ].join("\n");

  if (text.length <= MAX_TELEGRAM_TEXT_LENGTH) return [text];

  const chunks = splitAtParagraphs(
    text,
    MAX_TELEGRAM_TEXT_LENGTH - TELEGRAM_PART_PREFIX_RESERVE,
  );

  return chunks.map(
    (chunk, index) =>
      `AI-квалификатор · часть ${index + 1}/${chunks.length}\n\n${chunk}`,
  );
}

async function parseSubmission(request) {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return { error: "unsupported_media_type", status: 415 };
  }

  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { error: "payload_too_large", status: 413 };
  }

  let bytes;
  try {
    bytes = await request.arrayBuffer();
  } catch {
    return { error: "invalid_payload", status: 400 };
  }

  if (bytes.byteLength > MAX_BODY_BYTES) {
    return { error: "payload_too_large", status: 413 };
  }

  let formData;
  try {
    const parsedRequest = new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: bytes,
    });
    formData = await parsedRequest.formData();
  } catch {
    return { error: "invalid_payload", status: 400 };
  }

  const fields = {};
  for (const [key, value] of formData.entries()) {
    if (
      !ALLOWED_FIELDS.has(key) ||
      typeof value !== "string" ||
      Object.hasOwn(fields, key) ||
      value.length > FIELD_LIMITS[key]
    ) {
      return { error: "invalid_fields", status: 422 };
    }
    fields[key] = value;
  }

  return { fields };
}

function validSubmission(fields, env) {
  const required = [
    "_subject",
    "submission_type",
    "company",
    "contact_name",
    "contact_channel",
    "source",
    "submitted_at",
    "brief",
  ];

  if (required.some((key) => !fields[key]?.trim())) return false;
  if (!SUBMISSION_TYPES.has(fields.submission_type)) return false;
  if (fields.source !== env.EXPECTED_SOURCE) return false;
  if (Number.isNaN(Date.parse(fields.submitted_at))) return false;
  return true;
}

function validEnvironment(env) {
  return (
    /^https:\/\/formspree\.io\/f\/[a-zA-Z0-9-]+$/.test(
      env.FORMSPREE_ENDPOINT ?? "",
    ) &&
    /^https:\/\/[^/]+$/.test(env.ALLOWED_ORIGIN ?? "") &&
    typeof env.EXPECTED_SOURCE === "string" &&
    typeof env.TELEGRAM_BOT_TOKEN === "string" &&
    env.TELEGRAM_BOT_TOKEN.length > 0 &&
    /^-?\d+$/.test(env.TELEGRAM_CHAT_ID ?? "") &&
    typeof env.RATE_LIMITER?.limit === "function" &&
    typeof env.TELEGRAM_QUEUE?.sendBatch === "function"
  );
}

async function sendTelegramText(text, env, fetchImpl) {
  try {
    const response = await fetchImpl(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          link_preview_options: { is_disabled: true },
        }),
      },
    );

    if (!response.ok) return { ok: false, status: response.status };
    const result = await response.json().catch(() => null);
    return {
      ok: result?.ok === true,
      status: response.status,
      messageId: result?.result?.message_id,
    };
  } catch {
    return { ok: false, status: 0 };
  }
}

function validQueueMessage(body) {
  return (
    body &&
    typeof body.delivery_id === "string" &&
    /^[0-9a-f-]{36}$/i.test(body.delivery_id) &&
    Number.isInteger(body.part) &&
    body.part > 0 &&
    Number.isInteger(body.total_parts) &&
    body.total_parts >= body.part &&
    typeof body.text === "string" &&
    body.text.length > 0 &&
    body.text.length <= MAX_TELEGRAM_TEXT_LENGTH
  );
}

export async function handleTelegramQueue(
  batch,
  env,
  fetchImpl = fetch,
  logger = console,
) {
  for (const message of batch.messages) {
    if (!validQueueMessage(message.body)) {
      logger.error("telegram_queue_invalid_message");
      message.ack();
      continue;
    }

    const result = await sendTelegramText(message.body.text, env, fetchImpl);
    if (result.ok) {
      logger.info(
        JSON.stringify({
          event: "telegram_delivery_succeeded",
          delivery_id: message.body.delivery_id,
          part: message.body.part,
          total_parts: message.body.total_parts,
          telegram_message_id: result.messageId,
        }),
      );
      message.ack();
      continue;
    }

    logger.error(
      JSON.stringify({
        event: "telegram_delivery_retry",
        delivery_id: message.body.delivery_id,
        part: message.body.part,
        total_parts: message.body.total_parts,
        attempt: message.attempts,
        status: result.status,
      }),
    );
    message.retry({ delaySeconds: 60 });
  }
}

export async function handleSubmission(
  request,
  env,
  fetchImpl = fetch,
  logger = console,
) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigin = env.ALLOWED_ORIGIN ?? "";

  if (url.pathname !== "/submit") {
    return jsonResponse({ ok: false, error: "not_found" }, 404, origin, allowedOrigin);
  }

  if (origin !== allowedOrigin) {
    return jsonResponse({ ok: false, error: "forbidden" }, 403, origin, allowedOrigin);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: responseHeaders(origin, allowedOrigin, {
        "Access-Control-Allow-Headers": "Accept, Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "86400",
      }),
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { ok: false, error: "method_not_allowed" },
      405,
      origin,
      allowedOrigin,
      { Allow: "POST, OPTIONS" },
    );
  }

  if (!validEnvironment(env)) {
    return jsonResponse(
      { ok: false, error: "service_unavailable" },
      503,
      origin,
      allowedOrigin,
    );
  }

  const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const rateLimit = await env.RATE_LIMITER.limit({
    key: `submission:${clientIp}`,
  });
  if (!rateLimit.success) {
    return jsonResponse(
      { ok: false, error: "rate_limited" },
      429,
      origin,
      allowedOrigin,
    );
  }

  const parsed = await parseSubmission(request);
  if (parsed.error) {
    return jsonResponse(
      { ok: false, error: parsed.error },
      parsed.status,
      origin,
      allowedOrigin,
    );
  }

  if (!validSubmission(parsed.fields, env)) {
    return jsonResponse(
      { ok: false, error: "invalid_submission" },
      422,
      origin,
      allowedOrigin,
    );
  }

  const forwarded = new FormData();
  for (const [key, value] of Object.entries(parsed.fields)) {
    forwarded.append(key, value);
  }

  let formspreeResponse;
  try {
    formspreeResponse = await fetchImpl(env.FORMSPREE_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: forwarded,
    });
  } catch {
    return jsonResponse(
      { ok: false, error: "submission_unavailable" },
      502,
      origin,
      allowedOrigin,
    );
  }

  if (!formspreeResponse.ok) {
    const status = [422, 429].includes(formspreeResponse.status)
      ? formspreeResponse.status
      : 502;
    return jsonResponse(
      { ok: false, error: "submission_rejected" },
      status,
      origin,
      allowedOrigin,
    );
  }

  const deliveryId = crypto.randomUUID();
  const telegramMessages = buildTelegramMessages(parsed.fields);
  let queued = false;
  try {
    await env.TELEGRAM_QUEUE.sendBatch(
      telegramMessages.map((text, index) => ({
        body: {
          delivery_id: deliveryId,
          part: index + 1,
          total_parts: telegramMessages.length,
          text,
        },
        delaySeconds: index * 2,
      })),
    );
    queued = true;
  } catch {
    logger.error(
      JSON.stringify({
        event: "telegram_queue_write_failed",
        delivery_id: deliveryId,
      }),
    );
  }

  return jsonResponse(
    { ok: true, queued, delivery_id: deliveryId },
    200,
    origin,
    allowedOrigin,
  );
}

const worker = {
  fetch(request, env) {
    return handleSubmission(request, env);
  },
  queue(batch, env) {
    return handleTelegramQueue(batch, env);
  },
};

export default worker;
