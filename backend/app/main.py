import uuid
from datetime import datetime, timezone
import hashlib
import os
from fastapi import FastAPI, Depends, File, UploadFile, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import asyncio
import json
from pydantic import BaseModel
from eth_account import Account
from eth_account.messages import encode_defunct

from .database import engine, Base, SessionLocal, get_db
from .models import Artwork, Fragment, Listing, Bid, TransactionHistory, User
from .indexer import indexer_daemon, event_broker
from .auth import router as auth_router

# Initialize SQLite tables
Base.metadata.create_all(bind=engine)

def seed_roles():
    db = SessionLocal()
    try:
        seeds = {
            "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266": "museum",
            "0x70997970c51812dc3a010c7d01b50e0d17dc79c8": "collector",
            "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc": "collector"
        }
        for addr, role in seeds.items():
            exists = db.query(User).filter(User.wallet_address == addr).first()
            if not exists:
                db_role = User(wallet_address=addr, role=role, created_at=datetime.utcnow())
                db.add(db_role)
        db.commit()
    except Exception as e:
        print(f"Error seeding user roles: {e}")
    finally:
        db.close()

seed_roles()

from .analytics import router as analytics_router

app = FastAPI(title="iHeritage API", version="1.0.0")
app.include_router(auth_router)
app.include_router(analytics_router)

# Mount static files to serve uploaded artwork images and pre-onboarded assets
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_image_url(master_ipfs_hash: str) -> str:
    """
    Helper to resolve a mock IPFS hash to a local web URL.
    Returns /static/crown.png for fallback or matching files in static/.
    """
    if not master_ipfs_hash:
        return "/static/crown.png"
    # Extract the hash part
    h = master_ipfs_hash.replace("ipfs://Qm", "")
    if os.path.exists("static"):
        for filename in os.listdir("static"):
            if filename.startswith(h):
                return f"/static/{filename}"
    return "/static/crown.png"

@app.on_event("startup")
def startup_event():
    event_broker.loop = asyncio.get_running_loop()
    indexer_daemon.start()

@app.on_event("shutdown")
def shutdown_event():
    indexer_daemon.stop()

@app.post("/api/artworks")
async def create_artwork(
    title: str = Form(...),
    artist: str = Form(...),
    creation_year: int = Form(...),
    museum_address: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        # Read file contents and compute hash to simulate IPFS upload
        content = await file.read()
        h = hashlib.sha256(content).hexdigest()
        master_ipfs_hash = f"ipfs://Qm{h[:44]}"
        
        # Save file to static folder
        os.makedirs("static", exist_ok=True)
        ext = os.path.splitext(file.filename)[1] if file.filename else ".png"
        if not ext:
            ext = ".png"
        filepath = os.path.join("static", f"{h}{ext}")
        with open(filepath, "wb") as f:
            f.write(content)
            
        # Create artwork record (without master_token_id yet; it will be filled by the indexer)
        artwork_id = str(uuid.uuid4())
        db_artwork = Artwork(
            id=artwork_id,
            title=title,
            artist=artist,
            creation_year=creation_year,
            master_ipfs_hash=master_ipfs_hash,
            museum_address=museum_address,
            master_token_id=None,
            public_chain_tx_hash=None,
            status="PENDING"
        )
        
        db.add(db_artwork)
        db.commit()
        db.refresh(db_artwork)
        
        return {
            "id": db_artwork.id,
            "title": db_artwork.title,
            "artist": db_artwork.artist,
            "creation_year": db_artwork.creation_year,
            "master_ipfs_hash": db_artwork.master_ipfs_hash,
            "museum_address": db_artwork.museum_address,
            "image_url": f"/static/{h}{ext}",
            "status": db_artwork.status
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

def serialize_artwork(a: Artwork) -> dict:
    return {
        "id": a.id,
        "title": a.title,
        "artist": a.artist,
        "creation_year": a.creation_year,
        "master_token_id": a.master_token_id,
        "public_chain_tx_hash": a.public_chain_tx_hash,
        "master_ipfs_hash": a.master_ipfs_hash,
        "museum_address": a.museum_address,
        "image_url": get_image_url(a.master_ipfs_hash),
        "status": a.status
    }

@app.get("/api/artworks")
def get_artworks(db: Session = Depends(get_db)):
    artworks = db.query(Artwork).all()
    return [serialize_artwork(a) for a in artworks]

@app.get("/api/artworks/{artwork_id}")
def get_artwork(artwork_id: str, db: Session = Depends(get_db)):
    a = db.query(Artwork).filter(Artwork.id == artwork_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Artwork not found")
    return serialize_artwork(a)

class StatusUpdate(BaseModel):
    status: str

@app.patch("/api/artworks/{artwork_id}/status")
def update_artwork_status(artwork_id: str, payload: StatusUpdate, db: Session = Depends(get_db)):
    artwork = db.query(Artwork).filter(Artwork.id == artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")
    if payload.status not in ["PENDING", "FAILED", "ACTIVE"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    artwork.status = payload.status
    db.commit()
    return {"id": artwork.id, "status": artwork.status}

@app.delete("/api/artworks/{artwork_id}")
def delete_artwork(artwork_id: str, db: Session = Depends(get_db)):
    artwork = db.query(Artwork).filter(Artwork.id == artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")
    db.delete(artwork)
    db.commit()
    return {"message": "Artwork deleted successfully"}

@app.get("/api/artworks/{artwork_id}/grid")
def get_artwork_grid(artwork_id: str, db: Session = Depends(get_db)):
    artwork = db.query(Artwork).filter(Artwork.id == artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")
        
    fragments = db.query(Fragment).filter(Fragment.artwork_id == artwork_id).all()
    
    # If fragments have not been initialized yet, return empty list/grid
    if not fragments:
        return []
        
    # Map fragments to a list of dicts with extra listing and bidding information
    grid = []
    for f in fragments:
        # Check active listing
        active_listing = db.query(Listing).filter(
            Listing.fragment_id == f.id,
            Listing.status == "LISTED"
        ).first()
        
        # Check active bids
        active_bids_count = db.query(Bid).filter(
            Bid.fragment_id == f.id,
            Bid.status == "ACTIVE"
        ).count()
        
        # Determine UI status
        # Idle (owned by museum), Listed (available for purchase), Sold (owned by collector)
        if active_listing:
            status = "LISTED"
            price = active_listing.price
        elif f.owner_address.lower() == artwork.museum_address.lower():
            status = "IDLE"
            price = None
        else:
            status = "SOLD"
            price = None
            
        grid.append({
            "id": f.id,
            "token_id": int(f.token_id),
            "coord_x": f.coord_x,
            "coord_y": f.coord_y,
            "rarity_score": f.rarity_score,
            "fragment_ipfs_hash": f.fragment_ipfs_hash,
            "owner_address": f.owner_address,
            "status": status,
            "price": price,
            "bids_count": active_bids_count,
            "is_reserved": f.is_reserved
        })
        
    # Sort grid by token_id (1 to 100)
    grid.sort(key=lambda x: x["token_id"])
    return grid

@app.get("/api/fragments/{fragment_id}")
def get_fragment_details(fragment_id: str, db: Session = Depends(get_db)):
    fragment = db.query(Fragment).filter(Fragment.id == fragment_id).first()
    if not fragment:
        raise HTTPException(status_code=404, detail="Fragment not found")
        
    # Get active listing
    listing = db.query(Listing).filter(
        Listing.fragment_id == fragment_id,
        Listing.status == "LISTED"
    ).first()
    
    # Get active bids
    bids = db.query(Bid).filter(
        Bid.fragment_id == fragment_id,
        Bid.status == "ACTIVE"
    ).all()
    
    return {
        "id": fragment.id,
        "artwork_id": fragment.artwork_id,
        "token_id": int(fragment.token_id),
        "coord_x": fragment.coord_x,
        "coord_y": fragment.coord_y,
        "rarity_score": fragment.rarity_score,
        "fragment_ipfs_hash": fragment.fragment_ipfs_hash,
        "owner_address": fragment.owner_address,
        "is_reserved": fragment.is_reserved,
        "listing": {
            "id": listing.id,
            "price": listing.price,
            "seller": listing.seller_address
        } if listing else None,
        "bids": [
            {
                "id": b.id,
                "bidder": b.bidder_address,
                "amount": b.amount
            } for b in bids
        ]
    }

@app.get("/api/listings")
def get_active_listings(db: Session = Depends(get_db)):
    # Get all active listings
    listings = db.query(Listing).filter(Listing.status == "LISTED").all()
    
    result = []
    for l in listings:
        fragment = db.query(Fragment).filter(Fragment.id == l.fragment_id).first()
        if fragment:
            artwork = db.query(Artwork).filter(Artwork.id == fragment.artwork_id).first()
            result.append({
                "listing_id": l.id,
                "fragment_id": fragment.id,
                "token_id": int(fragment.token_id),
                "coord_x": fragment.coord_x,
                "coord_y": fragment.coord_y,
                "rarity_score": fragment.rarity_score,
                "price": l.price,
                "seller": l.seller_address,
                "artwork_title": artwork.title if artwork else "Unknown"
            })
            
    return result

from decimal import Decimal

def sanitize_json_data(data):
    if isinstance(data, dict):
        return {k: sanitize_json_data(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_json_data(x) for x in data]
    elif isinstance(data, Decimal):
        return float(data)
    else:
        return data

@app.get("/api/events")
async def events_endpoint(request: Request):
    """
    Server-Sent Events (SSE) endpoint to stream real-time updates to the frontend dashboard.
    """
    queue = event_broker.subscribe()
    
    async def event_generator():
        try:
            while True:
                # Check for client disconnect
                if await request.is_disconnected():
                    break
                try:
                    # Timeout of 1s to allow periodic checking of request disconnect
                    data = await asyncio.wait_for(queue.get(), timeout=1.0)
                    sanitized = sanitize_json_data(data)
                    yield f"data: {json.dumps(sanitized)}\n\n"
                except asyncio.TimeoutError:
                    # Keepalive comment
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            event_broker.unsubscribe(queue)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/api/artworks/{artwork_id}/stream")
async def artwork_events_endpoint(artwork_id: str, request: Request):
    """
    Server-Sent Events (SSE) endpoint to stream real-time updates for a specific artwork.
    """
    queue = event_broker.subscribe()
    
    async def event_generator():
        try:
            while True:
                # Check for client disconnect
                if await request.is_disconnected():
                    break
                try:
                    # Timeout of 1s to allow periodic checking of request disconnect
                    data = await asyncio.wait_for(queue.get(), timeout=1.0)
                    sanitized = sanitize_json_data(data)
                    if sanitized.get("artwork_id") == artwork_id:
                        yield f"data: {json.dumps(sanitized)}\n\n"
                except asyncio.TimeoutError:
                    # Keepalive comment
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            event_broker.unsubscribe(queue)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/api/contracts")
def get_contracts():
    """
    Exposes contract addresses and ABIs so the frontend can dynamically build ethers contracts.
    """
    from .indexer import load_deployed_addresses, load_contract_abi, ABI_MASTER_PATH, ABI_FRAGMENT_PATH
    addresses = load_deployed_addresses()
    master_abi = load_contract_abi(ABI_MASTER_PATH)
    fragment_abi = load_contract_abi(ABI_FRAGMENT_PATH)
    return {
        "MasterNFT": {
            "address": addresses.get("MasterNFT"),
            "abi": master_abi
        },
        "FragmentMarketplace": {
            "address": addresses.get("FragmentMarketplace"),
            "abi": fragment_abi
        }
    }

@app.get("/api/analytics/artwork/{artwork_id}/price-history")
def get_artwork_price_history(artwork_id: str, raw: bool = False, db: Session = Depends(get_db)):
    # Verify artwork exists
    artwork = db.query(Artwork).filter(Artwork.id == artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    # Query all transaction history records for this artwork
    transactions = db.query(TransactionHistory).filter(
        TransactionHistory.artwork_id == artwork_id
    ).order_by(TransactionHistory.timestamp.asc()).all()

    # If no transactions yet, return empty list
    if not transactions:
        return []

    if raw:
        return [
            {
                "id": tx.id,
                "timestamp": tx.timestamp,
                "priceInEther": float(tx.price) / 10**18,
                "priceInWei": tx.price,
                "token_id": int(tx.fragment.token_id) if (tx.fragment and tx.fragment.token_id) else int(tx.fragment_id.split("_")[-1]),
                "buyer": tx.buyer,
                "seller": tx.seller
            } for tx in transactions
        ]

    # Group by calendar day (UTC)
    daily_groups = {}
    for tx in transactions:
        tx_date = datetime.fromtimestamp(tx.timestamp, tz=timezone.utc).date()
        if tx_date not in daily_groups:
            daily_groups[tx_date] = []
        daily_groups[tx_date].append(tx)

    result = []
    for date_key in sorted(daily_groups.keys()):
        txs = daily_groups[date_key]
        total_wei = sum(int(tx.price) for tx in txs)
        avg_wei = total_wei // len(txs)
        
        # Convert date to start of day timestamp in UTC
        dt = datetime.combine(date_key, datetime.min.time(), tzinfo=timezone.utc)
        timestamp = int(dt.timestamp())
        
        price_in_ether = float(avg_wei) / 10**18
        
        result.append({
            "timestamp": timestamp,
            "priceInEther": price_in_ether,
            "priceInWei": str(avg_wei)
        })

    return result

def serialize_bid(b: Bid, fragment: Fragment, artwork: Artwork = None, include_bidder: bool = False) -> dict:
    data = {
        "id": b.id,
        "fragment_id": fragment.id,
        "token_id": int(fragment.token_id),
        "artwork_id": artwork.id if artwork else "",
        "artwork_title": artwork.title if artwork else "Unknown",
        "amount": b.amount,
        "status": b.status
    }
    if include_bidder:
        data["bidder"] = b.bidder_address
    return data

@app.get("/api/bids/bidder/{bidder_address}")
def get_user_bids(bidder_address: str, db: Session = Depends(get_db)):
    bids = db.query(Bid).filter(
        Bid.bidder_address == bidder_address,
        Bid.status == "ACTIVE"
    ).all()
    
    result = []
    for b in bids:
        fragment = db.query(Fragment).filter(Fragment.id == b.fragment_id).first()
        if fragment:
            artwork = db.query(Artwork).filter(Artwork.id == fragment.artwork_id).first()
            result.append(serialize_bid(b, fragment, artwork, include_bidder=False))
    return result

@app.get("/api/bids/owner/{owner_address}")
def get_owner_bids(owner_address: str, db: Session = Depends(get_db)):
    owner_lower = owner_address.lower()
    bids = db.query(Bid).join(Fragment).filter(
        Bid.status == "ACTIVE",
        Fragment.owner_address == owner_lower
    ).all()
    
    result = []
    for b in bids:
        fragment = b.fragment
        if fragment:
            artwork = db.query(Artwork).filter(Artwork.id == fragment.artwork_id).first()
            result.append(serialize_bid(b, fragment, artwork, include_bidder=True))
    return result

@app.get("/api/bids/artwork/{artwork_id}")
def get_artwork_bids(artwork_id: str, db: Session = Depends(get_db)):
    bids = db.query(Bid).join(Fragment).filter(
        Bid.status == "ACTIVE",
        Fragment.artwork_id == artwork_id
    ).all()
    
    result = []
    for b in bids:
        result.append({
            "id": b.id,
            "fragment_id": b.fragment_id,
            "token_id": int(b.fragment.token_id),
            "coord_x": b.fragment.coord_x,
            "coord_y": b.fragment.coord_y,
            "amount": b.amount,
            "bidder": b.bidder_address,
            "status": b.status
        })
    return result


@app.get("/api/artworks/{artwork_id}/initialization-status")

def get_initialization_status(artwork_id: str, db: Session = Depends(get_db)):
    total = db.query(Fragment).filter(Fragment.artwork_id == artwork_id).count()
    indexed = db.query(Fragment).filter(
        Fragment.artwork_id == artwork_id,
        Fragment.indexed == True
    ).count()
    return {"total": total, "indexed": indexed}

@app.get("/f/{fragment_id}")
def get_fragment_metadata(fragment_id: str, request: Request, db: Session = Depends(get_db)):
    # Try finding by exact id (artwork_id_gridindex)
    fragment = db.query(Fragment).filter(Fragment.id == fragment_id).first()
    if not fragment:
        # Fallback: try finding by artwork_id and on-chain token_id
        parts = fragment_id.split("_")
        if len(parts) == 2:
            art_id, tok_id = parts
            fragment = db.query(Fragment).filter(
                Fragment.artwork_id == art_id,
                Fragment.token_id == tok_id
            ).first()
            
    if not fragment:
        raise HTTPException(status_code=404, detail="Fragment not found")
    
    artwork = db.query(Artwork).filter(Artwork.id == fragment.artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")
    
    img_relative = get_image_url(artwork.master_ipfs_hash)
    img_url = f"{str(request.base_url).rstrip('/')}{img_relative}"
    
    return {
        "name": f"{artwork.title} - Fragment #{fragment.token_id}",
        "description": f"Coordinate fragment [{fragment.coord_x}, {fragment.coord_y}] of the artwork '{artwork.title}' by {artwork.artist}.",
        "image": img_url,
        "attributes": [
            {"trait_type": "Artist", "value": artwork.artist},
            {"trait_type": "Creation Year", "value": artwork.creation_year},
            {"trait_type": "Coordinate X", "value": fragment.coord_x},
            {"trait_type": "Coordinate Y", "value": fragment.coord_y},
            {"trait_type": "Rarity Score", "value": fragment.rarity_score},
            {"trait_type": "Reserved Status", "value": "Reserved" if fragment.is_reserved else "Standard"}
        ]
    }



