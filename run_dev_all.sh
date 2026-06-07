#!/bin/bash

# iHeritage Hybrid Marketplace - Unified Local Development Startup Script
# This script starts two local Anvil nodes, deploys the smart contracts,
# starts the FastAPI backend, and starts the Next.js frontend dev server.
# Press Ctrl+C to terminate all services safely.

set -e

# Define ports
PORT_PUBLIC_RPC=8547
PORT_PRIVATE_RPC=8546
PORT_BACKEND=8000
PORT_FRONTEND=3000

echo "=== [1/5] Stopping existing background processes ==="
pkill -f "anvil --port $PORT_PUBLIC_RPC" || true
pkill -f "anvil --port $PORT_PRIVATE_RPC" || true
pkill -f "uvicorn app.main:app" || true
pkill -f "next dev" || true
sleep 1.5

echo "=== [2/5] Cleaning local SQLite database and mock IPFS assets ==="
rm -f backend/iheritage.db
rm -rf backend/static/*
mkdir -p backend/static

# Track child PIDs for cleanup on exit
PUBLIC_ANVIL_PID=""
PRIVATE_ANVIL_PID=""
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    echo "=== Shutting down all local development services ==="
    [ -n "$PUBLIC_ANVIL_PID" ] && kill $PUBLIC_ANVIL_PID 2>/dev/null || true
    [ -n "$PRIVATE_ANVIL_PID" ] && kill $PRIVATE_ANVIL_PID 2>/dev/null || true
    [ -n "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null || true
    [ -n "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null || true
    
    # Fallback search and destroy
    pkill -f "anvil --port $PORT_PUBLIC_RPC" || true
    pkill -f "anvil --port $PORT_PRIVATE_RPC" || true
    pkill -f "uvicorn app.main:app" || true
    pkill -f "next dev" || true
    echo "Done. All services terminated safely."
}
trap cleanup EXIT INT TERM

echo "=== [3/5] Starting Dual Anvil Local Blockchains ==="
echo "Starting Public Anchoring Node on port $PORT_PUBLIC_RPC (Chain ID 31338)..."
nohup anvil --port $PORT_PUBLIC_RPC --chain-id 31338 > anvil_public.log 2>&1 &
PUBLIC_ANVIL_PID=$!

echo "Starting Private Trading Node on port $PORT_PRIVATE_RPC (Chain ID 9999)..."
nohup anvil --port $PORT_PRIVATE_RPC --chain-id 9999 > anvil_private.log 2>&1 &
PRIVATE_ANVIL_PID=$!

# Wait for Anvil nodes to start responding
echo "Waiting for RPC nodes to be ready..."
until curl -s -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://127.0.0.1:$PORT_PUBLIC_RPC >/dev/null; do
    sleep 0.5
done
until curl -s -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://127.0.0.1:$PORT_PRIVATE_RPC >/dev/null; do
    sleep 0.5
done
echo "RPC nodes are online!"

echo "=== [4/5] Compiling and Deploying Smart Contracts ==="
cd contracts
# Run deployment script on Public Chain
echo "Deploying MasterNFT to Public Anchoring Layer..."
forge script script/DeployAll.s.sol --rpc-url http://127.0.0.1:$PORT_PUBLIC_RPC --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --slow

# Run deployment script on Private Chain
echo "Deploying FragmentMarketplace to Private Trading Layer..."
forge script script/DeployAll.s.sol --rpc-url http://127.0.0.1:$PORT_PRIVATE_RPC --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --slow

# Write deployed addresses json (fallback write; actual write happens dynamically via hydrology)
echo '{"MasterNFT": "0x5FbDB2315678afecb367f032d93F642f64180aa3", "FragmentMarketplace": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"}' > deployed_addresses.json
cd ..

echo "=== [5/5] Starting Backend and Frontend Servers ==="
echo "Starting Python FastAPI Backend..."
cd backend
# Run backend inside virtual environment and pipe logs
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port $PORT_BACKEND > backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend to start responding
until curl -s http://127.0.0.1:$PORT_BACKEND/docs >/dev/null; do
    sleep 0.5
done
echo "FastAPI Backend is online!"

echo "Starting Next.js Frontend dev server..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo "--------------------------------------------------------"
echo "All systems running! Logs are piped to:"
echo "  - Public Anvil: anvil_public.log"
echo "  - Private Anvil: anvil_private.log"
echo "  - Python Backend: backend/backend.log"
echo "  - Next.js Frontend: Console output above"
echo "--------------------------------------------------------"
echo "Press [Ctrl+C] to stop all services simultaneously."

# Wait for frontend process to keep the script running
wait $FRONTEND_PID
