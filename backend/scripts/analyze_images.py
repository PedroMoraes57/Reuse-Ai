from __future__ import annotations

import argparse
import sys

from _bootstrap import ensure_backend_src_on_path

ensure_backend_src_on_path()

from reuse_ai.predictor import ReusePredictor, format_analysis_report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Analisa uma ou varias imagens com o Reuse.AI.")
    parser.add_argument("--images", nargs="+", required=True, help="Caminhos das imagens.")
    parser.add_argument("--latitude", type=float, default=None)
    parser.add_argument("--longitude", type=float, default=None)
    parser.add_argument("--country-code", type=str, default=None)
    parser.add_argument("--state", type=str, default=None)
    parser.add_argument("--state-code", type=str, default=None)
    parser.add_argument("--city", type=str, default=None)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    try:
        predictor = ReusePredictor()
        result = predictor.predict(
            images=args.images,
            latitude=args.latitude,
            longitude=args.longitude,
            country_code=args.country_code,
            state=args.state,
            state_code=args.state_code,
            city=args.city,
        )
        print(format_analysis_report(result))
    except Exception as error:
        print(f"Erro ao analisar imagens: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
