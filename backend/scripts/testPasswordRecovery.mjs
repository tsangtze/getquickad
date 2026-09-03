import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createPasswordHandlers } from "../passwordHandlers.mjs";

const token = "test-bearer-token";
const password = "unique-test-password-123";
function fixture() {
  const calls = [];
  const state = { userError: null, recoverError: null, putStatus: 200, putData: { id: "owner-a" } };
  const handlers = createPasswordHandlers({
    authConfiguration: () => ({ applicationOrigin: "http://localhost:4100", supabaseUrl: "https://example.supabase.co", publishableKey: "test-publishable-key" }),
    createAuthClient: () => ({ auth: {
      getUser: async value => { calls.push(["verify", value]); return { data: { user: { id: "owner-a", email: "owner@example.com" } }, error: state.userError }; },
      resetPasswordForEmail: async (email, options) => { calls.push(["recover", email, options]); return { error: state.recoverError }; }
    } }),
    fetchImpl: async (url, options) => { calls.push(["put", String(url), options]); return { ok: state.putStatus === 200, status: state.putStatus, json: async () => state.putData }; }
  });
  function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, clearCookie(...args) { calls.push(["clear", ...args]); } }; }
  return { state, handlers, calls, response };
}

test("recovery validates input without contacting Supabase", async () => {
  const f = fixture(), r = f.response();
  await f.handlers.recover({ body: { email: "bad" } }, r);
  assert.equal(r.statusCode, 400); assert.equal(f.calls.length, 0);
});
test("recovery does not disclose account-specific or email cooldown outcomes", async () => {
  const f = fixture(); let expected;
  for (const error of [null, { status: 404, code: "user_not_found" }, { status: 429, code: "over_email_send_rate_limit" }]) {
    f.state.recoverError = error;
    const r = f.response(); await f.handlers.recover({ body: { email: " owner@example.com " } }, r);
    assert.equal(r.statusCode, 202);
    if (expected) assert.deepEqual(r.body, expected); else expected = r.body;
  }
  assert.equal(f.calls[0][2].redirectTo, "http://localhost:4100/password.html");
});
test("upstream outage is not reported as an email sent", async () => {
  const f = fixture(), r = f.response(); f.state.recoverError = { status: 503 };
  await f.handlers.recover({ body: { email: "owner@example.com" } }, r);
  assert.equal(r.statusCode, 503);
});
test("missing and expired bearer tokens cannot change passwords", async () => {
  const f = fixture();
  for (const accessToken of [undefined, "", "a b", "a".repeat(8193)]) {
    const r = f.response(); await f.handlers.update({ body: { accessToken, password } }, r);
    assert.equal(r.statusCode, 401);
  }
  assert.equal(f.calls.length, 0);
  f.state.userError = { status: 401 };
  const r = f.response(); await f.handlers.update({ body: { accessToken: token, password } }, r);
  assert.equal(r.statusCode, 401); assert(!f.calls.some(c => c[0] === "put"));
});
test("short passwords are rejected before verification or mutation", async () => {
  const f = fixture(), r = f.response();
  await f.handlers.update({ body: { accessToken: token, password: "short" } }, r);
  assert.equal(r.statusCode, 400); assert.equal(f.calls.length, 0);
});
test("link identity comes from Supabase, not the submitted email", async () => {
  const f = fixture(), r = f.response();
  await f.handlers.link({ body: { accessToken: token, email: "attacker@example.com" } }, r);
  assert.deepEqual(r.body, { ok: true, email: "owner@example.com" });
});
test("password update uses verified user bearer credentials and clears browser cookie", async () => {
  const f = fixture(), r = f.response();
  await f.handlers.update({ body: { accessToken: token, password, email: "other@example.com" } }, r);
  assert.equal(r.body.ok, true);
  assert.deepEqual(f.calls.map(c => c[0]), ["verify", "put", "clear"]);
  const put = f.calls[1];
  assert.equal(put[1], "https://example.supabase.co/auth/v1/user");
  assert.equal(put[2].headers.Authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(put[2].body), { password });
  assert(!JSON.stringify(r.body).includes(token));
  assert(!JSON.stringify(r.body).includes(password));
  assert.equal(f.calls[2][1], "quickad_access");
});
test("weak or same passwords are actionable, while failed updates clear no cookie", async () => {
  const f = fixture(); f.state.putStatus = 422;
  for (const code of ["weak_password", "same_password"]) {
    f.state.putData = { code }; const r = f.response();
    await f.handlers.update({ body: { accessToken: token, password } }, r);
    assert.equal(r.statusCode, 400);
  }
  assert(!f.calls.some(c => c[0] === "clear"));
});
test("a mismatched upstream identity cannot report success", async () => {
  const f = fixture(), r = f.response(); f.state.putData = { id: "other-user" };
  await f.handlers.update({ body: { accessToken: token, password } }, r);
  assert.equal(r.statusCode, 503);
});

// Evaluate the real route registration with dependency stubs, no network/packages.
test("recovery routes inherit origin, JSON and rate-limit protections", () => {
  let source = fs.readFileSync(new URL("../authRoutes.mjs", import.meta.url), "utf8");
  source = source.replace(/^import[\s\S]*?;\s*/gm, "").replaceAll("export ", "");
  const stack = [];
  const router = {
    use: (...handlers) => stack.push({ kind: "use", handlers }),
    post: (path, ...handlers) => stack.push({ kind: "post", path, handlers }),
    get: (path, ...handlers) => stack.push({ kind: "get", path, handlers })
  };
  const context = { express: { Router: () => router }, cookieParser: () => () => {},
    rateLimit: config => Object.assign(() => {}, { config }),
    createPasswordHandlers: () => ({ recover() {}, link() {}, update() {} }),
    authConfiguration: () => ({ applicationOrigin: "http://localhost:4100" }), URL,
    createAuthClient: () => { throw new Error("Unexpected network access"); } };
  vm.runInNewContext(source + "\ncreateAuthRouter();", context);
  const routes = stack.filter(r => ["/recover", "/password-link", "/password-update"].includes(r.path));
  assert.equal(routes.length, 3);
  for (const route of routes) assert(route.handlers[0].config.limit > 0);
  const guards = stack.slice(0, stack.indexOf(routes[0])).filter(r => r.kind === "use");
  const guard = guards.at(-1).handlers[0];
  for (const [origin, json, expected] of [["https://evil.example", true, 403], ["http://localhost:4100", false, 415]]) {
    const r = fixture().response();
    guard({ method: "POST", get: () => origin, is: () => json }, r, () => assert.fail("Guard bypassed"));
    assert.equal(r.statusCode, expected);
  }
  let passed = false;
  guard({ method: "POST", get: () => "http://localhost:4100", is: () => true }, {}, () => { passed = true; });
  assert(passed);
});

function browserFixture(hash = "", replies = []) {
  const elements = new Map(), events = {}, calls = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: "", hidden: ["update-panel"].includes(id), textContent: "", handlers: {},
      addEventListener(name, fn) { this.handlers[name] = fn; },
      reportValidity: () => true, focus() {}
    });
    return elements.get(id);
  };
  const window = {
    location: { hash, search: "", pathname: "/password.html", reload() {} },
    history: { replaceState(...args) { calls.push(["clean", ...args]); } },
    addEventListener(name, fn) { events[name] = fn; }
  };
  let ready;
  const document = {
    getElementById: element,
    querySelectorAll: () => [...elements.values()],
    addEventListener(name, fn) { if (name === "DOMContentLoaded") ready = fn; }
  };
  vm.runInNewContext(fs.readFileSync(new URL("../../Frontend/password.js", import.meta.url), "utf8"), {
    window, document, URLSearchParams, AbortSignal,
    fetch: async (path, options) => {
      calls.push(["fetch", path, JSON.parse(options.body)]);
      const reply = replies.shift(); if (!reply) throw new Error("Unexpected fetch");
      return { status: reply.status, ok: reply.status >= 200 && reply.status < 300, json: async () => reply.body };
    }
  });
  return { element, calls, ready, events, async submit(id) {
    const form = element(id); await form.handlers.submit({ preventDefault() {}, currentTarget: form });
  } };
}
test("password page removes tokens before network access and verifies identity", async () => {
  const b = browserFixture("#type=recovery&access_token=fake&refresh_token=never-send", [
    { status: 200, body: { ok: true, email: "owner@example.com" } }
  ]);
  assert.deepEqual(b.calls[0], ["clean", null, "", "/password.html"]);
  await b.ready();
  assert.equal(b.element("identity").textContent, "owner@example.com");
  assert.equal(b.element("update-panel").hidden, false);
  assert.deepEqual(b.calls[1][2], { accessToken: "fake" });
});
test("signup and expired links cannot open the password form", async () => {
  for (const hash of ["#type=signup&access_token=fake", "#error=expired&error_description=untrusted", "#type=recovery"]) {
    const b = browserFixture(hash); await b.ready();
    assert(!b.calls.some(c => c[0] === "fetch"));
    assert(!b.element("status").textContent.includes("untrusted"));
    assert.equal(b.element("request-panel").hidden, false);
  }
});
test("password mismatch performs no update; success clears fields and hides form", async () => {
  const b = browserFixture("#type=invite&access_token=fake", [
    { status: 200, body: { ok: true, email: "owner@example.com" } },
    { status: 200, body: { ok: true, message: "Password saved." } }
  ]);
  await b.ready();
  b.element("password").value = password; b.element("confirmation").value = "different";
  await b.submit("update-form");
  assert.equal(b.calls.filter(c => c[0] === "fetch").length, 1);
  b.element("confirmation").value = password;
  await b.submit("update-form");
  assert.equal(b.element("title").textContent, "Password saved");
  assert.equal(b.element("password").value, "");
  assert.equal(b.element("confirmation").value, "");
  assert.equal(b.element("update-panel").hidden, true);
});
test("expired token at submit returns to requesting a fresh link", async () => {
  const b = browserFixture("#type=recovery&access_token=fake", [
    { status: 200, body: { ok: true, email: "owner@example.com" } },
    { status: 401, body: { ok: false, error: "Expired" } }
  ]);
  await b.ready();
  b.element("password").value = password; b.element("confirmation").value = password;
  await b.submit("update-form");
  assert.equal(b.element("update-panel").hidden, true);
  assert.equal(b.element("request-panel").hidden, false);
});
test("request form submits only the account email", async () => {
  const b = browserFixture("", [{ status: 202, body: { ok: true, code: "PASSWORD_EMAIL_ACCEPTED", message: "Check your inbox." } }]);
  await b.ready(); b.element("email").value = " owner@example.com ";
  await b.submit("request-form");
  assert.deepEqual(b.calls.find(c => c[0] === "fetch")[2], { email: "owner@example.com" });
  assert.equal(b.element("status").textContent, "The request could not be confirmed. Check your inbox before requesting another email.");
});
test("root page redirects invite/recovery fragments before existing login code", () => {
  const source = fs.readFileSync(new URL("../../Frontend/account.js", import.meta.url), "utf8");
  for (const type of ["invite", "recovery"]) {
    const hash = `#type=${type}&access_token=fake`; let target;
    vm.runInNewContext(source, { URLSearchParams,
      window: { location: { hash, replace(value) { target = value; } } },
      document: { querySelector() { assert.fail("Ordinary login code ran first"); } }
    });
    assert.equal(target, "/password.html" + hash);
  }
});
