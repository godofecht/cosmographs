# Repository Universe

A self-hosted GPU graph of the GitHub repositories owned by `godofecht` plus the `flooooooooooow` organization, rendered with the Cosmograph JavaScript library.

The public GitHub Pages build contains **public repositories only**. Private repository metadata never needs to leave your machine: generate it locally and the exact same UI can load it from `out/` or from files you select in the browser.

## Private local graph

Authenticate once, generate the full graph, and serve the repo root:

```sh
gh auth login
python3 generate.py
python3 -m http.server 8080
```

Open `http://localhost:8080/site/` and press **Load private local**. You can also press **Open CSVs** and choose `out/nodes.csv` plus `out/links.csv` directly. The browser does not upload those files anywhere.

## Public graph

```sh
python3 generate.py --public-only --out site/data
python3 -m http.server 8080 --directory site
```

Public-only generation does not require authentication. GitHub Actions uses this mode every day and on every push to rebuild the GitHub Pages graph without exposing private repositories.

## UI

The explorer provides GPU force layout, domain coloring, repository-size weighting, search, domain/language/visibility filters, fork/archive filtering, focus-and-fit navigation, and a repository inspector with direct GitHub links.

## Data model

Every repository is a point. Owner and inferred-domain hubs establish the large-scale topology. Repositories receive sparse direct similarity edges when their names share distinctive tokens. The CSVs retain visibility, fork/archive state, language, GitHub URL, description, update timestamp, repository size, and Cosmograph's ordinal indices.

Generated private data lives in `out/`, which is gitignored. The Pages workflow builds its public snapshot ephemerally into `_site/data` rather than committing generated data to the repository.
