![Résumés des époques](.github/banner.png)

# CoC7 – Résumés des époques

Module Foundry VTT (v13/v14) pour les campagnes **L'Appel de Cthulhu 7e jouées sur deux époques en alternance** (par exemple 1933 et 2025-2026). Il affiche aux joueurs le résumé de la dernière séance, avec **un fil de résumés par époque**.

Inspiré de [Résumé hebdomadaire](https://github.com/magisterphamtom/resume-hebdo), qui sert pour une campagne à une seule époque.

## Fonctionnalités

- **Ouverture automatique à la connexion** : le résumé non vu le plus récent s'affiche, une seule fois par joueur et par époque.
- **Deux fils séparés** : boutons d'époque en haut de la fenêtre, avec un repère « Nouveau » sur chaque époque qui a un résumé non vu.
- **Habillage selon l'époque** : papier et or pour 1933, bleu glacier pour 2025-2026.
- **Suit la Bascule d'époque** : avec [CoC7 – Bascule d'époque](https://github.com/magisterphamtom/coc7-bascule-epoque), la fenêtre s'ouvre sur l'époque en cours de la table (repère 📍).
- **Recto / verso** : une séance peut avoir deux images (par exemple un dossier sur deux pages) ; le bouton « Retourner » fait pivoter la feuille d'une face à l'autre.
- **Onglets par séance sur le côté droit** de chaque époque, pour relire tous les résumés précédents.
- **Zoom à la molette**, déplacement en glissant, double-clic pour ajuster ; l'image tient toujours dans la fenêtre.
- **Voir en grand** : un clic sur l'image (ou le bouton « Voir en grand ») ouvre le résumé sur tout l'écran, hors de la fenêtre, aux couleurs de l'époque : zoom jusqu'à ×4, « Retourner » s'il y a un verso ; Échap, la croix ou un clic sur le fond pour fermer.
- **Bouton 📜** dans la barre de gauche pour rouvrir la fenêtre, et bouton MJ **Montrer à tous**.

## Installation

Dans Foundry : Modules complémentaires, Installer un module, puis coller le lien du manifeste :

`https://github.com/magisterphamtom/coc7-resume-epoques/releases/latest/download/module.json`

## Utilisation

Les résumés se trouvent dans `worlds/<monde>/resume/` (dossier de données de Foundry), avec un fichier `index.json` :

```json
{
  "resumes": [
    { "epoque": "1933", "session": 4, "titre": "Le quai de Brooklyn", "fichier": "1933-session-04.webp", "date": "2026-11-10" },
    { "epoque": "2026", "session": 3, "titre": "La base Halley", "fichier": "2026-session-03.webp", "date": "2026-11-03" },
    { "epoque": "1933", "session": 3, "titre": "Les archives", "fichier": "1933-session-03.webp", "date": "2026-10-20" }
  ]
}
```

- `epoque` : `1933` ou `2026` (ou 2025, la clé interne est la même que Bascule d'époque).
- `session` : numéro de la séance **dans son époque** (chaque époque a sa propre numérotation).
- `fichier` : nom de l'image déposée dans le même dossier.
- `verso` (facultatif) : seconde image de la séance, affichée par le bouton « Retourner ».
- `date` (AAAA-MM-JJ) : sert à savoir quel résumé est le plus récent, toutes époques confondues.

À chaque nouvelle séance : déposer l'image et ajouter une ligne à `index.json`. Les joueurs ne peuvent pas parcourir les fichiers, c'est pourquoi la liste est nécessaire.

## Réglages

- **Ouvrir le résumé à la connexion** (chaque utilisateur) : activé par défaut.

## Licence

MIT
