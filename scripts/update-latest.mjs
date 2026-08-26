// Regenerates the block between the LATEST markers in README.md.
//
// Only the volatile facts live in that block: the shipped skill version and the
// most recent posts. The prose around it is hand written and is never touched.
// Both sources are public, so this needs no secrets, and every failure path
// leaves the existing README exactly as it was rather than publishing a
// half-built profile.

import { readFile, writeFile } from "node:fs/promises";

const PLUGIN = "https://raw.githubusercontent.com/manavmishra/ZeroSlop/main/.claude-plugin/plugin.json";
const FEED = "https://zero-slop.ai/blog/rss.xml";
const README = new URL("../README.md", import.meta.url);
const START = "<!-- latest:start -->";
const END = "<!-- latest:end -->";
const POST_LIMIT = 3;

function fail(reason) {
  console.log(`Leaving README unchanged: ${reason}`);
  process.exit(0);
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function getPosts() {
  const response = await fetch(FEED, { headers: { accept: "application/rss+xml" } });
  if (!response.ok) throw new Error(`${FEED} returned ${response.status}`);
  const xml = await response.text();
  const posts = [];
  for (const item of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const title = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim();
    const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim();
    if (title && link) posts.push({ title, link });
  }
  return posts.slice(0, POST_LIMIT);
}

let version;
let posts;
try {
  [{ version }, posts] = await Promise.all([getJson(PLUGIN), getPosts()]);
} catch (error) {
  fail(error.message);
}

// A malformed upstream must not blank the section.
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) fail(`unusable version ${JSON.stringify(version)}`);
if (!posts.length) fail("no posts parsed from the feed");

const block = [
  START,
  "",
  `Zero Slop is at **v${version}**. Recent posts:`,
  "",
  ...posts.map((post) => `- [${post.title}](${post.link})`),
  "",
  END,
].join("\n");

const current = await readFile(README, "utf8");
if (!current.includes(START) || !current.includes(END)) fail("markers missing from README.md");

const updated = current.replace(
  new RegExp(`${START}[\\s\\S]*?${END}`),
  () => block,
);

if (updated === current) {
  console.log("Already current.");
  process.exit(0);
}

await writeFile(README, updated);
console.log(`Updated: v${version}, ${posts.length} posts.`);
