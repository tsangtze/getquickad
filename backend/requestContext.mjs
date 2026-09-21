export const nativeRequestHeaderName =
  "x-pix2vid-native";

export const nativeRequestHeaderValue =
  "android";

export function isTrustedApplicationRequest(
  request,
  applicationOrigin
) {
  let expectedOrigin;

  try {
    expectedOrigin =
      new URL(applicationOrigin).origin;
  } catch {
    return false;
  }

  if (request.get("origin") === expectedOrigin) {
    return true;
  }

  return (
    request.get(nativeRequestHeaderName) ===
    nativeRequestHeaderValue
  );
}
