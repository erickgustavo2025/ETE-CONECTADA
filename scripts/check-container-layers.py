"""Recusa canário em configuração ou qualquer camada, inclusive arquivo apagado."""
import gzip
import json
import sys
import tarfile


def contains(stream, marker):
    tail = b""
    while True:
        chunk = stream.read(1024 * 1024)
        if not chunk:
            return False
        if marker in tail + chunk:
            return True
        tail = chunk[-len(marker):]


def check(filename, marker):
    with tarfile.open(filename, "r:*") as image:
        manifest = json.load(image.extractfile("manifest.json"))
        assert manifest, "Manifesto de imagem ausente."
        for entry in manifest:
            with image.extractfile(entry["Config"]) as config:
                if contains(config, marker):
                    return False
            for name in entry["Layers"]:
                with image.extractfile(name) as layer:
                    # Docker pode preservar a compressão da camada no arquivo exportado.
                    magic = layer.read(2)
                    layer.seek(0)
                    stream = gzip.GzipFile(fileobj=layer) if magic == b"\x1f\x8b" else layer
                    with tarfile.open(fileobj=stream, mode="r|*") as files:
                        for member in files:
                            if member.isfile():
                                with files.extractfile(member) as content:
                                    if contains(content, marker):
                                        return False
    return True


try:
    if not check(sys.argv[1], sys.argv[2].encode()):
        print("Canário privado encontrado em camada/configuração da imagem.", file=sys.stderr)
        raise SystemExit(1)
except (OSError, ValueError, TypeError, EOFError, KeyError, AssertionError, tarfile.TarError, IndexError):
    print("Não foi possível conferir todas as camadas; verificação inconclusiva.", file=sys.stderr)
    raise SystemExit(2)
print("OK: canário ausente da configuração e de todas as camadas.")
