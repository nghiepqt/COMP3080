// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import "forge-std/Test.sol";
import "../src/MasterNFT.sol";
import "../src/FragmentMarketplace.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";

contract MarketplaceTest is Test {
    MasterNFT public masterNFT;
    FragmentMarketplace public marketplace;

    address public museum = address(0x1111);
    address public buyer1 = address(0x2222);
    address public buyer2 = address(0x3333);

    // Allow this contract to receive native ETH fees
    receive() external payable {}

    function setUp() public {
        masterNFT = new MasterNFT();
        marketplace = new FragmentMarketplace();

        // Grant MUSEUM_ROLE to museum
        masterNFT.grantRole(masterNFT.MUSEUM_ROLE(), museum);
        marketplace.grantRole(marketplace.MUSEUM_ROLE(), museum);

        // Label addresses for better trace logging
        vm.label(museum, "Museum");
        vm.label(buyer1, "Buyer1");
        vm.label(buyer2, "Buyer2");

        // Fund accounts
        vm.deal(museum, 10 ether);
        vm.deal(buyer1, 10 ether);
        vm.deal(buyer2, 10 ether);
    }

    function testMasterMint() public {
        vm.startPrank(museum);
        uint256 tokenId = masterNFT.mintMasterNFT("ipfs://master-artwork-uri");
        assertEq(tokenId, 1);
        assertEq(masterNFT.ownerOf(tokenId), museum);
        assertEq(masterNFT.tokenURI(tokenId), "ipfs://master-artwork-uri");
        vm.stopPrank();
    }

    function testInitializeFragments() public {
        vm.startPrank(museum);
        
        string[] memory uris = new string[](3);
        uris[0] = "ipfs://fragment-1";
        uris[1] = "ipfs://fragment-2";
        uris[2] = "ipfs://fragment-3";

        bool[] memory reserved = new bool[](3);
        reserved[0] = false;
        reserved[1] = true;
        reserved[2] = false;

        marketplace.initializeFragments(42, 3, uris, reserved, museum);

        assertEq(marketplace.ownerOf(1), museum);
        assertEq(marketplace.ownerOf(2), museum);
        assertEq(marketplace.ownerOf(3), museum);

        assertEq(marketplace.tokenURI(1), "ipfs://fragment-1");
        assertEq(marketplace.tokenToArtwork(1), 42);
        assertTrue(marketplace.isReservedByMuseum(2));
        assertFalse(marketplace.isReservedByMuseum(1));

        vm.stopPrank();
    }

    function testListingAndBuying() public {
        // Initialize fragments
        vm.startPrank(museum);
        string[] memory uris = new string[](1);
        uris[0] = "ipfs://fragment-1";
        bool[] memory reserved = new bool[](1);
        reserved[0] = false;
        marketplace.initializeFragments(1, 1, uris, reserved, museum);

        // List fragment
        marketplace.listFragment(1, 1 ether);
        
        // Assert listing state
        (address seller, uint256 price, bool active) = marketplace.listings(1);
        assertEq(seller, museum);
        assertEq(price, 1 ether);
        assertTrue(active);
        
        // Since it's listed, contract should hold the token
        assertEq(marketplace.ownerOf(1), address(marketplace));
        vm.stopPrank();

        // Buy fragment (Flow 1: Primary Listing, Buyer pays P + 5% platform fee)
        vm.startPrank(buyer1);
        uint256 initialSellerBalance = museum.balance;
        uint256 initPlatformBal = address(this).balance;
        
        marketplace.buyFragment{value: 1.05 ether}(1);

        // Assert ownership & balance change
        assertEq(marketplace.ownerOf(1), buyer1);
        assertEq(museum.balance - initialSellerBalance, 1 ether); // Primary: Museum receives 100% P
        assertEq(address(this).balance - initPlatformBal, 0.05 ether); // Platform receives 5% P

        // Listing should be inactive
        (, , active) = marketplace.listings(1);
        assertFalse(active);

        vm.stopPrank();
    }

    function testCancelListing() public {
        // Initialize and list
        vm.startPrank(museum);
        string[] memory uris = new string[](1);
        uris[0] = "ipfs://fragment-1";
        bool[] memory reserved = new bool[](1);
        reserved[0] = false;
        marketplace.initializeFragments(1, 1, uris, reserved, museum);
        marketplace.listFragment(1, 1 ether);
        
        // Cancel listing
        marketplace.cancelListing(1);
        
        // Owner should be museum again
        assertEq(marketplace.ownerOf(1), museum);
        
        (, , bool active) = marketplace.listings(1);
        assertFalse(active);
        
        vm.stopPrank();
    }

    function testBidding() public {
        // Initialize fragment
        vm.startPrank(museum);
        string[] memory uris = new string[](1);
        uris[0] = "ipfs://fragment-1";
        bool[] memory reserved = new bool[](1);
        reserved[0] = false;
        marketplace.initializeFragments(1, 1, uris, reserved, museum);
        vm.stopPrank();

        // Place bid from buyer1 (Flow 2: Primary OTC Bid. Bidder sends B. No fee on top)
        vm.startPrank(buyer1);
        marketplace.placeBid{value: 1.5 ether}(1);
        vm.stopPrank();

        // Check bid variables
        (uint256 bidId, uint256 bidTokenId, address bidder, uint256 amount, bool active, ) = marketplace.bids(1);
        assertEq(bidId, 1);
        assertEq(bidTokenId, 1);
        assertEq(bidder, buyer1);
        assertEq(amount, 1.5 ether);
        assertTrue(active);

        // Check escrow balance
        assertEq(address(marketplace).balance, 1.5 ether);

        // Accept bid from museum (Museum receives 95% B, Platform receives 5% B)
        vm.startPrank(museum);
        uint256 initMuseumBal = museum.balance;
        uint256 initPlatformBal = address(this).balance;
        
        marketplace.acceptBid(1);
        
        assertEq(marketplace.ownerOf(1), buyer1);
        assertEq(museum.balance - initMuseumBal, 1.425 ether); // 95% of 1.5 ether
        assertEq(address(this).balance - initPlatformBal, 0.075 ether); // 5% of 1.5 ether

        // Bid should be deactivated
        (, , , , active, ) = marketplace.bids(1);
        assertFalse(active);
        
        vm.stopPrank();
    }

    function testCancelBid() public {
        // Initialize
        vm.startPrank(museum);
        string[] memory uris = new string[](1);
        uris[0] = "ipfs://fragment-1";
        bool[] memory reserved = new bool[](1);
        reserved[0] = false;
        marketplace.initializeFragments(1, 1, uris, reserved, museum);
        vm.stopPrank();

        // Bid
        vm.startPrank(buyer1);
        uint256 initBuyerBal = buyer1.balance;
        marketplace.placeBid{value: 2 ether}(1);
        
        // Cancel
        marketplace.cancelBid(1);
        assertEq(buyer1.balance, initBuyerBal);
        
        (, , , , bool active, ) = marketplace.bids(1);
        assertFalse(active);
        vm.stopPrank();
    }

    function testSecondaryListingAndBuying() public {
        // Initialize
        vm.startPrank(museum);
        string[] memory uris = new string[](1);
        uris[0] = "ipfs://fragment-1";
        bool[] memory reserved = new bool[](1);
        reserved[0] = false;
        marketplace.initializeFragments(1, 1, uris, reserved, museum);
        // Must list first so buyer1 can acquire the token
        marketplace.listFragment(1, 1 ether);
        vm.stopPrank();

        // 1. Primary Buy to get token to buyer1
        vm.startPrank(buyer1);
        marketplace.buyFragment{value: 1.05 ether}(1);
        assertEq(marketplace.ownerOf(1), buyer1);
        vm.stopPrank();

        // 2. Secondary List by buyer1 at 2 ether
        vm.startPrank(buyer1);
        marketplace.listFragment(1, 2 ether);
        vm.stopPrank();

        // 3. Buy by buyer2 (Flow 3: Secondary Listing, buyer pays P + 5% P, seller gets 93% P, museum 7%, platform 5%)
        uint256 initSellerBal = buyer1.balance;
        uint256 initMuseumBal = museum.balance;
        uint256 initPlatformBal = address(this).balance;

        vm.startPrank(buyer2);
        marketplace.buyFragment{value: 2.1 ether}(1);
        vm.stopPrank();

        // Assert ownership & splits
        assertEq(marketplace.ownerOf(1), buyer2);
        assertEq(buyer1.balance - initSellerBal, 1.86 ether); // 93% of 2 ether
        assertEq(museum.balance - initMuseumBal, 0.14 ether); // 7% of 2 ether
        assertEq(address(this).balance - initPlatformBal, 0.10 ether); // 5% of 2 ether
    }

    function testSecondaryBidding() public {
        // Initialize
        vm.startPrank(museum);
        string[] memory uris = new string[](1);
        uris[0] = "ipfs://fragment-1";
        bool[] memory reserved = new bool[](1);
        reserved[0] = false;
        marketplace.initializeFragments(1, 1, uris, reserved, museum);
        // Must list first so buyer1 can acquire the token
        marketplace.listFragment(1, 1 ether);
        vm.stopPrank();

        // Primary Buy to buyer1
        vm.startPrank(buyer1);
        marketplace.buyFragment{value: 1.05 ether}(1);
        vm.stopPrank();

        // Bid by buyer2 (Flow 3: Secondary OTC Bid. Bidder pays B + 5% B = 1.05 ether)
        vm.startPrank(buyer2);
        marketplace.placeBid{value: 1.05 ether}(1);
        vm.stopPrank();

        // Accept bid by buyer1
        uint256 initSellerBal = buyer1.balance;
        uint256 initMuseumBal = museum.balance;
        uint256 initPlatformBal = address(this).balance;

        vm.startPrank(buyer1);
        marketplace.acceptBid(1);
        vm.stopPrank();

        assertEq(marketplace.ownerOf(1), buyer2);
        assertEq(buyer1.balance - initSellerBal, 0.93 ether); // 93% of 1 ether
        assertEq(museum.balance - initMuseumBal, 0.07 ether); // 7% of 1 ether
        assertEq(address(this).balance - initPlatformBal, 0.05 ether); // 5% of 1 ether
    }

    function testRarityReservationGuards() public {
        vm.startPrank(museum);
        string[] memory uris = new string[](2);
        uris[0] = "ipfs://fragment-1";
        uris[1] = "ipfs://fragment-2";
        bool[] memory reserved = new bool[](2);
        reserved[0] = true;
        reserved[1] = false;
        marketplace.initializeFragments(1, 2, uris, reserved, museum);

        // Try to list reserved fragment 1
        vm.expectRevert("Fragment is reserved by museum");
        marketplace.listFragment(1, 1 ether);

        // Try to list unreserved fragment 2
        marketplace.listFragment(2, 1 ether);
        vm.stopPrank();

        // Try to bid on reserved fragment 1
        vm.startPrank(buyer1);
        vm.expectRevert("Fragment is reserved by museum");
        marketplace.placeBid{value: 1.05 ether}(1);

        // Bid on unreserved fragment 2 (already listed)
        marketplace.placeBid{value: 1.05 ether}(2);
        vm.stopPrank();
    }

    function testMintMasterNFTUnauthorized() public {
        vm.startPrank(buyer1);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                buyer1,
                masterNFT.MUSEUM_ROLE()
            )
        );
        masterNFT.mintMasterNFT("ipfs://some-uri");
        vm.stopPrank();
    }

    function testInitializeFragmentsUnauthorized() public {
        vm.startPrank(buyer1);
        string[] memory uris = new string[](1);
        uris[0] = "ipfs://fragment-1";
        bool[] memory reserved = new bool[](1);
        reserved[0] = false;
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                buyer1,
                marketplace.MUSEUM_ROLE()
            )
        );
        marketplace.initializeFragments(1, 1, uris, reserved, buyer1);
        vm.stopPrank();
    }
}
