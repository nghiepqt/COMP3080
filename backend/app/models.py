from sqlalchemy import Column, String, Integer, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class Artwork(Base):
    __tablename__ = "artworks"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    artist = Column(String, nullable=False)
    creation_year = Column(Integer, nullable=False)
    master_token_id = Column(String, nullable=True)  # Can be empty before minted/indexed
    public_chain_tx_hash = Column(String, nullable=True)
    master_ipfs_hash = Column(String, nullable=False)
    museum_address = Column(String, nullable=False)
    status = Column(String, default="PENDING", nullable=False)  # PENDING, FAILED, ACTIVE

    fragments = relationship("Fragment", back_populates="artwork", cascade="all, delete-orphan")

class Fragment(Base):
    __tablename__ = "fragments"

    # id format: "{artwork_id}_{token_id}"
    id = Column(String, primary_key=True, index=True)
    artwork_id = Column(String, ForeignKey("artworks.id"), nullable=False)
    token_id = Column(String, nullable=False)  # 1 to 100
    coord_x = Column(Integer, nullable=False)  # 0 to 9
    coord_y = Column(Integer, nullable=False)  # 0 to 9
    rarity_score = Column(Float, nullable=False)
    fragment_ipfs_hash = Column(String, nullable=False)
    owner_address = Column(String, nullable=False)
    indexed = Column(Boolean, default=False, nullable=False)
    is_reserved = Column(Boolean, default=False, nullable=False)

    artwork = relationship("Artwork", back_populates="fragments")
    listings = relationship("Listing", back_populates="fragment", cascade="all, delete-orphan")
    bids = relationship("Bid", back_populates="fragment", cascade="all, delete-orphan")

class Listing(Base):
    __tablename__ = "listings"

    id = Column(String, primary_key=True, index=True)
    fragment_id = Column(String, ForeignKey("fragments.id"), nullable=False)
    seller_address = Column(String, nullable=False)
    price = Column(String, nullable=False)  # String representation of uint256 (in Wei)
    status = Column(String, nullable=False, default="LISTED")  # LISTED, SOLD, CANCELLED

    fragment = relationship("Fragment", back_populates="listings")

class Bid(Base):
    __tablename__ = "bids"

    id = Column(String, primary_key=True, index=True)  # Contract bidId
    fragment_id = Column(String, ForeignKey("fragments.id"), nullable=False)
    bidder_address = Column(String, nullable=False)
    amount = Column(String, nullable=False)  # String representation of uint256 (in Wei)
    status = Column(String, nullable=False, default="ACTIVE")  # ACTIVE, ACCEPTED, CANCELLED

    fragment = relationship("Fragment", back_populates="bids")

class TransactionHistory(Base):
    __tablename__ = "transaction_history"

    id = Column(String, primary_key=True, index=True)
    artwork_id = Column(String, ForeignKey("artworks.id"), nullable=False, index=True)
    fragment_id = Column(String, ForeignKey("fragments.id"), nullable=False, index=True)
    price = Column(String, nullable=False)  # String representation of uint256 in Wei
    buyer = Column(String, nullable=False, index=True)
    seller = Column(String, nullable=False, index=True)
    timestamp = Column(Integer, nullable=False, index=True)  # Unix timestamp
    platform_fee = Column(String, nullable=True)
    museum_royalty = Column(String, nullable=True)

    artwork = relationship("Artwork")
    fragment = relationship("Fragment")

class User(Base):
    __tablename__ = "users"

    wallet_address = Column(String, primary_key=True, index=True)  # Lowercase/checksum wallet address
    role = Column(String, nullable=True)  # strictly restricted to 'museum' or 'collector'
    nonce = Column(String, nullable=True)  # temporary cryptographically random string
    display_name = Column(String, nullable=True)  # optional username/institution name
    created_at = Column(DateTime, default=datetime.utcnow)


