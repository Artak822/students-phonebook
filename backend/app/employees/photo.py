import io

from PIL import Image

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_SIZE = 5 * 1024 * 1024  # 5 MB
MAX_DIM = 1024


def process_image(raw: bytes) -> bytes:
    """Rotate by EXIF, resize to max 1024x1024, convert to JPEG q85."""
    try:
        img = Image.open(io.BytesIO(raw))
    except Exception:
        raise ValueError("UNSUPPORTED_FORMAT")

    # Check format before EXIF transpose
    fmt = img.format
    if fmt == "HEIF" or (fmt and fmt.upper() not in ALLOWED_FORMATS):
        raise ValueError("UNSUPPORTED_FORMAT")

    # EXIF auto-rotate
    try:
        from PIL import ImageOps
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass

    # Convert to RGB (drop alpha)
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Resize
    w, h = img.size
    if w > MAX_DIM or h > MAX_DIM:
        img.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()
