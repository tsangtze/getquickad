export const SEO_LANDING_UI = {
  en: {
    brandLocalized: "",
    createVideo: "Create Video",
    outputAria: "Video output",
    duration: "Up to 60 sec",
    relatedHeading: "Related ImgGetVid tools",
    relatedAria: "Related ImgGetVid tools",
    footerPromise:
      "Create product videos from your photos with ImgGetVid."
  },

  es: {
    brandLocalized: "Vídeos de producto con IA",
    createVideo: "Crear vídeo",
    outputAria: "Resultado de vídeo",
    duration: "Hasta 60 s",
    relatedHeading: "Herramientas relacionadas de ImgGetVid",
    relatedAria: "Herramientas relacionadas de ImgGetVid",
    footerPromise:
      "Crea vídeos de producto a partir de tus fotos con ImgGetVid."
  },

  pt: {
    brandLocalized: "Vídeos de produtos com IA",
    createVideo: "Criar vídeo",
    outputAria: "Resultado do vídeo",
    duration: "Até 60 s",
    relatedHeading: "Ferramentas relacionadas do ImgGetVid",
    relatedAria: "Ferramentas relacionadas do ImgGetVid",
    footerPromise:
      "Crie vídeos de produtos a partir das suas fotos com o ImgGetVid."
  },

  fr: {
    brandLocalized: "Vidéos produit avec IA",
    createVideo: "Créer une vidéo",
    outputAria: "Résultat vidéo",
    duration: "Jusqu'à 60 s",
    relatedHeading: "Outils ImgGetVid associés",
    relatedAria: "Outils ImgGetVid associés",
    footerPromise:
      "Créez des vidéos produit à partir de vos photos avec ImgGetVid."
  },

  de: {
    brandLocalized: "Produktvideos mit KI",
    createVideo: "Video erstellen",
    outputAria: "Videoausgabe",
    duration: "Bis zu 60 Sek.",
    relatedHeading: "Weitere ImgGetVid Tools",
    relatedAria: "Weitere ImgGetVid Tools",
    footerPromise:
      "Erstellen Sie mit ImgGetVid Produktvideos aus Ihren Fotos."
  },

  it: {
    brandLocalized: "Video di prodotto con AI",
    createVideo: "Crea video",
    outputAria: "Risultato video",
    duration: "Fino a 60 s",
    relatedHeading: "Strumenti ImgGetVid correlati",
    relatedAria: "Strumenti ImgGetVid correlati",
    footerPromise:
      "Crea video di prodotto dalle tue foto con ImgGetVid."
  },

  ja: {
    brandLocalized: "AI商品動画作成",
    createVideo: "動画を作成",
    outputAria: "動画出力",
    duration: "最大60秒",
    relatedHeading: "ImgGetVid 関連ツール",
    relatedAria: "ImgGetVid 関連ツール",
    footerPromise:
      "ImgGetVidで商品写真から商品動画を作成できます。"
  },

  ko: {
    brandLocalized: "AI 제품 영상 제작",
    createVideo: "영상 만들기",
    outputAria: "영상 결과",
    duration: "최대 60초",
    relatedHeading: "ImgGetVid 관련 도구",
    relatedAria: "ImgGetVid 관련 도구",
    footerPromise:
      "ImgGetVid로 제품 사진을 제품 영상으로 만들어 보세요."
  },

  zh: {
    brandLocalized: "AI 产品视频制作",
    createVideo: "制作视频",
    outputAria: "视频输出",
    duration: "最长 60 秒",
    relatedHeading: "ImgGetVid 相关工具",
    relatedAria: "ImgGetVid 相关工具",
    footerPromise:
      "使用 ImgGetVid 将产品照片制作成产品视频。"
  },

  "zh-TW": {
    brandLocalized: "AI 商品影片製作",
    createVideo: "製作影片",
    outputAria: "影片輸出",
    duration: "最長 60 秒",
    relatedHeading: "ImgGetVid 相關工具",
    relatedAria: "ImgGetVid 相關工具",
    footerPromise:
      "使用 ImgGetVid 將商品照片製作成商品影片。"
  },

  tr: {
    brandLocalized: "Yapay zekâ ürün videosu",
    createVideo: "Video oluştur",
    outputAria: "Video çıktısı",
    duration: "60 saniyeye kadar",
    relatedHeading: "İlgili ImgGetVid araçları",
    relatedAria: "İlgili ImgGetVid araçları",
    footerPromise:
      "ImgGetVid ile ürün fotoğraflarınızdan ürün videoları oluşturun."
  },

  hi: {
    brandLocalized: "AI प्रोडक्ट वीडियो मेकर",
    createVideo: "वीडियो बनाएं",
    outputAria: "वीडियो आउटपुट",
    duration: "60 सेकंड तक",
    relatedHeading: "संबंधित ImgGetVid टूल",
    relatedAria: "संबंधित ImgGetVid टूल",
    footerPromise:
      "ImgGetVid से अपने प्रोडक्ट फोटो को प्रोडक्ट वीडियो में बदलें।"
  },

  ar: {
    brandLocalized: "إعلانات سريعة بالذكاء الاصطناعي",
    createVideo: "أنشئ فيديو",
    outputAria: "مثال على فيديو تم إنشاؤه بواسطة ImgGetVid",
    duration: "المدة",
    relatedHeading: "اكتشف المزيد من أدوات فيديو المنتجات",
    relatedAria: "صفحات ImgGetVid ذات الصلة",
    footerPromise: "حوّل صور منتجاتك إلى فيديوهات جاهزة للنشر باستخدام الذكاء الاصطناعي."
  }
};

export function getSeoLandingUi(language) {
  return SEO_LANDING_UI[language] || null;
}
