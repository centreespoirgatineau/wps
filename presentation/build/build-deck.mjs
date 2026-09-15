// Assemble the slideshow: one self-contained, responsive HTML file.
//
//   node presentation/build/build-deck.mjs <pages.json> <mark.svg> <out.html> [brand]
//
// There is no fixed canvas: every slide fills whatever screen it is on, and the
// type scales with it. Wide screens get two columns, tall ones stack.
//
// This file is the shell, shared by every audience. The wording is one module
// per brand — slides.jc.mjs, slides.spp.mjs — so the two decks can say entirely
// different things without a second copy of the layout. See ../README.md.
import fs from 'node:fs';

const pages = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mark = fs.readFileSync(process.argv[3]).toString('base64');   // the site mark, inlined
const OUT = process.argv[4];
const brand = process.argv[5] || 'jc';

/** A phone showing part of a captured page. `top` scrolls the page inside it. */
const phone = (key, top = 0) => `
<figure class="shot">
  <div class="phone"><div class="screen"><iframe data-page="${key}" data-top="${top}" scrolling="no" tabindex="-1" title=""></iframe></div></div>
  <figcaption>Exemple — données de démonstration</figcaption>
</figure>`;

const { meta, slides: wording } = await import(`./slides.${brand}.mjs`);
const slides = wording({ phone, mark });

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FAF9F5">
<!-- Link preview. __ORIGIN__ is filled in by the /presentation route, so the
     address stays a setting rather than something baked into this file. -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="Centre Espoir de Gatineau">
<meta property="og:locale" content="fr_CA">
<meta property="og:title" content="${meta.ogTitle}">
<meta property="og:description" content="${meta.ogDesc}">
<meta property="og:url" content="__ORIGIN__/presentation">
<meta property="og:image" content="__ORIGIN__${meta.ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${meta.ogAlt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="description" content="${meta.ogDesc}">
<title>${meta.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#FAF9F5; --surface:#fff; --ink:#141413; --ink-2:#5F5E5A; --ink-3:#8C8A84;
  --line:#E8E6DF; --accent:#D97757; --accent-ink:#B4573A; --accent-soft:#F8EDE6;
  --serif:"Source Serif 4",Georgia,"Times New Roman",serif;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,"Helvetica Neue",Arial,sans-serif;
  --pad: clamp(22px, 4.2vw, 128px);
  --gap: clamp(14px, 2.2vh, 34px);
}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg)}
body{font-family:var(--sans);color:var(--ink);-webkit-font-smoothing:antialiased;
  -webkit-tap-highlight-color:transparent;text-wrap:pretty}

/* One tall page that stops neatly on each slide. Scrolling is the navigation:
   a flick of the thumb on a phone, the wheel on a laptop, arrows on a clicker. */
#deck{position:fixed;inset:0;overflow-y:auto;overflow-x:hidden;
  scroll-snap-type:y mandatory;overscroll-behavior-y:contain;scroll-behavior:smooth;
  -webkit-overflow-scrolling:touch;scrollbar-width:none}
#deck::-webkit-scrollbar{width:0;height:0}
.s{position:relative;min-height:100dvh;scroll-snap-align:start;scroll-snap-stop:always;
  background:var(--bg);display:flex;flex-direction:column;justify-content:center;
  padding:calc(var(--pad) + env(safe-area-inset-top)) calc(var(--pad) + env(safe-area-inset-right))
          calc(var(--pad) + env(safe-area-inset-bottom)) calc(var(--pad) + env(safe-area-inset-left))}
.mid{width:100%;max-width:1400px;margin:0 auto}

/* Everything arrives a moment after its slide does, in reading order. */
.anim{opacity:0;transform:translateY(20px);
  transition:opacity .62s cubic-bezier(.22,.72,.28,1), transform .62s cubic-bezier(.22,.72,.28,1);
  transition-delay:calc(var(--i, 0) * 65ms)}
.s.in .anim{opacity:1;transform:none}

/* Type: one fluid scale, bounded by both the width and the height of the screen
   so it works on a projector, a laptop and a phone lying on its side. */
h1,h2,h3{font-family:var(--serif);font-weight:500;margin:0;letter-spacing:-.015em;color:var(--ink);text-wrap:balance}
h1{font-size:clamp(34px, min(6.2vw, 12vh), 116px);line-height:1.05}
h2{font-size:clamp(25px, min(3.9vw, 7.4vh), 72px);line-height:1.12}
h2.tight{font-size:clamp(22px, min(3.4vw, 6.4vh), 64px)}
h3{font-size:clamp(16px, min(1.55vw, 3vh), 29px);line-height:1.3;margin:0 0 .35em}
p{margin:0}
.center{text-align:center}
.eyebrow{font-size:clamp(11px, min(1.1vw, 2.1vh), 21px);letter-spacing:.16em;text-transform:uppercase;
  color:var(--accent-ink);font-weight:600;margin-bottom:var(--gap)}
.big{font-size:clamp(15px, min(1.62vw, 3.1vh), 31px);line-height:1.55;color:var(--ink-2);max-width:38ch}
.big+.big{margin-top:.7em}
/* Several slides set a paragraph straight after a heading; without this it sat
   flush against the last line of the heading. */
h2+.big,h2+.ticks,h2+.contact{margin-top:var(--gap)}
.big strong{color:var(--ink);font-weight:600}
.accent-text{color:var(--accent-ink)}
.note{font-size:clamp(12px, min(1.2vw, 2.3vh), 23px);line-height:1.6;color:var(--ink-3);max-width:48ch;margin-top:var(--gap)}
.note.center{margin-left:auto;margin-right:auto}
.note strong{color:var(--ink);font-weight:600}

.split{display:grid;grid-template-columns:1fr auto;gap:clamp(18px,3.8vw,72px);align-items:center;width:100%;max-width:1660px;margin:0 auto}
.col{min-width:0}
/* Side by side, the right-hand column is sized by whatever is in it. Anything
   there without a width of its own — the rule box, the text message — would
   otherwise take the whole slide and leave the words beside it one per line.
   The phones size themselves against the slide, already well under this. */
@media (min-aspect-ratio: 5/4){ .split>.col:last-child{max-width:44vw} }
.shot-col{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:0}

/* title */
.title .logo{width:clamp(52px, min(6.6vw, 12vh), 128px);height:auto;margin-bottom:var(--gap)}
.lede{font-size:clamp(15px, min(1.56vw, 3vh), 30px);line-height:1.6;color:var(--ink-2);margin-top:var(--gap);max-width:42ch}

/* purpose */
.pull{background:var(--accent-soft);border-radius:clamp(14px,1.4vw,26px);padding:clamp(18px,2.6vw,52px)}
.pull-label{font-size:clamp(10px, min(1vw, 1.9vh), 19px);letter-spacing:.14em;text-transform:uppercase;
  color:var(--accent-ink);font-weight:600;margin-bottom:.9em}
.pull-text{font-family:var(--serif);font-size:clamp(17px, min(2vw, 3.8vh), 38px);line-height:1.38}

/* steps */
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(10px,1.5vw,28px);margin-top:calc(var(--gap) * 1.5)}
.step{background:var(--surface);border:1px solid var(--line);border-radius:clamp(12px,1.2vw,22px);
  padding:clamp(14px,2vw,40px);box-shadow:0 1px 2px rgba(20,20,19,.04),0 18px 44px -30px rgba(20,20,19,.3)}
.step .n{display:flex;align-items:center;justify-content:center;
  width:clamp(26px,2.8vw,54px);height:clamp(26px,2.8vw,54px);border-radius:50%;
  background:var(--accent-soft);color:var(--accent-ink);font-family:var(--serif);
  font-size:clamp(14px,1.5vw,28px);margin-bottom:clamp(8px,1.2vw,24px)}
.step p{font-size:clamp(12px, min(1.2vw, 2.3vh), 23px);line-height:1.55;color:var(--ink-2)}

/* lists */
.ticks{list-style:none;margin:var(--gap) 0 0;padding:0}
.ticks li{position:relative;padding-left:clamp(20px,2.4vw,46px);
  font-size:clamp(14px, min(1.42vw, 2.7vh), 27px);line-height:1.5;margin-bottom:.6em}
.ticks li:last-child{margin-bottom:0}
.ticks li::before{content:"";position:absolute;left:0;top:.55em;
  width:clamp(6px,.68vw,13px);height:clamp(6px,.68vw,13px);border-radius:50%;background:var(--accent)}
.rules{margin:calc(var(--gap) * 1.3) auto 0;padding:0;list-style:none;counter-reset:r;
  display:grid;gap:clamp(18px,1.8vw,34px);max-width:1100px}
.rules li{counter-increment:r;position:relative;padding-left:clamp(34px,3.4vw,66px);
  font-size:clamp(13px, min(1.26vw, 2.4vh), 24px);line-height:1.55;color:var(--ink-2)}
.rules li strong{color:var(--ink);display:block;font-size:clamp(15px, min(1.42vw, 2.7vh), 27px);line-height:1.3;margin-bottom:.2em}
.rules li::before{content:counter(r);position:absolute;left:0;top:0;
  width:clamp(22px,2.3vw,44px);height:clamp(22px,2.3vw,44px);border-radius:50%;
  background:var(--accent-soft);color:var(--accent-ink);font-family:var(--serif);
  font-size:clamp(12px,1.25vw,24px);display:flex;align-items:center;justify-content:center}
.rules li.first::before{background:var(--accent);color:#fff}
.rules li.first strong{color:var(--accent-ink)}

/* join */
.cta{display:inline-block;margin:calc(var(--gap) * 1.1) 0;padding:clamp(12px,1.3vw,24px) clamp(18px,2vw,40px);
  border-radius:999px;background:var(--accent);color:#fff;font-weight:600;text-decoration:none;
  font-size:clamp(15px, min(1.72vw, 3.2vh), 33px)}
.contact{font-size:clamp(13px, min(1.3vw, 2.5vh), 25px);line-height:1.65;color:var(--ink-2)}
.contact strong{color:var(--ink)}
.contact .tel{color:var(--accent-ink);font-weight:600;text-decoration:none;
  font-size:clamp(17px, min(1.72vw, 3.2vh), 33px)}
.contact .mail{color:var(--accent-ink);text-decoration:none}
.big.center{margin-inline:auto}

/* text-message mock */
.sms{width:min(444px, 100%);border-radius:clamp(16px,1.8vw,34px);background:var(--surface);
  border:1px solid var(--line);overflow:hidden;box-shadow:0 30px 70px -40px rgba(20,20,19,.5)}
.sms-head{padding:clamp(10px,1.2vw,22px) clamp(14px,1.5vw,28px);border-bottom:1px solid var(--line);
  font-size:clamp(10px,min(1vw,1.9vh),19px);color:var(--ink-3);letter-spacing:.06em;text-transform:uppercase;font-weight:600}
.bubble{margin:clamp(14px,1.7vw,32px) clamp(14px,1.5vw,28px) 0;background:#EDEBE4;
  border-radius:clamp(12px,1.2vw,22px) clamp(12px,1.2vw,22px) clamp(12px,1.2vw,22px) 6px;
  padding:clamp(13px,1.4vw,28px);font-size:clamp(13px, min(1.2vw, 2.3vh), 23px);line-height:1.55;color:var(--ink)}
.bubble .link{color:var(--accent-ink);text-decoration:underline;word-break:break-all}
.sms-time{margin:.7em clamp(14px,1.5vw,28px) clamp(14px,1.7vw,32px);font-size:clamp(10px,min(.9vw,1.7vh),17px);color:var(--ink-3)}

/* the app, shown in a phone. --k and --screen-h are set in script. */
.shot{margin:0;display:flex;flex-direction:column;align-items:center;gap:.6em;min-height:0}
.shot figcaption{font-size:clamp(9px,min(.95vw,1.8vh),18px);color:var(--ink-3);letter-spacing:.06em;
  text-transform:uppercase;text-align:center;order:2}
/* Scaled by --k, and given the resulting size in layout too, so the grid
   column is as wide as the phone actually looks. */
/* No overflow:hidden here: the box is exactly the size of the scaled phone,
   so anything it clipped would come out with a hard, square edge. */
.phone-box{order:1;transform-origin:top left}
.phone-box>.phone{transform:scale(var(--k,1));transform-origin:top left}
.phone{width:414px;height:calc(var(--screen-h, 820px) + 24px);border-radius:52px;background:#171614;padding:12px;
  box-shadow:0 0 0 1px rgba(20,20,19,.08)}
.screen{position:relative;width:100%;height:100%;border-radius:41px;overflow:hidden;background:var(--bg)}
/* The phone is a picture, not a control: let taps and swipes pass straight
   through to the deck, or gesturing over it would do nothing. */
.screen iframe{position:absolute;left:0;width:390px;height:2300px;border:0;display:block;pointer-events:none}

/* A quiet invitation to scroll, on the first slide only. */
#cue{position:fixed;left:0;right:0;bottom:calc(env(safe-area-inset-bottom) + 26px);z-index:30;
  display:flex;flex-direction:column;align-items:center;gap:6px;
  pointer-events:none;opacity:0;transition:opacity .6s ease}
#cue.show{opacity:1}
#cue span{font-size:clamp(11px,1.1vw,14px);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
#cue svg{width:22px;height:22px;color:var(--accent);animation:nudge 2.1s ease-in-out infinite}
@keyframes nudge{0%,100%{transform:translateY(-3px);opacity:.55}50%{transform:translateY(4px);opacity:1}}
@media (prefers-reduced-motion:reduce){
  #deck{scroll-behavior:auto}
  #cue svg{animation:none}
  .anim{transition:none;opacity:1;transform:none}
}

/* Stacked layout: portrait phones and tablets. Words first, phone underneath. */
@media (max-aspect-ratio: 5/4){
  .split{grid-template-columns:1fr;gap:clamp(12px,2.2vh,28px);justify-items:center;align-content:center}
  .col{width:100%;max-width:640px}
  .big,.note,.lede{max-width:none}
  .steps{grid-template-columns:1fr;gap:9px}
  .step{display:grid;grid-template-columns:auto 1fr;gap:0 13px;align-items:center;padding:13px 15px}
  .step .n{margin-bottom:0;grid-row:span 2}
  .step h3{margin:0}
  .step p{grid-column:2}
  .title .lede{max-width:none}
  /* Words take what they need; the phone gets exactly the rest, so nothing
     ever runs off the top or the bottom of the screen. */
  .shot-slide .split{grid-template-rows:auto minmax(0,1fr);flex:1;min-height:0;align-content:stretch}
  .shot-slide .col{align-self:start}
  .shot-slide .shot-col{height:100%;min-height:0;align-self:stretch}
}
/* Very short landscape (a phone on its side): trim the vertical air. */
@media (max-height: 460px){
  :root{--gap:9px;--pad:clamp(14px,3vw,40px)}
  .ticks li{margin-bottom:.4em}
}
</style>
</head>
<body>
<div id="deck">${slides.join('\n')}</div>
<div id="cue">
  <span>Faites défiler</span>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
</div>

<script>
const PAGES = ${JSON.stringify(pages)};
const deck = document.getElementById('deck');
const slides = [...document.querySelectorAll('.s')];
const cue = document.getElementById('cue');
let current = 0;

// Each phone gets its page injected here, so the file stays standalone.
for (const f of document.querySelectorAll('iframe[data-page]')) {
  f.srcdoc = PAGES[f.dataset.page];
  f.style.top = '-' + f.dataset.top + 'px';
}
// Wrap each phone so the scaling and the caption do not fight each other.
for (const p of document.querySelectorAll('.phone')) {
  const box = document.createElement('div');
  box.className = 'phone-box';
  p.parentNode.insertBefore(box, p);
  box.appendChild(p);
}

// Everything that should arrive, in reading order, with a small stagger.
const ANIM = '.eyebrow,h1,h2,h3,.logo,.lede,.big,.note,.pull,.ticks li,'
  + '.rules li,.step,.shot,.sms,.cta,.contact';
for (const s of slides) {
  [...s.querySelectorAll(ANIM)].forEach((el, i) => {
    el.classList.add('anim');
    el.style.setProperty('--i', Math.min(i, 9));
  });
}

/* The phone mock-ups are a fixed 390px-wide page; scale them to whatever space
   the slide actually has, so nothing is ever cut off or comically small. */
function sizeShots() {
  const stacked = matchMedia('(max-aspect-ratio: 5/4)').matches;
  for (const shot of document.querySelectorAll('.shot')) {
    const slide = shot.closest('.s');
    const split = shot.closest('.split');
    if (!slide || !split) continue;
    const cs = getComputedStyle(slide);
    const innerW = slide.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    // Measure one screen, not the slide: a slide that has already grown past the
    // fold would otherwise report the room it took, and the phone would grow to
    // match it — pushing itself off the bottom.
    const innerH = Math.min(slide.clientHeight, deck.clientHeight)
      - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const capH = shot.querySelector('figcaption').offsetHeight + 10;
    const gap = parseFloat(getComputedStyle(split).rowGap || 0) || 0;
    const textCol = split.querySelector('.col:not(.shot-col)');

    // Measure against the slide, never against the column: the column is sized
    // by the phone, so asking it how much room there is would be circular.
    let availW, availH;
    if (stacked) {
      availW = Math.min(innerW, 640);
      availH = innerH - textCol.offsetHeight - gap - capH;
    } else {
      availW = innerW * 0.44;
      availH = innerH - capH;
    }
    availW = Math.max(120, availW);
    availH = Math.max(150, availH);

    const kW = Math.min(1, availW / 414);
    // On a tall narrow screen, show a shorter window of the page rather than
    // shrinking the app's own text away.
    const screenH = stacked
      ? Math.min(820, Math.max(280, Math.round(availH / Math.max(0.45, kW)) - 24))
      : 820;
    const k = Math.min(kW, availH / (screenH + 24));
    const box = shot.querySelector('.phone-box');
    shot.querySelector('.phone').style.setProperty('--screen-h', screenH + 'px');
    box.style.setProperty('--k', k);
    box.style.width = Math.round(414 * k) + 'px';
    box.style.height = Math.round((screenH + 24) * k) + 'px';
  }
}

function hideCue() { cue.classList.remove('show'); }

// Which slide is on screen drives the reveal, the dots and the address bar.
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) e.target.classList.add('in');
    if (e.isIntersecting && e.intersectionRatio >= 0.5) {
      const i = slides.indexOf(e.target);
      if (i !== current) {
        current = i;
        history.replaceState(null, '', '#' + (i + 1));
      }
      sizeShots();
      if (i > 0) hideCue();
    }
  }
}, { root: deck, threshold: [0.2, 0.5] });
for (const s of slides) io.observe(s);

function goTo(i) {
  i = Math.max(0, Math.min(slides.length - 1, i));
  slides[i].scrollIntoView({ block: 'start' });
  hideCue();
}

addEventListener('keydown', (e) => {
  if (['ArrowDown', 'ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); goTo(current + 1); }
  else if (['ArrowUp', 'ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); goTo(current - 1); }
  else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
  else if (e.key === 'End') { e.preventDefault(); goTo(slides.length - 1); }
  else if (e.key === 'f' || e.key === 'F') {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen();
  }
});
deck.addEventListener('scroll', hideCue, { passive: true, once: true });

addEventListener('resize', sizeShots);
addEventListener('orientationchange', () => setTimeout(sizeShots, 300));
addEventListener('load', sizeShots);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeShots);
setTimeout(sizeShots, 500);

// Open on the slide named in the address, without a scroll animation.
const start = Math.max(0, Math.min(slides.length - 1, (parseInt(location.hash.slice(1), 10) || 1) - 1));
deck.style.scrollBehavior = 'auto';
slides[start].scrollIntoView({ block: 'start' });
slides[start].classList.add('in');
requestAnimationFrame(() => { deck.style.scrollBehavior = ''; sizeShots(); });

// Invite the first scroll, then never again.
setTimeout(() => { if (current === 0) cue.classList.add('show'); }, 1400);
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log('slides:', slides.length, '| file:', (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB →', OUT);
