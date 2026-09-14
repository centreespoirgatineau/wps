// Assemble the slideshow: one self-contained HTML file, 1920x1080 per slide.
import fs from 'node:fs';

const pages = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mark = fs.readFileSync(process.argv[3]).toString('base64');
const OUT = process.argv[4];

/** A phone showing part of a captured page. `top` scrolls the page inside it. */
const phone = (key, top = 0, { scale = 1, tall = 2200 } = {}) => `
<div class="phone" style="--s:${scale}">
  <div class="screen"><iframe data-page="${key}" style="top:${-top}px;height:${tall}px" scrolling="no" tabindex="-1" title=""></iframe></div>
</div>`;

const demoTag = `<div class="demo-tag">Exemple — données de démonstration</div>`;

const slides = [];

// 1 ------------------------------------------------------------------ title
slides.push(`
<section class="s title">
  <img class="logo" src="data:image/png;base64,${mark}" alt="">
  <h1>Rien ne devrait<br>se perdre.</h1>
  <p class="lede">Une plateforme pour distribuer les surplus alimentaires du<br>Centre Espoir de Gatineau — le jour même, entre églises.</p>
  <div class="title-foot">
    <span>Centre Espoir de Gatineau</span>
    <span class="dot">·</span>
    <span>wps.davidhatin.com</span>
  </div>
</section>`);

// 2 ---------------------------------------------------------------- problem
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Le problème</div>
      <div class="bignum">1 500 $</div>
      <h2 class="tight">de sushis jetés,<br>le 10 septembre.</h2>
    </div>
    <div class="col">
      <p class="big">Un surplus arrive sans prévenir. Il doit repartir <strong>avant la fin de la journée</strong>.</p>
      <p class="big">Le temps de faire le tour des contacts un par un, au téléphone, il est déjà trop tard.</p>
      <p class="big muted">Ce qui reste part à la poubelle.</p>
    </div>
  </div>
</section>`);

// 3 ------------------------------------------------------------------- idea
slides.push(`
<section class="s">
  <div class="eyebrow center">La solution</div>
  <h2 class="center headline">Un texto. Un lien.<br>Une heure plus tard, tout est parti.</h2>
  <div class="steps">
    <div class="step"><div class="n">1</div><h3>Le Centre Espoir publie</h3><p>Une offre : ce que contient un lot, combien de lots, où et jusqu’à quelle heure.</p></div>
    <div class="arrow">→</div>
    <div class="step"><div class="n">2</div><h3>Toutes les églises reçoivent un texto</h3><p>Au même moment, avec un lien personnel qui ouvre l’offre.</p></div>
    <div class="arrow">→</div>
    <div class="step"><div class="n">3</div><h3>Chacune réserve sa part</h3><p>Premier arrivé, premier servi. Vous venez chercher, et c’est tout.</p></div>
  </div>
</section>`);

// 4 -------------------------------------------------------------------- sms
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Étape 1</div>
      <h2>Tout commence<br>par un texto.</h2>
      <ul class="ticks">
        <li>Rien à installer.</li>
        <li>Aucun mot de passe à retenir.</li>
        <li>Le lien vous connecte directement.</li>
      </ul>
      <p class="note">Le texto part à toutes les églises actives en même temps. Personne n’est prévenu avant les autres.</p>
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

// 5 ------------------------------------------------------------------ offer
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Étape 2</div>
      <h2>Vous voyez<br>exactement ce<br>qui est offert.</h2>
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

// 6 ---------------------------------------------------------------- reserve
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Étape 3</div>
      <h2>Vous réservez<br>en un geste.</h2>
      <ul class="ticks">
        <li>Un lot réservé est retiré aussitôt pour les autres.</li>
        <li>Vous voyez qui a pris quoi, en direct.</li>
        <li>Vous changez d’avis ? Vous libérez le lot.</li>
      </ul>
      <p class="note">Premier arrivé, premier servi — et une courte attente de 15 minutes pour ceux qui ont déjà réservé à l’offre précédente, pour laisser une chance à tous.</p>
    </div>
    <div class="col center-col">${phone('offer', 545)}${demoTag}</div>
  </div>
</section>`);

// 7 ------------------------------------------------------------------- chat
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Étape 4</div>
      <h2>Vous vous<br>organisez<br>entre vous.</h2>
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

// 8 ------------------------------------------------------------------- list
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Toujours à jour</div>
      <h2>L’offre du jour,<br>et toutes<br>les précédentes.</h2>
      <ul class="ticks">
        <li>Ce qui est en cours, en haut.</li>
        <li>Ce qui est passé, en dessous.</li>
        <li>Combien de lots restent libres.</li>
      </ul>
    </div>
    <div class="col center-col">${phone('list', 0, { tall: 1000 })}${demoTag}</div>
  </div>
</section>`);

// 9 ------------------------------------------------------------------ rules
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Les règles</div>
      <h2>Trois règles,<br>pour que ce<br>soit juste.</h2>
      <ol class="rules">
        <li><strong>Les surplus servent l’Évangile.</strong> Ces lots sont un outil pour annoncer Jésus-Christ.</li>
        <li><strong>Réserver, c’est s’engager.</strong> Qui ne vient pas ne peut pas réserver à l’offre suivante. Après trois absences, le contact quitte la liste.</li>
        <li><strong>Tout reste confidentiel.</strong> Les coordonnées et les discussions ne sortent pas de la plateforme.</li>
      </ol>
    </div>
    <div class="col center-col">${phone('about', 660, { tall: 1600 })}</div>
  </div>
</section>`);

// 10 ------------------------------------------------------------------ cost
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

// 11 ----------------------------------------------------------------- gospel
slides.push(`
<section class="s gospel">
  <div class="quote-mark">“</div>
  <blockquote>
    Ces surplus ne sont pas seulement<br>
    de la nourriture sauvée.<br>
    Ce sont des occasions de partager<br>
    l’Évangile de Jésus-Christ.
  </blockquote>
  <p class="attrib">Règle n° 1 de la plateforme</p>
</section>`);

// 12 ------------------------------------------------------------------ join
slides.push(`
<section class="s join">
  <div class="split">
    <div class="col">
      <div class="eyebrow">Rejoindre la liste</div>
      <h2>Vous voulez<br>en être ?</h2>
      <p class="big">Faites votre demande en ligne, ou parlez-en directement à David.</p>
      <div class="cta">wps.davidhatin.com/demande</div>
      <div class="contact">
        <strong>David Hatin</strong> · Directeur général<br>
        Centre Espoir de Gatineau<br>
        <span class="tel">819-208-5721</span>
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
<meta name="viewport" content="width=device-width, initial-scale=1">
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
body{font-family:var(--sans);color:var(--ink)}

/* The stage is always 1920x1080 and is scaled to fit whatever screen it is on. */
#stage{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform-origin:center center}
.s{position:absolute;inset:0;background:var(--bg);padding:96px 120px;display:none;flex-direction:column;justify-content:center}
.s.on{display:flex}
h1,h2,h3,blockquote{font-family:var(--serif);font-weight:500;margin:0;letter-spacing:-.015em;color:var(--ink)}
h1{font-size:118px;line-height:1.02}
h2{font-size:72px;line-height:1.08}
h2.headline{font-size:86px}
h2.tight{font-size:66px;line-height:1.1}
h3{font-size:30px;line-height:1.25;margin-bottom:12px}
p{margin:0 0 20px}
.eyebrow{font-size:20px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-ink);font-weight:600;margin-bottom:22px}
.center{text-align:center}
.muted{color:var(--ink-2)}
.big{font-size:32px;line-height:1.5;color:var(--ink-2);max-width:22ch}
.big strong{color:var(--ink);font-weight:600}
.note{font-size:21px;line-height:1.55;color:var(--ink-3);max-width:46ch}
.note.wide{max-width:none;font-size:24px;margin-top:40px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center;height:100%}
.col{min-width:0}
.center-col{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}

/* title */
.title{align-items:flex-start;justify-content:center}
.title .logo{width:132px;height:auto;margin-bottom:46px}
.lede{font-size:31px;line-height:1.5;color:var(--ink-2);margin-top:34px}
.title-foot{position:absolute;left:120px;bottom:82px;font-size:21px;color:var(--ink-3);letter-spacing:.02em}
.title-foot .dot{margin:0 12px;color:var(--line)}

/* problem */
.bignum{font-family:var(--serif);font-size:190px;line-height:1;color:var(--accent);letter-spacing:-.03em;margin-bottom:10px}

/* steps */
.steps{display:flex;align-items:stretch;gap:26px;margin-top:66px}
.step{flex:1;background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:38px 34px;
  box-shadow:0 1px 2px rgba(20,20,19,.04),0 18px 44px -30px rgba(20,20,19,.3)}
.step .n{width:52px;height:52px;border-radius:50%;background:var(--accent-soft);color:var(--accent-ink);
  font-family:var(--serif);font-size:27px;display:flex;align-items:center;justify-content:center;margin-bottom:22px}
.step p{font-size:21px;line-height:1.5;color:var(--ink-2);margin:0}
.arrow{align-self:center;font-size:36px;color:var(--line)}

/* lists */
.ticks{list-style:none;margin:36px 0 0;padding:0}
.ticks li{position:relative;padding-left:44px;font-size:27px;line-height:1.45;margin-bottom:20px;color:var(--ink)}
.ticks li::before{content:"";position:absolute;left:6px;top:14px;width:13px;height:13px;border-radius:50%;background:var(--accent)}
.rules{margin:36px 0 0;padding-left:0;list-style:none;counter-reset:r}
.rules li{counter-increment:r;position:relative;padding-left:64px;font-size:24px;line-height:1.5;color:var(--ink-2);margin-bottom:28px}
.rules li strong{color:var(--ink);display:block;font-size:26px;margin-bottom:4px}
.rules li::before{content:counter(r);position:absolute;left:0;top:-2px;width:42px;height:42px;border-radius:50%;
  background:var(--accent-soft);color:var(--accent-ink);font-family:var(--serif);font-size:23px;display:flex;align-items:center;justify-content:center}

/* nothing-required grid */
.nots{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin-top:70px}
.not{background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:38px 30px;text-align:center}
.not span{display:block;font-size:20px;color:var(--ink-3);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px}
.not strong{display:block;font-family:var(--serif);font-size:38px;font-weight:500;margin-bottom:8px}
.not em{font-style:normal;font-size:20px;color:var(--ink-2)}

/* gospel */
.gospel{align-items:center;text-align:center;background:var(--accent-soft)}
.quote-mark{font-family:var(--serif);font-size:150px;line-height:.6;color:var(--accent);opacity:.5;margin-bottom:30px}
blockquote{font-size:62px;line-height:1.3;max-width:none}
.attrib{margin-top:48px;font-size:22px;color:var(--accent-ink);letter-spacing:.1em;text-transform:uppercase;font-weight:600}

/* join */
.cta{display:inline-block;margin:14px 0 34px;padding:22px 38px;border-radius:999px;background:var(--accent);color:#fff;
  font-size:34px;font-weight:600;letter-spacing:.01em}
.contact{font-size:25px;line-height:1.6;color:var(--ink-2)}
.contact strong{color:var(--ink)}
.contact .tel{font-size:32px;color:var(--accent-ink);font-weight:600}
.join .note{margin-top:26px}

/* text-message mock */
.sms-phone{width:470px;border-radius:34px;background:var(--surface);border:1px solid var(--line);overflow:hidden;
  box-shadow:0 30px 70px -40px rgba(20,20,19,.5)}
.sms-head{padding:20px 26px;border-bottom:1px solid var(--line);font-size:19px;color:var(--ink-3);
  letter-spacing:.06em;text-transform:uppercase;font-weight:600}
.sms-body{padding:30px 26px 34px}
.bubble{background:#E9E8E2;border-radius:22px 22px 22px 6px;padding:24px 26px;font-size:23px;line-height:1.5;color:var(--ink)}
.bubble .link{color:var(--accent-ink);text-decoration:underline;word-break:break-all}
.sms-time{margin-top:14px;font-size:17px;color:var(--ink-3)}

/* phone frame */
.phone{width:390px;height:844px;border-radius:52px;background:#171614;padding:12px;flex:none;
  transform:scale(var(--s,1));box-shadow:0 40px 90px -40px rgba(20,20,19,.55),0 0 0 1px rgba(20,20,19,.08)}
.screen{position:relative;width:100%;height:100%;border-radius:41px;overflow:hidden;background:var(--bg)}
.screen iframe{position:absolute;left:0;width:390px;border:0;display:block}
.demo-tag{font-size:17px;color:var(--ink-3);letter-spacing:.06em;text-transform:uppercase}

/* chrome */
#bar{position:fixed;left:0;right:0;bottom:0;height:4px;background:rgba(20,20,19,.08);z-index:10}
#bar i{display:block;height:100%;background:var(--accent);transition:width .25s ease}
#num{position:fixed;right:22px;bottom:18px;font-size:14px;color:var(--ink-3);z-index:10;font-variant-numeric:tabular-nums}
#hint{position:fixed;left:22px;bottom:16px;font-size:13px;color:var(--ink-3);z-index:10;transition:opacity .6s ease}
#hint.gone{opacity:0}
</style>
</head>
<body>
<div id="stage">${slides.join('\n')}</div>
<div id="bar"><i></i></div>
<div id="num"></div>
<div id="hint">← → pour naviguer · F pour le plein écran</div>
<script>
const PAGES = ${JSON.stringify(pages)};
// Each phone gets its page injected here, so the file stays standalone.
for (const f of document.querySelectorAll('iframe[data-page]')) f.srcdoc = PAGES[f.dataset.page];

const slides = [...document.querySelectorAll('.s')];
let i = 0;
const num = document.getElementById('num');
const bar = document.querySelector('#bar i');
const hint = document.getElementById('hint');
function show(n) {
  i = Math.max(0, Math.min(slides.length - 1, n));
  slides.forEach((s, k) => s.classList.toggle('on', k === i));
  num.textContent = (i + 1) + ' / ' + slides.length;
  bar.style.width = ((i + 1) / slides.length * 100) + '%';
  if (i > 0) hint.classList.add('gone');
  location.hash = i + 1;
}
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  document.getElementById('stage').style.transform = 'translate(-50%,-50%) scale(' + s + ')';
}
addEventListener('resize', fit);
addEventListener('keydown', (e) => {
  if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); show(i + 1); }
  else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); show(i - 1); }
  else if (e.key === 'Home') show(0);
  else if (e.key === 'End') show(slides.length - 1);
  else if (e.key === 'f' || e.key === 'F') {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen();
  }
});
addEventListener('click', (e) => { if (!e.target.closest('#hint')) show(e.clientX < innerWidth * 0.25 ? i - 1 : i + 1); });
fit();
show(Math.max(0, (parseInt(location.hash.slice(1), 10) || 1) - 1));
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log('slides:', slides.length, '| file:', (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB →', OUT);
