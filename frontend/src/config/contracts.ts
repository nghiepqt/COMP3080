export const CONTRACT_ADDRESSES = {
  // Local Anvil Public Network (foundry)
  31338: {
    MasterNFT: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    Marketplace: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
  },
  // Local Anvil Private Network (foundry)
  9999: {
    MasterNFT: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    Marketplace: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
  },
  // Amoy Testnet
  80002: {
    MasterNFT: "0x0f2C0637F55fD7B1a1E13d09aDe16f39385B20e3", // Placeholder
    Marketplace: "0xd47565d705c10be1413e67e1bb143e90bb3f0111" // Placeholder
  }
} as const;

export type SupportedChainId = keyof typeof CONTRACT_ADDRESSES;
