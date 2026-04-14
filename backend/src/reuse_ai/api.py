from __future__ import annotations

from io import BytesIO
from typing import Annotated

import torch
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from reuse_ai.predictor import ReusePredictor


app = FastAPI(title="Reuse.AI Backend", version="0.1.0")
_predictor: ReusePredictor | None = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_predictor() -> ReusePredictor:
    global _predictor
    if _predictor is None:
        try:
            _predictor = ReusePredictor()
        except (FileNotFoundError, RuntimeError) as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
    return _predictor


@app.get("/health")
@app.get("/api/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "model_ready": _predictor is not None,
        "cuda_available": torch.cuda.is_available(),
        "torch_cuda_version": torch.version.cuda,
    }


@app.post("/analyze")
@app.post("/api/analyze")
async def analyze(
    files: Annotated[list[UploadFile], File(...)],
    latitude: Annotated[float | None, Form()] = None,
    longitude: Annotated[float | None, Form()] = None,
    country_code: Annotated[str | None, Form()] = None,
    state: Annotated[str | None, Form()] = None,
    state_code: Annotated[str | None, Form()] = None,
    city: Annotated[str | None, Form()] = None,
) -> dict:
    predictor = get_predictor()
    images = []
    for file in files:
        image_bytes = await file.read()
        images.append(Image.open(BytesIO(image_bytes)).convert("RGB"))
    return predictor.predict(
        images=images,
        latitude=latitude,
        longitude=longitude,
        country_code=country_code,
        state=state,
        state_code=state_code,
        city=city,
    )


def run(host: str = "0.0.0.0", port: int = 8000) -> None:
    uvicorn.run("reuse_ai.api:app", host=host, port=port, reload=False)
