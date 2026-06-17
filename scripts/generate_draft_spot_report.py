#!/usr/bin/env python3
"""Generate a PDF report comparing draft position with season outcomes."""

from __future__ import annotations

import json
import math
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image as RLImage,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "assets" / "SeasonSummary.json"
OUT_DIR = ROOT / "reports"
FIG_DIR = OUT_DIR / "draft_spot_figures"
PDF_PATH = OUT_DIR / "draft_spot_analysis.pdf"

BG = "#f7f3ea"
INK = "#182028"
MUTED = "#66717b"
GRID = "#d8d0c1"
TEAL = "#167c80"
RED = "#b94e48"
GOLD = "#d99a1e"
BLUE = "#365c8d"
GREEN = "#668a3d"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica.ttc",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


F_TITLE = font(36, True)
F_SUBTITLE = font(19, True)
F_AXIS = font(18, False)
F_SMALL = font(15, False)
F_TINY = font(12, False)
F_LABEL = font(16, True)


@dataclass
class Row:
    season: int
    owner: str
    draft_pick: int
    team_count: int
    wins: float
    losses: float
    ties: float
    finish: int
    points_for: float
    champion: bool
    saunders: bool
    made_playoffs: bool
    top_three: bool
    win_pct: float
    finish_score: float
    draft_percentile: float
    points_rank: int
    points_score: float
    points_z: float
    wins_above_avg: float


def load_rows() -> list[Row]:
    raw = json.loads(DATA_PATH.read_text())
    by_season: dict[int, list[dict]] = defaultdict(list)
    for item in raw:
        by_season[item["season"]].append(item)

    rows: list[Row] = []
    for season, season_rows in sorted(by_season.items()):
        with_picks = [r for r in season_rows if r.get("draft_pick") is not None]
        if not with_picks:
            continue

        team_count = len(season_rows)
        points = [float(r["points_for"]) for r in season_rows]
        avg_points = statistics.mean(points)
        stdev_points = statistics.pstdev(points) or 1.0
        avg_wins = statistics.mean(float(r["wins"]) + 0.5 * float(r["ties"]) for r in season_rows)
        point_rank_lookup = {
            id(r): rank
            for rank, r in enumerate(
                sorted(season_rows, key=lambda item: float(item["points_for"]), reverse=True),
                start=1,
            )
        }

        for item in season_rows:
            pick = item.get("draft_pick")
            if pick is None:
                continue
            wins = float(item["wins"])
            losses = float(item["losses"])
            ties = float(item["ties"])
            games = wins + losses + ties
            playoff_games = int(item.get("playoff_wins", 0)) + int(item.get("playoff_losses", 0))
            made_playoffs = bool(playoff_games or item.get("champion") or item.get("bye") or item.get("wild_card"))
            finish = int(item["finish"])
            points_for = float(item["points_for"])
            denom = max(team_count - 1, 1)
            rows.append(
                Row(
                    season=int(season),
                    owner=item["owner"],
                    draft_pick=int(pick),
                    team_count=team_count,
                    wins=wins,
                    losses=losses,
                    ties=ties,
                    finish=finish,
                    points_for=points_for,
                    champion=bool(item.get("champion")),
                    saunders=bool(item.get("saunders")),
                    made_playoffs=made_playoffs,
                    top_three=finish <= 3,
                    win_pct=(wins + 0.5 * ties) / games if games else 0,
                    finish_score=(team_count - finish) / denom,
                    draft_percentile=(int(pick) - 1) / denom,
                    points_rank=point_rank_lookup[id(item)],
                    points_score=(team_count - point_rank_lookup[id(item)]) / denom,
                    points_z=(points_for - avg_points) / stdev_points,
                    wins_above_avg=(wins + 0.5 * ties) - avg_wins,
                )
            )
    return rows


def pearson(xs: list[float], ys: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    mean_x = statistics.mean(xs)
    mean_y = statistics.mean(ys)
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    denom_x = math.sqrt(sum((x - mean_x) ** 2 for x in xs))
    denom_y = math.sqrt(sum((y - mean_y) ** 2 for y in ys))
    if not denom_x or not denom_y:
        return 0.0
    return numerator / (denom_x * denom_y)


def regression(xs: list[float], ys: list[float]) -> tuple[float, float]:
    if len(xs) < 2:
        return 0.0, 0.0
    mean_x = statistics.mean(xs)
    mean_y = statistics.mean(ys)
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    denominator = sum((x - mean_x) ** 2 for x in xs)
    if not denominator:
        return 0.0, mean_y
    slope = numerator / denominator
    return slope, mean_y - slope * mean_x


def band_for_pick(pick: int) -> str:
    if pick <= 3:
        return "Early (1-3)"
    if pick <= 7:
        return "Middle (4-7)"
    return "Late (8+)"


ZONE_ORDER = ["Early (1-3)", "Middle (4-7)", "Late (8+)"]


def pct(value: float) -> str:
    return f"{value * 100:.0f}%"


def fmt(value: float, digits: int = 2) -> str:
    return f"{value:.{digits}f}"


def color(hex_color: str) -> tuple[int, int, int]:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))


def canvas(title: str, subtitle: str | None = None, size: tuple[int, int] = (1600, 900)):
    img = Image.new("RGB", size, color(BG))
    draw = ImageDraw.Draw(img)
    draw.text((60, 44), title, fill=color(INK), font=F_TITLE)
    if subtitle:
        draw.text((62, 92), subtitle, fill=color(MUTED), font=F_AXIS)
    return img, draw


def text_center(draw: ImageDraw.ImageDraw, xy: tuple[float, float], text: str, fill, font_obj):
    bbox = draw.textbbox((0, 0), text, font=font_obj)
    draw.text((xy[0] - (bbox[2] - bbox[0]) / 2, xy[1] - (bbox[3] - bbox[1]) / 2), text, fill=fill, font=font_obj)


def plot_area(draw, left, top, right, bottom, x_label: str, y_label: str):
    draw.rectangle((left, top, right, bottom), outline=color(GRID), width=2)
    draw.text(((left + right) / 2 - 70, bottom + 54), x_label, fill=color(MUTED), font=F_AXIS)
    draw.text((left - 110, top - 28), y_label, fill=color(MUTED), font=F_AXIS)


def save_scatter(rows: list[Row]) -> Path:
    img, draw = canvas(
        "Draft Slot vs Final Finish",
        "Each dot is a team-season. Lower finish number is better; gold dots are champions.",
    )
    left, top, right, bottom = 150, 150, 1475, 750
    plot_area(draw, left, top, right, bottom, "Draft pick", "Final finish")
    max_pick = max(r.draft_pick for r in rows)
    max_finish = max(r.finish for r in rows)
    for p in range(1, max_pick + 1):
        x = left + (p - 1) / (max_pick - 1) * (right - left)
        draw.line((x, top, x, bottom), fill=color(GRID), width=1)
        text_center(draw, (x, bottom + 26), str(p), color(MUTED), F_SMALL)
    for f in range(1, max_finish + 1):
        y = top + (f - 1) / (max_finish - 1) * (bottom - top)
        draw.line((left, y, right, y), fill=color(GRID), width=1)
        text_center(draw, (left - 35, y), str(f), color(MUTED), F_SMALL)

    xs = [r.draft_pick for r in rows]
    ys = [r.finish for r in rows]
    slope, intercept = regression(xs, ys)
    x1, x2 = 1, max_pick
    y1, y2 = slope * x1 + intercept, slope * x2 + intercept
    draw.line(
        (
            left + (x1 - 1) / (max_pick - 1) * (right - left),
            top + (y1 - 1) / (max_finish - 1) * (bottom - top),
            left + (x2 - 1) / (max_pick - 1) * (right - left),
            top + (y2 - 1) / (max_finish - 1) * (bottom - top),
        ),
        fill=color(RED),
        width=5,
    )

    for idx, r in enumerate(rows):
        jitter_x = ((idx * 37) % 19 - 9) * 2.1
        jitter_y = ((idx * 23) % 17 - 8) * 1.9
        x = left + (r.draft_pick - 1) / (max_pick - 1) * (right - left) + jitter_x
        y = top + (r.finish - 1) / (max_finish - 1) * (bottom - top) + jitter_y
        fill = GOLD if r.champion else TEAL if r.made_playoffs else MUTED
        radius = 10 if r.champion else 7
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color(fill), outline=color(INK))

    r_value = pearson(xs, ys)
    draw.rounded_rectangle((930, 42, 1535, 118), radius=8, fill="#eee4d2", outline=color(GRID))
    draw.text(
        (955, 58),
        f"Correlation: r={r_value:.2f} | Trend: {slope:+.2f} finish places per pick",
        fill=color(INK),
        font=F_SUBTITLE,
    )
    path = FIG_DIR / "01_draft_slot_vs_finish.png"
    img.save(path, quality=95)
    return path


def grouped_stats(rows: list[Row], key_func):
    groups: dict[str, list[Row]] = defaultdict(list)
    for row in rows:
        groups[str(key_func(row))].append(row)
    return groups


def save_average_by_pick(rows: list[Row]) -> Path:
    img, draw = canvas(
        "Average Outcomes by Pick",
        "Bars show normalized final finish. Dots show points-for z-score by draft slot.",
    )
    left, top, right, bottom = 130, 165, 1485, 735
    plot_area(draw, left, top, right, bottom, "Draft pick", "Normalized finish score")
    groups = grouped_stats(rows, lambda r: r.draft_pick)
    max_pick = max(r.draft_pick for r in rows)
    width = (right - left) / max_pick
    for i in range(0, 6):
        value = i / 5
        y = bottom - value * (bottom - top)
        draw.line((left, y, right, y), fill=color(GRID), width=1)
        text_center(draw, (left - 45, y), f"{value:.1f}", color(MUTED), F_SMALL)

    point_coords = []
    for pick in range(1, max_pick + 1):
        values = groups.get(str(pick), [])
        if not values:
            continue
        avg_finish = statistics.mean(r.finish_score for r in values)
        avg_points_z = statistics.mean(r.points_z for r in values)
        x0 = left + (pick - 1) * width + 12
        x1 = left + pick * width - 12
        y = bottom - avg_finish * (bottom - top)
        fill = TEAL if len(values) > 1 else "#8ca8a8"
        draw.rectangle((x0, y, x1, bottom), fill=color(fill), outline=color(INK))
        text_center(draw, ((x0 + x1) / 2, bottom + 25), str(pick), color(MUTED), F_SMALL)
        text_center(draw, ((x0 + x1) / 2, y - 18), f"n={len(values)}", color(MUTED), F_TINY)
        z_clamped = max(-1.5, min(1.5, avg_points_z))
        point_y = top + (1.5 - z_clamped) / 3.0 * (bottom - top)
        point_coords.append(((x0 + x1) / 2, point_y, avg_points_z))

    for a, b in zip(point_coords, point_coords[1:]):
        draw.line((a[0], a[1], b[0], b[1]), fill=color(GOLD), width=5)
    for x, y, z in point_coords:
        draw.ellipse((x - 9, y - 9, x + 9, y + 9), fill=color(GOLD), outline=color(INK))
    draw.text((1075, 118), "Gold line: avg points z-score", fill=color(GOLD), font=F_LABEL)
    path = FIG_DIR / "02_average_by_pick.png"
    img.save(path, quality=95)
    return path


def save_band_rates(rows: list[Row]) -> Path:
    img, draw = canvas(
        "Outcome Rates by Draft Zone",
        "Early = picks 1-3, Middle = 4-7, Late = 8+.",
    )
    left, top, right, bottom = 150, 165, 1470, 740
    bands = ["Early (1-3)", "Middle (4-7)", "Late (8+)"]
    metrics = [
        ("Champion", lambda rs: sum(r.champion for r in rs) / len(rs), GOLD),
        ("Top 3", lambda rs: sum(r.top_three for r in rs) / len(rs), TEAL),
        ("Playoff", lambda rs: sum(r.made_playoffs for r in rs) / len(rs), BLUE),
        ("Saunders", lambda rs: sum(r.saunders for r in rs) / len(rs), RED),
    ]
    groups = grouped_stats(rows, lambda r: band_for_pick(r.draft_pick))
    group_w = (right - left) / len(bands)
    bar_w = 68
    for i in range(0, 6):
        value = i / 5
        y = bottom - value * (bottom - top)
        draw.line((left, y, right, y), fill=color(GRID), width=1)
        text_center(draw, (left - 45, y), f"{int(value*100)}%", color(MUTED), F_SMALL)
    for gi, band in enumerate(bands):
        rs = groups[band]
        center = left + gi * group_w + group_w / 2
        draw.text((center - 115, bottom + 38), f"{band} (n={len(rs)})", fill=color(INK), font=F_LABEL)
        start = center - (len(metrics) * bar_w) / 2
        for mi, (label, metric_func, metric_color) in enumerate(metrics):
            rate = metric_func(rs)
            x0 = start + mi * bar_w
            x1 = x0 + 48
            y = bottom - rate * (bottom - top)
            draw.rectangle((x0, y, x1, bottom), fill=color(metric_color), outline=color(INK))
            text_center(draw, ((x0 + x1) / 2, y - 17), pct(rate), color(INK), F_TINY)
    legend_x = 1030
    for i, (label, _, metric_color) in enumerate(metrics):
        y = 98 + i * 26
        draw.rectangle((legend_x, y, legend_x + 20, y + 20), fill=color(metric_color), outline=color(INK))
        draw.text((legend_x + 30, y), label, fill=color(INK), font=F_SMALL)
    path = FIG_DIR / "03_outcome_rates_by_zone.png"
    img.save(path, quality=95)
    return path


def save_heatmap(rows: list[Row]) -> Path:
    img, draw = canvas(
        "Where Draft Slots Finished",
        "Cell values are counts of team-seasons at each draft pick and final finish.",
    )
    left, top, x_cell, y_cell = 175, 150, 92, 58
    max_pick = max(r.draft_pick for r in rows)
    max_finish = max(r.finish for r in rows)
    counts = Counter((r.draft_pick, r.finish) for r in rows)
    max_count = max(counts.values())
    for pick in range(1, max_pick + 1):
        x = left + (pick - 1) * x_cell
        text_center(draw, (x + x_cell / 2, top - 28), str(pick), color(MUTED), F_SMALL)
    for finish in range(1, max_finish + 1):
        y = top + (finish - 1) * y_cell
        text_center(draw, (left - 42, y + y_cell / 2), str(finish), color(MUTED), F_SMALL)
        for pick in range(1, max_pick + 1):
            x = left + (pick - 1) * x_cell
            value = counts.get((pick, finish), 0)
            intensity = value / max_count if max_count else 0
            base = color("#fbf8f0")
            accent = color(TEAL)
            fill = tuple(int(base[i] * (1 - intensity) + accent[i] * intensity) for i in range(3))
            draw.rectangle((x, y, x + x_cell - 3, y + y_cell - 3), fill=fill, outline=color(GRID))
            if value:
                text_center(draw, (x + x_cell / 2, y + y_cell / 2), str(value), color(INK), F_LABEL)
    draw.text((left + 410, top + max_finish * y_cell + 28), "Draft pick", fill=color(MUTED), font=F_AXIS)
    draw.text((40, top + 250), "Final finish", fill=color(MUTED), font=F_AXIS)
    path = FIG_DIR / "04_pick_finish_heatmap.png"
    img.save(path, quality=95)
    return path


def save_champion_strip(rows: list[Row]) -> Path:
    img, draw = canvas(
        "Champion Draft Spots by Season",
        "Each marker is the league champion; vertical position shows where that team drafted.",
        size=(1600, 740),
    )
    champions = sorted([r for r in rows if r.champion], key=lambda r: r.season)
    left, top, right, bottom = 150, 170, 1490, 575
    max_pick = max(r.draft_pick for r in rows)
    min_season = min(r.season for r in champions)
    max_season = max(r.season for r in champions)
    plot_area(draw, left, top, right, bottom, "Season", "Champion pick")
    max_pick = max(r.draft_pick for r in rows)
    for pick in range(1, max_pick + 1):
        y = top + (pick - 1) / (max_pick - 1) * (bottom - top)
        draw.line((left, y, right, y), fill=color(GRID), width=1)
        text_center(draw, (left - 36, y), str(pick), color(MUTED), F_SMALL)
    for season in range(min_season, max_season + 1):
        x = left + (season - min_season) / (max_season - min_season) * (right - left)
        draw.line((x, top, x, bottom), fill=color(GRID), width=1)
        text_center(draw, (x, bottom + 28), str(season), color(MUTED), F_TINY)
    for i, r in enumerate(champions):
        x = left + (r.season - min_season) / (max_season - min_season) * (right - left)
        y = top + (r.draft_pick - 1) / (max_pick - 1) * (bottom - top)
        draw.ellipse((x - 16, y - 16, x + 16, y + 16), fill=color(GOLD), outline=color(INK), width=2)
        label = f"{r.owner} (pick {r.draft_pick})"
        label_y = y - 42 if i % 2 == 0 else y + 24
        if label_y < top - 48:
            label_y = y + 24
        if label_y > bottom + 38:
            label_y = y - 42
        label_x = min(max(x, left + 90), right - 90)
        text_center(draw, (label_x, label_y), label, color(INK), F_SMALL)
    path = FIG_DIR / "05_champion_draft_spots.png"
    img.save(path, quality=95)
    return path


def save_owner_zone_matrix(rows: list[Row]) -> Path:
    img, draw = canvas(
        "Owner Draft-Zone Results",
        "Cells show average finish score by owner and draft zone. Higher is better; n is sample size.",
        size=(1600, 980),
    )
    owners = sorted({r.owner for r in rows})
    left, top = 255, 155
    owner_w, zone_w, row_h = 185, 270, 58
    max_score = 1.0
    draw.text((left, top - 40), "Owner", fill=color(MUTED), font=F_LABEL)
    for zi, zone_name in enumerate(ZONE_ORDER):
        x = left + owner_w + zi * zone_w
        text_center(draw, (x + zone_w / 2, top - 28), zone_name, color(MUTED), F_LABEL)

    for oi, owner in enumerate(owners):
        y = top + oi * row_h
        draw.rectangle((left, y, left + owner_w, y + row_h - 3), fill=color("#eee4d2"), outline=color(GRID))
        draw.text((left + 16, y + 18), owner, fill=color(INK), font=F_LABEL)
        owner_rows = [r for r in rows if r.owner == owner]
        groups = grouped_stats(owner_rows, lambda r: band_for_pick(r.draft_pick))
        for zi, zone_name in enumerate(ZONE_ORDER):
            x = left + owner_w + zi * zone_w
            rs = groups.get(zone_name, [])
            if rs:
                avg_score = statistics.mean(r.finish_score for r in rs)
                intensity = avg_score / max_score
                base = color("#fbf8f0")
                accent = color(TEAL)
                fill = tuple(int(base[i] * (1 - intensity) + accent[i] * intensity) for i in range(3))
                label = f"{avg_score:.2f}  n={len(rs)}"
            else:
                fill = color("#fbf8f0")
                label = "-"
            draw.rectangle((x, y, x + zone_w - 4, y + row_h - 3), fill=fill, outline=color(GRID))
            text_center(draw, (x + zone_w / 2, y + row_h / 2), label, color(INK), F_LABEL)

    draw.text((left + owner_w + 260, top + len(owners) * row_h + 28), "Average normalized finish score", fill=color(MUTED), font=F_AXIS)
    path = FIG_DIR / "06_owner_zone_matrix.png"
    img.save(path, quality=95)
    return path


def make_pick_table(rows: list[Row]) -> list[list[str]]:
    groups = grouped_stats(rows, lambda r: r.draft_pick)
    table = [["Pick", "N", "Avg Finish", "Avg Finish Score", "Avg Wins +/-", "Avg Points z", "Top 3", "Playoffs", "Champs", "Saunders"]]
    for pick in range(1, max(r.draft_pick for r in rows) + 1):
        rs = groups.get(str(pick), [])
        if not rs:
            continue
        table.append(
            [
                str(pick),
                str(len(rs)),
                fmt(statistics.mean(r.finish for r in rs), 1),
                fmt(statistics.mean(r.finish_score for r in rs), 2),
                fmt(statistics.mean(r.wins_above_avg for r in rs), 2),
                fmt(statistics.mean(r.points_z for r in rs), 2),
                pct(sum(r.top_three for r in rs) / len(rs)),
                pct(sum(r.made_playoffs for r in rs) / len(rs)),
                str(sum(r.champion for r in rs)),
                pct(sum(r.saunders for r in rs) / len(rs)),
            ]
        )
    return table


def make_band_table(rows: list[Row]) -> list[list[str]]:
    groups = grouped_stats(rows, lambda r: band_for_pick(r.draft_pick))
    table = [["Zone", "N", "Avg Pick", "Avg Finish", "Finish Score", "Wins +/-", "Points z", "Top 3", "Playoff", "Champion", "Saunders"]]
    for band in ["Early (1-3)", "Middle (4-7)", "Late (8+)"]:
        rs = groups[band]
        table.append(
            [
                band,
                str(len(rs)),
                fmt(statistics.mean(r.draft_pick for r in rs), 1),
                fmt(statistics.mean(r.finish for r in rs), 1),
                fmt(statistics.mean(r.finish_score for r in rs), 2),
                fmt(statistics.mean(r.wins_above_avg for r in rs), 2),
                fmt(statistics.mean(r.points_z for r in rs), 2),
                pct(sum(r.top_three for r in rs) / len(rs)),
                pct(sum(r.made_playoffs for r in rs) / len(rs)),
                pct(sum(r.champion for r in rs) / len(rs)),
                pct(sum(r.saunders for r in rs) / len(rs)),
            ]
        )
    return table


def make_year_table(rows: list[Row]) -> list[list[str]]:
    table = [["Season", "Champion", "Champion Pick", "Best Regular Season", "Pick", "Saunders", "Pick"]]
    for season in sorted({r.season for r in rows}):
        rs = [r for r in rows if r.season == season]
        champ = next(r for r in rs if r.champion)
        best_regular = sorted(rs, key=lambda r: (-r.wins, -r.points_for))[0]
        saunders = next((r for r in rs if r.saunders), None)
        table.append(
            [
                str(season),
                champ.owner,
                str(champ.draft_pick),
                best_regular.owner,
                str(best_regular.draft_pick),
                saunders.owner if saunders else "None",
                str(saunders.draft_pick) if saunders else "-",
            ]
        )
    return table


def average_score(rows: list[Row]) -> float:
    return statistics.mean(r.finish_score for r in rows) if rows else 0.0


def group_record(label: str, rows: list[Row]) -> dict:
    return {
        "label": label,
        "rows": rows,
        "n": len(rows),
        "avg_finish": statistics.mean(r.finish for r in rows),
        "avg_score": statistics.mean(r.finish_score for r in rows),
        "playoffs": sum(r.made_playoffs for r in rows),
        "top_three": sum(r.top_three for r in rows),
        "champions": sum(r.champion for r in rows),
        "saunders": sum(r.saunders for r in rows),
    }


def format_group(record: dict) -> str:
    return (
        f"{record['label']}: n={record['n']}, avg finish {record['avg_finish']:.1f}, "
        f"playoffs {record['playoffs']}/{record['n']}, top 3 {record['top_three']}/{record['n']}, "
        f"titles {record['champions']}"
    )


def owner_profile(owner: str, rows: list[Row]) -> dict:
    owner_rows = sorted([r for r in rows if r.owner == owner], key=lambda r: r.season)
    by_pick = grouped_stats(owner_rows, lambda r: r.draft_pick)
    pick_records = [
        group_record(f"Pick {pick}", sorted(pick_rows, key=lambda r: r.season))
        for pick, pick_rows in sorted(by_pick.items(), key=lambda item: int(item[0]))
    ]
    by_zone = grouped_stats(owner_rows, lambda r: band_for_pick(r.draft_pick))
    zone_records = [
        group_record(zone_name, by_zone[zone_name])
        for zone_name in ZONE_ORDER
        if by_zone.get(zone_name)
    ]
    best_pick = max(pick_records, key=lambda rec: (rec["avg_score"], rec["champions"], rec["top_three"], rec["playoffs"]))
    repeat_picks = [rec for rec in pick_records if rec["n"] >= 2]
    best_repeat_pick = (
        max(repeat_picks, key=lambda rec: (rec["avg_score"], rec["champions"], rec["top_three"], rec["playoffs"]))
        if repeat_picks
        else None
    )
    best_zone = max(zone_records, key=lambda rec: (rec["avg_score"], rec["champions"], rec["top_three"], rec["playoffs"]))
    repeat_zones = [rec for rec in zone_records if rec["n"] >= 2]
    best_repeat_zone = (
        max(repeat_zones, key=lambda rec: (rec["avg_score"], rec["champions"], rec["top_three"], rec["playoffs"]))
        if repeat_zones
        else None
    )
    worst_zone = min(zone_records, key=lambda rec: (rec["avg_score"], -rec["saunders"])) if len(zone_records) > 1 else None

    if len(owner_rows) == 1:
        only = owner_rows[0]
        recommendation = (
            f"Only one data point: pick {only.draft_pick} in {only.season}, finish {only.finish}. "
            "Use league-wide history more than owner-specific history."
        )
        target = f"Insufficient owner sample; observed pick {only.draft_pick}"
    elif best_repeat_pick and best_repeat_pick["avg_score"] >= best_zone["avg_score"] - 0.03 and best_repeat_pick["n"] >= 3:
        target = best_repeat_pick["label"]
        recommendation = (
            f"Target {best_repeat_pick['label']} specifically. It has the strongest repeat sample: "
            f"avg finish {best_repeat_pick['avg_finish']:.1f}, playoffs {best_repeat_pick['playoffs']}/{best_repeat_pick['n']}, "
            f"titles {best_repeat_pick['champions']}."
        )
    elif best_pick["n"] == 1 and best_pick["avg_score"] > best_zone["avg_score"] + 0.12:
        target = f"{best_pick['label']} upside; {best_zone['label']} repeat zone"
        recommendation = (
            f"Best single result is {best_pick['label']}, but the sturdier area is {best_zone['label']} "
            f"(avg finish {best_zone['avg_finish']:.1f}, n={best_zone['n']})."
        )
    elif best_zone["n"] == 1 and best_repeat_zone:
        if best_zone["avg_score"] > best_repeat_zone["avg_score"] + 0.12:
            target = f"{best_pick['label']} upside; {best_repeat_zone['label']} repeat zone"
            recommendation = (
                f"Best result is {best_pick['label']} in {best_zone['label']}, but that zone only has one sample. "
                f"The best repeat area is {best_repeat_zone['label']} "
                f"(avg finish {best_repeat_zone['avg_finish']:.1f}, n={best_repeat_zone['n']})."
            )
        else:
            target = f"{best_zone['label']} low-sample lean"
            recommendation = (
                f"Lean {best_zone['label']}, but treat it cautiously because it only has one sample. "
                f"The best repeat area is {best_repeat_zone['label']} "
                f"(avg finish {best_repeat_zone['avg_finish']:.1f}, n={best_repeat_zone['n']})."
            )
    else:
        target = best_zone["label"]
        recommendation = (
            f"Target {best_zone['label']}. It is this owner's best zone: avg finish {best_zone['avg_finish']:.1f}, "
            f"playoffs {best_zone['playoffs']}/{best_zone['n']}, titles {best_zone['champions']}."
        )

    caution = "No clear avoid zone yet."
    if worst_zone:
        caution = (
            f"Weakest area: {worst_zone['label']} "
            f"(avg finish {worst_zone['avg_finish']:.1f}, n={worst_zone['n']})."
        )
    if len(owner_rows) <= 2:
        caution += " Sample is too small for a firm owner-specific read."

    history = "; ".join(
        f"{r.season}: p{r.draft_pick}, f{r.finish}{' champ' if r.champion else ''}{' Saunders' if r.saunders else ''}"
        for r in owner_rows
    )
    return {
        "owner": owner,
        "rows": owner_rows,
        "target": target,
        "recommendation": recommendation,
        "caution": caution,
        "best_pick": format_group(best_pick),
        "best_zone": format_group(best_zone),
        "worst_zone": format_group(worst_zone) if worst_zone else "N/A",
        "history": history,
        "pick_records": pick_records,
        "zone_records": zone_records,
    }


def owner_profiles(rows: list[Row]) -> list[dict]:
    return [owner_profile(owner, rows) for owner in sorted({r.owner for r in rows})]


def make_owner_summary_table(rows: list[Row], para_style: ParagraphStyle) -> list[list[object]]:
    table: list[list[object]] = [["Owner", "Target", "Best Evidence", "Caution"]]
    for profile in owner_profiles(rows):
        evidence = f"{profile['best_pick']}. Best zone: {profile['best_zone']}."
        table.append(
            [
                Paragraph(escape(profile["owner"]), para_style),
                Paragraph(escape(profile["target"]), para_style),
                Paragraph(escape(evidence), para_style),
                Paragraph(escape(profile["caution"]), para_style),
            ]
        )
    return table


def owner_detail_flowables(profile: dict, h2: ParagraphStyle, body: ParagraphStyle, table_para: ParagraphStyle):
    pick_lines = [
        format_group(rec)
        for rec in sorted(
            profile["pick_records"],
            key=lambda rec: (-rec["avg_score"], -rec["champions"], -rec["top_three"], rec["label"]),
        )
    ]
    zone_lines = [
        format_group(rec)
        for rec in sorted(
            profile["zone_records"],
            key=lambda rec: (-rec["avg_score"], -rec["champions"], -rec["top_three"], rec["label"]),
        )
    ]
    data = [
        ["Recommendation", Paragraph(escape(profile["recommendation"]), table_para)],
        ["Best Pick(s)", Paragraph(escape("; ".join(pick_lines)), table_para)],
        ["Zone Read", Paragraph(escape("; ".join(zone_lines)), table_para)],
        ["Caution", Paragraph(escape(profile["caution"]), table_para)],
        ["History", Paragraph(escape(profile["history"]), table_para)],
    ]
    table = Table(data, colWidths=[1.0 * inch, 6.1 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eee4d2")),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor(INK)),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7.8),
                ("LEADING", (0, 0), (-1, -1), 9.4),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d8d0c1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return [
        Paragraph(profile["owner"], h2),
        table,
        Spacer(1, 0.08 * inch),
    ]


def table_style(header_fill="#182028") -> TableStyle:
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(header_fill)),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7.8),
            ("LEADING", (0, 0), (-1, -1), 9.4),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d8d0c1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#fbf8f0"), colors.HexColor("#f1eadc")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (1, 1), (-1, -1), "CENTER"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
    )


def add_table(story, data, col_widths=None):
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(table_style())
    story.append(table)


def img_flowable(path: Path, width: float = 7.2 * inch):
    return RLImage(str(path), width=width, height=width * Image.open(path).height / Image.open(path).width)


def build_pdf(rows: list[Row], figures: list[Path]) -> None:
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=27,
        leading=32,
        textColor=colors.HexColor(INK),
        alignment=TA_LEFT,
        spaceAfter=12,
    )
    h1 = ParagraphStyle(
        "Heading1Custom",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=17,
        leading=21,
        textColor=colors.HexColor(INK),
        spaceBefore=13,
        spaceAfter=8,
    )
    h2 = ParagraphStyle(
        "Heading2Custom",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12.5,
        leading=15,
        textColor=colors.HexColor(TEAL),
        spaceBefore=8,
        spaceAfter=5,
    )
    body = ParagraphStyle(
        "BodyCustom",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.4,
        leading=12.5,
        textColor=colors.HexColor(INK),
        spaceAfter=6,
    )
    callout = ParagraphStyle(
        "Callout",
        parent=body,
        fontName="Helvetica-Bold",
        fontSize=10.3,
        leading=13.3,
        backColor=colors.HexColor("#eee4d2"),
        borderColor=colors.HexColor("#d8d0c1"),
        borderWidth=0.7,
        borderPadding=8,
        spaceAfter=10,
    )
    caption = ParagraphStyle(
        "Caption",
        parent=body,
        fontName="Helvetica-Oblique",
        fontSize=8.3,
        leading=10.5,
        textColor=colors.HexColor(MUTED),
        alignment=TA_CENTER,
        spaceBefore=2,
        spaceAfter=8,
    )
    table_para = ParagraphStyle(
        "TableParagraph",
        parent=body,
        fontName="Helvetica",
        fontSize=7.4,
        leading=9.0,
        textColor=colors.HexColor(INK),
        spaceAfter=0,
    )

    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=letter,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.48 * inch,
        bottomMargin=0.48 * inch,
        title="Draft Spot Analysis",
        author="Codex",
    )

    seasons = sorted({r.season for r in rows})
    xs_raw = [r.draft_pick for r in rows]
    finish_raw = [r.finish for r in rows]
    finish_scores = [r.finish_score for r in rows]
    draft_pct = [r.draft_percentile for r in rows]
    points_z = [r.points_z for r in rows]
    wins_delta = [r.wins_above_avg for r in rows]
    finish_slope, _ = regression(xs_raw, finish_raw)
    score_slope, _ = regression(draft_pct, finish_scores)
    points_slope, _ = regression(draft_pct, points_z)
    win_slope, _ = regression(draft_pct, wins_delta)
    ten_team_rows = [r for r in rows if r.season <= 2024]
    ten_team_score_slope, _ = regression([r.draft_percentile for r in ten_team_rows], [r.finish_score for r in ten_team_rows])
    ten_team_late = grouped_stats(ten_team_rows, lambda r: band_for_pick(r.draft_pick))["Late (8+)"]
    best_pick = min(grouped_stats(rows, lambda r: r.draft_pick).items(), key=lambda kv: -statistics.mean(r.finish_score for r in kv[1]))
    worst_pick = min(grouped_stats(rows, lambda r: r.draft_pick).items(), key=lambda kv: statistics.mean(r.finish_score for r in kv[1]))

    story = [
        Paragraph("Draft Spot vs Season Results", title),
        Paragraph(
            f"The Darling league, {seasons[0]}-{seasons[-1]} draft boards with populated pick data ({len(rows)} team-seasons).",
            ParagraphStyle("Subtitle", parent=body, fontSize=11.5, leading=15, textColor=colors.HexColor(MUTED)),
        ),
        Spacer(1, 0.1 * inch),
        Paragraph(
            "Bottom line: draft slot has signal in this history, but not in the expected direction. Across the populated data, "
            f"raw pick number has a {pearson(xs_raw, finish_raw):.2f} correlation with final finish, and each later pick maps to "
            f"about {finish_slope:+.2f} finishing places on the simple trend line, meaning later picks have finished slightly better. "
            f"Normalized for league size, moving from the front to the back of the draft is associated with a {score_slope:+.2f} "
            f"change in finish score. The points relationship is much flatter: {points_slope:+.2f} points z-score and {win_slope:+.2f} "
            "wins versus league average from front to back.",
            callout,
        ),
        Paragraph("How to read the normalized metrics", h1),
        Paragraph(
            "Finish score runs from 1.00 for champion to 0.00 for last place within that season. Points z-score compares a team's "
            "points for to that season's league average, which prevents older lower-scoring years and the 12-team 2025 season from "
            "overweighting the comparison. Wins +/- is wins plus half-ties compared with the average team in that season.",
            body,
        ),
        Paragraph("Key findings", h1),
        Paragraph(
            f"1. The best average normalized finish belongs to pick {best_pick[0]} "
            f"(avg score {statistics.mean(r.finish_score for r in best_pick[1]):.2f}, n={len(best_pick[1])}); the weakest is pick "
            f"{worst_pick[0]} (avg score {statistics.mean(r.finish_score for r in worst_pick[1]):.2f}, n={len(worst_pick[1])}). "
            "Among the repeat-sample slots, pick 10 is the standout: three champions, a 78% playoff rate, and the best average finish.",
            body,
        ),
        Paragraph(
            "2. Championships are not concentrated at the top of the board. Early picks 1-3 have one title in the sample, middle picks "
            "4-7 have three, and late picks 8+ have five. That late count includes the 2025 pick 11 champion, but the pattern still "
            "leans late even if 2025 is removed.",
            body,
        ),
        Paragraph(
            "3. Early slots have not converted into superior outcomes. Picks 1-3 have the lowest zone-level finish score, the lowest "
            "playoff rate, and the highest Saunders rate. That does not mean early picks are bad structurally, but this league's history "
            "does not show a front-slot premium.",
            body,
        ),
        Paragraph(
            f"4. The 12-team 2025 season does not drive the conclusion by itself. Restricting the analysis to the 10-team seasons "
            f"from 2017-2024 still gives a front-to-back finish-score slope of {ten_team_score_slope:+.2f}, and the late zone posts "
            f"a {sum(r.made_playoffs for r in ten_team_late) / len(ten_team_late):.0%} playoff rate with "
            f"{sum(r.champion for r in ten_team_late)} champions.",
            body,
        ),
        Paragraph(
            "5. Pick-level sample sizes are small. Most slots have nine observations, while 2025 adds only one observation for picks 11 and 12. "
            "Treat single-slot rankings as descriptive league history, not a predictive model.",
            body,
        ),
        Spacer(1, 0.05 * inch),
        img_flowable(figures[0]),
        Paragraph("Figure 1. Scatter plot of draft pick against final finish with a linear trend line.", caption),
        PageBreak(),
        Paragraph("Slot-Level Performance", h1),
        Paragraph(
            "This chart compares average normalized finish by pick and overlays points performance. A high bar means the pick generally "
            "finished better; a higher gold dot means teams from that pick scored more points than the season average.",
            body,
        ),
        img_flowable(figures[1]),
        Paragraph("Figure 2. Average finish score and points z-score by draft slot.", caption),
        Paragraph("Outcome Rates by Zone", h1),
        img_flowable(figures[2]),
        Paragraph("Figure 3. Championship, top-three, playoff, and Saunders rates by draft zone.", caption),
        PageBreak(),
        Paragraph("Distribution Views", h1),
        Paragraph(
            "The heatmap is useful for spotting whether any draft position repeatedly landed in the same finish range. The lack of a "
            "single dark diagonal reinforces the main conclusion: draft position matters less than team-specific execution and season variance.",
            body,
        ),
        img_flowable(figures[3], width=7.25 * inch),
        Paragraph("Figure 4. Count of pick-to-finish combinations.", caption),
        img_flowable(figures[4], width=7.25 * inch),
        Paragraph("Figure 5. Champion draft positions by season.", caption),
        PageBreak(),
        Paragraph("Owner-Specific Draft Targets", h1),
        Paragraph(
            "The league-wide pattern is useful, but the actionable version changes by owner. This section compares each owner's "
            "own draft slots and zones, then separates repeat-sample evidence from one-year outliers.",
            body,
        ),
        img_flowable(figures[5], width=7.25 * inch),
        Paragraph("Figure 6. Owner results by early, middle, and late draft zones.", caption),
        PageBreak(),
        Paragraph("Owner Target Summary", h1),
    ]
    owner_summary = Table(
        make_owner_summary_table(rows, table_para),
        colWidths=[0.65 * inch, 1.32 * inch, 3.15 * inch, 2.0 * inch],
        repeatRows=1,
    )
    owner_summary.setStyle(table_style())
    story.append(owner_summary)
    story += [
        PageBreak(),
        Paragraph("Owner Detail Notes", h1),
    ]
    for profile in owner_profiles(rows):
        story.append(KeepTogether(owner_detail_flowables(profile, h2, body, table_para)))
    story += [
        PageBreak(),
        Paragraph("Pick Summary Table", h1),
    ]
    add_table(story, make_pick_table(rows), col_widths=[0.37 * inch, 0.33 * inch, 0.62 * inch, 0.75 * inch, 0.67 * inch, 0.58 * inch, 0.47 * inch, 0.55 * inch, 0.47 * inch, 0.58 * inch])
    story += [
        Spacer(1, 0.12 * inch),
        Paragraph("Zone Summary Table", h1),
    ]
    add_table(story, make_band_table(rows), col_widths=[0.82 * inch, 0.33 * inch, 0.48 * inch, 0.58 * inch, 0.63 * inch, 0.53 * inch, 0.5 * inch, 0.45 * inch, 0.5 * inch, 0.55 * inch, 0.55 * inch])
    story += [
        Spacer(1, 0.12 * inch),
        Paragraph("Season-Level Markers", h1),
    ]
    add_table(story, make_year_table(rows), col_widths=[0.55 * inch, 0.8 * inch, 0.72 * inch, 1.15 * inch, 0.45 * inch, 0.88 * inch, 0.45 * inch])
    story += [
        PageBreak(),
        Paragraph("Method and Caveats", h1),
        Paragraph(
            "Scope: only seasons with populated draft_pick values are included. In the current tracker, that is 2017 through 2025. "
            "The 2014 through 2016 seasons are excluded from draft-position analysis because draft board data is not present in the dataset.",
            body,
        ),
        Paragraph(
            "League-size adjustment: 2025 has 12 teams while the earlier populated seasons have 10. Raw pick number is still shown because it "
            "is intuitive, but the report's main score comparisons use normalized finish score and draft percentile.",
            body,
        ),
        Paragraph(
            "Interpretation: this is descriptive analysis, not a causal model. Draft order is only one input. Keeper values, injuries, trades, "
            "waivers, schedule strength, and scoring environment are not modeled here.",
            body,
        ),
        Paragraph(
            "Data note: the report reflects the current SeasonSummary.json values, including the recently added draft positions from board photos. "
            "Any image-derived pick that is later corrected in the source data can be incorporated by rerunning this script.",
            body,
        ),
    ]

    def footer(canvas_obj, doc_obj):
        canvas_obj.saveState()
        canvas_obj.setFont("Helvetica", 7.5)
        canvas_obj.setFillColor(colors.HexColor(MUTED))
        canvas_obj.drawString(0.55 * inch, 0.25 * inch, "Draft Spot Analysis | The Darling")
        canvas_obj.drawRightString(7.95 * inch, 0.25 * inch, f"Page {doc_obj.page}")
        canvas_obj.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def write_summary(rows: list[Row]) -> None:
    owners = owner_profiles(rows)
    summary = {
        "seasons": [min(r.season for r in rows), max(r.season for r in rows)],
        "team_seasons": len(rows),
        "correlation_pick_finish": pearson([r.draft_pick for r in rows], [r.finish for r in rows]),
        "correlation_draft_percentile_finish_score": pearson([r.draft_percentile for r in rows], [r.finish_score for r in rows]),
        "correlation_draft_percentile_points_z": pearson([r.draft_percentile for r in rows], [r.points_z for r in rows]),
        "pick_summary": make_pick_table(rows),
        "zone_summary": make_band_table(rows),
        "owner_recommendations": [
            {
                "owner": profile["owner"],
                "target": profile["target"],
                "recommendation": profile["recommendation"],
                "caution": profile["caution"],
                "best_pick": profile["best_pick"],
                "best_zone": profile["best_zone"],
                "history": profile["history"],
            }
            for profile in owners
        ],
    }
    (OUT_DIR / "draft_spot_analysis_summary.json").write_text(json.dumps(summary, indent=2) + "\n")


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    FIG_DIR.mkdir(exist_ok=True)
    rows = load_rows()
    figures = [
        save_scatter(rows),
        save_average_by_pick(rows),
        save_band_rates(rows),
        save_heatmap(rows),
        save_champion_strip(rows),
        save_owner_zone_matrix(rows),
    ]
    build_pdf(rows, figures)
    write_summary(rows)
    print(PDF_PATH)
    for figure in figures:
        print(figure)


if __name__ == "__main__":
    main()
