# GitHub → Cosmograph

Build a Cosmograph network of the GitHub repositories owned by `godofecht` plus repositories in `flooooooooooow`.

The generated graph is intentionally local-only. `out/` is gitignored because it can contain metadata for private repositories.

## Generate

Authenticate GitHub CLI once:

```sh
gh auth login
```

Then run:

```sh
python3 generate.py
```

Alternatively, set `GH_TOKEN` or `GITHUB_TOKEN`. The token only needs read access to repository metadata for the repositories you want included.

Output:

```text
out/nodes.csv
out/links.csv
out/metadata.json
```

Use `python3 generate.py --public-only` for a share-safe graph containing only public repositories. Add another organization with `--org NAME`.

## Open in Cosmograph

Open [Cosmograph](https://cosmograph.app/), create **New graph**, and add both CSV files in **Data Sources**.

For the points table (`nodes.csv`), map the unique point ID to `id`. Use `label` for labels, `color` for point color, and `visual_size` for point size.

For the links table (`links.csv`), map source to `source` and target to `target`. The files also contain `index`, `source_index`, and `target_index` so they are directly usable by Cosmograph's indexed library API if needed.

`cosmograph-config.json` contains the equivalent Cosmograph Data Kit mapping for programmatic use.

## Graph model

Every repository is a point. Owner and inferred-domain hubs give the force layout stable high-level structure. Repositories also receive a small number of direct similarity links when their names share distinctive tokens, so related project families naturally cluster without producing an unreadable all-to-all graph.

Repository point size is a log-scaled transform of GitHub's repository size metadata. Public/private, fork/archive state, language, URL, description, and update timestamp remain available as filterable columns.
