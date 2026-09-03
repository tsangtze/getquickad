import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FRONTEND_DIR = path.join(ROOT, "Frontend");
const LOCALE_DIR = path.join(FRONTEND_DIR, "locales");

const SUPPORTED_LANGS = [
  "en",
  "es",
  "pt",
  "fr",
  "de",
  "it",
  "ja",
  "ko",
  "zh",
  "zh-TW",
  "tr",
  "hi"
];

function walkSourceFiles(directory) {
  const results = [];

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true
  })) {
    const fullPath =
      path.join(directory, entry.name);

    if (entry.isDirectory()) {
      /*
       * Locale JSON files are data, not source references.
       */
      if (fullPath === LOCALE_DIR) {
        continue;
      }

      results.push(
        ...walkSourceFiles(fullPath)
      );

      continue;
    }

    if (
      entry.isFile() &&
      (
        entry.name.endsWith(".js") ||
        entry.name.endsWith(".html")
      )
    ) {
      results.push(fullPath);
    }
  }

  return results;
}

function addMatches(set, text, regex, group = 1) {
  for (const match of text.matchAll(regex)) {
    const key =
      match[group]?.trim();

    if (key) {
      set.add(key);
    }
  }
}

function looksLikeI18nKey(value) {
  return (
    typeof value === "string" &&
    /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+$/i.test(value)
  );
}

function collectKeysFromSource(text) {
  const keys =
    new Set();

  /*
   * Static HTML:
   *
   * data-i18n="..."
   * data-i18n-placeholder="..."
   * data-i18n-aria-label="..."
   * and future data-i18n-* attributes.
   */
  addMatches(
    keys,
    text,
    /\bdata-i18n(?:-[a-z0-9_-]+)?\s*=\s*["']([^"']+)["']/gi
  );

  /*
   * Direct helper calls whose first argument is a literal key.
   */
  addMatches(
    keys,
    text,
    /\b(?:uiText|accountText|billingText|passwordText|musicText)\s*\(\s*["']([^"']+)["']/g
  );

  /*
   * Direct QuickAdI18n.t("...") calls.
   */
  addMatches(
    keys,
    text,
    /\bQuickAdI18n(?:\?\.)?\.t(?:\?\.)?\s*\(\s*["']([^"']+)["']/g
  );

  /*
   * Bare t("...") calls, principally i18n.js.
   */
  addMatches(
    keys,
    text,
    /(?:^|[^\w.])t\s*\(\s*["']([^"']+)["']/gm
  );

  /*
   * Indirect mappings:
   *
   *   key: "billing.api_plan_invalid"
   *
   * These are live locale references even though the translation helper
   * receives mapped.key rather than a string literal.
   */
  for (
    const match of text.matchAll(
      /\bkey\s*:\s*["']([^"']+)["']/g
    )
  ) {
    if (looksLikeI18nKey(match[1])) {
      keys.add(match[1]);
    }
  }

  /*
   * Stable-code -> locale-key mappings:
   *
   *   AUTH_LOGIN_FAILED: "account.api_login_failed"
   *   PASSWORD_INVALID: "password.api_invalid"
   *
   * Restrict the left side to uppercase stable-code identifiers so normal
   * application objects do not become accidental locale references.
   */
  for (
    const match of text.matchAll(
      /\b[A-Z][A-Z0-9_]*\s*:\s*["']([^"']+)["']/g
    )
  ) {
    if (looksLikeI18nKey(match[1])) {
      keys.add(match[1]);
    }
  }

  return keys;
}

const sourceFiles =
  walkSourceFiles(FRONTEND_DIR)
    .sort();

const canonical =
  new Set();

const perFile =
  [];

for (const file of sourceFiles) {
  const text =
    fs.readFileSync(
      file,
      "utf8"
    );

  const keys =
    collectKeysFromSource(text);

  for (const key of keys) {
    canonical.add(key);
  }

  perFile.push({
    file:
      path.relative(ROOT, file),
    keys
  });
}

const canonicalKeys =
  [...canonical].sort();

console.log(
  `Frontend source files scanned: ${sourceFiles.length}`
);

console.log(
  `Canonical source keys: ${canonicalKeys.length}`
);

const locales =
  new Map();

for (const lang of SUPPORTED_LANGS) {
  const file =
    path.join(
      LOCALE_DIR,
      `${lang}.json`
    );

  if (!fs.existsSync(file)) {
    throw new Error(
      `STOP: supported locale file missing: ${lang}.json`
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(
        fs.readFileSync(
          file,
          "utf8"
        )
      );
  } catch (error) {
    throw new Error(
      `STOP: invalid JSON in ${lang}.json`
    );
  }

  locales.set(
    lang,
    parsed
  );
}

let failed =
  false;

for (const lang of SUPPORTED_LANGS) {
  const locale =
    locales.get(lang);

  const missing =
    canonicalKeys.filter(
      key =>
        !Object.prototype.hasOwnProperty.call(
          locale,
          key
        )
    );

  console.log(
    `\n${lang}.json: ${Object.keys(locale).length} total keys, ${missing.length} canonical keys missing`
  );

  if (missing.length) {
    failed =
      true;

    for (const key of missing) {
      console.log(
        `  MISSING ${key}`
      );
    }
  }
}

const english =
  locales.get("en");

const englishMissing =
  canonicalKeys.filter(
    key =>
      !Object.prototype.hasOwnProperty.call(
        english,
        key
      )
  );

console.log(
  `\nEnglish missing canonical keys: ${englishMissing.length}`
);

if (failed) {
  throw new Error(
    "STOP: one or more supported locales do not implement the canonical source contract."
  );
}

console.log(
  "\nPASS: every locale implements the canonical source contract."
);
