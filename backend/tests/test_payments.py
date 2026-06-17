"""Backend tests for Nyara Stays payments module."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://luxury-lodging-6.preview.emergentagent.com").rstrip("/")

VALID_PAYLOAD = {
    "stay": "yume",
    "check_in": "2026-03-10",
    "check_out": "2026-03-13",  # 3 nights, low season
    "guests": {"adults": 2, "children": 0, "infants": 0},
    "currency": "USD",
    "customer": {"name": "TEST User", "email": "test@example.com", "phone": "+15551234567", "requests": ""},
}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# Publishable key endpoint
def test_publishable_key(session):
    r = session.get(f"{BASE_URL}/api/booking/publishable-key", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "publishable_key" in data
    assert data["publishable_key"].startswith("pk_"), f"Got: {data['publishable_key'][:10]}"


# Create payment intent — happy path
def test_create_intent_usd_yume_3_nights(session):
    r = session.post(f"{BASE_URL}/api/booking/create-payment-intent", json=VALID_PAYLOAD, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ["client_secret", "payment_intent_id", "booking_ref",
              "amount_total_minor", "amount_deposit_minor", "nights", "currency"]:
        assert k in d, f"missing {k}"
    assert d["nights"] == 3
    assert d["currency"] == "USD"
    assert d["booking_ref"].startswith("NYR-")
    assert d["client_secret"].startswith("pi_") or "secret" in d["client_secret"]
    # 30% deposit verification
    assert d["amount_deposit_minor"] == round(d["amount_total_minor"] * 0.30), \
        f"deposit {d['amount_deposit_minor']} != 30% of {d['amount_total_minor']}"
    # 3 nights * $320 * 1.00 = $960 = 96000 cents
    assert d["amount_total_minor"] == 96000
    assert d["amount_deposit_minor"] == 28800
    # Stash for next test
    pytest.intent_id = d["payment_intent_id"]
    pytest.booking_ref = d["booking_ref"]


# Payment status for freshly created intent
def test_payment_status_freshly_created(session):
    pi = getattr(pytest, "intent_id", None)
    if not pi:
        pytest.skip("no intent created")
    r = session.get(f"{BASE_URL}/api/booking/payment-status/{pi}", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] in ("requires_payment_method", "requires_confirmation", "processing", "succeeded")
    assert d["booking_ref"] == pytest.booking_ref
    assert d["currency"].lower() == "usd"


# Different stays / currencies — deposit ~30%
@pytest.mark.parametrize("stay,currency", [("nyara", "USD"), ("yume", "EUR"), ("nyara", "GBP")])
def test_create_intent_variants(session, stay, currency):
    payload = {**VALID_PAYLOAD, "stay": stay, "currency": currency}
    r = session.post(f"{BASE_URL}/api/booking/create-payment-intent", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["currency"] == currency
    # Round-to-nearest-minor deposit check
    expected = round(d["amount_total_minor"] * 0.30)
    assert abs(d["amount_deposit_minor"] - expected) <= 1


# Invalid inputs
def test_unsupported_currency(session):
    r = session.post(f"{BASE_URL}/api/booking/create-payment-intent",
                     json={**VALID_PAYLOAD, "currency": "XYZ"}, timeout=30)
    assert r.status_code == 400


def test_unknown_stay(session):
    r = session.post(f"{BASE_URL}/api/booking/create-payment-intent",
                     json={**VALID_PAYLOAD, "stay": "ghost"}, timeout=30)
    assert r.status_code in (400, 422)


def test_check_out_before_check_in(session):
    r = session.post(f"{BASE_URL}/api/booking/create-payment-intent",
                     json={**VALID_PAYLOAD, "check_in": "2026-03-15", "check_out": "2026-03-10"},
                     timeout=30)
    assert r.status_code == 400


def test_nights_over_60(session):
    r = session.post(f"{BASE_URL}/api/booking/create-payment-intent",
                     json={**VALID_PAYLOAD, "check_in": "2026-03-01", "check_out": "2026-06-01"},
                     timeout=30)
    assert r.status_code == 400


# Mongo persistence verification via status endpoint roundtrip
def test_db_record_created(session):
    r = session.post(f"{BASE_URL}/api/booking/create-payment-intent", json=VALID_PAYLOAD, timeout=30)
    assert r.status_code == 200
    pi = r.json()["payment_intent_id"]
    # status endpoint reads from DB indirectly; ensure it doesn't 500
    rs = session.get(f"{BASE_URL}/api/booking/payment-status/{pi}", timeout=30)
    assert rs.status_code == 200
