"""
Nyara Stays — payments module
Handles Stripe PaymentIntent creation + confirmation for the in-page Stripe
Payment Element on the booking page.

Security:
- All prices computed server-side from stay + nights + currency.
- The frontend NEVER sends an amount; it only sends booking parameters.
- Same pricing table mirrored in the Cloudflare _worker.js for production.
"""
import os
import math
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Literal

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, EmailStr

logger = logging.getLogger(__name__)

stripe.api_key = os.environ.get("STRIPE_API_KEY")
if not stripe.api_key:
    logger.warning("STRIPE_API_KEY missing — payment endpoints will fail")
# Emergent dev sandbox proxy — only when the magic key is set
if stripe.api_key and "sk_test_emergent" in stripe.api_key:
    stripe.api_base = "https://integrations.emergentagent.com/stripe"

# ----------------------------------------------------------------------------
# Pricing — single source of truth (mirror in _worker.js)
# ----------------------------------------------------------------------------
STAYS = {
    "yume":  {"name": "Yume by Nyara", "loc": "Uluwatu · Bali",     "base_usd_per_night": 320.0},
    "nyara": {"name": "Nyara Villas",  "loc": "Uluwatu · Bali",     "base_usd_per_night": 680.0},
    "penthouse": {"name": "Penthouse by Nyara", "loc": "Aldea Zama · Tulum", "base_usd_per_night": 450.0},
}

# Multiplier applied by seasonal tier (matches calendar dot logic in booking.js)
SEASON_BY_MONTH = {
    # months are 0-indexed (Jan=0)
    0: "high", 6: "high", 7: "high", 11: "high",
    4: "mid",  5: "mid",  8: "mid",
    1: "low",  2: "low",  3: "low",  9: "low", 10: "low",
}
SEASON_MULT = {"low": 1.00, "mid": 1.25, "high": 1.60}

# Currency conversion (USD base). Mirrors RATES in elevate.js
FX = {
    "USD": 1.0,
    "EUR": 0.92,
    "AUD": 1.52,
    "IDR": 15600.0,
    "GBP": 0.79,
}
# Zero-decimal currencies per Stripe API
ZERO_DECIMAL = {"IDR", "JPY", "KRW", "VND", "CLP"}

DEPOSIT_PCT = 0.30  # 30% deposit charged immediately

# ----------------------------------------------------------------------------
# Models
# ----------------------------------------------------------------------------
class GuestCount(BaseModel):
    adults: int = Field(ge=1, le=20)
    children: int = Field(default=0, ge=0, le=20)
    infants: int = Field(default=0, ge=0, le=20)


class Customer(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=3, max_length=40)
    requests: Optional[str] = Field(default="", max_length=2000)


class CreatePaymentIntentRequest(BaseModel):
    stay: Literal["yume", "nyara", "penthouse"]
    check_in: str  # ISO date YYYY-MM-DD
    check_out: str  # ISO date YYYY-MM-DD
    guests: GuestCount
    currency: str = Field(min_length=3, max_length=3)
    customer: Customer


class CreatePaymentIntentResponse(BaseModel):
    client_secret: str
    payment_intent_id: str
    publishable_key: str
    booking_ref: str
    amount_total_minor: int
    amount_deposit_minor: int
    currency: str
    nights: int


class PaymentStatusResponse(BaseModel):
    status: str
    booking_ref: Optional[str] = None
    amount_received_minor: int = 0
    currency: str = "usd"


# ----------------------------------------------------------------------------
# Pricing helpers
# ----------------------------------------------------------------------------
def _parse_iso(d: str) -> datetime:
    try:
        return datetime.strptime(d, "%Y-%m-%d")
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid date: {d}")


def quote(stay_key: str, check_in: str, check_out: str, currency: str) -> dict:
    """Compute server-side price. Currency in uppercase 3-letter code."""
    currency = (currency or "USD").upper()
    if currency not in FX:
        raise HTTPException(status_code=400, detail=f"Unsupported currency: {currency}")
    if stay_key not in STAYS:
        raise HTTPException(status_code=400, detail=f"Unknown stay: {stay_key}")

    ci = _parse_iso(check_in)
    co = _parse_iso(check_out)
    nights = (co - ci).days
    if nights <= 0:
        raise HTTPException(status_code=400, detail="Check-out must be after check-in")
    if nights > 60:
        raise HTTPException(status_code=400, detail="Maximum 60 nights per booking")

    stay = STAYS[stay_key]
    base_usd = stay["base_usd_per_night"]

    # Per-night seasonal multiplier — iterate day by day from check_in
    from datetime import timedelta
    total_usd = 0.0
    cur = ci
    for _ in range(nights):
        tier = SEASON_BY_MONTH.get(cur.month - 1, "low")
        total_usd += base_usd * SEASON_MULT[tier]
        cur = cur + timedelta(days=1)

    # Convert to chosen currency
    fx = FX[currency]
    total_cur = total_usd * fx
    deposit_cur = total_cur * DEPOSIT_PCT

    # Round sensibly for display, then convert to Stripe minor units
    if currency in ZERO_DECIMAL:
        total_minor = int(round(total_cur))
        deposit_minor = int(round(deposit_cur))
    else:
        total_minor = int(round(total_cur * 100))
        deposit_minor = int(round(deposit_cur * 100))

    return {
        "currency": currency,
        "nights": nights,
        "total_minor": total_minor,
        "deposit_minor": deposit_minor,
        "stay": stay,
    }


# ----------------------------------------------------------------------------
# Router
# ----------------------------------------------------------------------------
router = APIRouter(prefix="/api/booking", tags=["booking"])


async def _get_db(request: Request):
    return request.app.state.db


@router.post("/create-payment-intent", response_model=CreatePaymentIntentResponse)
async def create_payment_intent(payload: CreatePaymentIntentRequest, request: Request):
    db = await _get_db(request)
    publishable = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")

    q = quote(payload.stay, payload.check_in, payload.check_out, payload.currency)
    booking_ref = "NYR-" + uuid.uuid4().hex[:5].upper()

    # Stripe expects lowercase currency
    currency_lc = q["currency"].lower()

    try:
        intent = stripe.PaymentIntent.create(
            amount=q["deposit_minor"],
            currency=currency_lc,
            automatic_payment_methods={"enabled": True},
            receipt_email=payload.customer.email,
            description=f"Nyara Stays · {q['stay']['name']} · {q['nights']} nights · Ref {booking_ref}",
            metadata={
                "booking_ref": booking_ref,
                "stay": payload.stay,
                "check_in": payload.check_in,
                "check_out": payload.check_out,
                "nights": str(q["nights"]),
                "guest_name": payload.customer.name,
                "guest_email": payload.customer.email,
                "guest_phone": payload.customer.phone,
                "adults": str(payload.guests.adults),
                "children": str(payload.guests.children),
                "infants": str(payload.guests.infants),
                "currency": q["currency"],
                "total_minor": str(q["total_minor"]),
                "deposit_minor": str(q["deposit_minor"]),
                "deposit_pct": str(int(DEPOSIT_PCT * 100)),
                "notify_email": "booking@nyarastays.co",
            },
        )
    except stripe.error.StripeError as e:
        logger.exception("Stripe error creating PaymentIntent")
        raise HTTPException(status_code=502, detail=f"Stripe error: {e.user_message or str(e)}")

    # Store transaction record
    doc = {
        "_id": booking_ref,
        "booking_ref": booking_ref,
        "payment_intent_id": intent.id,
        "stay": payload.stay,
        "check_in": payload.check_in,
        "check_out": payload.check_out,
        "nights": q["nights"],
        "guests": payload.guests.model_dump(),
        "customer": payload.customer.model_dump(),
        "currency": q["currency"],
        "amount_total_minor": q["total_minor"],
        "amount_deposit_minor": q["deposit_minor"],
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.payment_transactions.replace_one({"_id": booking_ref}, doc, upsert=True)

    return CreatePaymentIntentResponse(
        client_secret=intent.client_secret,
        payment_intent_id=intent.id,
        publishable_key=publishable,
        booking_ref=booking_ref,
        amount_total_minor=q["total_minor"],
        amount_deposit_minor=q["deposit_minor"],
        currency=q["currency"],
        nights=q["nights"],
    )


@router.get("/payment-status/{payment_intent_id}", response_model=PaymentStatusResponse)
async def payment_status(payment_intent_id: str, request: Request):
    db = await _get_db(request)
    try:
        intent = stripe.PaymentIntent.retrieve(payment_intent_id)
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=404, detail=f"PaymentIntent not found: {e}")

    booking_ref = (intent.metadata or {}).get("booking_ref")

    # Update DB only if not already settled (idempotent)
    if booking_ref:
        existing = await db.payment_transactions.find_one({"_id": booking_ref})
        if existing and existing.get("payment_status") != "succeeded":
            new_status = "succeeded" if intent.status == "succeeded" else (
                "failed" if intent.status in {"canceled", "requires_payment_method"} else "pending"
            )
            await db.payment_transactions.update_one(
                {"_id": booking_ref},
                {"$set": {
                    "payment_status": new_status,
                    "stripe_status": intent.status,
                    "amount_received_minor": intent.amount_received or 0,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }}
            )

    return PaymentStatusResponse(
        status=intent.status,
        booking_ref=booking_ref,
        amount_received_minor=intent.amount_received or 0,
        currency=intent.currency,
    )


@router.get("/publishable-key")
async def get_publishable_key():
    """Public key the frontend uses to mount Stripe.js — safe to expose."""
    return {"publishable_key": os.environ.get("STRIPE_PUBLISHABLE_KEY", "")}
