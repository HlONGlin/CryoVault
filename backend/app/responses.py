import re
from collections.abc import Iterator
from pathlib import Path
from urllib.parse import quote

from fastapi import Request
from fastapi.responses import Response, StreamingResponse

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")
CHUNK_SIZE = 1024 * 1024


def _iter_file(path: Path, start: int, length: int | None) -> Iterator[bytes]:
    with open(path, "rb") as f:
        f.seek(start)
        remaining = length
        while remaining is None or remaining > 0:
            size = CHUNK_SIZE if remaining is None else min(CHUNK_SIZE, remaining)
            chunk = f.read(size)
            if not chunk:
                break
            if remaining is not None:
                remaining -= len(chunk)
            yield chunk


def serve_file(
    path: Path,
    request: Request,
    media_type: str,
    *,
    filename: str | None = None,
    inline: bool = False,
) -> Response:
    """Serve a file with HTTP Range support (needed for video/audio seeking)."""
    file_size = path.stat().st_size
    disposition = "inline" if inline else "attachment"

    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=0, must-revalidate",
    }
    if filename:
        headers["Content-Disposition"] = (
            f"{disposition}; filename*=UTF-8''{quote(filename)}"
        )

    range_header = request.headers.get("range")
    if range_header:
        match = RANGE_RE.match(range_header.strip())
        if match:
            start_s, end_s = match.group(1), match.group(2)
            if start_s == "":
                length = int(end_s or 0)
                start = max(file_size - length, 0)
                end = file_size - 1
            else:
                start = int(start_s)
                end = int(end_s) if end_s else file_size - 1
            end = min(end, file_size - 1)

            if start >= file_size or start > end:
                return Response(
                    status_code=416,
                    headers={"Content-Range": f"bytes */{file_size}"},
                )

            length = end - start + 1
            headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
            headers["Content-Length"] = str(length)
            return StreamingResponse(
                _iter_file(path, start, length),
                status_code=206,
                media_type=media_type,
                headers=headers,
            )

    headers["Content-Length"] = str(file_size)
    return StreamingResponse(
        _iter_file(path, 0, None), media_type=media_type, headers=headers
    )
