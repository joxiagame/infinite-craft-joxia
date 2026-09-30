# Infinite Craft Joxia

Un clone **100 % statique** du jeu *Infinite Craft* (Neal.fun), hébergé gratuitement sur GitHub Pages, sans backend ni appel API.

Mélange l'**Eau**, le **Feu**, le **Vent** et la **Terre** pour découvrir de nouveaux éléments, à l'infini.

## Caractéristiques

- **793 068 éléments** et **6 669 547 combinaisons uniques** — la base complète de la communauté.
- **Zéro backend** : tout est calculé côté client (un simple `ArrayBuffer` + recherche binaire).
- **Design soigné** : thème cosmique sombre, orbes animées, particules, mode sombre, responsive mobile.
- **Sauvegarde locale** automatique (localStorage) : découvertes + position des éléments.
- **Recherche** instantanée dans la liste des découvertes.
- **Accessible** : clavier (Tab + Entrée), combinaison par clic-clic en plus du glisser-déposer, `prefers-reduced-motion`.

## Jouer

1. Glisse un élément sur un autre **ou** sélectionne-les un à un (clic).
2. Si la combinaison existe, les deux ingrédients **fusionnent** en un nouvel élément. Sinon, « Rien » ne se forme.
3. Clique (ou glisse) un élément de la liste pour le poser sur le plateau, autant de fois que tu veux (ex. Eau + Eau).
4. **Corbeille** (en bas à gauche) : dépose un élément dessus, ou sur la liste, pour le jeter. Clic sur la corbeille = jeter l'élément sélectionné, ou vider le plateau. Touche Suppr sur un élément = le jeter.
5. Une **première découverte** déclenche une célébration.
6. Consulte et recherche toutes tes découvertes dans la liste de droite.

## Lancer en local

```bash
python -m http.server 8000
# puis ouvrir http://localhost:8000
```

(un simple serveur statique suffit ; aucun build requis.)

## Données

Les éléments et les recettes proviennent du dépôt open-source
[expitau/InfiniteCraftWiki](https://github.com/expitau/InfiniteCraftWiki)
(licence **MIT**, © 2025 Nathan DSilva), qui archive les résultats de la
communauté Infinite Craft.

Les fichiers `data/elements.json` (noms + emojis) et `data/recipes.data`
(adjacence gzip) sont générés par le script `build.py` à partir du
`data.json` officiel du wiki. Le jeu charge ces données au démarrage
(~25 Mo, progressif) puis fonctionne entièrement hors-ligne.

## Licence

- Code de ce projet : **MIT** (voir `LICENSE`).
- Jeu de données : **MIT** © 2025 Nathan DSilva (InfiniteCraftWiki).

*Infinite Craft* est un jeu de Neal Agarwal (Neal.fun). Ce projet est un
clone non-officiel à but éducatif, sans affiliation.
