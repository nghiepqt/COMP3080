import os
from pathlib import Path
import json
import time
import hashlib
import asyncio
import threading
import uuid
from typing import List, Dict, Any
from web3 import Web3
from sqlalchemy.orm import Session
from .database import SessionLocal, engine, Base
from .models import Artwork, Fragment, Listing, Bid, TransactionHistory
from .rarity import fractionalize_artwork

# Create SQLite tables if they do not exist yet
Base.metadata.create_all(bind=engine)

# Event broker for SSE notifications
class EventBroker:
    def __init__(self):
        self.listeners: List[asyncio.Queue] = []
        self.loop = None

    def subscribe(self) -> asyncio.Queue:
        q = asyncio.Queue()
        self.listeners.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        if q in self.listeners:
            self.listeners.remove(q)

    def broadcast(self, data: dict):
        # We broadcast data to all active asyncio queues.
        # If the main event loop reference is available, we call_soon_threadsafe.
        # Otherwise, fall back to checking if there is a running loop in the current thread.
        target_loop = self.loop
        if not target_loop:
            try:
                target_loop = asyncio.get_running_loop()
            except RuntimeError:
                pass

        if target_loop and target_loop.is_running():
            for q in self.listeners:
                target_loop.call_soon_threadsafe(q.put_nowait, data)
        else:
            # If no running loop in the caller's thread, we can still run it safely if we have an active loop reference
            pass

event_broker = EventBroker()

# Default configurations for local dev nodes
RPC_PUBLIC = "http://127.0.0.1:8547"
RPC_PRIVATE = "http://127.0.0.1:8546"

# Funded museum account from Anvil (Account #0)
MUSEUM_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
MUSEUM_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Paths to Foundry output artifacts (resolved relative to this file's location)
_BACKEND_APP_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _BACKEND_APP_DIR.parent.parent
ABI_MASTER_PATH = str(_PROJECT_ROOT / "contracts" / "out" / "MasterNFT.sol" / "MasterNFT.json")
ABI_FRAGMENT_PATH = str(_PROJECT_ROOT / "contracts" / "out" / "FragmentMarketplace.sol" / "FragmentMarketplace.json")
DEPLOYED_ADDRESSES_PATH = str(_PROJECT_ROOT / "contracts" / "deployed_addresses.json")

def load_contract_abi(path: str) -> List[Any]:
    try:
        with open(path, "r") as f:
            artifact = json.load(f)
            return artifact.get("abi", [])
    except Exception as e:
        print(f"Error loading ABI from {path}: {e}")
        return []

def load_deployed_addresses() -> Dict[str, str]:
    if os.path.exists(DEPLOYED_ADDRESSES_PATH):
        try:
            with open(DEPLOYED_ADDRESSES_PATH, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading deployed addresses: {e}")
    return {}

# Background thread runner for indexer
class IndexerDaemon:
    def __init__(self):
        self.w3_public = Web3(Web3.HTTPProvider(RPC_PUBLIC))
        self.w3_private = Web3(Web3.HTTPProvider(RPC_PRIVATE))
        self.running = False
        self.thread = None

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self.run_loop, daemon=True)
        self.thread.start()
        print("Indexer daemon thread started.")

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join()

    def run_loop(self):
        # Last processed blocks
        last_block_public = 0
        last_block_private = 0

        # Wait until RPCs are connected and contracts are deployed
        print("Waiting for local blockchain networks and contract deployment...")
        
        master_abi = []
        fragment_abi = []
        
        while self.running:
            if not self.w3_public.is_connected():
                time.sleep(2)
                continue
            if not self.w3_private.is_connected():
                time.sleep(2)
                continue
                
            addresses = load_deployed_addresses()
            master_address = addresses.get("MasterNFT")
            marketplace_address = addresses.get("FragmentMarketplace")
            
            if not master_address or not marketplace_address:
                time.sleep(2)
                continue
            
            if not master_abi:
                master_abi = load_contract_abi(ABI_MASTER_PATH)
            if not fragment_abi:
                fragment_abi = load_contract_abi(ABI_FRAGMENT_PATH)
                
            if not master_abi or not fragment_abi:
                time.sleep(2)
                continue
                
            break
            
        if not self.running:
            return

        addresses = load_deployed_addresses()
        master_address = Web3.to_checksum_address(addresses["MasterNFT"])
        marketplace_address = Web3.to_checksum_address(addresses["FragmentMarketplace"])

        print(f"Connected. MasterNFT: {master_address}, FragmentMarketplace: {marketplace_address}")

        contract_master = self.w3_public.eth.contract(address=master_address, abi=master_abi)
        contract_marketplace = self.w3_private.eth.contract(address=marketplace_address, abi=fragment_abi)

        # Set starting blocks to 0 to scan entire history on startup
        last_block_public = 0
        last_block_private = 0

        while self.running:
            try:
                # 1. Poll Public Chain
                latest_public = self.w3_public.eth.block_number
                if latest_public < last_block_public:
                    print("[INDEXER] Public chain reset detected. Resetting block pointer to 0.")
                    last_block_public = 0
                if latest_public > last_block_public:
                    self.process_public_events(contract_master, last_block_public + 1, latest_public)
                    last_block_public = latest_public

                # 2. Poll Private Chain
                latest_private = self.w3_private.eth.block_number
                if latest_private < last_block_private:
                    print("[INDEXER] Private chain reset detected. Resetting block pointer to 0.")
                    last_block_private = 0
                if latest_private > last_block_private:
                    self.process_private_events(contract_marketplace, last_block_private + 1, latest_private)
                    last_block_private = latest_private

            except Exception as e:
                print(f"Error during polling iteration: {e}")
                
            time.sleep(1.5)

    def process_public_events(self, contract, from_block: int, to_block: int):
        # Fetch MasterMinted events
        try:
            events = contract.events.MasterMinted().get_logs(from_block=from_block, to_block=to_block)
            for event in events:
                self.handle_master_minted(event)
        except Exception as e:
            print(f"Error fetching MasterMinted events: {e}")

    def process_private_events(self, contract, from_block: int, to_block: int):
        # Fetch events for marketplace
        event_types = [
            contract.events.FragmentInitialized,
            contract.events.FragmentListed,
            contract.events.ListingCancelled,
            contract.events.FragmentSold,
            contract.events.BidPlaced,
            contract.events.BidCancelled,
            contract.events.BidAccepted
        ]
        
        for et in event_types:
            try:
                events = et().get_logs(from_block=from_block, to_block=to_block)
                for event in events:
                    name = event.event
                    if name == "FragmentInitialized":
                        self.handle_fragment_initialized(event)
                    elif name == "FragmentListed":
                        self.handle_fragment_listed(event)
                    elif name == "ListingCancelled":
                        self.handle_listing_cancelled(event)
                    elif name == "FragmentSold":
                        self.handle_fragment_sold(event)
                    elif name == "BidPlaced":
                        self.handle_bid_placed(event)
                    elif name == "BidCancelled":
                        self.handle_bid_cancelled(event)
                    elif name == "BidAccepted":
                        self.handle_bid_accepted(event)
            except Exception as e:
                print(f"Error fetching events: {e}")

    def handle_master_minted(self, event):
        token_id = event.args.tokenId
        token_uri = event.args.tokenURI
        museum = event.args.museum
        tx_hash = event.transactionHash.hex()

        print(f"[INDEXER] MasterMinted event: Token {token_id}, URI: {token_uri}, Museum: {museum}")

        db: Session = SessionLocal()
        try:
            # Find artwork in SQLite that matches this tokenURI
            # (token_uri should match master_ipfs_hash)
            artwork = db.query(Artwork).filter(Artwork.master_ipfs_hash == token_uri, Artwork.master_token_id == None).first()
            if not artwork:
                # If artwork record doesn't exist yet, we create a fallback artwork
                # (normally the frontend creates it first via POST /api/artworks)
                artwork = Artwork(
                    id=str(uuid.uuid4()),
                    title="Untitled Heritage Artifact",
                    artist="Unknown Artist",
                    creation_year=2026,
                    master_ipfs_hash=token_uri,
                    museum_address=museum
                )
                db.add(artwork)
                db.flush()

            artwork.master_token_id = str(token_id)
            artwork.public_chain_tx_hash = tx_hash
            db.commit()

            # Now, trigger Fractionalization & Rarity Processing!
            print(f"[INDEXER] Fractionalizing artwork {artwork.id}...")
            fragments_data = fractionalize_artwork(artwork.id, token_uri, museum)

            # Call initializeFragments on the Private Chain FragmentMarketplace contract!
            # This triggers batch minting of 100 separate ERC-721 tokens on the trading layer.
            init_success = self.trigger_private_fragments_initialization(artwork.id, fragments_data)
            
            if init_success:
                # Save the 100 fragments into SQLite
                for f in fragments_data:
                    # Check if fragment already exists
                    existing = db.query(Fragment).filter(Fragment.id == f["id"]).first()
                    if not existing:
                        db.add(Fragment(**f))
                artwork.status = "ACTIVE"
                db.commit()

                # Broadcast SSE notification that fractionalization is ready locally
                event_broker.broadcast({
                    "type": "FRACTIONALIZED",
                    "artwork_id": artwork.id,
                    "title": artwork.title,
                    "total_fragments": len(fragments_data)
                })
            else:
                print(f"[INDEXER] ERROR: On-chain initialization failed for artwork {artwork.id}. Database not updated.")
                artwork.status = "FAILED"
                db.commit()
                event_broker.broadcast({
                    "type": "ONBOARDING_FAILED",
                    "artwork_id": artwork.id,
                    "title": artwork.title
                })

        except Exception as e:
            db.rollback()
            print(f"Error handling master minted event: {e}")
            try:
                db_fail = SessionLocal()
                # Find artwork by IPFS hash
                artwork_fail = db_fail.query(Artwork).filter(Artwork.master_ipfs_hash == token_uri).first()
                if artwork_fail:
                    artwork_fail.status = "FAILED"
                    db_fail.commit()
                    event_broker.broadcast({
                        "type": "ONBOARDING_FAILED",
                        "artwork_id": artwork_fail.id,
                        "title": artwork_fail.title
                    })
                db_fail.close()
            except Exception as fe:
                print(f"Failed to record status FAILED in exception handler: {fe}")
        finally:
            db.close()

    def trigger_private_fragments_initialization(self, artwork_id: str, fragments: list) -> bool:
        print(f"[INDEXER] Initializing 100 fragments on Private Chain for artwork {artwork_id}...")
        try:
            addresses = load_deployed_addresses()
            marketplace_address = Web3.to_checksum_address(addresses["FragmentMarketplace"])
            fragment_abi = load_contract_abi(ABI_FRAGMENT_PATH)
            
            contract = self.w3_private.eth.contract(address=marketplace_address, abi=fragment_abi)
            
            # Get token URIs array
            token_uris = [f"http://127.0.0.1:8000/f/{artwork_id}_{f['token_id']}" for f in sorted(fragments, key=lambda x: int(x["token_id"]))]
            reserved_flags = [f.get("is_reserved", False) for f in sorted(fragments, key=lambda x: int(x["token_id"]))]
            
            # Convert artwork_id string/UUID to a uint256 hash or simple integer representation
            # to pass as uint256 to contract initializeFragments
            # We can hash the UUID to a uint256
            artwork_uint256 = int(hashlib.sha256(artwork_id.encode()).hexdigest(), 16) % (2**256 - 1)

            # Build and send transaction from museum key
            sender = Web3.to_checksum_address(MUSEUM_ADDRESS)
            receiver = Web3.to_checksum_address(fragments[0]["owner_address"]) if fragments else sender
            
            tx = contract.functions.initializeFragments(
                artwork_uint256,
                len(token_uris),
                token_uris,
                reserved_flags,
                receiver
            ).build_transaction({
                'from': sender,
                'nonce': self.w3_private.eth.get_transaction_count(sender),
                'gas': 28000000,  # 28M gas limit for 100 mints
                'gasPrice': self.w3_private.eth.gas_price
            })
            
            signed = self.w3_private.eth.account.sign_transaction(tx, private_key=MUSEUM_PRIVATE_KEY)
            tx_hash = self.w3_private.eth.send_raw_transaction(signed.raw_transaction)
            receipt = self.w3_private.eth.wait_for_transaction_receipt(tx_hash)
            
            if receipt.status == 1:
                print(f"[INDEXER] Private chain fragments initialized in tx: {tx_hash.hex()}. Gas used: {receipt.gasUsed}")
                try:
                    # Decode FragmentInitialized events from the receipt logs
                    logs = contract.events.FragmentInitialized().process_receipt(receipt)
                    token_uri_to_id = {log.args.tokenURI: log.args.tokenId for log in logs}
                    
                    # Update token_id in place with actual on-chain IDs
                    for f in fragments:
                        expected_uri = f"http://127.0.0.1:8000/f/{artwork_id}_{f['token_id']}"
                        if expected_uri in token_uri_to_id:
                            f["token_id"] = str(token_uri_to_id[expected_uri])
                except Exception as log_err:
                    print(f"[INDEXER] Error processing receipt logs to update token IDs: {log_err}")
                return True
            else:
                print(f"[INDEXER] ERROR: Private chain fragments initialization transaction REVERTED. Receipt: {receipt}")
                return False
            
        except Exception as e:
            print(f"Error calling initializeFragments on Private Chain: {e}")
            return False

    def handle_fragment_initialized(self, event):
        # Event signature: FragmentInitialized(uint256 indexed artworkId, uint256 indexed tokenId, string tokenURI, address indexed owner)
        artwork_id_uint = event.args.artworkId
        token_id = event.args.tokenId
        token_uri = event.args.tokenURI
        owner = event.args.owner
        
        print(f"[INDEXER] FragmentInitialized: Token {token_id}, Owner: {owner}")

        db: Session = SessionLocal()
        try:
            # Find the artwork whose hashed ID matches artwork_id_uint
            artwork = None
            for art in db.query(Artwork).all():
                art_hash = int(hashlib.sha256(art.id.encode()).hexdigest(), 16) % (2**256 - 1)
                if art_hash == artwork_id_uint:
                    artwork = art
                    break
            
            if artwork:
                # Find fragment by artwork_id and token_id
                fragment = db.query(Fragment).filter(
                    Fragment.artwork_id == artwork.id,
                    Fragment.token_id == str(token_id)
                ).first()
                if fragment:
                    # Update owner address
                    fragment.owner_address = owner
                    fragment.indexed = True
                    db.commit()
                
                    # Broadcast SSE
                    event_broker.broadcast({
                        "type": "FRAGMENT_INITIALIZED",
                        "artwork_id": fragment.artwork_id,
                        "token_id": fragment.token_id,
                        "owner": owner
                    })
        except Exception as e:
            db.rollback()
            print(f"Error in handle_fragment_initialized: {e}")
        finally:
            db.close()

    def handle_fragment_listed(self, event):
        # Event signature: FragmentListed(uint256 indexed tokenId, address indexed seller, uint256 price)
        token_id = event.args.tokenId
        seller = event.args.seller
        price = event.args.price

        print(f"[INDEXER] FragmentListed: Token {token_id}, Seller: {seller}, Price: {price}")

        db: Session = SessionLocal()
        try:
            # We find the fragment where token_id field matches on-chain token_id.
            fragment = db.query(Fragment).filter(Fragment.token_id == str(token_id)).first()
            if fragment:
                # Find if there is already an active listing for this fragment
                listing = db.query(Listing).filter(
                    Listing.fragment_id == fragment.id,
                    Listing.status == "LISTED"
                ).first()
                
                if not listing:
                    # Create new listing with unique transaction hash suffix to preserve history
                    listing_id = f"list_{token_id}_{event.transactionHash.hex()}"
                    listing = Listing(id=listing_id, fragment_id=fragment.id)
                    db.add(listing)
                
                listing.seller_address = seller
                listing.price = str(price)
                listing.status = "LISTED"

                # Update fragment owner to contract address since it's escrowed
                addresses = load_deployed_addresses()
                marketplace_address = Web3.to_checksum_address(addresses["FragmentMarketplace"])
                fragment.owner_address = marketplace_address

                db.commit()

                # Broadcast SSE
                event_broker.broadcast({
                    "type": "FRAGMENT_LISTED",
                    "artwork_id": fragment.artwork_id,
                    "token_id": fragment.token_id,
                    "seller": seller,
                    "price": Web3.from_wei(price, 'ether')
                })
        except Exception as e:
            db.rollback()
            print(f"Error in handle_fragment_listed: {e}")
        finally:
            db.close()

    def handle_listing_cancelled(self, event):
        # Event signature: ListingCancelled(uint256 indexed tokenId, address indexed seller)
        token_id = event.args.tokenId
        seller = event.args.seller

        print(f"[INDEXER] ListingCancelled: Token {token_id}, Seller: {seller}")

        db: Session = SessionLocal()
        try:
            fragment = db.query(Fragment).filter(Fragment.token_id == str(token_id)).first()
            if fragment:
                # Find the active listing to cancel
                listing = db.query(Listing).filter(
                    Listing.fragment_id == fragment.id,
                    Listing.status == "LISTED"
                ).first()
                if listing:
                    listing.status = "CANCELLED"

                # Return owner to seller
                fragment.owner_address = seller
                db.commit()

                # Broadcast SSE
                event_broker.broadcast({
                    "type": "LISTING_CANCELLED",
                    "artwork_id": fragment.artwork_id,
                    "token_id": fragment.token_id,
                    "seller": seller
                })
        except Exception as e:
            db.rollback()
            print(f"Error in handle_listing_cancelled: {e}")
        finally:
            db.close()

    def handle_fragment_sold(self, event):
        # Event signature: FragmentSold(uint256 indexed tokenId, address indexed buyer, address indexed seller, uint256 price, uint256 platformFeePaid, uint256 museumRoyaltyPaid)
        token_id = event.args.tokenId
        buyer = event.args.buyer
        seller = event.args.seller
        price = event.args.price
        platform_fee = event.args.platformFeePaid
        museum_royalty = event.args.museumRoyaltyPaid

        print(f"[INDEXER] FragmentSold: Token {token_id}, Buyer: {buyer}, Seller: {seller}, Price: {price}")

        db: Session = SessionLocal()
        try:
            fragment = db.query(Fragment).filter(Fragment.token_id == str(token_id)).first()
            if fragment:
                # Find active listing to mark as sold
                listing = db.query(Listing).filter(
                    Listing.fragment_id == fragment.id,
                    Listing.status == "LISTED"
                ).first()
                if listing:
                    listing.status = "SOLD"
                else:
                    # Fallback if active listing not found
                    listing_id = f"list_{token_id}_{event.transactionHash.hex()}"
                    listing = Listing(
                        id=listing_id,
                        fragment_id=fragment.id,
                        seller_address=seller,
                        price=str(price),
                        status="SOLD"
                    )
                    db.add(listing)

                # Update fragment owner
                fragment.owner_address = buyer

                # Get block timestamp
                try:
                    block = self.w3_private.eth.get_block(event.blockNumber)
                    timestamp = block.timestamp
                except Exception as ts_err:
                    print(f"Error fetching block timestamp: {ts_err}")
                    timestamp = int(time.time())

                tx_history = TransactionHistory(
                    id=str(uuid.uuid4()),
                    artwork_id=fragment.artwork_id,
                    fragment_id=fragment.id,
                    price=str(price),
                    buyer=buyer,
                    seller=seller,
                    timestamp=timestamp,
                    platform_fee=str(platform_fee),
                    museum_royalty=str(museum_royalty)
                )
                db.add(tx_history)
                db.commit()

                # Broadcast SSE
                event_broker.broadcast({
                    "type": "FRAGMENT_SOLD",
                    "artwork_id": fragment.artwork_id,
                    "token_id": fragment.token_id,
                    "buyer": buyer,
                    "seller": seller,
                    "price": Web3.from_wei(price, 'ether')
                })
        except Exception as e:
            db.rollback()
            print(f"Error in handle_fragment_sold: {e}")
        finally:
            db.close()

    def handle_bid_placed(self, event):
        # Event signature: BidPlaced(uint256 indexed bidId, uint256 indexed tokenId, address indexed bidder, uint256 amount)
        bid_id = event.args.bidId
        token_id = event.args.tokenId
        bidder = event.args.bidder
        amount = event.args.amount

        print(f"[INDEXER] BidPlaced: Bid {bid_id}, Token {token_id}, Bidder: {bidder}, Amount: {amount}")

        db: Session = SessionLocal()
        try:
            fragment = db.query(Fragment).filter(Fragment.token_id == str(token_id)).first()
            if fragment:
                bid = Bid(
                    id=str(bid_id),
                    fragment_id=fragment.id,
                    bidder_address=bidder,
                    amount=str(amount),
                    status="ACTIVE"
                )
                db.add(bid)
                db.commit()

                # Broadcast SSE
                event_broker.broadcast({
                    "type": "BID_PLACED",
                    "bid_id": str(bid_id),
                    "artwork_id": fragment.artwork_id,
                    "token_id": fragment.token_id,
                    "bidder": bidder,
                    "amount": Web3.from_wei(amount, 'ether')
                })
        except Exception as e:
            db.rollback()
            print(f"Error in handle_bid_placed: {e}")
        finally:
            db.close()

    def handle_bid_cancelled(self, event):
        # Event signature: BidCancelled(uint256 indexed bidId, uint256 indexed tokenId, address indexed bidder)
        bid_id = event.args.bidId
        token_id = event.args.tokenId
        bidder = event.args.bidder

        print(f"[INDEXER] BidCancelled: Bid {bid_id}")

        db: Session = SessionLocal()
        try:
            bid = db.query(Bid).filter(Bid.id == str(bid_id)).first()
            if bid:
                bid.status = "CANCELLED"
                db.commit()

                # Find fragment details for SSE
                fragment = db.query(Fragment).filter(Fragment.token_id == str(token_id)).first()
                artwork_id = fragment.artwork_id if fragment else ""
                
                event_broker.broadcast({
                    "type": "BID_CANCELLED",
                    "bid_id": str(bid_id),
                    "artwork_id": artwork_id,
                    "token_id": str(token_id),
                    "bidder": bidder
                })
        except Exception as e:
            db.rollback()
            print(f"Error in handle_bid_cancelled: {e}")
        finally:
            db.close()

    def handle_bid_accepted(self, event):
        # Event signature: BidAccepted(uint256 indexed bidId, uint256 indexed tokenId, address indexed buyer, address seller, uint256 price, uint256 platformFeePaid, uint256 museumRoyaltyPaid)
        bid_id = event.args.bidId
        token_id = event.args.tokenId
        buyer = event.args.buyer
        seller = event.args.seller
        price = event.args.price
        platform_fee = event.args.platformFeePaid
        museum_royalty = event.args.museumRoyaltyPaid

        print(f"[INDEXER] BidAccepted: Bid {bid_id}, Token {token_id}, Buyer: {buyer}, Seller: {seller}")

        db: Session = SessionLocal()
        try:
            bid = db.query(Bid).filter(Bid.id == str(bid_id)).first()
            if bid:
                bid.status = "ACCEPTED"

            fragment = db.query(Fragment).filter(Fragment.token_id == str(token_id)).first()
            if fragment:
                # Update owner address
                fragment.owner_address = buyer

                # If there was an active listing, it is now SOLD
                listing = db.query(Listing).filter(
                    Listing.fragment_id == fragment.id,
                    Listing.status == "LISTED"
                ).first()
                if listing:
                    listing.status = "SOLD"

                # Get block timestamp
                try:
                    block = self.w3_private.eth.get_block(event.blockNumber)
                    timestamp = block.timestamp
                except Exception as ts_err:
                    print(f"Error fetching block timestamp: {ts_err}")
                    timestamp = int(time.time())

                # Determine if this is a primary sale to correctly record museum_royalty in TransactionHistory
                artwork = db.query(Artwork).filter(Artwork.id == fragment.artwork_id).first()
                actual_museum_royalty = "0"
                if artwork and artwork.museum_address.lower() != seller.lower():
                    actual_museum_royalty = str(museum_royalty)

                tx_history = TransactionHistory(
                    id=str(uuid.uuid4()),
                    artwork_id=fragment.artwork_id,
                    fragment_id=fragment.id,
                    price=str(price),
                    buyer=buyer,
                    seller=seller,
                    timestamp=timestamp,
                    platform_fee=str(platform_fee),
                    museum_royalty=actual_museum_royalty
                )
                db.add(tx_history)
                db.commit()

                event_broker.broadcast({
                    "type": "BID_ACCEPTED",
                    "bid_id": str(bid_id),
                    "artwork_id": fragment.artwork_id,
                    "token_id": fragment.token_id,
                    "buyer": buyer,
                    "seller": seller,
                    "price": Web3.from_wei(price, 'ether')
                })
        except Exception as e:
            db.rollback()
            print(f"Error in handle_bid_accepted: {e}")
        finally:
            db.close()

# Export a single global daemon instance
indexer_daemon = IndexerDaemon()
