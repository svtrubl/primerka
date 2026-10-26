#!/usr/bin/env python3
"""Сборка сайта «Светлана — авторская живопись».

Берёт works.json и собирает статичные страницы:
  index.html            главная
  works/index.html      все работы
  works/<slug>/         страница каждой работы
  mood/index.html       опрос «Какое ты чувство сегодня?»
  fit/index.html        примерка (fit/?work=<slug> сразу открывает нужную картину)
  404.html
и картинки-превью для ссылок в ВК и Telegram (img/og/*.jpg).

Запуск из корня сайта:  python3 _tools/build.py
Папка _tools на сайте не публикуется (GitHub Pages пропускает папки с «_»).
"""
import html, json, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTS = Path(os.environ.get("SITE_FONTS", str(Path.home() / ".fonts")))

# ---- настройки сайта: поменять здесь и пересобрать ----
SITE = {
    # Полный адрес сайта со слешем на конце. При переезде на свой домен — заменить.
    "base": "https://svtrubl.github.io/primerka/",
    "name": "Светлана",
    "tagline": "авторская живопись",
    # Ссылки для «Написать художнику» и подвала. Пустая строка — кнопка не показывается.
    "contact": "",       # куда ведёт «Написать художнику» (например, личка ВК)
    "vk": "",
    "instagram": "",
    "year": 2026,
}

esc = lambda s: html.escape(str(s), quote=True)


def fmt_cm(w, h):
    return f"{w} × {h} см"


def load_works():
    data = json.loads((ROOT / "works.json").read_text(encoding="utf-8"))
    return [w for w in data["works"] if not w.get("hidden")]  # "hidden": true — работа снята с сайта, но не удалена


# ---------------------------------------------------------------- каркас страницы
def page(*, path, depth, title, desc, og, body, css=(), js=(), active="", body_class="", root=None):
    root = root if root is not None else "../" * depth
    url = SITE["base"] + path
    og_url = SITE["base"] + f"img/og/{og}.jpg"
    nav_items = [("works", "Работы", "works/"), ("mood", "Какое ты чувство", "mood/"), ("fit", "Примерка", "fit/")]
    nav = "".join(
        f'<a href="{root}{href}"{" aria-current=\"page\"" if key == active else ""}>{label}</a>'
        for key, label, href in nav_items
    )
    links = [(SITE["vk"], "ВКонтакте"), (SITE["instagram"], "Instagram")]
    contacts = "".join(f'<a href="{esc(u)}" target="_blank" rel="noopener">{t}</a>' for u, t in links if u)
    site_js = json.dumps({"contact": SITE["contact"], "short": "ссылка в профиле художника"}, ensure_ascii=False)
    css_tags = "".join(f'\n<link rel="stylesheet" href="{root}assets/{c}">' for c in css)
    js_tags = "".join(f'\n<script src="{root}assets/{j}" defer></script>' for j in js)
    return f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{esc(SITE['name'])} — {esc(SITE['tagline'])}">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{esc(url)}">
<meta property="og:image" content="{esc(og_url)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ECE9EF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16131B" media="(prefers-color-scheme: dark)">
<link rel="icon" href="{root}assets/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Prata&family=Manrope:wght@400;500;600&display=swap">
<link rel="stylesheet" href="{root}assets/style.css">{css_tags}
<script>window.SITE = {site_js};</script>{js_tags}
</head>
<body{f' class="{body_class}"' if body_class else ''}>
<header class="site-head">
  <div class="wrap">
    <a class="logo" href="{root or './'}"><b>{esc(SITE['name'])}</b><span>{esc(SITE['tagline'])}</span></a>
    <nav class="nav" aria-label="Разделы">{nav}</nav>
  </div>
</header>
{body}
<footer class="site-foot">
  <div class="wrap">
    <span>© {SITE['year']} {esc(SITE['name'])}, {esc(SITE['tagline'])}</span>
    {f'<span class="contacts">{contacts}</span>' if contacts else ''}
  </div>
</footer>
</body>
</html>
"""


def piece(w, root, link=True, label=True):
    """Картина на стене в общем масштабе (--k пикселей на сантиметр)."""
    img = f'<span class="canvas"><img src="{root}{esc(w["img"])}" alt="{esc(w["title"])}" loading="lazy"></span>'
    tag = f'<span class="tag"><b>{esc(w["title"])}</b>{w["technique"].lower()}, {fmt_cm(w["w"], w["h"])}</span>' if label else ""
    tagname, href = ("a", f' href="{root}works/{w["slug"]}/"') if link else ("div", "")
    return f'<{tagname} class="piece"{href} style="--w:{w["w"]};--h:{w["h"]}">{img}{tag}</{tagname}>'


def contact_button(cls="button quiet"):
    if not SITE["contact"]:
        return ""
    return f'<a class="{cls}" href="{esc(SITE["contact"])}" target="_blank" rel="noopener">Написать художнику</a>'


# ---------------------------------------------------------------- страницы
def build_home(works):
    hang = "".join(piece(w, "") for w in works)
    by = {w["slug"]: w for w in works}
    light = by.get("vnutrenniy-svet", works[0])
    thumbs = "".join(f'<img src="{esc(w["img"])}" alt="" loading="lazy">' for w in works[:3])
    body = f"""<main>
<section class="wrap hero">
  <h1 class="hero-title">Картины о&nbsp;том, что живёт внутри каждого</h1>
  <p class="lead">Ты не один в том, что чувствуешь. Кто-то уже прожил это и написал красками.</p>
</section>

<section class="wrap" aria-label="Работы">
  <div class="wall"><div class="hang">{hang}</div></div>
  <div class="under-wall">
    <p class="scale-note">Работы показаны в одном масштабе, поэтому видно, какая из них больше.</p>
    <a class="text-link" href="works/">Все работы</a>
  </div>
</section>

<section class="wrap doors" aria-label="Попробовать">
  <a class="door" href="mood/">
    <span class="door-art thumbs">{thumbs}</span>
    <h2>Какое ты чувство сегодня?</h2>
    <p>Пять коротких вопросов, и ты увидишь картину, в которой живёт твоё чувство. Карточку с ней можно сразу отправить в сторис.</p>
    <span class="door-go">Пройти опрос</span>
  </a>
  <a class="door" href="fit/">
    <span class="door-art mini-wall"><img src="{esc(light['img'])}" alt="" loading="lazy"></span>
    <h2>Примерить картину у себя на стене</h2>
    <p>Картина в натуральную величину у тебя дома: через камеру телефона или на фото комнаты.</p>
    <span class="door-go">Примерить</span>
  </a>
</section>

<section class="wrap about" aria-labelledby="about-h">
  <h2 id="about-h">О художнике</h2>
  <div class="about-text">
    <p>Меня зовут Светлана. Я пишу маслом девушек и природу, а через них — чувства, которые трудно назвать словами: ярость, боль, свет, наслаждение.</p>
    <p>До живописи я прошла путь от бригадира до руководителя производства. Поэтому знаю: красивая картина складывается из простых шагов, шаг за шагом.</p>
  </div>
</section>
</main>
<script>
/* старые ссылки вида …/primerka/#mood и #fit ведут на новые страницы */
(function(){{ var m = {{'#mood':'mood/','#fit':'fit/'}}[location.hash]; if (m) location.replace(m); }})();
</script>"""
    return page(path="", depth=0, title=f"{SITE['name']} — {SITE['tagline']}",
                desc="Картины маслом о том, что живёт внутри каждого. Опрос «Какое ты чувство сегодня?» и примерка картины у себя на стене.",
                og="home", body=body, css=["home.css"])


def build_works(works):
    hang = "".join(piece(w, "../") for w in works)
    body = f"""<main class="wrap works-page">
  <h1 class="page-title">Работы</h1>
  <p class="lead">Серия о чувствах. Нажми на картину, чтобы открыть её историю и примерить у себя на стене.</p>
  <div class="wall wall-big"><div class="hang">{hang}</div></div>
  <p class="scale-note">Все работы показаны в одном масштабе.</p>
</main>"""
    return page(path="works/", depth=1, title=f"Работы — {SITE['name']}, {SITE['tagline']}",
                desc="Серия картин маслом о чувствах: «Ярость младенца», «Наслаждение», «Внутренний свет».",
                og="works", body=body, css=["home.css"], active="works")


def build_work(works, i):
    w = works[i]
    root = "../../"
    prev_w, next_w = works[i - 1] if i > 0 else None, works[i + 1] if i < len(works) - 1 else None
    specs = [w["technique"], fmt_cm(w["w"], w["h"])] + ([str(w["year"])] if w.get("year") else [])
    pager = ""
    if prev_w:
        pager += f'<a class="pager-prev" href="../{prev_w["slug"]}/"><span>Предыдущая</span>{esc(prev_w["title"])}</a>'
    if next_w:
        pager += f'<a class="pager-next" href="../{next_w["slug"]}/"><span>Следующая</span>{esc(next_w["title"])}</a>'
    # сцена «над диваном»: стена 260 см шириной, диван 200 см, низ картины на высоте 110 см
    scene = f"""<figure class="scene" aria-label="Картина над диваном шириной 2 метра, в одном масштабе">
      <div class="scene-room" style="--w:{w['w']};--h:{w['h']}">
        <span class="scene-art"><img src="{root}{esc(w['img'])}" alt=""></span>
        <span class="sofa"><i class="sofa-back"></i><i class="sofa-seat"></i><i class="sofa-arm l"></i><i class="sofa-arm r"></i></span>
        <span class="floor"></span>
      </div>
      <figcaption>Так картина {fmt_cm(w['w'], w['h'])} смотрится над диваном шириной 2 метра.</figcaption>
    </figure>"""
    body = f"""<main class="wrap work">
  <a class="crumb" href="../">Все работы</a>
  <div class="work-grid">
    <figure class="work-photo"><img src="{root}{esc(w['img'])}" alt="{esc(w['title'])}, {w['technique'].lower()}, {fmt_cm(w['w'], w['h'])}"></figure>
    <div class="work-info">
      <h1>{esc(w['title'])}</h1>
      <p class="specs">{'<br>'.join(esc(s) for s in specs)}</p>
      <p class="story">{esc(w['story'])}</p>
      <div class="actions">
        <a class="button" href="{root}fit/?work={w['slug']}">Примерить у себя на стене</a>
        {contact_button()}
      </div>
      {scene}
    </div>
  </div>
  <nav class="pager" aria-label="Другие работы">{pager}</nav>
</main>"""
    return page(path=f"works/{w['slug']}/", depth=2, title=f"«{w['title']}» — {SITE['name']}, {SITE['tagline']}",
                desc=f"{w['technique']}, {fmt_cm(w['w'], w['h'])}. {w['story']}",
                og=w["slug"], body=body, css=["home.css"], active="works")


def build_mood():
    body = """<main id="quiz">
  <div class="wrap"><div id="app"></div></div>
</main>"""
    return page(path="mood/", depth=1, title="Какое ты чувство сегодня?",
                desc="Пять коротких вопросов, и ты увидишь картину, в которой живёт твоё чувство. Карточку можно сразу отправить в сторис.",
                og="mood", body=body, css=["mood.css"], js=["mood.js"], active="mood")


def build_fit():
    frag = (ROOT / "_tools" / "fit_body.html").read_text(encoding="utf-8")
    body = f'<main class="wrap fit-page">\n{frag}\n</main>'
    return page(path="fit/", depth=1, title="Примерить картину у себя на стене",
                desc="Картина в натуральную величину у тебя дома: через камеру телефона или на фото комнаты.",
                og="fit", body=body, css=["fit.css"], js=["fit.js"], active="fit")


def build_404():
    body = f"""<main class="wrap notfound">
  <h1 class="page-title">Такой страницы нет</h1>
  <p class="lead">Возможно, ссылка устарела. Все работы и опрос — на главной.</p>
  <p><a class="button" href="{SITE['base']}">На главную</a></p>
</main>"""
    return page(path="404.html", depth=0, title="Страница не найдена", desc="Страница не найдена.",
                og="home", body=body, css=["home.css"], root=SITE["base"])


# ---------------------------------------------------------------- превью ссылок
def build_og(works):
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    W, H = 1200, 630
    out = ROOT / "img" / "og"
    out.mkdir(parents=True, exist_ok=True)
    prata = lambda s: ImageFont.truetype(str(FONTS / "Prata-Regular.ttf"), s)

    def manrope(s, wght=500):
        f = ImageFont.truetype(str(FONTS / "Manrope[wght].ttf"), s)
        try:
            f.set_variation_by_axes([wght])
        except Exception:
            pass
        return f

    INK, MUTED, ACCENT = (34, 29, 42), (107, 100, 117), (123, 45, 74)

    def wall():
        im = Image.new("RGB", (W, H))
        top, bot = (221, 216, 224), (210, 204, 214)
        d = ImageDraw.Draw(im)
        for y in range(H):
            t = y / H
            d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
        return im

    def hang(im, path, box):  # вписать картину в box с тенью
        x0, y0, bw, bh = box
        p = Image.open(ROOT / path).convert("RGB")
        k = min(bw / p.width, bh / p.height)
        p = p.resize((round(p.width * k), round(p.height * k)), Image.LANCZOS)
        x, y = x0 + (bw - p.width) // 2, y0 + (bh - p.height) // 2
        sh = Image.new("L", im.size, 0)
        ImageDraw.Draw(sh).rectangle([x + 6, y + 16, x + p.width - 6, y + p.height + 10], fill=120)
        sh = sh.filter(ImageFilter.GaussianBlur(18))
        im.paste(Image.new("RGB", im.size, (40, 25, 45)), (0, 0), sh)
        im.paste(p, (x, y))
        return x, y, p.width, p.height

    def plinth(im, y):
        d = ImageDraw.Draw(im)
        d.rectangle([0, y, W, y + 14], fill=(244, 242, 246))
        d.rectangle([0, y + 14, W, H], fill=(138, 107, 82))

    def text_block(im, title, sub, x=72, y=None, width=520, size=60):
        d = ImageDraw.Draw(im)
        f = prata(size)
        # перенос по словам
        lines, cur = [], ""
        for word in title.split():
            t = (cur + " " + word).strip()
            if d.textlength(t, font=f) <= width:
                cur = t
            else:
                lines.append(cur); cur = word
        lines.append(cur)
        lh = int(size * 1.18)
        total = lh * len(lines) + (56 if sub else 0)
        y = y if y is not None else (H - 60 - total) // 2
        for ln in lines:
            d.text((x, y), ln, font=f, fill=INK); y += lh
        if sub:
            d.text((x, y + 18), sub, font=manrope(28, 500), fill=MUTED)
        d.text((x, H - 112), f"{SITE['name']}, {SITE['tagline']}", font=manrope(24, 600), fill=ACCENT)

    by = {w["slug"]: w for w in works}

    # главная и «работы»: три картины в одном масштабе, центры на одной высоте
    for name, title, sub in (("home", SITE["name"], SITE["tagline"]), ("works", "Работы", f"{SITE['name']}, {SITE['tagline']}")):
        im = wall()
        plinth(im, 590)
        k = 3.5
        gap = 36
        total = sum(w["w"] for w in works) * k + gap * (len(works) - 1)
        x = W - 60 - total
        for w in works:
            bw, bh = w["w"] * k, w["h"] * k
            hang(im, w["img"], (int(x), int(215 - bh / 2), int(bw), int(bh)))
            x += bw + gap
        d = ImageDraw.Draw(im)
        f = prata(70)
        d.text((60, 430), title, font=f, fill=INK)
        d.text((62, 520), sub, font=manrope(30, 500), fill=MUTED)
        im.save(out / f"{name}.jpg", quality=86)

    # опрос
    im = wall()
    x = 640
    for w in works:
        hang(im, w["img"], (x, 175, 160, 240)); x += 175
    text_block(im, "Какое ты чувство сегодня?", "Пять вопросов и твоя картина", width=520, size=62)
    im.save(out / "mood.jpg", quality=86)

    # примерка
    im = wall()
    plinth(im, 590)
    w = by.get("naslazhdenie", works[0])
    hang(im, w["img"], (760, 60, 280, 400))
    text_block(im, "Примерь картину у себя на стене", "Через камеру телефона или по фото комнаты", width=560, size=58)
    im.save(out / "fit.jpg", quality=86)

    # каждая работа
    for w in works:
        im = wall()
        hang(im, w["img"], (620, 50, 520, 530))
        text_block(im, f"«{w['title']}»", f"{w['technique']}, {fmt_cm(w['w'], w['h'])}", width=500, size=64)
        im.save(out / f"{w['slug']}.jpg", quality=86)


def main():
    works = load_works()
    files = {
        "index.html": build_home(works),
        "works/index.html": build_works(works),
        "mood/index.html": build_mood(),
        "fit/index.html": build_fit(),
        "404.html": build_404(),
    }
    for i, w in enumerate(works):
        files[f"works/{w['slug']}/index.html"] = build_work(works, i)
    for rel, text in files.items():
        p = ROOT / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
        print("страница", rel)
    if "--no-og" not in sys.argv:
        build_og(works)
        print("превью ссылок готовы")


if __name__ == "__main__":
    main()
