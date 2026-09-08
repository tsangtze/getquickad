import assert from "node:assert/strict";

import {
  __signupPasswordPolicyTestHelpers
} from "../authRoutes.mjs";

const {
  signupPasswordMinimumLength,
  signupPasswordMaximumLength,
  validSignupPassword
} = __signupPasswordPolicyTestHelpers;

assert.equal(signupPasswordMinimumLength, 8);
assert.equal(signupPasswordMaximumLength, 1024);

assert.equal(
  validSignupPassword("1234567"),
  false,
  "7 characters must be rejected."
);

assert.equal(
  validSignupPassword("12345678"),
  true,
  "8 characters must be accepted."
);

assert.equal(
  validSignupPassword("a".repeat(1024)),
  true,
  "1024 characters must be accepted."
);

assert.equal(
  validSignupPassword("a".repeat(1025)),
  false,
  "1025 characters must be rejected."
);

assert.equal(
  validSignupPassword(""),
  false,
  "Empty password must be rejected."
);

assert.equal(
  validSignupPassword(null),
  false,
  "Non-string password must be rejected."
);

console.log("PASS: Signup password minimum is 8 characters.");
console.log("PASS: 7-character password rejected.");
console.log("PASS: 8-character password accepted.");
console.log("PASS: Signup password boundary regression complete.");
