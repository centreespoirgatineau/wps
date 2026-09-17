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

Les polices sont dans `fonts/`, rien à télécharger.

## Les polices

Elles sont ici, sous licence libre (SIL Open Font License), utilisables pour
l'impression, le web et le marchandisage, sans redevance ni mention obligatoire.
Double-cliquez un `.ttf` puis « Installer » pour l'ajouter à Windows et à
Illustrator.

| Fichier | À quoi il sert |
|---|---|
| `SourceSerif4-VariableFont_opsz,wght.ttf` | Le serif, toutes les graisses et toutes les tailles optiques dans un seul fichier. **C'est celui à employer dans Illustrator** : réglez `wght` à 500 et `opsz` à 60 dans le panneau Caractère. |
| `SourceSerif4_48pt-Medium.ttf` | La coupe fixe la plus proche, si les curseurs de police variable vous embêtent. Environ 3 % plus large. |
| `SourceSerif4Display-Regular.ttf` | Ce qu'emploie `make-logo.mjs`. |
| `SourceSans3-Semibold.ttf` | « Banque alimentaire ». Une seule coupe, aucun réglage. |
| `SourceSans3VF-Upright.ttf` | Le même en police variable, si vous préférez. |
| `SourceSerif4-Italic.ttf` | L'italique de la même famille. Elle ne sert pas au texte du logo : c'est d'elle que vient la croix dans le « o » d'Espoir, qui est un « t » italique dont le pied a été coupé. |
| `OFL-*.txt` | Les licences. À conserver si vous transmettez les polices. |

### La taille optique, la seule chose à surveiller

Source Serif 4 se redessine selon la taille à laquelle on l'emploie : plus c'est
gros, plus les lettres sont étroites et les déliés fins. Entre les deux
extrêmes, l'écart atteint **13 % de largeur**. Un logo doit être figé sur une
seule taille optique, sinon il change de forme entre une signature de courriel
et une affiche. Le nôtre est calé sur **60**.

Une fois le nom composé dans Illustrator, faites **Texte → Vectoriser** avant
d'enregistrer le fichier maître. La forme est alors fixée pour de bon.

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
