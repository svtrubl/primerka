(() => {
const $ = s => document.querySelector(s);
const STORE = 'primerka-v4';
const FRAMES = {
  none:  {label:'Без рамы (подрамник)', w:0,   mat:0, color:null},
  black: {label:'Тонкая чёрная рама, 2 см', w:2,   mat:0, color:'#1b1b1b'},
  oak:   {label:'Дубовая рама, 3,5 см', w:3.5, mat:0, color:'#a9824f'},
  white: {label:'Белая рама, 2,5 см',  w:2.5, mat:0, color:'#f1f0ec'},
  mat:   {label:'Чёрная рама + паспарту 6 см', w:2, mat:6, color:'#1b1b1b'}
};
const fmt = n => (Math.round(n*10)/10).toString().replace('.', ',');
const outer = p => { const f = FRAMES[p.frame] || FRAMES.none; const a = 2*(f.w + f.mat); return {w:p.w + a, h:p.h + a}; };

const state = {paintings:[], sel:0};
const imgCache = new Map();
function getImg(src){
  if (imgCache.has(src)) return imgCache.get(src);
  const pr = new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  imgCache.set(src, pr); return pr;
}
function toast(msg){
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; t.setAttribute('role','status');
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}

/* ---------- каталог: общий список работ сайта (works.json) ---------- */
let CATALOG = [];
async function loadCatalog(){
  const base = new URL('../', location.href);
  const r = await fetch(new URL('works.json', base), {cache:'no-cache'});
  const data = await r.json();
  CATALOG = data.works.filter(w => w.img && w.fit !== false && !w.hidden).map(w => ({
    id:w.slug, name:w.title, w:w.w, h:w.h, frame:'none', img:new URL(w.img, base).href
  }));
}

/* ---------- storage: only the chosen frame per painting and the selected painting ---------- */
function persist(){
  try { const frames = {}; state.paintings.forEach(p => frames[p.id] = p.frame);
    localStorage.setItem(STORE, JSON.stringify({sel:state.paintings[state.sel] && state.paintings[state.sel].id, frames})); } catch(e){}
}
function restore(){
  state.paintings = CATALOG.map(p => Object.assign({ratio:p.h/p.w}, p)); state.sel = 0;
  try { const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s){
      state.paintings.forEach(p => { if (s.frames && FRAMES[s.frames[p.id]]) p.frame = s.frames[p.id]; });
      const i = state.paintings.findIndex(p => p.id === s.sel); if (i >= 0) state.sel = i;
    } } catch(e){}
  /* ссылка вида /fit/?work=naslazhdenie сразу выбирает нужную картину */
  const want = new URLSearchParams(location.search).get('work');
  if (want){ const i = state.paintings.findIndex(p => p.id === want); if (i >= 0) state.sel = i; }
}
function fileToData(file, max){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => { const k = Math.min(1, max/Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth*k); c.height = Math.round(im.naturalHeight*k);
      c.getContext('2d').drawImage(im,0,0,c.width,c.height); URL.revokeObjectURL(url);
      res({data:c.toDataURL('image/jpeg',0.86), w:c.width, h:c.height}); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    im.src = url;
  });
}
const cur = () => state.paintings[state.sel];

/* ---------- works strip + label ---------- */
function renderStrip(){
  const s = $('#strip'); s.textContent = '';
  state.paintings.forEach((p, i) => {
    const b = document.createElement('button'); b.className = 'work'; b.type = 'button'; b.setAttribute('aria-pressed', i === state.sel);
    const pic = document.createElement('span'); pic.className = 'pic'; const im = document.createElement('img'); im.src = p.img; im.alt = ''; pic.appendChild(im);
    const cap = document.createElement('span'); cap.className = 'cap'; cap.textContent = p.name;
    const dim = document.createElement('span'); dim.className = 'dim'; dim.textContent = fmt(p.w) + ' × ' + fmt(p.h) + ' см';
    b.append(pic, cap, dim); b.onclick = () => { state.sel = i; persist(); renderAll(); };
    s.appendChild(b);
  });
}
function renderLabel(){
  const p = cur(); if (!p) return;
  $('#lblName').textContent = p.name; $('#pFrame').value = p.frame;
  const o = outer(p); $('#outerSize').textContent = p.frame === 'none' ? fmt(p.w)+' × '+fmt(p.h)+' см' : fmt(p.w)+' × '+fmt(p.h)+' см, в раме ' + fmt(o.w)+' × '+fmt(o.h)+' см';
}
function renderAll(){ renderStrip(); renderLabel(); drawPhoto(); renderXrStrip(); }

Object.entries(FRAMES).forEach(([k, f]) => { const o = document.createElement('option'); o.value = k; o.textContent = f.label; $('#pFrame').appendChild(o); });
$('#pFrame').addEventListener('change', e => { cur().frame = e.target.value; persist(); renderAll(); });

/* ---------- photo mode ---------- */
const cv = $('#photoCanvas'), ctx = cv.getContext('2d');
const ph = {warp:null, keys:{l:1,r:1,t:1,b:1}, quad:null, dims:null, room:null, sample:true, pxPerCm:3.2, scaleSrc:'по дивану шириной 200 см', approx:false, pos:{x:.5, y:.33}, fine:1, calib:false, calibMode:'ceil', pts:[], drag:null, rect:null};
function sampleRoom(){
  const c = document.createElement('canvas'); c.width = 1600; c.height = 1000; const x = c.getContext('2d');
  const g = x.createLinearGradient(0,0,0,780); g.addColorStop(0,'#d3d5cf'); g.addColorStop(1,'#c4c7c0'); x.fillStyle = g; x.fillRect(0,0,1600,780);
  const fl = x.createLinearGradient(0,780,0,1000); fl.addColorStop(0,'#86684b'); fl.addColorStop(1,'#6d533b'); x.fillStyle = fl; x.fillRect(0,780,1600,220);
  x.strokeStyle = 'rgba(0,0,0,.12)'; x.lineWidth = 2; for (let i=0;i<9;i++){ x.beginPath(); x.moveTo(0,800+i*26); x.lineTo(1600,800+i*26); x.stroke(); }
  x.fillStyle = '#ecebe6'; x.fillRect(0,762,1600,22);
  // sofa: 640 px = 200 cm
  x.fillStyle = 'rgba(0,0,0,.18)'; x.beginPath(); x.ellipse(800,800,360,22,0,0,Math.PI*2); x.fill();
  x.fillStyle = '#566771'; const rr = (X,Y,W,H,R) => { x.beginPath(); x.roundRect(X,Y,W,H,R); x.fill(); };
  rr(500,560,600,120,18); rr(480,640,640,130,16); rr(468,600,70,170,20); rr(1062,600,70,170,20);
  x.fillStyle = '#4b5b64'; rr(520,650,280,60,10); rr(800,650,280,60,10);
  x.fillStyle = '#2b2b2b'; x.fillRect(500,770,14,18); x.fillRect(1086,770,14,18);
  // floor lamp
  x.fillStyle = '#2f2f2f'; x.fillRect(1290,420,6,350); x.fillRect(1260,768,66,8);
  x.fillStyle = '#e8dcc2'; x.beginPath(); x.moveTo(1240,420); x.lineTo(1346,420); x.lineTo(1320,340); x.lineTo(1266,340); x.closePath(); x.fill();
  return c;
}
const SAMPLE_ROOM = sampleRoom();
function roomSrc(){ return ph.room || SAMPLE_ROOM; }
function updateScaleNote(){
  $('#roomBadge').hidden = !ph.sample;
  $('#scaleNote').textContent = ph.approx
    ? 'Масштаб пока приблизительный. Нажмите «Масштаб» и протяните линейку от пола до потолка.'
    : 'Масштаб задан ' + ph.scaleSrc + '. Картину можно перетаскивать.';
}
async function drawPhoto(){
  const room = roomSrc();
  if (cv.width !== room.width || cv.height !== room.height){ cv.width = room.width; cv.height = room.height; }
  ctx.clearRect(0,0,cv.width,cv.height); ctx.drawImage(room,0,0);
  const p = cur(); ph.rect = null; ph.quad = null;
  if (p){
    let im; try { im = await getImg(p.img); } catch(e){ im = null; }
    if (im && cur() === p){
      ctx.clearRect(0,0,cv.width,cv.height); ctx.drawImage(room,0,0);
      const k = ph.pxPerCm*ph.fine, cx = ph.pos.x*cv.width, cy = ph.pos.y*cv.height;
      if (ph.warp){
        const o = outer(p), W = o.w*k, H = o.h*k; ph.dims = {W, H};
        ph.quad = ph.warp.map(n => ({x:cx + n.x*W/2, y:cy + n.y*H/2}));
        drawWarped(ctx, p, im, k, ph.quad);
        const xs = ph.quad.map(q => q.x), ys = ph.quad.map(q => q.y);
        ph.rect = {L:Math.min(...xs), T:Math.min(...ys), W:Math.max(...xs) - Math.min(...xs), H:Math.max(...ys) - Math.min(...ys)};
      } else {
        ph.rect = drawFramed(ctx, p, im, cx, cy, k); ph.dims = {W:ph.rect.W, H:ph.rect.H};
      }
    }
  }
  if (ph.calib){
    ctx.save(); ctx.strokeStyle = '#ffd400'; ctx.fillStyle = '#ffd400'; ctx.lineWidth = Math.max(3, cv.width/400);
    ph.pts.forEach(q => { ctx.beginPath(); ctx.arc(q.x,q.y,ctx.lineWidth*3,0,Math.PI*2); ctx.fill(); });
    if (ph.pts.length === 2){ ctx.beginPath(); ctx.moveTo(ph.pts[0].x,ph.pts[0].y); ctx.lineTo(ph.pts[1].x,ph.pts[1].y); ctx.stroke(); }
    ctx.restore();
  }
}
function paintBody(x, p, im, L, T, k){
  const f = FRAMES[p.frame] || FRAMES.none; const o = outer(p); const W = o.w*k, H = o.h*k;
  x.fillStyle = f.color || '#2a2a2a'; x.fillRect(L,T,W,H);
  if (f.w){ x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = Math.max(1, k*0.3); x.strokeRect(L + f.w*k, T + f.w*k, W - 2*f.w*k, H - 2*f.w*k); }
  if (f.mat){ x.fillStyle = '#f4f3ef'; x.fillRect(L + f.w*k, T + f.w*k, W - 2*f.w*k, H - 2*f.w*k); }
  const a = (f.w + f.mat)*k; x.drawImage(im, L + a, T + a, p.w*k, p.h*k);
}
function drawFramed(x, p, im, cx, cy, k){
  const o = outer(p);
  const W = o.w*k, H = o.h*k, L = cx - W/2, T = cy - H/2;
  x.save();
  x.shadowColor = 'rgba(0,0,0,.38)'; x.shadowBlur = Math.max(6, W*0.05); x.shadowOffsetY = Math.max(3, W*0.025);
  x.fillStyle = '#2a2a2a'; x.fillRect(L,T,W,H);
  x.restore();
  paintBody(x, p, im, L, T, k);
  return {L, T, W, H};
}

/* ---------- «Подогнать под угол»: картина в перспективе по четырём уголкам ----------
   Уголки хранятся относительно центра в долях половины ширины и высоты,
   поэтому форма сохраняется при перетаскивании, смене картины и масштаба. */
const DEFAULT_WARP = () => [{x:-1,y:-1},{x:1,y:-1},{x:1,y:1},{x:-1,y:1}];
let flatCache = {key:'', c:null};
function flatPainting(p, im, k){
  const o = outer(p), W = Math.max(2, Math.round(o.w*k)), H = Math.max(2, Math.round(o.h*k));
  const key = p.id + '|' + p.frame + '|' + W + 'x' + H;
  if (flatCache.key === key) return flatCache.c;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  paintBody(c.getContext('2d'), p, im, 0, 0, W / o.w);
  flatCache = {key, c}; return c;
}
function squareToQuad(q){
  const [p0,p1,p2,p3] = q;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0, h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9){
    const den = dx1*dy2 - dx2*dy1 || 1e-9;
    g = (dx3*dy2 - dx2*dy3) / den; h = (dx1*dy3 - dx3*dy1) / den;
  }
  const a = p1.x - p0.x + g*p1.x, b = p3.x - p0.x + h*p3.x, c = p0.x;
  const d = p1.y - p0.y + g*p1.y, e = p3.y - p0.y + h*p3.y, f = p0.y;
  return (u, v) => { const w = g*u + h*v + 1; return {x:(a*u + b*v + c)/w, y:(d*u + e*v + f)/w}; };
}
function drawTri(x, img, s, d){
  const cxm = (d[0].x + d[1].x + d[2].x)/3, cym = (d[0].y + d[1].y + d[2].y)/3;
  x.save(); x.beginPath();
  d.forEach((pt, i) => { const dx = pt.x - cxm, dy = pt.y - cym, l = Math.hypot(dx, dy) || 1, gx = pt.x + dx/l*0.8, gy = pt.y + dy/l*0.8;
    i ? x.lineTo(gx, gy) : x.moveTo(gx, gy); });
  x.closePath(); x.clip();
  const [a0,a1,a2] = s, [b0,b1,b2] = d;
  const den = (a1.x - a0.x)*(a2.y - a0.y) - (a2.x - a0.x)*(a1.y - a0.y);
  if (Math.abs(den) < 1e-9){ x.restore(); return; }
  const m11 = ((b1.x - b0.x)*(a2.y - a0.y) - (b2.x - b0.x)*(a1.y - a0.y)) / den;
  const m21 = ((b2.x - b0.x)*(a1.x - a0.x) - (b1.x - b0.x)*(a2.x - a0.x)) / den;
  const m12 = ((b1.y - b0.y)*(a2.y - a0.y) - (b2.y - b0.y)*(a1.y - a0.y)) / den;
  const m22 = ((b2.y - b0.y)*(a1.x - a0.x) - (b1.y - b0.y)*(a2.x - a0.x)) / den;
  x.setTransform(m11, m12, m21, m22, b0.x - m11*a0.x - m21*a0.y, b0.y - m12*a0.x - m22*a0.y);
  const sx = Math.max(0, Math.floor(Math.min(a0.x, a1.x, a2.x)) - 1), sy = Math.max(0, Math.floor(Math.min(a0.y, a1.y, a2.y)) - 1);
  const sw = Math.min(img.width - sx, Math.ceil(Math.max(a0.x, a1.x, a2.x)) + 1 - sx), sh = Math.min(img.height - sy, Math.ceil(Math.max(a0.y, a1.y, a2.y)) + 1 - sy);
  if (sw > 0 && sh > 0) x.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
  x.restore();
}
function drawWarped(x, p, im, k, quad){
  const flat = flatPainting(p, im, k), W = flat.width, H = flat.height;
  const W2 = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
  x.save(); x.shadowColor = 'rgba(0,0,0,.38)'; x.shadowBlur = Math.max(6, W2*0.05); x.shadowOffsetY = Math.max(3, W2*0.025);
  x.fillStyle = '#2a2a2a'; x.beginPath(); quad.forEach((q, i) => i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y)); x.closePath(); x.fill();
  x.restore();
  const map = squareToQuad(quad), N = 12;
  const P = [], S = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++){ P.push(map(i/N, j/N)); S.push({x:i/N*W, y:j/N*H}); }
  const at = (i, j) => j*(N + 1) + i;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){
    const a = at(i,j), b = at(i+1,j), c = at(i+1,j+1), d = at(i,j+1);
    drawTri(x, flat, [S[a],S[b],S[c]], [P[a],P[b],P[c]]);
    drawTri(x, flat, [S[a],S[c],S[d]], [P[a],P[c],P[d]]);
  }
}
function inQuad(q, pt){
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++){
    if (((q[i].y > pt.y) !== (q[j].y > pt.y)) && (pt.x < (q[j].x - q[i].x) * (pt.y - q[i].y) / (q[j].y - q[i].y) + q[i].x)) inside = !inside;
  }
  return inside;
}
function onPainting(q){
  if (ph.quad) return inQuad(ph.quad, q);
  const r = ph.rect; return !!(r && q.x >= r.L && q.x <= r.L + r.W && q.y >= r.T && q.y <= r.T + r.H);
}

/* ---------- угол: выбрать сторону и уменьшать или увеличивать её кнопками ----------
   l, r — высота левого и правого края; t, b — ширина верхнего и нижнего (1 — как есть). */
let side = 'l';
const keysToWarp = k => [{x:-k.t, y:-k.l}, {x:k.t, y:-k.r}, {x:k.b, y:k.r}, {x:-k.b, y:k.l}];
const isFlat = k => ['l','r','t','b'].every(n => Math.abs(k[n] - 1) < 1e-6);
function applyKeys(){ ph.warp = isFlat(ph.keys) ? null : keysToWarp(ph.keys); drawPhoto(); }
function showAngle(on){ $('#angleBox').hidden = !on; $('#warpBtn').classList.toggle('primary', on); }
$('#warpBtn').addEventListener('click', () => { const on = $('#angleBox').hidden; hideRuler(); showAngle(on); });
document.querySelectorAll('.sides .seg-b').forEach(b => b.addEventListener('click', () => {
  side = b.dataset.side; document.querySelectorAll('.sides .seg-b').forEach(x => x.setAttribute('aria-pressed', x === b)); }));
function nudge(d){ ph.keys[side] = Math.min(1.6, Math.max(0.4, Math.round((ph.keys[side] + d) * 100) / 100)); applyKeys(); }
/* кнопку можно удерживать: сторона меняется плавно */
function holdRepeat(el, fn){
  let t = null, iv = null;
  const stop = () => { clearTimeout(t); clearInterval(iv); t = iv = null; };
  el.addEventListener('pointerdown', e => { e.preventDefault(); fn(); t = setTimeout(() => { iv = setInterval(fn, 90); }, 380); });
  ['pointerup','pointerleave','pointercancel'].forEach(n => el.addEventListener(n, stop));
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fn(); } });
}
holdRepeat($('#angleMinus'), () => nudge(-0.02));
holdRepeat($('#anglePlus'), () => nudge(0.02));
$('#angleReset').addEventListener('click', () => { ph.keys = {l:1, r:1, t:1, b:1}; applyKeys(); });
$('#angleDone').addEventListener('click', () => showAngle(false));

/* ---------- масштаб: вертикальная линейка на фото ----------
   Нижний кружок — на пол, верхний — к потолку или на верх двери, вписать высоту в см.
   Сайт узнаёт масштаб и где пол, и вешает картину центром на 150 см от пола. */
const R = {x:.5, top:.1, bottom:.9};
let rDrag = null;
function layoutRuler(){
  const pc = v => (v * 100) + '%';
  const line = $('#rulerLine'); line.style.left = pc(R.x); line.style.top = pc(R.top); line.style.height = pc(R.bottom - R.top);
  ['#rulerTop','#rulerBottom'].forEach(q => { $(q).style.left = pc(R.x); });
  $('#rulerTop').style.top = pc(R.top); $('#rulerBottom').style.top = pc(R.bottom);
  const box = $('#rulerForm'); box.style.top = pc((R.top + R.bottom) / 2);
  if (R.x > .55){ box.style.left = 'auto'; box.style.right = 'calc(' + pc(1 - R.x) + ' + 26px)'; }
  else { box.style.right = 'auto'; box.style.left = 'calc(' + pc(R.x) + ' + 26px)'; }
}
function showRuler(){
  showAngle(false);
  if (ph.rect) R.x = Math.min(.88, Math.max(.12, (ph.rect.L + ph.rect.W / 2) / cv.width));
  $('#ruler').hidden = false; $('#calibBtn').classList.add('primary'); layoutRuler();
  $('#scaleNote').textContent = 'Поставьте нижний кружок на пол, верхний — к потолку или на верх двери, прямо там, где будет картина. Впишите высоту и нажмите OK.';
}
function hideRuler(){ if ($('#ruler').hidden) return; $('#ruler').hidden = true; $('#calibBtn').classList.remove('primary'); updateScaleNote(); }
$('#calibBtn').addEventListener('click', () => { $('#ruler').hidden ? showRuler() : hideRuler(); });
function stageFrac(e){ const r = cv.getBoundingClientRect(); return {x:(e.clientX - r.left) / r.width, y:(e.clientY - r.top) / r.height}; }
[['#rulerTop','top'], ['#rulerBottom','bottom'], ['#rulerLine','line']].forEach(([sel, what]) => {
  const el = $(sel);
  el.addEventListener('pointerdown', e => { e.preventDefault(); const f = stageFrac(e); rDrag = {what, dx:f.x - R.x}; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (!rDrag) return; const f = stageFrac(e), cl = v => Math.min(.98, Math.max(.02, v));
    if (rDrag.what === 'top'){ R.top = Math.min(cl(f.y), R.bottom - .05); R.x = cl(f.x); }
    else if (rDrag.what === 'bottom'){ R.bottom = Math.max(cl(f.y), R.top + .05); R.x = cl(f.x); }
    else R.x = cl(f.x - rDrag.dx);
    layoutRuler();
  });
  const end = () => { rDrag = null; }; el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
});
$('#rulerForm').addEventListener('submit', e => {
  e.preventDefault(); const cm = +$('#rulerCm').value;
  if (!(cm > 0)){ toast('Впишите высоту в сантиметрах, например 270.'); $('#rulerCm').focus(); return; }
  ph.pxPerCm = (R.bottom - R.top) * cv.height / cm; ph.approx = false; ph.scaleSrc = 'по линейке ' + fmt(cm) + ' см';
  ph.fine = 1; $('#fine').value = 100; $('#fineOut').textContent = '100%';
  const y = R.bottom * cv.height - 150 * ph.pxPerCm;
  ph.pos = {x:R.x, y:Math.min(.95, Math.max(.05, y / cv.height))};
  $('#rulerCm').blur(); hideRuler(); drawPhoto(); toast('Масштаб задан. Картина висит центром на 150 см от пола.');
});
async function leaveEdit(){ hideRuler(); await drawPhoto(); }

function canvasPt(e){ const r = cv.getBoundingClientRect(); return {x:(e.clientX - r.left) * cv.width / r.width, y:(e.clientY - r.top) * cv.height / r.height}; }
cv.addEventListener('pointerdown', e => {
  const q = canvasPt(e);
  if (onPainting(q)){
    ph.drag = {dx:q.x - ph.pos.x*cv.width, dy:q.y - ph.pos.y*cv.height}; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing';
  } else { ph.pos = {x:q.x/cv.width, y:q.y/cv.height}; drawPhoto(); }
});
cv.addEventListener('pointermove', e => { if (!ph.drag) return; const q = canvasPt(e);
  ph.pos = {x:(q.x - ph.drag.dx)/cv.width, y:(q.y - ph.drag.dy)/cv.height}; drawPhoto(); });
const endDrag = () => { ph.drag = null; cv.style.cursor = ''; };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

$('#roomFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const r = await fileToData(f, 2000); const im = await getImg(r.data);
    ph.room = im; ph.sample = false; ph.keys = {l:1, r:1, t:1, b:1}; ph.warp = null; showAngle(false);
    ph.pxPerCm = im.width / 350; ph.approx = true; ph.pos = {x:.5, y:.4}; ph.fine = 1; $('#fine').value = 100; $('#fineOut').textContent = '100%';
    updateScaleNote(); await drawPhoto(); R.top = .1; R.bottom = .9; showRuler();
    $('#stage').scrollIntoView({block:'start', behavior:'smooth'});
  } catch(err){ toast('Не получилось открыть это фото. Выберите JPG или PNG.'); }
});
$('#fine').addEventListener('input', e => { ph.fine = e.target.value/100; $('#fineOut').textContent = e.target.value + '%'; drawPhoto(); });
function saveBlob(blob){
  if (window.claude && window.claude.use){
    (async () => {
      let dl = null; try { dl = await window.claude.use('downloads'); } catch(e){}
      if (!dl){ toast('Здесь сохранение недоступно. Сделайте скриншот экрана.'); return; }
      try { await dl.save({filename:'primerka.jpg', data:blob}); }
      catch(err){ if (err && err.code !== 'declined') toast('Не удалось сохранить. Сделайте скриншот экрана.'); }
    })();
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'primerka.jpg'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$('#saveBtn').addEventListener('click', async () => {
  await leaveEdit();
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
  if (!blob){ toast('Не получилось подготовить картинку.'); return; }
  saveBlob(blob);
});

/* ---------- «Поделиться»: снимок с подписью и ссылкой на примерку этой картины ---------- */
function shareUrl(p){
  const page = (/^https:/.test(location.protocol) && !embeddedCheck()) ? location.href.split(/[?#]/)[0] : SITE_URL;
  return p ? page + '?work=' + encodeURIComponent(p.id) : page;
}
function fitText(x, text, maxW, size, font){
  let s = size; x.font = font(s);
  while (s > 10 && x.measureText(text).width > maxW){ s -= 1; x.font = font(s); }
}
function composeShare(src, p){
  const W = src.width, H = src.height, band = Math.round(Math.max(110, W * 0.1));
  const c = document.createElement('canvas'); c.width = W; c.height = H + band;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.fillStyle = '#221D2A'; x.fillRect(0, H, W, band);
  const pad = Math.round(band * 0.3), maxW = W - 2 * pad;
  const title = '«' + p.name + '», ' + fmt(p.w) + ' × ' + fmt(p.h) + ' см';
  x.fillStyle = '#FFFFFF'; fitText(x, title, maxW, Math.round(band * 0.27), s => s + 'px Prata, Georgia, serif');
  x.fillText(title, pad, H + band * 0.47);
  x.fillStyle = 'rgba(255,255,255,.72)';
  const link = 'Примерь у себя: ' + shareUrl(p).replace(/^https?:\/\//, '');
  fitText(x, link, maxW, Math.round(band * 0.17), s => '500 ' + s + 'px Manrope, sans-serif');
  x.fillText(link, pad, H + band * 0.8);
  return c;
}
let shareState = null;
async function openShare(src, p){
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch(e){} }
  const c = composeShare(src, p);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
  if (!blob){ toast('Не получилось подготовить картинку.'); return; }
  const file = new File([blob], 'primerka.jpg', {type:'image/jpeg'});
  let canFiles = false; try { canFiles = !!(navigator.canShare && navigator.canShare({files:[file]})); } catch(e){}
  shareState = {blob, file, p, url:shareUrl(p), canFiles};
  const img = $('#shareImg'); if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
  img.dataset.url = URL.createObjectURL(blob); img.src = img.dataset.url;
  $('#shareGo').hidden = !navigator.share;
  $('#shareNote').textContent = canFiles
    ? 'Отправь снимок тому, с кем выбираешь картину. Ссылка на примерку уже есть на картинке.'
    : navigator.share ? 'Этот браузер отправит только ссылку. Чтобы отправить снимок, сохрани картинку.'
    : 'Сохрани картинку и отправь её в мессенджере или скопируй ссылку на примерку.';
  const d = $('#shareDlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
}
$('#shareGo').addEventListener('click', async () => {
  if (!shareState) return;
  const p = shareState.p, title = '«' + p.name + '»';
  const text = 'Как тебе «' + p.name + '» у меня на стене? Примерь у себя: ' + shareState.url;
  try {
    if (shareState.canFiles) await navigator.share({files:[shareState.file], title, text});
    else await navigator.share({title, text, url:shareState.url});
  } catch(e){ if (!e || e.name !== 'AbortError') toast('Не получилось поделиться. Сохрани картинку.'); }
});
$('#shareSave').addEventListener('click', () => { if (shareState) saveBlob(shareState.blob); });
$('#shareCopy').addEventListener('click', () => {
  if (!shareState) return; const url = shareState.url;
  try { navigator.clipboard.writeText(url).then(() => toast('Ссылка скопирована.'), () => toast(url)); } catch(e){ toast(url); }
});
$('#shareDlg .share-close').addEventListener('click', () => { const d = $('#shareDlg'); if (!d.close) d.removeAttribute('open'); });
$('#shareBtn').addEventListener('click', () => {
  const p = cur(); if (!p){ toast('Сначала выберите картину.'); return; }
  leaveEdit().then(() => openShare(cv, p));
});

/* ---------- AR (WebXR) ---------- */
const SITE_URL = 'https://svtrubl.github.io/primerka/fit/';
function embeddedCheck(){ try { return window.top !== window.self; } catch(e){ return true; } }
function chromeBanner(){
  const ua = navigator.userAgent;
  if (!/Android/i.test(ua)) return;
  let embedded = false; try { embedded = window.top !== window.self; } catch(e){ embedded = true; }
  const isChrome = /Chrome\/\d/.test(ua) && !/YaBrowser|SamsungBrowser|EdgA|OPR\/|Firefox|MiuiBrowser|HeyTapBrowser|UCBrowser|Vivaldi|DuckDuckGo|; wv\)|Version\/\d/.test(ua);
  if (isChrome && !embedded) return;
  const url = /^https:/.test(location.protocol) && !embeddedCheck() ? location.href.split('#')[0] : SITE_URL;
  const noScheme = url.replace(/^https?:\/\//, '');
  $('#chromeLink').href = 'intent://' + noScheme + '#Intent;scheme=https;package=com.android.chrome;end';
  $('#siteAddr').textContent = 'Если кнопка не сработала, откройте Chrome и вставьте адрес: ' + url;
  $('#copyLink').onclick = () => {
    const done = () => toast('Адрес скопирован. Вставьте его в Chrome.');
    try { navigator.clipboard.writeText(url).then(done, () => toast(url)); } catch(e){ toast(url); }
  };
  $('#chromeBar').hidden = false;
}
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
async function checkXR(){
  const st = $('#arStatus'), btn = $('#arStart');
  let ok = false;
  try { ok = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-ar')); } catch(e){ ok = false; }
  if (ok){ btn.disabled = false; st.dataset.state = 'ok'; st.textContent = 'Телефон поддерживает примерку через камеру.'; return; }
  st.dataset.state = 'off';
  let embedded = false; try { embedded = window.top !== window.self; } catch(e){ embedded = true; }
  st.textContent = isIOS ? 'На iPhone браузеры пока не дают сайтам доступ к AR. Используйте примерку по фото.'
    : embedded ? 'В этом окне доступ к камере закрыт. Откройте сайт по прямому адресу в Chrome на Android-телефоне.'
    : 'Этот браузер не поддерживает AR. Нужен Chrome на Android-телефоне с «Сервисами Google Play для AR».';
}

/* AR rendering: plain WebGL + XRWebGLLayer (no library). Wall is set by two points on the plinth. */
let gl = null, U = {}, MESH = {}, whiteTex = null, shadowTex = null, ringTex = null;
let xrBinding = null, captureReq = false, fbo = null;
let session = null, refSpace = null, viewerSpace = null, xrLayer = null, hitSource = null, hitPending = false, aimState = null;
let step = 1, A = null, B = null, aim = null, wall = null, painting = null, shift = 0, hangH = 1.5, lastView = null, hintKey = '', infoAt = 0, aimMatrix = null;
const texCache = new Map();

const v3 = {
  add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
  scale:(a,s)=>[a[0]*s,a[1]*s,a[2]*s], dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
  len:a=>Math.hypot(a[0],a[1],a[2]), norm:a=>{ const l = Math.hypot(a[0],a[1],a[2]) || 1; return [a[0]/l,a[1]/l,a[2]/l]; }
};
function qRot(q, v){
  const ix = q.w*v[0] + q.y*v[2] - q.z*v[1], iy = q.w*v[1] + q.z*v[0] - q.x*v[2], iz = q.w*v[2] + q.x*v[1] - q.y*v[0], iw = -q.x*v[0] - q.y*v[1] - q.z*v[2];
  return [ix*q.w + iw*-q.x + iy*-q.z - iz*-q.y, iy*q.w + iw*-q.y + iz*-q.x - ix*-q.z, iz*q.w + iw*-q.z + ix*-q.y - iy*-q.x];
}
function mMul(a, b){ const o = new Float32Array(16); for (let c=0;c<4;c++) for (let r=0;r<4;r++){ let s=0; for (let k=0;k<4;k++) s += a[k*4+r]*b[c*4+k]; o[c*4+r] = s; } return o; }
function mBasis(pos, n){ const x = v3.norm(v3.cross([0,1,0], n)); return new Float32Array([x[0],x[1],x[2],0, 0,1,0,0, n[0],n[1],n[2],0, pos[0],pos[1],pos[2],1]); }
function mCols(x, y, z, t){ return new Float32Array([x[0],x[1],x[2],0, y[0],y[1],y[2],0, z[0],z[1],z[2],0, t[0],t[1],t[2],1]); }
function mTS(tx,ty,tz, sx,sy,sz){ return new Float32Array([sx,0,0,0, 0,sy,0,0, 0,0,sz,0, tx,ty,tz,1]); }
const ROT_FLOOR = new Float32Array([1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,0,0,1]);
const hexRgb = h => [parseInt(h.slice(1,3),16)/255, parseInt(h.slice(3,5),16)/255, parseInt(h.slice(5,7),16)/255];
const YELLOW = [1, .79, .3, 1], GREEN = [.27, .8, .5, 1];

function initGL(){
  const c = document.createElement('canvas');
  gl = c.getContext('webgl2', {xrCompatible:true, alpha:true, antialias:false}) || c.getContext('webgl', {xrCompatible:true, alpha:true, antialias:false});
  if (!gl) throw new Error('WebGL недоступен');
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, `
    attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUv;
    uniform mat4 uP; uniform mat4 uV; uniform mat4 uM;
    varying vec2 vUv; varying float vL;
    void main(){ vUv = aUv; vec3 n = normalize((uM * vec4(aNor, 0.0)).xyz);
      vL = 0.7 + 0.3 * max(dot(n, normalize(vec3(0.3, 0.8, 0.5))), 0.0);
      gl_Position = uP * uV * uM * vec4(aPos, 1.0); }`));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `
    precision mediump float; varying vec2 vUv; varying float vL;
    uniform sampler2D uT; uniform vec4 uC; uniform float uLit;
    void main(){ vec4 t = texture2D(uT, vUv) * uC; gl_FragColor = vec4(t.rgb * mix(1.0, vL, uLit), t.a); }`));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  ['uP','uV','uM','uT','uC','uLit'].forEach(n => U[n] = gl.getUniformLocation(prog, n));
  U.aPos = gl.getAttribLocation(prog, 'aPos'); U.aNor = gl.getAttribLocation(prog, 'aNor'); U.aUv = gl.getAttribLocation(prog, 'aUv');
  const mk = (P, I) => { const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P), gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.STATIC_DRAW); return {vb, ib, n:I.length}; };
  MESH.quad = mk([-.5,-.5,0, 0,0,1, 0,0,  .5,-.5,0, 0,0,1, 1,0,  .5,.5,0, 0,0,1, 1,1,  -.5,.5,0, 0,0,1, 0,1], [0,1,2, 0,2,3]);
  const P = [], I = [];
  [[0,0,1],[0,0,-1],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]].forEach(n => {
    const u = Math.abs(n[1]) > .5 ? [1,0,0] : [0,1,0]; const w = v3.cross(n, u); const b = P.length/8;
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([a,c]) => P.push(.5*(n[0]+a*w[0]+c*u[0]), .5*(n[1]+a*w[1]+c*u[1]), .5*(n[2]+a*w[2]+c*u[2]), n[0],n[1],n[2], (a+1)/2,(c+1)/2));
    I.push(b,b+1,b+2, b,b+2,b+3);
  });
  MESH.cube = mk(P, I);
  gl.uniform1i(U.uT, 0); gl.activeTexture(gl.TEXTURE0);
  gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.CULL_FACE);
  const w1 = document.createElement('canvas'); w1.width = w1.height = 2; const wx = w1.getContext('2d'); wx.fillStyle = '#fff'; wx.fillRect(0,0,2,2); whiteTex = makeTex(w1);
  const s = document.createElement('canvas'); s.width = s.height = 256; const sx = s.getContext('2d');
  sx.shadowColor = '#000'; sx.shadowBlur = 28; sx.fillStyle = '#000'; sx.fillRect(38,38,180,180); shadowTex = makeTex(s);
  const r = document.createElement('canvas'); r.width = r.height = 128; const rx = r.getContext('2d');
  rx.strokeStyle = '#fff'; rx.lineWidth = 14; rx.beginPath(); rx.arc(64,64,52,0,Math.PI*2); rx.stroke();
  rx.fillStyle = '#fff'; rx.beginPath(); rx.arc(64,64,12,0,Math.PI*2); rx.fill(); ringTex = makeTex(r);
}
function makeTex(src){
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function drawMesh(mesh, model, tex, color, lit){
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
  gl.enableVertexAttribArray(U.aPos); gl.vertexAttribPointer(U.aPos, 3, gl.FLOAT, false, 32, 0);
  if (U.aNor >= 0){ gl.enableVertexAttribArray(U.aNor); gl.vertexAttribPointer(U.aNor, 3, gl.FLOAT, false, 32, 12); }
  gl.enableVertexAttribArray(U.aUv); gl.vertexAttribPointer(U.aUv, 2, gl.FLOAT, false, 32, 24);
  gl.uniformMatrix4fv(U.uM, false, model); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform4fv(U.uC, color); gl.uniform1f(U.uLit, lit);
  gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
}
function drawPainting(o, pos, n, op){
  const p = o.p, f = FRAMES[p.frame] || FRAMES.none, ou = outer(p), cm = 0.01;
  const ow = ou.w*cm, oh = ou.h*cm, depth = f.w ? 0.03 : 0.02, base = mBasis(v3.add(pos, v3.scale(n, 0.004)), n);
  gl.depthMask(false);
  drawMesh(MESH.quad, mMul(base, mTS(0, -oh*0.025, 0.002, ow*1.3, oh*1.3, 1)), shadowTex, [1,1,1,0.5*op], 0);
  gl.depthMask(true);
  if (!p.cutout) drawMesh(MESH.cube, mMul(base, mTS(0, 0, depth/2, ow, oh, depth)), whiteTex, [...hexRgb(f.color || '#2a2a2a'), op], 1);
  if (f.mat) drawMesh(MESH.quad, mMul(base, mTS(0, 0, depth + 0.0008, (p.w + 2*f.mat)*cm, (p.h + 2*f.mat)*cm, 1)), whiteTex, [0.957,0.953,0.937,op], 0);
  drawMesh(MESH.quad, mMul(base, mTS(0, 0, depth + 0.0016, p.w*cm, p.h*cm, 1)), o.tex || whiteTex, [1,1,1,op], 0);
}
function drawPin(pt, color){
  drawMesh(MESH.quad, mMul(mTS(pt[0], pt[1] + 0.002, pt[2], 1,1,1), mMul(ROT_FLOOR, mTS(0,0,0, .12,.12,1))), ringTex, color, 0);
  drawMesh(MESH.cube, mTS(pt[0], pt[1] + 0.15, pt[2], .012, .3, .012), whiteTex, color, 1);
  drawMesh(MESH.cube, mTS(pt[0], pt[1] + 0.3, pt[2], .04, .04, .04), whiteTex, color, 1);
}
function drawLine(a, b, color){
  const d = v3.sub(b, a); d[1] = 0; if (v3.len(d) < 0.01) return;
  const side = v3.scale(v3.norm([-d[2], 0, d[0]]), 0.012);
  const mid = v3.scale(v3.add(a, b), 0.5); mid[1] += 0.003;
  drawMesh(MESH.quad, mCols(d, side, [0,1,0], mid), whiteTex, color, 0);
}
function wallFrom(a, c){
  const d = v3.sub(c, a); d[1] = 0; const L = v3.len(d); if (L < 0.2) return null;
  const dir = v3.norm(d); let n = [-dir[2], 0, dir[0]];
  const mid = v3.scale(v3.add(a, c), 0.5);
  if (lastView && v3.dot(n, v3.sub(lastView.pos, mid)) < 0) n = v3.scale(n, -1);
  return {mid, dir, n, baseY: mid[1]};
}
function wallPos(w, sh){ const p = v3.add(w.mid, v3.scale(w.dir, sh)); p[1] = w.baseY + hangH; return p; }
function drawScene(clean){
  gl.enable(gl.DEPTH_TEST);
  if (step === 3 && wall && painting) drawPainting(painting, wallPos(wall, shift), wall.n, 1);
  if (step === 2 && aim && painting){ const w = wallFrom(A, aim); if (w) drawPainting(painting, wallPos(w, 0), w.n, .55); }
  gl.disable(gl.DEPTH_TEST);
  if (clean) return;
  if (A) drawPin(A, GREEN);
  if (B) drawPin(B, GREEN);
  if (step === 2 && A && aim) drawLine(A, aim, [1, .79, .3, .9]);
  if (step === 3 && A && B) drawLine(A, B, [.27, .8, .5, .8]);
  if (step < 3 && aimMatrix) drawMesh(MESH.quad, mMul(aimMatrix, mMul(ROT_FLOOR, mTS(0,0,0, .12,.12,1))), ringTex, [1,.79,.3,.9], 0);
}

function texFor(o){
  const src = o.p.img;
  if (texCache.has(src)){ o.tex = texCache.get(src); return; }
  getImg(src).then(im => { if (!gl) return; const t = texCache.get(src) || makeTex(im); texCache.set(src, t); o.tex = t; }).catch(() => {});
}
function setPainting(p){ painting = {p, tex:null}; texFor(painting); updateXrInfo(); renderXrStrip(); }
function setHint(key, text){ if (key === hintKey) return; hintKey = key; $('#xrHint').textContent = text; }
function setAim(st){ if (st === aimState) return; aimState = st; $('#xrAim').dataset.state = st; }
function flash(text, kind, ms){
  const el = $('#xrFlash'); el.textContent = text; el.dataset.kind = kind || 'ok'; el.hidden = false;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(flash.t); flash.t = setTimeout(() => { el.hidden = true; }, ms || 1800);
  try { if (navigator.vibrate) navigator.vibrate(kind === 'warn' ? [40, 60, 40] : 35); } catch(e){}
}
function updateSteps(){
  const s1 = $('#xrStep1'), s2 = $('#xrStep2');
  s1.dataset.s = step === 1 ? 'current' : 'done'; s2.dataset.s = step === 1 ? 'todo' : step === 2 ? 'current' : 'done';
  s1.querySelector('i').textContent = step > 1 ? '✓' : '1'; s2.querySelector('i').textContent = step > 2 ? '✓' : '2';
  ['#xrLeft','#xrRight','#xrUp','#xrDown','#xrShare'].forEach(q => $(q).disabled = step !== 3);
}
function updateXrInfo(){
  const el = $('#xrInfo'); if (!painting){ el.textContent = 'Выберите картину ниже.'; return; }
  const o = outer(painting.p);
  let extra = 'Центр на высоте <span class="mono">' + Math.round(hangH*100) + ' см</span> от пола.';
  if (step === 3 && Math.abs(shift) > 0.001) extra += ' Сдвиг <span class="mono">' + Math.round(Math.abs(shift)*100) + ' см</span>.';
  el.innerHTML = '<b></b> · <span class="mono">' + fmt(o.w) + ' × ' + fmt(o.h) + ' см</span><br>' + extra;
  el.querySelector('b').textContent = painting.p.name;
}
function requestHit(s, vp){
  hitPending = true;
  let req;
  try { const dy = -0.2 / vp.views[0].projectionMatrix[5];
    req = s.requestHitTestSource({space:viewerSpace, offsetRay:new XRRay({x:0,y:0,z:0,w:1}, {x:0,y:dy,z:-1,w:0})}); $('#xrAim').style.top = '60%'; $('#xrFlash').style.top = '60%'; }
  catch(e){ req = Promise.reject(e); }
  req.then(h => { hitSource = h; }).catch(() => { $('#xrAim').style.top = '50%'; $('#xrFlash').style.top = '50%'; return s.requestHitTestSource({space:viewerSpace}).then(h => { hitSource = h; }); });
}
function onSelect(){
  if (step === 1){
    if (!aim){ flash('Прицел не на полу', 'warn'); return; }
    A = aim.slice(); step = 2; hintKey = ''; flash('✓ Точка 1 зафиксирована'); updateSteps();
  } else if (step === 2){
    if (!aim){ flash('Прицел не на полу', 'warn'); return; }
    const d = v3.sub(aim, A); d[1] = 0;
    if (v3.len(d) < 0.3){ flash('Слишком близко к точке 1. Нужно 30 см и больше', 'warn'); return; }
    B = aim.slice(); wall = wallFrom(A, B); step = 3; shift = 0; hintKey = '';
    flash('✓ Точка 2 зафиксирована. Картина на стене'); updateSteps(); updateXrInfo();
  }
}
function onXRFrame(t, frame){
  const s = frame.session; s.requestAnimationFrame(onXRFrame);
  const vp = frame.getViewerPose(refSpace);
  if (vp){ const tp = vp.transform.position, to = vp.transform.orientation; lastView = {pos:[tp.x,tp.y,tp.z], q:{x:to.x,y:to.y,z:to.z,w:to.w}}; }
  if (vp && !hitSource && !hitPending && viewerSpace) requestHit(s, vp);
  aim = null; aimMatrix = null;
  if (hitSource && lastView){
    for (const r of frame.getHitTestResults(hitSource)){
      const pose = r.getPose(refSpace); if (!pose) continue;
      const m = pose.transform.matrix;
      if (m[5] > 0.75 && m[13] < lastView.pos[1] - 0.4){ aim = [m[12], m[13], m[14]]; aimMatrix = new Float32Array(m); break; }
    }
  }
  setAim(step === 3 ? 'off' : aim ? 'floor' : '');
  if (step === 1) setHint(aim ? 'a1' : 'n1', aim ? 'Шаг 1. Поставьте прицел на плинтус чуть левее будущей картины и нажмите на экран' : 'Наведите прицел на пол у стены и медленно поводите телефоном');
  else if (step === 2) setHint(aim ? 'a2' : 'n2', aim ? 'Шаг 2. Теперь прицел на плинтус правее, на 30 см и дальше, и нажмите' : 'Наведите прицел на плинтус правее первой точки');
  else setHint('done', 'Готово. Двигайте картину кнопками или выберите другую');
  gl.bindFramebuffer(gl.FRAMEBUFFER, xrLayer.framebuffer);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (vp) for (const view of vp.views){
    const v = xrLayer.getViewport(view); gl.viewport(v.x, v.y, v.width, v.height);
    gl.uniformMatrix4fv(U.uP, false, view.projectionMatrix); gl.uniformMatrix4fv(U.uV, false, view.transform.inverse.matrix);
    drawScene();
  }
  if (captureReq && vp){ captureReq = false; finishCapture(captureFrame(vp.views[0])); }
}

/* Снимок из камеры вместе с картиной (Chrome: WebXR camera-access).
   Если телефон не отдаёт кадр камеры, подсказываем сделать скриншот. */
const IDENT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
function captureFrame(view){
  try {
    if (!xrBinding || !view.camera) return null;
    const cam = view.camera, tex = xrBinding.getCameraImage(cam);
    if (!tex) return null;
    const w = cam.width, h = cam.height;
    if (!fbo || fbo.w !== w || fbo.h !== h){
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      fbo = {f, w, h};
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.f); gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.uniformMatrix4fv(U.uP, false, IDENT); gl.uniformMatrix4fv(U.uV, false, IDENT);
    drawMesh(MESH.quad, mTS(0, 0, 0, 2, 2, 1), tex, [1,1,1,1], 0);
    gl.uniformMatrix4fv(U.uP, false, view.projectionMatrix); gl.uniformMatrix4fv(U.uV, false, view.transform.inverse.matrix);
    drawScene(true);
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, xrLayer.framebuffer);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), id = x.createImageData(w, h), row = w * 4;
    for (let y = 0; y < h; y++) id.data.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    for (let i = 3; i < id.data.length; i += 4) id.data[i] = 255;
    x.putImageData(id, 0, 0);
    return c;
  } catch(e){
    try { gl.bindFramebuffer(gl.FRAMEBUFFER, xrLayer.framebuffer); } catch(_){}
    return null;
  }
}
function finishCapture(shot){
  if (!shot){ flash('Сделай скриншот: кнопки питания и громкости вниз вместе', 'warn', 4500); return; }
  const p = painting && painting.p;
  if (session) session.end();
  if (p) openShare(shot, p);
}
function renderXrStrip(){
  const s = $('#xrStrip'); if (!s) return; s.textContent = '';
  const ap = painting && painting.p;
  state.paintings.forEach(p => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', p.name); b.setAttribute('aria-pressed', ap === p);
    const im = document.createElement('img'); im.src = p.img; im.alt = ''; b.appendChild(im);
    b.onclick = () => { if (session) setPainting(p); }; s.appendChild(b);
  });
}
function resetPoints(){ step = 1; A = null; B = null; wall = null; shift = 0; hintKey = ''; updateSteps(); updateXrInfo(); }
async function startAR(){
  const overlay = $('#xrOverlay'); overlay.hidden = false;
  try {
    session = await navigator.xr.requestSession('immersive-ar', {requiredFeatures:['hit-test'], optionalFeatures:['dom-overlay','camera-access'], domOverlay:{root:overlay}});
  } catch(e){
    overlay.hidden = true; session = null;
    toast('Камера не запустилась. Проверьте, что Chrome разрешён доступ к камере и установлены «Сервисы Google Play для AR».'); return;
  }
  try {
    if (!gl) initGL();
    if (gl.makeXRCompatible) await gl.makeXRCompatible();
    xrLayer = new XRWebGLLayer(session, gl, {alpha:true, antialias:true});
    session.updateRenderState({baseLayer:xrLayer});
    xrBinding = null;
    try { if (window.XRWebGLBinding) xrBinding = new XRWebGLBinding(session, gl); } catch(e){ xrBinding = null; }
    refSpace = await session.requestReferenceSpace('local');
    viewerSpace = await session.requestReferenceSpace('viewer');
  } catch(e){
    toast('Не удалось запустить графику: ' + (e && e.message || e)); try { session.end(); } catch(_){} return;
  }
  hitSource = null; hitPending = false; aimState = null; hangH = 1.5; resetPoints();
  session.addEventListener('select', onSelect);
  session.addEventListener('end', onEnd);
  session.requestAnimationFrame(onXRFrame);
  const p = cur(); if (p) setPainting(p);
}
function onEnd(){
  captureReq = false; xrBinding = null; fbo = null; hitSource = null; hitPending = false; viewerSpace = null; aimState = null; session = null; xrLayer = null; lastView = null; painting = null;
  A = B = wall = aim = aimMatrix = null; step = 1;
  $('#xrOverlay').hidden = true;
}
['#xrPanel', '.xr-top'].forEach(q => $(q).addEventListener('beforexrselect', e => e.preventDefault()));
$('#arStart').addEventListener('click', startAR);
$('#xrExit').addEventListener('click', () => { if (session) session.end(); });
function slide(d){
  if (step !== 3 || !lastView) return;
  const right = qRot(lastView.q, [1,0,0]); const sgn = v3.dot(wall.dir, right) >= 0 ? 1 : -1;
  shift += sgn*d; updateXrInfo();
}
$('#xrLeft').addEventListener('click', () => slide(-0.05));
$('#xrRight').addEventListener('click', () => slide(0.05));
$('#xrUp').addEventListener('click', () => { hangH = Math.min(3, hangH + 0.05); updateXrInfo(); });
$('#xrDown').addEventListener('click', () => { hangH = Math.max(0.3, hangH - 0.05); updateXrInfo(); });
$('#xrShare').addEventListener('click', () => { if (step === 3) captureReq = true; });
$('#xrReset').addEventListener('click', () => { resetPoints(); flash('Точки сброшены. Начните с первой', 'warn'); });

/* ---------- boot ---------- */
updateScaleNote(); checkXR(); chromeBanner();
loadCatalog().catch(() => toast('Не получилось загрузить список картин. Обновите страницу.'))
  .then(() => { restore(); renderAll(); });
})();
