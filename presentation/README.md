# La présentation aux églises

`presentation-surplus.html` — un diaporama de 11 diapositives pour présenter la
plateforme à d'autres églises. Il s'adapte à l'écran : téléphone à la verticale
ou à l'horizontale, tablette, portable, projecteur. Aucune bande noire, jamais.

## L'utiliser

**En ligne :** https://jc.centreespoir.ca/presentation — accessible à tous, sans
connexion. C'est le lien à donner aux églises.

**Hors ligne :** ouvrez `presentation-surplus.html` avec un double-clic.

**Sur un téléphone ou une tablette**
- Faites simplement défiler vers le bas : chaque diapositive s'arrête d'elle-même.
- Tenez l'appareil à la verticale : la mise en page est faite pour ça.

**Sur un ordinateur**
- La molette, ou **↓** **→** **espace** pour avancer, **↑** **←** pour reculer.
- **F** pour le plein écran (**Échap** pour en sortir).
- **Début** et **Fin** pour la première et la dernière diapositive.

Tout est dans le fichier : aucune connexion Internet n'est nécessaire, sauf pour
charger la police d'écriture (sans Internet, le texte s'affiche dans une police
très proche). Vous pouvez le copier sur une clé USB ou l'envoyer par courriel.

## Ce qu'il y a dedans

Les téléphones montrés dans les diapositives 6 à 9 ne sont pas des images :
ce sont les **vraies pages de la plateforme**, intégrées telles quelles, ce qui
les garde parfaitement nettes sur un projecteur.

Les dates qu'on y lit sont celles du jour où les captures ont été faites. Rien ne
casse en vieillissant, mais avant une grande présentation, refaire le diaporama
(voir plus bas) remet l'offre du jour à aujourd'hui.

Les églises, les personnes et les offres qu'on y voit sont **inventées pour la
démonstration** — d'où la mention « Exemple — données de démonstration » sous les
téléphones. Aucune donnée réelle, aucun vrai contact, aucun vrai numéro de
téléphone n'apparaît dans la présentation.

## La refaire

Utile si un texte change, ou si la plateforme change d'allure. Quatre étapes,
depuis la racine du projet :

```bash
# 1. Créer la base de démonstration (églises, offre du jour, offres passées)
node presentation/build/seed-demo.mjs presentation/build/work/data jc

# 2. Démarrer la plateforme sur cette base, sur le port 8100
DATA_DIR=presentation/build/work/data BRAND=jc PORT=8100 SMS_DRY_RUN=1 npm start

# 3. Dans un autre terminal : capturer les pages
node presentation/build/capture.mjs presentation/build/work/pages.json src/public/mark.svg

# 4. Assembler le diaporama
node presentation/build/build-deck.mjs presentation/build/work/pages.json \
     src/public/mark.svg presentation/presentation-surplus.html jc
```

La version en ligne est lue **au démarrage** de l'application : après avoir
refait le diaporama, il faut pousser le changement sur GitHub pour que le
serveur redémarre et serve la nouvelle version.

Il y a **deux diaporamas** : celui des églises (`jc`) et celui des banques
alimentaires (`spp`). Les étapes ci-dessus sont les mêmes pour l'un et l'autre :
remplacez `jc` par `spp` partout, et les fichiers par `work/data-spp`,
`work/pages-spp.json` et `presentation/presentation-spp.html`.

Le texte des diapositives se trouve dans `build/slides.jc.mjs` et
`build/slides.spp.mjs`, une diapositive à la fois. Le reste — la mise en page,
les téléphones, le défilement — est commun aux deux dans `build/build-deck.mjs`.
Après une retouche au commun, reconstruisez celui des églises et vérifiez que
`git diff` ne montre rien : c'est la preuve que rien n'a bougé. Les églises fictives et le contenu des offres
se trouvent dans `build/seed-demo.mjs`.

`presentation/build/work/` est un dossier de travail : il n'est pas conservé dans
Git et peut être effacé sans risque.

> Seuls les deux `.html` partent sur le serveur ; `build/` en est exclu.

## L'image d'aperçu des liens

Quand l'adresse du site est envoyée par texto, par courriel ou sur WhatsApp,
c'est une image qui s'affiche dans la vignette — `og.png` pour les églises,
`og-spp.png` pour les banques alimentaires. Aucune messagerie n'accepte une image
vectorielle à cet endroit, d'où les seules images matricielles du projet. Elles
se refont en une commande chacune :

```bash
node presentation/build/make-og.mjs src/public/mark.svg src/public/og.png jc
node presentation/build/make-og.mjs src/public/mark.svg src/public/og-spp.png spp
```

Le texte de la carte se trouve en haut de `build/make-og.mjs`. À refaire si le
logo ou ce texte change, puis à pousser sur GitHub comme le reste.

> La carte est dessinée par Chrome, en arrière-plan. Edge ne fait plus l'affaire :
> depuis une de ses mises à jour, il se termine sans rien écrire.
