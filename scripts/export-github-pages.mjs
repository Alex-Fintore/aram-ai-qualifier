#!/usr/bin/env node

import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultProjectRoot = path.resolve(path.dirname(scriptPath), "..");
const safeRepositoryName = /^[A-Za-z0-9._-]+$/;
const rootAssetReference = /(?<![A-Za-z0-9/])\/assets\//g;

function assertSafeRepositoryName(value, label) {
  if (
    !value ||
    value === "." ||
    value === ".." ||
    !safeRepositoryName.test(value)
  ) {
    throw new Error(`${label} is not a safe GitHub repository name.`);
  }

  return value;
}

function normalizeExplicitBasePath(value) {
  const candidate = value.trim();
  if (candidate === "/") return "/";

  if (
    !candidate.startsWith("/") ||
    candidate.includes("?") ||
    candidate.includes("#") ||
    candidate.includes("\\") ||
    candidate.includes("//")
  ) {
    throw new Error(
      "GitHub Pages base path must be an absolute path without a URL, query, or fragment.",
    );
  }

  const segments = candidate.replace(/^\/+|\/+$/g, "").split("/");
  for (const segment of segments) {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new Error("GitHub Pages base path contains invalid encoding.");
    }

    if (decoded !== segment || !safeRepositoryName.test(segment)) {
      throw new Error("GitHub Pages base path contains an unsafe segment.");
    }
    assertSafeRepositoryName(segment, "GitHub Pages base path segment");
  }

  return `/${segments.join("/")}/`;
}

export function resolvePagesBasePath({
  explicitBasePath,
  githubRepository,
  fallbackRepositoryName,
}) {
  if (typeof explicitBasePath === "string" && explicitBasePath.trim()) {
    return normalizeExplicitBasePath(explicitBasePath);
  }

  if (typeof githubRepository === "string" && githubRepository.trim()) {
    const parts = githubRepository.trim().split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(
        "GITHUB_REPOSITORY must use the GitHub owner/repository format.",
      );
    }

    const [owner, repositoryName] = parts;
    assertSafeRepositoryName(owner, "GitHub repository owner");
    assertSafeRepositoryName(repositoryName, "GitHub repository name");

    if (
      repositoryName.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ) {
      return "/";
    }

    return `/${repositoryName}/`;
  }

  return `/${assertSafeRepositoryName(
    fallbackRepositoryName,
    "Fallback repository name",
  )}/`;
}

function resolveInside(rootDirectory, relativePath, label) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must be a relative path.`);
  }

  const resolved = path.resolve(rootDirectory, relativePath);
  const relative = path.relative(rootDirectory, resolved);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${label} escapes its expected directory.`);
  }

  return resolved;
}

function assertSafeOutputDirectory(projectRoot, outputDirectory) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedOutput = path.resolve(outputDirectory);
  const relative = path.relative(resolvedProjectRoot, resolvedOutput);

  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("GitHub Pages output must stay inside the project.");
  }

  if (relative !== "out" && !relative.startsWith(`work${path.sep}`)) {
    throw new Error(
      'GitHub Pages output may only use the project "out" directory or a test directory under "work".',
    );
  }

  return resolvedOutput;
}

function rewriteAssetReferences(source, basePath) {
  if (basePath === "/") return source;
  return source.replace(rootAssetReference, `${basePath}assets/`);
}

function rewriteVitePreloadBase(source, basePath) {
  if (basePath === "/") return source;

  let replacements = 0;
  const rewritten = source.replace(
    /function\(([A-Za-z_$][\w$]*)\)\{return(["'`])\/\2\+\1\}/g,
    (_match, variableName) => {
      replacements += 1;
      return `function(${variableName}){return${JSON.stringify(basePath)}+${variableName}}`;
    },
  );

  if (
    source.includes("__vite__mapDeps") &&
    source.includes("vite:preloadError") &&
    replacements === 0
  ) {
    throw new Error(
      "The vinext browser entry uses an unknown Vite preload base; refusing to publish broken assets.",
    );
  }

  return rewritten;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function rewriteCopiedAssets(outputDirectory, browserEntry, basePath) {
  const browserEntryPath = resolveInside(
    outputDirectory,
    browserEntry,
    "vinext browser entry",
  );
  const files = await listFiles(outputDirectory);

  for (const file of files) {
    const extension = path.extname(file);
    if (extension !== ".css" && extension !== ".js") continue;

    const source = await readFile(file, "utf8");
    let rewritten = rewriteAssetReferences(source, basePath);
    if (file === browserEntryPath) {
      rewritten = rewriteVitePreloadBase(rewritten, basePath);
    }

    if (rewritten !== source) {
      await writeFile(file, rewritten);
    }
  }
}

async function renderRootPage(serverEntry, clientDirectory) {
  const moduleUrl = pathToFileURL(serverEntry);
  moduleUrl.searchParams.set(
    "pages-export",
    `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );

  const { default: worker } = await import(moduleUrl.href);
  const fetchHandler =
    typeof worker === "function"
      ? worker
      : typeof worker?.fetch === "function"
        ? worker.fetch.bind(worker)
        : null;

  if (!fetchHandler) {
    throw new Error("The vinext server bundle does not export a fetch handler.");
  }

  const response = await fetchHandler(
    new Request("https://github-pages.invalid/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const pathname = new URL(request.url).pathname;
          if (!pathname.startsWith("/assets/")) {
            return new Response("Not found", { status: 404 });
          }

          try {
            const assetPath = resolveInside(
              clientDirectory,
              pathname.slice(1),
              "vinext asset request",
            );
            return new Response(await readFile(assetPath));
          } catch {
            return new Response("Not found", { status: 404 });
          }
        },
      },
    },
    {
      passThroughOnException() {},
      waitUntil() {},
    },
  );

  if (response.status !== 200) {
    throw new Error(`vinext root render returned HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!/^text\/html\b/i.test(contentType)) {
    throw new Error(`vinext root render returned ${contentType || "no content type"}.`);
  }

  return response.text();
}

export async function exportGitHubPages({
  projectRoot = defaultProjectRoot,
  outputDirectory = path.join(projectRoot, "out"),
  basePath = resolvePagesBasePath({
    explicitBasePath: process.env.GITHUB_PAGES_BASE_PATH,
    githubRepository: process.env.GITHUB_REPOSITORY,
    fallbackRepositoryName: path.basename(projectRoot),
  }),
} = {}) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedOutput = assertSafeOutputDirectory(
    resolvedProjectRoot,
    outputDirectory,
  );
  const normalizedBasePath = normalizeExplicitBasePath(basePath);
  const clientDirectory = path.join(resolvedProjectRoot, "dist", "client");
  const serverEntry = path.join(
    resolvedProjectRoot,
    "dist",
    "server",
    "index.js",
  );
  const manifestPath = path.join(clientDirectory, ".vite", "manifest.json");

  await Promise.all([
    access(clientDirectory),
    access(serverEntry),
    access(manifestPath),
  ]).catch(() => {
    throw new Error(
      'vinext build output is missing. Run "npm run build" before exporting GitHub Pages.',
    );
  });

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const browserEntry = manifest["virtual:vinext-app-browser-entry"]?.file;
  if (typeof browserEntry !== "string") {
    throw new Error("vinext client manifest has no browser hydration entry.");
  }
  await access(
    resolveInside(clientDirectory, browserEntry, "vinext browser entry"),
  );

  const renderedHtml = await renderRootPage(serverEntry, clientDirectory);
  if (
    !renderedHtml.includes("self.__VINEXT_RSC_DONE__=true") ||
    !renderedHtml.includes(`import(\"/${browserEntry}\")`)
  ) {
    throw new Error(
      "The rendered page is missing vinext hydration data or its browser entry.",
    );
  }

  await rm(resolvedOutput, { recursive: true, force: true });
  await mkdir(path.dirname(resolvedOutput), { recursive: true });
  await cp(clientDirectory, resolvedOutput, { recursive: true });
  await rewriteCopiedAssets(resolvedOutput, browserEntry, normalizedBasePath);

  const html = rewriteAssetReferences(renderedHtml, normalizedBasePath);
  if (rootAssetReference.test(html)) {
    rootAssetReference.lastIndex = 0;
    throw new Error("The exported HTML still contains root-relative assets.");
  }
  rootAssetReference.lastIndex = 0;

  await Promise.all([
    writeFile(path.join(resolvedOutput, "index.html"), html),
    writeFile(path.join(resolvedOutput, "404.html"), html),
    writeFile(path.join(resolvedOutput, ".nojekyll"), ""),
  ]);

  return {
    basePath: normalizedBasePath,
    browserEntry,
    outputDirectory: resolvedOutput,
  };
}

async function main() {
  const result = await exportGitHubPages();
  const relativeOutput = path.relative(defaultProjectRoot, result.outputDirectory);
  process.stdout.write(
    `GitHub Pages export ready in ${relativeOutput} for ${result.basePath}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
