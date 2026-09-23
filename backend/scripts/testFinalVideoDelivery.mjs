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

assert.match(
  source,
  /const reconciliationAttempts\s*=\s*12;\s*const reconciliationDelayMs\s*=\s*5000;/s,
  "Finalization recovery must use bounded polling."
);

assert.match(
  source,
  /statusResult\?\.project\?\.status !==\s*"rendering_video"/s,
  "Finalization recovery must continue polling only while rendering is still in progress."
);

assert.match(
  source,
  /statusResult\?\.project\?\.status ===\s*"video_ready"[\s\S]*?showFinalVideoReady\(\s*statusResult\s*\);[\s\S]*?recoveredFinalVideo = true;[\s\S]*?break;/s,
  "Persisted video_ready recovery must enter the normal final-video-ready UI."
);

assert.match(
  source,
  /if \(attempt < reconciliationAttempts\)\s*\{\s*await new Promise\([\s\S]*?setTimeout\([\s\S]*?reconciliationDelayMs[\s\S]*?\);?\s*\}/s,
  "Rendering recovery must wait between bounded status checks."
);

const finalizeEndpointRefs =
  source.match(
    /`\/api\/projects\/\$\{currentProjectId\}\/finalize`/g
  ) || [];

assert.equal(
  finalizeEndpointRefs.length,
  1,
  "Recovery must not introduce another finalization request."
);
console.log("PASS: transient session failure does not destructively reload.");
console.log("PASS: successful final video response bypasses redundant session recheck.");
console.log("PASS: confirmed account/session-change protection remains.");
