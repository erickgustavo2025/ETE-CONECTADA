"""Empacota imagens já testadas e confere integridade sem extrair seus arquivos."""
import datetime
import gzip
import hashlib
import json
import re
import shutil
import sys
import tarfile
from pathlib import Path

JOBS = {
    "ci.yml": {"Validar workflows", "Build dos dois apps", "Migrações e integração em PostgreSQL descartável"},
    "security.yml": {"Código, configurações e histórico de segredos"},
}


def digest(file):
    assert file.is_file() and not file.is_symlink()
    result = hashlib.sha256()
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def read_json(file):
    assert file.is_file() and not file.is_symlink() and file.stat().st_size < 32 * 1024 * 1024
    return json.loads(file.read_text())


def archive_config(file, image_id, sha, app):
    assert re.fullmatch(r"sha256:[a-f0-9]{64}", image_id)
    with tarfile.open(file, "r:*") as archive:
        names = [m.name for m in archive.getmembers()]
        assert len(names) == len(set(names))
        member = archive.getmember("manifest.json")
        assert member.isfile() and member.size < 1024 * 1024
        manifest = json.load(archive.extractfile(member))
        assert len(manifest) == 1
        member = archive.getmember(manifest[0]["Config"])
        assert member.isfile() and member.size < 4 * 1024 * 1024
        raw = archive.extractfile(member).read()
        assert "sha256:" + hashlib.sha256(raw).hexdigest() == image_id
        config = json.loads(raw)
        assert config["os"] == "linux" and config["architecture"] == "amd64"
        assert config["config"]["User"] == "node"
        assert config["config"]["Labels"]["org.opencontainers.image.revision"] == sha
        assert config["config"]["Labels"]["org.opencontainers.image.title"] == f"ete-{app}"
        assert not any(v.startswith(("DATABASE_URL=", "RESEND_API_KEY=", "EMAIL_FROM=")) for v in config["config"].get("Env", []))
        layers = manifest[0]["Layers"]
        assert layers and len(layers) == len(config["rootfs"]["diff_ids"])
        for name, diff_id in zip(layers, config["rootfs"]["diff_ids"], strict=True):
            member = archive.getmember(name)
            assert member.isfile()
            with archive.extractfile(member) as data:
                magic = data.read(2)
                data.seek(0)
                stream = gzip.GzipFile(fileobj=data) if magic == b"\x1f\x8b" else data
                result = hashlib.sha256()
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    result.update(chunk)
                assert "sha256:" + result.hexdigest() == diff_id


def audit(file, image_id):
    report = read_json(file)
    assert report["ArtifactType"] == "container_image"
    assert report["Metadata"]["ImageID"] == image_id
    assert {"os-pkgs", "lang-pkgs"} <= {r.get("Class") for r in report["Results"]}
    for result in report["Results"]:
        assert not any(v["Severity"] in {"HIGH", "CRITICAL"} for v in (result.get("Vulnerabilities") or []))


def images(root, records, sha):
    assert len(records) == 2 and {r["app"] for r in records} == {"site", "portal"}
    for record in records:
        app = record["app"]
        assert record["archive"] == f"{app}.tar.gz" and record["audit"] == f"{app}-audit.json"
        for field, hash_field in [("archive", "sha256"), ("audit", "audit_sha256")]:
            assert digest(root / record[field]) == record[hash_field]
        assert (root / record["archive"]).stat().st_size == record["bytes"]
        archive_config(root / record["archive"], record["image_id"], sha, app)
        audit(root / record["audit"], record["image_id"])


def checks(report, sha, repository):
    assert report["sha"] == sha and report["repository"] == repository and report["branch"]
    assert len(report["checks"]) == len(JOBS)
    assert {c["workflow"] for c in report["checks"]} == set(JOBS)
    for check in report["checks"]:
        assert check["conclusion"] == "success" and type(check["id"]) is int and check["id"] > 0
        assert type(check["attempt"]) is int and check["attempt"] > 0
        assert set(check["jobs"]) == JOBS[check["workflow"]]


def write_new(file, data):
    with file.open("x") as stream:
        stream.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def create(source, output, sha, ids):
    assert output.is_absolute() and not output.resolve().is_relative_to(Path.cwd().resolve())
    output.mkdir(mode=0o700)
    records = []
    for app, image_id in zip(["site", "portal"], ids, strict=True):
        archive_config(source / f"{app}.tar", image_id, sha, app)
        audit(source / f"{app}-audit.json", image_id)
        target = output / f"{app}.tar.gz"
        with (source / f"{app}.tar").open("rb") as src, target.open("xb") as dest:
            with gzip.GzipFile(filename="", fileobj=dest, mode="wb", compresslevel=1, mtime=0) as compressed:
                shutil.copyfileobj(src, compressed)
        shutil.copyfile(source / f"{app}-audit.json", output / f"{app}-audit.json")
        records.append({"app": app, "archive": target.name, "image_id": image_id, "sha256": digest(target), "bytes": target.stat().st_size,
                        "audit": f"{app}-audit.json", "audit_sha256": digest(output / f"{app}-audit.json")})
    images(output, records, sha)
    write_new(output / "images.json", {"schema": 1, "source_commit": sha, "images": records})


def seal(root, sha, repository):
    metadata = read_json(root / "images.json")
    assert metadata["source_commit"] == sha
    images(root, metadata["images"], sha)
    report = read_json(root / "checks.json")
    checks(report, sha, repository)
    write_new(root / "release.json", {"schema": 1, "kind": "docker-save-archives", "source_commit": sha, "repository": repository,
              "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "checks": report, "images": metadata["images"]})
    files = ["release.json", "site.tar.gz", "portal.tar.gz", "site-audit.json", "portal-audit.json"]
    with (root / "SHA256SUMS").open("x") as stream:
        for name in sorted(files):
            stream.write(f"{digest(root / name)}  {name}\n")


def verify(root, sha):
    metadata = read_json(root / "release.json")
    assert metadata["schema"] == 1 and metadata["kind"] == "docker-save-archives" and metadata["source_commit"] == sha
    checks(metadata["checks"], sha, metadata["repository"])
    images(root, metadata["images"], sha)
    expected = {"release.json", "site.tar.gz", "portal.tar.gz", "site-audit.json", "portal-audit.json"}
    sums = {}
    for line in (root / "SHA256SUMS").read_text().splitlines():
        value, name = line.split("  ", 1)
        assert name in expected and name not in sums and digest(root / name) == value
        sums[name] = value
    assert set(sums) == expected


def main():
    action, root, sha = sys.argv[1:4]
    assert re.fullmatch(r"[a-f0-9]{40}", sha)
    root = Path(root)
    if action == "create":
        create(root, Path(sys.argv[4]), sha, sys.argv[5:7])
    elif action == "seal":
        seal(root, sha, sys.argv[4])
    elif action == "verify":
        verify(root, sha)
    else:
        raise ValueError()
    print("OK: artefato identificado e conferido sem extrair arquivos nem executar deploy.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, AssertionError, IndexError, tarfile.TarError, EOFError):
        print("Artefato recusado: identidade, integridade, auditoria ou verificações inválidas.", file=sys.stderr)
        sys.exit(1)
