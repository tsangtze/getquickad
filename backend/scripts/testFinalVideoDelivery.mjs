import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("./Frontend/app.js", "utf8");

console.log("=== VERSION 1.1.8.18 FINAL VIDEO DELIVERY TEST ===");

assert.match(
  source,
  /async function quickAdCheckPageSession\(\)\s*\{\s*const user = await quickAdReadSession\(\);\s*window\.quickAdAccountChanged\(user\);\s*return user;\s*\}/s,
  "quickAdCheckPageSession must propagate transient session errors without destructive reload."
);

assert.doesNotMatch(
  source,
  /async function quickAdCheckPageSession\(\)[\s\S]*?catch\s*\(error\)[\s\S]*?quickAdReloadPrivatePage\(\)/,
  "Transient session errors must not reload the private page."
);

assert.match(
  source,
  /const isSuccessfulFinalize\s*=\s*url\.includes\("\/finalize"\)\s*&&\s*response\.status === 201\s*&&\s*data\?\.ok === true;/s,
  "Successful finalization must be recognized explicitly."
);

assert.match(
  source,
  /const currentUser\s*=\s*isSuccessfulFinalize\s*\?\s*user\s*:\s*await quickAdCheckPageSession\(\);/s,
  "Successful finalization must preserve the authenticated request result."
);

assert.match(
  source,
  /if\s*\(\s*quickAdPageLeaving\s*\|\|\s*currentUser\?\.id !== requestUserId\s*\|\|\s*response\.status === 401/s,
  "Existing confirmed account/session-change protection must remain."
);

console.log("PASS: transient session failure does not destructively reload.");
console.log("PASS: successful final video response bypasses redundant session recheck.");
console.log("PASS: confirmed account/session-change protection remains.");
