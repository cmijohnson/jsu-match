from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = REPO_ROOT.parent / "赛事" / "2026赛事调研_信息安全视角"
SOURCE_JSON = SOURCE_ROOT / "_competition_data.json"
TARGET_DATA = REPO_ROOT / "data" / "competitions.json"
TARGET_CONTENT = REPO_ROOT / "content"
TODAY = date(2026, 5, 7)
UNPUBLISHED_TEXT = "截至 2026-04-28 未发布 2026 官方通知"


@dataclass
class TimeInfo:
    status: str
    display_time: str
    month_tags: list[str]


DATE_RANGE_RE = re.compile(
    r"(?:(2026)年)?(\d{1,2})月(\d{1,2})日(?:\s*[至到\-~—]\s*(?:(2026)年)?(\d{1,2})月(\d{1,2})日)?"
)


def level_label(level: str) -> str:
    return {"国家级A+类": "A+", "国家级A类": "A", "国家级B类": "B"}[level]


def read_section(lines: list[str], header: str) -> list[str]:
    try:
      start = lines.index(header)
    except ValueError:
      return []
    collected: list[str] = []
    for line in lines[start + 1 :]:
      if line.startswith("## "):
        break
      if line.startswith("- "):
        collected.append(line[2:].strip())
    return collected


def first_meaningful(lines: list[str], ignore_prefixes: tuple[str, ...]) -> str | None:
    for line in lines:
        if any(line.startswith(prefix) for prefix in ignore_prefixes):
            continue
        if line:
            return line
    return None


def parse_2026_dates(lines: list[str]) -> list[tuple[date, date]]:
    results: list[tuple[date, date]] = []
    for line in lines:
        for match in DATE_RANGE_RE.finditer(line):
            start = date(2026, int(match.group(2)), int(match.group(3)))
            if match.group(5) and match.group(6):
                end = date(2026, int(match.group(5)), int(match.group(6)))
            else:
                end = start
            results.append((start, end))
    return results


def extract_time_info(markdown: str) -> TimeInfo:
    lines = [line.strip() for line in markdown.splitlines()]
    time_section = read_section(lines, "## 2. 2026 时间信息")
    event_lines = []
    history_lines = []
    current_bucket = None
    for line in time_section:
        if line == "2026 举办时间 / 各轮次时间":
            current_bucket = "event"
            continue
        if line == "最近一届官方时间参考":
            current_bucket = "history"
            continue
        if line == "2026 报名时间":
            current_bucket = "register"
            continue
        if current_bucket == "event":
            event_lines.append(line)
        elif current_bucket == "history":
            history_lines.append(line)

    unpublished = UNPUBLISHED_TEXT in markdown
    date_ranges = parse_2026_dates(event_lines)
    if unpublished:
        status = "未发布"
    elif date_ranges:
        start = min(item[0] for item in date_ranges)
        end = max(item[1] for item in date_ranges)
        if TODAY < start:
            status = "未开始"
        elif start <= TODAY <= end:
            status = "进行中"
        else:
            status = "已结束"
    else:
        status = "未发布"

    event_display = first_meaningful(
        event_lines,
        ("截至 2026-04-28 未检索到可信 2026 赛程时间",),
    )
    history_display = first_meaningful(
        history_lines,
        ("未检索到近届可直接提取时间的高可信通知页。",),
    )
    display_time = event_display or history_display or "待官方发布"

    if date_ranges:
        months = sorted({f"{item[0].month}月" for item in date_ranges}, key=lambda value: int(value[:-1]))
    else:
        months = ["待发布/未知"]

    return TimeInfo(status=status, display_time=display_time, month_tags=months)


def build() -> None:
    if not SOURCE_JSON.exists():
        raise FileNotFoundError(f"source data not found: {SOURCE_JSON}")

    data = json.loads(SOURCE_JSON.read_text(encoding="utf-8"))
    TARGET_CONTENT.mkdir(parents=True, exist_ok=True)

    output = []
    for item in data:
        comp_id = f"{item['index']:03d}"
        markdown_source = SOURCE_ROOT / item["fit"] / level_label(item["level"]) / f"{comp_id}-{item['name']}.md"
        if not markdown_source.exists():
            raise FileNotFoundError(f"markdown not found: {markdown_source}")

        markdown_text = markdown_source.read_text(encoding="utf-8")
        time_info = extract_time_info(markdown_text)

        markdown_target = TARGET_CONTENT / f"{comp_id}.md"
        shutil.copyfile(markdown_source, markdown_target)

        output.append(
            {
                "id": comp_id,
                "name": item["name"],
                "level": level_label(item["level"]),
                "fit": item["fit"],
                "trackType": item["track_type"],
                "summary": item["conclusion"],
                "status": time_info.status,
                "displayTime": time_info.display_time,
                "monthTags": time_info.month_tags,
                "mdPath": f"./content/{comp_id}.md",
            }
        )

    output.sort(key=lambda record: int(record["id"]))
    TARGET_DATA.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    build()
