import math
import hashlib

def calculate_rarity_score(x: int, y: int) -> float:
    """
    Computes a localized Rarity Score for every fragment.
    Cells situated at the focal center points of the artwork matrix receive higher structural values (80-100),
    while peripheral canvas coordinates receive lower base scores (10-30).
    Uses Euclidean distance from the grid center (4.5, 4.5) on a 10x10 grid (0-9).
    """
    dx = x - 4.5
    dy = y - 4.5
    dist = math.sqrt(dx**2 + dy**2)
    max_dist = math.sqrt(4.5**2 + 4.5**2)  # ~6.36396
    
    # Range is 20.0 (farthest corner) to 100.0 (closest center)
    score = 100.0 - (dist / max_dist) * 80.0
    return float(round(score, 2))

def generate_mock_ipfs_hash(master_ipfs_hash: str, x: int, y: int) -> str:
    """
    Simulates IPFS upload by returning a deterministic IPFS URI based on the master hash and coordinates.
    """
    raw_str = f"{master_ipfs_hash}_{x}_{y}"
    # Generate SHA-256 hash of coordinates and master hash
    h = hashlib.sha256(raw_str.encode()).hexdigest()
    # Format as Qm-style mock CID
    return f"ipfs://Qm{h[:44]}"

def fractionalize_artwork(artwork_id: str, master_ipfs_hash: str, owner_address: str):
    """
    Divides the artwork into a 10x10 grid (100 fragments).
    Returns list of fragment dicts containing coordinates, rarity scores, token IDs (1-100), and mock IPFS hashes.
    Withholds exactly 25% of fragments (25 elements) based on rarity pools using a deterministic seed.
    """
    fragments = []
    token_id = 1
    
    # Pools to store token_ids
    legendary_pool = []
    rare_pool = []
    common_pool = []
    
    # First pass: calculate scores and map to pools
    for y in range(10):
        for x in range(10):
            rarity = calculate_rarity_score(x, y)
            if rarity >= 85:
                legendary_pool.append(token_id)
            elif rarity >= 50:
                rare_pool.append(token_id)
            else:
                common_pool.append(token_id)
            token_id += 1

    # Select exactly 25% of each pool using deterministic seed
    import random
    rng = random.Random(artwork_id)
    
    reserved_legendary = rng.sample(legendary_pool, len(legendary_pool) // 4)
    reserved_rare = rng.sample(rare_pool, len(rare_pool) // 4)
    reserved_common = rng.sample(common_pool, len(common_pool) // 4)
    
    reserved_set = set(reserved_legendary + reserved_rare + reserved_common)

    # Second pass: build fragments list
    token_id = 1
    for y in range(10):
        for x in range(10):
            rarity = calculate_rarity_score(x, y)
            ipfs_hash = generate_mock_ipfs_hash(master_ipfs_hash, x, y)
            
            fragments.append({
                "id": f"{artwork_id}_{token_id}",
                "artwork_id": artwork_id,
                "token_id": str(token_id),
                "coord_x": x,
                "coord_y": y,
                "rarity_score": rarity,
                "fragment_ipfs_hash": ipfs_hash,
                "owner_address": owner_address,
                "is_reserved": (token_id in reserved_set)
            })
            token_id += 1
            
    return fragments
