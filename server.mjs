import { createAuthRouter } from "./backend/authRoutes.mjs";
import {
  SEO_LANDING_INTENTS,
  SEO_LANDING_ROUTES,
  findSeoLandingRoute,
  getSeoLandingAlternates,
  getSeoLandingContent,
  getSeoLandingPath
} from "./backend/seoLandingPages.mjs";
import {
  getSeoLandingUi
} from "./backend/seoLandingUi.mjs";
import { createBillingRouter } from "./backend/billingRoutes.mjs";
import { createStripeWebhookHandler } from "./backend/stripeWebhook.mjs";
import path from "node:path";
import express from "express";
import { cleanupExpiredProjects } from "./backend/cleanup.mjs";
import multer from "multer";
 
import fs from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import {
  cleanFailedUpload,
  createProjectRouter
} from "./backend/projectRoutes.mjs";
import {
  isAuthConfigured
} from "./backend/authService.mjs";

const app = express();
const port = Number(process.env.PORT) || 4100;

const currentFile = fileURLToPath(import.meta.url);
const appRoot = path.dirname(currentFile);
const projectRoot = process.env.PROJECT_ROOT || appRoot;
const frontendPath = path.join(appRoot, "Frontend");
const environmentPath = path.join(projectRoot, ".env");

// FIX: Ensure required dirs exist (fixes prod empty video bug)
for (const dir of ["output", "temp", "uploads", "users", "projects"]) {
  const fullPath = path.join(projectRoot, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, {recursive:true});
    console.log(`Created ${dir}/ at ${fullPath}`);
  }
}


if (fs.existsSync(environmentPath)) {
  loadEnvFile(environmentPath);
}

app.disable("x-powered-by");
app.post(
  "/api/billing/webhook",
  ...createStripeWebhookHandler({
    projectRoot
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(frontendPath, { index: false }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    product: "QuickAd AI",
    version: "0.8.0",
    authConfigured:
      isAuthConfigured()
  });
});

app.get(
  "/api/auth/config",
  (_request, response) => {
    response.json({
      ok: true,
      authConfigured:
        isAuthConfigured()
    });
  }
);

app.use("/api/auth", createAuthRouter());
app.use(
  "/api/billing",
  createBillingRouter({
    projectRoot
  })
);

const projectRouter = await createProjectRouter({
  projectRoot
});

app.use("/api/projects", projectRouter);

const supportedSeoLanguages = [
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

const localizedHomePaths =
  supportedSeoLanguages.map(
    language => `/${language}/`
  );

const localizedHomePathsWithoutTrailingSlash =
  supportedSeoLanguages.map(
    language => `/${language}`
  );

const seoOrigin = "https://getquickad.com";

const seoByLanguage = {
  en: {
    title: "AI Product Video Generator | QuickAd AI",
    description:
      "Turn product photos into ready-to-post social media and short-form promotional videos with AI narration, captions, music, and multiple styles."
  },
  es: {
    title:
      "Generador de Videos de Producto con IA | QuickAd AI",
    description:
      "Convierte fotos de productos en videos promocionales para redes sociales y formatos cortos, listos para publicar con narración por IA, subtítulos, música y múltiples estilos."
  },
  pt: {
    title:
      "Gerador de Vídeos de Produto com IA | QuickAd AI",
    description:
      "Transforme fotos de produtos em vídeos promocionais para redes sociais e formatos curtos, prontos para publicar com narração por IA, legendas, música e vários estilos."
  },
  fr: {
    title:
      "Générateur de Vidéos Produit par IA | QuickAd AI",
    description:
      "Transformez vos photos de produits en vidéos promotionnelles pour les réseaux sociaux et les formats courts, avec narration IA, sous-titres, musique et plusieurs styles."
  },
  de: {
    title:
      "KI-Produktvideo-Generator | QuickAd AI",
    description:
      "Verwandeln Sie Produktfotos in Social-Media- und Kurzformat-Werbevideos mit KI-Sprachausgabe, Untertiteln, Musik und verschiedenen Stilen."
  },
  it: {
    title:
      "Generatore AI di Video Prodotto | QuickAd AI",
    description:
      "Trasforma le foto dei prodotti in video promozionali per social media e formati brevi con narrazione AI, sottotitoli, musica e diversi stili."
  },
  ja: {
    title:
      "AI商品動画ジェネレーター | QuickAd AI",
    description:
      "商品写真から、SNSやショート動画向けのプロモーション動画をAIナレーション、字幕、音楽、複数のスタイル付きで作成できます。"
  },
  ko: {
    title:
      "AI 제품 비디오 생성기 | QuickAd AI",
    description:
      "제품 사진을 소셜 미디어와 숏폼용 프로모션 영상으로 만들어 보세요. AI 내레이션, 자막, 음악, 다양한 스타일을 지원합니다."
  },
  zh: {
    title:
      "AI 产品视频生成器 | QuickAd AI",
    description:
      "将产品照片制作成适合社交媒体和短视频推广的竖屏视频，并添加 AI 旁白、字幕、音乐和多种风格。"
  },
  "zh-TW": {
    title:
      "AI 產品影片產生器 | QuickAd AI",
    description:
      "將產品照片製作成適合社群媒體和短影音推廣的直式影片，並加入 AI 旁白、字幕、音樂和多種風格。"
  },
  tr: {
    title:
      "Yapay Zekâ Ürün Videosu Oluşturucu | QuickAd AI",
    description:
      "Ürün fotoğraflarını sosyal medya ve kısa format için yapay zekâ anlatımı, altyazılar, müzik ve çeşitli stiller içeren tanıtım videolarına dönüştürün."
  },
  hi: {
    title:
      "AI प्रोडक्ट वीडियो जनरेटर | QuickAd AI",
    description:
      "प्रोडक्ट फ़ोटो को सोशल मीडिया और शॉर्ट-फॉर्म प्रमोशनल वीडियो में बदलें, जिनमें AI नैरेशन, कैप्शन, संगीत और कई स्टाइल शामिल हों।"
  }
};

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getHomeLanguage(pathname) {
  const match =
    /^\/([^/]+)\/$/.exec(pathname);

  if (
    match &&
    supportedSeoLanguages.includes(match[1])
  ) {
    return match[1];
  }

  return "en";
}

function buildAlternateLinks() {
  const languageLinks =
    supportedSeoLanguages.map(language => {
      const href =
        `${seoOrigin}/${language}/`;

      return (
        `  <link rel="alternate" ` +
        `hreflang="${language}" ` +
        `href="${href}">`
      );
    });

  languageLinks.push(
    `  <link rel="alternate" hreflang="x-default" href="${seoOrigin}/">`
  );

  return languageLinks.join("\n");
}

function buildHomeHtml({
  html,
  language,
  canonicalUrl
}) {
  const seo =
    seoByLanguage[language] ||
    seoByLanguage.en;

  const title =
    escapeHtmlAttribute(seo.title);

  const description =
    escapeHtmlAttribute(
      seo.description
    );

  const canonical =
    escapeHtmlAttribute(canonicalUrl);

  const alternateLinks =
    buildAlternateLinks();

  const homeSeoLinks =
    buildHomeSeoLandingLinks(language);

  return html
    .replace(
      "{{HOME_SEO_LINKS}}",
      homeSeoLinks
    )
    .replace(
      '<html lang="en">',
      `<html lang="${escapeHtmlAttribute(language)}">`
    )
    .replace(
      /<meta\s+name="description"[\s\S]*?>/i,
      `<meta name="description" content="${description}">`
    )
    .replace(
      /<title>[\s\S]*?<\/title>/i,
      `<title>${title}</title>`
    )
    .replace(
      "</title>",
      `</title>\n` +
        `  <link rel="canonical" href="${canonical}">\n` +
        `${alternateLinks}`
    );
}

function buildSeoLandingAlternateLinks(intent) {
  const links =
    getSeoLandingAlternates(intent).map(
      ({ language, path: alternatePath }) => {
        const href =
          escapeHtmlAttribute(
            `${seoOrigin}${alternatePath}`
          );

        return (
          `  <link rel="alternate" ` +
          `hreflang="${escapeHtmlAttribute(language)}" ` +
          `href="${href}">`
        );
      }
    );

  const englishPath =
    getSeoLandingPath("en", intent);

  if (englishPath) {
    links.push(
      `  <link rel="alternate" hreflang="x-default" ` +
      `href="${escapeHtmlAttribute(`${seoOrigin}${englishPath}`)}">`
    );
  }

  return links.join("\n");
}

function replaceLandingPlaceholder(
  html,
  placeholder,
  value
) {
  return html.replaceAll(
    `{{${placeholder}}}`,
    escapeHtmlAttribute(value ?? "")
  );
}

function buildSeoLandingLanguageOptions({
  language,
  intent
}) {
  const labels = {
    en: "English",
    es: "Español",
    pt: "Português",
    fr: "Français",
    de: "Deutsch",
    it: "Italiano",
    ja: "日本語",
    ko: "한국어",
    zh: "简体中文",
    "zh-TW": "繁體中文",
    tr: "Türkçe",
    hi: "हिन्दी"
  };

  return getSeoLandingAlternates(intent)
    .map(
      ({
        language: optionLanguage,
        path: optionPath
      }) => {
        const selected =
          optionLanguage === language
            ? " selected"
            : "";

        return (
          `<option value="${escapeHtmlAttribute(optionPath)}"` +
          `${selected}>` +
          `${escapeHtmlAttribute(
            labels[optionLanguage] ||
            optionLanguage
          )}` +
          `</option>`
        );
      }
    )
    .join("\n");
}
function getSeoLandingLinkLabels(language) {
  const labels = {
    en: {
      photoToVideo: "Product photo to video",
      adVideo: "AI ad video generator",
      ecommerceVideo: "Ecommerce video generator"
    },
    es: {
      photoToVideo: "Foto de producto a vídeo",
      adVideo: "Vídeos publicitarios con IA",
      ecommerceVideo: "Vídeos para ecommerce"
    },
    pt: {
      photoToVideo: "Foto de produto para vídeo",
      adVideo: "Anúncios em vídeo com IA",
      ecommerceVideo: "Vídeos para e-commerce"
    },
    fr: {
      photoToVideo: "Photo produit en vidéo",
      adVideo: "Vidéos publicitaires IA",
      ecommerceVideo: "Vidéos e-commerce"
    },
    de: {
      photoToVideo: "Produktfoto in Video",
      adVideo: "KI-Werbevideos",
      ecommerceVideo: "E-Commerce-Videos"
    },
    it: {
      photoToVideo: "Foto prodotto in video",
      adVideo: "Video pubblicitari AI",
      ecommerceVideo: "Video per e-commerce"
    },
    ja: {
      photoToVideo: "商品写真から動画",
      adVideo: "AI広告動画",
      ecommerceVideo: "EC商品動画"
    },
    ko: {
      photoToVideo: "제품 사진으로 영상 만들기",
      adVideo: "AI 광고 영상",
      ecommerceVideo: "이커머스 상품 영상"
    },
    zh: {
      photoToVideo: "产品照片转视频",
      adVideo: "AI 广告视频",
      ecommerceVideo: "电商产品视频"
    },
    "zh-TW": {
      photoToVideo: "商品照轉影片",
      adVideo: "AI 廣告影片",
      ecommerceVideo: "電商產品影片"
    },
    tr: {
      photoToVideo: "Ürün fotoğrafını videoya dönüştürme",
      adVideo: "Yapay zekâ reklam videosu",
      ecommerceVideo: "E-ticaret videosu"
    },
    hi: {
      photoToVideo: "प्रोडक्ट फोटो से वीडियो",
      adVideo: "AI विज्ञापन वीडियो",
      ecommerceVideo: "ई-कॉमर्स वीडियो"
    }
  };

  return labels[language] || labels.en;
}

function buildHomeSeoLandingLinks(language) {
  const languageLabels =
    getSeoLandingLinkLabels(language);

  const links = SEO_LANDING_INTENTS
    .map(intent => {
      const href =
        getSeoLandingPath(
          language,
          intent
        );

      if (!href) {
        return "";
      }

      return (
        `<a href="${escapeHtmlAttribute(href)}">` +
        `${escapeHtmlAttribute(languageLabels[intent])}` +
        `</a>`
      );
    })
    .filter(Boolean)
    .join("\n");

  const ariaLabel =
    getSeoLandingUi(language)?.relatedAria ||
    "QuickAd AI tools";

  return (
    `<nav class="home-seo-links" ` +
    `aria-label="${escapeHtmlAttribute(ariaLabel)}">` +
    links +
    `</nav>`
  );
}

function buildSeoLandingRelatedLinks({
  language,
  intent
}) {
  const languageLabels =
    getSeoLandingLinkLabels(language);

  return Object.keys(languageLabels)
    .filter(relatedIntent => relatedIntent !== intent)
    .map(relatedIntent => {
      const href =
        getSeoLandingPath(
          language,
          relatedIntent
        );

      return (
        `<a href="${escapeHtmlAttribute(href)}">` +
        `${escapeHtmlAttribute(languageLabels[relatedIntent])}` +
        `</a>`
      );
    })
    .join("\n");
}

function buildSeoLandingHtml({
  html,
  language,
  intent,
  content
}) {
  const ui =
    getSeoLandingUi(language);

  if (!ui) {
    return null;
  }

  const canonicalPath =
    getSeoLandingPath(language, intent);

  if (!canonicalPath) {
    return null;
  }

  const canonicalUrl =
    `${seoOrigin}${canonicalPath}`;

  const homeUrl =
    `/${language}/`;

  const replacements = {
    HOME_URL: homeUrl,
    HOME_ARIA_LABEL: "QuickAd AI",
    BRAND_LOCALIZED: ui.brandLocalized,
    NAV_ARIA_LABEL: "QuickAd AI",
    LANGUAGE_ARIA_LABEL: "Language",
    CREATE_VIDEO_LABEL: ui.createVideo,
    EYEBROW: content.eyebrow,
    H1: content.h1,
    INTRO_COPY: content.intro,
    CREATE_URL: homeUrl,
    PRIMARY_CTA: ui.createVideo,
    OUTPUT_ARIA_LABEL: ui.outputAria,
    DURATION_LABEL: ui.duration,
    BENEFITS_HEADING: content.benefitsHeading,
    BENEFITS_COPY: content.benefitsCopy,
    FEATURE_1: content.features[0],
    FEATURE_2: content.features[1],
    FEATURE_3: content.features[2],
    FEATURE_4: content.features[3],
    HOW_HEADING: content.howHeading,
    STEP_1: content.steps[0],
    STEP_2: content.steps[1],
    STEP_3: content.steps[2],
    USE_CASES_HEADING: content.useCasesHeading,
    USE_CASES_COPY: content.useCasesCopy,
    RELATED_HEADING: ui.relatedHeading,
    RELATED_ARIA_LABEL: ui.relatedAria,
    FINAL_CTA_HEADING: content.h1,
    FINAL_CTA_COPY: content.intro,
    FOOTER_PROMISE: ui.footerPromise
  };

  let rendered = html
    .replace(
      '<html lang="en">',
      `<html lang="${escapeHtmlAttribute(language)}">`
    )
    .replace(
      /<meta\s+name="description"[\s\S]*?>/i,
      `<meta name="description" content="${escapeHtmlAttribute(content.description)}">`
    )
    .replace(
      /<title>[\s\S]*?<\/title>/i,
      `<title>${escapeHtmlAttribute(content.title)}</title>`
    )
    .replace(
      "</head>",
      (
        `  <link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}">\n` +
        `${buildSeoLandingAlternateLinks(intent)}\n` +
        `</head>`
      )
    );

  for (const [placeholder, value] of Object.entries(
    replacements
  )) {
    rendered =
      replaceLandingPlaceholder(
        rendered,
        placeholder,
        value
      );
  }

  rendered = rendered.replace(
    "{{LANGUAGE_OPTIONS}}",
    buildSeoLandingLanguageOptions({
      language,
      intent
    })
  );

  rendered = rendered.replace(
    "{{RELATED_LINKS}}",
    buildSeoLandingRelatedLinks({
      language,
      intent
    })
  );

  return rendered;
}

function sendSeoLandingPage(
  request,
  response,
  next
) {
  const route =
    findSeoLandingRoute(request.path);

  if (!route) {
    next();
    return;
  }

  const content =
    getSeoLandingContent(
      route.language,
      route.intent
    );

  if (!content) {
    next();
    return;
  }

  const templatePath =
    path.join(frontendPath, "landing.html");

  const html =
    fs.readFileSync(templatePath, "utf8");

  const rendered =
    buildSeoLandingHtml({
      html,
      language: route.language,
      intent: route.intent,
      content
    });

  if (!rendered) {
    next();
    return;
  }

  response
    .type("html")
    .send(rendered);
}
function sendHomePage(request, response) {
  const indexPath =
    path.join(frontendPath, "index.html");

  const html =
    fs.readFileSync(indexPath, "utf8");

  const language =
    getHomeLanguage(request.path);

  const canonicalUrl =
    request.path === "/"
      ? `${seoOrigin}/`
      : `${seoOrigin}/${language}/`;

  response
    .type("html")
    .send(
      buildHomeHtml({
        html,
        language,
        canonicalUrl
      })
    );
}

app.get(
  localizedHomePathsWithoutTrailingSlash,
  (request, response, next) => {
    if (request.path.endsWith("/")) {
      next();
      return;
    }

    const queryIndex =
      request.originalUrl.indexOf("?");

    const redirectTarget =
      queryIndex === -1
        ? `${request.originalUrl}/`
        : `${request.originalUrl.slice(0, queryIndex)}/${request.originalUrl.slice(queryIndex)}`;

    response.redirect(
      301,
      redirectTarget
    );
  }
);

app.get("/", sendHomePage);
app.get(localizedHomePaths, sendHomePage);
const seoLandingPaths = Object.keys(SEO_LANDING_ROUTES)
  .flatMap(language =>
    SEO_LANDING_INTENTS.map(intent =>
      getSeoLandingPath(language, intent)
    )
  )
  .filter(Boolean);

if (
  seoLandingPaths.length !== 36 ||
  new Set(seoLandingPaths).size !== 36
) {
  throw new Error(
    "SEO landing route registration must contain 36 unique paths."
  );
}

const seoLandingPathsWithoutTrailingSlash =
  seoLandingPaths.map(path =>
    path.endsWith("/")
      ? path.slice(0, -1)
      : path
  );

if (
  seoLandingPathsWithoutTrailingSlash.length !== 36 ||
  new Set(seoLandingPathsWithoutTrailingSlash).size !== 36
) {
  throw new Error(
    "SEO landing no-slash registration must contain 36 unique paths."
  );
}

app.get(
  seoLandingPathsWithoutTrailingSlash,
  (request, response, next) => {
    if (request.path.endsWith("/")) {
      next();
      return;
    }

    const queryIndex =
      request.originalUrl.indexOf("?");

    const redirectTarget =
      queryIndex === -1
        ? `${request.originalUrl}/`
        : `${request.originalUrl.slice(0, queryIndex)}/${request.originalUrl.slice(queryIndex)}`;

    response.redirect(
      301,
      redirectTarget
    );
  }
);

app.get(seoLandingPaths, sendSeoLandingPage);

app.use("/api", (_request, response) => {
  response.status(404).json({
    ok: false,
    error: "API endpoint not found."
  });
});

app.use(async (error, request, response, next) => {
  await cleanFailedUpload(request);

  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE:
        "Each image must be 10 MB or smaller.",
      LIMIT_FILE_COUNT:
        "Too many files were uploaded.",
      LIMIT_UNEXPECTED_FILE:
        "Use no more than 10 JPG, PNG, or WebP product images and one logo."
    };

    response.status(400).json({
      ok: false,
      error:
        messages[error.code] ||
        "The uploaded files could not be accepted."
    });
    return;
  }

  console.error("QuickAd AI server error:", error);

  response.status(500).json({
    ok: false,
    error:
      "QuickAd AI could not create the project. Please try again."
  });
});

// Temporary project cleanup runs on startup and every 24 hours.
cleanupExpiredProjects(projectRoot).catch(console.error);
setInterval(
  () => cleanupExpiredProjects(projectRoot).catch(console.error),
  24 * 60 * 60 * 1000
);

app.listen(port, "0.0.0.0", () => {
  console.log(
    `QuickAd AI is running at http://localhost:${port}`
  );
});
