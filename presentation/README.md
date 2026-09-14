# La présentation aux églises

`presentation-surplus.html` — un diaporama de 12 diapositives, en 1920 × 1080,
pour présenter la plateforme à d'autres églises.

## L'utiliser

Ouvrez le fichier avec un double-clic : il s'ouvre dans votre navigateur.

- **F** — plein écran (et **Échap** pour en sortir)
- **→** ou **espace** ou un clic — diapositive suivante
- **←** ou un clic dans le quart gauche de l'écran — diapositive précédente

Tout est dans le fichier : aucune connexion Internet n'est nécessaire, sauf pour
charger la police d'écriture (sans Internet, le texte s'affiche dans une police
très proche). Vous pouvez le copier sur une clé USB ou l'envoyer par courriel.

## Ce qu'il y a dedans

Les téléphones montrés dans les diapositives 5 à 9 et 12 ne sont pas des images :
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

Le texte des diapositives se trouve dans `build/build-deck.mjs`, en haut du
fichier, une diapositive à la fois. Les églises fictives et le contenu des offres
se trouvent dans `build/seed-demo.mjs`.

`presentation/build/work/` est un dossier de travail : il n'est pas conservé dans
Git et peut être effacé sans risque.

> Ce dossier est exclu de l'image Docker : il ne part jamais sur le serveur.
