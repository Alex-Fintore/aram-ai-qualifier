import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

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

test("server-renders the customer brief rather than the starter", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="ru"/i);
  assert.match(html, /<title>AI-квалификатор входящих лидов<\/title>/i);
  assert.match(html, /<link[^>]+rel="icon"[^>]+data:image\/svg\+xml/i);
  assert.match(html, /Короткий бриф/i);
  assert.match(html, /10 вопросов/i);
  assert.match(html, /Черновик сохраняется на этом устройстве/i);
  assert.match(html, /Чувствительные материалы мы запросим отдельно/i);
  assert.match(html, /Отправ(?:ить на первичную оценку|ка подключается)/i);
  assert.doesNotMatch(html, /Критерии успешности/i);
  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.doesNotMatch(html, /Codex is working|Your site is taking shape/i);
});

test("ships ten primary questions plus an optional detailed questionnaire", async () => {
  const [content, form, page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/brief-content.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/BriefForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  for (const heading of [
    "Контакт и вводные",
    "Бизнес и воронка",
    "Сценарий звонка",
    "Системы и интеграции",
    "Данные и безопасность",
    "Пилот и материалы",
  ]) {
    assert.match(content, new RegExp(heading));
  }

  const primaryBlock = content.match(
    /export const primaryQuestions:[\s\S]*?\n\];/,
  );
  assert.ok(primaryBlock, "primary questions must be declared separately");
  assert.equal(
    [...primaryBlock[0].matchAll(/\n\s+id:\s+"[^"]+"/g)].length,
    10,
  );
  assert.match(content, /Ориентир из обсуждения: 15%/);
  assert.match(`${content}\n${form}`, /нет данных/i);
  assert.match(`${content}\n${form}`, /предоставим позже/i);
  assert.match(form, /submitState === "success"/);
  assert.match(form, /<DeepDiveForm\b/);
  assert.match(form, /Необязательно/);
  assert.match(page, /<BriefForm \/>/);
  assert.match(layout, /lang="ru"/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
