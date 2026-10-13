// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title ChogMint
/// @notice 1500-supply ERC721 with a team phase, Merkle-gated stages, and delayed reveal.
contract ChogMint is ERC721, ERC2981, AccessControl, ReentrancyGuard {
    using Strings for uint256;

    // ---------------------------------------------------------------- errors

    error InvalidStage();
    error ZeroQuantity();
    error ZeroAddress();
    error InvalidSupply();
    error StageNotOpen();
    error NotEligible();
    error WrongPayment();
    error WalletLimitExceeded();
    error SupplyExceeded();
    error ReserveExceeded();
    error CapsExceedSupply();
    error AlreadyRevealed();
    error InvalidSchedule();
    error WithdrawFailed();
    error InvalidAllotment();
    error ProvenanceNotSet();
    error ProvenanceAlreadySet();
    error InvalidProvenance();
    error MetadataFrozen();

    // ---------------------------------------------------------------- types

    struct Stage {
        bytes32 merkleRoot; // slot 1; zero means ungated / mapping-gated
        uint40 start; // slot 2
        uint40 end; //   zero means no end
        uint16 cap;
        uint16 minted;
        uint8 maxPerWallet;
        uint96 price;
    }

    struct InitParams {
        string name;
        string symbol;
        uint256 maxSupply;
        uint256 reserveMax;
        address treasury;
        address teamMain;
        uint96 royaltyBps;
        string placeholderURI;
        address[] admins;
        uint16[6] caps;
        uint8[6] maxPerWallet;
        uint96[6] prices;
    }

    // ------------------------------------------------------------- constants

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    uint8 public constant STAGE_COUNT = 6;
    uint8 public constant STAGE_TEAM = 0;
    uint8 public constant STAGE_GTD = 1;
    uint8 public constant STAGE_CHEST = 2;
    uint8 public constant STAGE_ROLES = 3;
    uint8 public constant STAGE_FCFS = 4;
    uint8 public constant STAGE_PUBLIC = 5;
    uint8 public constant NO_STAGE = type(uint8).max;
    uint8 public constant TEAM_MAIN_MAX = 170;
    uint8 public constant TEAM_MEMBER_MAX = 15;

    // --------------------------------------------------------------- storage

    uint256 public immutable maxSupply;
    uint256 public immutable reserveMax;

    Stage[6] private _stages;

    /// @dev Six uint16 running-sum caps packed low-to-high.
    uint96 private _cumCaps;

    /// @dev One uint8 per stage, packed low-to-high.
    mapping(address => uint64) private _walletMinted;

    /// @dev Team phase allotment. 0 = not on the team list.
    mapping(address => uint8) public teamAllotment;

    uint128 public stageMinted;
    uint128 public reserveMinted;

    address public treasury;
    address public teamMain;
    string public placeholderURI;
    string public baseURI;
    bool public revealed;

    bytes32 public provenanceHash;
    uint256 public startingIndex;

    // ---------------------------------------------------------------- events

    event Minted(address indexed to, uint8 indexed stage, uint256 qty, uint256 firstTokenId);
    event StageRootSet(uint8 indexed stage, bytes32 root);
    event StageConfigSet(uint8 indexed stage, uint16 cap, uint8 maxPerWallet, uint96 price);
    event StageWindowSet(uint8 indexed stage, uint40 start, uint40 end);
    event ScheduleSet(uint40 start, uint32[6] durations);
    event StageOpened(uint8 indexed stage);
    event Revealed(string baseURI, uint256 startingIndex);
    event BaseURISet(string baseURI);
    event PlaceholderURISet(string uri);
    event TreasurySet(address treasury);
    event TeamMainSet(address teamMain);
    event TeamAllotmentSet(address indexed account, uint8 amount);
    event RoyaltySet(address receiver, uint96 bps);
    event Withdrawn(address to, uint256 amount);
    event ProvenanceHashSet(bytes32 hash);

    // ----------------------------------------------------------- constructor

    constructor(InitParams memory p) ERC721(p.name, p.symbol) {
        if (p.treasury == address(0) || p.teamMain == address(0)) revert ZeroAddress();
        if (p.maxSupply == 0 || p.maxSupply > type(uint16).max) revert InvalidSupply();
        if (p.reserveMax > p.maxSupply) revert InvalidSupply();

        maxSupply = p.maxSupply;
        reserveMax = p.reserveMax;
        treasury = p.treasury;
        teamMain = p.teamMain;
        placeholderURI = p.placeholderURI;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        for (uint256 i; i < p.admins.length; ++i) {
            if (p.admins[i] == address(0)) revert ZeroAddress();
            _grantRole(ADMIN_ROLE, p.admins[i]);
        }

        _setDefaultRoyalty(p.treasury, p.royaltyBps);

        for (uint8 i; i < STAGE_COUNT; ++i) {
            _stages[i].cap = p.caps[i];
            _stages[i].maxPerWallet = p.maxPerWallet[i];
            _stages[i].price = p.prices[i];
        }
        _recomputeCumCaps();
    }

    // ------------------------------------------------------------ view/pure

    function totalSupply() public view returns (uint256) {
        return uint256(stageMinted) + uint256(reserveMinted);
    }

    function stageInfo(uint8 stage) external view returns (Stage memory) {
        if (stage >= STAGE_COUNT) revert InvalidStage();
        return _stages[stage];
    }

    function mintedBy(address account, uint8 stage) external view returns (uint256) {
        if (stage >= STAGE_COUNT) revert InvalidStage();
        return _mintedBy(account, stage);
    }

    /**
     * Every token this address owns, in one call.
     *
     * The contract is not ERC721Enumerable, and the `Minted` log history cannot be
     * replayed either: Monad's RPC rejects any `eth_getLogs` spanning more than 100
     * blocks. That left the UI reconstructing a wallet's tokens from browser storage plus
     * one `ownerOf` per token -- dozens of parallel calls against a rate-limited endpoint,
     * where a single failure silently dropped a token and the list changed on every
     * refresh.
     *
     * A linear scan is fine HERE because this is a `view`: it costs no gas, runs in one
     * `eth_call`, and `maxSupply` is small and fixed. Never call it from a transaction.
     */
    function tokensOfOwner(address owner) external view returns (uint256[] memory ids) {
        uint256 supply = totalSupply();
        uint256 owned = balanceOf(owner);
        ids = new uint256[](owned);
        if (owned == 0) return ids;

        uint256 found;
        for (uint256 id = 1; id <= supply; ++id) {
            if (_ownerOf(id) == owner) {
                ids[found] = id;
                // Stop the moment the balance is accounted for.
                if (++found == owned) break;
            }
        }
    }

    /**
     * How much this address has minted in EVERY stage, in one call.
     *
     * The per-stage counters already live in a single packed slot, so returning them
     * together costs one SLOAD instead of six round trips. The UI needs all six to decide
     * what a wallet may still mint, and fetching them separately meant a single failed
     * request read as "minted nothing" -- which offered a full allowance to a wallet that
     * had already used it.
     */
    function mintedByAll(address account) external view returns (uint256[6] memory counts) {
        uint256 packed = uint256(_walletMinted[account]);
        for (uint256 i; i < STAGE_COUNT; ++i) {
            counts[i] = (packed >> (i * 8)) & 0xFF;
        }
    }

    function metadataId(uint256 id) public view returns (uint256) {
        if (!revealed) return id;
        return ((id - 1 + startingIndex) % maxSupply) + 1;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC2981, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ------------------------------------------------------------------ mint

    /// @param stage      0 TEAM, 1 GTD, 2 CHEST, 3 ROLES, 4 FCFS, 5 PUBLIC.
    /// @param qty        Number of tokens to mint.
    /// @param allotment  GTD per-wallet allowance encoded in the Merkle leaf.
    ///                   Ignored for every other stage; pass 0.
    /// @param proof      Merkle proof for gated stages. Ignored for TEAM and PUBLIC.
    function mint(uint8 stage, uint256 qty, uint8 allotment, bytes32[] calldata proof)
        external
        payable
        nonReentrant
    {
        if (stage >= STAGE_COUNT) revert InvalidStage();
        if (qty == 0) revert ZeroQuantity();

        Stage storage s = _stages[stage];

        uint40 start = s.start;
        if (start == 0 || block.timestamp < start) revert StageNotOpen();
        uint40 end = s.end;
        if (end != 0 && block.timestamp >= end) revert StageNotOpen();

        if (msg.value != uint256(s.price) * qty) revert WrongPayment();

        uint256 walletCap = uint256(s.maxPerWallet);
        if (stage == STAGE_TEAM) {
            uint8 allowed = teamAllotment[msg.sender];
            if (allowed == 0) revert NotEligible();
            walletCap = uint256(allowed);
        } else if (_leafCarriesAllotment(stage)) {
            // GTD and ROLES grant a PER-WALLET amount, so `maxPerWallet` is only a
            // ceiling — the real allowance is the allotment bound into the leaf below.
            if (allotment == 0 || allotment > s.maxPerWallet) revert InvalidAllotment();
            walletCap = uint256(allotment);
        }

        bytes32 root = s.merkleRoot;
        if (_requiresMerkle(stage) && root == bytes32(0)) revert NotEligible();
        if (root != bytes32(0)) {
            bytes32 leaf = _leafCarriesAllotment(stage)
                ? keccak256(abi.encode(msg.sender, allotment))
                : keccak256(abi.encode(msg.sender));
            if (!MerkleProof.verifyCalldata(proof, root, leaf)) {
                revert NotEligible();
            }
        }

        if (_mintedBy(msg.sender, stage) + qty > walletCap) revert WalletLimitExceeded();

        // `cap` is a HARD per-stage limit. Without this check a stage's real ceiling is
        // whatever the cumulative total allows, so an earlier stage under-minting silently
        // lets a later one mint far past its configured cap — Chest at cap 179 measured
        // 442 in the full-scale simulation, because GTD had left 263 unclaimed.
        if (uint256(s.minted) + qty > s.cap) revert SupplyExceeded();

        // The cumulative ceiling still bounds the WHOLE mint to maxSupply - reserveMax,
        // and is what lets a trailing stage soak up everything the earlier ones left.
        uint256 newStageMinted = uint256(stageMinted) + qty;
        if (newStageMinted > _cumCapOf(stage)) revert SupplyExceeded();

        uint256 firstId = totalSupply() + 1;
        if (firstId - 1 + qty > maxSupply) revert SupplyExceeded();

        _addMinted(msg.sender, stage, qty);
        s.minted = uint16(uint256(s.minted) + qty);
        stageMinted = uint128(newStageMinted);

        for (uint256 i; i < qty; ++i) {
            _safeMint(msg.sender, firstId + i);
        }

        emit Minted(msg.sender, stage, qty, firstId);
    }

    // -------------------------------------------------- admin: configuration

    function setStageRoot(uint8 stage, bytes32 root) external onlyRole(ADMIN_ROLE) {
        if (stage >= STAGE_COUNT) revert InvalidStage();
        _stages[stage].merkleRoot = root;
        emit StageRootSet(stage, root);
    }

    function setStageConfig(uint8 stage, uint16 cap, uint8 maxPerWallet_, uint96 price)
        external
        onlyRole(ADMIN_ROLE)
    {
        if (stage >= STAGE_COUNT) revert InvalidStage();
        Stage storage s = _stages[stage];
        s.cap = cap;
        s.maxPerWallet = maxPerWallet_;
        s.price = price;
        _recomputeCumCaps();
        emit StageConfigSet(stage, cap, maxPerWallet_, price);
    }

    /// @notice Writes six contiguous windows from one start plus six durations.
    /// @dev `durations[5] == 0` leaves PUBLIC open-ended.
    function setSchedule(uint40 start, uint32[6] calldata durations) external onlyRole(ADMIN_ROLE) {
        if (start == 0) revert InvalidSchedule();
        uint40 cursor = start;
        for (uint8 i; i < STAGE_COUNT; ++i) {
            _stages[i].start = cursor;
            if (i == STAGE_COUNT - 1 && durations[i] == 0) {
                _stages[i].end = 0;
            } else {
                if (durations[i] == 0) revert InvalidSchedule();
                cursor += uint40(durations[i]);
                _stages[i].end = cursor;
            }
        }
        emit ScheduleSet(start, durations);
    }

    function setStageWindow(uint8 stage, uint40 start, uint40 end) external onlyRole(ADMIN_ROLE) {
        if (stage >= STAGE_COUNT) revert InvalidStage();
        if (end != 0 && end <= start) revert InvalidSchedule();
        _stages[stage].start = start;
        _stages[stage].end = end;
        emit StageWindowSet(stage, start, end);
    }

    /// @notice Closes every stage and opens `stage` from now, with no end.
    function openStage(uint8 stage) external onlyRole(ADMIN_ROLE) {
        if (stage >= STAGE_COUNT) revert InvalidStage();
        uint40 ts = uint40(block.timestamp);
        if (ts == 0) ts = 1;
        for (uint8 i; i < STAGE_COUNT; ++i) {
            if (i == stage) {
                _stages[i].start = ts;
                _stages[i].end = 0;
            } else {
                _stages[i].start = 0;
                _stages[i].end = 0;
            }
        }
        emit StageOpened(stage);
    }

    function setPrice(uint96 price) external onlyRole(ADMIN_ROLE) {
        Stage storage s = _stages[STAGE_PUBLIC];
        s.price = price;
        emit StageConfigSet(STAGE_PUBLIC, s.cap, s.maxPerWallet, price);
    }

    function currentStage() external view returns (uint8) {
        for (uint8 i; i < STAGE_COUNT; ++i) {
            Stage storage s = _stages[i];
            if (s.start != 0 && block.timestamp >= s.start && (s.end == 0 || block.timestamp < s.end))
            {
                return i;
            }
        }
        return NO_STAGE;
    }

    function setTeamMain(address newMain) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newMain == address(0)) revert ZeroAddress();
        teamMain = newMain;
        emit TeamMainSet(newMain);
    }

    /// @notice Set how many TEAM tokens `account` may mint. 0 removes them.
    /// @dev The designated team main wallet may take up to 170; everyone else up to 15.
    function setTeamAllotment(address account, uint8 amount) external onlyRole(ADMIN_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        uint8 maxAllowed = account == teamMain ? TEAM_MAIN_MAX : TEAM_MEMBER_MAX;
        if (amount > maxAllowed) revert InvalidAllotment();
        teamAllotment[account] = amount;
        emit TeamAllotmentSet(account, amount);
    }

    function setTeamAllotments(address[] calldata accounts, uint8[] calldata amounts)
        external
        onlyRole(ADMIN_ROLE)
    {
        if (accounts.length != amounts.length) revert InvalidAllotment();
        for (uint256 i; i < accounts.length; ++i) {
            if (accounts[i] == address(0)) revert ZeroAddress();
            uint8 maxAllowed = accounts[i] == teamMain ? TEAM_MAIN_MAX : TEAM_MEMBER_MAX;
            if (amounts[i] > maxAllowed) revert InvalidAllotment();
            teamAllotment[accounts[i]] = amounts[i];
            emit TeamAllotmentSet(accounts[i], amounts[i]);
        }
    }

    function adminMint(address to, uint256 qty) external onlyRole(ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (qty == 0) revert ZeroQuantity();

        uint256 newReserveMinted = uint256(reserveMinted) + qty;
        if (newReserveMinted > reserveMax) revert ReserveExceeded();

        uint256 firstId = totalSupply() + 1;
        if (firstId - 1 + qty > maxSupply) revert SupplyExceeded();

        reserveMinted = uint128(newReserveMinted);

        for (uint256 i; i < qty; ++i) {
            _safeMint(to, firstId + i);
        }

        emit Minted(to, NO_STAGE, qty, firstId);
    }

    // -------------------------------------------------------------- metadata

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        if (!revealed) return placeholderURI;
        return string.concat(baseURI, metadataId(id).toString(), ".json");
    }

    function setPlaceholderURI(string calldata uri) external onlyRole(ADMIN_ROLE) {
        placeholderURI = uri;
        emit PlaceholderURISet(uri);
    }

    function setProvenanceHash(bytes32 hash) external onlyRole(ADMIN_ROLE) {
        if (hash == bytes32(0)) revert InvalidProvenance();
        if (provenanceHash != bytes32(0)) revert ProvenanceAlreadySet();
        provenanceHash = hash;
        emit ProvenanceHashSet(hash);
    }

    function reveal(string calldata uri) external onlyRole(ADMIN_ROLE) {
        if (revealed) revert AlreadyRevealed();
        if (provenanceHash == bytes32(0)) revert ProvenanceNotSet();
        baseURI = uri;
        revealed = true;
        startingIndex = uint256(
            keccak256(abi.encodePacked(block.prevrandao, block.timestamp, address(this), totalSupply()))
        ) % maxSupply;
        emit Revealed(uri, startingIndex);
    }

    function setBaseURI(string calldata uri) external onlyRole(ADMIN_ROLE) {
        if (revealed) revert MetadataFrozen();
        baseURI = uri;
        emit BaseURISet(uri);
    }

    // ----------------------------------------------------------------- money

    function withdraw() external onlyRole(ADMIN_ROLE) nonReentrant {
        uint256 amount = address(this).balance;
        (bool ok,) = treasury.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(treasury, amount);
    }

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasurySet(newTreasury);
    }

    function setRoyalty(address receiver, uint96 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (receiver == address(0)) revert ZeroAddress();
        _setDefaultRoyalty(receiver, bps);
        emit RoyaltySet(receiver, bps);
    }

    // -------------------------------------------------------------- internal

    function _requiresMerkle(uint8 stage) private pure returns (bool) {
        return stage == STAGE_GTD || stage == STAGE_CHEST || stage == STAGE_ROLES
            || stage == STAGE_FCFS;
    }

    /// @notice Stages whose Merkle leaf is `keccak256(abi.encode(account, allotment))`.
    /// @dev Everything else uses an address-only leaf, which cannot express a per-wallet
    ///      amount — for those, `Stage.maxPerWallet` applies equally to every listed
    ///      wallet. GTD and ROLES both hand out different amounts to different wallets
    ///      (Discord roles stack, so a holder may be owed 1, 2 or 3), so their allowance
    ///      must be bound into the leaf where the contract can verify it per wallet.
    function _leafCarriesAllotment(uint8 stage) private pure returns (bool) {
        return stage == STAGE_GTD || stage == STAGE_ROLES;
    }

    function _recomputeCumCaps() private {
        uint256 running;
        uint96 packed;
        uint256 limit = maxSupply - reserveMax;
        for (uint256 i; i < STAGE_COUNT; ++i) {
            // A single stage may not be configured above the whole budget — that is
            // always a typo (13110 for 1311), never an intent.
            if (_stages[i].cap > limit) revert CapsExceedSupply();
            running += _stages[i].cap;
            // The SUM is allowed to exceed the budget, and clamps here instead of
            // reverting. Each stage is hard-capped by its own `cap`, so over-allocating
            // the tail is how leftovers reach it: give FCFS a cap large enough to absorb
            // whatever GTD, Chest and Roles do not mint, and this clamp still holds the
            // total to the budget.
            if (running > limit) running = limit;
            packed |= uint96(uint16(running)) << (i * 16);
        }
        _cumCaps = packed;
    }

    function _cumCapOf(uint8 stage) private view returns (uint256) {
        return (uint256(_cumCaps) >> (uint256(stage) * 16)) & 0xFFFF;
    }

    function _mintedBy(address account, uint8 stage) private view returns (uint256) {
        return (uint256(_walletMinted[account]) >> (uint256(stage) * 8)) & 0xFF;
    }

    function _addMinted(address account, uint8 stage, uint256 qty) private {
        uint256 shift = uint256(stage) * 8;
        uint256 packed = uint256(_walletMinted[account]);
        uint256 updated = ((packed >> shift) & 0xFF) + qty;
        assert(updated <= type(uint8).max);
        _walletMinted[account] = uint64((packed & ~(uint256(0xFF) << shift)) | (updated << shift));
    }
}
