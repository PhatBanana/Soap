/* Small generic helpers — no app state, no DOM. Split out because core/state.js needs
   them and reaching back into main.js for them would make the dependency graph a ring. */
export function todayISO(){ var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
/* The share link carries the whole recipe in its fragment, so it needs a URL-safe base64
   that survives being pasted into a message. */
export function b64urlEnc(str){ return btoa(unescape(encodeURIComponent(str))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
export function b64urlDec(s){ s=s.replace(/-/g,"+").replace(/_/g,"/"); while(s.length%4) s+="="; return decodeURIComponent(escape(atob(s))); }
