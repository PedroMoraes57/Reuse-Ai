from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import cv2

from _bootstrap import ensure_backend_src_on_path

ensure_backend_src_on_path()

from reuse_ai.config import ROOT_DIR
from reuse_ai.predictor import ReusePredictor, format_analysis_report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Captura imagens da webcam e analisa com o Reuse.AI.")
    parser.add_argument("--camera-index", type=int, default=0)
    parser.add_argument("--latitude", type=float, default=None)
    parser.add_argument("--longitude", type=float, default=None)
    parser.add_argument("--country-code", type=str, default=None)
    parser.add_argument("--state", type=str, default=None)
    parser.add_argument("--state-code", type=str, default=None)
    parser.add_argument("--city", type=str, default=None)
    return parser


def _draw_overlay(frame, captured_count: int) -> None:
    instructions = [
        "ESPACO = capturar",
        "ENTER = analisar",
        "C = limpar",
        "Q = sair",
        f"Capturas: {captured_count}",
    ]
    for index, line in enumerate(instructions, start=1):
        cv2.putText(
            frame,
            line,
            (20, 30 * index),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2,
            cv2.LINE_AA,
        )


def main() -> None:
    args = build_parser().parse_args()
    predictor = ReusePredictor()
    capture_dir = ROOT_DIR / "artifacts" / "captures"
    capture_dir.mkdir(parents=True, exist_ok=True)

    camera = cv2.VideoCapture(args.camera_index)
    if not camera.isOpened():
        raise RuntimeError("Nao foi possivel abrir a camera.")

    captured_images: list[Path] = []
    window_name = "Reuse.AI Camera"

    try:
        while True:
            success, frame = camera.read()
            if not success:
                raise RuntimeError("Falha ao ler frame da camera.")

            _draw_overlay(frame, len(captured_images))
            cv2.imshow(window_name, frame)
            key = cv2.waitKey(1) & 0xFF

            if key == ord(" "):
                file_name = f"capture_{int(time.time() * 1000)}.jpg"
                file_path = capture_dir / file_name
                cv2.imwrite(str(file_path), frame)
                captured_images.append(file_path)
                print(f"Imagem capturada: {file_path}")
            elif key in (10, 13):
                if not captured_images:
                    file_name = f"capture_{int(time.time() * 1000)}.jpg"
                    file_path = capture_dir / file_name
                    cv2.imwrite(str(file_path), frame)
                    captured_images.append(file_path)
                    print(f"Imagem capturada automaticamente: {file_path}")

                result = predictor.predict(
                    images=captured_images,
                    latitude=args.latitude,
                    longitude=args.longitude,
                    country_code=args.country_code,
                    state=args.state,
                    state_code=args.state_code,
                    city=args.city,
                )
                print()
                print(format_analysis_report(result))
                print()
            elif key in (ord("c"), ord("C")):
                for image_path in captured_images:
                    if image_path.exists():
                        image_path.unlink()
                captured_images.clear()
                print("Capturas limpas.")
            elif key in (ord("q"), ord("Q")):
                break
    finally:
        camera.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Erro na captura/analise: {error}", file=sys.stderr)
        raise SystemExit(1) from error
