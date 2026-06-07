// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract FragmentMarketplace is ERC721URIStorage, AccessControl {
    uint256 private _tokenIds;
    uint256 private _bidIds;

    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

    struct Bid {
        uint256 bidId;
        uint256 tokenId;
        address bidder;
        uint256 amount;
        bool active;
    }

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Bid) public bids;
    mapping(uint256 => uint256) public tokenToArtwork;

    // Split-Fee & Rarity Reservation State
    uint256 public platformFeeBasisPoints; // e.g. 500 = 5%
    uint256 public museumRoyaltyBasisPoints; // e.g. 700 = 7%
    address public platformVault;

    mapping(uint256 => address) public artworkToMuseum;
    mapping(uint256 => bool) public isReservedByMuseum;

    event FragmentInitialized(uint256 indexed artworkId, uint256 indexed tokenId, string tokenURI, address indexed owner);
    event FragmentListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    
    // Updated events to log exact fee breakdowns
    event FragmentSold(
        uint256 indexed tokenId,
        address indexed buyer,
        address indexed seller,
        uint256 price,
        uint256 platformFeePaid,
        uint256 museumRoyaltyPaid
    );
    event BidPlaced(uint256 indexed bidId, uint256 indexed tokenId, address indexed bidder, uint256 amount);
    event BidCancelled(uint256 indexed bidId, uint256 indexed tokenId, address indexed bidder);
    event BidAccepted(
        uint256 indexed bidId,
        uint256 indexed tokenId,
        address indexed buyer,
        address seller,
        uint256 price,
        uint256 platformFeePaid,
        uint256 museumRoyaltyPaid
    );

    bytes32 public constant MUSEUM_ROLE = keccak256("MUSEUM_ROLE");

    constructor() ERC721("iHeritage Fragment NFT", "HFRAG") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MUSEUM_ROLE, msg.sender);
        
        platformFeeBasisPoints = 500; // 5%
        museumRoyaltyBasisPoints = 700; // 7%
        platformVault = msg.sender;
    }

    // Admin setters
    function setFees(uint256 _platformFeeBasisPoints, uint256 _museumRoyaltyBasisPoints) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_platformFeeBasisPoints + _museumRoyaltyBasisPoints <= 10000, "Fees exceed 100%");
        platformFeeBasisPoints = _platformFeeBasisPoints;
        museumRoyaltyBasisPoints = _museumRoyaltyBasisPoints;
    }

    function setPlatformVault(address _platformVault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_platformVault != address(0), "Zero address");
        platformVault = _platformVault;
    }

    function initializeFragments(
        uint256 artworkId,
        uint256 totalFragments,
        string[] memory tokenURIs,
        bool[] memory reservedFlags,
        address receiver
    ) external onlyRole(MUSEUM_ROLE) {
        require(tokenURIs.length == totalFragments, "URIs count mismatch");
        require(reservedFlags.length == totalFragments, "Flags count mismatch");
        
        artworkToMuseum[artworkId] = receiver;
        
        for (uint256 i = 0; i < totalFragments; i++) {
            _tokenIds++;
            uint256 newFragmentId = _tokenIds;
            _safeMint(receiver, newFragmentId);
            _setTokenURI(newFragmentId, tokenURIs[i]);
            tokenToArtwork[newFragmentId] = artworkId;

            if (reservedFlags[i]) {
                isReservedByMuseum[newFragmentId] = true;
            }

            emit FragmentInitialized(artworkId, newFragmentId, tokenURIs[i], receiver);
        }
    }

    function listFragment(uint256 tokenId, uint256 price) external {
        require(!isReservedByMuseum[tokenId], "Fragment is reserved by museum");
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        require(price > 0, "Price must be greater than zero");

        // Transfer token to contract for escrow
        _transfer(msg.sender, address(this), tokenId);

        listings[tokenId] = Listing({
            seller: msg.sender,
            price: price,
            active: true
        });

        emit FragmentListed(tokenId, msg.sender, price);
    }

    function cancelListing(uint256 tokenId) external {
        Listing memory listing = listings[tokenId];
        require(listing.active, "Listing not active");
        require(listing.seller == msg.sender, "Not the seller");

        delete listings[tokenId];

        // Return token to seller
        _transfer(address(this), msg.sender, tokenId);

        emit ListingCancelled(tokenId, msg.sender);
    }

    function buyFragment(uint256 tokenId) external payable {
        Listing memory listing = listings[tokenId];
        require(listing.active, "Listing not active");

        address seller = listing.seller;
        uint256 price = listing.price;
        uint256 artworkId = tokenToArtwork[tokenId];
        address museum = artworkToMuseum[artworkId];

        // Determine if this is a Primary (from Museum Vault) or Secondary (from Collector) sale
        bool isPrimary = (seller == museum);

        uint256 requiredValue;
        uint256 platformCut;
        uint256 museumCut;
        uint256 sellerShare;

        if (isPrimary) {
            // Flow 1: Buyer pays P + 5% P. Msg value must be >= 1.05 * P
            platformCut = (price * platformFeeBasisPoints) / 10000;
            requiredValue = price + platformCut;
            require(msg.value >= requiredValue, "Insufficient payment with buyer fee");

            museumCut = 0;
            sellerShare = price; // Museum receives 100% P
        } else {
            // Flow 3: Buyer pays P + 5% P. Msg value must be >= 1.05 * P
            platformCut = (price * platformFeeBasisPoints) / 10000;
            requiredValue = price + platformCut;
            require(msg.value >= requiredValue, "Insufficient payment with buyer fee");

            museumCut = (price * museumRoyaltyBasisPoints) / 10000;
            sellerShare = price - museumCut; // Seller receives 93% P
        }

        // Clear listing
        delete listings[tokenId];

        // Transfer token to buyer
        _transfer(address(this), msg.sender, tokenId);

        // Transfer funds
        if (platformCut > 0 && platformVault != address(0)) {
            payable(platformVault).transfer(platformCut);
        }
        if (museumCut > 0 && museum != address(0)) {
            payable(museum).transfer(museumCut);
        }
        payable(seller).transfer(sellerShare);

        // Refund excess payment
        if (msg.value > requiredValue) {
            payable(msg.sender).transfer(msg.value - requiredValue);
        }

        emit FragmentSold(tokenId, msg.sender, seller, price, platformCut, museumCut);
    }

    function placeBid(uint256 tokenId) external payable {
        require(!isReservedByMuseum[tokenId], "Fragment is reserved by museum");
        require(msg.value > 0, "Bid must be greater than zero");
        
        // Cannot bid if you currently own it
        address currentOwner;
        if (listings[tokenId].active) {
            currentOwner = listings[tokenId].seller;
        } else {
            currentOwner = ownerOf(tokenId);
        }
        require(currentOwner != msg.sender, "Cannot bid on own fragment");

        uint256 artworkId = tokenToArtwork[tokenId];
        address museum = artworkToMuseum[artworkId];
        bool isPrimary = (currentOwner == museum);

        uint256 baseAmount;
        if (isPrimary) {
            // Flow 2: No buyer fee on top. The bid amount is msg.value
            baseAmount = msg.value;
        } else {
            // Flow 3: Buyer pays 5% platform fee on top of bid amount B
            // msg.value = B * 1.05 => B = msg.value * 10000 / 10500
            baseAmount = (msg.value * 10000) / 10500;
        }

        _bidIds++;
        bids[_bidIds] = Bid({
            bidId: _bidIds,
            tokenId: tokenId,
            bidder: msg.sender,
            amount: baseAmount,
            active: true
        });

        emit BidPlaced(_bidIds, tokenId, msg.sender, baseAmount);
    }

    function cancelBid(uint256 bidId) external {
        Bid memory bid = bids[bidId];
        require(bid.active, "Bid not active");
        require(bid.bidder == msg.sender, "Not the bidder");

        bids[bidId].active = false;

        // Determine if this was primary or secondary
        uint256 tokenId = bid.tokenId;
        address currentOwner;
        if (listings[tokenId].active) {
            currentOwner = listings[tokenId].seller;
        } else {
            currentOwner = ownerOf(tokenId);
        }
        uint256 artworkId = tokenToArtwork[tokenId];
        address museum = artworkToMuseum[artworkId];
        bool isPrimary = (currentOwner == museum);

        uint256 refundAmount;
        if (isPrimary) {
            refundAmount = bid.amount;
        } else {
            refundAmount = bid.amount + (bid.amount * platformFeeBasisPoints) / 10000;
        }

        // Refund bidder
        payable(msg.sender).transfer(refundAmount);

        emit BidCancelled(bidId, bid.tokenId, msg.sender);
    }

    function acceptBid(uint256 bidId) external {
        Bid memory bid = bids[bidId];
        require(bid.active, "Bid not active");

        uint256 tokenId = bid.tokenId;
        address tokenOwner;
        bool isListed = listings[tokenId].active;

        if (isListed) {
            tokenOwner = listings[tokenId].seller;
        } else {
            tokenOwner = ownerOf(tokenId);
        }

        require(msg.sender == tokenOwner, "Not the token owner");

        // Deactivate bid
        bids[bidId].active = false;

        if (isListed) {
            delete listings[tokenId];
        }

        uint256 artworkId = tokenToArtwork[tokenId];
        address museumAddress = artworkToMuseum[artworkId];

        // Determine if this is a Primary (from Museum Vault) or Secondary (from Collector) sale
        bool isPrimary = (tokenOwner == museumAddress);

        uint256 platformCut;
        uint256 museumCut;
        uint256 sellerShare;

        if (isPrimary) {
            platformCut = (bid.amount * platformFeeBasisPoints) / 10000;
            museumCut = bid.amount - platformCut;
            sellerShare = 0;

            if (platformCut > 0 && platformVault != address(0)) {
                payable(platformVault).transfer(platformCut);
            }
            if (museumCut > 0 && museumAddress != address(0)) {
                payable(museumAddress).transfer(museumCut);
            }
        } else {
            platformCut = (bid.amount * platformFeeBasisPoints) / 10000;
            museumCut = (bid.amount * museumRoyaltyBasisPoints) / 10000;
            sellerShare = bid.amount - museumCut;

            if (platformCut > 0 && platformVault != address(0)) {
                payable(platformVault).transfer(platformCut);
            }
            if (museumCut > 0 && museumAddress != address(0)) {
                payable(museumAddress).transfer(museumCut);
            }
            if (sellerShare > 0 && tokenOwner != address(0)) {
                payable(tokenOwner).transfer(sellerShare);
            }
        }

        _transfer(ownerOf(tokenId), bid.bidder, tokenId);

        emit BidAccepted(bidId, tokenId, bid.bidder, tokenOwner, bid.amount, platformCut, museumCut);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
