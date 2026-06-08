# iHeritage Hybrid Marketplace - Unified Local Development Startup Script (Windows PowerShell)
# This script starts two local Anvil nodes, deploys the smart contracts,
# starts the FastAPI backend, and starts the Next.js frontend dev server.
# Press Ctrl+C to terminate all services safely.

$ErrorActionPreference = "Stop"

# Define ports
$PORT_PUBLIC_RPC = 8547
$PORT_PRIVATE_RPC = 8546
$PORT_BACKEND = 8000
$PORT_FRONTEND = 3000

function Clean-Processes {
    Write-Host "Stopping existing background processes..."
    # Find and stop processes by local port connections
    foreach ($port in @($PORT_PUBLIC_RPC, $PORT_PRIVATE_RPC, $PORT_BACKEND, $PORT_FRONTEND)) {
        $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($conn) {
            foreach ($c in $conn) {
                if ($c.OwningProcess -gt 0) {
                    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
}

Write-Host "=== [1/5] Stopping existing background processes ==="
Clean-Processes
Start-Sleep -Milliseconds 1500

Write-Host "=== [2/5] Cleaning local SQLite database and mock IPFS assets ==="
if (Test-Path "backend/iheritage.db") {
    Remove-Item -Path "backend/iheritage.db" -Force -ErrorAction SilentlyContinue
}
if (Test-Path "backend/static") {
    Remove-Item -Path "backend/static/*" -Recurse -Force -ErrorAction SilentlyContinue
} else {
    New-Item -ItemType Directory -Path "backend/static" -Force -ErrorAction SilentlyContinue
}

try {
    Write-Host "=== [3/5] Starting Dual Anvil Local Blockchains ==="
    Write-Host "Starting Public Anchoring Node on port $PORT_PUBLIC_RPC (Chain ID 31338)..."
    Start-Process -FilePath "anvil" -ArgumentList "--port $PORT_PUBLIC_RPC", "--chain-id 31338" -NoNewWindow -RedirectStandardOutput "anvil_public.log" -RedirectStandardError "anvil_public.err.log"

    Write-Host "Starting Private Trading Node on port $PORT_PRIVATE_RPC (Chain ID 9999)..."
    Start-Process -FilePath "anvil" -ArgumentList "--port $PORT_PRIVATE_RPC", "--chain-id 9999" -NoNewWindow -RedirectStandardOutput "anvil_private.log" -RedirectStandardError "anvil_private.err.log"

    # Wait for Anvil nodes to start responding
    Write-Host "Waiting for RPC nodes to be ready..."
    $rpcBody = '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
    while ($true) {
        try {
            $response = Invoke-RestMethod -Uri "http://127.0.0.1:$PORT_PUBLIC_RPC" -Method Post -ContentType "application/json" -Body $rpcBody -ErrorAction Stop
            break
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    while ($true) {
        try {
            $response = Invoke-RestMethod -Uri "http://127.0.0.1:$PORT_PRIVATE_RPC" -Method Post -ContentType "application/json" -Body $rpcBody -ErrorAction Stop
            break
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    Write-Host "RPC nodes are online!"

    Write-Host "=== [4/5] Compiling and Deploying Smart Contracts ==="
    Set-Location contracts

    # Run deployment script on Public Chain
    Write-Host "Deploying MasterNFT to Public Anchoring Layer..."
    forge script script/DeployAll.s.sol --rpc-url "http://127.0.0.1:$PORT_PUBLIC_RPC" --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --slow

    # Run deployment script on Private Chain
    Write-Host "Deploying FragmentMarketplace to Private Trading Layer..."
    forge script script/DeployAll.s.sol --rpc-url "http://127.0.0.1:$PORT_PRIVATE_RPC" --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --slow

    # Write deployed addresses json
    Set-Content -Path "deployed_addresses.json" -Value '{"MasterNFT": "0x5FbDB2315678afecb367f032d93F642f64180aa3", "FragmentMarketplace": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"}'
    Set-Location ..

    Write-Host "=== [5/5] Starting Backend and Frontend Servers ==="
    Write-Host "Starting Python FastAPI Backend..."
    Set-Location backend
    Start-Process -FilePath "$PSScriptRoot\backend\.venv\Scripts\python.exe" -ArgumentList "-m uvicorn app.main:app --host 127.0.0.1 --port $PORT_BACKEND" -NoNewWindow -RedirectStandardOutput "backend.log" -RedirectStandardError "backend.err.log"
    Set-Location ..

    # Wait for backend to start responding
    while ($true) {
        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:$PORT_BACKEND/docs" -UseBasicParsing -ErrorAction Stop
            break
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    Write-Host "FastAPI Backend is online!"

    Write-Host "Starting Next.js Frontend dev server..."
    Set-Location frontend
    Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -NoNewWindow
    Set-Location ..

    Write-Host "--------------------------------------------------------"
    Write-Host "All systems running! Logs are piped to:"
    Write-Host "  - Public Anvil: anvil_public.log"
    Write-Host "  - Private Anvil: anvil_private.log"
    Write-Host "  - Python Backend: backend/backend.log"
    Write-Host "  - Next.js Frontend: Console/background output"
    Write-Host "--------------------------------------------------------"
    Write-Host "Press [Ctrl+C] or close this terminal to stop all services."

    # Loop to keep the script running
    while ($true) {
        Start-Sleep -Seconds 1
    }

} finally {
    Write-Host "`n=== Shutting down all local development services ==="
    Clean-Processes
    Write-Host "Done. All services terminated safely."
}
