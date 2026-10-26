(function(){
const IMG = {
  rage:'../img/works/yarost-mladentsa.jpg',
  light:'../img/works/vnutrenniy-svet.jpg',
  joy:'../img/works/naslazhdenie.jpg'
};
const SITE = window.SITE || {};

const MOODS = {
  rage:  { name:"Ярость", work:"Ярость младенца", slug:"yarost-mladentsa", size:"90 × 60 см, масло", img:IMG.rage,
           colors:["#5E0B17","#B8321F","#E0692F","#1A0E10","#F2C14E"],
           text:"Черновик текста. Сила, которой тесно внутри. Она не плохая, она живая.",
           card:"#3B0A12" },
  pain:  { name:"Боль", work:"Работа с китом и спиралью", slug:"", size:"60 × 90 см, масло",
           colors:["#0F2A44","#2F5D7C","#8FB3C9","#16161F","#C9D9E3"],
           text:"Черновик текста. Глубина, в которую погружаешься, когда вспоминаешь прожитое.",
           card:"#0E1F33" },
  light: { name:"Внутренний свет", work:"Внутренний свет", slug:"vnutrenniy-svet", size:"30 × 40 см, масло", img:IMG.light,
           colors:["#E9C46A","#F4E3B2","#6A8F4E","#2D3B2A","#FFF6DA"],
           text:"Черновик текста. Тихая опора внутри, из которой что-то начинает расти.",
           card:"#2A3424" },
  joy:   { name:"Наслаждение", work:"Наслаждение", slug:"naslazhdenie", size:"60 × 90 см, масло", img:IMG.joy,
           colors:["#F2B5C4","#5FA8B5","#2B5F73","#FBE3E8","#E98AA3"],
           text:"Черновик текста. Нежное касание, которое замечаешь, когда оно уже улетело.",
           card:"#24505F" }
};
const KEYS = ["rage","pain","light","joy"];

const QUESTIONS = [
  { q:"Какое у тебя сегодня утро?", a:{ rage:"Сжатые кулаки", pain:"Тяжёлое, как вода на глубине", light:"Тихое, с полоской света", joy:"Медленное, хочется его продлить" } },
  { q:"Если бы твоё чувство было цветом?", swatch:true, a:{ rage:"Горячий", pain:"Глубокий", light:"Тёплый", joy:"Нежный" } },
  { q:"Чего сейчас хочется больше всего?", a:{ rage:"Кричать или что-то сломать", pain:"Чтобы кто-то просто побыл рядом", light:"Опереться на себя", joy:"Раствориться в моменте" } },
  { q:"Где тебе хочется оказаться?", a:{ rage:"Под ливнем и громом", pain:"На глубине океана", light:"В саду на рассвете", joy:"В тёплой воде" } },
  { q:"Какое слово ближе?", a:{ rage:"Огонь", pain:"Глубина", light:"Росток", joy:"Касание" } }
];

/* Простой генератор «мазков» — макет вместо фото картины */
function rng(seed){ let s = seed>>>0 || 1; return ()=> (s = (s*1664525+1013904223)>>>0) / 4294967296; }
function paint(cv, key, seed=7){
  const m = MOODS[key], ctx = cv.getContext("2d"), W = cv.width, H = cv.height, r = rng(seed + key.length*97);
  ctx.fillStyle = m.colors[3]; ctx.fillRect(0,0,W,H);
  const g = ctx.createLinearGradient(0,0,W,H);
  g.addColorStop(0,m.colors[1]); g.addColorStop(1,m.colors[3]);
  ctx.globalAlpha = .7; ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  const n = 260;
  for(let i=0;i<n;i++){
    const c = m.colors[Math.floor(r()*m.colors.length)];
    ctx.globalAlpha = .12 + r()*.35;
    ctx.strokeStyle = c; ctx.lineCap = "round";
    ctx.lineWidth = (W/40) * (0.3 + r()*1.6);
    let x = r()*W, y = r()*H;
    const ang = (key==="rage" ? -0.6 : key==="pain" ? (i%2? .2:-.2) : key==="light" ? -1.5 : 0.1) + (r()-.5)*1.2;
    const len = W*(0.08 + r()*0.25);
    ctx.beginPath(); ctx.moveTo(x,y);
    ctx.quadraticCurveTo(x+Math.cos(ang+.4)*len*.5, y+Math.sin(ang+.4)*len*.5, x+Math.cos(ang)*len, y+Math.sin(ang)*len);
    ctx.stroke();
  }
  ctx.globalAlpha = .9; ctx.fillStyle = m.colors[4];
  ctx.beginPath(); ctx.arc(W*(.35+r()*.3), H*(.3+r()*.3), W*(.05+r()*.06), 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
}

const app = document.getElementById("app");
let step = -1, score = {};

function h(html){ const d=document.createElement("div"); d.className="screen"; d.innerHTML=html; return d; }

function intro(){
  app.innerHTML = "";
  const s = h(`
    <h1>Какое ты чувство сегодня?</h1>
    <p class="lead">Пять коротких вопросов. В конце ты увидишь картину, в которой уже живёт твоё чувство.</p>
    <div class="strip">${KEYS.map(k=>MOODS[k].img?`<img src="${MOODS[k].img}" alt="${MOODS[k].work}">`:`<canvas width="200" height="300" data-k="${k}" aria-label="Макет картины: ${MOODS[k].name}"></canvas>`).join("")}</div>
    <button class="btn" id="go">Начать</button>`);
  app.appendChild(s);
  s.querySelectorAll("canvas").forEach(c=>paint(c,c.dataset.k));
  s.querySelector("#go").onclick = ()=>{ step=0; score={}; question(); };
}

function question(){
  const Q = QUESTIONS[step];
  const order = KEYS.slice().sort((a,b)=> ((a.charCodeAt(1)*(step+3))%7) - ((b.charCodeAt(1)*(step+3))%7));
  app.innerHTML = "";
  const s = h(`
    <div class="progress">${QUESTIONS.map((_,i)=>`<span class="${i<=step?"on":""}"></span>`).join("")}</div>
    <div class="qnum">Вопрос ${step+1} из ${QUESTIONS.length}</div>
    <h2>${Q.q}</h2>
    <div class="opts ${Q.swatch?"swatches":""}">
      ${order.map(k=>`<button class="opt" id="opt-${step}-${k}" data-k="${k}">${Q.swatch?`<span class="sw" style="background:linear-gradient(135deg,${MOODS[k].colors[0]},${MOODS[k].colors[1]} 60%,${MOODS[k].colors[2]})"></span>`:""}${Q.a[k]}</button>`).join("")}
    </div>`);
  app.appendChild(s);
  s.querySelectorAll(".opt").forEach(b=> b.onclick = ()=>{
    const k=b.dataset.k; score[k]=(score[k]||0)+1; score._last=k;
    step++; step<QUESTIONS.length ? question() : result();
  });
  s.querySelector(".opt").focus({preventScroll:true});
}

function winner(){
  let best=null, bv=-1;
  KEYS.forEach(k=>{ const v=score[k]||0; if(v>bv || (v===bv && k===score._last)){best=k;bv=v;} });
  return best;
}

function storyCard(key,photo){
  const m=MOODS[key], cv=document.createElement("canvas"); cv.width=1080; cv.height=1920;
  const ctx=cv.getContext("2d");
  ctx.fillStyle=m.card; ctx.fillRect(0,0,1080,1920);
  let art=photo;
  if(!art){ art=document.createElement("canvas"); art.width=760; art.height=1140; paint(art,key); }
  const aw=art.naturalWidth||art.width, ah=art.naturalHeight||art.height;
  const sc=Math.min(900/aw,1140/ah), dw=aw*sc, dh=ah*sc, dx=(1080-dw)/2, dy=330+(1140-dh)/2;
  ctx.save(); ctx.shadowColor="rgba(0,0,0,.45)"; ctx.shadowBlur=60; ctx.shadowOffsetY=30;
  ctx.drawImage(art,dx,dy,dw,dh); ctx.restore();
  ctx.fillStyle="rgba(255,255,255,.75)"; ctx.font="500 40px Manrope, sans-serif"; ctx.textAlign="center";
  ctx.fillText("Моё чувство сегодня —",540,180);
  ctx.fillStyle="#fff"; ctx.font="84px Prata, Georgia, serif"; ctx.fillText(m.name,540,275);
  ctx.font="500 38px Manrope, sans-serif"; ctx.fillStyle="rgba(255,255,255,.85)";
  ctx.fillText("Какое ты чувство сегодня?",540,1620);
  ctx.font="500 34px Manrope, sans-serif"; ctx.fillStyle="rgba(255,255,255,.6)";
  ctx.fillText(SITE.short || "ссылка в профиле художника",540,1680);
  return cv.toDataURL("image/png");
}

function result(){
  const k=winner(), m=MOODS[k];
  app.innerHTML="";
  const s=h(`
    <div class="progress">${QUESTIONS.map(()=>`<span class="on"></span>`).join("")}</div>
    <div class="section">
      <p class="meta">Твоё чувство сегодня</p>
      <h1>${m.name}</h1>
    </div>
    <div class="frame">
      ${m.img?`<img class="result-art" src="${m.img}" alt="${m.work}">`:`<canvas class="result-art" width="600" height="900" aria-label="Макет картины ${m.work}"></canvas>
      <span class="tag">Макет — здесь будет фото</span>`}
    </div>
    <div class="section">
      <h2>«${m.work}»</h2>
      <div class="meta">${m.size}</div>
      <p>${m.text}</p>
      <p class="note">Ты не одна и не один в том, что чувствуешь. Кто-то уже прожил это и написал красками.</p>
    </div>
    <div class="row">
      ${m.slug?`<a class="btn" href="../works/${m.slug}/">Посмотреть работу</a>`:""}
      ${m.slug?`<a class="btn ghost" href="../fit/?work=${m.slug}">Примерить у себя на стене</a>`:""}
      ${SITE.contact?`<a class="btn ghost" href="${SITE.contact}" target="_blank" rel="noopener">Написать художнику</a>`:""}
    </div>
    <div class="section">
      <h2>Карточка для сторис</h2>
      <p class="meta">Нажми и удерживай картинку, чтобы сохранить её и поделиться.</p>
      <img class="card-img" alt="Карточка для сторис: ${m.name}" id="card">
    </div>
    <button class="btn ghost" id="again">Пройти ещё раз</button>`);
  app.appendChild(s);
  if(!m.img) paint(s.querySelector(".result-art"),k);
  const set=(art)=>{ s.querySelector("#card").src=storyCard(k,art); };
  const fontsReady=(document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  if(m.img){ const im=new Image(); im.onload=()=>fontsReady.then(()=>set(im)); im.src=m.img; }
  else fontsReady.then(()=>set(null));
  s.querySelector("#again").onclick=intro;
  window.scrollTo({top:0});
}


intro();
})();
