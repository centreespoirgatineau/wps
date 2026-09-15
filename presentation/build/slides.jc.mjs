// The wording of the church slideshow (BRAND=jc). The shell it is poured into —
// layout, type scale, scrolling, the phone mock-ups — lives in build-deck.mjs
// and is shared with the other audience. One slide per block.
export const meta = {
  title: 'Un outil pour annoncer l’Évangile de Jésus-Christ',
  ogTitle: 'Un outil pour annoncer l’Évangile de Jésus-Christ',
  ogDesc: 'Comment une église annonce l’Évangile de Jésus-Christ en redistribuant les surplus alimentaires du Centre Espoir de Gatineau.',
  ogAlt: 'Le phare du Centre Espoir de Gatineau, et les mots « Un outil pour annoncer l’Évangile de Jésus-Christ »',
  ogImage: '/static/og.png',
};

export function slides({ phone, mark }) {
  const slides = [];


// 1 ------------------------------------------------------------------ title
slides.push(`
<section class="s title">
  <div class="mid">
    <img class="logo" src="data:image/svg+xml;base64,${mark}" alt="">
    <h1>Un outil pour annoncer l’Évangile</h1>
    <p class="lede">Le Centre Espoir de Gatineau souhaite redistribuer ses surplus
      alimentaires par l’entremise des églises locales, afin de créer des occasions
      de partager l’Évangile de Jésus-Christ.</p>
  </div>
</section>`);

// 2 ---------------------------------------------------------------- problem
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <p class="eyebrow">Le problème</p>
      <h2>Agir le jour même.</h2>
    </div>
    <div class="col">
      <p class="big">Comme nous sommes une banque alimentaire, nous recevons parfois des surplus qui doivent être redistribués le jour même.</p>
      <p class="big">Le temps de joindre nos contacts un à un, il est souvent déjà trop tard.</p>
      <p class="big accent-text">Pour nous, ce n’est pas seulement de la nourriture qui finit à la poubelle, c’est une porte qui se ferme.</p>
    </div>
  </div>
</section>`);

// 3 ---------------------------------------------------------------- purpose
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <h2>Ce n’est pas qu’une question de nourriture.</h2>
      <p class="big">Un repas partagé, une famille visitée, une conversation qui s’ouvre, <strong>voilà ce que ces surplus rendent possible.</strong></p>
    </div>
    <div class="col">
      <div class="pull">
        <p class="pull-label">Règle n° 1 de la plateforme</p>
        <p class="pull-text">Ces lots de nourriture doivent servir d’outil pour prêcher l’Évangile de Jésus-Christ.</p>
      </div>
      <p class="note">Cette règle n’est pas une formalité&nbsp;: c’est la raison d’être de la plateforme, et chaque contact l’accepte avant de réserver.</p>
    </div>
  </div>
</section>`);

// 4 ------------------------------------------------------------------- idea
slides.push(`
<section class="s">
  <div class="mid">
    <p class="eyebrow center">Comment ça marche</p>
    <h2 class="center">Un texto. Un lien. La même journée, tout est parti.</h2>
    <div class="steps">
      <div class="step"><span class="n">1</span><h3>Le Centre Espoir publie</h3><p>Ce que contient un lot, combien de lots, où aller le récupérer, et jusqu’à quelle heure.</p></div>
      <div class="step"><span class="n">2</span><h3>Les églises reçoivent un texto</h3><p>Toutes au même moment, avec un lien qui ouvre l’offre.</p></div>
      <div class="step"><span class="n">3</span><h3>Chacune réserve sa part</h3><p>Premier arrivé, premier servi. Il ne reste qu’à venir la chercher.</p></div>
    </div>
  </div>
</section>`);

// 5 -------------------------------------------------------------------- sms
slides.push(`
<section class="s">
  <div class="split">
    <div class="col">
      <p class="eyebrow">Étape 1</p>
      <h2>Tout commence par un texto.</h2>
      <ul class="ticks">
        <li>Rien à installer.</li>
        <li>Aucun mot de passe à retenir.</li>
        <li>Le lien vous connecte directement.</li>
      </ul>
      <p class="note">Le texto part à toutes les églises en même temps. Personne n’est prévenu avant les autres.</p>
    </div>
    <div class="col shot-col">
      <div class="sms">
        <p class="sms-head">Centre Espoir</p>
        <p class="bubble">Bonjour Daniel,<br><br>Surplus disponible aujourd’hui&nbsp;:<br>Plateaux de sushis et salades, 8 lot(s).<br><br><span class="link">__ORIGIN__/o/1/…</span></p>
        <p class="sms-time">aujourd’hui, 10H16</p>
      </div>
    </div>
  </div>
</section>`);

// 6 ------------------------------------------------------------------ offer
slides.push(`
<section class="s shot-slide">
  <div class="split">
    <div class="col">
      <p class="eyebrow">Étape 2</p>
      <h2>Vous voyez exactement ce qui est offert.</h2>
      <ul class="ticks">
        <li>Ce que contient un lot.</li>
        <li>Combien de lots sont disponibles.</li>
        <li>Le lieu et l’heure limite du ramassage.</li>
      </ul>
    </div>
    <div class="col shot-col">${phone('offer', 0)}</div>
  </div>
</section>`);

// 7 ---------------------------------------------------------------- reserve
slides.push(`
<section class="s shot-slide">
  <div class="split">
    <div class="col">
      <p class="eyebrow">Étape 3</p>
      <h2>Vous réservez en un geste.</h2>
      <ul class="ticks">
        <li>Un lot réservé disparaît aussitôt pour les autres.</li>
        <li>Vous voyez qui a pris quoi, en direct.</li>
        <li>Réserver un lot, c’est s’engager à venir le chercher.</li>
      </ul>
    </div>
    <div class="col shot-col">${phone('offer', 600)}</div>
  </div>
</section>`);

// 8 ------------------------------------------------------------------- chat
slides.push(`
<section class="s shot-slide">
  <div class="split">
    <div class="col">
      <p class="eyebrow">Étape 4</p>
      <h2>Vous vous organisez entre vous.</h2>
      <ul class="ticks">
        <li>«&nbsp;Je peux prendre ton lot en passant.&nbsp;»</li>
        <li>«&nbsp;Quelqu’un va vers Aylmer&nbsp;?&nbsp;»</li>
        <li>Chaque église a sa couleur, d’un coup d’œil.</li>
      </ul>
    </div>
    <div class="col shot-col">${phone('offer', 1340)}</div>
  </div>
</section>`);

// 9 ------------------------------------------------------------------- list
slides.push(`
<section class="s shot-slide">
  <div class="split">
    <div class="col">
      <p class="eyebrow">Toujours à jour</p>
      <h2>L’offre du jour, et toutes les précédentes.</h2>
      <ul class="ticks">
        <li>Ce qui est en cours, en haut.</li>
        <li>Ce qui est passé, en dessous.</li>
        <li>Combien de lots restent libres.</li>
      </ul>
    </div>
    <div class="col shot-col">${phone('list', 0)}</div>
  </div>
</section>`);

// 10 ----------------------------------------------------------------- rules
slides.push(`
<section class="s">
  <div class="mid">
    <p class="eyebrow center">Les règles</p>
    <h2 class="center">Trois règles, pour que ce soit juste.</h2>
    <ol class="rules">
      <li class="first"><strong>Les surplus servent l’Évangile.</strong> Ces lots sont un outil pour annoncer Jésus-Christ. C’est la première règle, et la raison d’être de la plateforme.</li>
      <li><strong>Réserver, c’est s’engager.</strong> Qui ne vient pas ne peut pas réserver à l’offre suivante. Après trois absences, le contact quitte la liste.</li>
      <li><strong>Tout reste confidentiel.</strong> Les coordonnées et les discussions ne sortent pas de la plateforme.</li>
    </ol>
  </div>
</section>`);

// 11 ------------------------------------------------------------------ join
slides.push(`
<section class="s join">
  <div class="mid">
    <p class="eyebrow center">Rejoindre la liste</p>
    <h2 class="center">Vous voulez en être&nbsp;?</h2>
    <p class="big center">Faites votre demande en ligne, ou parlez-en directement à David.</p>
    <p class="center"><a class="cta" href="__ORIGIN__/demande">__HOST__/demande</a></p>
    <p class="contact center"><strong>David Hatin</strong> · Directeur général<br>Centre Espoir de Gatineau<br>
      <a class="tel" href="tel:+18192085721">819-208-5721</a></p>
    <p class="note center"><strong>Un seul représentant par église.</strong><br>Idéalement, c’est le pasteur qui désigne la personne chargée d’aller chercher les lots.</p>
    <p class="note center">Vous recevrez un texto dès que votre demande sera approuvée.</p>
  </div>
</section>`);

  return slides;
}
