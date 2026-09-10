import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parents[2] / "backend"))

from app.models import CaregiverUnlockRequest, GameResult, RegisterRequest, Reminder


def test_registration_requires_numeric_caregiver_pin():
    with pytest.raises(ValueError):
        RegisterRequest(email="family@example.com", password="longpassword", patientName="Aita", caregiverName="Ananya", caregiverPin="abcd")


def test_caregiver_unlock_requires_a_numeric_pin():
    with pytest.raises(ValueError):
        CaregiverUnlockRequest(pin="abcd")


def test_game_scores_are_bounded():
    with pytest.raises(ValueError):
        GameResult(id="game-1", game="memory", difficulty="easy", score=120, accuracy=90, speed=80, mistakes=1, responseTime=20)


def test_reminder_accepts_valid_time():
    reminder = Reminder(id="reminder-1", title="Medicine", category="medication", time="08:30")
    assert reminder.time == "08:30"
