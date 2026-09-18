import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2] / "backend"))

from app.routers.companion import CODE_OUTPUT, extract_reply, local_guardrail


def test_code_requests_are_rejected_before_gemini():
    reply = local_guardrail("Write Python code for a web API", "en")
    assert reply
    assert "can’t help with coding" in reply


def test_crisis_language_points_to_immediate_human_help():
    reply = local_guardrail("I want to kill myself", "en")
    assert reply
    assert "emergency services" in reply
    assert "SOS button" in reply


def test_everyday_conversation_can_reach_gemini():
    assert local_guardrail("I miss having tea with my sister", "en") is None
    assert local_guardrail("I enjoyed my class today", "en") is None


def test_generated_code_patterns_are_detected():
    assert CODE_OUTPUT.search("```python\nprint('hello')\n```")


def test_reply_text_is_extracted_from_gemini_response():
    payload = {"candidates": [{"content": {"parts": [{"text": "I am listening."}]}}]}
    assert extract_reply(payload) == "I am listening."
