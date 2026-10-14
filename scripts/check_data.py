#!/usr/bin/env python3
"""Validate 讯息窗 data files. Exits 0 when issues, columns, and favorites match the documented format."""

from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "data" / "index.json"
COLUMNS_INDEX_PATH = ROOT / "data" / "columns" / "index.json"
FAVORITES_PATH = ROOT / "data" / "favorites.json"
ISSUES_DIR = ROOT / "data" / "issues"
COLUMNS_DIR = ROOT / "data" / "columns"

SECTIONS = ("我关注的", "国际重大影响")
# Common 我关注的 sub-block names. New non-empty names are also accepted.
BLOCKS = ("AI 模型和产品动态", "人机恋和 AI 陪伴赛道", "语音交互和 AI 硬件玩具", "全球股市")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ITEM_ID_RE = re.compile(r"^.+-[1-9]\d*$")
COLUMN_ID_RE = re.compile(r"^专栏-[1-9]\d*$")

INDEX_KEYS = {"version", "issues"}
META_KEYS = {"id", "date", "slot", "title", "itemCount"}
ISSUE_KEYS = {"version", "id", "date", "slot", "title", "items"}
ITEM_KEYS = {"id", "section", "block", "title", "time", "summary", "relevance", "sources"}
SOURCE_KEYS = {"label", "url"}
FAVORITE_KEYS = {"ids"}
COLUMN_INDEX_KEYS = {"version", "columns"}
COLUMN_META_KEYS = {"id", "date", "title", "summary"}
COLUMN_KEYS = {"version", "id", "title", "date", "summary", "body", "related", "sources"}
COLUMN_BODY_P_KEYS = {"type", "text"}
COLUMN_BODY_SECTION_KEYS = {"type", "label", "text"}
COLUMN_SOURCE_KEYS = {"title", "outlet", "url", "date"}
OPINION_LABEL = "观点"

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


def check_date(value, where: str) -> bool:
    if not isinstance(value, str) or not DATE_RE.fullmatch(value):
        fail(f"{where} 必须是 YYYY-MM-DD")
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        fail(f"{where} 不是有效日期")
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

    columns_index = load_json(COLUMNS_INDEX_PATH)
    column_paths = (
        sorted(path for path in COLUMNS_DIR.glob("*.json") if path.name != "index.json")
        if COLUMNS_DIR.exists()
        else []
    )
    if columns_index is not None and require_keys(
        columns_index, COLUMN_INDEX_KEYS, COLUMN_INDEX_KEYS, "data/columns/index.json"
    ):
        if columns_index.get("version") != 1:
            fail("data/columns/index.json version 必须为 1")
        column_metas = columns_index.get("columns")
        if not isinstance(column_metas, list):
            fail("data/columns/index.json columns 必须是数组")
            column_metas = []
    else:
        column_metas = []

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
                if not nonempty(block if isinstance(block, str) else "", f"{item_where}.block"):
                    pass
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

    column_ids = set()
    previous_column_date = None
    for position, meta in enumerate(column_metas):
        where = f"data/columns/index.json columns[{position}]"
        if not require_keys(meta, COLUMN_META_KEYS, COLUMN_META_KEYS, where):
            continue
        column_id = meta["id"]
        if not nonempty(column_id, f"{where}.id"):
            continue
        if not COLUMN_ID_RE.fullmatch(column_id):
            fail(f"{where}.id 必须形如 专栏-1")
            continue
        if column_id in column_ids:
            fail(f"专栏 id 重复：{column_id}")
        if column_id in item_ids:
            fail(f"专栏 id 与条目 id 冲突：{column_id}")
        column_ids.add(column_id)
        if not nonempty(meta.get("title"), f"{where}.title"):
            pass
        if not isinstance(meta.get("summary"), str) or not str(meta.get("summary")).strip():
            fail(f"{where}.summary 必须是非空字符串")
        if not check_date(meta.get("date"), f"{where}.date"):
            continue
        parsed = date.fromisoformat(meta["date"])
        if previous_column_date is not None and parsed > previous_column_date:
            fail(f"{where} 日期比前一条更新；columns 必须从新到旧")
        previous_column_date = parsed

        path = COLUMNS_DIR / f"{column_id}.json"
        column = load_json(path)
        if column is None:
            continue
        column_where = f"data/columns/{column_id}.json"
        if not require_keys(column, COLUMN_KEYS, COLUMN_KEYS, column_where):
            continue
        if column.get("version") != 1:
            fail(f"{column_where} version 必须为 1")
        for field in ("id", "date", "title", "summary"):
            if column.get(field) != meta.get(field):
                fail(f"{column_where} 的 {field} 与目录不一致")
        body = column.get("body")
        if not isinstance(body, list) or not body:
            fail(f"{column_where} body 必须是非空数组")
            body = []
        has_opinion = False
        for block_index, block in enumerate(body):
            block_where = f"{column_where} body[{block_index}]"
            if not isinstance(block, dict):
                fail(f"{block_where} 必须是对象")
                continue
            block_type = block.get("type")
            if block_type == "p":
                if not require_keys(block, COLUMN_BODY_P_KEYS, COLUMN_BODY_P_KEYS, block_where):
                    continue
                if not nonempty(block.get("text"), f"{block_where}.text"):
                    pass
            elif block_type == "section":
                if not require_keys(block, COLUMN_BODY_SECTION_KEYS, COLUMN_BODY_SECTION_KEYS, block_where):
                    continue
                if not nonempty(block.get("label"), f"{block_where}.label"):
                    pass
                if not nonempty(block.get("text"), f"{block_where}.text"):
                    pass
                if block.get("label") == OPINION_LABEL:
                    has_opinion = True
            else:
                fail(f"{block_where}.type 必须是 p 或 section")
        if not has_opinion:
            fail(f"{column_where} body 必须有一节 label 为 {OPINION_LABEL}")
        related = column.get("related")
        if not isinstance(related, list) or not all(isinstance(item, str) for item in related):
            fail(f"{column_where} related 必须是字符串数组")
            related = []
        if len(related) != len(set(related)):
            fail(f"{column_where} related 有重复")
        for related_index, related_id in enumerate(related):
            related_where = f"{column_where} related[{related_index}]"
            if not nonempty(related_id, related_where):
                continue
            if related_id not in item_ids:
                fail(f"{related_where} 引用了不存在的条目 {related_id}")
        sources = column.get("sources")
        if not isinstance(sources, list):
            fail(f"{column_where} sources 必须是数组")
            sources = []
        for source_index, source in enumerate(sources):
            source_where = f"{column_where} sources[{source_index}]"
            if not require_keys(source, COLUMN_SOURCE_KEYS, COLUMN_SOURCE_KEYS, source_where):
                continue
            if not nonempty(source.get("title"), f"{source_where}.title"):
                pass
            if not nonempty(source.get("outlet"), f"{source_where}.outlet"):
                pass
            url = source.get("url")
            if not isinstance(url, str) or not re.match(r"^https?://", url):
                fail(f"{source_where}.url 必须是 http 或 https 链接")
            check_date(source.get("date"), f"{source_where}.date")

    indexed_columns = {meta.get("id") for meta in column_metas if isinstance(meta, dict)}
    for path in column_paths:
        if path.stem not in indexed_columns:
            fail(f"{path.relative_to(ROOT)} 没有写进 data/columns/index.json")

    known_ids = item_ids | column_ids
    for favorite_id in favorite_ids:
        if favorite_id not in known_ids:
            fail(f"data/favorites.json 引用了不存在的条目或专栏 {favorite_id}")

    if errors:
        for message in errors:
            print(message, file=sys.stderr)
        print(f"{len(errors)} 个问题", file=sys.stderr)
        return 1
    print(f"ok: {len(issues)} 期, {len(item_ids)} 条, {len(column_ids)} 篇专栏, {len(favorite_ids)} 条收藏")
    return 0


if __name__ == "__main__":
    sys.exit(main())
