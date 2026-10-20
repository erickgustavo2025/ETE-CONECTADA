"""Fixtures sem dados reais para testar os arquivos e os vínculos do artefato."""
import hashlib
import io
import json
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).with_name("release-artifact.py").resolve()
SHA = "a" * 40
REPOSITORY = "erickgustavo2025/ETE-CONECTADA"


def run(args, good=True):
    result = subprocess.run([sys.executable, str(SCRIPT), *map(str, args)], capture_output=True, text=True, timeout=30)
    assert result.returncode == (0 if good else 1), result.stderr


with tempfile.TemporaryDirectory(prefix="ete-release-fixture-") as directory:
    root = Path(directory)
    source = root / "source"
    source.mkdir()
    ids = []
    layer = io.BytesIO()
    with tarfile.open(fileobj=layer, mode="w"):
        pass
    layer = layer.getvalue()
    for app in ["site", "portal"]:
        config = json.dumps({"os": "linux", "architecture": "amd64", "rootfs": {"diff_ids": ["sha256:" + hashlib.sha256(layer).hexdigest()]}, "config": {"User": "node", "Labels": {"org.opencontainers.image.revision": SHA, "org.opencontainers.image.title": f"ete-{app}"}, "Env": ["NODE_ENV=production"]}}).encode()
        image_id = "sha256:" + hashlib.sha256(config).hexdigest()
        ids.append(image_id)
        with tarfile.open(source / f"{app}.tar", "w") as archive:
            for name, content in [("manifest.json", json.dumps([{"Config": "config.json", "Layers": ["layer.tar"]}]).encode()), ("config.json", config), ("layer.tar", layer)]:
                member = tarfile.TarInfo(name)
                member.size = len(content)
                archive.addfile(member, io.BytesIO(content))
        (source / f"{app}-audit.json").write_text(json.dumps({"ArtifactType": "container_image", "Metadata": {"ImageID": image_id}, "Results": [{"Class": "os-pkgs"}, {"Class": "lang-pkgs"}]}))
    output = root / "output"
    run(["create", source, SHA, output, *ids])
    run(["create", source, SHA, output, *ids], False)
    assert (output / "images.json").is_file()
    checks = {"repository": REPOSITORY, "sha": SHA, "branch": "feature/fixture", "checks": [
        {"workflow": "ci.yml", "id": 10, "attempt": 1, "conclusion": "success", "jobs": ["Validar workflows", "Build dos dois apps", "Migrações e integração em PostgreSQL descartável"]},
        {"workflow": "security.yml", "id": 11, "attempt": 1, "conclusion": "success", "jobs": ["Código, configurações e histórico de segredos"]},
    ]}
    (output / "checks.json").write_text(json.dumps(checks))
    run(["seal", output, SHA, REPOSITORY])
    run(["verify", output, SHA])
    run(["verify", output, "b" * 40], False)
    archive = output / "site.tar.gz"
    original = archive.read_bytes()
    archive.write_bytes(original + b"adulterado")
    run(["verify", output, SHA], False)
    archive.write_bytes(original)
    metadata = output / "release.json"
    original_metadata = metadata.read_text()
    for change in ["path", "checks", "audit-binding", "high"]:
        data = json.loads(original_metadata)
        report = json.loads((source / "site-audit.json").read_text())
        if change == "path": data["images"][0]["archive"] = "../outside.tar.gz"
        elif change == "checks": data["checks"]["checks"][0]["conclusion"] = "skipped"
        elif change == "audit-binding": report["Metadata"]["ImageID"] = "sha256:" + "f" * 64
        elif change == "high": report["Results"][0]["Vulnerabilities"] = [{"Severity": "HIGH"}]
        (output / "site-audit.json").write_text(json.dumps(report))
        data["images"][0]["audit_sha256"] = hashlib.sha256((output / "site-audit.json").read_bytes()).hexdigest()
        metadata.write_text(json.dumps(data))
        # Mesmo recomputando hashes, vínculos e decisões inválidos devem reprovar.
        (output / "SHA256SUMS").write_text("\n".join(f"{hashlib.sha256((output/name).read_bytes()).hexdigest()}  {name}" for name in ["release.json", "site.tar.gz", "portal.tar.gz", "site-audit.json", "portal-audit.json"]) + "\n")
        run(["verify", output, SHA], False)
    with tarfile.open(source / 'site.tar', 'r') as archive:
        contents = [(m.name, archive.extractfile(m).read()) for m in archive.getmembers()]
    with tarfile.open(source / 'site.tar', 'w') as archive:
        for name, content in contents:
            if name == 'layer.tar': content = b'camada adulterada'
            member = tarfile.TarInfo(name); member.size = len(content)
            archive.addfile(member, io.BytesIO(content))
    run(['create', source, SHA, root/'bad-layer', *ids], False)
    print("OK: artefato positivo aprovado; sobrescrita, SHA, corrupção, caminho, checks, auditoria trocada, achado alto e camada adulterada recusados.")
