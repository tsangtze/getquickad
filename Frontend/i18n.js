const SUPPORTED_LANGS = {
  en: { name: "English", flag: "🇺🇸" },
  es: { name: "Español (MX)", flag: "🇲🇽" },
  pt: { name: "Português", flag: "🇧🇷" },
  fr: { name: "Français", flag: "🇫🇷" },
  de: { name: "Deutsch", flag: "🇩🇪" },
  it: { name: "Italiano", flag: "🇮🇹" },
  ja: { name: "日本語", flag: "JP" },
  ko: { name: "한국어", flag: "KR" },
  zh: { name: "中文", flag: "CN" },
  tr: { name: "Türkçe", flag: "TR" },
  hi: { name: "हिन्दी", flag: "IN" }
};
let currentLang = localStorage.getItem('quickad_lang');
let translations = {};

function detectBrowserLang(){
  const browserLangs = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || 'en'];

  for (const browserLang of browserLangs) {
    const baseLang = String(browserLang || 'en').toLowerCase().split('-')[0];
    if (SUPPORTED_LANGS[baseLang]) {
      return baseLang;
    }
  }

  return 'en';
}

if(!currentLang || currentLang === 'null'){
  currentLang = detectBrowserLang();
  localStorage.setItem('quickad_lang', currentLang);
}
async function loadTranslations(lang){
  try{
    const res=await fetch(`/locales/${lang}.json?v=${Date.now()}`);
    if(!res.ok) throw new Error('no locale');
    translations=await res.json();
    document.documentElement.lang=lang;
    applyTranslations();
  }catch(e){ if(lang!=='en'){ currentLang='en'; loadTranslations('en'); } }
}
function t(key, params = {}){
  let value = translations[key] || key;
  for (const [name, replacement] of Object.entries(params)) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}
function applyTranslations(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key=el.getAttribute('data-i18n');
    const val=translations[key];
    if(val) el.textContent=val;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    const key=el.getAttribute('data-i18n-placeholder');
    const val=translations[key];
    if(val) el.placeholder=val;
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el=>{
    const key=el.getAttribute('data-i18n-aria-label');
    const val=translations[key];
    if(val) el.setAttribute('aria-label', val);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{
    const key=el.getAttribute('data-i18n-title');
    const val=translations[key];
    if(val) el.title=val;
  });
  if(translations['page.title']) document.title=translations['page.title'];
  if(typeof window.updateQuota==='function'){ try{ window.updateQuota(); }catch(e){} }
  updateLabel();
  window.dispatchEvent(new CustomEvent("quickad:languagechange", { detail: { lang: currentLang } }));
}
function setLanguage(lang){
  if(!SUPPORTED_LANGS[lang]) return;
  currentLang=lang;
  localStorage.setItem('quickad_lang',lang);
  loadTranslations(lang);
  const drop=document.getElementById('lang-dropdown');
  if(drop) drop.style.display='none';
}
function updateLabel(){
  const btn=document.getElementById('lang-current');
  if(!btn) return;
  const info=SUPPORTED_LANGS[currentLang]||SUPPORTED_LANGS.en;
  btn.textContent=`${info.flag} ${info.name}`;
}
function initLang(){
  const curBtn=document.getElementById('lang-current');
  const drop=document.getElementById('lang-dropdown');
  if(!curBtn||!drop){ loadTranslations(currentLang); return; }
  curBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    drop.style.display = drop.style.display==='block'? 'none' : 'block';
  });
  drop.querySelectorAll('[data-lang]').forEach(b=>{
    b.addEventListener('click', (e)=>{
      e.stopPropagation();
      setLanguage(b.getAttribute('data-lang'));
    });
  });
  document.addEventListener('click', ()=>{ drop.style.display='none'; });
  updateLabel();
  loadTranslations(currentLang);
}
document.addEventListener('DOMContentLoaded', initLang);
window.QuickAdI18n={t,setLanguage,get currentLang(){return currentLang}};

