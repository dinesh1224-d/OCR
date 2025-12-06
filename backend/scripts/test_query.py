"""
Utility script to exercise the query pipeline directly.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server import rag_pipeline  # noqa: E402


def main() -> None:
    print("RAG pipeline available:", rag_pipeline is not None)
    if not rag_pipeline:
        return

    try:
        result = rag_pipeline.query("Who owns the land parcel?")
        print(json.dumps(result, indent=2))
    except Exception as exc:  # pragma: no cover
        import traceback

        print("Query raised exception:", exc)
        traceback.print_exc()


if __name__ == "__main__":
    main()

