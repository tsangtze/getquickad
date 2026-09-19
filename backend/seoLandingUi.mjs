export const SEO_LANDING_UI = {
  en: {
    brandLocalized: "",
    createVideo: "Create Video",
    outputAria: "Video output",
    duration: "Up to 60 sec",
    relatedHeading: "Related Pix2Vid tools",
    relatedAria: "Related Pix2Vid tools",
    footerPromise:
      "Create product videos from your photos with Pix2Vid."
  },

  es: {
    brandLocalized: "Vídeos de producto con IA",
    createVideo: "Crear vídeo",
    outputAria: "Resultado de vídeo",
    duration: "Hasta 60 s",
    relatedHeading: "Herramientas relacionadas de Pix2Vid",
    relatedAria: "Herramientas relacionadas de Pix2Vid",
    footerPromise:
      "Crea vídeos de producto a partir de tus fotos con Pix2Vid."
  },

  pt: {
    brandLocalized: "Vídeos de produtos com IA",
    createVideo: "Criar vídeo",
    outputAria: "Resultado do vídeo",
    duration: "Até 60 s",
    relatedHeading: "Ferramentas relacionadas do Pix2Vid",
    relatedAria: "Ferramentas relacionadas do Pix2Vid",
    footerPromise:
      "Crie vídeos de produtos a partir das suas fotos com o Pix2Vid."
  },

  fr: {
    brandLocalized: "Vidéos produit avec IA",
    createVideo: "Créer une vidéo",
    outputAria: "Résultat vidéo",
    duration: "Jusqu'à 60 s",
    relatedHeading: "Outils Pix2Vid associés",
    relatedAria: "Outils Pix2Vid associés",
    footerPromise:
      "Créez des vidéos produit à partir de vos photos avec Pix2Vid."
  },

  de: {
    brandLocalized: "Produktvideos mit KI",
    createVideo: "Video erstellen",
    outputAria: "Videoausgabe",
    duration: "Bis zu 60 Sek.",
    relatedHeading: "Weitere Pix2Vid Tools",
    relatedAria: "Weitere Pix2Vid Tools",
    footerPromise:
      "Erstellen Sie mit Pix2Vid Produktvideos aus Ihren Fotos."
  },

  it: {
    brandLocalized: "Video di prodotto con AI",
    createVideo: "Crea video",
    outputAria: "Risultato video",
    duration: "Fino a 60 s",
    relatedHeading: "Strumenti Pix2Vid correlati",
    relatedAria: "Strumenti Pix2Vid correlati",
    footerPromise:
      "Crea video di prodotto dalle tue foto con Pix2Vid."
  },

  ja: {
    brandLocalized: "AI商品動画作成",
    createVideo: "動画を作成",
    outputAria: "動画出力",
    duration: "最大60秒",
    relatedHeading: "Pix2Vid 関連ツール",
    relatedAria: "Pix2Vid 関連ツール",
    footerPromise:
      "Pix2Vidで商品写真から商品動画を作成できます。"
  },

  ko: {
    brandLocalized: "AI 제품 영상 제작",
    createVideo: "영상 만들기",
    outputAria: "영상 결과",
    duration: "최대 60초",
    relatedHeading: "Pix2Vid 관련 도구",
    relatedAria: "Pix2Vid 관련 도구",
    footerPromise:
      "Pix2Vid로 제품 사진을 제품 영상으로 만들어 보세요."
  },

  zh: {
    brandLocalized: "AI 产品视频制作",
    createVideo: "制作视频",
    outputAria: "视频输出",
    duration: "最长 60 秒",
    relatedHeading: "Pix2Vid 相关工具",
    relatedAria: "Pix2Vid 相关工具",
    footerPromise:
      "使用 Pix2Vid 将产品照片制作成产品视频。"
  },

  "zh-TW": {
    brandLocalized: "AI 商品影片製作",
    createVideo: "製作影片",
    outputAria: "影片輸出",
    duration: "最長 60 秒",
    relatedHeading: "Pix2Vid 相關工具",
    relatedAria: "Pix2Vid 相關工具",
    footerPromise:
      "使用 Pix2Vid 將商品照片製作成商品影片。"
  },

  tr: {
    brandLocalized: "Yapay zekâ ürün videosu",
    createVideo: "Video oluştur",
    outputAria: "Video çıktısı",
    duration: "60 saniyeye kadar",
    relatedHeading: "İlgili Pix2Vid araçları",
    relatedAria: "İlgili Pix2Vid araçları",
    footerPromise:
      "Pix2Vid ile ürün fotoğraflarınızdan ürün videoları oluşturun."
  },

  hi: {
    brandLocalized: "AI प्रोडक्ट वीडियो मेकर",
    createVideo: "वीडियो बनाएं",
    outputAria: "वीडियो आउटपुट",
    duration: "60 सेकंड तक",
    relatedHeading: "संबंधित Pix2Vid टूल",
    relatedAria: "संबंधित Pix2Vid टूल",
    footerPromise:
      "Pix2Vid से अपने प्रोडक्ट फोटो को प्रोडक्ट वीडियो में बदलें।"
  },

  ar: {
    brandLocalized: "إعلانات سريعة بالذكاء الاصطناعي",
    createVideo: "أنشئ فيديو",
    outputAria: "مثال على فيديو تم إنشاؤه بواسطة Pix2Vid",
    duration: "المدة",
    relatedHeading: "اكتشف المزيد من أدوات فيديو المنتجات",
    relatedAria: "صفحات Pix2Vid ذات الصلة",
    footerPromise: "حوّل صور منتجاتك إلى فيديوهات جاهزة للنشر باستخدام الذكاء الاصطناعي."
  }
};

export function getSeoLandingUi(language) {
  return SEO_LANDING_UI[language] || null;
}
