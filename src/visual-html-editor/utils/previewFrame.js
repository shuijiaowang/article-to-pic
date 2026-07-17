function previewStoragePrefix(scopeId) {
  return `__hh_preview_${scopeId}__`
}

function buildStorageShimScript(scopeId) {
  const prefix = previewStoragePrefix(scopeId)
  return `<script>(function(){
var P=${JSON.stringify(prefix)};
var rawL=window.localStorage;
var rawS=window.sessionStorage;
function makeProxy(raw){
  function isP(k){return k&&k.indexOf(P)===0;}
  function pfx(k){return P+k;}
  function strip(k){return k.slice(P.length);}
  function listKeys(){
    var out=[];
    for(var i=0;i<raw.length;i++){
      var k=raw.key(i);
      if(isP(k)) out.push(strip(k));
    }
    return out;
  }
  return {
    get length(){return listKeys().length;},
    key:function(i){var ks=listKeys();return i>=0&&i<ks.length?ks[i]:null;},
    getItem:function(k){return k==null?null:raw.getItem(pfx(String(k)));},
    setItem:function(k,v){raw.setItem(pfx(String(k)),String(v));},
    removeItem:function(k){raw.removeItem(pfx(String(k)));},
    clear:function(){
      var rm=[];
      for(var i=0;i<raw.length;i++){
        var k=raw.key(i);
        if(isP(k)) rm.push(k);
      }
      for(var j=0;j<rm.length;j++) raw.removeItem(rm[j]);
    }
  };
}
try{
  Object.defineProperty(window,'localStorage',{get:function(){return makeProxy(rawL);},configurable:true});
  Object.defineProperty(window,'sessionStorage',{get:function(){return makeProxy(rawS);},configurable:true});
}catch(e){}
})();<\/script>`
}

import { stripPreviewStorageShim } from '../../utils/parse-html.ts'

function injectPreviewStorageIsolation(html, scopeId) {
  if (!html || !scopeId) return html

  const cleaned = stripPreviewStorageShim(html)
  const shim = buildStorageShimScript(scopeId)

  if (/<head\b[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<head\b[^>]*>/i, (match) => `${match}${shim}`)
  }
  if (/<body\b[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<body\b[^>]*>/i, (match) => `${match}${shim}`)
  }
  if (/<html\b[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<html\b[^>]*>/i, (match) => `${match}<head>${shim}</head>`)
  }
  return `${shim}${cleaned}`
}

export function buildPreviewHtml(html, scopeId) {
  const source = String(html || '')
  if (!source.trim()) return ''
  if (!scopeId) return source
  return injectPreviewStorageIsolation(source, scopeId)
}

export function createPreviewBlobUrl(html, scopeId) {
  const payload = buildPreviewHtml(html, scopeId)
  if (!payload) return ''
  const blob = new Blob([payload], { type: 'text/html;charset=utf-8' })
  return URL.createObjectURL(blob)
}

export function revokePreviewBlobUrl(url) {
  if (!url) return
  try {
    URL.revokeObjectURL(url)
  } catch {
    // ignore
  }
}
