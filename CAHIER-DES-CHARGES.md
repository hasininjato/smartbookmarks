Oui, c'est **principalement une extension d'éditeur de code** — avec un moteur intelligent en arrière-plan. Voici le cahier des charges complet.

---

# 📌 SmartBookmarks — Cahier des Charges Complet

## 1. Vision Produit

**Problème :** Les signets classiques (`Ctrl+Shift+Num`) sont liés à des numéros de ligne. Dès qu'on ajoute 10 lignes au-dessus, tous les signets sont décalés et deviennent faux. Les commentaires `// TODO` polluent le code et sont difficiles à retrouver.

**Solution :** Un système de signets **sémantiques** qui s'accrochent aux éléments de code (fonctions, classes, variables) et non aux lignes. Si tu renommes la fonction ou la déplaces dans un autre fichier, le signet la suit.

---

## 2. Architecture Générale

```
┌─────────────────────────────────────────┐
│         EXTENSION VS CODE               │  ← Interface utilisateur
│  (TypeScript, VS Code Extension API)    │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      MOTEUR SÉMANTIQUE LOCAL            │  ← Cœur intelligent
│  (Node.js, Tree-sitter, SQLite)         │
│  - Parsing AST multi-langage            │
│  - Matching d'éléments après changement │
│  - Indexation des signets               │
└─────────────────────────────────────────┘
```

**Cible principale :** VS Code (plus grande base d'utilisateurs, API la plus riche).  
**Extensible vers :** Vim/Neovim (via LSP ou plugin Lua), IntelliJ (plugin Kotlin).

---

## 3. Fonctionnalités Détaillées

### 3.1 Création de signets sémantiques

| Action | Comportement |
|--------|-------------|
| `Ctrl+Shift+B` (raccourci) | Crée un signet sur l'élément sous le curseur |
| Clic droit → "Ajouter un signet intelligent" | Détecte automatiquement : fonction, classe, méthode, variable, bloc `if`, boucle |
| Signet sur une ligne "brute" | Si ce n'est pas un élément identifiable, on crée un signet "ligne + contexte" (les 3 lignes autour comme empreinte) |

**Données stockées pour chaque signet :**
```json
{
  "id": "uuid",
  "type": "function",           // function | class | method | variable | block | line
  "name": "calculateTotal",       // nom de l'élément
  "signature": "calculateTotal(price, tax)",  // signature pour le matching
  "filePath": "src/utils/billing.js",
  "lineContext": {               // 3 lignes avant/après comme empreinte
    "before": ["function calculateTotal(price, tax) {"],
    "target": "  const total = price * (1 + tax);",
    "after": ["  return total;", "}"]
  },
  "astPath": "src/utils/billing.js > functions > calculateTotal",  // chemin dans l'AST
  "note": "Bug potentiel si tax > 1, vérifier la validation",
  "tags": ["billing", "critical", "refactor-planned"],
  "createdAt": "2026-08-25T08:15:00Z",
  "lastVerified": "2026-08-25T08:15:00Z",
  "color": "red"                 // couleur du signet dans la marge
}
```

### 3.2 Résilience au changement (Le cœur du projet)

Quand le fichier est modifié, le moteur doit retrouver le signet :

**Stratégie de matching (par ordre de priorité) :**

1. **Matching AST exact** : Même nom, même type, même fichier → signet retrouvé.
2. **Matching par signature** : La fonction a changé de nom mais a les mêmes paramètres et le même corps (renommage simple).
3. **Matching par empreinte de contexte** : On cherche les 3 lignes de contexte dans le fichier (algorithme de diff fuzzy).
4. **Matching par similarité** : Si le fichier a été refactoré, on compare l'AST avant/après et on cherche la fonction la plus proche (même structure, mêmes appels internes).
5. **Fallback** : Si rien ne match, le signet passe en statut `"orphan"` et l'utilisateur est invité à le réattacher manuellement.

### 3.3 Interface Utilisateur

**Dans l'éditeur :**
- **Marge colorée** : Icône en forme de signet dans la marge à gauche, colorée selon le tag.
- **Hover** : Passe la souris sur le signet → popup avec la note, la date, l'auteur.
- **Panel latéral** : Vue arborescente `Signets` avec recherche, filtrage par tag/couleur/fichier.

**Commandes disponibles :**
| Commande | Raccourci |
|----------|-----------|
| Toggle signet sur élément | `Ctrl+Shift+B` |
| Ouvrir le panneau des signets | `Ctrl+Shift+L` |
| Rechercher un signet | `Ctrl+P` puis `#` |
| Signet suivant / précédent | `F2` / `Shift+F2` |
| Marquer comme résolu | Clic droit → "Résoudre" (garde en archive) |

### 3.4 Notes enrichies

- **Markdown supporté** dans les notes (liens, listes, code inline).
- **Tags** : `#critical`, `#refactor`, `#question`, `#review`. Autocomplétion des tags existants.
- **Checklist** : `[ ] Vérifier la gestion d'erreur` → peut être cochée directement depuis le panneau.
- **Liens entre signets** : "Voir aussi signet #45" → navigation rapide.

### 3.5 Synchronisation et Partage

| Mode | Description |
|------|-------------|
| **Local** (par défaut) | Stockage SQLite dans `.vscode/smartbookmarks.db` (gitignoré) |
| **Équipe** (optionnel) | Fichier `.smartbookmarks.json` commitable dans le repo, format texte lisible en PR |
| **Export** | Markdown généré : `SIGNETS.md` avec liens cliquables vers les fichiers |

---

## 4. Stack Technique

### 4.1 Extension VS Code
- **Langage :** TypeScript
- **API :** VS Code Extension API (`vscode` module)
- **UI interne :** Webview pour le panneau latéral (React ou Vue.js optionnel, ou HTML pur pour la simplicité)

### 4.2 Moteur Sémantique
- **Parsing AST :** [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) (support natif de 50+ langages : JS, TS, Python, Go, Rust, Java, C++, etc.)
- **Base de données :** SQLite via `better-sqlite3` (performant, local, pas de serveur)
- **Diff/Fuzzy matching :** `diff-match-patch` Google + algorithme maison de scoring de similarité AST

### 4.3 Stockage

```
.vscode/
├── smartbookmarks.db          ← Base SQLite locale (privée)
└── smartbookmarks.shared.json  ← Signets partagés (optionnel, commitable)
```

**Schéma SQLite :**
```sql
CREATE TABLE bookmarks (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    element_type TEXT,        -- function, class, etc.
    element_name TEXT,
    signature TEXT,
    ast_path TEXT,
    line_context TEXT,        -- JSON des lignes environnantes
    note TEXT,
    tags TEXT,                -- JSON array
    color TEXT,
    status TEXT DEFAULT 'active', -- active, orphan, resolved
    created_at DATETIME,
    updated_at DATETIME
);

CREATE TABLE file_snapshots (
    file_path TEXT PRIMARY KEY,
    ast_hash TEXT,            -- hash de l'AST pour détecter les changements
    last_parsed DATETIME
);
```

---

## 5. Algorithme Clé : Le Matching Post-Refactoring

```python
# Pseudo-code du moteur de matching

function onFileSave(filePath):
    oldAst = getLastAst(filePath)
    newAst = treeSitter.parse(filePath)
    
    for bookmark in getBookmarksForFile(filePath):
        if bookmark.status != 'active': continue
        
        # 1. Match exact par chemin AST
        candidate = findInAst(newAst, bookmark.ast_path)
        if candidate and candidate.name == bookmark.name:
            updateBookmarkLine(bookmark, candidate.line)
            continue
            
        # 2. Match par nom + type
        candidates = findByName(newAst, bookmark.name, bookmark.type)
        if len(candidates) == 1:
            updateBookmark(bookmark, candidates[0])
            continue
            
        # 3. Match par signature (paramètres)
        candidates = findBySignature(newAst, bookmark.signature)
        if len(candidates) == 1:
            updateBookmark(bookmark, candidates[0])
            continue
            
        # 4. Match par empreinte de lignes (fuzzy)
        match = fuzzyFindContext(newAst, bookmark.line_context)
        if match.score > 0.85:
            updateBookmark(bookmark, match)
            continue
            
        # 5. Orphelin
        setStatus(bookmark, 'orphan')
        notifyUser("Signet orphelin détecté dans " + filePath)
```

---

## 6. Parcours Utilisateur (User Stories)

**Scénario 1 : Nouveau sur un projet**
> Alice arrive sur une codebase de 50 000 lignes. Elle lit `payment.js`, trouve une fonction `processRefund` bizarre. Elle pose un signet avec la note : *"Pourquoi on ne vérifie pas le solde ici ?"* + tag `#question`.  
> 3 semaines plus tard, un collègue renomme la fonction en `handleRefundAsync` et la déplace dans `refund-service.js`. Alice ouvre son panneau de signets, clique dessus, elle arrive directement sur la bonne fonction au bon endroit.

**Scénario 2 : Code Review différée**
> Bob fait une review. Il pose 5 signets rouges sur des fonctions problématiques plutôt que d'écrire 5 commentaires GitHub qui vont être résolus et perdus. La semaine suivaine, il revient, 3 signets sont devenus verts (corrigés), 2 sont encore là. Il vérifie.

**Scénario 3 : Refactoring**
> Charlie supprime 200 lignes en haut du fichier. Tous les signets classiques seraient décalés. Les SmartBookmarks restent exactes car elles sont attachées aux fonctions, pas aux lignes.

---

## 7. MVP (Minimum Viable Product) — 4 semaines

| Semaine | Objectif |
|---------|----------|
| **S1** | Extension VS Code basique : créer un signet sur une ligne, stockage JSON, affichage dans la marge |
| **S2** | Intégration Tree-sitter : détection du type d'élément (fonction/classe), stockage SQLite |
| **S3** | Algorithme de matching : renommage simple, déplacement dans le fichier, détection d'orphelins |
| **S4** | Panneau latéral, tags, recherche, export Markdown, polish UX |

---

## 8. Différenciation Concurrentielle

| Outil | Problème | SmartBookmarks |
|-------|----------|----------------|
| VS Code Bookmarks | Ligne fixe, pas de notes | Sémantique, résilient |
| Todo Tree (extension) | Regex sur `TODO`, bruyant | Attaché au code, pas au texte |
| GitHub PR Comments | Disparaît après merge | Persistant, local, privé |
| Notion/Notes externes | Pas de lien direct au code | Navigation 1-clic |

---

## 9. Livrables et Déploiement

- **Extension VS Code** publiée sur le Marketplace (gratuite, open source)
- **Repo GitHub** avec le moteur séparé de l'UI (pour pouvoir porter vers Vim/IntelliJ plus tard)
- **Documentation** : README pour les contributeurs + guide utilisateur

---

Tu veux que je génère le squelette du projet (structure de dossiers, fichiers de base, code de démarrage) pour que tu puisses commencer ?****