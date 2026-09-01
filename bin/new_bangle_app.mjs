#!/usr/bin/env node

/**
 * @file
 * Scaffolds a new app, clock or widget by copying the matching apps/_example_*
 * template and renaming every occurrence of the "7chname" placeholder.
 *
 * Run it like this:
 * node bin/new_bangle_app.mjs
 * node bin/new_bangle_app.mjs --id myclock --name "My Clock" --type clock --author myuser
 *
 * Missing values are prompted for when running interactively.
 *
 * Options:
 *   --id           app id, used for the directory and all storage file names
 *   --name         human readable name
 *   --type         clock | app | widget
 *   --author       GitHub username (or 'Espruino' for anonymity)
 *   --description  long description (defaults to the name)
 *   --short-name   short name for the launcher (required if name > 20 chars)
 *   --force        overwrite an existing apps/<id> directory
 */

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

// Keep these in sync with bin/sanitycheck.js
const MAX_FILE_NAME_LENGTH = 28;
const MAX_NAME_LENGTH = 20;
const FORBIDDEN_FILE_NAME_CHARS = /[,;]/;
// README.md describes the id as a "7 character app id" - longer ids work, but
// they eat into the 28 char budget shared by every file the app ever writes.
const RECOMMENDED_ID_LENGTH = 7;
const PLACEHOLDER = "7chname";

const TEMPLATES = {
  clock: {
    dir: "_example_clock",
    type: "clock",
    tags: "clock",
    icon: "icon.png",
    screenshots: ["screenshot.png"],
    heading: "# Clock Name",
    storage: id => [
      { name: `${id}.app.js`, url: "app.js" },
      { name: `${id}.img`, url: "app-icon.js", evaluate: true },
    ],
  },
  app: {
    dir: "_example_app",
    type: undefined, // an app with no 'type' is an app - matches _example_app
    tags: "",
    icon: "app.png",
    screenshots: [],
    heading: "# App Name",
    storage: id => [
      { name: `${id}.app.js`, url: "app.js" },
      { name: `${id}.img`, url: "app-icon.js", evaluate: true },
    ],
  },
  widget: {
    dir: "_example_widget",
    type: "widget",
    tags: "widget",
    icon: "icon.png",
    screenshots: [],
    heading: "# Widget Name",
    storage: id => [{ name: `${id}.wid.js`, url: "widget.js" }],
  },
};

const TEXT_EXTENSIONS = [".js", ".json", ".md", ".txt"];
const TEXT_FILENAMES = ["ChangeLog"];

// import.meta.dirname needs node >=20.11, and the CI runs node 18
const BASEDIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPSDIR = path.join(BASEDIR, "apps");

const args = parseArgs(process.argv.slice(2));
const interactive = process.stdin.isTTY && process.stdout.isTTY;
const rl = interactive
  ? readline.createInterface({ input: process.stdin, output: process.stdout })
  : undefined;

try {
  await main();
} finally {
  rl?.close();
}

async function main() {
  const type = await askUntil(
    "type",
    "App type (clock/app/widget)",
    "app",
    value => (TEMPLATES[value] ? undefined : `'${value}' is not one of clock/app/widget`),
  );
  const template = TEMPLATES[type];

  const id = await askUntil("id", "App id (lowercase, no spaces)", undefined, value =>
    validateId(value, type),
  );

  const name = await askUntil("name", "Human readable name", undefined, value =>
    value.trim() ? undefined : "a name is required",
  );

  // sanitycheck.js: "App <id> has a long name, but no shortName"
  let shortName = args["short-name"]?.trim();
  if (shortName && shortName.length > MAX_NAME_LENGTH)
    fail(`--short-name must be at most ${MAX_NAME_LENGTH} characters`);
  if (name.length > MAX_NAME_LENGTH && !shortName) {
    shortName = await askUntil(
      "short-name",
      `Name is ${name.length} chars (>${MAX_NAME_LENGTH}), short name for the launcher`,
      undefined,
      value =>
        value.length && value.length <= MAX_NAME_LENGTH
          ? undefined
          : `a name longer than ${MAX_NAME_LENGTH} chars needs a shortName` +
            ` - pass --short-name "..." (1-${MAX_NAME_LENGTH} chars)`,
    );
  }

  const author = await askUntil(
    "author",
    "Author (GitHub username, or 'Espruino')",
    undefined,
    value => (value.trim() ? undefined : "an author is required, sanitycheck.js rejects apps without one"),
  );

  const description = (args.description || (await ask("Description", name))).trim() || name;

  const appDir = path.join(APPSDIR, id);
  if (await exists(appDir)) {
    if (!args.force) fail(`apps/${id} already exists (use --force to overwrite)`);
    await fs.rm(appDir, { recursive: true });
    console.log(`! Removed existing apps/${id}`);
  }

  warnAboutLengths(id, template);

  // --- copy the template, renaming the placeholder in file names ------------
  const templateDir = path.join(APPSDIR, template.dir);
  await fs.mkdir(appDir, { recursive: true });
  for (const entry of await fs.readdir(templateDir)) {
    const target = entry.replaceAll(PLACEHOLDER, id);
    const from = path.join(templateDir, entry);
    const to = path.join(appDir, target);
    if (isTextFile(entry)) {
      await fs.writeFile(to, rewrite(await fs.readFile(from, "utf8"), { id, name, author, template }));
    } else {
      await fs.copyFile(from, to);
    }
    console.log(`  apps/${id}/${target}${target !== entry ? ` (was ${entry})` : ""}`);
  }

  // --- files we generate rather than copy ----------------------------------
  await fs.writeFile(path.join(appDir, "ChangeLog"), "0.01: New App!\n");
  await fs.writeFile(
    path.join(appDir, "metadata.json"),
    JSON.stringify(buildMetadata({ id, name, shortName, author, description, template }), undefined, 2) + "\n",
  );

  console.log(`\n✔️ Created apps/${id}\n`);
  const jsIcon = template.storage(id).find(f => f.name.endsWith(".img"));
  let step = 1;
  console.log("Next steps:");
  console.log(`  ${step++}. Replace apps/${id}/${template.icon} (the icon shown in the app loader)`);
  if (jsIcon)
    console.log(
      `  ${step++}. Replace apps/${id}/${jsIcon.url} - https://www.espruino.com/Image+Converter` +
        " (1 bit, 'Image String', heatshrink, 24-48px)",
    );
  console.log(`  ${step++}. Write apps/${id}/${template.storage(id)[0].url} and fill in apps/${id}/README.md`);
  console.log(`  ${step++}. Verify: CI=true node bin/sanitycheck.js && npx eslint --max-warnings 0 ./apps`);
}

/** Everything sanitycheck.js will reject outright. */
function validateId(id, type) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id))
    return "must be lowercase, start with a letter or digit, and only contain a-z 0-9 _ -";
  if (FORBIDDEN_FILE_NAME_CHARS.test(id)) return "must not contain ',' or ';'";
  if (type === "widget" && !id.startsWith("wid"))
    return "widget ids must start with 'wid' (sanitycheck.js rejects the rest)";
  const longest = TEMPLATES[type].storage(id).map(f => f.name).sort((a, b) => b.length - a.length)[0];
  if (longest.length > MAX_FILE_NAME_LENGTH)
    return `id is too long: '${longest}' is ${longest.length} chars, the limit is ${MAX_FILE_NAME_LENGTH}`;
  return undefined;
}

/** Length problems that don't break the build today, but will bite later. */
function warnAboutLengths(id, template) {
  if (id.length > RECOMMENDED_ID_LENGTH)
    console.log(
      `! Warning: id is ${id.length} chars. README.md suggests ${RECOMMENDED_ID_LENGTH}; longer ids still work.`,
    );
  const settings = `${id}.settings.json`;
  if (settings.length > MAX_FILE_NAME_LENGTH)
    console.log(
      `! Warning: '${settings}' would be ${settings.length} chars (limit ${MAX_FILE_NAME_LENGTH}).` +
        " This app can never have a settings file - shorten the id if you might want one.",
    );
  for (const file of template.storage(id))
    if (file.name.length > MAX_FILE_NAME_LENGTH - 4)
      console.log(`! Warning: '${file.name}' is close to the ${MAX_FILE_NAME_LENGTH} char limit.`);
}

function buildMetadata({ id, name, shortName, author, description, template }) {
  // Key order follows the metadata.json documentation in README.md
  const metadata = { id, name };
  if (shortName) metadata.shortName = shortName;
  metadata.version = "0.01";
  metadata.author = author;
  metadata.description = description;
  metadata.icon = template.icon;
  if (template.screenshots.length)
    metadata.screenshots = template.screenshots.map(url => ({ url }));
  if (template.type) metadata.type = template.type;
  metadata.tags = template.tags;
  metadata.supports = ["BANGLEJS2"];
  metadata.allow_emulator = true;
  metadata.readme = "README.md";
  metadata.storage = template.storage(id);
  return metadata;
}

/** Replace the placeholder and the template's own boilerplate wording. */
function rewrite(contents, { id, name, author, template }) {
  return contents
    .replaceAll(PLACEHOLDER, id)
    // widget.js registers itself under a generic key that would clash with
    // every other widget scaffolded from the same template
    .replaceAll('WIDGETS["mywidget"]', `WIDGETS[${JSON.stringify(id)}]`)
    .replace(template.heading, `# ${name}`)
    .replace(/^Your name$/m, author);
}

function isTextFile(filename) {
  return TEXT_FILENAMES.includes(filename) || TEXT_EXTENSIONS.includes(path.extname(filename));
}

// --- small CLI helpers -----------------------------------------------------

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) fail(`unexpected argument '${arg}'`);
    const key = arg.slice(2);
    if (key === "force") parsed.force = true;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) parsed[key] = argv[++i];
    else fail(`option '--${key}' needs a value`);
  }
  return parsed;
}

async function ask(prompt, fallback) {
  if (!rl) return fallback ?? "";
  const answer = (await rl.question(`${prompt}${fallback ? ` [${fallback}]` : ""}: `)).trim();
  return answer || fallback || "";
}

/** Read `key` from the command line, then keep prompting until `validate` passes. */
async function askUntil(key, prompt, fallback, validate) {
  let value = args[key];
  for (;;) {
    if (value === undefined) value = await ask(prompt, fallback);
    const error = validate(value.trim());
    if (!error) return value.trim();
    if (!rl) fail(error);
    console.log(`! ${error}`);
    value = undefined;
  }
}

async function exists(target) {
  return fs.stat(target).then(() => true, () => false);
}

function fail(message) {
  console.error(`Error: ${message}`);
  rl?.close();
  process.exit(1);
}
