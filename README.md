# Amiral

La bataille navale (« touché coulé ») dans le navigateur. Placez votre flotte, choisissez la taille de la grille et le niveau de l'ordinateur, puis coulez ses navires avant qu'il ne coule les vôtres.

Le jeu est une **PWA** : on peut l'installer sur son téléphone ou son ordinateur et y jouer hors ligne.

## Jouer

- **Placement** : glissez les navires du chantier naval vers la grille. Touchez un navire posé pour le tourner d'un quart de tour (4 directions). Le bouton « Placement aléatoire » dispose toute la flotte d'un coup.
- **Grille** : 8 × 8, 10 × 10 (par défaut) ou 12 × 12.
- **Ordinateur** : Facile (tirs au hasard), Moyen (chasse autour de chaque touché), Difficile (carte de probabilités).
- **Règle** : « Rejouer après un tir réussi » est activée par défaut.

Flotte : porte-avions (5), croiseur (4), contre-torpilleur (3), sous-marin (3), torpilleur (2).

## Lancer en local

Aucune étape de build. Il suffit de servir le dossier avec n'importe quel serveur statique, par exemple :

```sh
python3 -m http.server 8000
```

puis ouvrir http://localhost:8000. (Ouvrir `index.html` directement depuis le disque ne marche pas : les modules JavaScript exigent un serveur.)

## Mettre en ligne avec GitHub Pages

Dans le dépôt GitHub : **Settings → Pages → Build and deployment**, source « Deploy from a branch », branche `main`, dossier `/ (root)`. Le jeu est alors publié à l'adresse `https://<compte>.github.io/amiral/`.

À chaque nouvelle version, changez `VERSION` dans `sw.js` pour que les joueurs reçoivent la mise à jour.

## Organisation du code

| Fichier | Rôle |
| --- | --- |
| `src/engine.js` | Règles : plateaux, placement, tirs, tours. Aucun accès à la page, tout l'état est en JSON simple. |
| `src/ai.js` | L'adversaire ordinateur, qui ne voit que ce qu'un joueur verrait. |
| `src/ui.js` | L'interface : affichage, glisser-déposer, animations. |
| `styles.css` | Le thème naval. |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installation et jeu hors ligne. |

La séparation entre règles et interface prépare la partie en ligne : deux joueurs pourront échanger leurs tirs (par exemple en pair à pair avec PeerJS) sans toucher au moteur.

## Prochaine étape

Partie en ligne entre amis : créer une partie, partager un code court, l'ami rejoint.
