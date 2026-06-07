import time
import requests
import json
import hashlib
from web3 import Web3
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import Artwork, Fragment, Listing, Bid, TransactionHistory

# Initialize Web3 providers
w3_public = Web3(Web3.HTTPProvider("http://127.0.0.1:8547"))
w3_private = Web3(Web3.HTTPProvider("http://127.0.0.1:8546"))

# Labeled accounts
MUSEUM_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
MUSEUM_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

COLLECTOR1_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
COLLECTOR1_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"

COLLECTOR2_ADDRESS = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
COLLECTOR2_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"

DUMMY_PLATFORM_VAULT = "0x9999999999999999999999999999999999999999"

# Contract addresses and ABIs
with open("/home/qtnghiep/COMP3080/contracts/deployed_addresses.json", "r") as f:
    addresses = json.load(f)

with open("/home/qtnghiep/COMP3080/contracts/out/MasterNFT.sol/MasterNFT.json", "r") as f:
    master_abi = json.load(f)["abi"]

with open("/home/qtnghiep/COMP3080/contracts/out/FragmentMarketplace.sol/FragmentMarketplace.json", "r") as f:
    marketplace_abi = json.load(f)["abi"]

contract_master = w3_public.eth.contract(address=addresses["MasterNFT"], abi=master_abi)
contract_marketplace = w3_private.eth.contract(address=addresses["FragmentMarketplace"], abi=marketplace_abi)

print("Contracts connected.")

def configure_platform_vault():
    print("0. Configuring separate Platform Vault address...")
    tx = contract_marketplace.functions.setPlatformVault(DUMMY_PLATFORM_VAULT).build_transaction({
        "from": MUSEUM_ADDRESS,
        "nonce": w3_private.eth.get_transaction_count(MUSEUM_ADDRESS),
        "gas": 100000,
        "gasPrice": w3_private.eth.gas_price
    })
    signed = w3_private.eth.account.sign_transaction(tx, private_key=MUSEUM_KEY)
    tx_hash = w3_private.eth.send_raw_transaction(signed.raw_transaction)
    w3_private.eth.wait_for_transaction_receipt(tx_hash)
    print("Platform Vault configured to:", contract_marketplace.functions.platformVault().call())

def create_artwork_post():
    print("1. Creating artwork record via FastAPI...")
    files = {"file": ("test.png", b"test_artwork_data_content")}
    data = {
        "title": "Mona Lisa",
        "artist": "Leonardo da Vinci",
        "creation_year": 1503,
        "museum_address": MUSEUM_ADDRESS
    }
    res = requests.post("http://127.0.0.1:8000/api/artworks", data=data, files=files)
    assert res.status_code == 200
    res_json = res.json()
    print("FastAPI artwork created:", res_json)
    return res_json

def mint_master_nft(master_ipfs_hash):
    print("2. Minting Master NFT on Public Chain (8547)...")
    tx = contract_master.functions.mintMasterNFT(master_ipfs_hash).build_transaction({
        "from": MUSEUM_ADDRESS,
        "nonce": w3_public.eth.get_transaction_count(MUSEUM_ADDRESS),
        "gas": 3000000,
        "gasPrice": w3_public.eth.gas_price
    })
    signed = w3_public.eth.account.sign_transaction(tx, private_key=MUSEUM_KEY)
    tx_hash = w3_public.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3_public.eth.wait_for_transaction_receipt(tx_hash)
    print("Master NFT minted in tx:", receipt.transactionHash.hex())
    return receipt

def verify_reservation_system(artwork_id):
    print("3. Verifying 25% Stratified Rarity Reservation System...")
    # Wait for indexer to detect event and initialize fragments
    for _ in range(40):
        db = SessionLocal()
        try:
            fragments = db.query(Fragment).filter(Fragment.artwork_id == artwork_id).all()
            if len(fragments) == 100:
                break
        finally:
            db.close()
        time.sleep(0.5)
    
    db = SessionLocal()
    try:
        fragments = db.query(Fragment).filter(Fragment.artwork_id == artwork_id).all()
        print(f"Total fragments initialized in SQLite: {len(fragments)}")
        assert len(fragments) == 100
        
        # Check rarity distributions
        legendary = [f for f in fragments if f.rarity_score >= 85]
        rare = [f for f in fragments if 50 <= f.rarity_score < 85]
        common = [f for f in fragments if f.rarity_score < 50]
        
        print(f"Legendary pool: {len(legendary)}, Rare pool: {len(rare)}, Common pool: {len(common)}")
        
        reserved = [f for f in fragments if f.is_reserved]
        print(f"Total reserved fragments: {len(reserved)}")
        assert len(reserved) == 25
        
        reserved_leg = [f for f in reserved if f.rarity_score >= 85]
        reserved_rare = [f for f in reserved if 50 <= f.rarity_score < 85]
        reserved_com = [f for f in reserved if f.rarity_score < 50]
        
        print(f"Reserved Pools -> Legendary: {len(reserved_leg)}, Rare: {len(reserved_rare)}, Common: {len(reserved_com)}")
        assert len(reserved_leg) == 1
        assert len(reserved_rare) == 12
        assert len(reserved_com) == 12
        print("Stratified Rarity Reservation Verified!")

        # Find reserved vs unreserved token IDs
        reserved_id = int(reserved[0].token_id)
        unreserved_f = [f for f in fragments if not f.is_reserved][0]
        unreserved_id = int(unreserved_f.token_id)
        
        return reserved_id, unreserved_id
    finally:
        db.close()

def verify_on_chain_reservation_guards(reserved_id, unreserved_id):
    print("4. Verifying on-chain reservation guards...")
    
    # Try to list reserved fragment from museum wallet -> should revert (receipt status should be 0)
    tx = contract_marketplace.functions.listFragment(reserved_id, Web3.to_wei(1, "ether")).build_transaction({
        "from": MUSEUM_ADDRESS,
        "nonce": w3_private.eth.get_transaction_count(MUSEUM_ADDRESS),
        "gas": 300000,
        "gasPrice": w3_private.eth.gas_price
    })
    signed = w3_private.eth.account.sign_transaction(tx, private_key=MUSEUM_KEY)
    tx_hash = w3_private.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3_private.eth.wait_for_transaction_receipt(tx_hash)
    assert receipt.status == 0, "Listing reserved fragment succeeded but should have reverted!"
    print("Success: Listing reserved fragment reverted on-chain (receipt status = 0).")

    # Try to bid on reserved fragment -> should revert
    tx = contract_marketplace.functions.placeBid(reserved_id).build_transaction({
        "from": COLLECTOR1_ADDRESS,
        "nonce": w3_private.eth.get_transaction_count(COLLECTOR1_ADDRESS),
        "value": Web3.to_wei(1.05, "ether"),
        "gas": 300000,
        "gasPrice": w3_private.eth.gas_price
    })
    signed = w3_private.eth.account.sign_transaction(tx, private_key=COLLECTOR1_KEY)
    tx_hash = w3_private.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3_private.eth.wait_for_transaction_receipt(tx_hash)
    assert receipt.status == 0, "Bidding on reserved fragment succeeded but should have reverted!"
    print("Success: Bidding on reserved fragment reverted on-chain (receipt status = 0).")

def verify_primary_listing_buy(unreserved_id):
    print("5. Verifying Flow 1: Primary Listing Purchase...")
    # Museum lists unreserved fragment at 1 ETH
    price_wei = Web3.to_wei(1, "ether")
    tx = contract_marketplace.functions.listFragment(unreserved_id, price_wei).build_transaction({
        "from": MUSEUM_ADDRESS,
        "nonce": w3_private.eth.get_transaction_count(MUSEUM_ADDRESS),
        "gas": 300000,
        "gasPrice": w3_private.eth.gas_price
    })
    signed = w3_private.eth.account.sign_transaction(tx, private_key=MUSEUM_KEY)
    tx_hash = w3_private.eth.send_raw_transaction(signed.raw_transaction)
    w3_private.eth.wait_for_transaction_receipt(tx_hash)

    # Measure museum balance after listing gas has been paid
    init_museum_bal = w3_private.eth.get_balance(MUSEUM_ADDRESS)
    init_platform_bal = w3_private.eth.get_balance(DUMMY_PLATFORM_VAULT)

    # Collector 1 buys it with 1.05 ETH (1 ETH + 5% platform fee)
    tx = contract_marketplace.functions.buyFragment(unreserved_id).build_transaction({
        "from": COLLECTOR1_ADDRESS,
        "nonce": w3_private.eth.get_transaction_count(COLLECTOR1_ADDRESS),
        "value": Web3.to_wei(1.05, "ether"),
        "gas": 500000,
        "gasPrice": w3_private.eth.gas_price
    })
    signed = w3_private.eth.account.sign_transaction(tx, private_key=COLLECTOR1_KEY)
    tx_hash = w3_private.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3_private.eth.wait_for_transaction_receipt(tx_hash)
    assert receipt.status == 1, "Buy primary fragment reverted!"

    # Assert balances
    balance_diff = w3_private.eth.get_balance(MUSEUM_ADDRESS) - init_museum_bal
    platform_diff = w3_private.eth.get_balance(DUMMY_PLATFORM_VAULT) - init_platform_bal
    print(f"DEBUG (Primary Buy): balance_diff={balance_diff}, platform_diff={platform_diff}")
    assert balance_diff == price_wei
    # platform cut is 0.05 ETH
    assert platform_diff == Web3.to_wei(0.05, "ether")
    print("Success: Primary Listing Buy executed and splits verified!")

    # Verify Database entry
    tx_history = None
    tx_price, tx_platform_fee, tx_museum_royalty = 0, 0, 0
    for _ in range(30):
        db = SessionLocal()
        try:
            fragment = db.query(Fragment).filter(Fragment.token_id == str(unreserved_id)).first()
            if fragment:
                tx_history = db.query(TransactionHistory).filter(TransactionHistory.fragment_id == fragment.id).order_by(TransactionHistory.timestamp.desc()).first()
                if tx_history is not None:
                    tx_price = int(tx_history.price)
                    tx_platform_fee = int(tx_history.platform_fee) if tx_history.platform_fee else 0
                    tx_museum_royalty = int(tx_history.museum_royalty) if tx_history.museum_royalty else 0
                    break
        finally:
            db.close()
        time.sleep(0.5)
        
    assert tx_history is not None, f"Transaction history record not found for fragment {unreserved_id}"
    assert tx_price == price_wei
    assert tx_platform_fee == Web3.to_wei(0.05, "ether")
    assert tx_museum_royalty == 0
    print("Success: Primary Listing database telemetry values verified!")

def verify_secondary_listing_buy(unreserved_id):
    print("6. Verifying Flow 3: Secondary Listing Purchase...")
    # Collector 1 lists fragment at 2 ETH
    price_wei = Web3.to_wei(2, "ether")
    tx = contract_marketplace.functions.listFragment(unreserved_id, price_wei).build_transaction({
        "from": COLLECTOR1_ADDRESS,
        "nonce": w3_private.eth.get_transaction_count(COLLECTOR1_ADDRESS),
        "gas": 300000,
        "gasPrice": w3_private.eth.gas_price
    })
    signed = w3_private.eth.account.sign_transaction(tx, private_key=COLLECTOR1_KEY)
    tx_hash = w3_private.eth.send_raw_transaction(signed.raw_transaction)
    w3_private.eth.wait_for_transaction_receipt(tx_hash)

    # Measure balances
    init_seller_bal = w3_private.eth.get_balance(COLLECTOR1_ADDRESS)
    init_museum_bal = w3_private.eth.get_balance(MUSEUM_ADDRESS)
    init_platform_bal = w3_private.eth.get_balance(DUMMY_PLATFORM_VAULT)

    # Collector 2 buys it with 2.1 ETH (2 ETH + 5% platform fee)
    tx = contract_marketplace.functions.buyFragment(unreserved_id).build_transaction({
        "from": COLLECTOR2_ADDRESS,
        "nonce": w3_private.eth.get_transaction_count(COLLECTOR2_ADDRESS),
        "value": Web3.to_wei(2.10, "ether"),
        "gas": 500000,
        "gasPrice": w3_private.eth.gas_price
    })
    signed = w3_private.eth.account.sign_transaction(tx, private_key=COLLECTOR2_KEY)
    tx_hash = w3_private.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3_private.eth.wait_for_transaction_receipt(tx_hash)
    assert receipt.status == 1, "Buy secondary fragment reverted!"

    # Assert balances
    # Seller gets 93% of 2 ETH = 1.86 ETH
    assert w3_private.eth.get_balance(COLLECTOR1_ADDRESS) - init_seller_bal == Web3.to_wei(1.86, "ether")
    # Museum gets 7% of 2 ETH = 0.14 ETH
    assert w3_private.eth.get_balance(MUSEUM_ADDRESS) - init_museum_bal == Web3.to_wei(0.14, "ether")
    # Platform gets 5% of 2 ETH = 0.10 ETH
    assert w3_private.eth.get_balance(DUMMY_PLATFORM_VAULT) - init_platform_bal == Web3.to_wei(0.10, "ether")
    print("Success: Secondary Listing Buy executed and splits verified!")

    # Verify Database entry
    tx_history = None
    tx_price, tx_platform_fee, tx_museum_royalty = 0, 0, 0
    tx_buyer = ""
    for _ in range(30):
        db = SessionLocal()
        try:
            fragment = db.query(Fragment).filter(Fragment.token_id == str(unreserved_id)).first()
            if fragment:
                tx_history = db.query(TransactionHistory).filter(
                    TransactionHistory.fragment_id == fragment.id
                ).order_by(TransactionHistory.timestamp.desc()).first()
                if tx_history is not None and int(tx_history.price) == price_wei:
                    tx_price = int(tx_history.price)
                    tx_platform_fee = int(tx_history.platform_fee) if tx_history.platform_fee else 0
                    tx_museum_royalty = int(tx_history.museum_royalty) if tx_history.museum_royalty else 0
                    tx_buyer = tx_history.buyer
                    break
                else:
                    tx_history = None
        finally:
            db.close()
        time.sleep(0.5)
        
    assert tx_history is not None, f"Transaction history record not found for fragment {unreserved_id} secondary buy"
    assert tx_buyer.lower() == COLLECTOR2_ADDRESS.lower()
    assert tx_price == price_wei
    assert tx_platform_fee == Web3.to_wei(0.10, "ether")
    assert tx_museum_royalty == Web3.to_wei(0.14, "ether")
    print("Success: Secondary Listing database telemetry values verified!")

def verify_primary_otc_bid():
    print("7. Verifying Flow 2: Primary OTC Bid...")
    # Find an unreserved fragment owned by the museum
    db = SessionLocal()
    try:
        unreserved_museum_fragment = db.query(Fragment).filter(
            Fragment.is_reserved == False,
            Fragment.owner_address.in_([MUSEUM_ADDRESS, MUSEUM_ADDRESS.lower()])
        ).first()
        token_id = int(unreserved_museum_fragment.token_id)
    finally:
        db.close()

    # Collector 1 places bid of 1.5 ETH (Primary bid -> msg.value = 1.5 ETH, no buyer fee)
    tx = contract_marketplace.functions.placeBid(token_id).build_transaction({
        "from": COLLECTOR1_ADDRESS,
        "nonce": w3_private.eth.get_transaction_count(COLLECTOR1_ADDRESS),
        "value": Web3.to_wei(1.5, "ether"),
        "gas": 300000,
        "gasPrice": w3_private.eth.gas_price
    })
    signed = w3_private.eth.account.sign_transaction(tx, private_key=COLLECTOR1_KEY)
    tx_hash = w3_private.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3_private.eth.wait_for_transaction_receipt(tx_hash)
    assert receipt.status == 1, "Place bid reverted!"

    # Accept bid by Museum
    init_museum_bal = w3_private.eth.get_balance(MUSEUM_ADDRESS)
    init_platform_bal = w3_private.eth.get_balance(DUMMY_PLATFORM_VAULT)

    # Get bid ID from database
    bid_id = None
    for _ in range(30):
        db = SessionLocal()
        try:
            bids = db.query(Bid).join(Fragment).filter(
                Fragment.token_id == str(token_id),
                Bid.status == "ACTIVE"
            ).all()
            if bids:
                bid_id = int(bids[0].id)
                break
        finally:
            db.close()
        time.sleep(0.5)
    assert bid_id is not None, f"Bid record not found for token {token_id}"

    tx = contract_marketplace.functions.acceptBid(bid_id).build_transaction({
        "from": MUSEUM_ADDRESS,
        "nonce": w3_private.eth.get_transaction_count(MUSEUM_ADDRESS),
        "gas": 500000,
        "gasPrice": w3_private.eth.gas_price
    })
    signed = w3_private.eth.account.sign_transaction(tx, private_key=MUSEUM_KEY)
    tx_hash = w3_private.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3_private.eth.wait_for_transaction_receipt(tx_hash)
    assert receipt.status == 1, "Accept bid reverted!"

    # Assert balances with gas tolerance
    museum_gain = w3_private.eth.get_balance(MUSEUM_ADDRESS) - init_museum_bal
    expected_museum_gain = Web3.to_wei(1.425, "ether")
    # Museum paid gas, so actual gain will be slightly less than expected, but within 0.01 ETH
    assert expected_museum_gain - museum_gain < Web3.to_wei(0.01, "ether")
    assert expected_museum_gain >= museum_gain

    assert w3_private.eth.get_balance(DUMMY_PLATFORM_VAULT) - init_platform_bal == Web3.to_wei(0.075, "ether")
    print("Success: Primary OTC Bid accepted and splits verified!")

    # Verify Database entry for accepted bid
    tx_history = None
    tx_price, tx_platform_fee, tx_museum_royalty = 0, 0, 0
    tx_buyer = ""
    for _ in range(30):
        db = SessionLocal()
        try:
            fragment = db.query(Fragment).filter(Fragment.token_id == str(token_id)).first()
            if fragment:
                tx_history = db.query(TransactionHistory).filter(
                    TransactionHistory.fragment_id == fragment.id
                ).order_by(TransactionHistory.timestamp.desc()).first()
                if tx_history is not None and int(tx_history.price) == Web3.to_wei(1.5, "ether"):
                    tx_price = int(tx_history.price)
                    tx_platform_fee = int(tx_history.platform_fee) if tx_history.platform_fee else 0
                    tx_museum_royalty = int(tx_history.museum_royalty) if tx_history.museum_royalty else 0
                    tx_buyer = tx_history.buyer
                    break
                else:
                    tx_history = None
        finally:
            db.close()
        time.sleep(0.5)
        
    assert tx_history is not None, f"Transaction history record not found for fragment {token_id} accepted bid"
    assert tx_buyer.lower() == COLLECTOR1_ADDRESS.lower()
    assert tx_price == Web3.to_wei(1.5, "ether")
    assert tx_platform_fee == Web3.to_wei(0.075, "ether")
    assert tx_museum_royalty == 0
    print("Success: Primary OTC Bid database telemetry values verified!")

def verify_secondary_otc_bid(token_id):
    print("7b. Verifying Flow 3: Secondary OTC Bid...")
    # At this point, token_id (unreserved_id) is owned by COLLECTOR2_ADDRESS.
    # COLLECTOR1_ADDRESS places a bid of 1 ETH (Secondary bid -> msg.value = B * 1.05 = 1.05 ETH)
    bid_price_wei = Web3.to_wei(1, "ether")
    value_to_send = Web3.to_wei(1.05, "ether")
    
    tx = contract_marketplace.functions.placeBid(token_id).build_transaction({
        "from": COLLECTOR1_ADDRESS,
        "nonce": w3_private.eth.get_transaction_count(COLLECTOR1_ADDRESS),
        "value": value_to_send,
        "gas": 300000,
        "gasPrice": w3_private.eth.gas_price
    })
    signed = w3_private.eth.account.sign_transaction(tx, private_key=COLLECTOR1_KEY)
    tx_hash = w3_private.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3_private.eth.wait_for_transaction_receipt(tx_hash)
    assert receipt.status == 1, "Place secondary bid reverted!"

    # Get bid ID from database
    bid_id = None
    for _ in range(30):
        db = SessionLocal()
        try:
            bids = db.query(Bid).join(Fragment).filter(
                Fragment.token_id == str(token_id),
                Bid.status == "ACTIVE"
            ).all()
            if bids:
                bid_id = int(bids[0].id)
                break
        finally:
            db.close()
        time.sleep(0.5)
    assert bid_id is not None, f"Bid record not found for token {token_id}"

    # Accept bid by Collector 2
    init_seller_bal = w3_private.eth.get_balance(COLLECTOR2_ADDRESS)
    init_museum_bal = w3_private.eth.get_balance(MUSEUM_ADDRESS)
    init_platform_bal = w3_private.eth.get_balance(DUMMY_PLATFORM_VAULT)

    tx = contract_marketplace.functions.acceptBid(bid_id).build_transaction({
        "from": COLLECTOR2_ADDRESS,
        "nonce": w3_private.eth.get_transaction_count(COLLECTOR2_ADDRESS),
        "gas": 500000,
        "gasPrice": w3_private.eth.gas_price
    })
    signed = w3_private.eth.account.sign_transaction(tx, private_key=COLLECTOR2_KEY)
    tx_hash = w3_private.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3_private.eth.wait_for_transaction_receipt(tx_hash)
    assert receipt.status == 1, "Accept secondary bid reverted!"

    # Assert balances with gas tolerance
    seller_gain = w3_private.eth.get_balance(COLLECTOR2_ADDRESS) - init_seller_bal
    expected_seller_gain = Web3.to_wei(0.93, "ether") # 93% of 1 ETH
    # Seller paid gas, so actual gain will be slightly less than expected, but within 0.01 ETH
    assert expected_seller_gain - seller_gain < Web3.to_wei(0.01, "ether")
    assert expected_seller_gain >= seller_gain

    # Museum gets 7% creator royalty = 0.07 ETH
    assert w3_private.eth.get_balance(MUSEUM_ADDRESS) - init_museum_bal == Web3.to_wei(0.07, "ether")
    # Platform gets 5% platform fee = 0.05 ETH
    assert w3_private.eth.get_balance(DUMMY_PLATFORM_VAULT) - init_platform_bal == Web3.to_wei(0.05, "ether")
    print("Success: Secondary OTC Bid accepted and splits verified!")

    # Verify Database entry for accepted bid
    tx_history = None
    tx_price, tx_platform_fee, tx_museum_royalty = 0, 0, 0
    tx_buyer = ""
    for _ in range(30):
        db = SessionLocal()
        try:
            fragment = db.query(Fragment).filter(Fragment.token_id == str(token_id)).first()
            if fragment:
                tx_history = db.query(TransactionHistory).filter(
                    TransactionHistory.fragment_id == fragment.id
                ).order_by(TransactionHistory.timestamp.desc()).first()
                if tx_history is not None and int(tx_history.price) == bid_price_wei:
                    tx_price = int(tx_history.price)
                    tx_platform_fee = int(tx_history.platform_fee) if tx_history.platform_fee else 0
                    tx_museum_royalty = int(tx_history.museum_royalty) if tx_history.museum_royalty else 0
                    tx_buyer = tx_history.buyer
                    break
                else:
                    tx_history = None
        finally:
            db.close()
        time.sleep(0.5)
        
    assert tx_history is not None, f"Transaction history record not found for fragment {token_id} accepted secondary bid"
    assert tx_buyer.lower() == COLLECTOR1_ADDRESS.lower()
    assert tx_price == bid_price_wei
    assert tx_platform_fee == Web3.to_wei(0.05, "ether")
    assert tx_museum_royalty == Web3.to_wei(0.07, "ether")
    print("Success: Secondary OTC Bid database telemetry values verified!")

def verify_analytics_endpoints():
    print("8. Verifying FastAPI Server-Side Analytics Endpoints...")
    
    # Place an active bid from COLLECTOR1 so we have non-zero active collateral
    # We find another unreserved fragment owned by the museum
    db = SessionLocal()
    try:
        another_fragment = db.query(Fragment).filter(
            Fragment.is_reserved == False,
            Fragment.owner_address.in_([MUSEUM_ADDRESS, MUSEUM_ADDRESS.lower()])
        ).offset(1).first()
        token_id = int(another_fragment.token_id)
    finally:
        db.close()

    print(f"Placing active bid on token {token_id} for collateral verification...")
    tx = contract_marketplace.functions.placeBid(token_id).build_transaction({
        "from": COLLECTOR1_ADDRESS,
        "nonce": w3_private.eth.get_transaction_count(COLLECTOR1_ADDRESS),
        "value": Web3.to_wei(0.5, "ether"),
        "gas": 300000,
        "gasPrice": w3_private.eth.gas_price
    })
    signed = w3_private.eth.account.sign_transaction(tx, private_key=COLLECTOR1_KEY)
    tx_hash = w3_private.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3_private.eth.wait_for_transaction_receipt(tx_hash)
    assert receipt.status == 1, "Place collateral bid reverted!"
    
    # Wait for indexer to catch the new bid
    time.sleep(2.0)

    # 1. Verify Museum Analytics
    res_museum = requests.get(f"http://127.0.0.1:8000/api/analytics/museum/{MUSEUM_ADDRESS}")
    assert res_museum.status_code == 200
    museum_data = res_museum.json()
    print("Museum Analytics Response:", museum_data)
    
    # total_endowments_raised should be 1.0 ETH (primary buy) + 1.5 ETH (accepted bid) = 2.5 ETH (in wei)
    assert museum_data["total_endowments_raised"] == str(Web3.to_wei(2.5, "ether"))
    # accrued_royalties should be 0.14 ETH (7% of 2.0 ETH secondary buy)
    assert museum_data["accrued_royalties"] == str(Web3.to_wei(0.14, "ether"))
    # total_trades should be 3 (primary buy, secondary buy, accepted bid)
    assert museum_data["total_trades"] == 3
    # trading_volume should be 1.0 + 2.0 + 1.5 = 4.5 ETH
    assert museum_data["trading_volume"] == str(Web3.to_wei(4.5, "ether"))
    # Check that transactions list is not empty
    assert len(museum_data["transactions"]) == 3
    
    # 2. Verify Collector Analytics (COLLECTOR 1)
    res_collector = requests.get(f"http://127.0.0.1:8000/api/analytics/collector/{COLLECTOR1_ADDRESS}")
    assert res_collector.status_code == 200
    collector_data = res_collector.json()
    print("Collector 1 Analytics Response:", collector_data)
    
    # net_realized_profit should be 0.81 ETH (in wei)
    assert collector_data["net_realized_profit"] == str(Web3.to_wei(0.81, "ether"))
    # active_collateral should be 0.5 ETH (in wei)
    assert collector_data["active_collateral"] == str(Web3.to_wei(0.5, "ether"))
    
    print("Analytics Endpoints Verified Successfully!")

if __name__ == "__main__":
    configure_platform_vault()
    artwork_data = create_artwork_post()
    mint_master_nft(artwork_data["master_ipfs_hash"])
    reserved_id, unreserved_id = verify_reservation_system(artwork_data["id"])
    verify_on_chain_reservation_guards(reserved_id, unreserved_id)
    verify_primary_listing_buy(unreserved_id)
    verify_secondary_listing_buy(unreserved_id)
    verify_primary_otc_bid()
    verify_analytics_endpoints()
    verify_secondary_otc_bid(unreserved_id)
    print("\nALL SYSTEM INTEGRATION TESTS PASSED SUCCESSFULY!")
