"""
Truth Bear GAUGE — CrewAI / LangChain 通用工具（可直接複製使用）

零相依（只用標準函式庫）、零帳號、零 API key。免費層立即可用；
付費層回 402 挑戰，由呼叫方自己的 x402 錢包處理（本檔不碰資金）。

用法一 — CrewAI:
    from truthbear_tool import make_crewai_tool
    tools = [make_crewai_tool()]

用法二 — LangChain:
    from truthbear_tool import make_langchain_tool
    tools = [make_langchain_tool()]

用法三 — 直接呼叫（不依賴任何框架）:
    from truthbear_tool import gauge_query, resolve_preview
    print(gauge_query("hydrology.river-level"))
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://aeml-x402.zeabur.app"
TIMEOUT = 45

DESCRIPTION = (
    "Query Truth Bear GAUGE for official-source signals (weather, hydrology, SEC filings, "
    "sanctions, macro, supply chain and more). Every record ships record_hash (canonical "
    "sha256) plus its official source and timestamp, so you can verify it offline without "
    "trusting this endpoint. Descriptive only: no advice, no prediction, no adjudication. "
    "Free tier needs no key. Paid endpoints answer HTTP 402 with an x402 challenge."
)


def _get(path: str) -> tuple[int, dict]:
    """回 (http_status, body)。402 不是錯誤,是付款挑戰,原樣回傳。"""
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "truthbear-tool/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {"error": f"HTTP {e.code}"}
    except Exception as exc:
        return 0, {"error": str(exc)}


def _provenance(rec: dict) -> dict:
    """抽出可自驗三件套。缺任一項就標明 —— 不假裝資料可信。"""
    source = rec.get("source_ref")
    if not source:
        srcs = rec.get("sources") or []
        source = (srcs[0] or {}).get("name") if srcs else None
    prov = {
        "record_hash": rec.get("record_hash"),
        "source": source,
        "timestamp": rec.get("snapshot_date") or rec.get("observed_at"),
    }
    prov["verifiable"] = all(prov.get(k) for k in ("record_hash", "source", "timestamp"))
    if prov["record_hash"]:
        prov["verify_url"] = f"{BASE}/gauge/verify?hash=" + urllib.parse.quote(prov["record_hash"])
    return prov


def catalog() -> dict:
    """免費:可查詢的訊號線清單。"""
    status, body = _get("/gauge/coverage")
    if status != 200:
        return {"ok": False, "status": status, "error": body}
    return {
        "ok": True,
        "signal_count": (body.get("totals") or {}).get("signal_ids"),
        "signals": [s.get("signal_id") for s in (body.get("signals") or [])],
    }


def gauge_query(signal_id: str | None = None) -> dict:
    """免費:取一筆帶 provenance 的官方訊號樣本。"""
    path = "/gauge/sample"
    if signal_id:
        path += "?signal_id=" + urllib.parse.quote(signal_id)
    status, body = _get(path)
    if status != 200:
        return {"ok": False, "status": status, "error": body}
    rec = body.get("sample") or body
    cur = rec.get("current") or {}
    metric, value = next(iter(cur.items()), (None, None))
    return {
        "ok": True,
        "signal_id": rec.get("signal_id"),
        "entity": rec.get("entity"),
        "entity_name": rec.get("entity_name"),
        "metric": metric,
        "value": value,
        "unit": (rec.get("standard_ruler") or {}).get("unit"),
        "summary": rec.get("summary_zh"),
        "provenance": _provenance(rec),
    }


def resolve_preview() -> dict:
    """免費:結算證據 API 的用法與定價說明。"""
    status, body = _get("/resolve/preview")
    return {"ok": status == 200, "status": status, **({} if status != 200 else body)}


def resolve(entity: str, form: str, cutoff: str, **opts) -> dict:
    """
    付費($0.01–0.1):判定某 form 是否於 cutoff 前於 SEC EDGAR 留下申報紀錄。

    ★本函式【不代付款】。未帶 x402 付款標頭時服務回 402 挑戰,原樣回傳給呼叫方,
      由呼叫方自己的錢包完成 EIP-3009 授權。這是刻意設計:工具不碰資金。
    """
    params = {"entity": entity, "form": form, "cutoff": cutoff}
    params.update({k: v for k, v in opts.items() if v is not None})
    endpoint = "/resolve/proposer" if opts.pop("proposer_feed", False) else "/resolve"
    status, body = _get(endpoint + "?" + urllib.parse.urlencode(params))

    if status == 402:
        a = (body.get("accepts") or [{}])[0]
        atomic = a.get("maxAmountRequired")
        return {
            "ok": False,
            "payment_required": True,
            "price_usdc": (int(atomic) / 1e6) if str(atomic).isdigit() else None,
            "network": a.get("network"),
            "asset": a.get("asset"),
            "pay_to": a.get("payTo"),
            "note": "以你自己的 x402 錢包完成付款後重試。本工具不代付。",
        }
    if status == 400:
        return {"ok": False, "bad_request": True, "error": body.get("error"), "usage": body.get("usage")}
    if status != 200:
        return {"ok": False, "status": status, "error": body}
    return {"ok": True, **body}


# ── 框架轉接（都只是薄包裝，核心邏輯共用） ────────────────────────

def make_crewai_tool():
    """CrewAI:回一個 BaseTool 實例;未安裝 crewai 則回可呼叫的 dict 描述。"""
    try:
        from crewai.tools import BaseTool  # type: ignore
    except Exception:
        return {"name": "truthbear_gauge", "description": DESCRIPTION, "run": gauge_query}

    class TruthBearTool(BaseTool):  # type: ignore
        name: str = "truthbear_gauge"
        description: str = DESCRIPTION

        def _run(self, signal_id: str = "") -> str:
            return json.dumps(gauge_query(signal_id or None), ensure_ascii=False)

    return TruthBearTool()


def make_langchain_tool():
    """LangChain:回一個 StructuredTool;未安裝則回可呼叫的 dict 描述。"""
    try:
        from langchain_core.tools import StructuredTool  # type: ignore
    except Exception:
        return {"name": "truthbear_gauge", "description": DESCRIPTION, "invoke": gauge_query}

    return StructuredTool.from_function(
        func=lambda signal_id="": json.dumps(gauge_query(signal_id or None), ensure_ascii=False),
        name="truthbear_gauge",
        description=DESCRIPTION,
    )


if __name__ == "__main__":
    print("── catalog ──")
    c = catalog()
    print(f"  {c.get('signal_count')} 條訊號線;前 5:{(c.get('signals') or [])[:5]}")

    print("\n── gauge_query ──")
    q = gauge_query()
    print(f"  {q.get('entity_name')} · {q.get('metric')} = {q.get('value')} {q.get('unit') or ''}")
    print(f"  可自驗:{q['provenance']['verifiable']}  hash={str(q['provenance']['record_hash'])[:28]}…")

    print("\n── resolve(未付款 → 應回 402 挑戰) ──")
    r = resolve("AAPL", "10-K", "2025-01-01")
    print(f"  payment_required={r.get('payment_required')} "
          f"price={r.get('price_usdc')} USDC on {r.get('network')}")
