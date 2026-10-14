#!/usr/bin/env python3
"""Validate 讯息窗 data files. Exits 0 when the catalog matches the documented format."""

from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "data" / "index.json"
FAVORITES_PATH = ROOT / "data" / "favorites.json"
ISSUES_DIR = ROOT / "data" / "issues"

SECTIONS = ("我关注的", "国际重大影响")
BLOCKS = ("AI 模型和产品动态", "人机恋和 AI 陪伴赛道", "语音交互和 AI 硬件玩具")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ITEM_ID_RE = re.compile(r"^.+-[1-9]\d*$")

INDEX_KEYS = {"version", "issues"}
META_KEYS = {"id", "date", "slot", "title", "itemCount"}
ISSUE_KEYS = {"version", "id", "date", "slot", "title", "items"}
ITEM_KEYS = {"id", "section", "block", "title", "time", "summary", "relevance", "sources"}
SOURCE_KEYS = {"label", "url"}
FAVORITE_KEYS = {"ids"}

errors: list[str] = []


def fail(message: str) -> None:
    errors.append(message)


def load_json(path: Path):
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        fail(f"缺少文件 {path.relative_to(ROOT)}")
        return None
    if text.startswith("\ufeff"):
        fail(f"{path.relative_to(ROOT)} 含有 BOM")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        fail(f"{path.relative_to(ROOT)} 不是合法 JSON：{exc}")
        return None


def require_keys(value, allowed: set[str], required: set[str], where: str) -> bool:
    if not isinstance(value, dict):
        fail(f"{where} 必须是对象")
        return False
    unknown = set(value) - allowed
    missing = required - set(value)
    if unknown:
        fail(f"{where} 有未定义字段：{', '.join(sorted(unknown))}")
    if missing:
        fail(f"{where} 缺少字段：{', '.join(sorted(missing))}")
    return not unknown and not missing


def nonempty(value, where: str) -> bool:
    if not isinstance(value, str) or not value.strip():
        fail(f"{where} 必须是非空字符串")
        return False
    return True


def check_time(value, where: str) -> None:
    if isinstance(value, str) and DATE_RE.fullmatch(value):
        try:
            date.fromisoformat(value)
        except ValueError:
            fail(f"{where} 不是有效日期")
        return
    if isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?\+08:00", value):
        try:
            datetime.fromisoformat(value)
        except ValueError:
            fail(f"{where} 不是有效时间")
        return
    fail(f"{where} 时间格式应为 YYYY-MM-DD，或带台北时区的 YYYY-MM-DDTHH:mm:ss+08:00")


def main() -> int:
    index = load_json(INDEX_PATH)
    favorites = load_json(FAVORITES_PATH)
    issue_paths = sorted(ISSUES_DIR.glob("*.json")) if ISSUES_DIR.exists() else []

    if index is not None and require_keys(index, INDEX_KEYS, INDEX_KEYS, "data/index.json"):
        if index.get("version") != 1:
            fail("data/index.json version 必须为 1")
        issues = index.get("issues")
        if not isinstance(issues, list):
            fail("data/index.json issues 必须是数组")
            issues = []
    else:
        issues = []

    if favorites is not None and require_keys(favorites, FAVORITE_KEYS, FAVORITE_KEYS, "data/favorites.json"):
        ids = favorites.get("ids")
        if not isinstance(ids, list) or not all(isinstance(item, str) for item in ids):
            fail("data/favorites.json ids 必须是字符串数组")
            favorite_ids = []
        else:
            favorite_ids = ids
            if len(favorite_ids) != len(set(favorite_ids)):
                fail("data/favorites.json ids 有重复")
    else:
        favorite_ids = []

    seen_meta = set()
    previous_date = None
    item_ids = set()

    for position, meta in enumerate(issues):
        where = f"data/index.json issues[{position}]"
        if not require_keys(meta, META_KEYS, META_KEYS, where):
            continue
        issue_id = meta["id"]
        if not nonempty(issue_id, f"{where}.id"):
            continue
        if issue_id in seen_meta:
            fail(f"期次 id 重复：{issue_id}")
        seen_meta.add(issue_id)
        if not isinstance(meta["itemCount"], int) or isinstance(meta["itemCount"], bool) or meta["itemCount"] < 0:
            fail(f"{where}.itemCount 必须是非负整数")
        if not nonempty(meta["slot"], f"{where}.slot") or not nonempty(meta["title"], f"{where}.title"):
            continue
        if not isinstance(meta["date"], str) or not DATE_RE.fullmatch(meta["date"]):
            fail(f"{where}.date 必须是 YYYY-MM-DD")
            continue
        try:
            parsed = date.fromisoformat(meta["date"])
        except ValueError:
            fail(f"{where}.date 不是有效日期")
            continue
        prefix = f"{parsed.month:02d}{parsed.day:02d}"
        if issue_id != f"{prefix}{meta['slot']}":
            fail(f"{where}.id 必须是月日加时段，期望 {prefix}{meta['slot']}")
        if previous_date is not None and parsed > previous_date:
            fail(f"{where} 日期比前一条更新；issues 必须从新到旧")
        previous_date = parsed

        path = ISSUES_DIR / f"{issue_id}.json"
        issue = load_json(path)
        if issue is None:
            continue
        issue_where = f"data/issues/{issue_id}.json"
        if not require_keys(issue, ISSUE_KEYS, ISSUE_KEYS, issue_where):
            continue
        if issue.get("version") != 1:
            fail(f"{issue_where} version 必须为 1")
        for field in ("id", "date", "slot", "title"):
            if issue.get(field) != meta.get(field):
                fail(f"{issue_where} 的 {field} 与目录不一致")
        items = issue.get("items")
        if not isinstance(items, list):
            fail(f"{issue_where} items 必须是数组")
            continue
        if meta["itemCount"] != len(items):
            fail(f"{issue_where} 条目数 {len(items)} 与目录 itemCount {meta['itemCount']} 不一致")
        for item_index, item in enumerate(items):
            item_where = f"{issue_where} items[{item_index}]"
            if not require_keys(item, ITEM_KEYS, ITEM_KEYS - {"block"}, item_where):
                continue
            expected_id = f"{issue_id}-{item_index + 1}"
            if item.get("id") != expected_id:
                fail(f"{item_where}.id 必须是 {expected_id}")
            elif item["id"] in item_ids:
                fail(f"条目 id 重复：{item['id']}")
            else:
                item_ids.add(item["id"])
            if not ITEM_ID_RE.fullmatch(str(item.get("id", ""))):
                fail(f"{item_where}.id 格式应为 <期次 id>-<序号>")
            section = item.get("section")
            if section not in SECTIONS:
                fail(f"{item_where}.section 必须是 {' / '.join(SECTIONS)}")
            block = item.get("block", None)
            if section == "我关注的":
                if block not in BLOCKS:
                    fail(f"{item_where}.block 必须是我关注的三个子块之一")
            elif "block" in item and block is not None:
                fail(f"{item_where} 不是我关注的，不应填写 block")
            if not nonempty(item.get("title"), f"{item_where}.title"):
                pass
            if not isinstance(item.get("summary"), str) or not item.get("summary").strip():
                fail(f"{item_where}.summary 必须是非空字符串")
            if not isinstance(item.get("relevance"), str):
                fail(f"{item_where}.relevance 必须是字符串，可以是空字符串")
            check_time(item.get("time"), f"{item_where}.time")
            sources = item.get("sources")
            if not isinstance(sources, list):
                fail(f"{item_where}.sources 必须是数组")
                continue
            for source_index, source in enumerate(sources):
                source_where = f"{item_where}.sources[{source_index}]"
                if not require_keys(source, SOURCE_KEYS, SOURCE_KEYS, source_where):
                    continue
                if not nonempty(source.get("label"), f"{source_where}.label"):
                    pass
                url = source.get("url")
                if not isinstance(url, str) or not re.match(r"^https?://", url):
                    fail(f"{source_where}.url 必须是 http 或 https 链接")

    indexed = {meta.get("id") for meta in issues if isinstance(meta, dict)}
    for path in issue_paths:
        if path.stem not in indexed:
            fail(f"{path.relative_to(ROOT)} 没有写进 data/index.json")

    for favorite_id in favorite_ids:
        if favorite_id not in item_ids:
            fail(f"data/favorites.json 引用了不存在的条目 {favorite_id}")

    if errors:
        for message in errors:
            print(message, file=sys.stderr)
        print(f"{len(errors)} 个问题", file=sys.stderr)
        return 1
    print(f"ok: {len(issues)} 期, {len(item_ids)} 条, {len(favorite_ids)} 条收藏")
    return 0


if __name__ == "__main__":
    sys.exit(main())
