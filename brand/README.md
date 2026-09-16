# Le logo du Centre Espoir de Gatineau

Le phare, le nom, et « Banque alimentaire » en dessous. Deux verrouillages
(horizontal et empilé), trois couleurs, plus le symbole seul.

Ouvrez **`apercu.html`** d'un double-clic : tout y est, avec la zone de
protection et la taille minimale.

## Quel fichier donner

| À qui | Quoi |
|---|---|
| Un imprimeur, un graphiste | `logo-horizontal.svg` ou `logo-vertical.svg` |
| Canva, Word, les réseaux sociaux | les `.png` (fond transparent) |
| Un fond foncé ou terracotta | les versions `-creme` |
| Une gravure, un tampon, un fax | les versions `-encre` |
| Une icône, une photo de profil | `logo-symbole.svg` |

Le texte des SVG est **en tracés**, pas en caractères : aucune police à
fournir, aucune substitution possible chez l'imprimeur.

## Le refaire

Utile seulement si le dessin du phare change, ou le texte.

```bash
node brand/build/make-logo.mjs
```

Le script a besoin des trois polices dans `build/work/`. Elles ne sont pas
conservées dans Git ; pour les retélécharger :

```bash
cd brand/build/work
B=https://raw.githubusercontent.com/adobe-fonts
curl -sLO $B/source-serif/release/TTF/SourceSerif4Display-Regular.ttf
curl -sLO $B/source-sans/release/TTF/SourceSans3-Semibold.ttf
```

## Deux décisions, pour mémoire

**Le nom est en Source Serif 4 Display, pas en « Source Serif 4 ».** Cette
police change de dessin selon la taille à laquelle on l'emploie : un logo en
texte vivant se redessinerait donc tout seul entre une signature de courriel et
une affiche. Le verrouillage est figé sur la coupe « Display », celle qu'un
navigateur choisit aux tailles d'un logotype.

**L'interlettrage de « Banque alimentaire » est calculé, pas choisi.** Le script
résout la valeur qui lui fait atteindre exactement la largeur de « Centre
Espoir », aux deux bords. Si le nom change un jour, l'interlettrage se recalcule
tout seul.
