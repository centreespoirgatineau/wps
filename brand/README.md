# Le logo du Centre Espoir de Gatineau

**Les logos officiels sont dans `logo/`.** C'est David qui les a dessinés dans
Adobe Illustrator, et c'est la seule référence : toute affiche, tout courriel,
tout document, tout site part de ces fichiers-là. Le reste de ce dossier est du
matériel de travail — les polices, les scripts, et les propositions que j'avais
générées avant.

## Le contenu de `logo/`

| Fichier | Ce que c'est |
|---|---|
| `Horizontaly aligned-02.svg` | **Le verrouillage horizontal** : le phare à gauche, le nom à droite. 335 × 77. |
| `Vertically aligned-01.svg` | **Le verrouillage vertical** : le phare au-dessus, le nom en dessous. 234 × 167. |
| `Icon-03.svg` | **Le symbole seul**, le phare sur son disque. 98 × 96. Pour une photo de profil, une favicone, un tampon. |
| `Icon-01.svg` | Un doublon exact de `Vertically aligned-01.svg`. |
| `Icon-02.svg` | Un doublon exact de `Horizontaly aligned-02.svg`. |
| `Edit.ai` | Le fichier maître Illustrator. C'est lui qu'on rouvre pour modifier quoi que ce soit. |

Trois choses à savoir avant de s'en servir :

- **Il n'y a que trois dessins pour cinq fichiers.** `Icon-01` et `Icon-02` ne
  sont pas des icônes : ce sont les deux verrouillages sous un autre nom. Seul
  `Icon-03` est le symbole. Vérifié en comparant les tracés, pas les noms.
- **Le texte est déjà en tracés**, pas en caractères : aucune police à fournir
  à un imprimeur, aucune substitution possible.
- **Les SVG pèsent 320 Ko chacun pour trente tracés.** Illustrator y conserve une
  copie privée du document (`i:pgf`) qui ne sert qu'à lui. C'est sans
  conséquence pour un imprimeur, mais c'est vingt fois trop lourd pour une page
  web. Pour le web, réexporter avec **Fichier → Exporter → Exporter pour les
  écrans**, ou décocher « Conserver les fonctions d'édition Illustrator ».

Les couleurs sont `#DA7757` (terracotta) et `#141413` (encre).

## Ce qu'il y a d'autre ici

| Dossier | Quoi |
|---|---|
| `fonts/` | Les polices, sous licence libre. Voir plus bas. |
| `build/` | Les scripts qui ont servi aux propositions. |
| `propositions/` | Ce que j'avais généré avant les logos officiels : `apercu.html` (les verrouillages proposés) et `croix.html` (la croix dans le « o » d'Espoir). Conservé comme trace, ce ne sont pas les logos. |

## Refaire les propositions

Le logo officiel se modifie dans `logo/Edit.ai`, pas ici. Ces scripts ne
regarderont jamais les fichiers de `logo/` : ils recomposent les propositions
à partir des polices, et écrivent dans `propositions/`.

```bash
node brand/build/make-logo.mjs     # les verrouillages proposés + apercu.html
node brand/build/make-croix.mjs    # la croix dans le « o » + croix.html
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
