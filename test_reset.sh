#!/bin/bash
echo "Stopping background tasks..."
pkill -f uvicorn
pkill -f anvil
sleep 2

echo "Clearing database..."
rm -f backend/iheritage.db
rm -rf backend/static/*

echo "Starting anvil nodes..."
# Start Public Chain node (8547)
nohup /home/qtnghiep/.foundry/bin/anvil --port 8547 --chain-id 31338 >/dev/null 2>&1 &
# Start Private Chain node (8546)
nohup /home/qtnghiep/.foundry/bin/anvil --port 8546 --chain-id 9999 >/dev/null 2>&1 &
sleep 3

echo "Deploying contracts..."
cd contracts
# Deploy to Public Chain (8547)
forge script script/DeployAll.s.sol --rpc-url http://127.0.0.1:8547 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --slow
# Deploy to Private Chain (8546)
forge script script/DeployAll.s.sol --rpc-url http://127.0.0.1:8546 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --slow

# Write correct deployed addresses mapping
echo '{"MasterNFT": "0x5FbDB2315678afecb367f032d93F642f64180aa3", "FragmentMarketplace": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"}' > deployed_addresses.json
cd ..

echo "Starting backend..."
cd backend
nohup .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 >nohup.out 2>&1 &
cd ..
sleep 3
echo "Done"
