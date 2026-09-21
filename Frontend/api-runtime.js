(() => {
  "use strict";

  const productionOrigin = "https://pix2vid.net";

  const isNativeAndroid =
    window.location.protocol === "https:" &&
    window.location.hostname === "localhost";

  function apiUrl(path) {
    if (
      typeof path !== "string" ||
      !path.startsWith("/")
    ) {
      throw new TypeError(
        "Pix2Vid API path must start with /."
      );
    }

    return isNativeAndroid
      ? `${productionOrigin}${path}`
      : path;
  }

  function apiHeaders(headers = {}) {
    const result = new Headers(headers);

    if (isNativeAndroid) {
      result.set("X-Pix2Vid-Native", "android");
    }

    return result;
  }

  window.Pix2VidRuntime = Object.freeze({
    productionOrigin,
    isNativeAndroid,
    apiUrl,
    apiHeaders
  });
})();
