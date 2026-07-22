# Framework integrations

Drop-in tools for agent frameworks. **Zero dependencies, zero API key, zero signup.**

Everything here talks to the same GAUGE service at `https://aeml-x402.zeabur.app`
that [mcp-gauge](../README.md) wraps — the free tier works immediately; paid
endpoints answer `HTTP 402` with an [x402](https://x402.org) challenge that your
own wallet settles. **These tools never touch your funds.**

## `truthbear_tool.py` — CrewAI / LangChain / plain Python

Standard library only. Python 3.9+.

```python
# CrewAI
from truthbear_tool import make_crewai_tool
tools = [make_crewai_tool()]

# LangChain / LangGraph
from truthbear_tool import make_langchain_tool
tools = [make_langchain_tool()]

# No framework at all
from truthbear_tool import gauge_query, catalog, resolve
print(catalog())                       # 176 signal lines, free
print(gauge_query())                   # one signal + provenance, free
print(resolve("AAPL", "10-K", "2025-01-01"))   # returns the 402 challenge
```

Run it directly to smoke-test:

```
python truthbear_tool.py
```

### What you get back

Every record carries the three fields you need to verify it **without trusting
this endpoint**:

| field | meaning |
|---|---|
| `record_hash` | canonical `sha256:<64 hex>` over the record core |
| `source` | the official source (URL or issuer name) |
| `timestamp` | observation / snapshot time |

`provenance.verifiable` is `true` only when all three are present. A
`verify_url` is included so you can reverse-look-up any hash.

### Paid endpoints

`resolve()` does **not** pay for you. Without an x402 payment header the service
answers `402` and the tool hands the challenge straight back:

```python
{'ok': False, 'payment_required': True, 'price_usdc': 0.1,
 'network': 'base', 'asset': '0x8335...', 'pay_to': '0x2d16...'}
```

Settle it with your own x402 client and retry.
