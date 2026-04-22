#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import platform
import shutil
import signal
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

try:
    from dotenv import dotenv_values
except ModuleNotFoundError:
    def dotenv_values(path: str | Path) -> dict[str, str]:
        values: dict[str, str] = {}
        env_path = Path(path)
        if not env_path.exists():
            return values

        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
        return values


ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
MODEL_CHECKPOINT = BACKEND_DIR / "artifacts" / "checkpoints" / "reuse_ai_best.pt"
OLLAMA_RUNTIME_DIR = ROOT_DIR / ".cache" / "ollama-runtime"
OLLAMA_MODELS_DIR = ROOT_DIR / ".cache" / "ollama-models"
DEFAULT_OLLAMA_API_URL = "http://127.0.0.1:11434/api"


@dataclass(frozen=True)
class LauncherConfig:
    backend_host: str
    backend_port: int
    frontend_host: str
    frontend_port: int
    skip_npm_install: bool
    tunnel_url: str | None = None

    @property
    def backend_target_host(self) -> str:
        if self.backend_host in {"0.0.0.0", "::"}:
            return "127.0.0.1"
        return self.backend_host

    @property
    def backend_url(self) -> str:
        return f"http://{self.backend_target_host}:{self.backend_port}"

    @property
    def frontend_url(self) -> str:
        target_host = self.frontend_host
        if target_host in {"0.0.0.0", "::"}:
            target_host = "127.0.0.1"
        return f"http://{target_host}:{self.frontend_port}"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Sobe o frontend e o backend Django do Reuse.AI em paralelo."
    )
    parser.add_argument("--backend-host", default="127.0.0.1")
    parser.add_argument("--backend-port", type=int, default=8001)
    parser.add_argument("--frontend-host", default="127.0.0.1")
    parser.add_argument("--frontend-port", type=int, default=5173)
    parser.add_argument(
        "--skip-npm-install",
        action="store_true",
        help="Nao roda npm install automaticamente quando node_modules estiver ausente.",
    )
    parser.add_argument(
        "--tunnel-url",
        default=None,
        metavar="URL",
        help=(
            "URL publica do tunel (ex: https://xyz.ngrok-free.app). "
            "Ativa o modo tunel: o frontend usa /api relativo via proxy do Vite, "
            "o Django constroi URLs absolutas com o dominio do tunel."
        ),
    )
    return parser


def is_path_command(command: str) -> bool:
    return os.path.sep in command or (os.path.altsep and os.path.altsep in command)


def command_exists(command: list[str]) -> bool:
    executable = command[0]
    if is_path_command(executable):
        return Path(executable).exists()
    return shutil.which(executable) is not None


def resolve_backend_python() -> list[str]:
    candidates: list[list[str]] = []

    if os.name == "nt":
        candidates.extend(
            [
                [str(BACKEND_DIR / "venv" / "Scripts" / "python.exe")],
                [str(BACKEND_DIR / ".venv" / "Scripts" / "python.exe")],
                [str(ROOT_DIR / ".venv" / "Scripts" / "python.exe")],
                ["py", "-3.12"],
                ["py", "-3"],
                ["python"],
            ]
        )
    else:
        candidates.extend(
            [
                [str(ROOT_DIR / ".venv" / "bin" / "python")],
                [str(BACKEND_DIR / ".venv" / "bin" / "python")],
                [str(BACKEND_DIR / "venv" / "bin" / "python")],
                ["python3"],
                ["python"],
            ]
        )

    for candidate in candidates:
        if not command_exists(candidate):
            continue

        probe = subprocess.run(
            candidate
            + [
                "-c",
                "import django, rest_framework; print('ok')",
            ],
            cwd=BACKEND_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if probe.returncode == 0:
            return candidate

    raise RuntimeError(
        "Nao encontrei um Python com Django e Django REST Framework disponiveis para o backend."
    )


def resolve_npm() -> str:
    candidates = ["npm.cmd", "npm"] if os.name == "nt" else ["npm"]
    for candidate in candidates:
        path = shutil.which(candidate)
        if path:
            return path
    raise RuntimeError("Nao encontrei o comando npm no PATH.")


def ollama_requested(env: dict[str, str]) -> bool:
    provider = env.get("CHATBOT_LLM_PROVIDER", "").strip().lower()
    ollama_model = env.get("OLLAMA_MODEL", "").strip()
    return provider == "ollama" or (not provider and bool(ollama_model))


def normalize_ollama_api_url(url: str) -> str:
    normalized = (url or DEFAULT_OLLAMA_API_URL).strip() or DEFAULT_OLLAMA_API_URL
    normalized = normalized.rstrip("/")
    if normalized.endswith("/api"):
        return normalized
    return f"{normalized}/api"


def ollama_server_url(api_url: str) -> str:
    normalized = normalize_ollama_api_url(api_url)
    if normalized.endswith("/api"):
        return normalized[:-4]
    return normalized


def canonical_local_ollama_host(host: str | None) -> str:
    if host in {None, "", "localhost", "::1", "0.0.0.0"}:
        return "127.0.0.1"
    return host


def ollama_is_local(api_url: str) -> bool:
    parsed = urlparse(ollama_server_url(api_url))
    return parsed.hostname in {None, "", "127.0.0.1", "localhost", "::1", "0.0.0.0"}


def ollama_host_env_value(api_url: str) -> str:
    parsed = urlparse(ollama_server_url(api_url))
    host = canonical_local_ollama_host(parsed.hostname)
    port = parsed.port or 11434
    return f"{host}:{port}"


def canonicalize_local_ollama_api_url(api_url: str) -> str:
    parsed = urlparse(normalize_ollama_api_url(api_url))
    host = canonical_local_ollama_host(parsed.hostname)
    port = parsed.port or 11434
    scheme = parsed.scheme or "http"
    return f"{scheme}://{host}:{port}/api"


def ollama_api_ready(api_url: str, timeout_seconds: float = 2.0) -> bool:
    request = Request(f"{normalize_ollama_api_url(api_url)}/tags")
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            return 200 <= getattr(response, "status", 200) < 500
    except Exception:
        return False


def wait_for_ollama(api_url: str, timeout_seconds: float = 45.0) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if ollama_api_ready(api_url):
            return True
        time.sleep(0.5)
    return False


def normalize_ollama_architecture() -> str:
    machine = platform.machine().lower()
    if machine in {"x86_64", "amd64"}:
        return "amd64"
    if machine in {"aarch64", "arm64"}:
        return "arm64"
    raise RuntimeError(f"Arquitetura nao suportada para runtime local do Ollama: {machine}")


def local_ollama_binary_path() -> Path:
    binary_name = "ollama.exe" if os.name == "nt" else "ollama"
    return OLLAMA_RUNTIME_DIR / "bin" / binary_name


def install_local_ollama_runtime() -> list[str]:
    binary_path = local_ollama_binary_path()
    if binary_path.exists():
        return [str(binary_path)]

    if platform.system() != "Linux":
        raise RuntimeError(
            "Nao encontrei o Ollama instalado e o bootstrap automatico local esta disponivel apenas em Linux."
        )

    missing_tools = [
        tool for tool in ("curl", "zstd", "tar") if shutil.which(tool) is None
    ]
    if missing_tools:
        raise RuntimeError(
            "Nao foi possivel baixar o runtime local do Ollama porque faltam ferramentas: "
            + ", ".join(missing_tools)
        )

    arch = normalize_ollama_architecture()
    download_url = f"https://ollama.com/download/ollama-linux-{arch}.tar.zst"

    print("[setup] Ollama nao encontrado no sistema. Baixando runtime local...", flush=True)
    with tempfile.TemporaryDirectory(prefix="reuse-ai-ollama-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        archive_path = temp_dir / f"ollama-linux-{arch}.tar.zst"
        tar_path = temp_dir / f"ollama-linux-{arch}.tar"

        subprocess.run(
            ["curl", "-fsSL", download_url, "-o", str(archive_path)],
            check=True,
        )
        subprocess.run(
            ["zstd", "-d", "-f", str(archive_path), "-o", str(tar_path)],
            check=True,
        )

        if OLLAMA_RUNTIME_DIR.exists():
            shutil.rmtree(OLLAMA_RUNTIME_DIR)
        OLLAMA_RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

        subprocess.run(
            ["tar", "-xf", str(tar_path), "-C", str(OLLAMA_RUNTIME_DIR)],
            check=True,
        )

    if not binary_path.exists():
        raise RuntimeError("O runtime local do Ollama foi baixado, mas o binario nao foi encontrado.")

    binary_path.chmod(binary_path.stat().st_mode | 0o111)
    return [str(binary_path)]


def resolve_ollama_command() -> list[str]:
    path = shutil.which("ollama")
    if path:
        return [path]
    return install_local_ollama_runtime()


def ensure_ollama_model(
    ollama_command: list[str],
    env: dict[str, str],
    model_name: str,
) -> None:
    model_name = model_name.strip()
    if not model_name:
        print("[warning] OLLAMA_MODEL nao definido. O chatbot continuara em fallback local.", flush=True)
        return

    show_result = subprocess.run(
        ollama_command + ["show", model_name],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if show_result.returncode == 0:
        print(f"[setup] Modelo Ollama pronto: {model_name}", flush=True)
        return

    print(f"[setup] Baixando modelo Ollama {model_name}...", flush=True)
    subprocess.run(
        ollama_command + ["pull", model_name],
        env=env,
        check=True,
    )


def prepare_ollama_environment(env: dict[str, str]) -> dict[str, str]:
    ollama_env = dict(env)
    ollama_env.setdefault("HOME", str(Path.home()))
    ollama_env.setdefault("OLLAMA_BASE_URL", DEFAULT_OLLAMA_API_URL)
    ollama_env["OLLAMA_BASE_URL"] = normalize_ollama_api_url(ollama_env["OLLAMA_BASE_URL"])
    if ollama_is_local(ollama_env["OLLAMA_BASE_URL"]):
        ollama_env["OLLAMA_BASE_URL"] = canonicalize_local_ollama_api_url(
            ollama_env["OLLAMA_BASE_URL"]
        )
    ollama_env["OLLAMA_HOST"] = ollama_host_env_value(ollama_env["OLLAMA_BASE_URL"])
    ollama_env.setdefault("OLLAMA_MODELS", str(OLLAMA_MODELS_DIR))
    ollama_env.setdefault("OLLAMA_NO_CLOUD", "1")
    OLLAMA_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    return ollama_env


def bootstrap_ollama(
    env: dict[str, str],
) -> tuple[subprocess.Popen[str] | None, dict[str, str]]:
    if not ollama_requested(env):
        return None, env

    ollama_env = prepare_ollama_environment(env)
    api_url = ollama_env["OLLAMA_BASE_URL"]
    model_name = ollama_env.get("OLLAMA_MODEL", "").strip()

    if not ollama_is_local(api_url):
        print(f"[info] Ollama configurado em endpoint remoto: {api_url}", flush=True)
        return None, ollama_env

    if ollama_api_ready(api_url):
        print(f"[setup] Ollama local ja esta respondendo em {api_url}", flush=True)
        ensure_ollama_model(resolve_ollama_command(), ollama_env, model_name)
        return None, ollama_env

    ollama_command = resolve_ollama_command()
    print("[setup] Iniciando Ollama local...", flush=True)
    ollama_process = start_process(
        name="ollama",
        command=ollama_command + ["serve"],
        cwd=ROOT_DIR,
        env=ollama_env,
    )

    if not wait_for_ollama(api_url):
        stop_process("ollama", ollama_process)
        raise RuntimeError(
            "O Ollama foi iniciado, mas a API nao ficou disponivel dentro do tempo esperado."
        )

    ensure_ollama_model(ollama_command, ollama_env, model_name)
    return ollama_process, ollama_env


def ensure_frontend_dependencies(npm_command: str, config: LauncherConfig) -> None:
    node_modules_dir = FRONTEND_DIR / "node_modules"
    if node_modules_dir.exists() or config.skip_npm_install:
        return

    print("[setup] node_modules nao encontrado. Executando npm install...", flush=True)
    subprocess.run([npm_command, "install"], cwd=FRONTEND_DIR, check=True)


def run_django_migrations(python_command: list[str], env: dict[str, str]) -> None:
    print("[setup] Aplicando migrations do Django...", flush=True)
    subprocess.run(
        python_command + ["manage.py", "migrate", "--noinput"],
        cwd=BACKEND_DIR,
        env=env,
        check=True,
    )


def stream_output(name: str, process: subprocess.Popen[str]) -> None:
    if process.stdout is None:
        return

    for line in process.stdout:
        print(f"[{name}] {line.rstrip()}", flush=True)


def start_process(
    name: str,
    command: list[str],
    cwd: Path,
    env: dict[str, str],
) -> subprocess.Popen[str]:
    kwargs: dict[str, object] = {
        "cwd": cwd,
        "env": env,
        "stdout": subprocess.PIPE,
        "stderr": subprocess.STDOUT,
        "text": True,
        "bufsize": 1,
    }

    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True

    process = subprocess.Popen(command, **kwargs)
    thread = threading.Thread(
        target=stream_output,
        args=(name, process),
        daemon=True,
    )
    thread.start()
    return process


def stop_process(name: str, process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return

    print(f"[shutdown] Encerrando {name}...", flush=True)

    try:
        if os.name == "nt":
            process.terminate()
        else:
            os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=8)
        return
    except subprocess.TimeoutExpired:
        pass

    if os.name == "nt":
        process.kill()
    else:
        os.killpg(process.pid, signal.SIGKILL)
    process.wait(timeout=5)


def main() -> int:
    args = build_parser().parse_args()
    tunnel_url: str | None = (args.tunnel_url or "").rstrip("/") or None
    config = LauncherConfig(
        backend_host=args.backend_host,
        backend_port=args.backend_port,
        frontend_host=args.frontend_host,
        frontend_port=args.frontend_port,
        skip_npm_install=args.skip_npm_install,
        tunnel_url=tunnel_url,
    )

    backend_python = resolve_backend_python()
    npm_command = resolve_npm()
    ensure_frontend_dependencies(npm_command, config)

    if not MODEL_CHECKPOINT.exists():
        print(
            "[warning] Modelo nao encontrado em "
            f"{MODEL_CHECKPOINT}. O backend vai subir, mas /api/analyze pode responder 503.",
            flush=True,
        )

    file_env = {
        key: value
        for key, value in dotenv_values(BACKEND_DIR / ".env").items()
        if isinstance(value, str)
    }
    backend_env = {**file_env, **os.environ.copy()}
    frontend_env = {**file_env, **os.environ.copy()}
    backend_env["DJANGO_DEBUG"] = backend_env.get("DJANGO_DEBUG", "1")
    ollama_process: subprocess.Popen[str] | None = None

    if ollama_requested(backend_env):
        ollama_process, backend_env = bootstrap_ollama(backend_env)
        frontend_env.update(
            {
                "CHATBOT_LLM_PROVIDER": backend_env.get("CHATBOT_LLM_PROVIDER", ""),
                "OLLAMA_MODEL": backend_env.get("OLLAMA_MODEL", ""),
                "OLLAMA_BASE_URL": backend_env.get("OLLAMA_BASE_URL", DEFAULT_OLLAMA_API_URL),
            }
        )

    if config.tunnel_url:
        # Modo túnel: o frontend acessa /api via proxy do Vite (URL relativa).
        # O Django precisa saber o domínio público para gerar URLs absolutas corretas.
        backend_env["FRONTEND_URL"] = config.tunnel_url
        backend_env["EXTRA_CORS_ORIGINS"] = config.tunnel_url
        backend_env["DJANGO_TRUST_PROXY_HEADERS"] = "true"
        frontend_env["VITE_TUNNEL_URL"] = config.tunnel_url
        # Não define VITE_BACKEND_URL nem VITE_API_URL: o frontend usa /api relativo.
        frontend_env.pop("VITE_BACKEND_URL", None)
        frontend_env.pop("VITE_API_URL", None)
    else:
        backend_env["FRONTEND_URL"] = config.frontend_url
        frontend_env["VITE_BACKEND_URL"] = config.backend_url
        frontend_env["VITE_API_URL"] = f"{config.backend_url}/api"

    google_client_id = backend_env.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    if google_client_id:
        frontend_env["VITE_GOOGLE_CLIENT_ID"] = google_client_id
    run_django_migrations(backend_python, backend_env)

    backend_command = backend_python + [
        "manage.py",
        "runserver",
        f"{config.backend_host}:{config.backend_port}",
    ]
    frontend_command = [
        npm_command,
        "run",
        "dev",
        "--",
        "--host",
        config.frontend_host,
        "--port",
        str(config.frontend_port),
        "--strictPort",
    ]

    print("Reuse.AI launcher", flush=True)
    print(f"[info] Backend Django: {config.backend_url}", flush=True)
    print(f"[info] Frontend: {config.frontend_url}", flush=True)
    if ollama_requested(backend_env):
        print(
            f"[info] Chatbot Ollama: {backend_env.get('OLLAMA_BASE_URL', DEFAULT_OLLAMA_API_URL)} "
            f"({backend_env.get('OLLAMA_MODEL', '').strip() or 'modelo nao definido'})",
            flush=True,
        )
    if config.tunnel_url:
        print(f"[info] Modo tunel ativo — URL publica: {config.tunnel_url}", flush=True)
        print("[info] Exponha APENAS a porta do frontend pelo tunel (ngrok).", flush=True)
    print("[info] Pressione Ctrl+C para encerrar os dois processos.", flush=True)
    print(
        "[info] Python backend: " + " ".join(backend_python),
        flush=True,
    )
    print(f"[info] NPM: {npm_command}", flush=True)

    backend_process = start_process(
        name="backend",
        command=backend_command,
        cwd=BACKEND_DIR,
        env=backend_env,
    )
    frontend_process = start_process(
        name="frontend",
        command=frontend_command,
        cwd=FRONTEND_DIR,
        env=frontend_env,
    )

    processes = {
        "backend": backend_process,
        "frontend": frontend_process,
    }
    if ollama_process is not None:
        processes["ollama"] = ollama_process

    try:
        while True:
            for name, process in processes.items():
                return_code = process.poll()
                if return_code is None:
                    continue

                print(
                    f"[exit] {name} finalizou com codigo {return_code}.",
                    flush=True,
                )

                for other_name, other_process in processes.items():
                    if other_name != name:
                        stop_process(other_name, other_process)
                return return_code

            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n[shutdown] Ctrl+C recebido. Encerrando servicos...", flush=True)
        for name, process in processes.items():
            stop_process(name, process)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
