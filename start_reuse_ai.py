#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path

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
