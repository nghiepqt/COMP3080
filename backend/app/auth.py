from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import secrets
import time
import os
from pathlib import Path
import base64
import json
import hmac
import hashlib
from datetime import datetime
from pydantic import BaseModel, field_validator
from web3 import Web3
from eth_account.messages import encode_defunct as encode_defended_bytes

from .database import get_db
from .models import User

# Router definition
router = APIRouter(prefix="/api/auth", tags=["auth"])

JWT_SECRET = "iheritage_secret_key_2026"
w3 = Web3()

def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').replace('=', '')

def create_jwt(payload: dict, secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = base64url_encode(json.dumps(header).encode('utf-8'))
    payload_b64 = base64url_encode(json.dumps(payload).encode('utf-8'))
    
    signature_input = f"{header_b64}.{payload_b64}".encode('utf-8')
    signature = hmac.new(secret.encode('utf-8'), signature_input, hashlib.sha256).digest()
    signature_b64 = base64url_encode(signature)
    
    return f"{header_b64}.{payload_b64}.{signature_b64}"

def grant_museum_role_if_needed(wallet_address: str):
    try:
        
        target_address = Web3.to_checksum_address(wallet_address)
        museum_role = Web3.keccak(text="MUSEUM_ROLE")
        admin_address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
        admin_pk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
        
        _PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
        deployed_path = str(_PROJECT_ROOT / "contracts" / "deployed_addresses.json")
        if not os.path.exists(deployed_path):
            print("[AUTH] contract deployed_addresses.json not found, skipping role grant.")
            return
            
        with open(deployed_path, "r") as f:
            addresses = json.load(f)

        # 1. Public Chain - MasterNFT
        rpc_public = "http://127.0.0.1:8547"
        w3_pub = Web3(Web3.HTTPProvider(rpc_public))
        if w3_pub.is_connected() and "MasterNFT" in addresses:
            master_address = addresses["MasterNFT"]
            abi_path = str(_PROJECT_ROOT / "contracts" / "out" / "MasterNFT.sol" / "MasterNFT.json")
            if os.path.exists(abi_path):
                with open(abi_path, "r") as f:
                    artifact = json.load(f)
                    master_abi = artifact.get("abi", [])
                contract = w3_pub.eth.contract(address=Web3.to_checksum_address(master_address), abi=master_abi)
                if not contract.functions.hasRole(museum_role, target_address).call():
                    print(f"[AUTH] Granting MUSEUM_ROLE on Public Chain to {target_address}...")
                    tx = contract.functions.grantRole(museum_role, target_address).build_transaction({
                        'from': admin_address,
                        'nonce': w3_pub.eth.get_transaction_count(admin_address),
                        'gas': 100000,
                        'gasPrice': w3_pub.eth.gas_price
                    })
                    signed = w3_pub.eth.account.sign_transaction(tx, private_key=admin_pk)
                    tx_hash = w3_pub.eth.send_raw_transaction(signed.raw_transaction)
                    w3_pub.eth.wait_for_transaction_receipt(tx_hash)
                    print(f"[AUTH] Public Chain role grant complete for {target_address} (tx: {tx_hash.hex()})")
                    
        # 2. Private Chain - FragmentMarketplace
        rpc_private = "http://127.0.0.1:8546"
        w3_priv = Web3(Web3.HTTPProvider(rpc_private))
        if w3_priv.is_connected() and "FragmentMarketplace" in addresses:
            marketplace_address = addresses["FragmentMarketplace"]
            abi_path = str(_PROJECT_ROOT / "contracts" / "out" / "FragmentMarketplace.sol" / "FragmentMarketplace.json")
            if os.path.exists(abi_path):
                with open(abi_path, "r") as f:
                    artifact = json.load(f)
                    marketplace_abi = artifact.get("abi", [])
                contract = w3_priv.eth.contract(address=Web3.to_checksum_address(marketplace_address), abi=marketplace_abi)
                if not contract.functions.hasRole(museum_role, target_address).call():
                    print(f"[AUTH] Granting MUSEUM_ROLE on Private Chain to {target_address}...")
                    tx = contract.functions.grantRole(museum_role, target_address).build_transaction({
                        'from': admin_address,
                        'nonce': w3_priv.eth.get_transaction_count(admin_address),
                        'gas': 100000,
                        'gasPrice': w3_priv.eth.gas_price
                    })
                    signed = w3_priv.eth.account.sign_transaction(tx, private_key=admin_pk)
                    tx_hash = w3_priv.eth.send_raw_transaction(signed.raw_transaction)
                    w3_priv.eth.wait_for_transaction_receipt(tx_hash)
                    print(f"[AUTH] Private Chain role grant complete for {target_address} (tx: {tx_hash.hex()})")
                    
    except Exception as e:
        print(f"[AUTH] Error granting roles on-chain: {e}")

class AuthVerifyRequest(BaseModel):
    wallet_address: str
    signature: str
    nonce: str
    chosen_role: str

    @field_validator("chosen_role")
    def validate_role(cls, v):
        if v not in ("museum", "collector"):
            raise ValueError("Role must be either 'museum' or 'collector'")
        return v

@router.get("/nonce")
def get_nonce(wallet: str, db: Session = Depends(get_db)):
    wallet_lower = wallet.lower()
    nonce = secrets.token_hex(16)
    
    # Try to find existing user or create a skeleton user
    user = db.query(User).filter(User.wallet_address == wallet_lower).first()
    if not user:
        user = User(
            wallet_address=wallet_lower,
            nonce=nonce,
            created_at=datetime.utcnow()
        )
        db.add(user)
    else:
        user.nonce = nonce
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error saving nonce: {str(e)}"
        )
        
    return {"nonce": nonce}

@router.post("/verify")
def verify_signature(req: AuthVerifyRequest, db: Session = Depends(get_db)):
    wallet_lower = req.wallet_address.lower()
    
    # Retrieve user and active nonce
    user = db.query(User).filter(User.wallet_address == wallet_lower).first()
    if not user or not user.nonce or user.nonce != req.nonce:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed. Nonce is invalid or expired."
        )
        
    # Cryptographically verify the signature
    try:
        msg_text = f"Sign this message to log into iHeritage. Nonce: {user.nonce}"
        message = encode_defended_bytes(text=msg_text)
        
        recovered_address = w3.eth.account.recover_message(message, signature=req.signature).lower()
        if recovered_address != wallet_lower:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Cryptographic signature verification failed."
            )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Signature recovery error: {str(e)}"
        )
        
    # Wipe the used nonce
    user.nonce = None
    
    # Determine user role
    role = user.role
    if not role:
        user.role = req.chosen_role
        role = req.chosen_role
        
    # Grant MUSEUM_ROLE on-chain if registering as museum
    if role == "museum":
        grant_museum_role_if_needed(wallet_lower)
        
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error saving user role: {str(e)}"
        )
        
    # Create stateless JWT token
    payload = {
        "address": wallet_lower,
        "role": role,
        "exp": int(time.time()) + 86400  # Token valid for 24 hours
    }
    token = create_jwt(payload, JWT_SECRET)
    
    return {
        "token": token,
        "role": role,
        "address": wallet_lower
    }
