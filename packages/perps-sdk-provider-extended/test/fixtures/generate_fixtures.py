"""Fixed-input Stark signing fixtures for @lifi/perps-sdk-provider-extended.

Produced with Extended's Python SDK (x10xchange/python_sdk, branch `starknet`), the reference
implementation. The TypeScript signer must reproduce every hash and signature here byte for byte.

Inputs are all fixed: frozen clock, fixed nonces, the public test wallet key from the SDK's own
test suite, and a snapshot of mainnet market configs (inputs/markets.json, raw API format).
Run: python generate_fixtures.py  -> writes extended-stark-fixtures.json next to this file.
"""

import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import List

from eth_account import Account
from eth_account.messages import encode_defunct
from fast_stark_crypto import generate_keypair_from_eth_signature, pedersen_hash
from freezegun import freeze_time

import x10.signing.order_object_settlement as order_settlement_mod
import x10.signing.transfer_object as transfer_mod
import x10.signing.withdrawal_object as withdrawal_mod
from x10.config import MAINNET_CONFIG, TESTNET_CONFIG
from x10.core.stark_account import StarkPerpetualAccount
from x10.models.market import MarketModel
from x10.models.order import (
    CreateOrderRfqModel,
    OrderPriceType,
    OrderSide,
    OrderTpslType,
    OrderTriggerDirection,
    OrderTriggerPriceType,
    OrderType,
    TimeInForce,
)
from x10.signing.onboarding import (
    get_key_derivation_struct_to_sign,
    get_l2_keys_from_l1_account,
    get_onboarding_payload,
    get_sub_account_creation_payload,
    sign_api_request,
)
from x10.signing.order_object import (
    OrderConditionalTriggerParam,
    OrderTpslTriggerParam,
    create_order_object,
)
from x10.signing.transfer_object import create_transfer_object
from x10.signing.withdrawal_object import create_withdrawal_object
from x10.utils.http import WrappedApiResponseModel

HERE = Path(__file__).parent
OUT = HERE / "extended-stark-fixtures.json"
MARKETS_PATH = HERE / "inputs" / "markets.json"

# Public test key from x10xchange/python_sdk tests/fixtures/onboarding.py. Never funded.
TEST_ETH_PRIVATE_KEY = "50c8e358cc974aaaa6e460641e53f78bdc550fd372984aa78ef8fd27c751e6f4"
FROZEN_NOW = "2026-11-18T12:00:00Z"
FROZEN_DT = datetime(2026, 11, 18, 12, 0, 0, tzinfo=timezone.utc)
VAULT = 430876
ACCOUNT_ID = 330870
NONCES = [1, 1473459052, 2**31]


def s(v):
    """JSON-safe: big ints and Decimals as strings, recursively."""
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, (int, Decimal)):
        return str(v)
    if isinstance(v, dict):
        return {k: s(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [s(x) for x in v]
    return v


class HashRecorder:
    """Wraps a fast_stark_crypto hash function to capture its exact inputs and output."""

    def __init__(self, module, name):
        self.module, self.name, self.calls = module, name, []
        self.original = getattr(module, name)

        def wrapper(**kwargs):
            result = self.original(**kwargs)
            self.calls.append({"fn": name, "inputs": s(kwargs), "hash": hex(result)})
            return result

        setattr(module, name, wrapper)

    def take(self):
        calls, self.calls = self.calls, []
        return calls


def load_markets() -> dict:
    text = MARKETS_PATH.read_text()
    markets: List[MarketModel] = WrappedApiResponseModel[List[MarketModel]].model_validate_json(text).data
    return {m.name: m for m in markets}


def sign_message(acct):
    return lambda msg: acct.sign_message(msg).signature.hex()


def main():
    eth = Account.from_key(TEST_ETH_PRIVATE_KEY)
    signer = sign_message(eth)
    order_rec = HashRecorder(order_settlement_mod, "get_order_msg_hash")
    withdrawal_rec = HashRecorder(withdrawal_mod, "get_withdrawal_msg_hash")
    transfer_rec = HashRecorder(transfer_mod, "get_transfer_msg_hash")

    out = {
        "meta": {
            "source": "x10xchange/python_sdk branch starknet (x10-python-trading-starknet 2.6.0+)",
            "frozenNow": FROZEN_NOW,
            "ethPrivateKey": TEST_ETH_PRIVATE_KEY,
            "ethAddress": eth.address,
            "notes": [
                "ethPrivateKey is the public test key from x10xchange/python_sdk tests/fixtures/onboarding.py. It holds no funds and is not a secret.",
                "All big integers are decimal strings unless prefixed 0x.",
                "Stark ECDSA signatures are deterministic: same key + hash -> same (r, s).",
                "Order signed expiry = ceil(expiryEpochMillis/1000 + 14 days) seconds; withdrawal/transfer = ceil(now + 15 days).",
                "Order `id` defaults to the order hash (decimal) when no externalId is given.",
                "Signed fee amount = (takerFee + builderFee) * collateral notional, rounded up; `fee` field = takerFee only.",
                "Buy: collateral negated, amounts rounded up. Sell: synthetic negated, amounts rounded down. Fee always up.",
            ],
        },
        "domains": {
            "mainnet": {"signingDomain": MAINNET_CONFIG.signing.signing_domain,
                        "starknet": vars(MAINNET_CONFIG.signing.starknet_domain)},
            "testnet": {"signingDomain": TESTNET_CONFIG.signing.signing_domain,
                        "starknet": vars(TESTNET_CONFIG.signing.starknet_domain)},
        },
        "keyDerivation": [],
        "onboarding": [],
        "apiRequestSignature": [],
        "orders": [],
        "withdrawals": [],
        "transfers": [],
    }

    # Key derivation: wallet signs EIP-712 AccountCreation; the Stark key pair comes from that signature.
    keys = {}
    for net, cfg in (("mainnet", MAINNET_CONFIG), ("testnet", TESTNET_CONFIG)):
        for account_index in (0, 1):
            msg = get_key_derivation_struct_to_sign(
                account_index=account_index, address=eth.address, signing_domain=cfg.signing.signing_domain
            )
            eth_sig = signer(msg)
            kp = get_l2_keys_from_l1_account(
                account_index=account_index, account_address=eth.address,
                signing_domain=cfg.signing.signing_domain, sign_message=signer,
            )
            keys[(net, account_index)] = kp
            out["keyDerivation"].append({
                "network": net,
                "accountIndex": account_index,
                "typedData": {
                    "domain": {"name": cfg.signing.signing_domain},
                    "primaryType": "AccountCreation",
                    "types": {"AccountCreation": [
                        {"name": "accountIndex", "type": "int8"},
                        {"name": "wallet", "type": "address"},
                        {"name": "tosAccepted", "type": "bool"},
                    ]},
                    "message": {"accountIndex": account_index, "wallet": eth.address, "tosAccepted": True},
                },
                "walletSignature": eth_sig,
                "starkPrivateKey": kp.private_hex,
                "starkPublicKey": kp.public_hex,
            })

    main_kp = keys[("mainnet", 0)]

    # Raw derivation from a signature string. Crafted r values cover leading zero bytes, which the
    # reference drops before hashing (BigUint), and a near-max r.
    real_sig = out["keyDerivation"][0]["walletSignature"].removeprefix("0x")
    tail = real_sig[64:]
    out["keyFromSignature"] = []
    for label, r in (("real", real_sig[:64]),
                     ("r with 1 leading zero byte", "00" + real_sig[2:64]),
                     ("r with 2 leading zero bytes", "0000" + real_sig[4:64]),
                     ("r near max", "ff" * 31 + "fe")):
        sig = "0x" + r + tail
        priv, pub = generate_keypair_from_eth_signature(sig)
        out["keyFromSignature"].append({"label": label, "signature": sig,
                                        "starkPrivateKey": hex(priv), "starkPublicKey": hex(pub)})

    # Onboarding payloads (POST /auth/onboard and /auth/onboard/subaccount).
    host = MAINNET_CONFIG.endpoints.onboarding_url
    for referral in (None, "LIFI"):
        payload = get_onboarding_payload(
            account_address=eth.address, signing_domain=MAINNET_CONFIG.signing.signing_domain,
            key_pair=main_kp, host=host, time=FROZEN_DT, referral_code=referral, sign_message=signer,
        )
        out["onboarding"].append({
            "kind": "onboard",
            "referralCode": referral,
            "starkMessage": hex(pedersen_hash(int(eth.address, 16), main_kp.public)),
            "payload": payload.to_json(),
        })
    sub = get_sub_account_creation_payload(
        account_index=1, l1_address=eth.address, key_pair=keys[("mainnet", 1)],
        description="sub 1", host=host, time=FROZEN_DT,
    )
    out["onboarding"].append({"kind": "subaccount", "payload": sub.to_json()})

    # EIP-191 request signatures (API key creation, subaccount creation).
    with freeze_time(FROZEN_NOW):
        for path in ("/api/v1/user/account/api-key", "/auth/onboard/subaccount"):
            sig = sign_api_request(path, signer)
            out["apiRequestSignature"].append({
                "path": path,
                "message": f"{path}@{sig.time}",
                "time": sig.time,
                "signature": sig.value,
                "check": eth.sign_message(encode_defunct(f"{path}@{sig.time}".encode())).signature.hex(),
            })

    account = StarkPerpetualAccount(
        vault=VAULT, private_key=main_kp.private_hex, public_key=main_kp.public_hex, api_key="unused"
    )
    markets = load_markets()
    domain = MAINNET_CONFIG.signing.starknet_domain
    expire = FROZEN_DT + timedelta(hours=1)

    def order_case(name, **kw):
        market = markets[kw.pop("market")]
        with freeze_time(FROZEN_NOW):
            obj = create_order_object(account=account, market=market, starknet_domain=domain,
                                      expire_time=kw.pop("expire_time", expire), **kw)
        out["orders"].append({
            "name": name,
            "market": market.name,
            "isRfq": market.is_rfq,
            "request": obj.to_api_request_json(exclude_none=True),
            "hashCalls": order_rec.take(),
        })

    btc, recall = "BTC-USD", "RECALL-USD"
    for nonce in NONCES:
        order_case(f"limit buy GTT nonce={nonce}", market=btc, side=OrderSide.BUY,
                   amount_of_synthetic=Decimal("0.0001"), price=Decimal("51295"), nonce=nonce, taker_fee=Decimal("0.00025"))
    order_case("limit sell GTT", market=btc, side=OrderSide.SELL, amount_of_synthetic=Decimal("0.0013"),
               price=Decimal("91234.5"), nonce=NONCES[1], taker_fee=Decimal("0.00025"))
    order_case("limit buy post-only maker fee 0", market=btc, side=OrderSide.BUY, amount_of_synthetic=Decimal("0.0001"),
               price=Decimal("51295"), post_only=True, nonce=NONCES[1], taker_fee=Decimal("0"))
    order_case("limit buy with externalId", market=btc, side=OrderSide.BUY, amount_of_synthetic=Decimal("0.0001"),
               price=Decimal("51295"), nonce=NONCES[1], taker_fee=Decimal("0.00025"),
               order_external_id="jumper-useraction-0001")
    order_case("limit buy builder fee 1bp", market=btc, side=OrderSide.BUY, amount_of_synthetic=Decimal("0.0001"),
               price=Decimal("51295"), nonce=NONCES[1], taker_fee=Decimal("0.00025"),
               builder_fee=Decimal("0.0001"), builder_id=313401)
    order_case("limit sell builder fee 5bp", market=btc, side=OrderSide.SELL, amount_of_synthetic=Decimal("0.0013"),
               price=Decimal("91234.5"), nonce=NONCES[1], taker_fee=Decimal("0.00025"),
               builder_fee=Decimal("0.0005"), builder_id=313401)
    order_case("market buy IOC", market=btc, order_type=OrderType.MARKET, side=OrderSide.BUY,
               amount_of_synthetic=Decimal("0.0001"), price=Decimal("92000.1"), time_in_force=TimeInForce.IOC,
               nonce=NONCES[1], taker_fee=Decimal("0.00025"))
    order_case("market sell IOC reduce-only", market=btc, order_type=OrderType.MARKET, side=OrderSide.SELL,
               amount_of_synthetic=Decimal("0.0001"), price=Decimal("90000"), time_in_force=TimeInForce.IOC,
               reduce_only=True, nonce=NONCES[1], taker_fee=Decimal("0.00025"))
    order_case("modify (cancelId)", market=btc, side=OrderSide.BUY, amount_of_synthetic=Decimal("0.0001"),
               price=Decimal("51300"), nonce=NONCES[1], taker_fee=Decimal("0.00025"),
               order_external_id="jumper-useraction-0002", previous_order_external_id="jumper-useraction-0001")
    order_case("long expiry 90 days", market=btc, side=OrderSide.BUY, amount_of_synthetic=Decimal("0.0001"),
               price=Decimal("51295"), nonce=NONCES[1], taker_fee=Decimal("0.00025"),
               expire_time=FROZEN_DT + timedelta(days=90))
    order_case("expiry with millis (ceil)", market=btc, side=OrderSide.BUY, amount_of_synthetic=Decimal("0.0001"),
               price=Decimal("51295"), nonce=NONCES[1], taker_fee=Decimal("0.00025"),
               expire_time=FROZEN_DT + timedelta(hours=1, milliseconds=1))
    order_case("limit buy with position TP/SL", market=btc, side=OrderSide.BUY, amount_of_synthetic=Decimal("0.0001"),
               price=Decimal("91000"), nonce=NONCES[1], taker_fee=Decimal("0.00025"),
               tp_sl_type=OrderTpslType.POSITION,
               take_profit=OrderTpslTriggerParam(trigger_price=Decimal("100000"), trigger_price_type=OrderTriggerPriceType.MARK,
                                                 price=Decimal("99900"), price_type=OrderPriceType.LIMIT),
               stop_loss=OrderTpslTriggerParam(trigger_price=Decimal("85000"), trigger_price_type=OrderTriggerPriceType.MARK,
                                               price=Decimal("84900"), price_type=OrderPriceType.LIMIT))
    order_case("limit sell with order TP/SL", market=btc, side=OrderSide.SELL, amount_of_synthetic=Decimal("0.0002"),
               price=Decimal("91000"), nonce=NONCES[1], taker_fee=Decimal("0.00025"),
               tp_sl_type=OrderTpslType.ORDER,
               take_profit=OrderTpslTriggerParam(trigger_price=Decimal("85000"), trigger_price_type=OrderTriggerPriceType.LAST,
                                                 price=Decimal("85100"), price_type=OrderPriceType.LIMIT),
               stop_loss=OrderTpslTriggerParam(trigger_price=Decimal("97000"), trigger_price_type=OrderTriggerPriceType.LAST,
                                               price=Decimal("97100"), price_type=OrderPriceType.LIMIT))
    order_case("standalone position TPSL order", market=btc, order_type=OrderType.TPSL, side=OrderSide.SELL,
               amount_of_synthetic=Decimal("0"), price=Decimal("0"), reduce_only=True, nonce=NONCES[1],
               taker_fee=Decimal("0.00025"), tp_sl_type=OrderTpslType.POSITION,
               take_profit=OrderTpslTriggerParam(trigger_price=Decimal("100000"), trigger_price_type=OrderTriggerPriceType.MARK,
                                                 price=Decimal("99900"), price_type=OrderPriceType.LIMIT))
    order_case("conditional stop buy", market=btc, order_type=OrderType.CONDITIONAL, side=OrderSide.BUY,
               amount_of_synthetic=Decimal("0.0001"), price=Decimal("95500"), nonce=NONCES[1], taker_fee=Decimal("0.00025"),
               trigger=OrderConditionalTriggerParam(trigger_price=Decimal("95000"), trigger_price_type=OrderTriggerPriceType.LAST,
                                                    direction=OrderTriggerDirection.UP, execution_price_type=OrderPriceType.LIMIT))
    order_case("RFQ market buy", market=recall, order_type=OrderType.MARKET, side=OrderSide.BUY,
               amount_of_synthetic=Decimal("100"), price=Decimal("0.025359"), time_in_force=TimeInForce.IOC,
               nonce=NONCES[1], taker_fee=Decimal("0.00025"))
    order_case("RFQ market buy with rfq params", market=recall, order_type=OrderType.MARKET, side=OrderSide.BUY,
               amount_of_synthetic=Decimal("100"), price=Decimal("0.025359"), time_in_force=TimeInForce.IOC,
               nonce=NONCES[1], taker_fee=Decimal("0.00025"), rfq=CreateOrderRfqModel(start_price=Decimal("0.0252")))
    order_case("RFQ market sell reduce-only", market=recall, order_type=OrderType.MARKET, side=OrderSide.SELL,
               amount_of_synthetic=Decimal("100"), price=Decimal("0.024958"), time_in_force=TimeInForce.IOC,
               reduce_only=True, nonce=NONCES[1], taker_fee=Decimal("0.00025"))
    order_case("multiplier market 1000BONK buy", market="1000BONK-USD", order_type=OrderType.MARKET, side=OrderSide.BUY,
               amount_of_synthetic=Decimal("1000"), price=Decimal("0.0123"), time_in_force=TimeInForce.IOC,
               nonce=NONCES[1], taker_fee=Decimal("0.00025"))
    order_case("RWA market limit sell", market="IREN_24_5-USD", side=OrderSide.SELL, amount_of_synthetic=Decimal("1.5"),
               price=Decimal("12.34"), nonce=NONCES[1], taker_fee=Decimal("0.0001"))
    order_case("spot buy BTCSPOT", market="BTCSPOT-USD", side=OrderSide.BUY, amount_of_synthetic=Decimal("0.0001"),
               price=Decimal("51295"), nonce=NONCES[1], taker_fee=Decimal("0.00025"))

    # Withdrawals: recipient is the account's bridge_starknet_address for EVM chains.
    usd = markets[btc].collateral_asset
    bridge_recipient = "0x022bc969fe217f91a32afe6dbd0c84bb3d1681377b38f928e5ce70555a2ca7dd"
    for amount, nonce, chain, quote in ((Decimal("19.9"), NONCES[1], "ARB", "6afd8157fc04af19fd7f2b66"),
                                        (Decimal("0.000001"), NONCES[0], "ARB", "6afd8157fc04af19fd7f2b66"),
                                        (Decimal("1234.567891"), NONCES[2], "STRK", None)):
        with freeze_time(FROZEN_NOW):
            obj = create_withdrawal_object(amount=amount, asset=usd, recipient_stark_address=bridge_recipient,
                                           stark_account=account, config=MAINNET_CONFIG, account_id=ACCOUNT_ID,
                                           chain_id=chain, nonce=nonce, quote_id=quote)
        out["withdrawals"].append({"amount": str(amount), "chainId": chain,
                                   "request": obj.to_api_request_json(exclude_none=True),
                                   "hashCalls": withdrawal_rec.take()})

    # Transfers between sub-accounts.
    sub_kp = keys[("mainnet", 1)]
    for amount, nonce in ((Decimal("5"), NONCES[1]), (Decimal("0.123456"), NONCES[2])):
        with freeze_time(FROZEN_NOW):
            obj = create_transfer_object(from_vault=VAULT, to_vault=VAULT + 1, to_l2_public_key=sub_kp.public,
                                         amount=amount, asset=usd, config=MAINNET_CONFIG, stark_account=account,
                                         nonce=nonce)
        out["transfers"].append({"amount": str(amount), "request": obj.to_api_request_json(exclude_none=True),
                                 "hashCalls": transfer_rec.take()})

    OUT.write_text(json.dumps(s(out), indent=2) + "\n")
    print("wrote", OUT)
    print({k: len(v) for k, v in out.items() if isinstance(v, list)})


if __name__ == "__main__":
    main()
