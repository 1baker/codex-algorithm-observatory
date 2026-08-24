import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/shared", { recursive: true });
await cp("public", "dist", { recursive: true });
await cp("lib/catalog.mjs", "dist/shared/catalog.mjs");
await cp("lib/events.mjs", "dist/shared/events.mjs");

const [html, css, appSource, catalogSource, eventsSource] = await Promise.all([
  readFile("public/index.html", "utf8"),
  readFile("public/styles.css", "utf8"),
  readFile("public/app.js", "utf8"),
  readFile("lib/catalog.mjs", "utf8"),
  readFile("lib/events.mjs", "utf8")
]);
const stripExports = (source) => source.replace(/^export\s+/gm, "");
const app = appSource.replace(/^import .*;\n/gm, "");
const standalone = html
  .replace('<link rel="stylesheet" href="/styles.css">', `<style>${css}</style>`)
  .replace('<script type="module" src="./app.js"></script>', `<script>${stripExports(catalogSource)}\n${stripExports(eventsSource)}\n${app}</script>`);
await writeFile("dist/preview.html", standalone);
console.log("Built static teaching preview in dist/");
