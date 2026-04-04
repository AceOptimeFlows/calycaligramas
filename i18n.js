/* i18n.js — C△lyCaLigramas */
(function(){
  "use strict";

  const STORAGE_KEY = "calyLanguage";
  const FALLBACK_LANGUAGE = "es";
  const SUPPORTED_LANGUAGES = [
    "es","en","pt-br","fr","it","de","ko","ja","zh","ru","hi","ca"
  ];
  const LANGUAGE_ALIASES = {
    "pt": "pt-br",
    "pt_br": "pt-br",
    "ptbr": "pt-br",
    "es-es": "es",
    "en-us": "en",
    "en-gb": "en",
    "fr-fr": "fr",
    "it-it": "it",
    "de-de": "de",
    "ko-kr": "ko",
    "ja-jp": "ja",
    "zh-cn": "zh",
    "zh-tw": "zh",
    "zh-hans": "zh",
    "zh-hant": "zh",
    "ru-ru": "ru",
    "hi-in": "hi",
    "ca-es": "ca"
  };

  let requestedLanguage = FALLBACK_LANGUAGE;
  let activeLanguage = FALLBACK_LANGUAGE;
  let dictionary = {};
  let fallbackDictionary = {};
  let initialized = false;

  function normalizeLanguage(language){
    const raw = String(language || "").trim().toLowerCase();
    if(!raw) return FALLBACK_LANGUAGE;

    const aliased = LANGUAGE_ALIASES[raw] || raw;
    if(SUPPORTED_LANGUAGES.includes(aliased)) return aliased;

    const short = aliased.split("-")[0];
    if(SUPPORTED_LANGUAGES.includes(short)) return short;

    if(short === "pt") return "pt-br";
    return FALLBACK_LANGUAGE;
  }

  function getByPath(source, path){
    if(!source || !path) return undefined;
    return String(path).split(".").reduce((acc, key)=>{
      if(acc && Object.prototype.hasOwnProperty.call(acc, key)) return acc[key];
      return undefined;
    }, source);
  }

  function interpolate(template, params){
    return String(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key)=>{
      if(params && Object.prototype.hasOwnProperty.call(params, key)){
        return params[key];
      }
      return "";
    });
  }

  async function loadDictionary(language){
    const candidates = [
      `./lang/${language}.json`,
      `./${language}.json`
    ];

    let lastError = null;
    for(const url of candidates){
      try{
        const response = await fetch(url, { cache: "no-cache" });
        if(!response.ok){
          throw new Error(`No se pudo cargar ${url}`);
        }
        return response.json();
      }catch(error){
        lastError = error;
      }
    }

    throw lastError || new Error(`No se pudo cargar ningún diccionario para ${language}`);
  }

  function syncDocumentLanguage(language){
    document.documentElement.lang = language === "pt-br" ? "pt-BR" : language;
  }

  function setLeadingText(node, value){
    const childNodes = Array.from(node.childNodes);
    const textNode = childNodes.find((child)=> child.nodeType === Node.TEXT_NODE && child.textContent.trim());
    const suffix = childNodes.some((child)=> child.nodeType === Node.ELEMENT_NODE) ? " " : "";

    if(textNode){
      textNode.textContent = `${value}${suffix}`;
      return;
    }

    node.insertBefore(document.createTextNode(`${value}${suffix}`), node.firstChild);
  }

  function applyTranslations(root = document){
    root.querySelectorAll("[data-i18n]").forEach((node)=>{
      const key = node.getAttribute("data-i18n");
      const value = translate(key, {}, node.textContent);
      if(typeof value === "string") node.textContent = value;
    });

    root.querySelectorAll("[data-i18n-html]").forEach((node)=>{
      const key = node.getAttribute("data-i18n-html");
      const value = translate(key, {}, node.innerHTML);
      if(typeof value === "string") node.innerHTML = value;
    });

    root.querySelectorAll("[data-i18n-label]").forEach((node)=>{
      const key = node.getAttribute("data-i18n-label");
      const fallback = Array.from(node.childNodes)
        .find((child)=> child.nodeType === Node.TEXT_NODE && child.textContent.trim())?.textContent?.trim() || "";
      const value = translate(key, {}, fallback);
      if(typeof value === "string") setLeadingText(node, value);
    });

    root.querySelectorAll("[data-i18n-title]").forEach((node)=>{
      const key = node.getAttribute("data-i18n-title");
      const value = translate(key, {}, node.getAttribute("title") || "");
      node.setAttribute("title", value);
    });

    root.querySelectorAll("[data-i18n-aria-label]").forEach((node)=>{
      const key = node.getAttribute("data-i18n-aria-label");
      const value = translate(key, {}, node.getAttribute("aria-label") || "");
      node.setAttribute("aria-label", value);
    });

    root.querySelectorAll("[data-i18n-alt]").forEach((node)=>{
      const key = node.getAttribute("data-i18n-alt");
      const value = translate(key, {}, node.getAttribute("alt") || "");
      node.setAttribute("alt", value);
    });

    root.querySelectorAll("[data-i18n-placeholder]").forEach((node)=>{
      const key = node.getAttribute("data-i18n-placeholder");
      const value = translate(key, {}, node.getAttribute("placeholder") || "");
      node.setAttribute("placeholder", value);
    });

    root.querySelectorAll("[data-i18n-content]").forEach((node)=>{
      const key = node.getAttribute("data-i18n-content");
      const value = translate(key, {}, node.getAttribute("content") || "");
      node.setAttribute("content", value);
    });

    refreshLanguageSelect();
  }

  function refreshLanguageSelect(){
    const select = document.querySelector("#languageSelect");
    if(select) select.value = requestedLanguage;
  }

  function translate(key, params = {}, fallback = ""){
    const primary = getByPath(dictionary, key);
    if(primary !== undefined){
      return typeof primary === "string" ? interpolate(primary, params) : primary;
    }

    const secondary = getByPath(fallbackDictionary, key);
    if(secondary !== undefined){
      return typeof secondary === "string" ? interpolate(secondary, params) : secondary;
    }

    return fallback || key;
  }

  async function init(options = {}){
    requestedLanguage = normalizeLanguage(
      options.language ||
      localStorage.getItem(STORAGE_KEY) ||
      navigator.language ||
      FALLBACK_LANGUAGE
    );

    try{
      fallbackDictionary = await loadDictionary(FALLBACK_LANGUAGE);
    }catch{
      fallbackDictionary = {};
    }

    if(requestedLanguage === FALLBACK_LANGUAGE){
      dictionary = fallbackDictionary;
    }else{
      try{
        dictionary = await loadDictionary(requestedLanguage);
      }catch{
        dictionary = fallbackDictionary;
      }
    }

    activeLanguage = requestedLanguage;
    localStorage.setItem(STORAGE_KEY, requestedLanguage);
    syncDocumentLanguage(requestedLanguage);
    applyTranslations(document);
    initialized = true;

    document.dispatchEvent(new CustomEvent("i18n:change", {
      detail: {
        language: requestedLanguage
      }
    }));

    return api;
  }

  async function setLanguage(language){
    requestedLanguage = normalizeLanguage(language);
    localStorage.setItem(STORAGE_KEY, requestedLanguage);

    if(!initialized && !Object.keys(fallbackDictionary).length){
      await init({ language: requestedLanguage });
      return api;
    }

    if(requestedLanguage === FALLBACK_LANGUAGE){
      dictionary = fallbackDictionary;
    }else{
      try{
        dictionary = await loadDictionary(requestedLanguage);
      }catch{
        dictionary = fallbackDictionary;
      }
    }

    activeLanguage = requestedLanguage;
    syncDocumentLanguage(requestedLanguage);
    applyTranslations(document);

    document.dispatchEvent(new CustomEvent("i18n:change", {
      detail: {
        language: requestedLanguage
      }
    }));

    return api;
  }

  const api = {
    init,
    setLanguage,
    apply: applyTranslations,
    t: translate,
    normalizeLanguage,
    get language(){
      return activeLanguage;
    },
    get requestedLanguage(){
      return requestedLanguage;
    }
  };

  window.I18N = api;
})();