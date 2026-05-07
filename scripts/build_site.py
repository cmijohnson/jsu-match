from __future__ import annotations

import calendar
import json
import re
import shutil
import tarfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

from lxml import html


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = REPO_ROOT.parent / "赛事" / "2026赛事调研_信息安全视角"
SOURCE_JSON = SOURCE_ROOT / "_competition_data.json"
CONTENT_ROOT = REPO_ROOT / "content"
DATA_ROOT = REPO_ROOT / "data"
TODAY = date(2026, 5, 7)
BASE_PATH = "/jsu-match/"

LEVEL_MAP = {
    "国家级A+类": "A+",
    "国家级A类": "A",
    "国家级B类": "B",
}

RECOMMENDATION_PRIORITY = {"主推": 3, "可参加": 2, "不建议": 1}
FIT_BADGE_TO_RECOMMENDATION = {
    "S｜核心强适配": ("主推", 98),
    "A｜高度适配": ("主推", 90),
    "B｜交叉适配": ("可参加", 74),
    "C｜通用弱适配": ("可参加", 58),
    "D｜不建议优先": ("不建议", 24),
}
FIT_PREFIX_TO_RECOMMENDATION = {
    "S": ("主推", 98),
    "A": ("主推", 90),
    "B": ("可参加", 74),
    "C": ("可参加", 58),
    "D": ("不建议", 24),
}

MANUAL_REVERIFIED_OVERRIDES: dict[str, dict[str, Any]] = {
    "024": {
        "officialSite": "https://www.fwwb.org.cn/",
        "officialNotice": "https://www.fwwb.org.cn/news/show/597",
        "signupLink": "https://www.fwwb.org.cn/news/show/598",
        "displayTime": "第十七届赛事通知发布于 2026-02-11；报名于 2026-03-31 结束；初赛作品提交集中在 2026-04",
        "monthTags": ["2月", "3月", "4月"],
        "status": "进行中",
        "infoStatus": "已核对官方站点（2026-05-07）",
    },
    "027": {
        "officialSite": "https://dasai.lanqiao.cn/pages/v7/dasai/competition/individual_competition.html",
        "signupLink": "https://dasai.lanqiao.cn/pages/v7/dasai/competition/individual_competition.html",
        "displayTime": "软件电子赛报名时间：2025-10-20 10:00 至 2026-03-11 14:00；鸿蒙应用开发报名时间：2025-11-19 10:00 至 2026-03-11 14:00",
        "monthTags": ["1月", "2月", "3月"],
        "status": "已结束",
        "infoStatus": "已核对官方报名页（2026-05-07）",
    },
    "033": {
        "officialSite": "https://www.ciscn.cn/",
        "infoStatus": "已核对官方竞赛站点（2026-05-07）",
    },
    "063": {
        "officialSite": "https://www.nscscc.com/",
        "signupLink": "https://cpu.xtnl.org.cn/",
        "displayTime": "NSCSCC2026 通知与章程发布于 2026-03-25 至 2026-03-26，报名入口已开放",
        "monthTags": ["3月"],
        "status": "已结束",
        "infoStatus": "已核对官方赛事站点（2026-05-07）",
    },
}

DOMAIN_LABELS = {
    "security": "网络安全、系统安全、攻防实战",
    "programming": "算法程序设计、编程实现",
    "software": "软件工程、系统实现",
    "data-ai": "数据分析、人工智能、模型训练",
    "electronics": "电子信息、ICT、集成电路",
    "embedded": "嵌入式、物联网、芯片系统",
    "robotics": "机器人、自动化、控制系统",
    "mechanical": "机械设计、制造、工程制图",
    "civil": "土木结构、BIM、水利工程",
    "energy-env": "能源、环境、节能减排",
    "chem-material": "化学、化工、材料工艺",
    "bio-med": "生物、医药、生命健康",
    "medicine": "临床、医学技能、检验实践",
    "math-modeling": "数学建模、统计分析、科学计算",
    "business": "商科策划、市场分析、商业模拟",
    "finance": "金融科技、会计、投研分析",
    "innovation": "创新创业、创客、综合项目",
    "language": "英语、外语、演讲、写作",
    "design": "视觉设计、数字艺术、创意表达",
    "law": "法学、知识产权、合规治理",
}

COMPETITION_DOMAIN_KEYWORDS = {
    "security": ["信息安全", "网络安全", "数据安全", "CTF", "长城杯", "攻防", "网络技术"],
    "programming": ["程序设计", "编程", "ACM", "ICPC", "天梯赛", "蓝桥杯", "百度之星"],
    "software": ["软件", "服务外包", "系统能力", "计算机设计", "软件测试", "Web应用"],
    "data-ai": ["大数据", "人工智能", "AI", "智能计算", "数据分析", "科学智能"],
    "electronics": ["电子", "ICT", "通信", "集成电路", "光电", "华为ICT", "5G"],
    "embedded": ["嵌入式", "单片机", "物联网", "FPGA", "芯片"],
    "robotics": ["机器人", "自动化", "智能汽车", "智能制造", "控制"],
    "mechanical": ["机械", "成图", "三维", "车辆", "交通", "农业装备", "制造"],
    "civil": ["结构", "土木", "BIM", "水利", "建筑"],
    "energy-env": ["节能减排", "环境", "安全工程", "应急", "能源", "碳"],
    "chem-material": ["化工", "化学", "材料", "金相", "冶金"],
    "bio-med": ["生命科学", "生物", "食品", "药学", "制药"],
    "medicine": ["医学", "临床", "检验", "影像", "口腔"],
    "math-modeling": ["数学建模", "统计", "力学", "物理实验", "建模"],
    "business": ["电子商务", "市场", "物流", "管理", "调查与分析", "商业精英", "创业综合模拟"],
    "finance": ["金融", "会计", "贸易", "证券", "金融科技"],
    "innovation": ["创新", "创业", "创意", "互联网+", "挑战杯", "创客"],
    "language": ["英语", "外语", "写作", "阅读", "演讲", "诵写讲", "跨文化"],
    "design": ["设计", "艺术", "广告", "视觉传达", "数字艺术", "工业设计", "米兰设计周", "华灿奖", "好创意"],
    "law": ["法学", "知识产权"],
}

CLUSTER_META: dict[str, dict[str, Any]] = {
    "security-computing": {
        "label": "网络与计算机核心",
        "strengths": "编程、系统、网络、安全攻防",
        "weights": {"security": 5.2, "programming": 4.8, "software": 4.5, "data-ai": 3.5, "electronics": 2.8, "innovation": 2.4, "business": 1.2, "language": 0.8, "design": 0.8, "medicine": 0.2},
    },
    "software-data": {
        "label": "软件与数据智能",
        "strengths": "工程开发、数据处理、产品实现",
        "weights": {"software": 5.0, "programming": 4.6, "data-ai": 4.5, "innovation": 3.2, "security": 3.0, "electronics": 2.2, "business": 2.0, "design": 1.5, "language": 0.8},
    },
    "electronics-communication": {
        "label": "电子与通信",
        "strengths": "电路、通信协议、ICT系统",
        "weights": {"electronics": 5.0, "embedded": 4.5, "robotics": 3.6, "programming": 3.2, "security": 2.8, "math-modeling": 2.6, "innovation": 2.1, "design": 1.0},
    },
    "automation-robotics": {
        "label": "自动化与机器人",
        "strengths": "控制、感知、嵌入式、系统联调",
        "weights": {"robotics": 5.0, "embedded": 4.3, "electronics": 4.0, "mechanical": 3.6, "programming": 2.8, "innovation": 2.2, "design": 1.0},
    },
    "mechanical-vehicle": {
        "label": "机械与车辆工程",
        "strengths": "结构设计、制造工艺、样机实现",
        "weights": {"mechanical": 5.0, "robotics": 3.8, "electronics": 2.6, "civil": 2.0, "innovation": 2.0, "programming": 1.8, "design": 1.6},
    },
    "civil-structure": {
        "label": "土木与结构工程",
        "strengths": "结构设计、工程建模、BIM表达",
        "weights": {"civil": 5.1, "mechanical": 2.2, "math-modeling": 2.0, "innovation": 1.8, "design": 1.4, "programming": 1.0},
    },
    "chem-material": {
        "label": "化学化工与材料",
        "strengths": "实验工艺、材料表征、流程设计",
        "weights": {"chem-material": 5.2, "bio-med": 2.4, "energy-env": 2.2, "innovation": 1.8, "math-modeling": 1.6, "programming": 0.8},
    },
    "bio-food-pharma": {
        "label": "生物食品与药学",
        "strengths": "实验设计、质量分析、生命健康应用",
        "weights": {"bio-med": 5.0, "chem-material": 3.0, "medicine": 2.8, "innovation": 2.0, "data-ai": 1.8, "programming": 0.8},
    },
    "medicine-health": {
        "label": "医学与健康",
        "strengths": "临床技能、医学判断、操作规范",
        "weights": {"medicine": 5.3, "bio-med": 3.4, "innovation": 1.8, "language": 1.2, "programming": 0.5},
    },
    "math-physics": {
        "label": "数理基础",
        "strengths": "数学推导、建模、科学计算",
        "weights": {"math-modeling": 5.0, "programming": 4.0, "data-ai": 3.5, "electronics": 2.4, "innovation": 1.6, "design": 0.8},
    },
    "management-finance": {
        "label": "管理与财经",
        "strengths": "商业分析、财务判断、项目策划",
        "weights": {"business": 5.0, "finance": 4.8, "innovation": 3.0, "data-ai": 2.2, "programming": 1.6, "language": 1.4, "design": 1.0},
    },
    "humanities-language-law": {
        "label": "人文外语与法学",
        "strengths": "语言表达、内容策划、规则理解",
        "weights": {"language": 5.0, "law": 4.4, "innovation": 2.2, "business": 2.0, "design": 1.6, "programming": 0.5},
    },
    "design-art": {
        "label": "设计与艺术",
        "strengths": "视觉表达、创意叙事、作品呈现",
        "weights": {"design": 5.2, "innovation": 3.2, "software": 2.4, "business": 1.8, "language": 1.2, "programming": 1.0},
    },
    "energy-environment": {
        "label": "能源环境与安全",
        "strengths": "能源系统、环境治理、工程实践",
        "weights": {"energy-env": 5.0, "mechanical": 2.8, "chem-material": 2.8, "robotics": 2.2, "innovation": 1.8, "data-ai": 1.3},
    },
    "agriculture-equipment": {
        "label": "农业工程与装备",
        "strengths": "农业场景、装备控制、工程实现",
        "weights": {"mechanical": 4.6, "robotics": 4.0, "embedded": 3.2, "bio-med": 2.0, "innovation": 1.8, "programming": 1.4},
    },
}

FOCUS_MAJOR_OVERRIDES: dict[str, dict[str, Any]] = {
    "信息安全": {"clusterId": "security-computing", "priority": "focus", "boost": {"security": 1.5, "programming": 0.7}},
    "软件工程": {"clusterId": "software-data", "priority": "focus", "boost": {"software": 1.2, "programming": 0.6}},
    "通信工程": {"clusterId": "electronics-communication", "priority": "focus", "boost": {"electronics": 1.2, "embedded": 0.5}},
    "机械设计制造及其自动化": {"clusterId": "mechanical-vehicle", "priority": "focus", "boost": {"mechanical": 1.2, "robotics": 0.4}},
    "临床医学": {"clusterId": "medicine-health", "priority": "focus", "boost": {"medicine": 1.4}},
    "计算机科学与技术": {"clusterId": "security-computing", "priority": "focus", "boost": {"programming": 1.0, "software": 0.5}},
}


@dataclass
class LakebookDoc:
    url: str
    title: str
    body_asl: str


class LakebookArchive:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._tar = tarfile.open(path, "r")
        outer_meta = json.load(self._tar.extractfile("0a22203b17781487204181653666045/$meta.json"))
        self.meta = json.loads(outer_meta["meta"])
        self.toc = self._parse_toc(self.meta["book"]["tocYml"])
        self.doc_cache: dict[str, LakebookDoc] = {}
        self.title_to_url: dict[str, str] = {}
        self.path_alias_to_url: dict[str, str] = {}
        for entry in self.toc:
            if entry.get("type") != "DOC":
                continue
            title = entry.get("title", "")
            url = entry.get("url", "")
            if title and url:
                self.title_to_url[title] = url
                self.path_alias_to_url[f"{title}.md"] = url
                self.path_alias_to_url[title] = url

    @staticmethod
    def _parse_toc(raw: str) -> list[dict[str, str]]:
        items: list[dict[str, str]] = []
        current: dict[str, str] | None = None
        for line in raw.splitlines():
            if line.startswith("- type: "):
                if current:
                    items.append(current)
                current = {"type": line.split(": ", 1)[1].strip()}
                continue
            if current is None or not line.startswith("  "):
                continue
            key, _, value = line.strip().partition(": ")
            current[key] = value.strip("'")
        if current:
            items.append(current)
        return items

    def resolve_doc_url(self, raw_url: str) -> str:
        if re.fullmatch(r"[0-9a-f]{32}", raw_url):
            return raw_url
        basename = Path(raw_url).name
        basename = basename.removesuffix(".md")
        return self.path_alias_to_url.get(raw_url) or self.path_alias_to_url.get(Path(raw_url).name) or self.title_to_url.get(basename) or raw_url

    def get_doc(self, url: str) -> LakebookDoc:
        resolved = self.resolve_doc_url(url)
        if resolved not in self.doc_cache:
            payload = json.load(self._tar.extractfile(f"0a22203b17781487204181653666045/{resolved}.json"))
            doc = payload["doc"]
            self.doc_cache[resolved] = LakebookDoc(
                url=resolved,
                title=doc.get("title") or "",
                body_asl=doc.get("body_asl") or "",
            )
        return self.doc_cache[resolved]

    def close(self) -> None:
        self._tar.close()


def locate_lakebook() -> Path:
    for base in [REPO_ROOT, *REPO_ROOT.parents]:
        for candidate in base.glob("*.lakebook"):
            if "江大竞赛参考" in candidate.name:
                return candidate
    raise FileNotFoundError("未找到江大竞赛参考.lakebook")


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def clean_text(node: Any) -> str:
    if node is None:
        return ""
    if isinstance(node, str):
        return normalize_space(node)
    return normalize_space("".join(node.itertext()))


def safe_tree(fragment: str):
    return html.fromstring(fragment)


def body_nodes(fragment: str) -> list[Any]:
    tree = safe_tree(fragment)
    nodes = tree.xpath("/html/body/*")
    if not nodes:
        nodes = list(tree)
    return nodes


def body_sections(fragment: str) -> list[tuple[str, Any]]:
    nodes = body_nodes(fragment)
    sections: list[tuple[str, Any]] = []
    current_heading = "lead"
    for node in nodes:
        if node.tag in {"h1", "h2", "h3", "h4"}:
            current_heading = clean_text(node)
            continue
        sections.append((current_heading, node))
    return sections


def parse_table(table_node: Any) -> list[list[dict[str, Any]]]:
    rows: list[list[dict[str, Any]]] = []
    for tr in table_node.xpath(".//tr"):
        row: list[dict[str, Any]] = []
        for cell in tr.xpath("./th|./td"):
            text = clean_text(cell)
            links = [
                {
                    "href": anchor.get("href"),
                    "text": clean_text(anchor),
                }
                for anchor in cell.xpath(".//a")
                if anchor.get("href")
            ]
            row.append({"text": text, "links": links})
        if row:
            rows.append(row)
    return rows


def parse_basic_kv(section_nodes: list[Any]) -> dict[str, str]:
    data: dict[str, str] = {}
    for node in section_nodes:
        if node.tag != "ul":
            continue
        for item in node.xpath(".//li"):
            text = clean_text(item)
            if "：" in text:
                key, value = text.split("：", 1)
                data[key] = value
    return data


def detect_domains(*parts: str) -> list[str]:
    text = " ".join(part for part in parts if part)
    found: set[str] = set()
    for domain, keywords in COMPETITION_DOMAIN_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            found.add(domain)
    if not found:
        found.add("innovation")
    return sorted(found)


def months_from_text(text: str) -> list[str]:
    months: set[int] = set()
    for year, month in re.findall(r"(20\d{2})年(\d{1,2})月", text):
        if year == "2026":
            months.add(int(month))
    for start, end in re.findall(r"(\d{1,2})月\s*[—\-~至]+\s*(\d{1,2})月", text):
        start_month = int(start)
        end_month = int(end)
        if start_month <= end_month:
            months.update(range(start_month, end_month + 1))
    for month in re.findall(r"(?<!年)(?<!\d)(\d{1,2})月", text):
        months.add(int(month))
    return [f"{month}月" for month in sorted(months) if 1 <= month <= 12]


def parse_explicit_dates(text: str) -> tuple[date | None, date | None]:
    ranges: list[tuple[date, date]] = []
    full_range = re.findall(
        r"2026年(\d{1,2})月(\d{1,2})日\s*[—\-~至]+\s*(?:(2026)年)?(\d{1,2})月(\d{1,2})日",
        text,
    )
    for start_month, start_day, _, end_month, end_day in full_range:
        start = date(2026, int(start_month), int(start_day))
        end = date(2026, int(end_month), int(end_day))
        ranges.append((start, end))

    single_dates = re.findall(r"2026年(\d{1,2})月(\d{1,2})日", text)
    for month, day in single_dates:
        point = date(2026, int(month), int(day))
        if not any(start <= point <= end for start, end in ranges):
            ranges.append((point, point))

    if not ranges:
        month_tags = months_from_text(text)
        if month_tags:
            start_month = int(month_tags[0][:-1])
            end_month = int(month_tags[-1][:-1])
            start = date(2026, start_month, 1)
            end = date(2026, end_month, calendar.monthrange(2026, end_month)[1])
            return start, end
        return None, None

    start_date = min(item[0] for item in ranges)
    end_date = max(item[1] for item in ranges)
    return start_date, end_date


def derive_status(event_text: str, confidence_text: str) -> tuple[str, list[str], date | None, date | None]:
    months = months_from_text(event_text)
    if not event_text or "未检索到" in event_text or "待官方发布" in event_text:
        return "未发布", ["待发布/未知"], None, None
    start_date, end_date = parse_explicit_dates(event_text)
    if "低" in confidence_text and not months:
        return "未发布", ["待发布/未知"], None, None
    if not months and start_date is None:
        return "未发布", ["待发布/未知"], None, None
    if start_date and end_date:
        if TODAY < start_date:
            return "未开始", months or ["待发布/未知"], start_date, end_date
        if start_date <= TODAY <= end_date:
            return "进行中", months or ["待发布/未知"], start_date, end_date
        return "已结束", months or ["待发布/未知"], start_date, end_date
    if months:
        first_month = int(months[0][:-1])
        last_month = int(months[-1][:-1])
        if TODAY.month < first_month:
            return "未开始", months, date(2026, first_month, 1), date(2026, last_month, calendar.monthrange(2026, last_month)[1])
        if TODAY.month > last_month:
            return "已结束", months, date(2026, first_month, 1), date(2026, last_month, calendar.monthrange(2026, last_month)[1])
        return "进行中", months, date(2026, first_month, 1), date(2026, last_month, calendar.monthrange(2026, last_month)[1])
    return "未发布", ["待发布/未知"], None, None


def fallback_markdown_time(markdown_text: str) -> dict[str, Any]:
    lines = [line.strip() for line in markdown_text.splitlines()]
    result = {
        "infoStatus": "未提取",
        "displayTime": "待官方发布",
        "monthTags": ["待发布/未知"],
        "status": "未发布",
        "startDate": None,
        "endDate": None,
    }
    for index, line in enumerate(lines):
        if line.startswith("- 信息状态："):
            result["infoStatus"] = line.replace("- 信息状态：", "", 1).strip()
        if line == "- 2026 举办时间 / 各轮次时间" and index + 1 < len(lines):
            result["displayTime"] = lines[index + 1].removeprefix("- ").strip() or "待官方发布"
    status, months, start_date, end_date = derive_status(result["displayTime"], result["infoStatus"])
    result["monthTags"] = months
    result["status"] = status
    result["startDate"] = start_date.isoformat() if start_date else None
    result["endDate"] = end_date.isoformat() if end_date else None
    return result


def lakebook_tree(archive: LakebookArchive) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, str]]:
    major_index_doc = archive.get_doc("cab04d290186c8576f31cb76fd3056da")
    nodes = body_nodes(major_index_doc.body_asl)
    colleges: list[dict[str, Any]] = []
    majors: list[dict[str, Any]] = []
    major_url_to_id: dict[str, str] = {}
    college_url_to_id: dict[str, str] = {}

    current_college_id = ""
    current_college_name = ""
    college_counter = 0
    major_counter = 0

    for node in nodes:
        if node.tag == "h2":
            link = node.xpath(".//a")
            if not link:
                continue
            college_counter += 1
            current_college_name = clean_text(link[0])
            current_college_id = f"college-{college_counter:02d}"
            raw_href = link[0].get("href")
            college_url_to_id[raw_href] = current_college_id
            college_url_to_id[archive.resolve_doc_url(raw_href)] = current_college_id
            colleges.append({"id": current_college_id, "name": current_college_name, "majors": []})
        elif node.tag == "ul" and current_college_id:
            link = node.xpath(".//a")
            if not link:
                continue
            major_counter += 1
            major_name = clean_text(link[0])
            major_id = f"major-{major_counter:03d}"
            major_url = link[0].get("href")
            major_url_to_id[major_url] = major_id
            major_url_to_id[archive.resolve_doc_url(major_url)] = major_id
            colleges[-1]["majors"].append(major_id)
            majors.append(
                {
                    "id": major_id,
                    "name": major_name,
                    "collegeId": current_college_id,
                    "sourceDocUrl": major_url,
                    "collegeName": current_college_name,
                }
            )
    return colleges, majors, major_url_to_id


def assign_cluster(major_name: str, college_name: str) -> str:
    text = f"{college_name} {major_name}"
    if any(keyword in text for keyword in ["信息安全", "计算机科学", "软件工程", "智能科学", "物联网"]):
        return "security-computing"
    if any(keyword in text for keyword in ["电子信息", "通信工程", "光电", "微电子"]):
        return "electronics-communication"
    if any(keyword in text for keyword in ["自动化", "电气", "机器人", "测控", "农业电气化"]):
        return "automation-robotics"
    if any(keyword in text for keyword in ["机械", "车辆", "交通", "智能制造", "农业机械", "农业智能装备"]):
        return "mechanical-vehicle"
    if any(keyword in text for keyword in ["土木", "工程力学", "智能建造"]):
        return "civil-structure"
    if any(keyword in text for keyword in ["化学", "化工", "材料", "金属", "冶金"]):
        return "chem-material"
    if any(keyword in text for keyword in ["生物", "食品", "药学", "制药"]):
        return "bio-food-pharma"
    if any(keyword in text for keyword in ["临床", "医学", "检验", "影像", "口腔", "预防"]):
        return "medicine-health"
    if any(keyword in text for keyword in ["数学", "统计", "物理"]):
        return "math-physics"
    if any(keyword in text for keyword in ["会计", "金融", "工商", "物流", "管理", "国贸", "市场", "信息管理", "工业工程", "公共事业"]):
        return "management-finance"
    if any(keyword in text for keyword in ["法学", "知识产权", "英语", "日语", "汉语", "文学", "思想政治"]):
        return "humanities-language-law"
    if any(keyword in text for keyword in ["艺术", "设计", "美术", "数字媒体"]):
        return "design-art"
    if any(keyword in text for keyword in ["能源", "环境", "安全工程", "应急", "储能", "新能源", "环保"]):
        return "energy-environment"
    if "农业工程学院" in college_name:
        return "agriculture-equipment"
    return "software-data"


def enrich_major_profiles(archive: LakebookArchive, majors: list[dict[str, Any]]) -> None:
    for major in majors:
        doc = archive.get_doc(major["sourceDocUrl"])
        sections = body_sections(doc.body_asl)
        location_section = [node for heading, node in sections if heading.startswith("1. 专业定位")]
        basic = parse_basic_kv(location_section)
        keywords = basic.get("专业关键词", "")
        core_skills = basic.get("核心能力", "")
        mainline = basic.get("竞赛主线", "")
        summary = ""
        featured: list[str] = []
        for heading, node in sections:
            if heading.startswith("2. 总体建议") and node.tag == "p" and not summary:
                summary = clean_text(node)
            if heading.startswith("3. 推荐优先级总表") and node.tag == "table":
                table = parse_table(node)
                for row in table[1:]:
                    if len(row) < 2:
                        continue
                    if row[1]["links"]:
                        href = row[1]["links"][0]["href"]
                        if re.fullmatch(r"[0-9a-f]{32}", href):
                            featured.append(href)
                break

        focus_override = FOCUS_MAJOR_OVERRIDES.get(major["name"], {})
        cluster_id = focus_override.get("clusterId") or assign_cluster(major["name"], major["collegeName"])
        major.update(
            {
                "clusterId": cluster_id,
                "priority": focus_override.get("priority", "standard"),
                "boost": focus_override.get("boost", {}),
                "keywords": [item.strip() for item in keywords.split("、") if item.strip()],
                "coreSkills": [item.strip() for item in re.split(r"[、，,]", core_skills) if item.strip()],
                "mainline": mainline,
                "summary": summary,
                "featuredCompetitionUrls": featured,
            }
        )


def extract_competition_doc_data(
    archive: LakebookArchive,
    major_url_to_id: dict[str, str],
) -> tuple[dict[str, dict[str, Any]], dict[tuple[str, str], dict[str, Any]]]:
    competition_docs: dict[str, dict[str, Any]] = {}
    explicit_major_views: dict[tuple[str, str], dict[str, Any]] = {}

    for entry in archive.toc:
        title = entry.get("title", "")
        if entry.get("type") != "DOC" or not re.match(r"^\d{3}_", title):
            continue
        competition_id = title.split("_", 1)[0]
        doc = archive.get_doc(entry["url"])
        sections = body_sections(doc.body_asl)

        basic_nodes = [node for heading, node in sections if heading.startswith("1. 基本信息")]
        basic = parse_basic_kv(basic_nodes)
        official_site = None
        for node in basic_nodes:
            anchors = node.xpath(".//a")
            if anchors:
                official_site = anchors[0].get("href")
                break

        fit_highlights: list[dict[str, str]] = []
        low_fit_groups: list[dict[str, str]] = []
        resource_notes: dict[str, str] = {}
        award_notes: list[str] = []
        sharp_comment = ""

        for heading, node in sections:
            if heading.startswith("2. 适配专业") and node.tag == "table":
                rows = parse_table(node)
                for row in rows[1:]:
                    if len(row) < 3:
                        continue
                    badge = row[0]["text"]
                    major_name = row[1]["text"]
                    reason = row[2]["text"]
                    fit_highlights.append({"badge": badge, "major": major_name, "reason": reason})
                    if row[1]["links"]:
                        href = row[1]["links"][0]["href"]
                        major_id = major_url_to_id.get(href)
                        if major_id:
                            recommendation, priority_score = fit_from_badge(badge)
                            explicit_major_views[(competition_id, major_id)] = {
                                "recommendation": recommendation,
                                "reason": reason,
                                "priorityScore": priority_score,
                                "source": "lakebook-competition",
                            }
            elif heading.startswith("3. 不适配") and node.tag == "table":
                rows = parse_table(node)
                for row in rows[1:]:
                    if len(row) >= 2:
                        low_fit_groups.append({"group": row[0]["text"], "reason": row[1]["text"]})
            elif heading.startswith("4. 难度与资源门槛"):
                if node.tag == "ul":
                    for item in node.xpath(".//li"):
                        text = clean_text(item)
                        if "：" in text:
                            key, value = text.split("：", 1)
                            resource_notes[key] = value
                elif node.tag == "p":
                    text = clean_text(node)
                    if "：" in text:
                        key, value = text.split("：", 1)
                        resource_notes[key] = value
            elif heading.startswith("5. 获奖策略"):
                if node.tag in {"p", "ul"}:
                    if node.tag == "p":
                        text = clean_text(node)
                        if text:
                            award_notes.append(text)
                    else:
                        award_notes.extend(clean_text(item) for item in node.xpath(".//li") if clean_text(item))
            elif heading.startswith("6. 锐利评价") and node.tag == "p" and not sharp_comment:
                sharp_comment = clean_text(node)

        event_text = basic.get("2026举办时间", "")
        confidence_text = basic.get("时间可信度", "")
        status, month_tags, start_date, end_date = derive_status(event_text, confidence_text)

        competition_docs[competition_id] = {
            "docUrl": entry["url"],
            "basic": basic,
            "officialSite": official_site,
            "fitHighlights": fit_highlights[:6],
            "lowFitGroups": low_fit_groups[:4],
            "resourceNotes": resource_notes,
            "awardNotes": award_notes[:4],
            "sharpComment": sharp_comment,
            "status": status,
            "displayTime": event_text or "待官方发布",
            "monthTags": month_tags,
            "startDate": start_date.isoformat() if start_date else None,
            "endDate": end_date.isoformat() if end_date else None,
            "infoStatus": confidence_text or "待进一步核实",
        }
    return competition_docs, explicit_major_views


def fit_from_badge(badge: str) -> tuple[str, int]:
    if badge in FIT_BADGE_TO_RECOMMENDATION:
        return FIT_BADGE_TO_RECOMMENDATION[badge]
    prefix = badge[:1]
    return FIT_PREFIX_TO_RECOMMENDATION.get(prefix, ("可参加", 60))


def competition_link_bundle(research: dict[str, Any], lakebook_meta: dict[str, Any], competition_id: str) -> dict[str, Any]:
    official_site = lakebook_meta.get("officialSite") or research.get("official_site")
    official_notice = None
    signup_link = None

    published = research.get("published_2026")
    official_result = research.get("official_result")
    latest_result = research.get("latest_result")

    if published and published.get("link"):
        official_notice = published["link"]
        if any(keyword in (published.get("title") or "") for keyword in ["报名", "校赛", "通知", "参赛", "章程"]):
            signup_link = published["link"]
    elif official_result and official_result.get("link"):
        official_notice = official_result["link"]
    elif latest_result and latest_result.get("link"):
        official_notice = latest_result["link"]

    merged = {
        "officialSite": official_site,
        "officialNotice": official_notice,
        "signupLink": signup_link,
    }
    merged.update(MANUAL_REVERIFIED_OVERRIDES.get(competition_id, {}))
    return merged


def score_reason(cluster_id: str, domains: list[str], competition_name: str, major: dict[str, Any]) -> tuple[str, str, str, int]:
    meta = CLUSTER_META[cluster_id]
    weights = dict(meta["weights"])
    for domain, boost in major.get("boost", {}).items():
        weights[domain] = weights.get(domain, 0.0) + float(boost)
    if major["name"] in FOCUS_MAJOR_OVERRIDES and "信息安全" not in competition_name and cluster_id == "security-computing":
        weights["innovation"] = weights.get("innovation", 0.0) + 0.4

    raw_score = sum(weights.get(domain, 0.0) for domain in domains) / max(len(domains), 1)
    if raw_score >= 3.9:
        recommendation = "主推"
        priority_score = min(99, round(76 + raw_score * 5))
    elif raw_score >= 2.15:
        recommendation = "可参加"
        priority_score = min(89, round(48 + raw_score * 8))
    else:
        recommendation = "不建议"
        priority_score = max(12, round(raw_score * 10))

    focus_text = "、".join(major["coreSkills"][:3]) or meta["strengths"]
    domain_text = "、".join(DOMAIN_LABELS[domain] for domain in domains[:3])
    gain_domains = domains[:3]
    gain = "、".join(skill_gain_for_domain(domain) for domain in gain_domains)

    if recommendation == "主推":
        reason = f"{major['name']} 的主能力集中在 {focus_text}，与本赛事强调的 {domain_text} 直接重叠，适合优先投入并争取主力位。"
        barrier = "门槛主要在于持续训练、作品打磨或赛制熟悉度，而不是专业方向偏离。"
    elif recommendation == "可参加":
        reason = f"{major['name']} 可以把 {focus_text} 迁移到 {domain_text}，但通常需要补足专项规则、作品形态或跨学科方法。"
        barrier = f"主要短板不在基础能力，而在 {domain_text} 的专项积累和团队配置。"
    else:
        reason = f"{major['name']} 与本赛事主线 {domain_text} 的耦合度偏弱，除非你有明确兴趣、跨专业队友或已有积累，否则不建议排在前列。"
        barrier = f"要补的不只是技巧，而是整条 {domain_text} 能力链，投入产出通常不如更贴合本专业主线的赛事。"
    return recommendation, reason, gain, priority_score


def skill_gain_for_domain(domain: str) -> str:
    return {
        "security": "安全攻防",
        "programming": "编程实现",
        "software": "工程交付",
        "data-ai": "数据分析",
        "electronics": "硬件理解",
        "embedded": "嵌入式开发",
        "robotics": "系统联调",
        "mechanical": "工程设计",
        "civil": "建模表达",
        "energy-env": "工程实践",
        "chem-material": "实验设计",
        "bio-med": "研究规范",
        "medicine": "临床操作",
        "math-modeling": "建模推导",
        "business": "策划答辩",
        "finance": "商业分析",
        "innovation": "项目表达",
        "language": "写作演讲",
        "design": "视觉表达",
        "law": "规则治理",
    }[domain]


def source_markdown_path(item: dict[str, Any]) -> Path:
    comp_id = f"{item['index']:03d}"
    filename = f"{comp_id}-{item['name']}.md"
    level_dir = LEVEL_MAP[item["level"]]
    source = SOURCE_ROOT / item["fit"] / level_dir / filename
    if source.exists():
        return source
    fallback = REPO_ROOT / "content" / f"{comp_id}.md"
    if fallback.exists():
        return fallback
    raise FileNotFoundError(f"未找到 Markdown：{filename}")


def build_competitions(
    source_data: list[dict[str, Any]],
    competition_docs: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    competitions: list[dict[str, Any]] = []
    markdown_cache: dict[str, dict[str, Any]] = {}
    CONTENT_ROOT.mkdir(parents=True, exist_ok=True)

    for item in source_data:
        comp_id = f"{item['index']:03d}"
        markdown_source = source_markdown_path(item)
        markdown_text = markdown_source.read_text(encoding="utf-8")
        lakebook_meta = competition_docs.get(comp_id, {})
        fallback_time = fallback_markdown_time(markdown_text)
        links = competition_link_bundle(item["research"], lakebook_meta, comp_id)
        domains = detect_domains(
            item["name"],
            item.get("primary_name", ""),
            item.get("track_type", ""),
            lakebook_meta.get("basic", {}).get("赛事大类", ""),
            lakebook_meta.get("basic", {}).get("主要赛道", ""),
        )

        display_time = lakebook_meta.get("displayTime") or fallback_time["displayTime"]
        month_tags = lakebook_meta.get("monthTags") or fallback_time["monthTags"]
        status = lakebook_meta.get("status") or fallback_time["status"]
        info_status = lakebook_meta.get("infoStatus") or fallback_time["infoStatus"]
        start_date = lakebook_meta.get("startDate") or fallback_time["startDate"]
        end_date = lakebook_meta.get("endDate") or fallback_time["endDate"]

        competition = {
            "id": comp_id,
            "slug": f"competition-{comp_id}",
            "name": item["name"],
            "level": LEVEL_MAP[item["level"]],
            "trackType": item["track_type"],
            "trackTypes": domains,
            "status": status,
            "infoStatus": info_status,
            "displayTime": display_time,
            "startDate": start_date,
            "endDate": end_date,
            "monthTags": month_tags,
            "summary": item["conclusion"],
            "cardSummary": item["conclusion"],
            "officialSite": links.get("officialSite"),
            "officialNotice": links.get("officialNotice"),
            "signupLink": links.get("signupLink"),
            "mdPath": f"./content/{comp_id}.md",
            "securityFit": item["fit"],
            "securityScores": item["scores"],
            "fitHighlights": lakebook_meta.get("fitHighlights", []),
            "lowFitGroups": lakebook_meta.get("lowFitGroups", []),
            "resourceNotes": lakebook_meta.get("resourceNotes", {}),
            "awardNotes": lakebook_meta.get("awardNotes", []),
            "sharpComment": lakebook_meta.get("sharpComment", ""),
            "tags": sorted({item["track_type"], *month_tags, *domains}),
        }
        competitions.append(competition)

        shutil.copyfile(markdown_source, CONTENT_ROOT / f"{comp_id}.md")
        markdown_cache[comp_id] = competition

    competitions.sort(key=lambda record: int(record["id"]))
    return competitions, markdown_cache


def compute_alternatives(
    major_views_by_major: dict[str, list[dict[str, Any]]],
) -> dict[tuple[str, str], list[str]]:
    alternatives: dict[tuple[str, str], list[str]] = {}
    for major_id, records in major_views_by_major.items():
        sorted_records = sorted(
            records,
            key=lambda item: (
                -RECOMMENDATION_PRIORITY[item["recommendation"]],
                -item["priorityScore"],
                item["competitionId"],
            ),
        )
        top_ids = [record["competitionId"] for record in sorted_records[:6]]
        for record in records:
            candidates = [competition_id for competition_id in top_ids if competition_id != record["competitionId"]]
            alternatives[(record["competitionId"], major_id)] = candidates[:3]
    return alternatives


def build_profession_views(
    colleges: list[dict[str, Any]],
    majors: list[dict[str, Any]],
    competitions: list[dict[str, Any]],
    explicit_major_views: dict[tuple[str, str], dict[str, Any]],
) -> list[dict[str, Any]]:
    college_lookup = {college["id"]: college for college in colleges}
    major_views: list[dict[str, Any]] = []
    major_views_by_major: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for major in majors:
        cluster_id = major["clusterId"]
        for competition in competitions:
            key = (competition["id"], major["id"])
            override = explicit_major_views.get(key)
            if override:
                recommendation = override["recommendation"]
                reason = override["reason"]
                priority_score = override["priorityScore"]
                gain = "、".join(skill_gain_for_domain(domain) for domain in competition["trackTypes"][:3])
                barrier = "仍需按具体赛道补足真题经验、作品迭代和团队协作。"
                source = override["source"]
            else:
                recommendation, reason, gain, priority_score = score_reason(
                    cluster_id,
                    competition["trackTypes"],
                    competition["name"],
                    major,
                )
                barrier = "仍需结合赛制准备作品、训练计划和组队结构。" if recommendation != "不建议" else "跨专业进入这类赛道时，准备成本通常明显高于本专业主线赛事。"
                source = "rule-engine"

            record = {
                "competitionId": competition["id"],
                "collegeId": major["collegeId"],
                "majorId": major["id"],
                "recommendation": recommendation,
                "reason": reason,
                "gain": gain,
                "barrier": barrier,
                "priorityScore": priority_score,
                "alternatives": [],
                "source": source,
            }
            major_views.append(record)
            major_views_by_major[major["id"]].append(record)

    alternatives = compute_alternatives(major_views_by_major)
    for record in major_views:
        record["alternatives"] = alternatives[(record["competitionId"], record["majorId"])]

    college_views: list[dict[str, Any]] = []
    views_by_competition_college: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in major_views:
        views_by_competition_college[(record["competitionId"], record["collegeId"])].append(record)
    for (competition_id, college_id), records in views_by_competition_college.items():
        records.sort(key=lambda item: (-RECOMMENDATION_PRIORITY[item["recommendation"]], -item["priorityScore"]))
        top = records[0]
        main_count = sum(1 for item in records if item["recommendation"] == "主推")
        participate_count = sum(1 for item in records if item["recommendation"] == "可参加")
        college_name = college_lookup[college_id]["name"]
        if main_count:
            recommendation = "主推"
        elif participate_count:
            recommendation = "可参加"
        else:
            recommendation = "不建议"
        college_views.append(
            {
                "competitionId": competition_id,
                "collegeId": college_id,
                "recommendation": recommendation,
                "reason": f"{college_name} 下共有 {main_count} 个专业可作为主推、{participate_count} 个专业可作为交叉参赛参考，当前最强匹配专业是 {top['majorId']}。",
                "gain": top["gain"],
                "barrier": top["barrier"],
                "priorityScore": round(sum(item["priorityScore"] for item in records) / len(records)),
                "alternatives": top["alternatives"],
                "source": "college-aggregate",
            }
        )

    return major_views + college_views


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def build() -> None:
    if not SOURCE_JSON.exists():
        raise FileNotFoundError(f"未找到源数据：{SOURCE_JSON}")

    lakebook_path = locate_lakebook()
    archive = LakebookArchive(lakebook_path)
    try:
        source_data = json.loads(SOURCE_JSON.read_text(encoding="utf-8"))
        colleges, majors, major_url_to_id = lakebook_tree(archive)
        enrich_major_profiles(archive, majors)
        competition_docs, explicit_major_views = extract_competition_doc_data(archive, major_url_to_id)
        competitions, _ = build_competitions(source_data, competition_docs)
        profession_views = build_profession_views(colleges, majors, competitions, explicit_major_views)

        for major in majors:
            featured_ids = []
            for href in major["featuredCompetitionUrls"]:
                for competition in competitions:
                    doc_url = competition_docs.get(competition["id"], {}).get("docUrl")
                    if doc_url == href:
                        featured_ids.append(competition["id"])
                        break
            major["featuredCompetitionIds"] = featured_ids[:8]
            major.pop("featuredCompetitionUrls", None)

        majors_payload = {
            "updatedAt": TODAY.isoformat(),
            "basePath": BASE_PATH,
            "colleges": colleges,
            "majors": [
                {
                    "id": major["id"],
                    "name": major["name"],
                    "collegeId": major["collegeId"],
                    "clusterId": major["clusterId"],
                    "priority": major["priority"],
                    "keywords": major["keywords"],
                    "coreSkills": major["coreSkills"],
                    "mainline": major["mainline"],
                    "summary": major["summary"],
                    "featuredCompetitionIds": major["featuredCompetitionIds"],
                }
                for major in majors
            ],
            "clusters": [
                {"id": cluster_id, "label": meta["label"], "strengths": meta["strengths"]}
                for cluster_id, meta in CLUSTER_META.items()
            ],
        }
        competitions_payload = {
            "updatedAt": TODAY.isoformat(),
            "basePath": BASE_PATH,
            "competitions": competitions,
        }
        profession_payload = {
            "updatedAt": TODAY.isoformat(),
            "views": profession_views,
        }

        write_json(DATA_ROOT / "majors.json", majors_payload)
        write_json(DATA_ROOT / "competitions.json", competitions_payload)
        write_json(DATA_ROOT / "profession-views.json", profession_payload)
    finally:
        archive.close()


if __name__ == "__main__":
    build()
