const VIDEO_FORMATS = Object.freeze({
  "9:16": Object.freeze({
    aspectRatio: "9:16",
    width: 720,
    height: 1280
  }),
  "4:5": Object.freeze({
    aspectRatio: "4:5",
    width: 864,
    height: 1080
  }),
  "16:9": Object.freeze({
    aspectRatio: "16:9",
    width: 1280,
    height: 720
  }),
  "1:1": Object.freeze({
    aspectRatio: "1:1",
    width: 1080,
    height: 1080
  })
});

const VIDEO_LAYOUTS = Object.freeze({
  "9:16": Object.freeze({
    productCard: Object.freeze({
      width: 640,
      height: 700,
      panelX: 28,
      panelY: 225,
      panelWidth: 664,
      panelHeight: 750,
      imageY: 250
    }),
    caption: Object.freeze({
      backgroundX: 34,
      backgroundY: 976,
      backgroundWidth: 652,
      backgroundHeight: 200,
      centerY: 1088
    }),
    header: Object.freeze({
      x: 40,
      y: 44,
      width: 640,
      height: 62,
      titleY: 126
    }),
    brandY: 1217,
    ctaWebsiteY: 1124
  }),

  "4:5": Object.freeze({
    productCard: Object.freeze({
      width: 740,
      height: 570,
      panelX: 52,
      panelY: 185,
      panelWidth: 760,
      panelHeight: 610,
      imageY: 205
    }),
    caption: Object.freeze({
      backgroundX: 52,
      backgroundY: 815,
      backgroundWidth: 760,
      backgroundHeight: 170,
      centerY: 900
    }),
    header: Object.freeze({
      x: 65,
      y: 35,
      width: 734,
      height: 55,
      titleY: 108
    }),
    brandY: 1045,
    ctaWebsiteY: 1005
  }),

  "16:9": Object.freeze({
    productCard: Object.freeze({
      width: 720,
      height: 390,
      panelX: 280,
      panelY: 150,
      panelWidth: 720,
      panelHeight: 390,
      imageY: 150
    }),
    caption: Object.freeze({
      backgroundX: 160,
      backgroundY: 550,
      backgroundWidth: 960,
      backgroundHeight: 115,
      centerY: 605
    }),
    header: Object.freeze({
      x: 160,
      y: 20,
      width: 960,
      height: 40,
      titleY: 95
    }),
    brandY: 685,
    ctaWebsiteY: 670
  }),

  "1:1": Object.freeze({
    productCard: Object.freeze({
      width: 820,
      height: 590,
      panelX: 110,
      panelY: 180,
      panelWidth: 860,
      panelHeight: 620,
      imageY: 195
    }),
    caption: Object.freeze({
      backgroundX: 90,
      backgroundY: 830,
      backgroundWidth: 900,
      backgroundHeight: 170,
      centerY: 915
    }),
    header: Object.freeze({
      x: 100,
      y: 35,
      width: 880,
      height: 55,
      titleY: 105
    }),
    brandY: 1045,
    ctaWebsiteY: 1005
  })
});

export function resolveVideoLayout(aspectRatio = "9:16") {
  resolveVideoAspectRatio(aspectRatio);
  return VIDEO_LAYOUTS[aspectRatio];
}
export function resolveVideoAspectRatio(
  aspectRatio = "9:16"
) {
  if (
    typeof aspectRatio !== "string" ||
    !Object.hasOwn(VIDEO_FORMATS, aspectRatio)
  ) {
    throw new Error(
      `Unsupported video aspect ratio: ${String(aspectRatio)}`
    );
  }

  return VIDEO_FORMATS[aspectRatio];
}

export function resolveProjectVideoFormat(project) {
  return resolveVideoAspectRatio(
    project?.output?.aspectRatio ?? "9:16"
  );
}