from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, case, Numeric
from .database import get_db
from .models import Artwork, Fragment, Listing, Bid, TransactionHistory

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("/museum/{wallet_address}")
def get_museum_analytics(wallet_address: str, db: Session = Depends(get_db)):
    wallet_lower = wallet_address.lower()
    
    # Single SQL query to calculate all aggregates in database
    stats = db.query(
        func.count(TransactionHistory.id).label("total_trades"),
        func.sum(func.cast(TransactionHistory.price, Numeric)).label("trading_volume"),
        func.sum(
            case(
                (func.lower(TransactionHistory.seller) == wallet_lower, func.cast(TransactionHistory.price, Numeric)),
                else_=0
            )
        ).label("total_endowments_raised"),
        func.sum(
            case(
                (func.lower(TransactionHistory.seller) != wallet_lower, func.cast(TransactionHistory.museum_royalty, Numeric)),
                else_=0
            )
        ).label("accrued_royalties")
    ).join(
        Artwork, TransactionHistory.artwork_id == Artwork.id
    ).filter(
        func.lower(Artwork.museum_address) == wallet_lower
    ).first()
    
    # Query all ledger transactions for the history list, sorted by timestamp desc
    txs = db.query(TransactionHistory).join(
        Artwork, TransactionHistory.artwork_id == Artwork.id
    ).filter(
        func.lower(Artwork.museum_address) == wallet_lower
    ).order_by(TransactionHistory.timestamp.desc()).all()
    
    total_trades = stats.total_trades if stats and stats.total_trades is not None else 0
    trading_volume = int(stats.trading_volume) if stats and stats.trading_volume is not None else 0
    total_endowments_raised = int(stats.total_endowments_raised) if stats and stats.total_endowments_raised is not None else 0
    accrued_royalties = int(stats.accrued_royalties) if stats and stats.accrued_royalties is not None else 0
    
    return {
        "total_endowments_raised": str(total_endowments_raised),
        "accrued_royalties": str(accrued_royalties),
        "total_trades": total_trades,
        "trading_volume": str(trading_volume),
        "transactions": [
            {
                "id": tx.id,
                "fragment_name": f"{tx.artwork.title} #{tx.fragment.token_id}" if tx.artwork and tx.fragment else f"Fragment #{tx.fragment_id.split('_')[-1]}",
                "buyer": tx.buyer,
                "seller": tx.seller,
                "price": tx.price,
                "museum_royalty": tx.museum_royalty or "0",
                "timestamp": tx.timestamp
            } for tx in txs
        ]
    }

@router.get("/collector/{wallet_address}")
def get_collector_analytics(wallet_address: str, db: Session = Depends(get_db)):
    wallet_lower = wallet_address.lower()
    
    # 1. Net Realized Profit (ROI) - SQL self-join query to pair flips without N+1 queries
    s = aliased(TransactionHistory, name="s")
    b = aliased(TransactionHistory, name="b")
    
    # Subquery to retrieve the latest buy timestamp prior to the sell
    subq = db.query(func.max(TransactionHistory.timestamp)).filter(
        TransactionHistory.fragment_id == s.fragment_id,
        func.lower(TransactionHistory.buyer) == wallet_lower,
        TransactionHistory.timestamp < s.timestamp
    ).scalar_subquery()
    
    flips = db.query(
        s.price.label("sell_price"),
        s.museum_royalty.label("sell_royalty"),
        b.price.label("buy_price"),
        b.platform_fee.label("buy_fee")
    ).join(
        b, s.fragment_id == b.fragment_id
    ).filter(
        func.lower(s.seller) == wallet_lower,
        func.lower(b.buyer) == wallet_lower,
        b.timestamp < s.timestamp,
        b.timestamp == subq
    ).all()
    
    total_profit_wei = 0
    for flip in flips:
        sell_price = int(flip.sell_price)
        sell_royalty = int(flip.sell_royalty) if flip.sell_royalty else 0
        buy_price = int(flip.buy_price)
        buy_fee = int(flip.buy_fee) if flip.buy_fee else 0
        
        profit = (sell_price - sell_royalty) - (buy_price + buy_fee)
        total_profit_wei += profit
        
    # 2. Grid Capital Collateral - Aggregate sum of active bids
    stats = db.query(
        func.sum(func.cast(Bid.amount, Numeric)).label("active_collateral")
    ).filter(
        func.lower(Bid.bidder_address) == wallet_lower,
        Bid.status == 'ACTIVE'
    ).first()
    
    active_collateral = int(stats.active_collateral) if stats and stats.active_collateral is not None else 0
    
    return {
        "net_realized_profit": str(total_profit_wei),
        "active_collateral": str(active_collateral)
    }
