// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract MasterNFT is ERC721URIStorage, AccessControl {
    uint256 private _tokenIds;

    bytes32 public constant MUSEUM_ROLE = keccak256("MUSEUM_ROLE");

    event MasterMinted(uint256 indexed tokenId, string tokenURI, address indexed museum);

    constructor() ERC721("iHeritage Master NFT", "HMAS") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MUSEUM_ROLE, msg.sender);
    }

    function mintMasterNFT(string memory tokenURI) public onlyRole(MUSEUM_ROLE) returns (uint256) {
        _tokenIds++;
        uint256 newItemId = _tokenIds;
        _safeMint(msg.sender, newItemId);
        _setTokenURI(newItemId, tokenURI);

        emit MasterMinted(newItemId, tokenURI, msg.sender);

        return newItemId;
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

