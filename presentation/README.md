# La présentation aux églises

`presentation-surplus.html` — un diaporama de 13 diapositives pour présenter la
plateforme à d'autres églises. Il s'adapte à l'écran : téléphone à la verticale
ou à l'horizontale, tablette, portable, projecteur. Aucune bande noire, jamais.

## L'utiliser

**En ligne :** https://wps.davidhatin.com/presentation — accessible à tous, sans
connexion. C'est le lien à donner aux églises.

**Hors ligne :** ouvrez `presentation-surplus.html` avec un double-clic.

**Sur un téléphone ou une tablette**
- Glissez vers la gauche ou la droite, comme dans une galerie de photos.
- Ou touchez : à droite pour avancer, dans le tiers gauche pour reculer.
- Les points au bas de l'écran indiquent où vous êtes ; touchez-en un pour y aller.

**Sur un ordinateur**
- **→** ou **espace** ou un clic pour avancer, **←** pour reculer.
- **F** pour le plein écran (**Échap** pour en sortir).
- **Début** et **Fin** pour la première et la dernière diapositive.

Tout est dans le fichier : aucune connexion Internet n'est nécessaire, sauf pour
charger la police d'écriture (sans Internet, le texte s'affiche dans une police
très proche). Vous pouvez le copier sur une clé USB ou l'envoyer par courriel.

## Ce qu'il y a dedans

Les téléphones montrés dans les diapositives 6 à 9 ne sont pas des images :
ce sont les **vraies pages de la plateforme**, intégrées telles quelles, ce qui
les garde parfaitement nettes sur un projecteur.

Les églises, les personnes et les offres qu'on y voit sont **inventées pour la
démonstration** — d'où la mention « Exemple — données de démonstration » sous les
téléphones. Aucune donnée réelle, aucun vrai contact, aucun vrai numéro de
téléphone n'apparaît dans la présentation.

## La refaire

Utile si un texte change, ou si la plateforme change d'allure. Quatre étapes,
depuis la racine du projet :

```bash
# 1. Créer la base de démonstration (églises, offre du jour, offres passées)
node presentation/build/seed-demo.mjs presentation/build/work/data

# 2. Démarrer la plateforme sur cette base, sur le port 8100
DATA_DIR=presentation/build/work/data PORT=8100 SMS_DRY_RUN=1 npm start

# 3. Dans un autre terminal : capturer les pages
node presentation/build/capture.mjs presentation/build/work/pages.json presentation/build/mark-small.png

# 4. Assembler le diaporama
node presentation/build/build-deck.mjs presentation/build/work/pages.json \
     presentation/build/mark-small.png presentation/presentation-surplus.html
```

La version en ligne est lue **au démarrage** de l'application : après avoir
refait le diaporama, il faut pousser le changement sur GitHub pour que le
serveur redémarre et serve la nouvelle version.

Le texte des diapositives se trouve dans `build/build-deck.mjs`, en haut du
fichier, une diapositive à la fois. Les églises fictives et le contenu des offres
se trouvent dans `build/seed-demo.mjs`.

`presentation/build/work/` est un dossier de travail : il n'est pas conservé dans
Git et peut être effacé sans risque.

> Seul `presentation-surplus.html` part sur le serveur ; `build/` en est exclu.
