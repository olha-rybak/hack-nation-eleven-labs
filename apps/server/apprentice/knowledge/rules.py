"""Rules the expert reviews (T-205): each fact said back as one plain sentence.

The sentence is written once per fact by one model call for every fact still missing one, and kept
in the graph. The expert then agrees with it, rewrites it, or deletes the fact.
"""

from pydantic import BaseModel

from apprentice import prompts
from apprentice.knowledge.graph import KnowledgeGraph
from apprentice.llm.structured import StructuredLlm


class LlmRule(BaseModel):
    fact: str  # fact id as shown
    rule: str


class LlmRules(BaseModel):
    rules: list[LlmRule]


def render(facts: list[dict]) -> str:
    blocks = []
    for f in facts:
        lines = [f'{f["id"]}: asked "{f["question"]}"']
        lines += [f'  answered "{q["text"]}" ({q["expert"]}, {q["date"]})' for q in f["quotes"]]
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


async def write_rules(llm: StructuredLlm, graph: KnowledgeGraph) -> None:
    """Write the sentence for unreviewed facts that have none yet. Nothing missing, no call."""
    missing = [f for f in graph.unreviewed() if not f.get("rule")]
    if not missing:
        return
    raw = await llm.parse(prompts.load("knowledge/rules"), render(missing), LlmRules)
    ids = {f["id"] for f in missing}
    graph.set_rules({r.fact: r.rule.strip() for r in raw.rules if r.fact in ids and r.rule.strip()})
