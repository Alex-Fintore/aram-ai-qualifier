import assert from "node:assert/strict";
import { access, readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  exportGitHubPages,
  resolvePagesBasePath,
} from "../scripts/export-github-pages.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

test("derives and validates the GitHub Pages base path", () => {
  assert.equal(
    resolvePagesBasePath({
      githubRepository: "fintore/ai-qualifier",
      fallbackRepositoryName: "ignored",
    }),
    "/ai-qualifier/",
  );

  assert.equal(
    resolvePagesBasePath({
      githubRepository: "fintore/fintore.github.io",
      fallbackRepositoryName: "ignored",
    }),
    "/",
  );

  assert.equal(
    resolvePagesBasePath({
      explicitBasePath: "/customer-brief",
      fallbackRepositoryName: "ignored",
    }),
    "/customer-brief/",
  );

  assert.throws(
    () =>
      resolvePagesBasePath({
        explicitBasePath: "/../outside/",
        fallbackRepositoryName: "ignored",
      }),
    /base path/i,
  );
});

test("keeps the published project identity neutral", async () => {
  const [packageText, readme, state] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../STATE.md", import.meta.url), "utf8"),
  ]);

  const packageJson = JSON.parse(packageText);
  assert.equal(packageJson.name, "ai-qualifier-brief");
  assert.match(readme, /alex-fintore\.github\.io\/ai-qualifier\//i);
  assert.match(state, /alex-fintore\.github\.io\/ai-qualifier\//i);
  assert.doesNotMatch(`${packageText}\n${readme}\n${state}`, /aram-ai-qualifier/i);
});

test("exports a hydratable vinext page with subpath-safe assets", async () => {
  const outputDirectory = path.join(
    projectRoot,
    "work",
    `github-pages-export-test-${process.pid}`,
  );

  try {
    const result = await exportGitHubPages({
      projectRoot,
      outputDirectory,
      basePath: "/ai-qualifier/",
    });

    assert.equal(result.basePath, "/ai-qualifier/");
    await Promise.all([
      access(path.join(outputDirectory, ".nojekyll")),
      access(path.join(outputDirectory, "404.html")),
      access(path.join(outputDirectory, "assets")),
    ]);

    const [html, fallbackHtml, manifestText] = await Promise.all([
      readFile(path.join(outputDirectory, "index.html"), "utf8"),
      readFile(path.join(outputDirectory, "404.html"), "utf8"),
      readFile(path.join(outputDirectory, ".vite", "manifest.json"), "utf8"),
    ]);

    assert.equal(fallbackHtml, html);
    assert.match(html, /self\.__VINEXT_RSC_DONE__=true/);
    assert.match(html, /import\("\/ai-qualifier\/assets\//);
    assert.match(html, /href="\/ai-qualifier\/assets\//);
    assert.doesNotMatch(html, /(?<![A-Za-z0-9])\/assets\//);

    const manifest = JSON.parse(manifestText);
    const browserEntry = manifest["virtual:vinext-app-browser-entry"]?.file;
    assert.equal(typeof browserEntry, "string");
    await access(path.join(outputDirectory, browserEntry));

    const browserEntrySource = await readFile(
      path.join(outputDirectory, browserEntry),
      "utf8",
    );
    assert.match(
      browserEntrySource,
      /return["'`]\/ai-qualifier\/["'`]\+/,
    );
    assert.doesNotMatch(
      browserEntrySource,
      /function\(([A-Za-z_$][\w$]*)\)\{return["'`]\/["'`]\+\1\}/,
    );

    for (const assetUrl of html.matchAll(
      /\/ai-qualifier\/(assets\/[A-Za-z0-9_./-]+)/g,
    )) {
      await access(path.join(outputDirectory, assetUrl[1]));
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("workflow passes the public receiver endpoint into the Pages build", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/deploy-pages.yml", import.meta.url),
    "utf8",
  );

  assert.match(
    workflow,
    /NEXT_PUBLIC_FORMSPREE_ENDPOINT:\s*\$\{\{\s*vars\.NEXT_PUBLIC_FORMSPREE_ENDPOINT\s*\}\}/,
  );
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.doesNotMatch(workflow, /include-hidden-files/);
});
