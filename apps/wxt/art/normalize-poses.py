"""
Puts the pose pictures of Beta on one canvas, so that switching between them does not make her jump or change size.

    python3 art/normalize-poses.py        (needs Pillow; run from apps/wxt)

Reads the drawn originals from `art/beta-poses/` and writes the files the extension ships to `public/beta/`.
Every pose gets the canvas of `public/beta_plugin.webp` (762 x 855), centred horizontally and aligned to the bottom edge.
"""

from pathlib import Path

from PIL import Image

CANVAS = (762, 855)
SOURCE = Path(__file__).parent / "beta-poses"
TARGET = Path(__file__).parent.parent / "public" / "beta"

# `rotate` is wider than the others because of the motion lines. The arrow on the left is cleared, the window keeps
# the head and fades the afterimage on the right.
ROTATE_WINDOW_LEFT = 95
ROTATE_ARROW = (115, 425)  # clear everything left of x and above y
ROTATE_FADE_FROM = 833

# Used as the shipped poses; `neutral.webp` stays in the sources, nothing shows it yet.
POSES = ["down", "top", "rotate", "blow", "heart"]

# Poses drawn at the size of the others; the average width is taken from these.
AS_DRAWN = ["down", "top", "blow"]


def last_frame(path: Path) -> Image.Image:
    """`blow.webp` is animated and its first frame is empty, so the pose is the last frame."""
    picture = Image.open(path)
    picture.seek(getattr(picture, "n_frames", 1) - 1)
    return picture.convert("RGBA")


def prepare_rotate(picture: Image.Image) -> Image.Image:
    clear_x, clear_y = ROTATE_ARROW
    pixels = picture.load()
    for x in range(clear_x):
        for y in range(clear_y):
            pixels[x, y] = (0, 0, 0, 0)

    window = picture.crop((ROTATE_WINDOW_LEFT, 0, ROTATE_WINDOW_LEFT + CANVAS[0], picture.height))
    window_pixels = window.load()
    fade_from = ROTATE_FADE_FROM - ROTATE_WINDOW_LEFT
    for x in range(fade_from, window.width):
        keep = 1 - (x - fade_from) / (window.width - fade_from)
        for y in range(window.height):
            red, green, blue, alpha = window_pixels[x, y]
            window_pixels[x, y] = (red, green, blue, round(alpha * keep))
    return window


def average_width() -> int:
    """The mean width of the pictures drawn at their own size: Beta's base picture and the poses that are not scaled."""
    widths = [Image.open(TARGET.parent / "beta_plugin.webp").width]
    widths += [Image.open(SOURCE / f"{name}.webp").width for name in AS_DRAWN]
    return round(sum(widths) / len(widths))


def scale_to_average(picture: Image.Image) -> Image.Image:
    """A picture drawn larger (`heart.webp`) is scaled so that its head is as wide as the average of the others."""
    if picture.width <= CANVAS[0]:
        return picture
    width = min(average_width(), CANVAS[0])
    scale = width / picture.width
    return picture.resize((width, round(picture.height * scale)), Image.LANCZOS)


def on_canvas(picture: Image.Image) -> Image.Image:
    picture = scale_to_average(picture)
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    left = (CANVAS[0] - picture.width) // 2
    top = CANVAS[1] - picture.height
    canvas.alpha_composite(picture, (max(left, 0), max(top, 0)))
    return canvas


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    for name in POSES:
        picture = last_frame(SOURCE / f"{name}.webp")
        if name == "rotate":
            picture = prepare_rotate(picture)
        out = TARGET / f"{name}.webp"
        on_canvas(picture).save(out, "WEBP", quality=90, method=6, alpha_quality=100)
        print(f"{name}: {picture.size} -> {CANVAS}, {out.stat().st_size // 1024} KB")


main()
