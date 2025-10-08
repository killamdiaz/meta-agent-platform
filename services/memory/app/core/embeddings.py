"""Deterministic text embedding helper for the demo environment."""
from __future__ import annotations

import hashlib

import numpy as np

EMBEDDING_DIM = 1536


def text_to_embedding(text: str) -> list[float]:
    """Generate a deterministic pseudo-embedding vector from input text."""
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    rng = np.random.default_rng(int.from_bytes(digest[:8], "big", signed=False))
    vector = rng.normal(size=EMBEDDING_DIM)
    norm = np.linalg.norm(vector)
    if norm == 0:
        return vector.tolist()
    return (vector / norm).tolist()


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(a @ b)
