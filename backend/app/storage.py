from pathlib import Path

TEXT_EXTENSIONS = {
    "txt", "text", "md", "markdown", "yaml", "yml", "json", "toml", "ini",
    "cfg", "conf", "log", "csv", "tsv", "xml", "html", "htm", "css", "scss",
    "js", "jsx", "ts", "tsx", "py", "java", "c", "h", "cpp", "hpp", "cs",
    "go", "rs", "rb", "php", "sh", "bash", "zsh", "bat", "ps1", "sql", "env",
    "gitignore", "dockerfile", "makefile", "properties", "tex", "lua", "kt",
    "swift", "r", "pl", "vue", "svelte",
}

IMAGE_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "avif", "tiff",
    "tif", "heic",
}

VIDEO_EXTENSIONS = {
    "mp4", "webm", "mkv", "mov", "avi", "m4v", "flv", "wmv", "mpg", "mpeg",
    "ts", "3gp",
}

AUDIO_EXTENSIONS = {
    "mp3", "wav", "ogg", "flac", "aac", "m4a", "opus", "wma",
}


def extension(name: str) -> str:
    return Path(name).suffix.lower().lstrip(".")


def file_kind(name: str, mime_type: str = "") -> str:
    # Trust an explicit media type first: ".ts" is both MPEG-TS video and
    # TypeScript source, so the browser-provided MIME resolves the ambiguity.
    if mime_type.startswith("video/"):
        return "video"
    if mime_type.startswith("audio/"):
        return "audio"
    if mime_type.startswith("image/"):
        return "image"

    ext = extension(name)
    if ext in TEXT_EXTENSIONS:
        return "text"
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in VIDEO_EXTENSIONS:
        return "video"
    if ext in AUDIO_EXTENSIONS:
        return "audio"

    if mime_type.startswith("text/"):
        return "text"
    if mime_type in {"application/json", "application/xml", "application/yaml"}:
        return "text"
    return "other"


def is_text(name: str, mime_type: str = "") -> bool:
    return file_kind(name, mime_type) == "text"
