"""Generate SoleilCode's deterministic social card and terminal demo.

Usage:
    python scripts/generate_promo_assets.py --social-source path/to/background.png

The background is intentionally generated separately so the final typography stays
pixel-perfect and the animated terminal remains reproducible from repository code.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
SOCIAL_SIZE = (1280, 640)
DEMO_SIZE = (1200, 675)

COLORS = {
    "background": "#07110b",
    "panel": "#09140d",
    "panel_alt": "#0c1d12",
    "border": "#1b6637",
    "green": "#4ade80",
    "green_strong": "#22c55e",
    "green_dim": "#267745",
    "text": "#e8fff0",
    "muted": "#92aa99",
    "yellow": "#fbbf24",
    "red": "#fb7185",
}

FONT_REGULAR = Path(r"C:\Windows\Fonts\segoeui.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\segoeuib.ttf")
FONT_MONO = Path(r"C:\Windows\Fonts\consola.ttf")
FONT_MONO_BOLD = Path(r"C:\Windows\Fonts\consolab.ttf")


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def rounded_rectangle(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int,
    *,
    fill: str | tuple[int, int, int, int] | None = None,
    outline: str | tuple[int, int, int, int] | None = None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def generate_social(source: Path, target: Path) -> None:
    background = Image.open(source).convert("RGB")
    background = ImageOps.fit(
        background,
        SOCIAL_SIZE,
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )

    # Keep the generated illustration visible while making the text field consistent.
    shade = Image.new("RGBA", SOCIAL_SIZE, (0, 0, 0, 0))
    shade_draw = ImageDraw.Draw(shade)
    for x in range(780):
        opacity = round(172 * (1 - x / 780) ** 2)
        shade_draw.line((x, 0, x, SOCIAL_SIZE[1]), fill=(3, 12, 7, opacity))
    background = Image.alpha_composite(background.convert("RGBA"), shade)

    draw = ImageDraw.Draw(background)
    title_font = font(FONT_BOLD, 86)
    tagline_font = font(FONT_REGULAR, 35)
    mono_font = font(FONT_MONO_BOLD, 23)
    small_font = font(FONT_BOLD, 18)

    draw.text((88, 152), "SoleilCode", font=title_font, fill=COLORS["text"])
    draw.rounded_rectangle(
        (89, 257, 465, 264),
        radius=4,
        fill=COLORS["green_strong"],
    )
    draw.text((91, 292), "Free-first. Local-first.", font=tagline_font, fill=COLORS["green"])
    draw.text((91, 338), "Built to code.", font=tagline_font, fill=COLORS["text"])

    rounded_rectangle(
        draw,
        (91, 422, 481, 474),
        13,
        fill=(7, 17, 11, 214),
        outline=COLORS["border"],
        width=2,
    )
    draw.text((111, 435), "$ npm install -g soleilcode", font=mono_font, fill=COLORS["text"])

    rounded_rectangle(
        draw,
        (91, 503, 282, 542),
        19,
        fill=COLORS["panel_alt"],
        outline=COLORS["green_dim"],
        width=1,
    )
    draw.text((113, 513), "OPEN SOURCE · MIT", font=small_font, fill=COLORS["green"])

    target.parent.mkdir(parents=True, exist_ok=True)
    background.convert("RGB").save(target, format="PNG", optimize=True)


def draw_terminal_frame(visible_steps: int, cursor_on: bool) -> Image.Image:
    image = Image.new("RGB", DEMO_SIZE, COLORS["background"])
    draw = ImageDraw.Draw(image)

    # Subtle emerald glow behind the terminal.
    glow = Image.new("RGBA", DEMO_SIZE, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((735, -130, 1310, 430), fill=(20, 150, 72, 45))
    glow = glow.filter(ImageFilter.GaussianBlur(72))
    image = Image.alpha_composite(image.convert("RGBA"), glow)
    draw = ImageDraw.Draw(image)

    rounded_rectangle(
        draw,
        (35, 28, 1165, 645),
        22,
        fill=COLORS["panel"],
        outline=COLORS["border"],
        width=2,
    )

    # Window chrome.
    for index, color in enumerate(("#fb7185", "#fbbf24", "#4ade80")):
        draw.ellipse((68 + index * 29, 57, 82 + index * 29, 71), fill=color)
    draw.text(
        (455, 52),
        "SoleilCode — terminal",
        font=font(FONT_REGULAR, 18),
        fill=COLORS["muted"],
    )

    mono = font(FONT_MONO, 22)
    mono_bold = font(FONT_MONO_BOLD, 22)
    small = font(FONT_MONO, 18)

    # Persistent header mirrors src/ui.ts.
    header = (58, 94, 1142, 229)
    rounded_rectangle(draw, header, 12, fill=COLORS["panel_alt"], outline=COLORS["green_dim"], width=2)
    draw.text((82, 111), r" /\_/\ ", font=mono_bold, fill=COLORS["green"])
    draw.text((80, 141), "( •.• )", font=mono_bold, fill=COLORS["green"])
    draw.text((83, 171), " / >", font=mono_bold, fill=COLORS["green"])
    sun_x, sun_y = 163, 183
    draw.ellipse((sun_x - 7, sun_y - 7, sun_x + 7, sun_y + 7), fill=COLORS["yellow"])
    for dx, dy in ((0, -13), (0, 13), (-13, 0), (13, 0), (-9, -9), (9, -9), (-9, 9), (9, 9)):
        draw.line((sun_x + dx * 0.7, sun_y + dy * 0.7, sun_x + dx, sun_y + dy), fill=COLORS["yellow"], width=2)
    draw.text((210, 112), "SoleilCode · Free-first AI coding agent", font=mono_bold, fill=COLORS["text"])
    draw.text((210, 146), "SoleilRelay · auto · 4 models ready · EN", font=mono, fill=COLORS["green"])
    draw.text((210, 180), r"C:\projects\task-board", font=mono, fill=COLORS["muted"])
    draw.text(
        (82, 241),
        "/help commands  ·  Ctrl+C stop  ·  /exit exit",
        font=small,
        fill=COLORS["muted"],
    )
    draw.line((58, 274, 1142, 274), fill=COLORS["green_dim"], width=2)

    steps: list[tuple[str, str, ImageFont.FreeTypeFont]] = [
        ("> ", COLORS["green"], mono_bold),
        ("Build a tiny task board and verify it", COLORS["text"], mono),
        ("  SoleilRelay: OpenRouter / Qwen 3 · best free coding route", COLORS["muted"], small),
        ("+ list_files", COLORS["green"], mono_bold),
        ("  -> OK · 12 project files inspected", COLORS["muted"], small),
        ("+ write_file", COLORS["green"], mono_bold),
        ("  -> OK · index.html created · checkpoint saved", COLORS["muted"], small),
        ("+ browser_test", COLORS["green"], mono_bold),
        ("  -> OK · Edge · interaction passed · 0 runtime errors", COLORS["muted"], small),
        ("Done — created and browser-tested the task board.", COLORS["text"], mono),
        ("index.html", COLORS["green"], mono_bold),
    ]

    y_positions = [303, 303, 347, 387, 419, 459, 491, 531, 563, 603, 603]
    x_positions = [79, 115, 82, 80, 82, 80, 82, 80, 82, 80, 690]

    for index in range(min(visible_steps, len(steps))):
        text, color, selected_font = steps[index]
        draw.text((x_positions[index], y_positions[index]), text, font=selected_font, fill=color)

    if visible_steps <= 2 and cursor_on:
        cursor_x = 80 if visible_steps == 0 else 115 + round(draw.textlength(steps[1][0], font=mono)) + 4
        draw.rectangle((cursor_x, 305, cursor_x + 12, 330), fill=COLORS["green"])

    # Timeline marker, useful even in a small README embed.
    progress = min(1.0, visible_steps / len(steps))
    draw.rounded_rectangle((58, 624, 1142, 631), radius=4, fill="#102719")
    draw.rounded_rectangle(
        (58, 624, 58 + round(1084 * progress), 631),
        radius=4,
        fill=COLORS["green_strong"],
    )

    return image.convert("RGB")


def generate_demo(target: Path) -> None:
    sequence = [
        (0, 650),
        (2, 900),
        (3, 850),
        (5, 850),
        (7, 950),
        (9, 1100),
        (11, 2600),
    ]
    frames: list[Image.Image] = []
    durations: list[int] = []
    for index, (steps, duration) in enumerate(sequence):
        frames.append(draw_terminal_frame(steps, cursor_on=index % 2 == 0))
        durations.append(duration)

    target.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        target,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--social-source",
        type=Path,
        help="Text-free generated background used for the GitHub social preview.",
    )
    args = parser.parse_args()

    if args.social_source:
        generate_social(args.social_source, ASSETS / "soleilcode-social-preview.png")
    generate_demo(ASSETS / "soleilcode-demo.gif")


if __name__ == "__main__":
    main()
