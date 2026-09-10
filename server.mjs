import { createAuthRouter } from "./backend/authRoutes.mjs";
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

  return html
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
