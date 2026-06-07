// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Script} from "forge-std/Script.sol";
import {MasterNFT} from "../src/MasterNFT.sol";
import {FragmentMarketplace} from "../src/FragmentMarketplace.sol";

contract DeployAllScript is Script {
    MasterNFT public masterNFT;
    FragmentMarketplace public marketplace;

    function setUp() public {}

    function run() public {
        // Fetch museum address from env, or default to Anvil Account #0
        address museumAddress = vm.envOr("MUSEUM_ADDRESS", address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266));

        vm.startBroadcast();

        masterNFT = new MasterNFT();
        marketplace = new FragmentMarketplace();

        // Grant MUSEUM_ROLE to the Museum Address explicitly on both contracts
        masterNFT.grantRole(masterNFT.MUSEUM_ROLE(), museumAddress);
        marketplace.grantRole(marketplace.MUSEUM_ROLE(), museumAddress);

        vm.stopBroadcast();
    }
}
