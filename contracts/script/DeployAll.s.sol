// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Script} from "forge-std/Script.sol";
import {MasterNFT} from "../src/MasterNFT.sol";
import {FragmentMarketplace} from "../src/FragmentMarketplace.sol";

contract DeployAllScript is Script {
    MasterNFT public masterNFT;
    FragmentMarketplace public marketplace;

    address public constant MUSEUM_ADDRESS = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        masterNFT = new MasterNFT();
        marketplace = new FragmentMarketplace();

        // Grant MUSEUM_ROLE to the Museum Address explicitly on both contracts
        masterNFT.grantRole(masterNFT.MUSEUM_ROLE(), MUSEUM_ADDRESS);
        marketplace.grantRole(marketplace.MUSEUM_ROLE(), MUSEUM_ADDRESS);

        vm.stopBroadcast();
    }
}
