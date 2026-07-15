import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

register("./typescript-resolver.mjs", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the primary brief as one page with no more than ten questions", async () => {
  const response = await render();
  assert.equal(response.status, 200);

  const html = await response.text();
  const primaryQuestions = html.match(
    /data-brief-question=["']primary["']/gi,
  );

  assert.ok(
    primaryQuestions,
    "the rendered page must identify its primary questions",
  );
  assert.ok(
    primaryQuestions.length <= 10,
    `expected at most 10 primary questions, received ${primaryQuestions.length}`,
  );
  assert.doesNotMatch(html, /aria-label=["']Разделы брифа["']/i);
  assert.doesNotMatch(html, /Сохранить и продолжить|Проверить ответы/i);
  assert.match(html, /<button[^>]*type=["']submit["'][^>]*>/i);
});

test("keeps every deep question out of the page before primary success", async () => {
  const response = await render();
  const html = await response.text();

  assert.doesNotMatch(html, /data-brief-question=["']deep["']/i);
  assert.doesNotMatch(html, /Критерии успешности/i);
  assert.doesNotMatch(html, /Что ускорит подготовку предложения/i);
});

test("the first submission payload excludes answers reserved for the deep brief", async () => {
  const { buildSubmissionPayload, createInitialDraft } = await import(
    `../app/brief-model.ts?test=${process.pid}-${Date.now()}`
  );
  const draft = createInitialDraft();

  draft.answers.company = "PRIMARY-COMPANY-SENTINEL";
  draft.answers.contact_name = "Primary Contact";
  draft.answers.contact_channel = "primary@example.com";
  draft.answers.infrastructure = "DEEP-ANSWER-SENTINEL";
  draft.answers.voice_legal = "DEEP-LEGAL-SENTINEL";
  draft.pilot.pilot_metric_1.target = "DEEP-PILOT-SENTINEL";
  draft.materials.material_1.link = "DEEP-MATERIAL-SENTINEL";

  const serializedPayload = JSON.stringify(buildSubmissionPayload(draft));

  assert.match(serializedPayload, /PRIMARY-COMPANY-SENTINEL/);
  assert.doesNotMatch(
    serializedPayload,
    /DEEP-(?:ANSWER|LEGAL|PILOT|MATERIAL)-SENTINEL/,
  );
});

test("successful primary submission offers an optional deeper brief", async () => {
  const formSource = await readFile(
    new URL("../app/BriefForm.tsx", import.meta.url),
    "utf8",
  );

  const successStart = formSource.search(
    /if\s*\(submitState\s*===\s*["']success["']\)/,
  );
  const initialPageStart = formSource.indexOf(
    '<div id="top" className="page-shell page-shell--quick">',
    successStart,
  );

  assert.ok(successStart >= 0, "the form must have an explicit success state");
  assert.ok(
    initialPageStart > successStart,
    "the success view must precede the initial page",
  );

  const successView = formSource.slice(successStart, initialPageStart);
  assert.match(successView, /углубл[её]нн|более точн(?:ой|ая) оценк/i);
  assert.match(successView, /необязательн|по желанию/i);
  assert.match(successView, /<DeepDiveForm\b/i);
  assert.match(formSource, /data-brief-question=["']deep["']/i);
});
