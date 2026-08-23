#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

API = "https://api.github.com"
DEFAULT_USER = "godofecht"
DEFAULT_ORGS = ("flooooooooooow",)

DOMAIN_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Flow", ("flow",)),
    ("Audio / DSP", ("audio", "dsp", "juce", "vst", "plugin", "synth", "sampler", "reverb", "delay", "stereo", "codec", "speech", "sound", "faust", "pedal", "pitch", "phase", "chroma", "waveform", "tracktion", "utau", "singer", "ear")),
    ("Games / Graphics", ("unity", "game", "shader", "voxel", "render", "sdl", "doom", "island", "world", "terrain", "raymarch", "opengl", "metal", "graphics", "visual", "cad")),
    ("AI / ML", ("ai", "ml", "neural", "model", "llm", "agent", "yolo", "scikit", "ocr", "whisper", "caption", "classifier", "embedding")),
    ("Research / Science", ("research", "recognition", "bloch", "neuro", "brain", "eeg", "society", "simulator", "math", "theory", "jacobian", "science", "corpus", "cite")),
    ("Web / Product", ("web", "website", "frontend", "nuxt", "server", "api", "auth", "store", "booking", "stripe", "gallery", "hub")),
    ("Systems / Tooling", ("kernel", "linux", "zig", "cli", "cmake", "build", "ci", "deploy", "ssh", "cache", "terminal", "compiler", "transpil", "homebrew", "sdk", "tool", "setup", "ffmpeg", "chromium")),
    ("Creative", ("music", "generative", "canvas", "image", "video", "movie", "art", "creative", "composer")),
)

DOMAIN_COLORS = {
    "Flow": "#8B5CF6",
    "Audio / DSP": "#22D3EE",
    "Games / Graphics": "#F59E0B",
    "AI / ML": "#F472B6",
    "Research / Science": "#34D399",
    "Web / Product": "#60A5FA",
    "Systems / Tooling": "#94A3B8",
    "Creative": "#FB7185",
    "Other": "#A3A3A3",
    "Owner": "#FFFFFF",
    "Domain": "#E4E4E7",
}

GENERIC_TOKENS = {
    "repo", "project", "app", "demo", "example", "examples", "test", "tests",
    "private", "public", "tool", "tools", "library", "lib", "site", "website",
    "api", "sdk", "client", "server", "code", "new", "old", "simple", "cpp",
    "python", "javascript", "typescript", "main", "template", "starter",
}


def token_from_environment(required: bool = True) -> str:
    for key in ("GH_TOKEN", "GITHUB_TOKEN"):
        if os.environ.get(key):
            return os.environ[key].strip()
    try:
        return subprocess.check_output(["gh", "auth", "token"], text=True, stderr=subprocess.DEVNULL).strip()
    except (FileNotFoundError, subprocess.CalledProcessError):
        if required:
            raise SystemExit("No GitHub token found. Export GH_TOKEN/GITHUB_TOKEN or authenticate with `gh auth login`.")
        return ""


def api_get(token: str, path: str, params: dict[str, str | int] | None = None) -> Any:
    query = urllib.parse.urlencode(params or {})
    url = f"{API}{path}" + (f"?{query}" if query else "")
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "github-cosmograph-generator",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"GitHub API {exc.code} for {url}: {body}") from exc


def paged_get(token: str, path: str, params: dict[str, str | int] | None = None) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    page = 1
    while True:
        page_params = dict(params or {})
        page_params.update({"per_page": 100, "page": page})
        batch = api_get(token, path, page_params)
        if not isinstance(batch, list):
            raise SystemExit(f"Expected a list from {path}, got {type(batch).__name__}")
        result.extend(batch)
        if len(batch) < 100:
            return result
        page += 1


def split_name(name: str) -> list[str]:
    expanded = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", name)
    return [t for t in re.split(r"[^A-Za-z0-9]+", expanded.lower()) if t]


def classify(repo: dict[str, Any]) -> str:
    name_tokens = set(split_name(str(repo.get("name") or "")))
    if repo.get("owner", {}).get("login") == "flooooooooooow" or "flow" in name_tokens:
        return "Flow"

    haystack = " ".join(
        [
            str(repo.get("name") or ""),
            str(repo.get("description") or ""),
            str(repo.get("language") or ""),
            " ".join(repo.get("topics") or []),
        ]
    ).lower()
    for domain, terms in DOMAIN_RULES:
        if domain == "Flow":
            continue
        if any(term in haystack for term in terms):
            return domain
    return "Other"


def significant_tokens(name: str) -> set[str]:
    return {t for t in split_name(name) if len(t) >= 4 and t not in GENERIC_TOKENS}


def similarity(a: str, b: str) -> float:
    ta, tb = significant_tokens(a), significant_tokens(b)
    if not ta or not tb:
        return 0.0
    overlap = ta & tb
    if not overlap:
        return 0.0
    return len(overlap) / len(ta | tb)


def visual_size(size_kb: int) -> float:
    return round(2.0 + min(12.0, math.log10(max(0, size_kb) + 1.0) * 2.5), 3)


def label_weight(size_kb: int) -> float:
    return round(min(1.0, 0.35 + math.log10(max(0, size_kb) + 1.0) / 8.0), 3)


def fetch_repositories(token: str, user: str, orgs: Iterable[str], public_only: bool) -> list[dict[str, Any]]:
    if public_only:
        owned = paged_get(token, f"/users/{user}/repos", {"type": "owner", "sort": "updated", "direction": "desc"})
        repos = {r["full_name"]: r for r in owned if r.get("owner", {}).get("login", "").lower() == user.lower()}
    else:
        me = api_get(token, "/user")
        login = me["login"]
        owned = paged_get(token, "/user/repos", {"affiliation": "owner", "sort": "updated", "direction": "desc"})
        repos = {r["full_name"]: r for r in owned if r.get("owner", {}).get("login") == login}

    for org in orgs:
        for repo in paged_get(token, f"/orgs/{org}/repos", {"type": "all", "sort": "updated"}):
            repos[repo["full_name"]] = repo

    values = list(repos.values())
    if public_only:
        values = [r for r in values if not r.get("private", False)]
    return sorted(values, key=lambda r: r["full_name"].lower())


def build_graph(repos: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    domains = sorted({classify(r) for r in repos})
    owners = sorted({r["owner"]["login"] for r in repos})

    nodes: list[dict[str, Any]] = []
    for owner in owners:
        nodes.append({
            "id": f"owner:{owner}", "label": owner, "kind": "owner", "owner": owner,
            "domain": "Owner", "visibility": "n/a", "is_private": False, "is_fork": False,
            "archived": False, "language": "", "size_kb": 0, "visual_size": 14,
            "label_weight": 1.0, "color": DOMAIN_COLORS["Owner"], "url": f"https://github.com/{owner}",
            "updated_at": "", "description": "GitHub owner hub",
        })
    for domain in domains:
        nodes.append({
            "id": f"domain:{domain}", "label": domain, "kind": "domain", "owner": "",
            "domain": domain, "visibility": "n/a", "is_private": False, "is_fork": False,
            "archived": False, "language": "", "size_kb": 0, "visual_size": 12,
            "label_weight": 1.0, "color": DOMAIN_COLORS["Domain"], "url": "",
            "updated_at": "", "description": "Inferred repository domain hub",
        })

    repo_domain: dict[str, str] = {}
    for repo in repos:
        full = repo["full_name"]
        domain = classify(repo)
        repo_domain[full] = domain
        private = bool(repo.get("private"))
        size = int(repo.get("size") or 0)
        nodes.append({
            "id": f"repo:{full}",
            "label": repo["name"],
            "kind": "repo",
            "owner": repo["owner"]["login"],
            "domain": domain,
            "visibility": "private" if private else "public",
            "is_private": private,
            "is_fork": bool(repo.get("fork")),
            "archived": bool(repo.get("archived")),
            "language": repo.get("language") or "",
            "size_kb": size,
            "visual_size": visual_size(size),
            "label_weight": label_weight(size),
            "color": DOMAIN_COLORS.get(domain, DOMAIN_COLORS["Other"]),
            "url": repo.get("html_url") or f"https://github.com/{full}",
            "updated_at": repo.get("updated_at") or "",
            "description": (repo.get("description") or "").replace("\n", " "),
        })

    node_index = {node["id"]: i for i, node in enumerate(nodes)}
    for i, node in enumerate(nodes):
        node["index"] = i

    links: list[dict[str, Any]] = []

    def add_link(source: str, target: str, relation: str, strength: float, width: float) -> None:
        links.append({
            "source": source,
            "target": target,
            "source_index": node_index[source],
            "target_index": node_index[target],
            "relation": relation,
            "strength": round(strength, 3),
            "width": round(width, 3),
        })

    for repo in repos:
        rid = f"repo:{repo['full_name']}"
        add_link(rid, f"owner:{repo['owner']['login']}", "owned-by", 0.45, 0.7)
        add_link(rid, f"domain:{repo_domain[repo['full_name']]}", "domain", 0.35, 0.55)

    candidates: dict[str, list[tuple[float, str]]] = defaultdict(list)
    for i, a in enumerate(repos):
        for b in repos[i + 1:]:
            score = similarity(a["name"], b["name"])
            if score >= 0.34:
                candidates[a["full_name"]].append((score, b["full_name"]))
                candidates[b["full_name"]].append((score, a["full_name"]))

    seen: set[tuple[str, str]] = set()
    for full_name, matches in candidates.items():
        for score, other in sorted(matches, reverse=True)[:4]:
            pair = tuple(sorted((full_name, other)))
            if pair in seen:
                continue
            seen.add(pair)
            add_link(f"repo:{full_name}", f"repo:{other}", "name-similarity", 0.55 + 0.4 * score, 0.5 + score)

    return nodes, links


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        raise SystemExit(f"Refusing to write empty dataset: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a Cosmograph-ready network from GitHub repositories.")
    parser.add_argument("--user", default=DEFAULT_USER, help=f"GitHub user to include (default: {DEFAULT_USER}).")
    parser.add_argument("--org", action="append", dest="orgs", help="Additional GitHub org to include (repeatable).")
    parser.add_argument("--public-only", action="store_true", help="Generate only public repositories; authentication is optional.")
    parser.add_argument("--out", type=Path, default=Path("out"), help="Output directory (default: out).")
    args = parser.parse_args()

    token = token_from_environment(required=not args.public_only)
    orgs = tuple(dict.fromkeys([*DEFAULT_ORGS, *(args.orgs or [])]))
    repos = fetch_repositories(token, args.user, orgs, args.public_only)
    nodes, links = build_graph(repos)

    write_csv(args.out / "nodes.csv", nodes)
    write_csv(args.out / "links.csv", links)
    metadata = {
        "user": args.user,
        "repositories": len(repos),
        "nodes": len(nodes),
        "links": len(links),
        "organizations": list(orgs),
        "public_only": args.public_only,
    }
    (args.out / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
