"""What experts have told us, across sessions. See docs/tickets/T-110-knowledge-graph.md.

A fact is keyed by the set of nodes its answer was tagged with, so the same answer given again in
a later session adds a quote to the existing fact instead of a new one. Nodes are the durable things
on screen (supplier, field, value), never the invoice: invoice numbers don't repeat across sessions.
"""

import hashlib
import json
import os
import re
from pathlib import Path

# Labels of an opened record's visible fields that name something worth remembering.
CONTEXT_FIELDS = {
    "supplier": "supplier",
    "vendor": "supplier",
    "company": "company",
    "company code": "company",
}
NODE_TYPES = set(CONTEXT_FIELDS.values())


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.casefold()).strip("_")


def nodes_for_event(event: dict, session_events: list[dict]) -> list[str]:
    """Nodes a screen event names: its entity or the entity's supplier, plus field and values."""
    nodes: set[str] = set()
    kind, _, name = event["entity"].partition(" ")
    if slug(kind) in NODE_TYPES and name.strip():
        nodes.add(f"{slug(kind)}:{slug(name)}")
    else:
        opened = [
            e for e in session_events
            if e.get("kind") == "open" and e.get("entity") == event["entity"] and e.get("fields")
        ]  # fmt: skip
        if opened:
            for label, value in opened[-1]["fields"].items():
                node_type = CONTEXT_FIELDS.get(label.strip().casefold())
                if node_type and slug(value or ""):
                    nodes.add(f"{node_type}:{slug(value)}")
    if event.get("field"):
        nodes.add(f"field:{slug(event['field'])}")
    for value in (event.get("before"), event.get("after")):
        if value and slug(value):
            nodes.add(f"value:{slug(value)}")
    return sorted(nodes)


def fact_id(nodes: list[str]) -> str:
    return "f" + hashlib.sha1("|".join(sorted(nodes)).encode()).hexdigest()[:10]


def known_line(fact: dict) -> str:
    q = fact["quotes"][-1]
    return f'{fact["question"]} "{q["text"]}" ({q["expert"]}, {q["date"]})'


class KnowledgeGraph:
    """`graph.json` held in memory and rewritten whole on every change; it stays small by design."""

    def __init__(self, path: Path):
        self.path = path
        self._facts: dict[str, dict] = {}
        if path.is_file():
            for fact in json.loads(path.read_text(encoding="utf-8"))["facts"]:
                self._facts[fact["id"]] = fact

    def facts(self) -> list[dict]:
        return list(self._facts.values())

    def add(self, nodes: list[str], question: str, quote: dict) -> dict:
        fid = fact_id(nodes)
        fact = self._facts.get(fid)
        if fact is None:
            fact = {"id": fid, "nodes": sorted(nodes), "question": question, "quotes": []}
            self._facts[fid] = fact
        fact["quotes"].append(quote)
        self._save()
        return fact

    def known(self, nodes: list[str], max_facts: int, max_chars: int) -> list[dict]:
        """Facts linked to `nodes`, as lines for the agent.

        One hop: facts sharing a node, most shared nodes first. Two hops: facts sharing a node with
        a one-hop fact (Brandt's other rules, when Brandt was coded like this before). Cut at
        `max_facts` or `max_chars` of text, whichever comes first.
        """
        wanted = set(nodes)
        scored = [(len(wanted & set(f["nodes"])), f) for f in self._facts.values()]
        one_hop = [f for n, f in sorted(scored, key=lambda sf: -sf[0]) if n]
        reached = wanted.union(*(f["nodes"] for f in one_hop))
        two_hops = [f for n, f in scored if not n and reached & set(f["nodes"])]
        out, chars = [], 0
        for f in (one_hop + two_hops)[:max_facts]:
            text = known_line(f)
            chars += len(text)
            if chars > max_chars:
                break
            out.append({"id": f["id"], "text": text})
        return out

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        data = {"facts": self.facts()}
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, self.path)
