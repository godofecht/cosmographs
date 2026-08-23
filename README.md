# Repository Universe

A fully self-hosted GPU graph of the GitHub repositories owned by `godofecht` plus the `flooooooooooow` organization.

The renderer is the MIT-licensed [`@cosmos.gl/graph`](https://github.com/cosmosgl/graph) engine that powers Cosmograph. The app bundles that engine at build time; it does not depend on Cosmograph's hosted application or CDN.

The public GitHub Pages build contains **public repositories only**. Private repository metadata never needs to leave infrastructure you control: generate it locally, load the CSVs directly in the browser, or mount the generated `out/` directory into the Docker deployment.

## Private local graph

Authenticate once and generate the full graph:

```sh
gh auth login
python3 generate.py
npm install
npm run dev
```

Open the local Vite URL and press **Load private local**. You can also press **Open CSVs** and choose `out/nodes.csv` plus `out/links.csv` directly. The browser does not upload those files anywhere.

## Docker self-hosting

Generate the full graph, build the image, and serve it on port 8080:

```sh
gh auth login
python3 generate.py
docker compose up --build -d
```

Then open `http://localhost:8080`. `compose.yml` mounts `./out` read-only as the served graph data, while `.dockerignore` prevents private repository metadata from ever being baked into the image itself.

If you expose this Docker deployment beyond your own machine or private network, put authentication in front of it: the generated graph can contain private repository names, descriptions, URLs, languages, and other metadata.

## Public graph

```sh
python3 generate.py --public-only --out site/data
npm run dev
```

Public-only generation does not require authentication. GitHub Actions rebuilds the bundled app and a fresh public-only graph daily and on every push, then deploys it to GitHub Pages.

For a production build:

```sh
npm run build
python3 generate.py --public-only --out dist/data
```

## UI

The explorer provides GPU force layout, deterministic domain-cluster seeding, collision and clustering forces, repository-size weighting, domain colors, hover labels, neighborhood highlighting, search, domain/language/visibility filters, fork/archive filtering, fit/focus navigation, and a repository inspector with direct GitHub links.

## Data model

Every repository is a point. Owner and inferred-domain hubs establish the large-scale topology. Repositories receive sparse direct similarity edges when their names share distinctive tokens. The CSVs retain visibility, fork/archive state, language, GitHub URL, description, update timestamp, repository size, and ordinal indices.

Generated private data lives in `out/`, which is gitignored. The Pages workflow builds its public snapshot ephemerally into `dist/data` rather than committing generated data to the repository.
