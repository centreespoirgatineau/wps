// Assemble the slideshow: one self-contained HTML file, 1920x1080 per slide.
//
//   node presentation/build/build-deck.mjs <pages.json> <mark.png> <out.html>
//
// The slide wording lives here, one slide per block, so a text change is a
// one-line edit followed by a rebuild. See ../README.md for the four steps.
import fs from 'node:fs';

const pages = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mark = fs.readFileSync(process.argv[3]).toString('base64');
const OUT = process.argv[4];

/** A phone showing part of a captured page. `top` scrolls the page inside it. */
const phone = (key, top = 0, { tall = 2200 } = {}) => `
<div class="phone">
  <div class="screen"><iframe data-page="${key}" style="top:${-top}px;height:${tall}px" scrolling="no" tabindex="-1" title=""></iframe></div>
</div>`;

const demoTag = `<div class="demo-tag">Exemple — données de démonstration</div>`;

const slides = [];

// 1 ------------------------------------------------------------------ title
slides.push(`
<section class="s title">
  <img class="logo" src="data:image/png;base64,${mark}" alt="">
  <h1>Rien ne devrait<br>se perdre.</h1>
  <p class="lede">Les surplus alimentaires du Centre Espoir de Gatineau,<br>
    redistribués le jour même par les églises —<br>
    <strong>comme outil pour annoncer l’Évangile de Jésus-Christ.</strong></p>
  <div class="title-foot">
    <span>Centre Espoir de Gatineau</span><span class="dot">·</span><span>wps.davidhatin.com</span>
  </div>
</section>`);

// 2 ---------------------------------------------------------------- problem
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Le problème</div>
      <div class="bignum">1 500 $</div>
      <h2 class="tight">de sushis jetés, le 10 septembre.</h2>
    </div>
    <div class="col">
      <p class="big">Un surplus arrive sans prévenir. Il doit repartir <strong>avant la fin de la journée</strong>.</p>
      <p class="big">Le temps d’appeler les contacts un par un, il est déjà trop tard.</p>
      <p class="big accent-text">Ce n’est pas seulement de la nourriture qui part à la poubelle. C’est une porte qui se referme.</p>
    </div>
  </div>
</section>`);

// 3 ---------------------------------------------------------------- purpose
slides.push(`
<section class="s purpose">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Pourquoi</div>
      <h2>Ce n’est pas qu’une question de nourriture.</h2>
      <p class="big">Chaque lot qui sort d’ici entre dans une communauté, porté par une église.</p>
      <p class="big">Un repas partagé, une famille visitée, une conversation qui s’ouvre : <strong>voilà ce que ces surplus rendent possible.</strong></p>
    </div>
    <div class="col">
      <div class="pull">
        <div class="pull-label">Règle n° 1 de la plateforme</div>
        <p>Ces lots de nourriture doivent servir d’outil pour prêcher l’Évangile de Jésus-Christ.</p>
      </div>
      <p class="note wide-note">Cette règle n’est pas une formalité : c’est la raison d’être de la plateforme, et chaque contact l’accepte avant de réserver.</p>
    </div>
  </div>
</section>`);

// 4 ------------------------------------------------------------------- idea
slides.push(`
<section class="s">
  <div class="eyebrow center">Comment ça marche</div>
  <h2 class="center headline">Un texto. Un lien.<br>Une heure plus tard, tout est parti.</h2>
  <div class="steps">
    <div class="step"><div class="n">1</div><h3>Le Centre Espoir publie</h3><p>Ce que contient un lot, combien de lots, où et jusqu’à quelle heure.</p></div>
    <div class="arrow">→</div>
    <div class="step"><div class="n">2</div><h3>Toutes les églises reçoivent un texto</h3><p>Au même moment, avec un lien qui ouvre l’offre.</p></div>
    <div class="arrow">→</div>
    <div class="step"><div class="n">3</div><h3>Chacune réserve sa part</h3><p>Premier arrivé, premier servi. Vous venez chercher, et c’est tout.</p></div>
  </div>
</section>`);

// 5 -------------------------------------------------------------------- sms
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Étape 1</div>
      <h2>Tout commence par un texto.</h2>
      <ul class="ticks">
        <li>Rien à installer.</li>
        <li>Aucun mot de passe à retenir.</li>
        <li>Le lien vous connecte directement.</li>
      </ul>
      <p class="note">Le texto part à toutes les églises en même temps. Personne n’est prévenu avant les autres.</p>
    </div>
    <div class="col center-col">
      <div class="sms-phone">
        <div class="sms-head">Centre Espoir</div>
        <div class="sms-body">
          <div class="bubble">Bonjour Daniel (Église Nouvelle Vie de Gatineau). Surplus alimentaire aujourd’hui au Centre Espoir : Plateaux de sushis et salades, 8 lot(s). Réserver&nbsp;: <span class="link">wps.davidhatin.com/o/1/…</span></div>
          <div class="sms-time">aujourd’hui, 10H16</div>
        </div>
      </div>
    </div>
  </div>
</section>`);

// 6 ------------------------------------------------------------------ offer
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Étape 2</div>
      <h2>Vous voyez exactement ce qui est offert.</h2>
      <ul class="ticks">
        <li>Ce que contient un lot.</li>
        <li>Combien de lots sont disponibles.</li>
        <li>Le lieu et l’heure limite du ramassage.</li>
      </ul>
      <p class="note">La page s’ouvre sur votre téléphone, sans compte à créer.</p>
    </div>
    <div class="col center-col">${phone('offer', 0)}${demoTag}</div>
  </div>
</section>`);

// 7 ---------------------------------------------------------------- reserve
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Étape 3</div>
      <h2>Vous réservez en un geste.</h2>
      <ul class="ticks">
        <li>Un lot réservé disparaît aussitôt pour les autres.</li>
        <li>Vous voyez qui a pris quoi, en direct.</li>
        <li>Vous changez d’avis ? Vous libérez le lot.</li>
      </ul>
      <p class="note">Premier arrivé, premier servi — avec une attente de 15 minutes pour ceux qui ont déjà réservé à l’offre précédente, afin que tout le monde ait sa chance.</p>
    </div>
    <div class="col center-col">${phone('offer', 545)}${demoTag}</div>
  </div>
</section>`);

// 8 ------------------------------------------------------------------- chat
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Étape 4</div>
      <h2>Vous vous organisez entre vous.</h2>
      <ul class="ticks">
        <li>« Je peux prendre ton lot en passant. »</li>
        <li>« Quelqu’un va vers Aylmer ? »</li>
        <li>Chaque église a sa couleur, d’un coup d’œil.</li>
      </ul>
      <p class="note">La discussion se ferme à la fin de la journée. L’historique reste visible.</p>
    </div>
    <div class="col center-col">${phone('offer', 1272)}${demoTag}</div>
  </div>
</section>`);

// 9 ------------------------------------------------------------------- list
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Toujours à jour</div>
      <h2>L’offre du jour, et toutes les précédentes.</h2>
      <ul class="ticks">
        <li>Ce qui est en cours, en haut.</li>
        <li>Ce qui est passé, en dessous.</li>
        <li>Combien de lots restent libres.</li>
      </ul>
    </div>
    <div class="col center-col">${phone('list', 0, { tall: 1000 })}${demoTag}</div>
  </div>
</section>`);

// 10 ----------------------------------------------------------------- rules
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Les règles</div>
      <h2>Trois règles, pour que ce soit juste.</h2>
      <ol class="rules">
        <li class="first"><strong>Les surplus servent l’Évangile.</strong> Ces lots sont un outil pour annoncer Jésus-Christ. C’est la première règle, et la raison d’être de la plateforme.</li>
        <li><strong>Réserver, c’est s’engager.</strong> Qui ne vient pas ne peut pas réserver à l’offre suivante. Après trois absences, le contact quitte la liste.</li>
        <li><strong>Tout reste confidentiel.</strong> Les coordonnées et les discussions ne sortent pas de la plateforme.</li>
      </ol>
    </div>
    <div class="col center-col">${phone('about', 660, { tall: 1600 })}</div>
  </div>
</section>`);

// 11 ------------------------------------------------------------------ cost
slides.push(`
<section class="s">
  <div class="eyebrow center">Ce que ça vous demande</div>
  <h2 class="center headline">Un numéro de cellulaire.<br>C’est tout.</h2>
  <div class="nots">
    <div class="not"><span>Pas</span><strong>d’application</strong><em>à télécharger</em></div>
    <div class="not"><span>Pas</span><strong>de compte</strong><em>à créer</em></div>
    <div class="not"><span>Pas</span><strong>de frais</strong><em>ni d’engagement</em></div>
    <div class="not"><span>Pas</span><strong>de réunion</strong><em>à ajouter à l’agenda</em></div>
  </div>
  <p class="center note wide">Vous pouvez quitter la liste vous-même, en tout temps, en deux touches.</p>
</section>`);

// 12 ---------------------------------------------------------------- gospel
slides.push(`
<section class="s gospel">
  <div class="quote-mark">“</div>
  <blockquote>
    Ces surplus ne sont pas seulement<br>
    de la nourriture sauvée.<br>
    Ce sont des occasions de partager<br>
    l’Évangile de Jésus-Christ.
  </blockquote>
  <p class="attrib">La raison d’être de la plateforme</p>
</section>`);

// 13 ------------------------------------------------------------------ join
slides.push(`
<section class="s join">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Rejoindre la liste</div>
      <h2>Vous voulez en être ?</h2>
      <p class="big">Faites votre demande en ligne, ou parlez-en directement à David.</p>
      <a class="cta" href="https://wps.davidhatin.com/demande">wps.davidhatin.com/demande</a>
      <div class="contact">
        <strong>David Hatin</strong> · Directeur général<br>
        Centre Espoir de Gatineau<br>
        <a class="tel" href="tel:+18192085721">819-208-5721</a>
      </div>
      <p class="note">Vous recevrez un texto dès que votre demande sera approuvée.</p>
    </div>
    <div class="col center-col">${phone('login', 0, { tall: 900 })}</div>
  </div>
</section>`);

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FAF9F5">
<title>Surplus alimentaires — Centre Espoir de Gatineau</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#FAF9F5; --surface:#fff; --ink:#141413; --ink-2:#5F5E5A; --ink-3:#8C8A84;
  --line:#E8E6DF; --accent:#D97757; --accent-ink:#B4573A; --accent-soft:#F8EDE6; --ok:#3F7A5B;
  --serif:"Source Serif 4",Georgia,"Times New Roman",serif;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,"Helvetica Neue",Arial,sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#0d0d0c;overflow:hidden}
body{font-family:var(--sans);color:var(--ink);-webkit-font-smoothing:antialiased}

/* The stage is always 1920x1080 and is scaled to fit whatever screen it is on. */
#stage{position:fixed;left:50%;top:50%;width:1920px;height:1080px;transform-origin:center center}
.s{position:absolute;inset:0;background:var(--bg);padding:88px 128px;display:none;flex-direction:column;justify-content:center}
.s.on{display:flex}

/* Type scale. Display type sits tight; reading type stays open. */
h1,h2,h3,blockquote{font-family:var(--serif);font-weight:500;margin:0;letter-spacing:-.015em;color:var(--ink);text-wrap:balance}
h1{font-size:116px;line-height:1.04}
h2{font-size:72px;line-height:1.1}
h2.headline{font-size:84px;line-height:1.12}
h2.tight{font-size:64px;line-height:1.12}
h3{font-size:29px;line-height:1.3;margin-bottom:14px}
p{margin:0 0 22px}
p:last-child{margin-bottom:0}
.eyebrow{font-size:21px;letter-spacing:.17em;text-transform:uppercase;color:var(--accent-ink);font-weight:600;margin-bottom:26px}
.center{text-align:center}
.big{font-size:31px;line-height:1.55;color:var(--ink-2);max-width:38ch}
.big strong{color:var(--ink);font-weight:600}
.big.accent-text{color:var(--accent-ink)}
.note{font-size:23px;line-height:1.6;color:var(--ink-3);max-width:48ch;margin-top:30px}
.note.wide{max-width:none;font-size:25px;margin-top:44px}
.note.wide-note{max-width:42ch}
.split{display:grid;grid-template-columns:1fr 460px;gap:72px;align-items:center;height:100%}
.col{min-width:0}
.center-col{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px}

/* title */
.title{align-items:flex-start;justify-content:center}
.title .logo{width:128px;height:auto;margin-bottom:48px}
.lede{font-size:30px;line-height:1.6;color:var(--ink-2);margin-top:38px}
.lede strong{color:var(--accent-ink);font-weight:600}
.title-foot{position:absolute;left:128px;bottom:88px;font-size:21px;color:var(--ink-3);letter-spacing:.02em}
.title-foot .dot{margin:0 12px;color:var(--line)}

/* problem */
.bignum{font-family:var(--serif);font-size:184px;line-height:1;color:var(--accent);letter-spacing:-.03em;margin-bottom:14px}

/* purpose */
.pull{background:var(--accent-soft);border-radius:26px;padding:48px 52px}
.pull-label{font-size:19px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-ink);font-weight:600;margin-bottom:22px}
.pull p{font-family:var(--serif);font-size:38px;line-height:1.38;color:var(--ink);margin:0}

/* steps */
.steps{display:flex;align-items:stretch;gap:28px;margin-top:72px}
.step{flex:1;background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:40px 36px;
  box-shadow:0 1px 2px rgba(20,20,19,.04),0 18px 44px -30px rgba(20,20,19,.3)}
.step .n{width:54px;height:54px;border-radius:50%;background:var(--accent-soft);color:var(--accent-ink);
  font-family:var(--serif);font-size:28px;display:flex;align-items:center;justify-content:center;margin-bottom:24px}
.step p{font-size:23px;line-height:1.55;color:var(--ink-2);margin:0}
.arrow{align-self:center;font-size:34px;color:var(--line)}

/* lists */
.ticks{list-style:none;margin:40px 0 0;padding:0}
.ticks li{position:relative;padding-left:46px;font-size:27px;line-height:1.5;margin-bottom:22px;color:var(--ink)}
.ticks li:last-child{margin-bottom:0}
.ticks li::before{content:"";position:absolute;left:6px;top:15px;width:13px;height:13px;border-radius:50%;background:var(--accent)}
.rules{margin:40px 0 0;padding-left:0;list-style:none;counter-reset:r}
.rules li{counter-increment:r;position:relative;padding-left:66px;font-size:24px;line-height:1.55;color:var(--ink-2);margin-bottom:30px}
.rules li:last-child{margin-bottom:0}
.rules li strong{color:var(--ink);display:block;font-size:27px;line-height:1.3;margin-bottom:6px}
.rules li::before{content:counter(r);position:absolute;left:0;top:0;width:44px;height:44px;border-radius:50%;
  background:var(--accent-soft);color:var(--accent-ink);font-family:var(--serif);font-size:24px;display:flex;align-items:center;justify-content:center}
.rules li.first::before{background:var(--accent);color:#fff}
.rules li.first strong{color:var(--accent-ink)}

/* nothing-required grid */
.nots{display:grid;grid-template-columns:repeat(4,1fr);gap:26px;margin-top:76px}
.not{background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:40px 30px;text-align:center}
.not span{display:block;font-size:20px;color:var(--ink-3);letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px}
.not strong{display:block;font-family:var(--serif);font-size:38px;font-weight:500;margin-bottom:10px}
.not em{font-style:normal;font-size:21px;line-height:1.4;color:var(--ink-2)}

/* gospel */
.gospel{align-items:center;text-align:center;background:var(--accent-soft)}
.quote-mark{font-family:var(--serif);font-size:150px;line-height:.6;color:var(--accent);opacity:.5;margin-bottom:36px}
blockquote{font-size:62px;line-height:1.32;max-width:none}
.attrib{margin-top:52px;font-size:22px;color:var(--accent-ink);letter-spacing:.12em;text-transform:uppercase;font-weight:600}

/* join */
.cta{display:inline-block;margin:18px 0 36px;padding:24px 40px;border-radius:999px;background:var(--accent);color:#fff;
  font-size:33px;font-weight:600;letter-spacing:.01em;text-decoration:none}
.cta:hover{background:var(--accent-ink)}
.contact{font-size:25px;line-height:1.65;color:var(--ink-2)}
.contact strong{color:var(--ink)}
.contact .tel{font-size:33px;color:var(--accent-ink);font-weight:600;text-decoration:none}

/* text-message mock */
.sms-phone{width:444px;border-radius:34px;background:var(--surface);border:1px solid var(--line);overflow:hidden;
  box-shadow:0 30px 70px -40px rgba(20,20,19,.5)}
.sms-head{padding:22px 28px;border-bottom:1px solid var(--line);font-size:19px;color:var(--ink-3);
  letter-spacing:.06em;text-transform:uppercase;font-weight:600}
.sms-body{padding:32px 28px 36px}
.bubble{background:#EDEBE4;border-radius:22px 22px 22px 6px;padding:26px 28px;font-size:23px;line-height:1.55;color:var(--ink)}
.bubble .link{color:var(--accent-ink);text-decoration:underline;word-break:break-all}
.sms-time{margin-top:16px;font-size:17px;color:var(--ink-3)}

/* phone frame */
/* 390x820 of screen plus a 12px bezel all round: the page inside is 390 wide,
   so the frame has to be 414 or the right edge is cut off. */
.phone{width:414px;height:844px;border-radius:52px;background:#171614;padding:12px;flex:none;
  box-shadow:0 40px 90px -40px rgba(20,20,19,.55),0 0 0 1px rgba(20,20,19,.08)}
.screen{position:relative;width:100%;height:100%;border-radius:41px;overflow:hidden;background:var(--bg)}
.screen iframe{position:absolute;left:0;width:390px;border:0;display:block}
.demo-tag{font-size:18px;color:var(--ink-3);letter-spacing:.06em;text-transform:uppercase}

/* chrome */
#bar{position:fixed;left:0;right:0;bottom:0;height:4px;background:rgba(20,20,19,.08);z-index:10}
#bar i{display:block;height:100%;background:var(--accent);transition:width .25s ease}
#num{position:fixed;right:22px;bottom:18px;font-size:14px;color:var(--ink-3);z-index:10;font-variant-numeric:tabular-nums}
#hint{position:fixed;left:22px;bottom:16px;font-size:13px;color:var(--ink-3);z-index:10;transition:opacity .6s ease}
#hint.gone{opacity:0}

/* "turn your phone" invitation, portrait phones only */
#rotate{display:none}
@media (orientation:portrait) and (pointer:coarse){
  body.rotate-ok #rotate{display:none}
  #rotate{position:fixed;inset:0;z-index:100;background:var(--bg);display:flex;flex-direction:column;
    align-items:center;justify-content:center;text-align:center;padding:40px;gap:4px}
  #rotate svg{width:96px;height:96px;color:var(--accent);animation:tip 2.6s ease-in-out infinite}
  #rotate h2{font-size:34px;line-height:1.25;margin:26px 0 0}
  #rotate p{font-size:18px;line-height:1.6;color:var(--ink-2);margin:14px 0 0;max-width:34ch}
  #rotate button{margin-top:34px;background:none;border:0;color:var(--accent-ink);font-size:16px;
    text-decoration:underline;cursor:pointer;padding:10px;font-family:inherit}
  #bar,#num,#hint{display:none}
}
@keyframes tip{0%,55%,100%{transform:rotate(0)}70%,85%{transform:rotate(-90deg)}}
</style>
</head>
<body>
<div id="stage">${slides.join('\n')}</div>
<div id="bar"><i></i></div>
<div id="num"></div>
<div id="hint">← → pour naviguer · F pour le plein écran</div>

<div id="rotate">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18.5h2"/>
  </svg>
  <h2>Tournez votre téléphone</h2>
  <p>La présentation est faite pour l’écran à l’horizontale. Tournez l’appareil d’un quart de tour.</p>
  <button type="button" id="rotate-skip">Continuer quand même</button>
</div>

<script>
const PAGES = ${JSON.stringify(pages)};
// Each phone gets its page injected here, so the file stays standalone.
for (const f of document.querySelectorAll('iframe[data-page]')) f.srcdoc = PAGES[f.dataset.page];

const slides = [...document.querySelectorAll('.s')];
let i = 0;
const num = document.getElementById('num');
const bar = document.querySelector('#bar i');
const hint = document.getElementById('hint');
// Arrow keys and F mean nothing on a touch screen.
if (matchMedia('(pointer:coarse)').matches) hint.textContent = 'Touchez pour avancer';
function show(n) {
  i = Math.max(0, Math.min(slides.length - 1, n));
  slides.forEach((s, k) => s.classList.toggle('on', k === i));
  num.textContent = (i + 1) + ' / ' + slides.length;
  bar.style.width = ((i + 1) / slides.length * 100) + '%';
  if (i > 0) hint.classList.add('gone');
  history.replaceState(null, '', '#' + (i + 1));
}
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  document.getElementById('stage').style.transform = 'translate(-50%,-50%) scale(' + s + ')';
}
addEventListener('resize', fit);
addEventListener('orientationchange', fit);
addEventListener('keydown', (e) => {
  if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); show(i + 1); }
  else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); show(i - 1); }
  else if (e.key === 'Home') show(0);
  else if (e.key === 'End') show(slides.length - 1);
  else if (e.key === 'f' || e.key === 'F') {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen();
  }
});
addEventListener('click', (e) => {
  // Real links (the address, the phone number) must still work.
  if (e.target.closest('a, button')) return;
  show(e.clientX < innerWidth * 0.25 ? i - 1 : i + 1);
});
document.getElementById('rotate-skip').addEventListener('click', () => document.body.classList.add('rotate-ok'));
fit();
show(Math.max(0, (parseInt(location.hash.slice(1), 10) || 1) - 1));
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log('slides:', slides.length, '| file:', (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB →', OUT);
